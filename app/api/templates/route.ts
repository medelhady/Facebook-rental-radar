import { NextResponse } from "next/server";
import { mapTemplate, type TemplateRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
// supabase-js calls fetch(); without this Next caches the first response forever.
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير مربوطة. أضف مفاتيح Supabase في .env.local ثم أعد التشغيل." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { title?: string; body?: string } | null;
  const title = body?.title?.trim() ?? "";
  const text = body?.body?.trim() ?? "";

  if (!text) {
    return NextResponse.json({ error: "اكتب نص القالب أولاً." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("comment_templates")
    .insert({ title: title || "قالب بدون عنوان", body: text })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: mapTemplate(data as TemplateRow) }, { status: 201 });
}
