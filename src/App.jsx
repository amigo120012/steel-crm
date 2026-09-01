import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import QuoteCalculator from "./components/QuoteCalculator";
import ContactPage from "./components/ContactPage";
import logo from "./assets/logo.png";
import "./index.css";

// There is no router in this app — routing is this one pathname check.
//
//   /  and  /order   → public customer RFQ page. No session check, no CRM
//                      data, no nav into the internal app.
//   /contact         → public Contact Us form, same footer, also no auth.
//   /staff           → employee CRM, behind the existing Supabase auth.
//
// Anything unrecognised falls through to the PUBLIC page on purpose: a
// stray or guessed link must never land a customer on the internal app.
const path = typeof window !== "undefined" ? window.location.pathname.replace(/\/+$/, "") : "";
const isStaffRoute = path === "/staff";
const isContactRoute = path === "/contact";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Public visitors never hit Supabase auth at all.
    if (!isStaffRoute) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isContactRoute) return <ContactPage />;
  if (!isStaffRoute) return <QuoteCalculator publicMode />;

  if (loading) return (
    <div className="loading-screen">
      <img src={logo} alt="Phoenix Steel Supply Inc." className="brand-logo loading-logo-img" />
      <p>Loading...</p>
    </div>
  );

  return session ? <Dashboard session={session} /> : <Auth />;
}
