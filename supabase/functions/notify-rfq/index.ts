// Emails a new RFQ to the sales inbox.
//
// Triggered by a Supabase Database Webhook on INSERT into quote_requests
// (see supabase/06_rfq_email_webhook.sql for the trigger).
//
// The webhook payload's `record` is the row as it looked at INSERT time,
// when total is still 0 and no line items exist yet — submit_quote_request()
// fills both in later in the same transaction. So we only take the id from
// the payload and re-read the finished request with the service-role key.
//
// Secrets to set (Supabase → Edge Functions → notify-rfq → Secrets):
//   RESEND_API_KEY   your Resend API key
//   RFQ_TO_EMAIL     where RFQs go   (daniel@phoenixsteelsupply.com)
//   RFQ_FROM_EMAIL   verified sender (e.g. rfq@phoenixsteelsupply.com)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

const money = (n: number) =>
  "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const id = payload?.record?.id;
    if (!id) return new Response("no record id in payload", { status: 400 });

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const TO = Deno.env.get("RFQ_TO_EMAIL") ?? "daniel@phoenixsteelsupply.com";
    const FROM = Deno.env.get("RFQ_FROM_EMAIL") ?? "onboarding@resend.dev";

    const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

    const [reqRes, lineRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/quote_requests?id=eq.${id}&select=*`, { headers }),
      fetch(
        `${SUPABASE_URL}/rest/v1/quote_request_line_items?quote_request_id=eq.${id}&select=*`,
        { headers },
      ),
    ]);
    const [rows, lines] = await Promise.all([reqRes.json(), lineRes.json()]);
    const rfq = rows?.[0];
    if (!rfq) return new Response("request not found", { status: 404 });

    const rowsHtml = (lines ?? []).map((l: Record<string, unknown>) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5"><code>${esc(l.grade)}</code></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5">${l.width == null ? "—" : esc(Number(l.width).toFixed(1)) + '"'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right">${Number(l.quantity).toLocaleString("en-US")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right">$${Number(l.unit_price).toFixed(4)}/lb</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e5e5;text-align:right"><strong>${money(Number(l.line_total))}</strong></td>
      </tr>`).join("");

    const html = `
      <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
        <h2 style="margin:0 0 4px">New quote request</h2>
        <p style="margin:0 0 18px;color:#666;font-size:13px">
          #${esc(String(rfq.id).slice(0, 8))} · ${esc(new Date(rfq.created_at).toLocaleString("en-US"))}
        </p>
        <table style="border-collapse:collapse;margin-bottom:18px;font-size:14px">
          <tr><td style="padding:3px 16px 3px 0;color:#666">Name</td><td><strong>${esc(rfq.requester_name)}</strong></td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#666">Company</td><td><strong>${esc(rfq.requester_company)}</strong></td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#666">Location</td><td>${esc(rfq.location)}</td></tr>
          <tr><td style="padding:3px 16px 3px 0;color:#666">Customer</td><td>${
            rfq.customer_id ? "matched to an existing account" : "<strong>UNMATCHED</strong> - promote it from the RFQs tab"
          }</td></tr>
        </table>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <thead>
            <tr style="text-align:left;background:#fafafa">
              <th style="padding:8px 12px;border-bottom:2px solid #ddd">Grade</th>
              <th style="padding:8px 12px;border-bottom:2px solid #ddd">Width</th>
              <th style="padding:8px 12px;border-bottom:2px solid #ddd;text-align:right">Qty (lbs)</th>
              <th style="padding:8px 12px;border-bottom:2px solid #ddd;text-align:right">Unit price</th>
              <th style="padding:8px 12px;border-bottom:2px solid #ddd;text-align:right">Line total</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p style="text-align:right;font-size:16px;margin:14px 0 0">
          Estimated total <strong>${money(Number(rfq.total))}</strong>
        </p>
        <p style="color:#888;font-size:12px;margin-top:18px">
          Tariffs and freight are not included in this estimate.
        </p>
      </div>`;

    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [TO],
        reply_to: TO,
        subject: `${rfq.customer_id ? "New RFQ" : "New RFQ (unmatched)"} — ${rfq.requester_company} — ${money(Number(rfq.total))}`,
        html,
      }),
    });

    if (!send.ok) {
      const detail = await send.text();
      console.error("resend failed", send.status, detail);
      return new Response(`email failed: ${detail}`, { status: 502 });
    }

    return new Response(JSON.stringify({ ok: true, id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-rfq error", e);
    return new Response(String(e), { status: 500 });
  }
});
