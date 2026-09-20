import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = { id?: string; name?: string };

function noDatabase() {
  return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
}

function missingTable() {
  return NextResponse.json(
    { error: "جدول الملفات غير موجود. نفّذ supabase/lead-folders.sql أولاً." },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const name = body?.name?.trim() ?? "";

  if (!name) return NextResponse.json({ error: "اكتب اسم الملف." }, { status: 400 });
  if (name.length > 60) {
    return NextResponse.json({ error: "الاسم طويل — 60 حرفاً كحد أقصى." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lead_folders")
    .insert({ name })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "يوجد ملف بهذا الاسم." }, { status: 409 });
    }
    if (error.code === "42P01") return missingTable();
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folder: data, message: `تم إنشاء «${name}».` }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const id = body?.id?.trim() ?? "";
  const name = body?.name?.trim() ?? "";

  if (!id || !name) {
    return NextResponse.json({ error: "حدد الملف والاسم الجديد." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("lead_folders")
    .update({ name })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "يوجد ملف بهذا الاسم." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ folder: data, message: "تم تغيير الاسم." });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "حدد الملف المطلوب حذفه." }, { status: 400 });

  // The rows in lead_folder_items go with it, but the ads themselves do not:
  // deleting a folder is un-filing, not discarding.
  const { error } = await supabase.from("lead_folders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true, message: "حُذف الملف. الإعلانات نفسها باقية." });
}
