// src/lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

const isServer = typeof window === 'undefined';

/* ---------- URL (unchanged) ---------- */
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL!;

/* ---------- Keys ---------- */
const supabaseKey = isServer
  /* On the server prefer SERVICE_ROLE → ANON → NEXT_PUBLIC  */
  ? process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  /* In the browser pick the public key only               */
  : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);
