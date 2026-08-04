#!/usr/bin/env node
//
// One-time / rerunnable importer: pricing spreadsheet -> pricing_ranges table.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY=xxxx node scripts/import-pricing.js path/to/pricing.xlsx
//   (add --dry-run to preview the ranges without touching the database)
//
// Get SUPABASE_SERVICE_ROLE_KEY from the Supabase dashboard -> Settings ->
// API -> service_role. It bypasses RLS, so this script can write to
// pricing_ranges without needing a logged-in browser session. Never commit
// this key or put it in a file tracked by git.
//
// Expects a "Pricing" sheet with columns: Grade, Width (in), Cost/lb ($),
// Selling Price/lb ($). One row per 0.5" width sample from 1.0" to 12.0".
// Each sampled width is treated as the START of a 0.5" pricing band (the
// standard "starting at width X, price is Y" convention) that runs up to
// but not including the next sampled width, so bands never overlap or gap
// against each other. Consecutive bands with identical cost + price for a
// grade are then collapsed into a single width_min-width_max range.
//
// Re-running this script clears out ANY existing pricing_ranges rows for
// the grades present in the spreadsheet, then reinserts freshly computed
// ranges for them, so you can re-run it as many times as you like (e.g.
// once real numbers replace this sample data) without piling up duplicates.

const path = require("path");
const XLSX = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "https://grzvxlitfdadezrourpk.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const SPAN_MIN = 1.0;
const SPAN_MAX = 12.0;

const toTenths = n => Math.round(Number(n) * 10);
const fromTenths = t => t / 10;
const round4 = n => Math.round(Number(n) * 10000) / 10000;

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
    const width = row["Width (in)"];
    const cost = row["Cost/lb ($)"];
    const price = row["Selling Price/lb ($)"];
    if (!grade || width == null || cost == null || price == null) continue;
    if (!byGrade.has(grade)) byGrade.set(grade, []);
    byGrade.get(grade).push({ width: Number(width), cost: round4(cost), price: round4(price) });
  }
  return byGrade;
}

// Collapses one grade's sampled width points into gapless width_min/width_max ranges.
function buildRangesForGrade(points) {
  const sorted = [...points].sort((a, b) => a.width - b.width);
  const spanMaxTenths = toTenths(SPAN_MAX);

  const bands = sorted.map((p, i) => {
    const bandMinTenths = toTenths(p.width);
    const next = sorted[i + 1];
    const bandMaxTenths = next ? toTenths(next.width) - 1 : spanMaxTenths;
    return { ...p, bandMinTenths, bandMaxTenths };
  });

  const ranges = [];
  let run = null;
  for (const b of bands) {
    const sameTier = run && run.cost === b.cost && run.price === b.price;
    if (sameTier) {
      run.bandMaxTenths = b.bandMaxTenths;
    } else {
      if (run) ranges.push(run);
      run = { ...b };
    }
  }
  if (run) ranges.push(run);

  return ranges.map(r => ({
    width_min: fromTenths(r.bandMinTenths),
    width_max: fromTenths(r.bandMaxTenths),
    cost_per_lb: r.cost,
    selling_price_per_lb: r.price,
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

  const byGrade = parseSpreadsheet(filePath);
  if (byGrade.size === 0) {
    console.error("No usable rows found in the Pricing sheet.");
    process.exit(1);
  }

  const allRanges = [];
  const summary = [];

  for (const [grade, points] of byGrade) {
    const ranges = buildRangesForGrade(points);
    for (const r of ranges) allRanges.push({ grade, ...r });
    summary.push({ grade, sampledPoints: points.length, ranges });
  }

  console.log(`Parsed ${byGrade.size} grade(s) from "${path.basename(filePath)}":\n`);
  for (const s of summary) {
    console.log(`${s.grade}  —  ${s.ranges.length} range(s) from ${s.sampledPoints} sampled widths`);
    for (const r of s.ranges) {
      console.log(
        `    ${r.width_min.toFixed(1)}"-${r.width_max.toFixed(1)}"   ` +
        `cost $${r.cost_per_lb.toFixed(4)}/lb   sell $${r.selling_price_per_lb.toFixed(4)}/lb`
      );
    }
  }
  console.log(`\nTotal: ${allRanges.length} ranges across ${summary.length} grades.`);

  if (dryRun) {
    console.log("\n--dry-run set: nothing was written to Supabase.");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const grades = [...byGrade.keys()];

  console.log(`\nClearing existing pricing_ranges rows for: ${grades.join(", ")}...`);
  const { error: delError } = await supabase.from("pricing_ranges").delete().in("grade", grades);
  if (delError) {
    console.error("Failed to clear existing ranges:", delError.message);
    process.exit(1);
  }

  console.log(`Inserting ${allRanges.length} ranges...`);
  const { error: insError } = await supabase.from("pricing_ranges").insert(allRanges);
  if (insError) {
    console.error("Failed to insert ranges:", insError.message);
    process.exit(1);
  }

  console.log("\nDone. Reload the Pricing tab to see the imported ranges.");
}

main().catch(err => {
  console.error(err.message || err);
  process.exit(1);
});
