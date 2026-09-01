import { useState } from "react";
import { supabase } from "../supabaseClient";
import PublicShell from "./PublicShell";

// Public Contact Us page, reached from the footer on every public page.
//
// Messages are logged to Supabase through submit_contact_message(), the same
// SECURITY DEFINER pattern the RFQ form uses — anon has no direct grant on
// contact_messages. No email service is involved, so this works with zero
// additional setup; see supabase/03_contact_messages.sql for the optional
// webhook that can forward these to email later.

const MAX_EMAIL = 254;
const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

export default function ContactPage() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  // Honeypot — see the RFQ form for the same pattern.
  const [website, setWebsite] = useState("");
  const [error, setError] = useState(null);
  const [sent, setSent] = useState(false);

  // Mirrors the server rule in submit_contact_message(): email is required and
  // must look like an address.
  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const canSend = emailValid && subject.trim() !== "" && body.trim() !== "" && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError(null);
    const { error } = await supabase.rpc("submit_contact_message", {
      p_email: email.trim(),
      p_subject: subject.trim(),
      p_body: body.trim(),
      p_website: website,
    });
    setSending(false);
    if (error) {
      // Keep raw Postgres text away from the customer, but log it for us.
      console.error("submit_contact_message failed:", error);
      setError("Sorry — your message couldn't be sent. Please try again, or email us directly.");
      return;
    }
    setSent(true);
  }

  function reset() {
    setEmail("");
    setSubject("");
    setBody("");
    setError(null);
    setSent(false);
    setWebsite("");
  }

  return (
    <PublicShell showContact={false}>
      <div className="page contact-page">
        {sent ? (
          <>
            <div className="page-header">
              <div>
                <h1>Message sent</h1>
                <p className="page-sub">Thanks — we&apos;ll get back to you shortly.</p>
              </div>
            </div>
            <div className="auth-success" style={{ marginBottom: 16 }}>
              ✓ Your message has been received.
            </div>
            <div className="contact-actions">
              <a className="btn-outline" href="/">← Back to quote request</a>
              <button className="btn-outline" onClick={reset}>Send another message</button>
            </div>
          </>
        ) : (
          <>
            <div className="page-header">
              <div>
                <h1>Contact Us</h1>
              </div>
            </div>

            <div className="contact-form">
              <input
                className="hp-field"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={e => setWebsite(e.target.value)}
              />

              <div className="field-group">
                <label>Your email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value.slice(0, MAX_EMAIL))}
                  maxLength={MAX_EMAIL}
                  placeholder="..."
                />
                {email.trim() !== "" && !emailValid && (
                  <span className="field-hint-error">Enter a valid email address</span>
                )}
              </div>
              <div className="field-group">
                <label>Subject *</label>
                <input
                  value={subject}
                  onChange={e => setSubject(e.target.value.slice(0, MAX_SUBJECT))}
                  placeholder="..."
                />
              </div>
              <div className="field-group">
                <label>Message *</label>
                <textarea
                  rows={9}
                  value={body}
                  onChange={e => setBody(e.target.value.slice(0, MAX_BODY))}
                  placeholder="..."
                />
                <span className="char-count">{body.length} / {MAX_BODY}</span>
              </div>

              {error && <div className="auth-error">{error}</div>}

              <div className="contact-actions">
                <a className="btn-outline" href="/">← Back</a>
                <button className="btn-primary" onClick={send} disabled={!canSend}>
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PublicShell>
  );
}
