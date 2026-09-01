-- Phoenix.SS: Contact Us messages from the public site.
--
-- Run this in Supabase → SQL Editor. Safe to re-run.
--
-- Same shape as the RFQ flow: anon gets no direct grant on the table and can
-- only write through one SECURITY DEFINER function, which does its own
-- validation and length capping. Staff read these as authenticated.

create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  email text,
  subject text not null,
  body text not null,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

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
-- Length caps are enforced here, not just in the browser, so a scripted post
-- cannot use this as a free text dump. Email is optional but must look like an
-- address if supplied.
create or replace function submit_contact_message(
  p_email text,
  p_subject text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Subject is required';
  end if;

  if coalesce(trim(p_body), '') = '' then
    raise exception 'Message is required';
  end if;

  if length(p_subject) > 200 then
    raise exception 'Subject is too long (max 200 characters)';
  end if;

  if length(p_body) > 5000 then
    raise exception 'Message is too long (max 5000 characters)';
  end if;

  if p_email is not null and trim(p_email) <> ''
     and trim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email address does not look valid';
  end if;

  insert into contact_messages (email, subject, body)
  values (nullif(trim(p_email), ''), trim(p_subject), trim(p_body))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function submit_contact_message(text, text, text) to anon, authenticated;

-- Optional: forward these to email as well.
--
-- Nothing here sends email — messages land in this table and staff read them.
-- To also get them in an inbox, deploy the notify-rfq Edge Function pattern in
-- supabase/functions/ against this table and add a Database Webhook on INSERT
-- into contact_messages. That needs a Resend (or similar) API key; logging to
-- the table needs nothing.
