"use client";

import { createBrowserClient } from "@supabase/ssr";

// Client-side Supabase client for office accounts (Supabase Auth).
// Uses @supabase/ssr so the session is stored in cookies the middleware
// (which runs on the server/Edge) can read too — a plain createClient()
// session lives only in localStorage and is invisible to middleware.

function clean(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s/g, "");
}

function readUrl() {
  const raw = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!raw) return "";
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export function getSupabaseBrowser() {
  const url = readUrl();
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!url || !key) {
    throw new Error("إعدادات Supabase غير مكتملة (URL أو ANON KEY).");
  }

  return createBrowserClient(url, key);
}