-- Phoenix.SS: Contact Us messages from the public site.
--
-- RUN ORDER: 01_rate_limiting.sql first (this file calls check_rate_limit).
-- Safe to re-run.
--
-- Same shape as the RFQ flow: anon gets no direct grant on the table and can
-- only write through one SECURITY DEFINER function, which validates, caps
-- lengths, rejects the honeypot and rate-limits by IP.

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text,
  subject text not null,
  body text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

-- Email became required after the first version of this file shipped.
-- Backfill anything already stored so the constraint can be applied.
update contact_messages set email = '(not supplied)'
  where email is null or trim(email) = '';
alter table contact_messages alter column email set not null;

create index if not exists contact_messages_created_idx on contact_messages (created_at desc);

alter table contact_messages enable row level security;

drop policy if exists "authenticated read contact_messages" on contact_messages;
create policy "authenticated read contact_messages" on contact_messages
  for select to authenticated using (true);
drop policy if exists "authenticated update contact_messages" on contact_messages;
create policy "authenticated update contact_messages" on contact_messages
  for update to authenticated using (true);
drop policy if exists "authenticated delete contact_messages" on contact_messages;
create policy "authenticated delete contact_messages" on contact_messages
  for delete to authenticated using (true);

-- ── submit_contact_message() ─────────────────────────────────────
-- p_website is a honeypot: a hidden field no human ever fills.
drop function if exists submit_contact_message(text, text, text);

create or replace function submit_contact_message(
  p_email text,
  p_subject text,
  p_body text,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_website is not null and trim(p_website) <> '' then
    raise exception 'Submission rejected';
  end if;

  perform check_rate_limit('contact', 3, interval '10 minutes');

  if coalesce(trim(p_email), '') = '' then
    raise exception 'Email is required';
  end if;

  if trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look valid';
  end if;

  if char_length(trim(p_email)) > 254 then
    raise exception 'Email is too long';
  end if;

  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Subject is required';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Message is required';
  end if;

  if char_length(p_subject) > 200 then
    raise exception 'Subject is too long (max 200 characters)';
  end if;

  if char_length(p_body) > 5000 then
    raise exception 'Message is too long (max 5000 characters)';
  end if;

  insert into contact_messages (email, subject, body)
  values (trim(p_email), trim(p_subject), trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function submit_contact_message(text, text, text, text) to anon, authenticated;

-- Optional: forward these to email as well, using the same Edge Function +
-- Database Webhook pattern as the RFQ notifier (supabase/functions/notify-rfq).
-- Logging to this table needs nothing extra; email needs a Resend API key.
