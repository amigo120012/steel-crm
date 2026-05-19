import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const RANK = r => r >= 4.5 ? "A" : r >= 3.5 ? "B" : r >= 2.5 ? "C" : "D";
const RANK_CLASS = r => ({ A: "rank-a", B: "rank-b", C: "rank-c", D: "rank-d" })[RANK(r)];
const fmt = n => n ? "$" + Number(n).toLocaleString() : "—";

export default function ProfilePanel({ entity, type, onBack, onEdit, onDelete }) {
  const [orders, setOrders] = useState([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const initials = entity.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const isVendor = type === "vendor";

  useEffect(() => {
    async function fetchOrders() {
      const col = isVendor ? "vendor_id" : "customer_id";
      const { data } = await supabase
        .from("orders")
        .select("*, vendors(name), customers(name)")
        .eq(col, entity.id)
        .order("order_date", { ascending: false })
        .limit(10);
      setOrders(data || []);
    }
    fetchOrders();
  }, [entity.id, isVendor]);

  async function addNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    const table = isVendor ? "vendors" : "customers";
    const existing = entity.notes || "";
    const updated = existing ? `${existing}\n\n[${new Date().toLocaleDateString()}] ${note}` : `[${new Date().toLocaleDateString()}] ${note}`;
    await supabase.from(table).update({ notes: updated }).eq("id", entity.id);
    entity.notes = updated;
    setNote("");
    setSavingNote(false);
  }

  const totalOrders = orders.length;
  const totalValue = orders.reduce((s, o) => s + (o.value_usd || 0), 0);
  const totalMT = orders.reduce((s, o) => s + (o.quantity_mt || 0), 0);

  return (
    <div className="page">
      <div className="profile-topbar">
        <button className="btn-outline" onClick={onBack}>← Back</button>
        <div className="profile-actions">
          <button className="btn-outline" onClick={onEdit}>Edit</button>
          <button className="btn-danger" onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="profile-layout">
        <aside className="profile-sidebar">
          <div className="profile-card">
            <div className={`profile-avatar ${isVendor ? "av-blue" : "av-green"}`}>{initials}</div>
            <h2>{entity.name}</h2>
            <span className={`rank-badge ${RANK_CLASS(entity.rating)}`} style={{ width: 32, height: 32, fontSize: 16 }}>{RANK(entity.rating)}</span>
            <div className="stars">{"★".repeat(Math.round(entity.rating))}{"☆".repeat(5 - Math.round(entity.rating))} {entity.rating}</div>
            <span className={`badge ${entity.status === "Active" ? "badge-green" : "badge-gray"}`}>{entity.status}</span>
          </div>

          <div className="info-card">
            <div className="info-row"><span>Type</span><strong>{isVendor ? entity.type : entity.industry}</strong></div>
            {isVendor && <div className="info-row"><span>Grade</span><code>{entity.grade || "—"}</code></div>}
            <div className="info-row"><span>Country</span><strong>{entity.country || "—"}</strong></div>
            {!isVendor && entity.annual_spend && <div className="info-row"><span>Annual spend</span><strong>{fmt(entity.annual_spend)}</strong></div>}
          </div>

          <div className="info-card">
            <p className="card-label">Contact</p>
            <div className="info-row"><span>Name</span><strong>{entity.contact_name || "—"}</strong></div>
            <div className="info-row"><span>Email</span><a href={`mailto:${entity.email}`}>{entity.email || "—"}</a></div>
            <div className="info-row"><span>Phone</span><strong>{entity.phone || "—"}</strong></div>
          </div>
        </aside>

        <div className="profile-main">
          <div className="metrics-row">
            <div className="metric-card"><span className="metric-label">Orders</span><span className="metric-value">{totalOrders}</span></div>
            <div className="metric-card"><span className="metric-label">Total value</span><span className="metric-value" style={{ fontSize: "18px" }}>{fmt(totalValue)}</span></div>
            <div className="metric-card"><span className="metric-label">Volume (MT)</span><span className="metric-value">{totalMT.toLocaleString()}</span></div>
          </div>

          <div className="info-card" style={{ marginBottom: "1rem" }}>
            <p className="card-label">Notes</p>
            {entity.notes ? (
              <pre className="notes-text">{entity.notes}</pre>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No notes yet.</p>
            )}
            <div className="note-add">
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Add a note..." />
              <button className="btn-primary" onClick={addNote} disabled={savingNote || !note.trim()}>
                {savingNote ? "Saving..." : "Add note"}
              </button>
            </div>
          </div>

          <div className="info-card">
            <p className="card-label">Recent orders</p>
            {orders.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No orders recorded yet.</p>
            ) : (
              <table style={{ width: "100%", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", paddingBottom: "8px", color: "var(--text-muted)" }}>Date</th>
                    <th style={{ textAlign: "left", paddingBottom: "8px", color: "var(--text-muted)" }}>{isVendor ? "Customer" : "Vendor"}</th>
                    <th style={{ textAlign: "left", paddingBottom: "8px", color: "var(--text-muted)" }}>Grade</th>
                    <th style={{ textAlign: "right", paddingBottom: "8px", color: "var(--text-muted)" }}>Qty (MT)</th>
                    <th style={{ textAlign: "right", paddingBottom: "8px", color: "var(--text-muted)" }}>Value</th>
                    <th style={{ textAlign: "left", paddingBottom: "8px", color: "var(--text-muted)" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.id} style={{ borderTop: "0.5px solid var(--border)" }}>
                      <td style={{ padding: "7px 0" }}><code>{o.order_date}</code></td>
                      <td style={{ padding: "7px 0" }}>{isVendor ? o.customers?.name : o.vendors?.name}</td>
                      <td style={{ padding: "7px 0" }}><code>{o.grade}</code></td>
                      <td style={{ padding: "7px 0", textAlign: "right" }}>{o.quantity_mt || "—"}</td>
                      <td style={{ padding: "7px 0", textAlign: "right" }}><strong>{fmt(o.value_usd)}</strong></td>
                      <td style={{ padding: "7px 0" }}><span className={`badge ${o.status === "Delivered" ? "badge-green" : o.status === "Shipped" ? "badge-blue" : "badge-gray"}`}>{o.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
