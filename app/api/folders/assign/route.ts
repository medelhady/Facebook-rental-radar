import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = { leadId?: string; folderId?: string; name?: string };

// Files an ad into a folder, creating the folder first when a name is sent
// instead of an id. That is the one-button case: file this, into a list that
// does not exist yet, without leaving the row.
export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const leadId = body?.leadId?.trim() ?? "";
  let folderId = body?.folderId?.trim() ?? "";
  const name = body?.name?.trim() ?? "";

  if (!leadId) return NextResponse.json({ error: "حدد الإعلان." }, { status: 400 });
  if (!folderId && !name) {
    return NextResponse.json({ error: "اختر ملفاً أو اكتب اسماً جديداً." }, { status: 400 });
  }

  let created: unknown = null;

  if (!folderId) {
    const { data, error } = await supabase
      .from("lead_folders")
      .insert({ name })
      .select("*")
      .single();

    if (error) {
      // Racing two rows into the same name is fine; the existing one is used.
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("lead_folders")
          .select("*")
          .eq("name", name)
          .maybeSingle();
        if (!existing) {
          return NextResponse.json({ error: "تعذر إنشاء الملف." }, { status: 500 });
        }
        folderId = (existing as { id: string }).id;
      } else if (error.code === "42P01") {
        return NextResponse.json(
          { error: "جدول الملفات غير موجود. نفّذ supabase/lead-folders.sql أولاً." },
          { status: 503 }
        );
      } else {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      created = data;
      folderId = (data as { id: string }).id;
    }
  }

  // Filing the same ad twice is a no-op rather than an error, because the
  // button does not know what is already in the folder.
  const { error } = await supabase
    .from("lead_folder_items")
    .upsert({ folder_id: folderId, lead_id: leadId }, { onConflict: "folder_id,lead_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ folderId, created, message: "أُضيف إلى الملف." });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const params = new URL(request.url).searchParams;
  const leadId = params.get("leadId")?.trim() ?? "";
  const folderId = params.get("folderId")?.trim() ?? "";

  if (!leadId || !folderId) {
    return NextResponse.json({ error: "حدد الإعلان والملف." }, { status: 400 });
  }

  const { error } = await supabase
    .from("lead_folder_items")
    .delete()
    .eq("lead_id", leadId)
    .eq("folder_id", folderId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ removed: true, message: "أُزيل من الملف." });
}
