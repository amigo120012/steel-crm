// Shared grade/width pricing logic used by both the Pricing tab and the
// Quote Calculator. Kept out of either component so Pricing.jsx can be
// gated behind an employee-only check later without touching this file.
//
// Pricing is keyed on the exact pair (grade, width), not a range — the
// source spreadsheet gives real cost/price data per 0.5" width sample, and
// we keep that granularity end-to-end rather than collapsing it.

export const GRADES = ["M45", "M36", "M27", "M19", "M15", "M12", "M6", "M5", "M4", "M3", "M2"];

export const SPAN_MIN = 1.0;
export const SPAN_MAX = 12.0;
export const WIDTH_STEP = 0.5;

// The 23 sampled widths: 1.0", 1.5", ... 12.0".
export const WIDTHS = Array.from(
  { length: Math.round((SPAN_MAX - SPAN_MIN) / WIDTH_STEP) + 1 },
  (_, i) => Math.round((SPAN_MIN + i * WIDTH_STEP) * 10) / 10
);

// Widths are compared in tenths (integers) to avoid floating-point drift.
const toTenths = n => Math.round(Number(n) * 10);

// Finds the pricing point for an exact (grade, width) match, or null if
// that cell hasn't been loaded (e.g. before the spreadsheet is imported).
export function findPricingPoint(points, grade, width) {
  const w = toTenths(width);
  return points.find(p => p.grade === grade && toTenths(p.width) === w) || null;
}

// A point only has usable pricing once both base values have been imported
// from the spreadsheet. Either missing means "no cost set" — skip the
// adjustment/margin math rather than treating it as $0.
export function hasBasePrice(point) {
  return point != null && point.base_cost_per_lb != null && point.base_selling_price_per_lb != null;
}

export function finalSellingPrice(point) {
  if (!hasBasePrice(point)) return null;
  return Number(point.base_selling_price_per_lb) + Number(point.adjustment_per_lb ?? 0);
}

export function marginPerLb(point) {
  const sell = finalSellingPrice(point);
  if (sell == null) return null;
  return sell - Number(point.base_cost_per_lb);
}

// How many of a grade's 23 widths have base pricing loaded.
export function gradeCoverage(points, grade) {
  const gradePoints = points.filter(p => p.grade === grade);
  const priced = gradePoints.filter(hasBasePrice).length;
  return { priced, total: WIDTHS.length };
}

export const fmtCurrency = n =>
  n == null ? "—" : "$" + Number(n).toFixed(4) + "/lb";
