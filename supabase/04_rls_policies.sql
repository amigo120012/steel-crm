-- Phoenix.SS: RLS policies for the CRM tables.
--
-- RUN ORDER: 04. Safe to re-run — every policy is dropped and recreated.
--
-- ⚠️ READ THIS FIRST ⚠️
-- These tables (customers, vendors, orders, pricing_grades, quotes,
-- quote_line_items) were created and configured by hand in the Supabase
-- dashboard, and their policies were never in the repo. I do NOT have
-- dashboard or service-role access, so I could not read what you currently
-- have — this file is the intended policy set, written from how the app
-- actually uses each table, not a transcript of your live configuration.
--
-- BEFORE running this, dump what you have now so you can compare and roll
-- back. In the SQL Editor:
--
--   select schemaname, tablename, policyname, permissive, roles, cmd,
--          qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--   order by tablename, policyname;
--
--   select relname, relrowsecurity, relforcerowsecurity
--   from pg_class
--   where relnamespace = 'public'::regnamespace and relkind = 'r'
--   order by relname;
--
-- Save that output. If anything here is narrower than what your staff need,
-- you will see it immediately as a permission error in the CRM.
--
-- The model is deliberately simple and matches how the app works today:
-- every signed-in user is staff and may read and write all CRM data; anonymous
-- visitors get nothing here and reach the public surface only through the
-- SECURITY DEFINER functions in 02/03.

-- ── enable RLS + one staff-only policy per table ─────────────────
-- Guarded on the table existing so a partially-set-up database will not error.
do $policies$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'vendors', 'orders', 'pricing_grades', 'quotes', 'quote_line_items'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'skipped % (does not exist)', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "staff full access" on public.%I', t);
    execute format(
      'create policy "staff full access" on public.%I for all to authenticated using (true) with check (true)',
      t);
    raise notice 'policy applied to %', t;
  end loop;
end
$policies$;

-- ── verify ───────────────────────────────────────────────────────
-- After running, this should show one "staff full access" row per table, and
-- no policy anywhere whose roles include anon or public:
--
--   select tablename, policyname, roles, cmd
--   from pg_policies where schemaname = 'public'
--   order by tablename;
--
-- Anything listing {anon} or {public} is a public hole — investigate it.
