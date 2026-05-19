import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const RANK = r => r >= 4.5 ? "A" : r >= 3.5 ? "B" : r >= 2.5 ? "C" : "D";
const RANK_CLASS = r => ({ A: "rank-a", B: "rank-b", C: "rank-c", D: "rank-d" })[RANK(r)];
const fmt = n => n ? "$" + Number(n).toLocaleString() : "—";

function RankRow({ entity, rank, type }) {
  const initials = entity.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  return (
    <div className="rank-row">
      <span className="rank-pos">#{rank}</span>
      <div className={`rank-avatar ${type === "vendor" ? "av-blue" : "av-green"}`}>{initials}</div>
      <div className="rank-info">
        <strong>{entity.name}</strong>
        <span>{type === "vendor" ? `${entity.type} · ${entity.country}` : `${entity.industry} · ${entity.country}`}</span>
      </div>
      <div className="rank-bar-wrap">
        <div className="rank-bar" style={{ width: `${(entity.rating / 5) * 100}%` }} />
      </div>
      <span className={`rank-badge ${RANK_CLASS(entity.rating)}`}>{RANK(entity.rating)}</span>
      <span className="rank-score">{entity.rating}</span>
    </div>
  );
}

export default function Rankings() {
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      const [{ data: v }, { data: c }] = await Promise.all([
        supabase.from("vendors").select("*").eq("status", "Active").order("rating", { ascending: false }),
        supabase.from("customers").select("*").eq("status", "Active").order("rating", { ascending: false }),
      ]);
      setVendors(v || []);
      setCustomers(c || []);
      setLoading(false);
    }
    fetch();
  }, []);

  const topVendor = vendors[0];
  const topCustomer = customers[0];
  const avgVendorRating = vendors.length ? (vendors.reduce((s, v) => s + v.rating, 0) / vendors.length).toFixed(1) : "—";
  const totalSpend = customers.reduce((s, c) => s + (c.annual_spend || 0), 0);

  if (loading) return <div className="page"><div className="loading-inline">Loading rankings...</div></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Rankings</h1>
          <p className="page-sub">Auto-calculated from ratings · Active records only</p>
        </div>
      </div>

      <div className="metrics-row">
        <div className="metric-card">
          <span className="metric-label">Active vendors</span>
          <span className="metric-value">{vendors.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Avg vendor rating</span>
          <span className="metric-value">{avgVendorRating}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Active customers</span>
          <span className="metric-value">{customers.length}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total annual spend</span>
          <span className="metric-value" style={{ fontSize: "18px" }}>{fmt(totalSpend)}</span>
        </div>
      </div>

      <div className="rankings-grid">
        <div className="rankings-panel">
          <h2>Top vendors</h2>
          {vendors.length === 0 && <p className="empty-row">No active vendors yet</p>}
          {vendors.map((v, i) => <RankRow key={v.id} entity={v} rank={i + 1} type="vendor" />)}
        </div>
        <div className="rankings-panel">
          <h2>Top customers</h2>
          {customers.length === 0 && <p className="empty-row">No active customers yet</p>}
          {customers.map((c, i) => <RankRow key={c.id} entity={c} rank={i + 1} type="customer" />)}
        </div>
      </div>

      <div className="tier-legend">
        <h2>Tier criteria</h2>
        <div className="tier-grid">
          {[
            { tier: "A", cls: "rank-a", desc: "Rating ≥ 4.5 — Premium tier, strategic partners" },
            { tier: "B", cls: "rank-b", desc: "Rating 3.5–4.4 — Reliable, high-value accounts" },
            { tier: "C", cls: "rank-c", desc: "Rating 2.5–3.4 — Standard, developing accounts" },
            { tier: "D", cls: "rank-d", desc: "Rating < 2.5 — Needs attention or review" },
          ].map(t => (
            <div key={t.tier} className="tier-item">
              <span className={`rank-badge ${t.cls}`} style={{ width: 32, height: 32, fontSize: 16 }}>{t.tier}</span>
              <p>{t.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
