// Shared grade/width-range logic used by both the Pricing tab and the
// Quote Calculator. Kept out of either component so Pricing.jsx can be
// gated behind an employee-only check later without touching this file.

export const GRADES = ["M45", "M36", "M27", "M19", "M15", "M12", "M6", "M5", "M4", "M3", "M2"];

export const SPAN_MIN = 1.0;
export const SPAN_MAX = 12.0;

// Widths are handled in tenths (integers) internally to avoid floating-point
// drift when checking 0.1" increments for adjacency/overlap.
const toTenths = n => Math.round(Number(n) * 10);
const fmtW = tenths => (tenths / 10).toFixed(1);

export function validateGradeRanges(ranges) {
  const sorted = [...ranges].sort((a, b) => a.width_min - b.width_min);
  const issues = [];
  let cursor = toTenths(SPAN_MIN);

  for (const r of sorted) {
    const min = toTenths(r.width_min);
    const max = toTenths(r.width_max);
    if (min > max) {
      issues.push(`Invalid range ${r.width_min}"–${r.width_max}" (min after max)`);
      continue;
    }
    if (min > cursor) {
      issues.push(`Gap: ${fmtW(cursor)}"–${fmtW(min - 1)}" not covered`);
    } else if (min < cursor) {
      issues.push(`Overlap: ${fmtW(min)}"–${fmtW(Math.min(max, cursor - 1))}"`);
    }
    cursor = Math.max(cursor, max + 1);
  }

  const spanMaxTenths = toTenths(SPAN_MAX);
  if (cursor <= spanMaxTenths) {
    issues.push(`Gap: ${fmtW(cursor)}"–${fmtW(spanMaxTenths)}" not covered`);
  }

  return { complete: sorted.length > 0 && issues.length === 0, issues };
}

// Finds the pricing range covering a specific width for a grade, or null
// if that width isn't covered yet (e.g. range not filled in).
export function findRangeForWidth(ranges, grade, width) {
  const w = toTenths(width);
  return (
    ranges.find(
      r => r.grade === grade && toTenths(r.width_min) <= w && w <= toTenths(r.width_max)
    ) || null
  );
}

export const fmtCurrency = n =>
  n == null ? "—" : "$" + Number(n).toFixed(4) + "/lb";
