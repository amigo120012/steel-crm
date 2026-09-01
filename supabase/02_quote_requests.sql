-- Phoenix.SS: public quote-request (RFQ) flow.
--
-- RUN ORDER: 01_rate_limiting.sql first (this file calls check_rate_limit).
-- Safe to re-run; every statement is idempotent or guarded.
--
-- Anonymous visitors get exactly two entry points and no direct grant on any
-- table:
--
--   * pricing_public (view)   grade + final selling price only. base cost,
--                             adjustment and margin stay behind
--                             pricing_grades' authenticated-only RLS.
--   * submit_quote_request()  SECURITY DEFINER. Re-prices every line from
--                             pricing_grades, so a tampered browser cannot
--                             dictate what it pays.
--   * search_customers()      SECURITY DEFINER company type-ahead, id + name
--                             only, 3-char minimum, prefix match, 8 rows.
--
-- Customer matching policy (changed): an RFQ NEVER creates a customer record.
-- If the typed company matches nothing, customer_id is left NULL and the RFQ
-- shows as "unmatched" in the CRM, where staff promote it deliberately via
-- promote_rfq_to_customer(). Before this change, anyone could grow the
-- customers table by submitting new company names.

-- ── tables ───────────────────────────────────────────────────────
create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  requester_name text not null,
  requester_company text not null,
  total numeric(12,2) not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists quote_request_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid not null references quote_requests(id) on delete cascade,
  grade text not null,
  width numeric(6,2),
  quantity numeric(12,2) not null,
  unit_price numeric(10,4) not null,
  line_total numeric(12,2) not null
);

-- Company became required after the first version of this file shipped, and
-- `create table if not exists` is a no-op on an existing table, so retrofit it.
update quote_requests set requester_company = '(not supplied)'
  where requester_company is null or trim(requester_company) = '';
alter table quote_requests alter column requester_company set not null;

-- The RFQ carries the requester's country. It shipped as "nationality" and was
-- renamed to "location"; guarded so this file stays re-runnable whether the
-- database is on the old name, the new one, or neither.
alter table quote_requests add column if not exists nationality text;
do $rename$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quote_requests'
      and column_name = 'nationality'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'quote_requests'
      and column_name = 'location'
  ) then
    alter table quote_requests rename column nationality to location;
  end if;
end
$rename$;
alter table quote_requests add column if not exists location text;

-- Length caps at the storage layer, so an oversized value cannot be stored even
-- if some future caller skips the function.
alter table quote_requests
  add constraint quote_requests_requester_name_len
  check (char_length(requester_name) <= 120) not valid;
alter table quote_requests
  add constraint quote_requests_requester_company_len
  check (char_length(requester_company) <= 200) not valid;

create index if not exists quote_requests_created_idx on quote_requests (created_at desc);
create index if not exists quote_requests_unmatched_idx on quote_requests (customer_id) where customer_id is null;
create index if not exists quote_request_line_items_req_idx on quote_request_line_items (quote_request_id);

-- ── RLS ──────────────────────────────────────────────────────────
alter table quote_requests enable row level security;
alter table quote_request_line_items enable row level security;

drop policy if exists "authenticated read quote_requests" on quote_requests;
create policy "authenticated read quote_requests" on quote_requests
  for select to authenticated using (true);
drop policy if exists "authenticated update quote_requests" on quote_requests;
create policy "authenticated update quote_requests" on quote_requests
  for update to authenticated using (true);
drop policy if exists "authenticated delete quote_requests" on quote_requests;
create policy "authenticated delete quote_requests" on quote_requests
  for delete to authenticated using (true);

drop policy if exists "authenticated read quote_request_line_items" on quote_request_line_items;
create policy "authenticated read quote_request_line_items" on quote_request_line_items
  for select to authenticated using (true);
drop policy if exists "authenticated update quote_request_line_items" on quote_request_line_items;
create policy "authenticated update quote_request_line_items" on quote_request_line_items
  for update to authenticated using (true);
drop policy if exists "authenticated delete quote_request_line_items" on quote_request_line_items;
create policy "authenticated delete quote_request_line_items" on quote_request_line_items
  for delete to authenticated using (true);

-- ── search_customers() ───────────────────────────────────────────
create or replace function search_customers(p_prefix text)
returns table (id uuid, name text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if p_prefix is null or length(trim(p_prefix)) < 3 then
    return;
  end if;

  return query
    select c.id, c.name
    from customers c
    where c.name ilike trim(p_prefix) || '%'
    order by c.name
    limit 8;
end;
$$;

grant execute on function search_customers(text) to anon, authenticated;

-- ── submit_quote_request() ───────────────────────────────────────
-- p_website is a honeypot: a hidden field no human ever fills. Any value at
-- all means a bot filled the form, and the call is rejected.
--
-- Earlier signatures are dropped rather than left as overloads, since PostgREST
-- resolves by argument name and multiple candidates are ambiguous.
drop function if exists submit_quote_request(text, text, jsonb);
drop function if exists submit_quote_request(text, text, text, uuid, jsonb);

create or replace function submit_quote_request(
  p_requester_name text,
  p_requester_company text,
  p_location text,
  p_customer_id uuid,
  p_lines jsonb,
  p_website text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_customer_name text;
  v_request_id uuid;
  v_line jsonb;
  v_grade text;
  v_width numeric;
  v_qty numeric;
  v_price numeric;
  v_total numeric := 0;
  v_count int;
begin
  -- Honeypot. Deliberately the same generic error a human would never see.
  if p_website is not null and trim(p_website) <> '' then
    raise exception 'Submission rejected';
  end if;

  -- Caps successful submissions at 5 per IP per 10 minutes. Note that calls
  -- which raise below are rolled back and therefore not counted — see the
  -- LIMITATION 1 note in 01_rate_limiting.sql.
  perform check_rate_limit('rfq', 5, interval '10 minutes');

  if coalesce(trim(p_requester_name), '') = '' then
    raise exception 'Requester name is required';
  end if;
  if char_length(trim(p_requester_name)) > 120 then
    raise exception 'Name is too long (max 120 characters)';
  end if;

  if coalesce(trim(p_requester_company), '') = '' then
    raise exception 'Company is required';
  end if;
  if char_length(trim(p_requester_company)) > 200 then
    raise exception 'Company name is too long (max 200 characters)';
  end if;

  if coalesce(trim(p_location), '') = '' then
    raise exception 'Location is required';
  end if;
  if char_length(trim(p_location)) > 100 then
    raise exception 'Location is too long';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Line items must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_lines);
  if v_count = 0 then
    raise exception 'At least one line item is required';
  end if;
  if v_count > 50 then
    raise exception 'Too many line items (max 50)';
  end if;

  v_customer_name := trim(p_requester_company);

  -- Customer resolution. NOTE: no branch creates a customer.
  --   1. explicit pick from the type-ahead -> link it, verifying it exists
  --   2. otherwise an exact case-insensitive name match -> link it
  --   3. otherwise leave NULL -> the CRM shows this RFQ as unmatched
  if p_customer_id is not null then
    select c.id into v_customer_id from customers c where c.id = p_customer_id;
    if v_customer_id is null then
      raise exception 'Selected customer no longer exists';
    end if;
  end if;

  if v_customer_id is null then
    select c.id into v_customer_id
    from customers c
    where lower(c.name) = lower(v_customer_name)
    limit 1;
  end if;

  -- Seed location onto a matched customer only when it is still blank.
  -- Never overwrite what staff have curated.
  if v_customer_id is not null then
    update customers
    set location = trim(p_location)
    where id = v_customer_id
      and (location is null or trim(location) = '');
  end if;

  insert into quote_requests (
    customer_id, requester_name, requester_company, location, total
  ) values (
    v_customer_id, trim(p_requester_name), v_customer_name, trim(p_location), 0
  )
  returning id into v_request_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_grade := v_line->>'grade';
    v_width := nullif(v_line->>'width', '')::numeric;
    v_qty   := nullif(v_line->>'quantity', '')::numeric;

    if coalesce(trim(v_grade), '') = '' or v_qty is null or v_qty <= 0 then
      raise exception 'Each line item needs a grade and a positive quantity';
    end if;

    -- Server-side pricing. Mirrors the pricing_public view: a grade with no
    -- imported cost/selling price is not orderable.
    select base_selling_price_per_lb + coalesce(adjustment_per_lb, 0)
      into v_price
    from pricing_grades
    where grade = v_grade
      and base_cost_per_lb is not null
      and base_selling_price_per_lb is not null
    limit 1;

    if v_price is null then
      raise exception 'No published price for grade %', v_grade;
    end if;

    insert into quote_request_line_items (
      quote_request_id, grade, width, quantity, unit_price, line_total
    ) values (
      v_request_id, v_grade, v_width, v_qty, v_price, round(v_qty * v_price, 2)
    );

    v_total := v_total + round(v_qty * v_price, 2);
  end loop;

  update quote_requests set total = v_total where id = v_request_id;

  return v_request_id;
end;
$$;

grant execute on function submit_quote_request(text, text, text, uuid, jsonb, text) to anon, authenticated;

-- ── promote_rfq_to_customer() ────────────────────────────────────
-- Staff-only. Turns an unmatched RFQ into a real customer record and links it.
-- This is the ONLY path that creates a customer from RFQ data now.
create or replace function promote_rfq_to_customer(p_rfq_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rfq quote_requests;
  v_customer_id uuid;
begin
  select * into v_rfq from quote_requests where id = p_rfq_id;
  if v_rfq.id is null then
    raise exception 'RFQ not found';
  end if;
  if v_rfq.customer_id is not null then
    raise exception 'This RFQ is already linked to a customer';
  end if;

  -- Someone may have created the company in the meantime; link rather than
  -- duplicate.
  select c.id into v_customer_id
  from customers c
  where lower(c.name) = lower(trim(v_rfq.requester_company))
  limit 1;

  if v_customer_id is null then
    insert into customers (name, location, grade_desired, contact_name, email, phone)
    values (trim(v_rfq.requester_company), coalesce(trim(v_rfq.location), ''), '',
            trim(v_rfq.requester_name), '', '')
    returning id into v_customer_id;
  end if;

  update quote_requests set customer_id = v_customer_id where id = p_rfq_id;
  return v_customer_id;
end;
$$;

-- security invoker: this runs as the signed-in staff member, so the existing
-- customers RLS applies. anon must never be able to call it.
revoke all on function promote_rfq_to_customer(uuid) from public, anon;
grant execute on function promote_rfq_to_customer(uuid) to authenticated;

-- ── leftover cleanup ─────────────────────────────────────────────
-- customers.nationality is no longer written or read anywhere; the country is
-- seeded into the pre-existing customers.location instead. Confirm it holds
-- nothing you want, then run this once:
--   alter table customers drop column nationality;
