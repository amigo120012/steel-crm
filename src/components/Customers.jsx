import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import Modal from "./Modal";
import ProfilePanel from "./ProfilePanel";

const STEEL_GRADES = ["M6", "M4", "M3", "Other"];

const EMPTY = {
  name: "", location: "", grade_desired: "M6",
  order_qty_yr: "", target_margin_pct: "",
  contact_name: "", email: "", phone: "",
  core_details: ""
};

const US_STATES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY"
]);
const toCountry = s => {
  if (!s) return "";
  if (US_STATES.has(s)) return `${s}, USA`;
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

const mapGrade = g => {
  if (!g) return "M6";
  if (["M6", "M4", "M3"].includes(g)) return g;
  return "Other";
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

const truncate = (s, n = 60) => s && s.length > n ? s.slice(0, n) + "…" : (s || "—");

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [importing, setImporting] = useState(false);
  const [sort, setSort] = useState({ col: null, dir: "asc" });

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await supabase.from("customers").select("*").order("name");
    setCustomers(data || []);
    setLoading(false);
  }

  async function save() {
    setSaving(true);
    const payload = {
      ...form,
      order_qty_yr: form.order_qty_yr ? Number(form.order_qty_yr) : null,
      target_margin_pct: form.target_margin_pct ? Number(form.target_margin_pct) : null,
    };
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
    setForm({
      name: c.name || "", location: c.location || "",
      grade_desired: c.grade_desired || "M6",
      order_qty_yr: c.order_qty_yr || "",
      target_margin_pct: c.target_margin_pct || "",
      contact_name: c.contact_name || "", email: c.email || "",
      phone: c.phone || "", core_details: c.core_details || ""
    });
    setEditId(c.id);
    setShowModal(true);
  }

  async function importSalesLog() {
    if (!confirm(`Import ${SALES_LOG_DATA.length} customers from the PSS Sales Log? This will add them to the existing list.`)) return;
    setImporting(true);
    const records = SALES_LOG_DATA.map(([name, rep, slit, ctl, steplap, unicore, tranco, total, grade, state, comments, contact]) => ({
      name,
      location: toCountry(state),
      grade_desired: mapGrade(grade),
      order_qty_yr: typeof total === "number" ? total : null,
      target_margin_pct: null,
      contact_name: contact || "",
      email: "",
      phone: "",
      core_details: toNote(rep, grade, slit, ctl, steplap, unicore, tranco, state, comments),
    }));
    const { error } = await supabase.from("customers").insert(records);
    setImporting(false);
    if (error) { alert("Import failed: " + error.message); return; }
    fetchCustomers();
  }

  async function exportCSV() {
    const rows = customers.map(c =>
      [c.name, c.location, c.grade_desired, c.order_qty_yr, c.target_margin_pct, c.contact_name, c.email].join(",")
    );
    const csv = ["Name,Location,Grade Desired,Order Qty/Yr,Target Margin %,Contact,Email", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "customers.csv";
    a.click();
  }

  function toggleSort(col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  }

  const sortIcon = col => {
    if (sort.col !== col) return <span className="sort-arrow">↕</span>;
    return <span className="sort-arrow active">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  };

  let filtered = customers.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name?.toLowerCase().includes(q) ||
      c.location?.toLowerCase().includes(q) ||
      c.grade_desired?.toLowerCase().includes(q) ||
      c.core_details?.toLowerCase().includes(q);
    const matchGrade = !gradeFilter || c.grade_desired === gradeFilter;
    return matchSearch && matchGrade;
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
        entity={selected} type="customer"
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
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} customers in database</p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={exportCSV}>↓ Export CSV</button>
          <button className="btn-outline" onClick={importSalesLog} disabled={importing}>
            {importing ? "Importing..." : "↑ Import Sales Log"}
          </button>
          <button className="btn-primary" onClick={() => { setForm(EMPTY); setEditId(null); setShowModal(true); }}>
            + Add customer
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          className="search-input"
          placeholder="Search customers..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}>
          <option value="">All grades</option>
          {STEEL_GRADES.map(g => <option key={g}>{g}</option>)}
        </select>
      </div>

      {loading ? <div className="loading-inline">Loading...</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("name")}>Customer {sortIcon("name")}</th>
                <th className="sortable" onClick={() => toggleSort("location")}>Location {sortIcon("location")}</th>
                <th className="sortable" onClick={() => toggleSort("grade_desired")}>Grade Desired {sortIcon("grade_desired")}</th>
                <th className="sortable" onClick={() => toggleSort("order_qty_yr")}>Order Qty/Yr {sortIcon("order_qty_yr")}</th>
                <th className="sortable" onClick={() => toggleSort("target_margin_pct")}>Target Margin % {sortIcon("target_margin_pct")}</th>
                <th>Core Details</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} onClick={() => setSelected(c)} style={{ cursor: "pointer" }}>
                  <td><strong>{c.name}</strong></td>
                  <td>{c.location || "—"}</td>
                  <td><code>{c.grade_desired || "—"}</code></td>
                  <td>{c.order_qty_yr ? Number(c.order_qty_yr).toLocaleString() + " mt/yr" : "—"}</td>
                  <td>{c.target_margin_pct != null && c.target_margin_pct !== "" ? c.target_margin_pct + "%" : "—"}</td>
                  <td style={{ maxWidth: 220 }}><span className="cell-truncate">{truncate(c.core_details)}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => openEdit(c)} title="Edit">✎</button>
                    <button className="icon-btn danger" onClick={() => remove(c.id)} title="Delete">✕</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="empty-row">No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <Modal title={editId ? "Edit customer" : "Add customer"} onClose={() => setShowModal(false)}>
          <div className="form-grid">
            <div className="field-group">
              <label>Company name *</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Siemens Energy AG"
              />
            </div>
            <div className="field-group">
              <label>Location</label>
              <input
                value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Ohio, USA"
              />
            </div>
            <div className="field-group">
              <label>Grade of steels desired</label>
              <select value={form.grade_desired} onChange={e => setForm({ ...form, grade_desired: e.target.value })}>
                {STEEL_GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Order Qty / Yr (mt/yr)</label>
              <input
                type="number"
                value={form.order_qty_yr}
                onChange={e => setForm({ ...form, order_qty_yr: e.target.value })}
                placeholder="1000"
              />
            </div>
            <div className="field-group">
              <label>Target Margin %</label>
              <input
                type="number"
                step="0.1"
                value={form.target_margin_pct}
                onChange={e => setForm({ ...form, target_margin_pct: e.target.value })}
                placeholder="12.5"
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
              <label>Core Details</label>
              <textarea
                value={form.core_details}
                onChange={e => setForm({ ...form, core_details: e.target.value })}
                rows={4}
                placeholder="Requirements, specifications, relationship notes..."
              />
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
