-- Phoenix.SS: Pricing + Quote Calculator schema
-- Run this in Supabase → SQL Editor. Adjust the RLS policies below if your
-- customers/vendors/orders tables use a different access pattern.

-- ── pricing_points ──────────────────────────────────────────────
-- Cost/price keyed on the exact (grade, width) pair, matching the source
-- pricing spreadsheet 1:1 (11 grades x 23 widths, 1.0"–12.0" in 0.5" steps).
--
-- base_cost_per_lb / base_selling_price_per_lb are reference data imported
-- from the spreadsheet (nullable — a grade/width the spreadsheet has no
-- price for stays null, shown as "no cost set" in the UI, never $0).
-- adjustment_per_lb is a separate, independently-editable field so
-- re-importing the spreadsheet only refreshes the two base_* columns and
-- never wipes out adjustments already made.
--
-- Final selling price = base_selling_price_per_lb + adjustment_per_lb
-- Margin                = final selling price - base_cost_per_lb
-- (both computed client-side; nothing to store for them here)
create table if not exists pricing_points (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  width numeric(4,1) not null,
  base_cost_per_lb numeric(10,4),
  base_selling_price_per_lb numeric(10,4),
  adjustment_per_lb numeric(10,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique (grade, width)
);

create index if not exists pricing_points_grade_idx on pricing_points (grade, width);

alter table pricing_points enable row level security;

create policy "authenticated read pricing_points" on pricing_points
  for select to authenticated using (true);
create policy "authenticated write pricing_points" on pricing_points
  for insert to authenticated with check (true);
create policy "authenticated update pricing_points" on pricing_points
  for update to authenticated using (true);
create policy "authenticated delete pricing_points" on pricing_points
  for delete to authenticated using (true);

-- No rows are seeded here — import the pricing spreadsheet (Pricing tab
-- "Import base pricing" button, or scripts/import-pricing.js) to populate
-- the 253 grade/width cells. Re-importing later only refreshes base_* —
-- adjustment_per_lb is untouched.

-- Migrating from the old range-based model? Drop the superseded table
-- after confirming nothing else still reads from it:
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
