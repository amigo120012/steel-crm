-- Phoenix.SS: shared per-IP rate limiting for the public write functions.
--
-- RUN ORDER: this file is 01 — run it before 02_quote_requests.sql and
-- 03_contact_messages.sql, which both call check_rate_limit().
--
-- Supabase's PostgREST exposes the incoming request headers to SQL through the
-- `request.headers` GUC, so a SECURITY DEFINER function can see the caller's
-- forwarded IP without any application-level plumbing.
--
-- LIMITATION 1 — WHAT THIS DOES AND DOES NOT THROTTLE. PostgREST runs each RPC
-- in one transaction. check_rate_limit() records its hit by INSERTing, so if
-- the calling function later raises (failed validation, honeypot, bad grade),
-- that INSERT is rolled back with everything else and the attempt is NOT
-- counted. Verified against the live database: six malformed RFQ calls in a
-- row all passed, while six calls that COMMIT are correctly blocked on the
-- sixth.
--
-- So this caps SUCCESSFUL submissions per IP, which is the CRM-integrity
-- control we wanted: no one can flood quote_requests or contact_messages.
-- It does NOT throttle a bot spraying malformed payloads. Those write nothing,
-- so the cost is bandwidth and CPU rather than data — handle it at the edge
-- (Netlify/Cloudflare rate limiting, or Turnstile) rather than in Postgres,
-- which has no autonomous transactions to record the attempt with.
--
-- LIMITATION 2: x-forwarded-for is a client-supplied header that
-- Supabase's edge appends the real peer address to. We take the LAST entry,
-- which is the one the edge added and the hardest for a caller to forge; the
-- leftmost entries are attacker-controlled. This raises the cost of scripted
-- abuse considerably but is not a substitute for a real bot check (Turnstile /
-- hCaptcha) if you start seeing determined, distributed abuse.

create table if not exists rate_limit_hits (
  id bigserial primary key,
  ip text not null,
  action text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_hits_lookup_idx
  on rate_limit_hits (action, ip, created_at desc);

alter table rate_limit_hits enable row level security;
-- No policies at all: nothing but SECURITY DEFINER code ever touches this.
revoke all on rate_limit_hits from anon, authenticated;

-- Returns the best available client IP, or 'unknown' when the header is absent
-- (e.g. a direct SQL call). 'unknown' still rate-limits, just as one bucket.
create or replace function client_ip()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_xff text;
  v_parts text[];
begin
  begin
    v_xff := current_setting('request.headers', true)::json->>'x-forwarded-for';
  exception when others then
    return 'unknown';
  end;

  if v_xff is null or trim(v_xff) = '' then
    return 'unknown';
  end if;

  v_parts := string_to_array(v_xff, ',');
  return trim(v_parts[array_length(v_parts, 1)]);
end;
$$;

-- Raises if this IP has exceeded p_max calls to p_action within p_window.
-- Records the hit otherwise. Also opportunistically prunes old rows so the
-- table cannot grow without bound.
create or replace function check_rate_limit(
  p_action text,
  p_max int,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := client_ip();
  v_count int;
begin
  delete from rate_limit_hits
  where created_at < now() - interval '1 day';

  select count(*) into v_count
  from rate_limit_hits
  where action = p_action
    and ip = v_ip
    and created_at > now() - p_window;

  if v_count >= p_max then
    raise exception 'Too many requests. Please wait a few minutes and try again.'
      using errcode = 'P0001';
  end if;

  insert into rate_limit_hits (ip, action) values (v_ip, p_action);
end;
$$;

-- Callable only from the SECURITY DEFINER submit functions, never directly.
--
-- NOTE the "from public": Postgres grants EXECUTE on every new function to the
-- PUBLIC role by default, and revoking from anon/authenticated alone leaves
-- that default in place — the functions stay callable. PUBLIC must be revoked
-- explicitly. Without this, anyone could POST to /rpc/check_rate_limit and
-- insert unbounded rows into rate_limit_hits.
revoke all on function client_ip() from public, anon, authenticated;
revoke all on function check_rate_limit(text, int, interval) from public, anon, authenticated;
