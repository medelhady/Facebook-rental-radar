import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. Never import this file from a "use client" component:
// the service role key bypasses RLS and must stay on the server.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(url && serviceRoleKey);

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
