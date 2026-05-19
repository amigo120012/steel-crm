import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";
import ProfilePanel from "./ProfilePanel";

const EMPTY = {
  name: "", type: "Mill", country: "", grade: "",
  contact_name: "", email: "", phone: "", notes: "", status: "Active", rating: 3
};

const RANK = r => r >= 4.5 ? "A" : r >= 3.5 ? "B" : r >= 2.5 ? "C" : "D";
const RANK_CLASS = r => ({ A: "rank-a", B: "rank-b", C: "rank-c", D: "rank-d" })[RANK(r)];

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => { fetchVendors(); }, []);

  async function fetchVendors() {
    setLoading(true);
    const { data } = await supabase.from("vendors").select("*").order("name");
    setVendors(data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    if (editId) {
      await supabase.from("vendors").update(form).eq("id", editId);
    } else {
      await supabase.from("vendors").insert(form);
    }
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY);
    setEditId(null);
    fetchVendors();
  }

  async function remove(id) {
    if (!confirm("Delete this vendor?")) return;
    await supabase.from("vendors").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    fetchVendors();
  }

  function openEdit(v) {
    setForm({ name: v.name, type: v.type, country: v.country, grade: v.grade,
      contact_name: v.contact_name, email: v.email, phone: v.phone,
      notes: v.notes, status: v.status, rating: v.rating });
    setEditId(v.id);
    setShowModal(true);
  }

  async function exportCSV() {
    const rows = vendors.map(v =>
      [v.name, v.type, v.country, v.grade, v.rating, RANK(v.rating), v.status, v.contact_name, v.email].join(",")
    );
    const csv = ["Name,Type,Country,Grade,Rating,Rank,Status,Contact,Email", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "vendors.csv";
    a.click();
  }

  const filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.name?.toLowerCase().includes(q) || v.country?.toLowerCase().includes(q) || v.grade?.toLowerCase().includes(q);
    const matchType = !typeFilter || v.type === typeFilter;
    return matchSearch && matchType;
  });

  if (selected) {
    return <ProfilePanel entity={selected} type="vendor" onBack={() => setSelected(null)} onEdit={() => openEdit(selected)} onDelete={() => { remove(selected.id); setSelected(null); }} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Vendors</h1>
          <p className="page-sub">{vendors.length} suppliers in database</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setShowModal(true); }}>+ Add vendor</button>
        </div>
      </div>

      <div className="filters">
        <input className="search-input" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option>Mill</option><option>Distributor</option><option>Broker</option>
        </select>
      </div>

      {loading ? <div className="loading-inline">Loading...</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Vendor</th><th>Type</th><th>Country</th><th>Grade</th>
                <th>Rating</th><th>Rank</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} onClick={() => setSelected(v)} style={{ cursor: "pointer" }}>
                  <td><strong>{v.name}</strong></td>
                  <td><span className="badge badge-blue">{v.type}</span></td>
                  <td>{v.country}</td>
                  <td><code>{v.grade}</code></td>
                  <td>{"★".repeat(Math.round(v.rating))}{"☆".repeat(5 - Math.round(v.rating))} {v.rating}</td>
                  <td><span className={`rank-badge ${RANK_CLASS(v.rating)}`}>{RANK(v.rating)}</span></td>
                  <td><span className={`badge ${v.status === "Active" ? "badge-green" : "badge-gray"}`}>{v.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => openEdit(v)} title="Edit">✎</button>
                    <button className="icon-btn danger" onClick={() => remove(v.id)} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="empty-row">No vendors found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? "Edit vendor" : "Add vendor"} onClose={() => setShowModal(false)}>
          <div className="form-grid">
            <div className="field-group">
              <label>Company name *</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nippon Steel Corp" />
            </div>
            <div className="field-group">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option>Mill</option><option>Distributor</option><option>Broker</option>
              </select>
            </div>
            <div className="field-group">
              <label>Country</label>
              <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Japan" />
            </div>
            <div className="field-group">
              <label>Steel grade</label>
              <input value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder="M270-50A" />
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
                <option>Active</option><option>Inactive</option><option>On hold</option>
              </select>
            </div>
            <div className="field-group">
              <label>Rating (1–5)</label>
              <input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={e => setForm({ ...form, rating: parseFloat(e.target.value) })} />
            </div>
            <div className="field-group span-2">
              <label>Notes</label>
              <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} placeholder="Relationship notes, quality, lead times..." />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
              {saving ? "Saving..." : editId ? "Save changes" : "Add vendor"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
