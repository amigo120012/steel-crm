import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./components/Auth";
import Dashboard from "./components/Dashboard";
import OrderPage from "./components/OrderPage";
import "./index.css";

// /order is a fully public route — no session check, no CRM data, no
// sidebar. It renders standalone before anything else in this component.
const isOrderRoute = typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/order";

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOrderRoute) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (isOrderRoute) return <OrderPage />;

  if (loading) return (
    <div className="loading-screen">
      <div className="loading-logo">⬡</div>
      <p>Loading...</p>
    </div>
  );

  return session ? <Dashboard session={session} /> : <Auth />;
}
