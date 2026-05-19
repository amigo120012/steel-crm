import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
//  STEP 1 of setup: paste your Supabase project details below.
//  Find them at: supabase.com → your project → Settings → API
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
