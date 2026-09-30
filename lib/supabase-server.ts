import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client that reads the logged-in office's session from
// cookies. Used in API routes (Route Handlers) to find out which office is
// making the request — separate from supabase-admin.ts, which has no session
// concept at all and bypasses RLS entirely.

function clean(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s/g, "");
}

function readUrl() {
  const raw = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!raw) return "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export async function getSupabaseServer() {
  const url = readUrl();
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Route Handlers can set cookies; called from elsewhere this is a no-op.
        }
      }
    }
  });
}

// Looks up the office row for whoever's session is in the request cookies.
// Returns null if there is no session or no matching office.
export async function getCurrentOffice() {
  const supabase = await getSupabaseServer();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: office } = await supabase
    .from("offices")
    .select("id, name, owner_email")
    .eq("auth_user_id", user.id)
    .single();

  return office ?? null;
}