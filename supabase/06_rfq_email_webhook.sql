-- Phoenix.SS: fire the notify-rfq Edge Function whenever a new RFQ lands.
--
-- Run this AFTER quote_requests.sql, and after the notify-rfq function is
-- deployed. Replace <PROJECT_REF> and <ANON_KEY> below with your own values
-- (Supabase → Settings → API).
--
-- You can skip this file entirely and click the same thing together in
-- Supabase → Database → Webhooks → "Create a new hook":
--     table   quote_requests
--     events  Insert
--     type    Supabase Edge Functions → notify-rfq
--
-- Delivery is asynchronous (pg_net queues the call and sends it after the
-- transaction commits), so the function always sees the finished request —
-- final total and all line items included. It also means a mail outage can
-- never block or roll back a customer's submission.

create extension if not exists pg_net with schema extensions;

drop trigger if exists on_quote_request_created on quote_requests;

create trigger on_quote_request_created
  after insert on quote_requests
  for each row
  execute function supabase_functions.http_request(
    'https://<PROJECT_REF>.supabase.co/functions/v1/notify-rfq',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <ANON_KEY>"}',
    '{}',
    '5000'
  );
