import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only. Never import this file from a "use client" component:
// the service role key bypasses RLS and must stay on the server.

// Values pasted into a hosting dashboard pick up stray spaces, quotes and
// newlines. Left alone they make createClient throw and the route 500s.
function clean(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s/g, "");
}

function readUrl() {
  const raw = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!raw) return "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export type SupabaseConfigStatus = {
  hasUrl: boolean;
  hasServiceKey: boolean;
  urlValid: boolean;
  urlHost: string;
  serviceKeyLength: number;
  problem?: string;
};

export function supabaseConfigStatus(): SupabaseConfigStatus {
  const url = readUrl();
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  let urlValid = false;
  let urlHost = "";
  try {
    urlHost = new URL(url).host;
    urlValid = urlHost.length > 0;
  } catch {
    urlValid = false;
  }

  const status: SupabaseConfigStatus = {
    hasUrl: url.length > 0,
    hasServiceKey: key.length > 0,
    urlValid,
    urlHost,
    serviceKeyLength: key.length
  };

  if (!status.hasUrl) status.problem = "NEXT_PUBLIC_SUPABASE_URL غير موجود.";
  else if (!urlValid) status.problem = "NEXT_PUBLIC_SUPABASE_URL ليس رابطاً صالحاً.";
  else if (!status.hasServiceKey) status.problem = "SUPABASE_SERVICE_ROLE_KEY غير موجود.";
  else if (key.length < 100) status.problem = "SUPABASE_SERVICE_ROLE_KEY يبدو مقتطعاً.";

  return status;
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const status = supabaseConfigStatus();
  if (!status.hasUrl || !status.urlValid || !status.hasServiceKey) return null;

  return createClient(readUrl(), clean(process.env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
