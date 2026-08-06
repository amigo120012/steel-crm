import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import {
  GRADES,
  findPricingGrade,
  hasBasePrice,
  finalSellingPrice,
  marginPerLb,
} from "../lib/pricing";

const fmt$ = n => "$" + Number(n).toFixed(4);
const fmtAdj = n => (Number(n) >= 0 ? "+$" + Number(n).toFixed(4) : "-$" + Math.abs(Number(n)).toFixed(4));

// Parses the "Pricing" sheet of an uploaded spreadsheet into one row per
// Grade. Cost/lb and Selling Price/lb do not vary by width in the source
// data (confirmed: every width row for a grade carries the same value), so
// the Width column is read but otherwise ignored — we just take the first
// non-null cost/price seen for each grade. A grade with no cost/price rows
// at all keeps both fields null ("no cost set") instead of being skipped
// or defaulted to 0.
// Kept in sync with the column names scripts/import-pricing.js expects.
async function parsePricingWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Pricing"];
  if (!sheet) {
    throw new Error(`Sheet "Pricing" not found (sheets in file: ${wb.SheetNames.join(", ")})`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const round4 = n => (n == null || n === "" ? null : Math.round(Number(n) * 10000) / 10000);

  const byGrade = new Map();
  for (const row of rows) {
    const grade = row["Grade"];
    if (!grade) continue;
    const g = String(grade).trim();
    const cost = round4(row["Cost/lb ($)"]);
    const price = round4(row["Selling Price/lb ($)"]);
    if (!byGrade.has(g)) byGrade.set(g, { cost: null, price: null });
    const entry = byGrade.get(g);
    if (entry.cost == null && cost != null) entry.cost = cost;
    if (entry.price == null && price != null) entry.price = price;
  }

  return [...byGrade.entries()].map(([grade, v]) => ({
    grade,
    base_cost_per_lb: v.cost,
    base_selling_price_per_lb: v.price,
    updated_at: new Date().toISOString(),
  }));
}

export default function Pricing() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // { id, value }
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchGrades(); }, []);

  async function fetchGrades() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from("pricing_grades").select("*");
    if (error) setError(error.message);
    setRows(data || []);
    setLoading(false);
  }

  function startEdit(e, id, value) {
    e.stopPropagation();
    setEditing({ id, value: value ?? "" });
  }

  async function saveInline() {
    if (!editing) return;
    const { id, value } = editing;
    const adjustment = value !== "" ? Number(value) : 0;
    setEditing(null);
    setRows(rs => rs.map(r => (r.id === id ? { ...r, adjustment_per_lb: adjustment } : r)));
    const { error } = await supabase
      .from("pricing_grades")
      .update({ adjustment_per_lb: adjustment, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) alert("Failed to save adjustment: " + error.message);
  }

  function handleInlineKey(e) {
    if (e.key === "Enter") { e.preventDefault(); saveInline(); }
    if (e.key === "Escape") setEditing(null);
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    let parsed;
    try {
      parsed = await parsePricingWorkbook(file);
    } catch (err) {
      alert("Couldn't read that file: " + err.message);
      return;
    }
    if (parsed.length === 0) {
      alert('No usable rows found. Expected a "Pricing" sheet with Grade, Cost/lb ($), Selling Price/lb ($) columns.');
      return;
    }

    const missing = parsed.filter(p => p.base_cost_per_lb == null || p.base_selling_price_per_lb == null);
    const ok = confirm(
      `Import ${parsed.length} grade(s) from "${file.name}"?\n\n` +
      `${parsed.length - missing.length} grade(s) have both cost + price set, ${missing.length} have no cost set ` +
      `(kept as "no cost set", not $0).\n\n` +
      `This overwrites Base Cost/lb and Base Selling Price/lb for matching grades. Adjustments already entered are not touched.`
    );
    if (!ok) return;

    setImporting(true);
    const { error } = await supabase.from("pricing_grades").upsert(parsed, { onConflict: "grade" });
    setImporting(false);
    if (error) { alert("Import failed: " + error.message); return; }

    await fetchGrades();
    alert(`Imported ${parsed.length} grade(s).`);
  }

  // One row per known grade — grades not yet imported render as "no cost set".
  const gradeRows = GRADES.map(grade =>
    findPricingGrade(rows, grade) || { grade, base_cost_per_lb: null, base_selling_price_per_lb: null, adjustment_per_lb: 0, id: null }
  );
  const pricedCount = gradeRows.filter(hasBasePrice).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Pricing</h1>
          <p className="page-sub">{pricedCount}/{GRADES.length} grades priced</p>
        </div>
        <div className="header-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleImportFile}
          />
          <button className="btn-outline" onClick={triggerImport} disabled={importing}>
            {importing ? "Importing..." : "↑ Upload Pricing Sheet"}
          </button>
        </div>
      </div>

      {error && (
        <div className="issues-banner" style={{ margin: "0 0 16px" }}>
          ⚠ Couldn't load pricing: {error}. Make sure the pricing_grades table has been created
          (run supabase/pricing_and_quotes.sql in the Supabase SQL editor), then reload this tab.
        </div>
      )}

      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Grade</th>
                <th>Base Cost/lb</th>
                <th>Base Selling Price/lb</th>
                <th>Adjustment ($/lb)</th>
                <th>Final Selling Price/lb</th>
                <th>Margin/lb</th>
              </tr>
            </thead>
            <tbody>
              {gradeRows.map(r => {
                const priced = hasBasePrice(r);
                const finalPrice = finalSellingPrice(r);
                const margin = marginPerLb(r);
                return (
                  <tr key={r.grade}>
                    <td><code>{r.grade}</code></td>
                    {priced ? (
                      <>
                        <td>{fmt$(r.base_cost_per_lb)}</td>
                        <td>{fmt$(r.base_selling_price_per_lb)}</td>
                        <td
                          className="editable-cell"
                          onClick={e => startEdit(e, r.id, r.adjustment_per_lb)}
                          title="Click to edit"
                        >
                          {editing?.id === r.id ? (
                            <input
                              className="inline-input"
                              type="number" step="0.0001"
                              autoFocus
                              value={editing.value}
                              onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
                              onBlur={saveInline}
                              onKeyDown={handleInlineKey}
                            />
                          ) : (
                            <span>{fmtAdj(r.adjustment_per_lb)}</span>
                          )}
                        </td>
                        <td><strong>{fmt$(finalPrice)}</strong></td>
                        <td>
                          <span className={margin >= 0 ? "" : "margin-negative"}>{fmt$(margin)}</span>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="placeholder-text">no cost set</td>
                        <td className="placeholder-text">no cost set</td>
                        <td className="placeholder-text">—</td>
                        <td className="placeholder-text">—</td>
                        <td className="placeholder-text">—</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
