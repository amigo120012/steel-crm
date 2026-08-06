import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { GRADES, fmtCurrency } from "../lib/pricing";

// Public, no-login order request form. Deliberately separate from the
// internal CRM: no sidebar, no other tabs, no CRM data — it only ever
// talks to the pricing_public view (price only, no cost/margin) and the
// submit_order_request() function (see supabase/order_requests.sql).

const COUNTRIES = ["United States", "Canada", "Mexico", "Other"];
const EMPTY_SHIPPING = { name: "", company: "", address: "", city: "", state: "", zip: "", country: "United States", countryOther: "" };

const fmt$ = n => "$" + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OrderPage() {
  const [step, setStep] = useState("select"); // select | shipping | done
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [grade, setGrade] = useState("");
  const [quantity, setQuantity] = useState("");
  const [shipping, setShipping] = useState(EMPTY_SHIPPING);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(null);

  useEffect(() => { fetchPricing(); }, []);

  async function fetchPricing() {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase.from("pricing_public").select("*");
    if (error) { setLoadError(error.message); setLoading(false); return; }
    const rows = (data || []).slice().sort((a, b) => GRADES.indexOf(a.grade) - GRADES.indexOf(b.grade));
    setPricing(rows);
    if (rows.length > 0) setGrade(rows[0].grade);
    setLoading(false);
  }

  const priceRow = pricing.find(p => p.grade === grade) || null;
  const unitPrice = priceRow ? Number(priceRow.price_per_lb) : null;
  const qtyNum = Number(quantity) || 0;
  const total = unitPrice != null && qtyNum > 0 ? unitPrice * qtyNum : null;

  const isUS = shipping.country === "United States";
  const resolvedCountry = shipping.country === "Other" ? shipping.countryOther.trim() : shipping.country;
  const shippingValid = shipping.name.trim() && shipping.address.trim() && shipping.city.trim()
    && shipping.state.trim() && shipping.zip.trim() && resolvedCountry;

  function updateShipping(field, value) {
    setShipping(s => ({ ...s, [field]: value }));
  }

  function goToShipping() {
    if (!grade || total == null) return;
    setStep("shipping");
  }

  async function submitOrder() {
    if (!shippingValid || total == null) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase.rpc("submit_order_request", {
      p_grade: grade,
      p_quantity_lbs: qtyNum,
      p_unit_price_per_lb: unitPrice,
      p_estimated_total: total,
      p_shipping_name: shipping.name.trim(),
      p_shipping_company: shipping.company.trim() || null,
      p_shipping_address: shipping.address.trim(),
      p_shipping_city: shipping.city.trim(),
      p_shipping_state: shipping.state.trim(),
      p_shipping_zip: shipping.zip.trim(),
      p_shipping_country: resolvedCountry,
    });
    setSubmitting(false);
    if (error) { setSubmitError(error.message); return; }
    setSubmitted({
      grade, quantity: qtyNum, unitPrice, total, isUS,
      shipping: { ...shipping, country: resolvedCountry },
    });
    setStep("done");
  }

  function startOver() {
    setGrade(pricing[0]?.grade || "");
    setQuantity("");
    setShipping(EMPTY_SHIPPING);
    setSubmitError(null);
    setSubmitted(null);
    setStep("select");
  }

  return (
    <div className="order-page">
      <div className="order-header">
        <span className="order-brand-icon">⬡</span>
        <span className="order-brand-name">Phoenix.SS</span>
      </div>

      <div className="order-shell">
        {step === "select" && (
          <div className="order-card">
            <h1>Request a Quote</h1>
            <p className="page-sub" style={{ marginBottom: 20 }}>Select a grade and quantity for an instant price estimate.</p>

            {loading ? (
              <div className="loading-inline">Loading pricing...</div>
            ) : loadError ? (
              <div className="auth-error">Couldn't load pricing right now. Please try again shortly.</div>
            ) : pricing.length === 0 ? (
              <div className="auth-error">No grades are priced yet — please check back soon.</div>
            ) : (
              <>
                <div className="field-group" style={{ marginBottom: 14 }}>
                  <label>Steel grade</label>
                  <select value={grade} onChange={e => setGrade(e.target.value)}>
                    {pricing.map(p => (
                      <option key={p.grade} value={p.grade}>
                        {p.grade} — {fmtCurrency(p.price_per_lb)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-group">
                  <label>Quantity (lbs)</label>
                  <input
                    type="number" min="0"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    placeholder="e.g. 5000"
                  />
                </div>

                {total != null && (
                  <div className="order-estimate">
                    <div className="order-estimate-total">{fmt$(total)}</div>
                    <div className="order-estimate-sub">
                      estimated · {fmtCurrency(unitPrice)} × {qtyNum.toLocaleString()} lbs
                    </div>
                  </div>
                )}

                <button
                  className="btn-primary"
                  style={{ width: "100%", marginTop: 18 }}
                  onClick={goToShipping}
                  disabled={!grade || total == null}
                >
                  Confirm Order
                </button>
              </>
            )}
          </div>
        )}

        {step === "shipping" && (
          <div className="order-card">
            <h1>Shipping Details</h1>
            <p className="page-sub" style={{ marginBottom: 20 }}>Where should this order ship?</p>

            <div className="order-summary-box">
              <div className="order-summary-row"><span>Grade</span><span><code>{grade}</code></span></div>
              <div className="order-summary-row"><span>Quantity</span><span>{qtyNum.toLocaleString()} lbs</span></div>
              <div className="order-summary-row"><span>Price/lb</span><span>{fmt$(unitPrice)}</span></div>
              <div className="order-summary-row order-summary-total"><span>Estimated total</span><span>{fmt$(total)}</span></div>
            </div>

            {isUS && (
              <div className="issues-banner" style={{ marginBottom: 16 }}>
                ⚠ Tariffs and freight are not included in this estimate and will be calculated separately.
              </div>
            )}

            <div className="form-grid">
              <div className="field-group span-2">
                <label>Full name *</label>
                <input value={shipping.name} onChange={e => updateShipping("name", e.target.value)} placeholder="Jane Smith" />
              </div>
              <div className="field-group span-2">
                <label>Company (optional)</label>
                <input value={shipping.company} onChange={e => updateShipping("company", e.target.value)} placeholder="Acme Manufacturing" />
              </div>
              <div className="field-group span-2">
                <label>Address *</label>
                <input value={shipping.address} onChange={e => updateShipping("address", e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="field-group">
                <label>City *</label>
                <input value={shipping.city} onChange={e => updateShipping("city", e.target.value)} placeholder="Columbus" />
              </div>
              <div className="field-group">
                <label>State / Province *</label>
                <input value={shipping.state} onChange={e => updateShipping("state", e.target.value)} placeholder="OH" />
              </div>
              <div className="field-group">
                <label>Zip / Postal code *</label>
                <input value={shipping.zip} onChange={e => updateShipping("zip", e.target.value)} placeholder="43215" />
              </div>
              <div className="field-group">
                <label>Country *</label>
                <select value={shipping.country} onChange={e => updateShipping("country", e.target.value)}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {shipping.country === "Other" && (
                <div className="field-group span-2">
                  <label>Country name *</label>
                  <input value={shipping.countryOther} onChange={e => updateShipping("countryOther", e.target.value)} placeholder="Country" />
                </div>
              )}
            </div>

            {submitError && <div className="auth-error" style={{ marginTop: 14 }}>{submitError}</div>}

            <div className="order-actions">
              <button className="btn-outline" onClick={() => setStep("select")} disabled={submitting}>← Back</button>
              <button className="btn-primary" onClick={submitOrder} disabled={!shippingValid || submitting}>
                {submitting ? "Submitting..." : "Submit Order Request"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && submitted && (
          <div className="order-card">
            <div className="order-confirm-icon">✓</div>
            <h1 style={{ textAlign: "center" }}>Thank you!</h1>
            <p className="page-sub" style={{ textAlign: "center", marginBottom: 20 }}>
              Your order request has been submitted. Our team will follow up shortly to confirm details.
            </p>

            <div className="order-summary-box">
              <div className="order-summary-row"><span>Grade</span><span><code>{submitted.grade}</code></span></div>
              <div className="order-summary-row"><span>Quantity</span><span>{submitted.quantity.toLocaleString()} lbs</span></div>
              <div className="order-summary-row"><span>Price/lb</span><span>{fmt$(submitted.unitPrice)}</span></div>
              <div className="order-summary-row order-summary-total"><span>Estimated total</span><span>{fmt$(submitted.total)}</span></div>
            </div>

            <div className="order-summary-box">
              <div className="card-label">Ship to</div>
              <p style={{ lineHeight: 1.6 }}>
                {submitted.shipping.name}<br />
                {submitted.shipping.company && <>{submitted.shipping.company}<br /></>}
                {submitted.shipping.address}<br />
                {submitted.shipping.city}, {submitted.shipping.state} {submitted.shipping.zip}<br />
                {submitted.shipping.country}
              </p>
            </div>

            {submitted.isUS && (
              <div className="issues-banner" style={{ marginBottom: 16 }}>
                ⚠ Tariffs and freight are not included in this estimate and will be calculated separately.
              </div>
            )}

            <button className="btn-outline" style={{ width: "100%" }} onClick={startOver}>Submit another order</button>
          </div>
        )}
      </div>
    </div>
  );
}
