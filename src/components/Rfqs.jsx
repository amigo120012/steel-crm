import { useState, useEffect, Fragment } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { fmtCurrency } from "../lib/pricing";

// Employee-only view of the RFQs submitted through the public form.
// Behind the same auth as every other Dashboard tab — see App.jsx.
//
// Reads quote_requests joined to the customer the submission was matched to
// (see submit_quote_request in supabase/quote_requests.sql), and loads the
// line items lazily when a row is expanded, so the list stays one query.

const fmt$ = n => "$" + Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUSES = ["new", "quoted", "won", "lost"];

export default function Rfqs() {
  const [rfqs, setRfqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState({ col: "created_at", dir: "desc" });
  const [expanded, setExpanded] = useState(null);      // rfq id
  const [lineItems, setLineItems] = useState({});      // { [rfqId]: rows }

  useEffect(() => { fetchRfqs(); }, []);

  async function fetchRfqs() {
    setLoading(true);
    const { data, error } = await supabase
      .from("quote_requests")
      .select("*, customers(name)")
      .order("created_at", { ascending: false });
    if (error) console.error("failed to load RFQs:", error);
    setRfqs(data || []);
    setLoading(false);
  }

  async function toggleExpand(id) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!lineItems[id]) {
      const { data } = await supabase
        .from("quote_request_line_items")
        .select("*")
        .eq("quote_request_id", id);
      setLineItems(prev => ({ ...prev, [id]: data || [] }));
    }
  }

  async function updateStatus(id, status) {
    setRfqs(rs => rs.map(r => (r.id === id ? { ...r, status } : r)));
    const { error } = await supabase.from("quote_requests").update({ status }).eq("id", id);
    if (error) { alert("Couldn't update status: " + error.message); fetchRfqs(); }
  }

  function toggleSort(col) {
    setSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }));
  }
  const sortIcon = col => (sort.col !== col ? "" : sort.dir === "asc" ? "▲" : "▼");

  let filtered = rfqs.filter(r => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const hay = [r.requester_name, r.requester_company, r.customers?.name, r.nationality, r.status]
      .join(" ").toLowerCase();
    return hay.includes(search.trim().toLowerCase());
  });

  if (sort.col) {
    const dir = sort.dir === "asc" ? 1 : -1;
    filtered = filtered.slice().sort((a, b) => {
      let av = a[sort.col], bv = b[sort.col];
      if (sort.col === "customer") { av = a.customers?.name; bv = b.customers?.name; }
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function exportExcel() {
    const rows = filtered.map(r => ({
      Submitted: new Date(r.created_at).toLocaleString(),
      Requester: r.requester_name || "",
      Company: r.requester_company || "",
      "Matched Customer": r.customers?.name || "",
      Nationality: r.nationality || "",
      Status: r.status || "",
      Total: Number(r.total ?? 0).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RFQs");
    XLSX.writeFile(wb, "rfqs.xlsx");
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>RFQs</h1>
          <p className="page-sub">
            {rfqs.length} request{rfqs.length === 1 ? "" : "s"} submitted through the public form
          </p>
        </div>
        <div className="header-actions">
          <button className="btn-outline" onClick={fetchRfqs}>↻ Refresh</button>
          <button className="btn-outline" onClick={exportExcel} disabled={filtered.length === 0}>
            ↓ Export Excel
          </button>
        </div>
      </div>

      <div className="filters">
        <input
          className="search-input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search requester, company, nationality..."
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th></th>
                <th className="sortable" onClick={() => toggleSort("created_at")}>Submitted {sortIcon("created_at")}</th>
                <th className="sortable" onClick={() => toggleSort("requester_name")}>Requester {sortIcon("requester_name")}</th>
                <th className="sortable" onClick={() => toggleSort("requester_company")}>Company {sortIcon("requester_company")}</th>
                <th className="sortable" onClick={() => toggleSort("customer")}>Matched customer {sortIcon("customer")}</th>
                <th className="sortable" onClick={() => toggleSort("nationality")}>Nationality {sortIcon("nationality")}</th>
                <th className="sortable" onClick={() => toggleSort("total")}>Total {sortIcon("total")}</th>
                <th className="sortable" onClick={() => toggleSort("status")}>Status {sortIcon("status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <Fragment key={r.id}>
                  <tr className="rfq-row" onClick={() => toggleExpand(r.id)}>
                    <td className="expand-cell">{expanded === r.id ? "▾" : "▸"}</td>
                    <td>{new Date(r.created_at).toLocaleString()}</td>
                    <td>{r.requester_name}</td>
                    <td>{r.requester_company}</td>
                    <td>
                      {r.customers?.name
                        ? <span className="badge badge-green">{r.customers.name}</span>
                        : <span className="badge badge-gray">unlinked</span>}
                    </td>
                    <td>{r.nationality || "—"}</td>
                    <td><strong>{fmt$(r.total)}</strong></td>
                    <td onClick={e => e.stopPropagation()}>
                      <select
                        className="status-select"
                        value={r.status}
                        onChange={e => updateStatus(r.id, e.target.value)}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="rfq-detail-row">
                      <td colSpan={8}>
                        {!lineItems[r.id] ? (
                          <div className="loading-inline">Loading items...</div>
                        ) : (
                          <table className="range-table">
                            <thead>
                              <tr>
                                <th>Grade</th><th>Width</th><th>Quantity (lbs)</th>
                                <th>Unit price</th><th>Line total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineItems[r.id].map(li => (
                                <tr key={li.id}>
                                  <td><code>{li.grade}</code></td>
                                  <td>{li.width == null ? "—" : `${Number(li.width).toFixed(1)}"`}</td>
                                  <td>{Number(li.quantity).toLocaleString()}</td>
                                  <td>{fmtCurrency(li.unit_price)}</td>
                                  <td><strong>{fmt$(li.line_total)}</strong></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="empty-row">No RFQs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
