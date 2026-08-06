#!/usr/bin/env node
//
// One-time / rerunnable importer: pricing spreadsheet -> pricing_points table.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/import-pricing.js path/to/pricing.xlsx
//   (add --dry-run to preview the parsed rows without touching the database)
//
// Get SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard -> Settings ->
// API -> service_role. It bypasses RLS, so this script can write to
// pricing_points without needing a logged-in browser session. Never commit
// this key or put it in a file tracked by git.
//
// Expects a "Pricing" sheet with columns: Grade, Width (in), Cost/lb ($),
// Selling Price/lb ($). One row per (grade, width) cell — every row is kept
// exactly as sampled, no collapsing into ranges. Rows with a blank Cost/lb
// or Selling Price/lb are imported with a null base value ("no cost set" in
// the UI) rather than being skipped or defaulted to 0.
//
// Re-running this script UPSERTS on (grade, width): it only ever writes
// base_cost_per_lb / base_selling_price_per_lb, so adjustment_per_lb values
// already entered on the Pricing tab are left untouched.

const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://grzvxlitfdadezrourpk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const round4 = n => (n == null ? null : Math.round(Number(n) * 10000) / 10000);

// Shared with the in-app importer in src/components/Pricing.jsx — keep the
// column names and null handling in sync if the spreadsheet format changes.
function parseSpreadsheet(filePath) {
  const wb = XLSX.readFile(path.resolve(filePath));
  const sheet = wb.Sheets["Pricing"];
  if (!sheet) {
    throw new Error(`Sheet "Pricing" not found. Sheets in file: ${wb.SheetNames.join(", ")}`);
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

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

  const points = parseSpreadsheet(filePath);
  if (points.length === 0) {
    console.error("No usable rows found in the Pricing sheet.");
    process.exit(1);
  }

  const missing = points.filter(p => p.base_cost_per_lb == null || p.base_selling_price_per_lb == null);
  const grades = [...new Set(points.map(p => p.grade))];

  console.log(`Parsed ${points.length} row(s) across ${grades.length} grade(s) from "${path.basename(filePath)}":`);
  console.log(`  ${points.length - missing.length} with both cost + price set`);
  console.log(`  ${missing.length} with no cost set (imported as null, not $0)`);

  if (dryRun) {
    console.log("\n--dry-run set: nothing was written to Supabase. Sample rows:");
    for (const p of points.slice(0, 10)) {
      const cost = p.base_cost_per_lb == null ? "—" : `$${p.base_cost_per_lb.toFixed(4)}`;
      const price = p.base_selling_price_per_lb == null ? "—" : `$${p.base_selling_price_per_lb.toFixed(4)}`;
      console.log(`    ${p.grade}  ${p.width.toFixed(1)}"   cost ${cost}/lb   sell ${price}/lb`);
    }
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log(`\nUpserting ${points.length} (grade, width) rows into pricing_points...`);
  console.log("(adjustment_per_lb is not part of this payload, so existing adjustments are preserved)");
  const { error } = await supabase
    .from("pricing_points")
    .upsert(points, { onConflict: "grade,width" });
  if (error) {
    console.error("Failed to upsert pricing_points:", error.message);
    process.exit(1);
  }

  console.log("\nDone. Reload the Pricing tab to see the refreshed base pricing.");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
