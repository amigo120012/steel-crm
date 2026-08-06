// Shared grade pricing logic used by both the Pricing tab and the Quote
// Calculator. Kept out of either component so Pricing.jsx can be gated
// behind an employee-only check later without touching this file.
//
// Pricing is keyed on Grade only — the source spreadsheet's Cost/lb and
// Selling Price/lb do not vary by width (confirmed against the sample
// data: every width row for a given grade carries the same cost/price),
// so width plays no part in the pricing model.

export const GRADES = ["M45", "M36", "M27", "M19", "M15", "M12", "M6", "M5", "M4", "M3", "M2"];

// Finds the pricing row for a grade, or null if it hasn't been loaded yet
// (e.g. before the spreadsheet is imported).
export function findPricingGrade(rows, grade) {
  return rows.find(r => r.grade === grade) || null;
}

// A row only has usable pricing once both base values have been imported
// from the spreadsheet. Either missing means "no cost set" — skip the
// adjustment/margin math rather than treating it as $0.
export function hasBasePrice(row) {
  return row != null && row.base_cost_per_lb != null && row.base_selling_price_per_lb != null;
}

export function finalSellingPrice(row) {
  if (!hasBasePrice(row)) return null;
  return Number(row.base_selling_price_per_lb) + Number(row.adjustment_per_lb ?? 0);
}

export function marginPerLb(row) {
  const sell = finalSellingPrice(row);
  if (sell == null) return null;
  return sell - Number(row.base_cost_per_lb);
}

export const fmtCurrency = n =>
  n == null ? "—" : "$" + Number(n).toFixed(4) + "/lb";
