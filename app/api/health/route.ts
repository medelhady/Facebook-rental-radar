import { NextResponse } from "next/server";
import { getSupabaseAdmin, supabaseConfigStatus } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// Diagnostics for a deployment you cannot open a terminal on.
// Reports whether the env vars are usable and whether the database answers.
// Never returns a key — only whether one is present and how long it is.
export async function GET() {
  const config = supabaseConfigStatus();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ ok: false, config, database: "not configured" });
  }

  try {
    const { count, error } = await supabase
      .from("facebook_groups")
      .select("*", { count: "exact", head: true });

    if (error) {
      return NextResponse.json({ ok: false, config, database: "error", error: error.message });
    }

    return NextResponse.json({ ok: true, config, database: "connected", groups: count ?? 0 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      config,
      database: "threw",
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
