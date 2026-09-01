import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { GRADES, fmtCurrency } from "../lib/pricing";
import logo from "../assets/logo.png";

// The customer-facing Order/RFQ page. Rendered standalone and unauthenticated
// at / and /order (see App.jsx); also reachable as a tab inside the internal
// CRM, which is the only difference `publicMode` controls.
//
// Pricing comes from the pricing_public view — grade + final selling price
// only. It deliberately never reads pricing_grades, so base cost, the per-lb
// adjustment and margin stay behind that table's authenticated-only RLS and
// are never shipped to a customer's browser.
//
// Submissions go through submit_quote_request(), a SECURITY DEFINER function
// (see supabase/quote_requests.sql) that re-prices every line server-side.
// Nothing here writes to customers, quotes or quote_line_items directly.

const fmt$ = n => "$" + Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let tempIdCounter = 0;
const nextTempId = () => `tmp-${++tempIdCounter}`;

export default function QuoteCalculator({ publicMode = false }) {
  const [gradePricing, setGradePricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [cart, setCart] = useState([]);
  const [requesterName, setRequesterName] = useState("");
  const [requesterCompany, setRequesterCompany] = useState("");
  const [pickerGrade, setPickerGrade] = useState("");
  const [pickerWidth, setPickerWidth] = useState("");
  const [pickerQty, setPickerQty] = useState("");
  const [editingQty, setEditingQty] = useState(null); // { tempId, value }
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null); // { id, requester, lineItems, total, createdAt }

  useEffect(() => { fetchPricing(); }, []);

  async function fetchPricing() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("pricing_public").select("*");
    if (error) { setLoadError(error.message); setLoading(false); return; }
    // Sort by the canonical grade order (M45 → M2), not alphabetically —
    // "M12" would otherwise sort ahead of "M3".
    const rows = (data || []).slice().sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
    setGradePricing(rows);
    if (rows.length > 0) setPickerGrade(rows[0].grade);
    setLoading(false);
  }

  // Pricing is keyed on grade only — width is just a physical attribute of
  // the line item, it doesn't affect price.
  const preview = useMemo(
    () => gradePricing.find(r => r.grade === pickerGrade) || null,
    [gradePricing, pickerGrade]
  );
  const previewPrice = preview != null && preview.price_per_lb != null ? Number(preview.price_per_lb) : null;

  function addToCart() {
    const width = Number(pickerWidth);
    const qty = Number(pickerQty);
    if (!pickerGrade || pickerWidth === "" || width <= 0 || !qty || qty <= 0) return;
    setCart(c => [
      ...c,
      { tempId: nextTempId(), grade: pickerGrade, width, quantity: qty, unit_price: previewPrice },
    ]);
    setPickerWidth("");
    setPickerQty("");
  }

  function removeLine(tempId) {
    setCart(c => c.filter(l => l.tempId !== tempId));
  }

  function startEditQty(tempId, value) {
    setEditingQty({ tempId, value: String(value) });
  }

  function saveEditQty() {
    if (!editingQty) return;
    const { tempId, value } = editingQty;
    const qty = Number(value);
    setEditingQty(null);
    if (!qty || qty <= 0) return;
    setCart(c => c.map(l => (l.tempId === tempId ? { ...l, quantity: qty } : l)));
  }

  const hasUnpriced = cart.some(l => l.unit_price == null);
  const subtotal = cart.reduce((s, l) => s + (l.unit_price != null ? l.quantity * l.unit_price : 0), 0);
  const canSubmit = cart.length > 0 && !hasUnpriced
    && requesterName.trim() !== "" && requesterCompany.trim() !== "" && !submitting;

  async function submitRequest() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    // Only grade/width/quantity are sent — the function looks the price up
    // itself, so a tampered client can't dictate what it pays.
    const lines = cart.map(l => ({ grade: l.grade, width: l.width, quantity: l.quantity }));
    const { data, error } = await supabase.rpc("submit_quote_request", {
      p_requester_name: requesterName.trim(),
      p_requester_company: requesterCompany.trim(),
      p_lines: lines,
    });
    setSubmitting(false);
    if (error) {
      // Don't put raw Postgres/PostgREST text in front of a customer.
      console.error("submit_quote_request failed:", error);
      setSubmitError("Sorry — we couldn't submit that request. Please try again, or contact us directly.");
      return;
    }

    setSubmitted({
      id: data,
      requester: { name: requesterName.trim(), company: requesterCompany.trim() },
      createdAt: new Date(),
      total: subtotal,
      lineItems: cart.map(l => ({ ...l, line_total: l.quantity * l.unit_price })),
    });
  }

  function startOver() {
    setCart([]);
    setRequesterName("");
    setRequesterCompany("");
    setSubmitError(null);
    setSubmitted(null);
    setPickerGrade(gradePricing[0]?.grade || "");
    setPickerWidth("");
    setPickerQty("");
  }

  function exportExcel({ id, lineItems }) {
    const rows = lineItems.map(li => ({
      Grade: li.grade,
      "Width (in)": Number(li.width).toFixed(1),
      "Quantity (lbs)": li.quantity,
      "Unit Price ($/lb)": Number(li.unit_price).toFixed(4),
      "Line Total": Number(li.line_total).toFixed(2),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 18 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Request");
    XLSX.writeFile(wb, `rfq-${String(id).slice(0, 8)}.xlsx`);
  }

  // ── Confirmation ──────────────────────────────────────
  if (submitted) {
    const confirmation = (
      <div className="page quote-summary-page">
        <div className="page-header no-print">
          <div>
            <h1>Request {String(submitted.id).slice(0, 8)}</h1>
            <p className="page-sub">
              {submitted.createdAt.toLocaleString()}
              {submitted.requester.company ? ` · ${submitted.requester.company}` : ""}
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-outline" onClick={startOver}>← New request</button>
            <button className="btn-outline" onClick={() => exportExcel(submitted)}>↓ Export Excel</button>
            <button className="btn-primary" onClick={() => window.print()}>Print</button>
          </div>
        </div>

        <div className="print-header">
          <h1>Phoenix Steel Supply Inc. — Quote Request</h1>
          <p>Request #{String(submitted.id).slice(0, 8)} · {submitted.createdAt.toLocaleString()}</p>
          <p>
            Requested by: {submitted.requester.name}
            {submitted.requester.company ? ` (${submitted.requester.company})` : ""}
          </p>
        </div>

        <div className="issues-banner no-print" style={{ margin: "0 0 16px" }}>
          ✓ Thanks — your request has been submitted. Our team will follow up shortly to confirm
          details. Tariffs and freight are not included in these estimates and are quoted separately.
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Grade</th><th>Width</th><th>Quantity (lbs)</th><th>Unit Price</th><th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {submitted.lineItems.map(li => (
                <tr key={li.tempId}>
                  <td><code>{li.grade}</code></td>
                  <td>{Number(li.width).toFixed(1)}&quot;</td>
                  <td>{Number(li.quantity).toLocaleString()}</td>
                  <td>{fmtCurrency(li.unit_price)}</td>
                  <td><strong>{fmt$(li.line_total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="quote-total-row">
          <span>Estimated total</span>
          <strong>{fmt$(submitted.total)}</strong>
        </div>
      </div>
    );
    return publicMode ? <PublicShell>{confirmation}</PublicShell> : confirmation;
  }

  // ── Builder ───────────────────────────────────────────
  const builder = (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Request a Quote</h1>
          <p className="page-sub">Build your order from live pricing for an instant estimate</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline">Loading pricing...</div>
      ) : loadError ? (
        <div className="auth-error">Couldn&apos;t load pricing right now. Please try again shortly.</div>
      ) : gradePricing.length === 0 ? (
        <div className="auth-error">No grades are priced yet — please check back soon.</div>
      ) : (
        <div className="cart-layout">
          <div className="item-picker info-card">
            <div className="card-label">Add item</div>
            <div className="field-group">
              <label>Grade</label>
              <select value={pickerGrade} onChange={e => setPickerGrade(e.target.value)}>
                {gradePricing.map(r => <option key={r.grade} value={r.grade}>{r.grade}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Width (in)</label>
              <input
                type="number" step="0.1" min="0"
                value={pickerWidth}
                onChange={e => setPickerWidth(e.target.value)}
                placeholder="..."
              />
            </div>
            <div className="field-group">
              <label>Quantity (lbs)</label>
              <input
                type="number" min="0"
                value={pickerQty}
                onChange={e => setPickerQty(e.target.value)}
                placeholder="..."
              />
            </div>

            {pickerGrade && (
              previewPrice != null ? (
                <div className="price-preview">{fmtCurrency(previewPrice)}</div>
              ) : (
                <div className="price-preview price-preview-warn">⚠ No price available for {pickerGrade} yet</div>
              )
            )}

            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 8 }}
              onClick={addToCart}
              disabled={!pickerGrade || !pickerWidth || !pickerQty}
            >
              + Add to cart
            </button>
          </div>

          <div className="cart-panel">
            <div className="requester-fields">
              <div className="field-group">
                <label>Your name *</label>
                <input
                  value={requesterName}
                  onChange={e => setRequesterName(e.target.value)}
                  placeholder="..."
                />
              </div>
              <div className="field-group">
                <label>Company *</label>
                <input
                  value={requesterCompany}
                  onChange={e => setRequesterCompany(e.target.value)}
                  placeholder="..."
                />
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Grade</th><th>Width</th><th>Quantity (lbs)</th><th>Unit Price</th><th>Line Total</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map(l => (
                    <tr key={l.tempId}>
                      <td><code>{l.grade}</code></td>
                      <td>{l.width.toFixed(1)}&quot;</td>
                      <td
                        className="editable-cell"
                        onClick={() => startEditQty(l.tempId, l.quantity)}
                        title="Click to edit"
                      >
                        {editingQty?.tempId === l.tempId ? (
                          <input
                            className="inline-input"
                            type="number" min="0"
                            autoFocus
                            value={editingQty.value}
                            onChange={e => setEditingQty(ed => ({ ...ed, value: e.target.value }))}
                            onBlur={saveEditQty}
                            onKeyDown={e => { if (e.key === "Enter") saveEditQty(); if (e.key === "Escape") setEditingQty(null); }}
                          />
                        ) : (
                          <span>{l.quantity.toLocaleString()}</span>
                        )}
                      </td>
                      <td>
                        {l.unit_price != null ? fmtCurrency(l.unit_price) : <span className="badge badge-gray">Price not set</span>}
                      </td>
                      <td>
                        {l.unit_price != null ? <strong>{fmt$(l.quantity * l.unit_price)}</strong> : "—"}
                      </td>
                      <td>
                        <button className="icon-btn danger" onClick={() => removeLine(l.tempId)} title="Remove">✕</button>
                      </td>
                    </tr>
                  ))}
                  {cart.length === 0 && (
                    <tr><td colSpan={6} className="empty-row">Cart is empty — add an item to get started</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {hasUnpriced && cart.length > 0 && (
              <div className="issues-banner" style={{ marginTop: 12 }}>
                ⚠ One or more items have no price available for that grade — remove them, or contact us directly for a quote.
              </div>
            )}

            {cart.length > 0 && !hasUnpriced && (
              <div className="issues-banner" style={{ marginTop: 12 }}>
                ⚠ Tariffs and freight are not included in this estimate and will be calculated separately.
              </div>
            )}

            <div className="quote-total-row">
              <span>Estimated total</span>
              <strong>{fmt$(subtotal)}</strong>
            </div>

            {submitError && <div className="auth-error" style={{ marginTop: 12 }}>{submitError}</div>}

            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={submitRequest}
              disabled={!canSubmit}
              title={
                requesterName.trim() === "" || requesterCompany.trim() === ""
                  ? "Enter your name and company to submit"
                  : undefined
              }
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return publicMode ? <PublicShell>{builder}</PublicShell> : builder;
}

// Standalone page chrome for the public route: logo only. No sidebar, no
// nav, no links into the internal CRM.
function PublicShell({ children }) {
  return (
    <div className="public-page">
      <header className="public-header no-print">
        <img src={logo} alt="Phoenix Steel Supply Inc." className="brand-logo public-brand-logo" />
      </header>
      <div className="public-shell">{children}</div>
    </div>
  );
}
