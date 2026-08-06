import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import {
  GRADES,
  WIDTHS,
  findPricingPoint,
  hasBasePrice,
  finalSellingPrice,
  marginPerLb,
  gradeCoverage,
} from "../lib/pricing";

const fmt$ = n => "$" + Number(n).toFixed(4);
const fmtAdj = n => (Number(n) >= 0 ? "+$" + Number(n).toFixed(4) : "-$" + Math.abs(Number(n)).toFixed(4));

// Parses the "Pricing" sheet of an uploaded spreadsheet into one row per
// (grade, width) cell. Rows with a blank cost or price keep those fields
// null ("no cost set") instead of being skipped or defaulted to 0.
// Kept in sync with the column names scripts/import-pricing.js expects.
async function parsePricingWorkbook(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets["Pricing"];
  if (!sheet) {
    throw new Error(`Sheet "Pricing" not found (sheets in file: ${wb.SheetNames.join(", ")})`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const round4 = n => (n == null ? null : Math.round(Number(n) * 10000) / 10000);

  const points = [];
  for (const row of rows) {
    const grade = row["Grade"];
    const width = row["Width (in)"];
    if (!grade || width == null) continue;
    points.push({
      grade: String(grade).trim(),
      width: Math.round(Number(width) * 10) / 10,
      base_cost_per_lb: round4(row["Cost/lb ($)"]),
      base_selling_price_per_lb: round4(row["Selling Price/lb ($)"]),
      updated_at: new Date().toISOString(),
    });
  }
  return points;
}

export default function Pricing() {
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, value }
  const [collapsed, setCollapsed] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => { fetchPoints(); }, []);

  async function fetchPoints() {
    setLoading(true);
    const { data } = await supabase.from("pricing_points").select("*").order("grade").order("width");
    setPoints(data || []);
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
    setPoints(ps => ps.map(p => (p.id === id ? { ...p, adjustment_per_lb: adjustment } : p)));
    await supabase.from("pricing_points").update({ adjustment_per_lb: adjustment, updated_at: new Date().toISOString() }).eq("id", id);
  }

  function handleInlineKey(e) {
    if (e.key === "Enter") { e.preventDefault(); saveInline(); }
    if (e.key === "Escape") setEditing(null);
  }

  function toggleCollapsed(grade) {
    setCollapsed(s => {
      const ns = new Set(s);
      ns.has(grade) ? ns.delete(grade) : ns.add(grade);
      return ns;
    });
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
      alert('No usable rows found. Expected a "Pricing" sheet with Grade, Width (in), Cost/lb ($), Selling Price/lb ($) columns.');
      return;
    }

    const missing = parsed.filter(p => p.base_cost_per_lb == null || p.base_selling_price_per_lb == null);
    const ok = confirm(
      `Import ${parsed.length} grade/width row(s) from "${file.name}"?\n\n` +
      `${parsed.length - missing.length} row(s) have both cost + price set, ${missing.length} have no cost set ` +
      `(kept as "no cost set", not $0).\n\n` +
      `This overwrites Base Cost/lb and Base Selling Price/lb for matching Grade + Width. Adjustments already entered are not touched.`
    );
    if (!ok) return;

    setImporting(true);
    const { error } = await supabase.from("pricing_points").upsert(parsed, { onConflict: "grade,width" });
    setImporting(false);
    if (error) { alert("Import failed: " + error.message); return; }

    await fetchPoints();
    alert(`Imported ${parsed.length} row(s).`);
  }

  // Build the full Grade x Width matrix — cells not yet imported render as
  // "no cost set" rather than being omitted.
  const grouped = GRADES.map(grade => {
    const rows = WIDTHS.map(width => findPricingPoint(points, grade, width) || { grade, width, base_cost_per_lb: null, base_selling_price_per_lb: null, adjustment_per_lb: 0, id: null });
    return { grade, rows, coverage: gradeCoverage(points, grade) };
  });

  const totalCells = GRADES.length * WIDTHS.length;
  const pricedCells = points.filter(hasBasePrice).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Pricing</h1>
          <p className="page-sub">
            {pricedCells}/{totalCells} grade × width cells priced across {GRADES.length} grades ({WIDTHS[0].toFixed(1)}"–{WIDTHS[WIDTHS.length - 1].toFixed(1)}")
          </p>
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
            {importing ? "Importing..." : "↑ Import base pricing"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <div className="grade-sections">
          {grouped.map(({ grade, rows, coverage }) => {
            const isCollapsed = collapsed.has(grade);
            return (
              <div className="grade-section" key={grade}>
                <div className="grade-section-header" onClick={() => toggleCollapsed(grade)}>
                  <div className="grade-section-title">
                    <span className="collapse-arrow">{isCollapsed ? "▸" : "▾"}</span>
                    <code>{grade}</code>
                    {coverage.priced === 0 ? (
                      <span className="badge badge-gray">No base cost set</span>
                    ) : coverage.priced === coverage.total ? (
                      <span className="badge badge-green">✓ all {coverage.total} widths priced</span>
                    ) : (
                      <span className="badge badge-orange">{coverage.priced}/{coverage.total} widths priced</span>
                    )}
                  </div>
                </div>

                {!isCollapsed && (
                  <table className="range-table">
                    <thead>
                      <tr>
                        <th>Width (in)</th>
                        <th>Base Cost/lb</th>
                        <th>Base Selling Price/lb</th>
                        <th>Adjustment ($/lb)</th>
                        <th>Final Selling Price/lb</th>
                        <th>Margin/lb</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => {
                        const priced = hasBasePrice(r);
                        const finalPrice = finalSellingPrice(r);
                        const margin = marginPerLb(r);
                        const rowKey = `${r.grade}-${r.width}`;
                        return (
                          <tr key={rowKey}>
                            <td>{Number(r.width).toFixed(1)}"</td>
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
