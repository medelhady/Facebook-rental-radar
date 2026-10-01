import { NextResponse } from "next/server";
import { getCurrentOffice } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });

  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, ad_text, ad_date, post_url, extracted_area, extracted_type, contact_info, created_at")
    .eq("office_id", office.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ leads: leads ?? [] });
}