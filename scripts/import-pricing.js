#!/usr/bin/env node
//
// One-time / rerunnable importer: pricing spreadsheet -> pricing_grades table.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/import-pricing.js path/to/pricing.xlsx
//   (add --dry-run to preview the parsed rows without touching the database)
//
// Get SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard -> Settings ->
// API -> service_role. It bypasses RLS, so this script can write to
// pricing_grades without needing a logged-in browser session. Never commit
// this key or put it in a file tracked by git.
//
// Expects a "Pricing" sheet with columns: Grade, Width (in), Cost/lb ($),
// Selling Price/lb ($). Cost/lb and Selling Price/lb do not vary by width
// in the source data (every width row for a grade carries the same
// value), so the Width column is read but otherwise ignored — this script
// collapses to one row per Grade, taking the first non-null cost/price
// seen for that grade. A grade with no cost/price rows at all is imported
// with a null base value ("no cost set" in the UI) rather than being
// skipped or defaulted to 0.
//
// Re-running this script UPSERTS on grade: it only ever writes
// base_cost_per_lb / base_selling_price_per_lb, so adjustment_per_lb
// values already entered on the Pricing tab are left untouched.

const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://grzvxlitfdadezrourpk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const round4 = n => (n == null || n === "" ? null : Math.round(Number(n) * 10000) / 10000);

// Shared with the in-app importer in src/components/Pricing.jsx — keep the
// column names and null handling in sync if the spreadsheet format changes.
function parseSpreadsheet(filePath) {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets["Pricing"];
  if (!sheet) {
    throw new Error(`Sheet "Pricing" not found. Sheets in file: ${wb.SheetNames.join(", ")}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find(a => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: node scripts/import-pricing.js <path-to-pricing.xlsx> [--dry-run]");
    process.exit(1);
  }
  if (!dryRun && !SERVICE_ROLE_KEY) {
    console.error(
      "Missing SUPABASE_SERVICE_ROLE_KEY env var (get it from Supabase dashboard -> Settings -> API -> service_role).\n" +
      "Re-run with:\n  SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-pricing.js <file.xlsx>\n" +
      "Or preview first without a key:\n  node scripts/import-pricing.js <file.xlsx> --dry-run"
    );
    process.exit(1);
  }

  const grades = parseSpreadsheet(filePath);
  if (grades.length === 0) {
    console.error("No usable rows found in the Pricing sheet.");
    process.exit(1);
  }

  const missing = grades.filter(g => g.base_cost_per_lb == null || g.base_selling_price_per_lb == null);

  console.log(`Parsed ${grades.length} grade(s) from "${path.basename(filePath)}":`);
  console.log(`  ${grades.length - missing.length} with both cost + price set`);
  console.log(`  ${missing.length} with no cost set (imported as null, not $0)`);
  for (const g of grades) {
    const cost = g.base_cost_per_lb == null ? "—" : `$${g.base_cost_per_lb.toFixed(4)}`;
    const price = g.base_selling_price_per_lb == null ? "—" : `$${g.base_selling_price_per_lb.toFixed(4)}`;
    console.log(`    ${g.grade}   cost ${cost}/lb   sell ${price}/lb`);
  }

  if (dryRun) {
    console.log("\n--dry-run set: nothing was written to Supabase.");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log(`\nUpserting ${grades.length} grade row(s) into pricing_grades...`);
  console.log("(adjustment_per_lb is not part of this payload, so existing adjustments are preserved)");
  const { error } = await supabase
    .from("pricing_grades")
    .upsert(grades, { onConflict: "grade" });
  if (error) {
    console.error("Failed to upsert pricing_grades:", error.message);
    process.exit(1);
  }

  console.log("\nDone. Reload the Pricing tab to see the refreshed base pricing.");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
