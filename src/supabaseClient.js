import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────
//  STEP 1 of setup: paste your Supabase project details below.
//  Find them at: supabase.com → your project → Settings → API
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://grzvxlitfdadezrourpk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_d8PHAHluiN5ywNtrMph9pg_8IdrSQuf";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
