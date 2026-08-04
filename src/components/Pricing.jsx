import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { GRADES, SPAN_MIN, SPAN_MAX, validateGradeRanges } from "../lib/pricing";

const NUMERIC_COLS = new Set(["width_min", "width_max", "cost_per_lb", "selling_price_per_lb"]);
const fmt$ = n => "$" + Number(n ?? 0).toFixed(4);

export default function Pricing() {
  const [ranges, setRanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { id, col, value }
  const [collapsed, setCollapsed] = useState(new Set());

  useEffect(() => { fetchRanges(); }, []);

  async function fetchRanges() {
    setLoading(true);
    const { data } = await supabase.from("pricing_ranges").select("*").order("grade").order("width_min");
    setRanges(data || []);
    setLoading(false);
  }

  async function addRange(grade) {
    const gradeRanges = ranges.filter(r => r.grade === grade).sort((a, b) => a.width_min - b.width_min);
    const last = gradeRanges[gradeRanges.length - 1];
    const nextMin = last ? Math.min(Math.round((Number(last.width_max) + 0.1) * 10) / 10, SPAN_MAX) : SPAN_MIN;
    const payload = { grade, width_min: nextMin, width_max: SPAN_MAX, cost_per_lb: 0, selling_price_per_lb: 0 };
    const { data, error } = await supabase.from("pricing_ranges").insert(payload).select().single();
    if (error) { alert("Failed to add range: " + error.message); return; }
    setRanges(rs => [...rs, data]);
  }

  async function removeRange(id) {
    if (!confirm("Delete this width range?")) return;
    await supabase.from("pricing_ranges").delete().eq("id", id);
    setRanges(rs => rs.filter(r => r.id !== id));
  }

  function startEdit(e, id, col, value) {
    e.stopPropagation();
    setEditing({ id, col, value: value ?? "" });
  }

  async function saveInline() {
    if (!editing) return;
    const { id, col, value } = editing;
    const dbValue = NUMERIC_COLS.has(col) ? (value !== "" ? Number(value) : 0) : value;
    setEditing(null);
    setRanges(rs => rs.map(r => (r.id === id ? { ...r, [col]: dbValue } : r)));
    await supabase.from("pricing_ranges").update({ [col]: dbValue }).eq("id", id);
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

  const grouped = GRADES.map(grade => {
    const gradeRanges = ranges.filter(r => r.grade === grade).sort((a, b) => a.width_min - b.width_min);
    return { grade, ranges: gradeRanges, validation: validateGradeRanges(gradeRanges) };
  });

  const totalRanges = ranges.length;
  const completeGrades = grouped.filter(g => g.validation.complete).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Pricing</h1>
          <p className="page-sub">
            {totalRanges} width range{totalRanges !== 1 ? "s" : ""} across {GRADES.length} grades ·{" "}
            {completeGrades}/{GRADES.length} grades fully covered ({SPAN_MIN.toFixed(1)}"–{SPAN_MAX.toFixed(1)}")
          </p>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <div className="grade-sections">
          {grouped.map(({ grade, ranges: gradeRanges, validation }) => {
            const isCollapsed = collapsed.has(grade);
            return (
              <div className="grade-section" key={grade}>
                <div className="grade-section-header" onClick={() => toggleCollapsed(grade)}>
                  <div className="grade-section-title">
                    <span className="collapse-arrow">{isCollapsed ? "▸" : "▾"}</span>
                    <code>{grade}</code>
                    {gradeRanges.length === 0 ? (
                      <span className="badge badge-gray">No ranges set</span>
                    ) : validation.complete ? (
                      <span className="badge badge-green">✓ {SPAN_MIN.toFixed(1)}"–{SPAN_MAX.toFixed(1)}" covered</span>
                    ) : (
                      <span className="badge badge-orange">⚠ {validation.issues.length} issue{validation.issues.length !== 1 ? "s" : ""}</span>
                    )}
                    <span className="page-sub" style={{ marginTop: 0 }}>
                      {gradeRanges.length} range{gradeRanges.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    className="btn-outline"
                    onClick={e => { e.stopPropagation(); addRange(grade); }}
                  >
                    + Add range
                  </button>
                </div>

                {!isCollapsed && (
                  <>
                    {validation.issues.length > 0 && (
                      <div className="issues-banner">
                        {validation.issues.map((issue, i) => <div key={i}>⚠ {issue}</div>)}
                      </div>
                    )}

                    {gradeRanges.length > 0 && (
                      <table className="range-table">
                        <thead>
                          <tr>
                            <th>Width min (in)</th>
                            <th>Width max (in)</th>
                            <th>Cost / lb</th>
                            <th>Selling price / lb</th>
                            <th>Margin / lb</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {gradeRanges.map(r => {
                            const margin = Number(r.selling_price_per_lb ?? 0) - Number(r.cost_per_lb ?? 0);
                            return (
                              <tr key={r.id}>
                                {["width_min", "width_max"].map(col => (
                                  <td
                                    key={col}
                                    className="editable-cell"
                                    onClick={e => startEdit(e, r.id, col, r[col])}
                                    title="Click to edit"
                                  >
                                    {editing?.id === r.id && editing?.col === col ? (
                                      <input
                                        className="inline-input"
                                        type="number" step="0.1" min={SPAN_MIN} max={SPAN_MAX}
                                        autoFocus
                                        value={editing.value}
                                        onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
                                        onBlur={saveInline}
                                        onKeyDown={handleInlineKey}
                                      />
                                    ) : (
                                      <span>{Number(r[col]).toFixed(1)}"</span>
                                    )}
                                  </td>
                                ))}
                                {["cost_per_lb", "selling_price_per_lb"].map(col => (
                                  <td
                                    key={col}
                                    className="editable-cell"
                                    onClick={e => startEdit(e, r.id, col, r[col])}
                                    title="Click to edit"
                                  >
                                    {editing?.id === r.id && editing?.col === col ? (
                                      <input
                                        className="inline-input"
                                        type="number" step="0.0001" min="0"
                                        autoFocus
                                        value={editing.value}
                                        onChange={e => setEditing(ed => ({ ...ed, value: e.target.value }))}
                                        onBlur={saveInline}
                                        onKeyDown={handleInlineKey}
                                      />
                                    ) : (
                                      <span>{fmt$(r[col])}</span>
                                    )}
                                  </td>
                                ))}
                                <td>
                                  <span className={margin >= 0 ? "" : "margin-negative"}>{fmt$(margin)}</span>
                                </td>
                                <td>
                                  <button className="icon-btn danger" onClick={() => removeRange(r.id)} title="Delete range">✕</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
