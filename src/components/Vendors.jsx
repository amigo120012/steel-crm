import React, { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";
import ProfilePanel from "./ProfilePanel";

const STEEL_GRADES = ["M6", "M4", "M3", "Other"];

const EMPTY = {
  name: "", type: "Mill", location: "",
  grades_offered: "", available_order_qty: "",
  contact_name: "", email: "", phone: "",
  lead_time: "", grade_prices: {},
  offerings: ""
};

const getPrices = v => {
  const gp = v.grade_prices;
  if (!gp) return {};
  if (typeof gp === "string") { try { return JSON.parse(gp); } catch { return {}; } }
  return gp;
};

const truncate = (s, n = 55) => s && s.length > n ? s.slice(0, n) + "…" : (s || "—");

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
  const [sort, setSort] = useState({ col: null, dir: "asc" });
  const [expanded, setExpanded] = useState(new Set());
  const [newGrade, setNewGrade] = useState("M6");
  const [newPrice, setNewPrice] = useState("");

  useEffect(() => { fetchVendors(); }, []);

  async function fetchVendors() {
    setLoading(true);
    const { data } = await supabase.from("vendors").select("*").order("name");
    setVendors(data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      available_order_qty: form.available_order_qty ? Number(form.available_order_qty) : null,
    };
    if (editId) {
      await supabase.from("vendors").update(payload).eq("id", editId);
    } else {
      await supabase.from("vendors").insert(payload);
    }
    setSaving(false);
    setShowModal(false);
    setForm(EMPTY);
    setEditId(null);
    setNewGrade("M6");
    setNewPrice("");
    fetchVendors();
  }

  async function remove(id) {
    if (!confirm("Delete this vendor?")) return;
    await supabase.from("vendors").delete().eq("id", id);
    if (selected?.id === id) setSelected(null);
    fetchVendors();
  }

  function openEdit(v) {
    setForm({
      name: v.name || "", type: v.type || "Mill",
      location: v.location || "",
      grades_offered: v.grades_offered || "",
      available_order_qty: v.available_order_qty || "",
      contact_name: v.contact_name || "", email: v.email || "",
      phone: v.phone || "", lead_time: v.lead_time || "",
      grade_prices: getPrices(v),
      offerings: v.offerings || ""
    });
    setEditId(v.id);
    setNewGrade("M6");
    setNewPrice("");
    setShowModal(true);
  }

  function addGradePrice() {
    if (!newGrade || !newPrice) return;
    setForm(f => ({ ...f, grade_prices: { ...f.grade_prices, [newGrade]: newPrice } }));
    setNewPrice("");
  }

  function removeGradePrice(grade) {
    setForm(f => {
      const gp = { ...f.grade_prices };
      delete gp[grade];
      return { ...f, grade_prices: gp };
    });
  }

  function toggleExpanded(id) {
    setExpanded(s => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  }

  async function exportCSV() {
    const rows = vendors.map(v =>
      [v.name, v.type, v.location, v.grades_offered, v.available_order_qty, v.lead_time, v.contact_name, v.email].join(",")
    );
    const csv = ["Name,Type,Location,Grades Offered,Available Qty,Lead Time,Contact,Email", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "vendors.csv";
    a.click();
  }

  function toggleSort(col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  }

  const sortIcon = col => {
    if (sort.col !== col) return <span className="sort-arrow">↕</span>;
    return <span className="sort-arrow active">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  };

  let filtered = vendors.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.name?.toLowerCase().includes(q) ||
      v.location?.toLowerCase().includes(q) ||
      v.grades_offered?.toLowerCase().includes(q) ||
      v.offerings?.toLowerCase().includes(q) ||
      v.contact_name?.toLowerCase().includes(q);
    const matchType = !typeFilter || v.type === typeFilter;
    return matchSearch && matchType;
  });

  if (sort.col) {
    filtered = [...filtered].sort((a, b) => {
      const va = a[sort.col] ?? "";
      const vb = b[sort.col] ?? "";
      if (typeof va === "number" && typeof vb === "number")
        return sort.dir === "asc" ? va - vb : vb - va;
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }

  if (selected) {
    return (
      <ProfilePanel
        entity={selected} type="vendor"
        onBack={() => setSelected(null)}
        onEdit={() => openEdit(selected)}
        onDelete={() => { remove(selected.id); setSelected(null); }}
      />
    );
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
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setNewGrade("M6"); setNewPrice(""); setShowModal(true); }}>
            + Add vendor
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search vendors..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
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
                <th className="sortable" onClick={() => toggleSort("name")}>Vendor {sortIcon("name")}</th>
                <th className="sortable" onClick={() => toggleSort("location")}>Location {sortIcon("location")}</th>
                <th className="sortable" onClick={() => toggleSort("grades_offered")}>Grades Offered {sortIcon("grades_offered")}</th>
                <th className="sortable" onClick={() => toggleSort("available_order_qty")}>Available Qty {sortIcon("available_order_qty")}</th>
                <th className="sortable" onClick={() => toggleSort("contact_name")}>Contacts {sortIcon("contact_name")}</th>
                <th className="sortable" onClick={() => toggleSort("lead_time")}>Lead Time {sortIcon("lead_time")}</th>
                <th>Current Price</th>
                <th>Offerings</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => {
                const prices = getPrices(v);
                const priceCount = Object.keys(prices).length;
                return (
                  <React.Fragment key={v.id}>
                    <tr onClick={() => setSelected(v)} style={{ cursor: "pointer" }}>
                      <td><strong>{v.name}</strong>{v.type && <span className="badge badge-blue" style={{ marginLeft: 8 }}>{v.type}</span>}</td>
                      <td>{v.location || "—"}</td>
                      <td><code>{v.grades_offered || "—"}</code></td>
                      <td>{v.available_order_qty ? Number(v.available_order_qty).toLocaleString() + " mt" : "—"}</td>
                      <td>{v.contact_name || "—"}</td>
                      <td>{v.lead_time || "—"}</td>
                      <td onClick={e => e.stopPropagation()}>
                        {priceCount > 0 ? (
                          <button className="expand-btn" onClick={() => toggleExpanded(v.id)}>
                            {priceCount} grade{priceCount !== 1 ? "s" : ""} {expanded.has(v.id) ? "▴" : "▾"}
                          </button>
                        ) : "—"}
                      </td>
                      <td style={{ maxWidth: 180 }}><span className="cell-truncate">{truncate(v.offerings)}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <button className="icon-btn" onClick={() => openEdit(v)} title="Edit">✎</button>
                        <button className="icon-btn danger" onClick={() => remove(v.id)} title="Delete">✕</button>
                      </td>
                    </tr>
                    {expanded.has(v.id) && (
                      <tr className="price-expand-row">
                        <td colSpan={9}>
                          <div className="price-expand-inner">
                            <table className="grade-price-table">
                              <thead>
                                <tr>
                                  <th>Grade</th>
                                  <th>Price ($/mt)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(prices).map(([g, p]) => (
                                  <tr key={g}>
                                    <td><code>{g}</code></td>
                                    <td>${Number(p).toLocaleString()}/mt</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="empty-row">No vendors found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? "Edit vendor" : "Add vendor"} onClose={() => { setShowModal(false); setNewGrade("M6"); setNewPrice(""); }}>
          <div className="form-grid">
            <div className="field-group">
              <label>Company name *</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Nippon Steel Corp"
              />
            </div>
            <div className="field-group">
              <label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                <option>Mill</option><option>Distributor</option><option>Broker</option>
              </select>
            </div>
            <div className="field-group">
              <label>Location</label>
              <input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Japan"
              />
            </div>
            <div className="field-group">
              <label>Grades of steel offered</label>
              <input
                value={form.grades_offered}
                onChange={e => setForm({ ...form, grades_offered: e.target.value })}
                placeholder="M6, M4, M3"
              />
            </div>
            <div className="field-group">
              <label>Available order qty (mt)</label>
              <input
                type="number"
                value={form.available_order_qty}
                onChange={e => setForm({ ...form, available_order_qty: e.target.value })}
                placeholder="5000"
              />
            </div>
            <div className="field-group">
              <label>Lead time</label>
              <input
                value={form.lead_time}
                onChange={e => setForm({ ...form, lead_time: e.target.value })}
                placeholder="4–6 weeks"
              />
            </div>
            <div className="field-group">
              <label>Contact name</label>
              <input
                value={form.contact_name}
                onChange={e => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Full name"
              />
            </div>
            <div className="field-group">
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="email@company.com"
              />
            </div>
            <div className="field-group">
              <label>Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+1 555 000 0000"
              />
            </div>
            <div className="field-group span-2">
              <label>Current Price by Grade</label>
              {Object.keys(form.grade_prices).length > 0 && (
                <div className="grade-price-list">
                  {Object.entries(form.grade_prices).map(([g, p]) => (
                    <div key={g} className="grade-price-row">
                      <code>{g}</code>
                      <span>${Number(p).toLocaleString()}/mt</span>
                      <button type="button" className="icon-btn danger" onClick={() => removeGradePrice(g)}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grade-price-add">
                <select value={newGrade} onChange={e => setNewGrade(e.target.value)}>
                  {STEEL_GRADES.map(g => <option key={g}>{g}</option>)}
                </select>
                <input
                  type="number"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  placeholder="Price $/mt"
                  onKeyDown={e => e.key === "Enter" && addGradePrice()}
                />
                <button type="button" className="btn-outline" onClick={addGradePrice}>+ Add</button>
              </div>
            </div>
            <div className="field-group span-2">
              <label>Offerings</label>
              <textarea
                value={form.offerings}
                onChange={e => setForm({ ...form, offerings: e.target.value })}
                rows={3}
                placeholder="Products, capabilities, notes..."
              />
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-outline" onClick={() => { setShowModal(false); setNewGrade("M6"); setNewPrice(""); }}>Cancel</button>
            <button className="btn-primary" onClick={save} disabled={saving || !form.name}>
              {saving ? "Saving..." : editId ? "Save changes" : "Add vendor"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
