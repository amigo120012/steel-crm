import { useState } from "react";
import { supabase } from "../supabaseClient";
import logo from "../assets/logo.png";

// Staff sign-in only. There is deliberately no sign-up path: this gate is the
// boundary between the public RFQ page and the CRM, so accounts are created by
// an admin in Supabase → Authentication → Users, never self-served.

export default function Auth() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src={logo} alt="Phoenix Steel Supply Inc." className="brand-logo auth-logo-img" />
        <p className="auth-sub">Staff sign-in · Electric steel sales platform</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="field-group">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="field-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Please wait..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
