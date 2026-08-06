-- Phoenix.SS: Pricing + Quote Calculator schema
-- Run this in Supabase → SQL Editor. Adjust the RLS policies below if your
-- customers/vendors/orders tables use a different access pattern.

-- ── pricing_grades ──────────────────────────────────────────────
-- Cost/price keyed on Grade only. Confirmed against the source spreadsheet
-- that Cost/lb and Selling Price/lb do not vary by width (every width row
-- for a given grade carries the same value), so width is not part of the
-- pricing model at all.
--
-- base_cost_per_lb / base_selling_price_per_lb are reference data imported
-- from the spreadsheet (nullable — a grade the spreadsheet has no price
-- for yet stays null, shown as "no cost set" in the UI, never $0).
-- adjustment_per_lb is a separate, independently-editable field so
-- re-importing the spreadsheet only refreshes the two base_* columns and
-- never wipes out adjustments already made.
--
-- Final selling price = base_selling_price_per_lb + adjustment_per_lb
-- Margin                = final selling price - base_cost_per_lb
-- (both computed client-side; nothing to store for them here)
create table if not exists pricing_grades (
  id uuid primary key default gen_random_uuid(),
  grade text not null unique,
  base_cost_per_lb numeric(10,4),
  base_selling_price_per_lb numeric(10,4),
  adjustment_per_lb numeric(10,4) not null default 0,
  updated_at timestamptz not null default now()
);

alter table pricing_grades enable row level security;

create policy "authenticated read pricing_grades" on pricing_grades
  for select to authenticated using (true);
create policy "authenticated write pricing_grades" on pricing_grades
  for insert to authenticated with check (true);
create policy "authenticated update pricing_grades" on pricing_grades
  for update to authenticated using (true);
create policy "authenticated delete pricing_grades" on pricing_grades
  for delete to authenticated using (true);

-- No rows are seeded here — use the Pricing tab's "Upload Pricing Sheet"
-- button (or scripts/import-pricing.js) to populate the 11 grade rows.
-- Re-importing later only refreshes base_* — adjustment_per_lb is untouched.

-- Superseded by this table — drop once nothing else reads from them:
--   drop table if exists pricing_points;
--   drop table if exists pricing_ranges;

-- ── quotes ──────────────────────────────────────────────────────
create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete set null,
  created_at timestamptz not null default now(),
  total numeric(12,2) not null default 0
);

alter table quotes enable row level security;

create policy "authenticated read quotes" on quotes
  for select to authenticated using (true);
create policy "authenticated write quotes" on quotes
  for insert to authenticated with check (true);
create policy "authenticated update quotes" on quotes
  for update to authenticated using (true);
create policy "authenticated delete quotes" on quotes
  for delete to authenticated using (true);

-- ── quote_line_items ────────────────────────────────────────────
create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  grade text not null,
  width numeric(5,1) not null,
  quantity numeric(12,2) not null,
  unit_price numeric(10,4) not null,
  line_total numeric(12,2) not null
);

create index if not exists quote_line_items_quote_idx on quote_line_items (quote_id);

alter table quote_line_items enable row level security;

create policy "authenticated read quote_line_items" on quote_line_items
  for select to authenticated using (true);
create policy "authenticated write quote_line_items" on quote_line_items
  for insert to authenticated with check (true);
create policy "authenticated update quote_line_items" on quote_line_items
  for update to authenticated using (true);
create policy "authenticated delete quote_line_items" on quote_line_items
  for delete to authenticated using (true);
