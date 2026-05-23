import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";
import ProfilePanel from "./ProfilePanel";

const EMPTY = {
  name: "", industry: "Manufacturing", country: "", annual_spend: "",
  contact_name: "", email: "", phone: "", notes: "", status: "Active", rating: 3
};

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
]);
const toCountry = s => {
  if (!s) return "";
  if (US_STATES.has(s)) return "USA";
  if (s === "MX") return "Mexico";
  if (s === "ON") return "Canada";
  return s;
};
const toNote = (rep, grade, slit, ctl, steplap, unicore, tranco, state, comments) => {
  const parts = [];
  if (rep) parts.push(`Sales Rep: ${rep}`);
  if (grade) parts.push(`Grade: ${grade}`);
  const prods = [];
  if (typeof slit === "number" && slit) prods.push(`Slit Steel: ${slit} mt/yr`);
  else if (slit === "x") prods.push("Slit Steel");
  if (typeof ctl === "number" && ctl) prods.push(`CTL: ${ctl} mt/yr`);
  else if (ctl === "x") prods.push("CTL");
  if (steplap === "x") prods.push("Steplap");
  if (unicore === "x") prods.push("Unicore");
  if (tranco === "x") prods.push("Tranco");
  if (prods.length) parts.push(`Products: ${prods.join(", ")}`);
  if (US_STATES.has(state)) parts.push(`State: ${state}`);
  if (comments) parts.push(comments);
  return parts.join(" | ");
};

// [name, rep, slit, ctl, steplap, unicore, tranco, total, grade, state, comments, contact]
const SALES_LOG_DATA = [
  ["Cooper","",30000,null,null,null,null,30000,"23085","WI",null,null],
  ["AQ","JP",null,800,"x","x",null,800,"M6","VA",null,null],
  ["Olsun","JP",850,null,null,null,null,850,"23085","IN",null,null],
  ["Macro Magnetics","JP",null,135,"x",null,null,135,"M6","OH",null,null],
  ["NWL","DS",100,800,null,null,null,900,"M6","CT",null,null],
  ["Dongan","JR",150,null,null,null,null,150,"M6","OH",null,null],
  ["Hitachi","",35000,10000,null,null,null,45000,"23085","NC",null,null],
  ["Virginia (ID)","JP",null,215,"x","x",null,215,"M6","ID",null,null],
  ["Virginia (VA)","JP",8000,null,null,null,null,8000,"23085","VA",null,null],
  ["Virginia (GA)","JP",5000,5000,null,null,null,10000,"23085","GA",null,null],
  ["Virginia (MX)","JP",5000,null,null,null,null,5000,"23085","MX",null,null],
  ["Norlake","",125,200,null,null,null,325,"M6","OH",null,null],
  ["Federal Pacific","JR",2200,null,null,null,null,2200,"M4","MX",null,null],
  ["Pennsylvania","DS",2500,2500,"x",null,null,5000,"23085","PA",null,"Dennis Blake"],
  ["Hitran","JR",500,50,null,null,null,550,"M6","MX",null,null],
  ["Acutran","DS",null,100,null,null,null,100,"M6","OH",null,"Mike Grennek"],
  ["Hammond","S",12000,null,null,null,null,12000,"27100","Canada",null,null],
  ["Control Txfr","S",450,100,null,null,null,550,"M6","OH",null,null],
  ["Niagara","",500,1000,null,null,null,1500,"23085","NY",null,null],
  ["Rex","JP",5500,null,null,null,null,5500,"27100","ON",null,null],
  ["Dyna Power","DS",100,null,null,null,null,100,"M6","VT",null,"Matt Thomas"],
  ["Controlled Power","DS",null,100,null,null,null,100,"M6","OH",null,null],
  ["Custom Materials","DS",null,100,null,null,null,100,"M6","OH",null,null],
  ["HiPotronics","DS",null,100,null,null,null,100,"M4","NY",null,null],
  ["Power Magnetics","JP",75,60,null,null,null,135,"M6","NJ",null,null],
  ["Specialty Magnetics","S",130,5,null,null,null,135,"M6","OH",null,null],
  ["Magnetic Specialty","JP",400,100,null,null,null,500,"M6","PA",null,null],
  ["Howard","",36000,null,null,null,null,36000,"23085","MS",null,null],
  ["Ermco","",60000,null,null,null,null,72500,"23085","MS","12,500 DG outsource",null],
  ["Carte","S",6200,null,null,null,null,6200,"23085","Canada",null,null],
  ["Inductotherm","DS",550,null,null,null,null,550,"M6","NJ",null,"Tom Young"],
  ["JVC","DS",null,100,null,null,null,100,"M6","Canada",null,"Nitin"],
  ["Mirus","S",null,270,null,null,null,270,"M6","Canada",null,null],
  ["Electric Power","DS",null,100,null,null,null,100,"M6","Canada",null,"Nassim"],
  ["TransTec","S",null,50,null,null,null,50,"M6","Canada",null,null],
  ["Phenix","DS",50,null,null,null,null,50,"M12","NJ",null,null],
  ["Toroid of Maryland","S",110,null,null,null,null,110,"M4","MD",null,null],
  ["Schneider","",5800,null,null,null,null,5800,"27100","MX",null,null],
  ["Stein","DS",null,400,null,null,null,400,"M6","Canada",null,"Jeff Kilbourn"],
  ["AFP","DS",null,200,null,null,null,200,"M6","NJ",null,"Dermot Mcleer"],
  ["Elesco","DS",null,200,null,null,null,200,"M6","PA",null,"Alan"],
  ["Bridgeport","S","x",null,null,null,null,null,null,"CT",null,null],
  ["Kinetics","S","x",null,null,null,null,null,null,"SC",null,null],
  ["Electron Coil","DS","x",null,null,null,null,null,null,"NJ",null,null],
  ["WR","DS",null,null,null,null,null,null,null,"Canada",null,null],
  ["WEG","",null,null,null,null,null,null,null,"MI",null,null],
  ["Miramac","",null,null,null,null,null,null,null,"MI",null,null],
  ["Noratel","S","x","x",null,null,null,null,null,"Sweden",null,null],
  ["Itec","S",null,null,null,"x",null,null,null,"NC",null,null],
  ["Ritz","S",null,null,null,"x",null,null,null,"SC",null,null],
  ["Ajax Taco","JP","x","x",null,null,null,null,null,"OH",null,null],
  ["Fab Tek","JP",null,"x",null,null,null,null,null,"MS",null,null],
  ["Nix","JP",null,null,null,"x","x",null,null,"TX",null,null],
  ["Pemco","JP",null,"x","x",null,null,null,null,"WV",null,null],
];

const RANK = r => r >= 4.5 ? "A" : r >= 3.5 ? "B" : r >= 2.5 ? "C" : "D";
const RANK_CLASS = r => ({ A: "rank-a", B: "rank-b", C: "rank-c", D: "rank-d" })[RANK(r)];
const fmt = n => n ? Number(n).toLocaleString() + " mt/yr" : "—";

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
  const [importing, setImporting] = useState(false);

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

  async function importSalesLog() {
    if (!confirm(`Import ${SALES_LOG_DATA.length} customers from the PSS Sales Log? This will add them to the existing list.`)) return;
    setImporting(true);
    const records = SALES_LOG_DATA.map(([name, rep, slit, ctl, steplap, unicore, tranco, total, grade, state, comments, contact]) => ({
      name,
      industry: "Manufacturing",
      country: toCountry(state),
      annual_spend: typeof total === "number" ? total : null,
      contact_name: contact || "",
      email: "",
      phone: "",
      notes: toNote(rep, grade, slit, ctl, steplap, unicore, tranco, state, comments),
      status: typeof total === "number" ? "Active" : "Prospect",
      rating: 3,
    }));
    const { error } = await supabase.from("customers").insert(records);
    setImporting(false);
    if (error) { alert("Import failed: " + error.message); return; }
    fetchCustomers();
  }

  async function exportCSV() {
    const rows = customers.map(c =>
      [c.name, c.industry, c.country, c.annual_spend, c.rating, RANK(c.rating), c.status, c.contact_name, c.email].join(",")
    );
    const csv = ["Name,Industry,Country,Volume (mt/yr),Rating,Rank,Status,Contact,Email", ...rows].join("\n");
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
          <button className="btn-outline" onClick={importSalesLog} disabled={importing}>{importing ? "Importing..." : "↑ Import Sales Log"}</button>
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
                <th>Customer</th><th>Industry</th><th>Country</th><th>Volume (mt/yr)</th>
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
              <label>Volume (mt/yr)</label>
              <input type="number" value={form.annual_spend} onChange={e => setForm({ ...form, annual_spend: e.target.value })} placeholder="1000" />
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
