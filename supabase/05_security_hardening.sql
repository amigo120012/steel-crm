-- Phoenix.SS: privilege hardening. Audit items 1, 3 and 4.
--
-- RUN ORDER: 05, last. Safe to re-run — every statement is guarded on the
-- object existing, so a partially-applied database will not error.
--
-- Everything above this file relies on RLS to keep anonymous visitors out of
-- CRM data. RLS works, but it is a single mistake deep: one permissive policy,
-- or RLS switched off on a table, and everything behind it is public. This
-- file removes the underlying table privileges as well, so a policy slip alone
-- cannot leak data. Defence in depth, not a replacement for 04.

-- ── item 1: retire submit_order_request() ────────────────────────
-- The old single-grade order form (src/components/OrderPage.jsx, now deleted)
-- was this function's only caller. It is worth removing rather than merely
-- revoking, because unlike its replacement it TRUSTED THE CLIENT-SUPPLIED
-- PRICE and created customers rows — an unauthenticated, unvalidated write
-- path that nothing uses.
--
-- DROP removes the grants along with the function, so no separate REVOKE is
-- needed (and a REVOKE would error if the function were already gone).
--
-- The order_requests TABLE is deliberately left in place: it may hold real
-- submissions from before the RFQ flow existed. Only the write path goes.
drop function if exists submit_order_request(
  text, numeric, numeric, numeric, text, text, text, text, text, text, text
);

-- ── items 3 + 4: strip anon table privileges ─────────────────────
-- Every one of these currently answers an anonymous SELECT with 200 + [] —
-- meaning anon HAS the table privilege and only RLS is filtering the rows.
-- After this, the same request returns 401 and RLS becomes the second line of
-- defence rather than the only one. This also removes the anon UPDATE/DELETE
-- privileges that made an anonymous PATCH return 204 instead of 403.
do $revoke$
declare
  t text;
begin
  foreach t in array array[
    'customers', 'vendors', 'orders', 'pricing_grades', 'quotes',
    'quote_line_items', 'quote_requests', 'quote_request_line_items',
    'order_requests', 'contact_messages'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all privileges on table public.%I from anon', t);
      raise notice 'revoked anon privileges on %', t;
    else
      raise notice 'skipped % (does not exist)', t;
    end if;
  end loop;
end
$revoke$;

-- pricing_public is the ONE object anon still reads directly. The RFQ form
-- calls it with supabase.from("pricing_public"), and it exposes only grade +
-- final selling price — no cost, no adjustment, no margin. Everything else the
-- public page needs goes through a SECURITY DEFINER function instead.
--
-- The view is not security_invoker, so it reads pricing_grades as its owner and
-- keeps working even though anon just lost its privileges on that table.
grant select on pricing_public to anon;

-- Stop new tables from handing anon privileges automatically.
alter default privileges in schema public revoke all on tables from anon;

-- ── verify ───────────────────────────────────────────────────────
-- 1. Anonymous SELECT should now be 401, not 200 + []:
--      curl -s -o /dev/null -w "%{http_code}\n" \
--        "https://<PROJECT>.supabase.co/rest/v1/customers?select=*&limit=1" \
--        -H "apikey: <ANON_KEY>"
--    Expect 401 for every table above, and 200 for pricing_public.
--
-- 2. Confirm no anon privileges remain:
--      select table_name, privilege_type
--      from information_schema.role_table_grants
--      where grantee = 'anon' and table_schema = 'public'
--      order by table_name;
--    The only row should be SELECT on pricing_public.
--
-- 3. Confirm the retired function is gone and the others are present:
--      select proname from pg_proc
--      where proname in ('submit_order_request', 'submit_quote_request',
--                        'submit_contact_message', 'search_customers',
--                        'promote_rfq_to_customer');
--    Expect everything EXCEPT submit_order_request.
--
-- 4. Sign in to the CRM and load every tab. Authenticated access is untouched
--    by this file, so anything that breaks means a policy in 04 is too narrow.
--
-- 5. Load the public RFQ page. The grade dropdown must still populate — that is
--    pricing_public proving it survived the revoke.
