import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";

const fmtValue = n => n ? "$" + Number(n).toLocaleString() : "—";

const getPrices = v => {
  const gp = v.grade_prices;
  if (!gp) return {};
  if (typeof gp === "string") { try { return JSON.parse(gp); } catch { return {}; } }
  return gp;
};

export default function ProfilePanel({ entity, type, onBack, onEdit, onDelete }) {
  const [orders, setOrders] = useState([]);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const initials = entity.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const isVendor = type === "vendor";
  const notesField = isVendor ? "offerings" : "core_details";

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
    const existing = entity[notesField] || "";
    const updated = existing
      ? `${existing}\n\n[${new Date().toLocaleDateString()}] ${note}`
      : `[${new Date().toLocaleDateString()}] ${note}`;
    await supabase.from(table).update({ [notesField]: updated }).eq("id", entity.id);
    entity[notesField] = updated;
    setNote("");
    setSavingNote(false);
  }

  const totalOrders = orders.length;
  const totalValue = orders.reduce((s, o) => s + (o.value_usd || 0), 0);
  const totalMT = orders.reduce((s, o) => s + (o.quantity_mt || 0), 0);
  const prices = isVendor ? getPrices(entity) : {};
  const priceEntries = Object.entries(prices);

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
            <div className={`profile-avatar ${isVendor ? "av-orange" : "av-white"}`}>{initials}</div>
            <h2>{entity.name}</h2>
            {isVendor && entity.type && (
              <span className="badge badge-blue">{entity.type}</span>
            )}
          </div>

          <div className="info-card">
            <div className="info-row">
              <span>Location</span>
              <strong>{entity.location || "—"}</strong>
            </div>
            {!isVendor && (
              <>
                <div className="info-row">
                  <span>Grade desired</span>
                  <code>{entity.grade_desired || "—"}</code>
                </div>
                <div className="info-row">
                  <span>Order qty/yr</span>
                  <strong>{entity.order_qty_yr ? Number(entity.order_qty_yr).toLocaleString() + " mt/yr" : "—"}</strong>
                </div>
                {entity.target_margin_pct != null && entity.target_margin_pct !== "" && (
                  <div className="info-row">
                    <span>Target margin</span>
                    <strong>{entity.target_margin_pct}%</strong>
                  </div>
                )}
              </>
            )}
            {isVendor && (
              <>
                <div className="info-row">
                  <span>Grades offered</span>
                  <strong>{entity.grades_offered || "—"}</strong>
                </div>
                <div className="info-row">
                  <span>Available qty</span>
                  <strong>{entity.available_order_qty ? Number(entity.available_order_qty).toLocaleString() + " mt" : "—"}</strong>
                </div>
                <div className="info-row">
                  <span>Lead time</span>
                  <strong>{entity.lead_time || "—"}</strong>
                </div>
              </>
            )}
          </div>

          {isVendor && priceEntries.length > 0 && (
            <div className="info-card">
              <p className="card-label">Prices by Grade</p>
              {priceEntries.map(([g, p]) => (
                <div key={g} className="info-row">
                  <span><code>{g}</code></span>
                  <strong>${Number(p).toLocaleString()}/mt</strong>
                </div>
              ))}
            </div>
          )}

          <div className="info-card">
            <p className="card-label">Contact</p>
            <div className="info-row">
              <span>Name</span>
              <strong>{entity.contact_name || "—"}</strong>
            </div>
            <div className="info-row">
              <span>Email</span>
              <a href={`mailto:${entity.email}`}>{entity.email || "—"}</a>
            </div>
            <div className="info-row">
              <span>Phone</span>
              <strong>{entity.phone || "—"}</strong>
            </div>
          </div>
        </aside>

        <div className="profile-main">
          <div className="metrics-row">
            <div className="metric-card">
              <span className="metric-label">Orders</span>
              <span className="metric-value">{totalOrders}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Total value</span>
              <span className="metric-value" style={{ fontSize: "18px" }}>{fmtValue(totalValue)}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Volume (MT)</span>
              <span className="metric-value">{totalMT.toLocaleString()}</span>
            </div>
          </div>

          <div className="info-card" style={{ marginBottom: "1rem" }}>
            <p className="card-label">{isVendor ? "Offerings" : "Core Details"}</p>
            {entity[notesField] ? (
              <pre className="notes-text">{entity[notesField]}</pre>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No notes yet.</p>
            )}
            <div className="note-add">
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={2}
                placeholder="Add a note..."
              />
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
                      <td style={{ padding: "7px 0", textAlign: "right" }}><strong>{fmtValue(o.value_usd)}</strong></td>
                      <td style={{ padding: "7px 0" }}>
                        <span className={`badge ${o.status === "Delivered" ? "badge-green" : o.status === "Shipped" ? "badge-blue" : "badge-gray"}`}>
                          {o.status}
                        </span>
                      </td>
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
