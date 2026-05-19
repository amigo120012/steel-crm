import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";
import ProfilePanel from "./ProfilePanel";

const EMPTY = {
  name: "", industry: "Automotive", country: "", annual_spend: "",
  contact_name: "", email: "", phone: "", notes: "", status: "Active", rating: 3
};

const RANK = r => r >= 4.5 ? "A" : r >= 3.5 ? "B" : r >= 2.5 ? "C" : "D";
const RANK_CLASS = r => ({ A: "rank-a", B: "rank-b", C: "rank-c", D: "rank-d" })[RANK(r)];
const fmt = n => n ? "$" + Number(n).toLocaleString() : "—";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers(data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const payload = { ...form, annual_spend: form.annual_spend ? Number(form.annual_spend) : null };
    if (editId) {
      await supabase.from("customers").update(payload).eq("id", editId);
    } else {
      await supabase.from("customers").insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY);
    setEditId(null);
    fetchCustomers();
  }

  async function remove(id) {
    if (!confirm("Delete this customer?")) return;
    await supabase.from("customers").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    fetchCustomers();
  }

  function openEdit(c) {
    setForm({ name: c.name, industry: c.industry, country: c.country,
      annual_spend: c.annual_spend || "", contact_name: c.contact_name,
      email: c.email, phone: c.phone, notes: c.notes, status: c.status, rating: c.rating });
    setEditId(c.id);
    setShowModal(true);
  }

  async function exportCSV() {
    const rows = customers.map(c =>
      [c.name, c.industry, c.country, c.annual_spend, c.rating, RANK(c.rating), c.status, c.contact_name, c.email].join(",")
    );
    const csv = ["Name,Industry,Country,Annual Spend,Rating,Rank,Status,Contact,Email", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv";
    a.click();
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q || c.name?.toLowerCase().includes(q) || c.country?.toLowerCase().includes(q) || c.industry?.toLowerCase().includes(q);
    const matchInd = !industryFilter || c.industry === industryFilter;
    return matchSearch && matchInd;
  });

  if (selected) {
    return <ProfilePanel entity={selected} type="customer" onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} onDelete={() => { remove(selected.id); setSelected(null); }} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} customers in database</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setShowModal(true); }}>+ Add customer</button>
        </div>
      </div>

      <div className="filters">
        <input className="search-input" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={industryFilter} onChange={e => setIndustryFilter(e.target.value)}>
          <option value="">All industries</option>
          <option>Automotive</option><option>Energy</option><option>Construction</option><option>Manufacturing</option>
        </select>
      </div>

      {loading ? <div className="loading-inline">Loading...</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Customer</th><th>Industry</th><th>Country</th><th>Annual spend</th>
                <th>Rating</th><th>Rank</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: "pointer" }}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.industry}</td>
                  <td>{c.country}</td>
                  <td><strong>{fmt(c.annual_spend)}</strong></td>
                  <td>{"★".repeat(Math.round(c.rating))}{"☆".repeat(5 - Math.round(c.rating))} {c.rating}</td>
                  <td><span className={`rank-badge ${RANK_CLASS(c.rating)}`}>{RANK(c.rating)}</span></td>
                  <td><span className={`badge ${c.status === "Active" ? "badge-green" : "badge-gray"}`}>{c.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => openEdit(c)} title="Edit">✎</button>
                    <button className="icon-btn danger" onClick={() => remove(c.id)} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="empty-row">No customers found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? "Edit customer" : "Add customer"} onClose={() => setShowModal(false)}>
          <div className="form-grid">
            <div className="field-group">
              <label>Company name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Siemens Energy AG" />
            </div>
            <div className="field-group">
              <label>Industry</label>
              <select value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })}>
                <option>Automotive</option><option>Energy</option><option>Construction</option><option>Manufacturing</option><option>Other</option>
              </select>
            </div>
            <div className="field-group">
              <label>Country</label>
              <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Germany" />
            </div>
            <div className="field-group">
              <label>Annual spend ($)</label>
              <input type="number" value={form.annual_spend} onChange={e => setForm({ ...form, annual_spend: e.target.value })} placeholder="500000" />
            </div>
            <div className="field-group">
              <label>Contact name</label>
              <input value={form.contact_name} onChange={e => setForm({ ...form, contact_name: e.target.value })} placeholder="Full name" />
            </div>
            <div className="field-group">
              <label>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="email@company.com" />
            </div>
            <div className="field-group">
              <label>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 000 0000" />
            </div>
            <div className="field-group">
              <label>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>Active</option><option>Inactive</option><option>Prospect</option>
              </select>
            </div>
            <div className="field-group">
              <label>Rating (1–5)</label>
              <input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={e => setForm({ ...form, rating: parseFloat(e.target.value) })} />
            </div>
            <div className="field-group span-2">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Requirements, payment terms, relationship notes..." />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
              {saving ? "Saving..." : editId ? "Save changes" : "Add customer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
