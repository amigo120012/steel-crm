import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { GRADES, SPAN_MIN, SPAN_MAX, findRangeForWidth, fmtCurrency } from "../lib/pricing";

const fmt$ = n => "$" + Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let tempIdCounter = 0;
const nextTempId = () => `tmp-${++tempIdCounter}`;

export default function QuoteCalculator() {
  const [ranges, setRanges] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [recentQuotes, setRecentQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [pickerGrade, setPickerGrade] = useState(GRADES[0]);
  const [pickerWidth, setPickerWidth] = useState("");
  const [pickerQty, setPickerQty] = useState("");
  const [editingQty, setEditingQty] = useState(null); // { tempId, value }
  const [generating, setGenerating] = useState(false);
  const [viewingQuote, setViewingQuote] = useState(null); // { quote, lineItems }

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [{ data: r }, { data: c }, { data: q }] = await Promise.all([
      supabase.from("pricing_ranges").select("*"),
      supabase.from("customers").select("id, name").order("name"),
      supabase.from("quotes").select("*, customers(name)").order("created_at", { ascending: false }).limit(20),
    ]);
    setRanges(r || []);
    setCustomers(c || []);
    setRecentQuotes(q || []);
    setLoading(false);
  }

  const preview = useMemo(() => {
    if (!pickerGrade || pickerWidth === "") return null;
    return findRangeForWidth(ranges, pickerGrade, Number(pickerWidth));
  }, [ranges, pickerGrade, pickerWidth]);

  function addToCart() {
    const width = Number(pickerWidth);
    const qty = Number(pickerQty);
    if (!pickerGrade || pickerWidth === "" || width < SPAN_MIN || width > SPAN_MAX || !qty || qty <= 0) return;
    const match = findRangeForWidth(ranges, pickerGrade, width);
    setCart(c => [
      ...c,
      {
        tempId: nextTempId(),
        grade: pickerGrade,
        width,
        quantity: qty,
        unit_price: match ? Number(match.selling_price_per_lb) : null,
      },
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

  async function generateQuote() {
    if (cart.length === 0 || hasUnpriced) return;
    setGenerating(true);
    const total = cart.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const { data: quote, error } = await supabase
      .from("quotes")
      .insert({ customer_id: customerId || null, total })
      .select("*, customers(name)")
      .single();
    if (error) { alert("Failed to create quote: " + error.message); setGenerating(false); return; }

    const lineItems = cart.map(l => ({
      quote_id: quote.id,
      grade: l.grade,
      width: l.width,
      quantity: l.quantity,
      unit_price: l.unit_price,
      line_total: l.quantity * l.unit_price,
    }));
    const { data: savedLines, error: liError } = await supabase.from("quote_line_items").insert(lineItems).select();
    setGenerating(false);
    if (liError) { alert("Quote created but line items failed to save: " + liError.message); return; }

    setCart([]);
    setCustomerId("");
    fetchAll();
    setViewingQuote({ quote, lineItems: savedLines || [] });
  }

  async function openQuote(q) {
    const { data: lineItems } = await supabase.from("quote_line_items").select("*").eq("quote_id", q.id);
    setViewingQuote({ quote: q, lineItems: lineItems || [] });
  }

  function exportQuoteExcel({ quote, lineItems }) {
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
    XLSX.utils.book_append_sheet(wb, ws, "Quote");
    XLSX.writeFile(wb, `quote-${quote.id.slice(0, 8)}.xlsx`);
  }

  if (viewingQuote) {
    const { quote, lineItems } = viewingQuote;
    return (
      <div className="page quote-summary-page">
        <div className="page-header no-print">
          <div>
            <h1>Quote {quote.id.slice(0, 8)}</h1>
            <p className="page-sub">
              {new Date(quote.created_at).toLocaleString()}
              {quote.customers?.name ? ` · ${quote.customers.name}` : ""}
            </p>
          </div>
          <div className="header-actions">
            <button className="btn-outline" onClick={() => setViewingQuote(null)}>← Back to builder</button>
            <button className="btn-outline" onClick={() => exportQuoteExcel(viewingQuote)}>↓ Export Excel</button>
            <button className="btn-primary" onClick={() => window.print()}>Print</button>
          </div>
        </div>

        <div className="print-header">
          <h1>Phoenix.SS — Quote</h1>
          <p>Quote #{quote.id.slice(0, 8)} · {new Date(quote.created_at).toLocaleString()}</p>
          {quote.customers?.name && <p>Customer: {quote.customers.name}</p>}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Grade</th><th>Width</th><th>Quantity (lbs)</th><th>Unit Price</th><th>Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(li => (
                <tr key={li.id}>
                  <td><code>{li.grade}</code></td>
                  <td>{Number(li.width).toFixed(1)}"</td>
                  <td>{Number(li.quantity).toLocaleString()}</td>
                  <td>{fmtCurrency(li.unit_price)}</td>
                  <td><strong>{fmt$(li.line_total)}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="quote-total-row">
          <span>Total</span>
          <strong>{fmt$(quote.total)}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Quote Calculator</h1>
          <p className="page-sub">Build a customer quote from live pricing ranges</p>
        </div>
      </div>

      {loading ? (
        <div className="loading-inline">Loading...</div>
      ) : (
        <div className="cart-layout">
          <div className="item-picker info-card">
            <div className="card-label">Add item</div>
            <div className="field-group">
              <label>Grade</label>
              <select value={pickerGrade} onChange={e => setPickerGrade(e.target.value)}>
                {GRADES.map(g => <option key={g}>{g}</option>)}
              </select>
            </div>
            <div className="field-group">
              <label>Width (in, {SPAN_MIN.toFixed(1)}"–{SPAN_MAX.toFixed(1)}")</label>
              <input
                type="number" step="0.1" min={SPAN_MIN} max={SPAN_MAX}
                value={pickerWidth}
                onChange={e => setPickerWidth(e.target.value)}
                placeholder="e.g. 3.2"
              />
            </div>
            <div className="field-group">
              <label>Quantity (lbs)</label>
              <input
                type="number" min="0"
                value={pickerQty}
                onChange={e => setPickerQty(e.target.value)}
                placeholder="e.g. 5000"
              />
            </div>

            {pickerWidth !== "" && (
              preview ? (
                <div className="price-preview">
                  {fmtCurrency(preview.selling_price_per_lb)} — matched {Number(preview.width_min).toFixed(1)}"–{Number(preview.width_max).toFixed(1)}" range
                </div>
              ) : (
                <div className="price-preview price-preview-warn">⚠ Price not set for this width yet</div>
              )
            )}

            <button
              className="btn-primary"
              style={{ width: "100%", marginTop: 8 }}
              onClick={addToCart}
              disabled={!pickerWidth || !pickerQty || Number(pickerWidth) < SPAN_MIN || Number(pickerWidth) > SPAN_MAX}
            >
              + Add to cart
            </button>

            {recentQuotes.length > 0 && (
              <>
                <div className="card-label" style={{ marginTop: 24 }}>Recent quotes</div>
                <div className="recent-quotes-list">
                  {recentQuotes.map(q => (
                    <button key={q.id} className="recent-quote-row" onClick={() => openQuote(q)}>
                      <span>{q.customers?.name || "No customer"}</span>
                      <span className="recent-quote-meta">{fmt$(q.total)} · {new Date(q.created_at).toLocaleDateString()}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="cart-panel">
            <div className="field-group" style={{ maxWidth: 320, marginBottom: 14 }}>
              <label>Customer (optional)</label>
              <select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                <option value="">No customer selected</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
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
                      <td>{l.width.toFixed(1)}"</td>
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
                ⚠ One or more items have no price set for that width — fill in the range on the Pricing tab before generating the quote.
              </div>
            )}

            <div className="quote-total-row">
              <span>Subtotal</span>
              <strong>{fmt$(subtotal)}</strong>
            </div>

            <button
              className="btn-primary"
              style={{ marginTop: 12 }}
              onClick={generateQuote}
              disabled={cart.length === 0 || hasUnpriced || generating}
            >
              {generating ? "Generating..." : "Generate Quote"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
