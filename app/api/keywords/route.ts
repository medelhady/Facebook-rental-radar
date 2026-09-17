import { NextResponse } from "next/server";
import { mapKeyword, type KeywordRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { KeywordType } from "@/lib/types";

export const dynamic = "force-dynamic";
// supabase-js calls fetch(); without this Next caches the first response forever.
export const fetchCache = "force-no-store";

const allowedTypes: KeywordType[] = ["include", "exclude", "location"];

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير مربوطة. أضف مفاتيح Supabase في .env.local ثم أعد التشغيل." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as { value?: string; type?: string } | null;
  const value = body?.value?.trim() ?? "";
  const type = body?.type as KeywordType | undefined;

  if (!value) {
    return NextResponse.json({ error: "اكتب الكلمة أولاً." }, { status: 400 });
  }

  if (!type || !allowedTypes.includes(type)) {
    return NextResponse.json({ error: "نوع الكلمة غير صحيح." }, { status: 400 });
  }

  const { data, error } = await supabase.from("keywords").insert({ value, type }).select("*").single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "هذه الكلمة مضافة مسبقاً بنفس النوع." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ keyword: mapKeyword(data as KeywordRow) }, { status: 201 });
}
