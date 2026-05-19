import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";

const EMPTY = {
  customer_id: "", vendor_id: "", grade: "", quantity_mt: "",
  value_usd: "", status: "Pending", notes: "", order_date: new Date().toISOString().split("T")[0]
};

const STATUS_CLASS = { Pending: "badge-gray", Confirmed: "badge-blue", Shipped: "badge-orange", Delivered: "badge-green" };
const fmt = n => n ? "$" + Number(n).toLocaleString() : "—";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: o }, { data: v }, { data: c }] = await Promise.all([
      supabase.from("orders").select("*, vendors(name), customers(name)").order("order_date", { ascending: false }),
      supabase.from("vendors").select("id, name").order("name"),
      supabase.from("customers").select("id, name").order("name"),
    ]);
    setOrders(o || []);
    setVendors(v || []);
    setCustomers(c || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const payload = {
      customer_id: form.customer_id || null,
      vendor_id: form.vendor_id || null,
      grade: form.grade,
      quantity_mt: form.quantity_mt ? Number(form.quantity_mt) : null,
      value_usd: form.value_usd ? Number(form.value_usd) : null,
      status: form.status,
      notes: form.notes,
      order_date: form.order_date,
    };
    if (editId) {
      await supabase.from("orders").update(payload).eq("id", editId);
    } else {
      await supabase.from("orders").insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY);
    setEditId(null);
    fetchAll();
  }

  async function remove(id) {
    if (!confirm("Delete this order?")) return;
    await supabase.from("orders").delete().eq("id", id);
    fetchAll();
  }

  function openEdit(o) {
    setForm({
      customer_id: o.customer_id || "", vendor_id: o.vendor_id || "",
      grade: o.grade || "", quantity_mt: o.quantity_mt || "",
      value_usd: o.value_usd || "", status: o.status, notes: o.notes || "",
      order_date: o.order_date || new Date().toISOString().split("T")[0]
    });
    setEditId(o.id);
    setShowModal(true);
  }

  async function exportCSV() {
    const rows = orders.map(o =>
      [o.id, o.customers?.name, o.vendors?.name, o.grade, o.quantity_mt, o.value_usd, o.status, o.order_date].join(",")
    );
    const csv = ["ID,Customer,Vendor,Grade,Qty (MT),Value USD,Status,Date", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "orders.csv";
    a.click();
  }

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const name = `${o.customers?.name} ${o.vendors?.name} ${o.grade}`.toLowerCase();
    return (!q || name.includes(q)) && (!statusFilter || o.status === statusFilter);
  });

  const totalValue = filtered.reduce((s, o) => s + (o.value_usd || 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-sub">{orders.length} total orders · {fmt(totalValue)} shown</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setShowModal(true); }}>+ New order</button>
        </div>
      </div>

      <div className="filters">
        <input className="search-input" placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option>Pending</option><option>Confirmed</option><option>Shipped</option><option>Delivered</option>
        </select>
      </div>

      {loading ? <div className="loading-inline">Loading...</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Customer</th><th>Vendor</th><th>Grade</th>
                <th>Qty (MT)</th><th>Value</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id}>
                  <td><code>{o.order_date}</code></td>
                  <td>{o.customers?.name || "—"}</td>
                  <td>{o.vendors?.name || "—"}</td>
                  <td><code>{o.grade || "—"}</code></td>
                  <td>{o.quantity_mt ? `${o.quantity_mt} MT` : "—"}</td>
                  <td><strong>{fmt(o.value_usd)}</strong></td>
                  <td><span className={`badge ${STATUS_CLASS[o.status] || "badge-gray"}`}>{o.status}</span></td>
                  <td>
                    <button className="icon-btn" onClick={() => openEdit(o)} title="Edit">✎</button>
                    <button className="icon-btn danger" onClick={() => remove(o.id)} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="empty-row">No orders found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? "Edit order" : "New order"} onClose={() => setShowModal(false)}>
          <div className="form-grid">
            <div className="field-group">
              <label>Customer</label>
              <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })}>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Vendor</label>
              <select value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })}>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Steel grade</label>
              <input value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="M270-50A" />
            </div>
            <div className="field-group">
              <label>Quantity (MT)</label>
              <input type="number" value={form.quantity_mt} onChange={e => setForm({ ...form, quantity_mt: e.target.value })} placeholder="250" />
            </div>
            <div className="field-group">
              <label>Value (USD)</label>
              <input type="number" value={form.value_usd} onChange={e => setForm({ ...form, value_usd: e.target.value })} placeholder="700000" />
            </div>
            <div className="field-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>Pending</option><option>Confirmed</option><option>Shipped</option><option>Delivered</option>
              </select>
            </div>
            <div className="field-group">
              <label>Order date</label>
              <input type="date" value={form.order_date} onChange={e => setForm({ ...form, order_date: e.target.value })} />
            </div>
            <div className="field-group span-2">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Delivery terms, special requirements..." />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving..." : editId ? "Save changes" : "Create order"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
