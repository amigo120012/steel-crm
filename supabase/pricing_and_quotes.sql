-- Phoenix.SS: Pricing + Quote Calculator schema
-- Run this in Supabase → SQL Editor. Adjust the RLS policies below if your
-- customers/vendors/orders tables use a different access pattern.

-- ── pricing_ranges ──────────────────────────────────────────────
-- Cost/price per grade, broken into non-overlapping width ranges.
-- Full coverage per grade is validated client-side (1.0"–12.0", no gaps/overlaps).
create table if not exists pricing_ranges (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  width_min numeric(5,1) not null,
  width_max numeric(5,1) not null,
  cost_per_lb numeric(10,4) not null default 0,
  selling_price_per_lb numeric(10,4) not null default 0,
  created_at timestamptz not null default now(),
  constraint pricing_ranges_width_check check (width_min <= width_max)
);

create index if not exists pricing_ranges_grade_idx on pricing_ranges (grade, width_min);

alter table pricing_ranges enable row level security;

create policy "authenticated read pricing_ranges" on pricing_ranges
  for select to authenticated using (true);
create policy "authenticated write pricing_ranges" on pricing_ranges
  for insert to authenticated with check (true);
create policy "authenticated update pricing_ranges" on pricing_ranges
  for update to authenticated using (true);
create policy "authenticated delete pricing_ranges" on pricing_ranges
  for delete to authenticated using (true);

-- No rows are seeded here — the 11 grades (M45, M36, M27, M19, M15, M12, M6,
-- M5, M4, M3, M2) are hardcoded in src/lib/pricing.js and always shown as
-- empty sections in the Pricing tab until ranges are added for each.

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
