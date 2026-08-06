-- Phoenix.SS: Public order request flow (no-login customer order form)
-- Run this in Supabase → SQL Editor, after pricing_and_quotes.sql.
--
-- Two pieces, both designed so the public page never gets broad access to
-- internal CRM tables:
--
--   1. pricing_public (view) — exposes ONLY grade + final selling price to
--      anonymous visitors. It deliberately does NOT expose
--      base_cost_per_lb, adjustment_per_lb, or margin — your cost/margin
--      data stays behind pricing_grades' existing authenticated-only RLS.
--
--   2. order_requests (table) + submit_order_request() (function) — public
--      submissions land in order_requests, but the ONLY way an anonymous
--      visitor can write is through submit_order_request(), a SECURITY
--      DEFINER function that matches-or-creates a customers row and inserts
--      the request internally. No anon grant is added on customers or
--      order_requests directly, so this doesn't loosen the CRM's existing
--      access at all — staff still read/manage everything as authenticated.

-- ── pricing_public ───────────────────────────────────────────────
create or replace view pricing_public as
select
  grade,
  base_selling_price_per_lb + adjustment_per_lb as price_per_lb
from pricing_grades
where base_cost_per_lb is not null
  and base_selling_price_per_lb is not null;

grant usage on schema public to anon;
grant select on pricing_public to anon;

-- ── order_requests ───────────────────────────────────────────────
create table if not exists order_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  grade text not null,
  quantity_lbs numeric(12,2) not null,
  unit_price_per_lb numeric(10,4) not null,
  estimated_total numeric(12,2) not null,
  shipping_name text not null,
  shipping_company text,
  shipping_address text not null,
  shipping_city text not null,
  shipping_state text not null,
  shipping_zip text not null,
  shipping_country text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create index if not exists order_requests_created_idx on order_requests (created_at desc);

alter table order_requests enable row level security;

-- Staff (authenticated, e.g. a future Orders/Requests tab in the CRM) can
-- read and manage these. Public submissions go through the function below,
-- not a direct anon policy.
drop policy if exists "authenticated read order_requests" on order_requests;
create policy "authenticated read order_requests" on order_requests
  for select to authenticated using (true);
drop policy if exists "authenticated update order_requests" on order_requests;
create policy "authenticated update order_requests" on order_requests
  for update to authenticated using (true);
drop policy if exists "authenticated delete order_requests" on order_requests;
create policy "authenticated delete order_requests" on order_requests
  for delete to authenticated using (true);

-- ── submit_order_request() ────────────────────────────────────────
-- SECURITY DEFINER: runs as the function owner (same role that owns
-- customers/order_requests), which is exempt from RLS on tables it owns.
-- That's what lets this one narrow entry point write to both tables
-- without a blanket anon grant on either. Matches an existing customer by
-- name (company name if given, else the shipper's name), case-insensitive;
-- creates one if nothing matches.
create or replace function submit_order_request(
  p_grade text,
  p_quantity_lbs numeric,
  p_unit_price_per_lb numeric,
  p_estimated_total numeric,
  p_shipping_name text,
  p_shipping_company text,
  p_shipping_address text,
  p_shipping_city text,
  p_shipping_state text,
  p_shipping_zip text,
  p_shipping_country text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_id uuid;
  v_customer_name text;
  v_order_id uuid;
begin
  if p_grade is null or p_quantity_lbs is null or p_quantity_lbs <= 0
     or p_unit_price_per_lb is null or p_estimated_total is null
     or coalesce(trim(p_shipping_name), '') = ''
     or coalesce(trim(p_shipping_address), '') = ''
     or coalesce(trim(p_shipping_city), '') = ''
     or coalesce(trim(p_shipping_state), '') = ''
     or coalesce(trim(p_shipping_zip), '') = ''
     or coalesce(trim(p_shipping_country), '') = '' then
    raise exception 'Missing required order fields';
  end if;

  v_customer_name := coalesce(nullif(trim(p_shipping_company), ''), p_shipping_name);

  select id into v_customer_id
  from customers
  where lower(name) = lower(v_customer_name)
  limit 1;

  if v_customer_id is null then
    insert into customers (name, location, grade_desired, contact_name, email, phone)
    values (
      v_customer_name,
      trim(both ', ' from concat_ws(', ', nullif(p_shipping_city, ''), nullif(p_shipping_state, ''), nullif(p_shipping_country, ''))),
      p_grade,
      p_shipping_name,
      '',
      ''
    )
    returning id into v_customer_id;
  end if;

  insert into order_requests (
    customer_id, grade, quantity_lbs, unit_price_per_lb, estimated_total,
    shipping_name, shipping_company, shipping_address, shipping_city,
    shipping_state, shipping_zip, shipping_country
  ) values (
    v_customer_id, p_grade, p_quantity_lbs, p_unit_price_per_lb, p_estimated_total,
    p_shipping_name, nullif(trim(p_shipping_company), ''), p_shipping_address, p_shipping_city,
    p_shipping_state, p_shipping_zip, p_shipping_country
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

grant execute on function submit_order_request(
  text, numeric, numeric, numeric, text, text, text, text, text, text, text
) to anon, authenticated;
