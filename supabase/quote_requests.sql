-- Phoenix.SS: Public quote-request flow for the customer-facing RFQ page
-- (src/components/QuoteCalculator.jsx, served at / and /order).
--
-- Run this in Supabase → SQL Editor, after pricing_and_quotes.sql.
--
-- This is the multi-line-item sibling of order_requests.sql and follows the
-- same rule: anonymous visitors get exactly one narrow write path and no
-- direct grant on any CRM table.
--
--   * Reads go through the existing pricing_public view — grade + final
--     selling price only. base_cost_per_lb, adjustment_per_lb and margin
--     stay behind pricing_grades' authenticated-only RLS.
--
--   * Writes go through submit_quote_request(), a SECURITY DEFINER function.
--     The client sends only grade / width / quantity; the function looks the
--     price up itself from pricing_grades, so a tampered browser cannot
--     dictate its own unit price. (Note: order_requests.sql's older
--     submit_order_request() does trust the client-supplied price — worth
--     tightening the same way if that form stays in use.)

-- ── quote_requests ───────────────────────────────────────────────
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

create index if not exists quote_requests_created_idx on quote_requests (created_at desc);
create index if not exists quote_request_line_items_req_idx on quote_request_line_items (quote_request_id);

alter table quote_requests enable row level security;
alter table quote_request_line_items enable row level security;

-- Staff read and manage these from the CRM. Public submissions arrive via
-- the function below, not through an anon policy.
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

-- ── submit_quote_request() ───────────────────────────────────────
-- p_lines is a JSON array of { grade, width, quantity }. Prices are NOT
-- accepted from the client — each line is re-priced from pricing_grades
-- using the same base + adjustment formula as pricing_public.
--
-- Name and company are both required. The company name is the customer-record
-- key: matched case-insensitively against customers.name, and created if
-- nothing matches, the same behaviour as submit_order_request().
create or replace function submit_quote_request(
  p_requester_name text,
  p_requester_company text,
  p_lines jsonb
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
  if coalesce(trim(p_requester_name), '') = '' then
    raise exception 'Requester name is required';
  end if;

  if coalesce(trim(p_requester_company), '') = '' then
    raise exception 'Company is required';
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Line items must be a JSON array';
  end if;

  v_count := jsonb_array_length(p_lines);
  if v_count = 0 then
    raise exception 'At least one line item is required';
  end if;
  -- Bounds the work a single anonymous call can trigger.
  if v_count > 50 then
    raise exception 'Too many line items (max 50)';
  end if;

  -- Company is required, so it is always the customer-record key.
  v_customer_name := trim(p_requester_company);

  select id into v_customer_id
  from customers
  where lower(name) = lower(v_customer_name)
  limit 1;

  if v_customer_id is null then
    insert into customers (name, location, grade_desired, contact_name, email, phone)
    values (v_customer_name, '', '', trim(p_requester_name), '', '')
    returning id into v_customer_id;
  end if;

  insert into quote_requests (customer_id, requester_name, requester_company, total)
  values (v_customer_id, trim(p_requester_name), trim(p_requester_company), 0)
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

grant execute on function submit_quote_request(text, text, jsonb) to anon, authenticated;
