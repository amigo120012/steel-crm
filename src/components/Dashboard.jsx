import { useState } from "react";
import { supabase } from "../supabaseClient";
import Vendors from "./Vendors";
import Customers from "./Customers";
import Orders from "./Orders";

const NAV = [
  { id: "vendors",   label: "Vendors",   icon: "" },
  { id: "customers", label: "Customers", icon: "" },
  { id: "orders",    label: "Orders",    icon: "" },
];

export default function Dashboard({ session }) {
  const [tab, setTab] = useState("vendors");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-icon">⬡</span>
          <span className="brand-name">Phoenix CRM</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${tab === n.id ? "active" : ""}`}
              onClick={() => setTab(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="user-email">{session.user.email}</p>
          <button className="signout-btn" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main-content">
        {tab === "vendors"   && <Vendors />}
        {tab === "customers" && <Customers />}
        {tab === "orders"    && <Orders />}
      </main>
    </div>
  );
}
