import { NextResponse } from "next/server";
import { describeSync, pushActiveGroups } from "@/lib/apify-sync";
import { mapGroup, type GroupRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
// supabase-js calls fetch(); without this Next caches the first response forever.
export const fetchCache = "force-no-store";

function normalizeFacebookUrl(value: string) {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  return `https://${trimmed}`;
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير مربوطة. أضف مفاتيح Supabase في .env.local ثم أعد التشغيل." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; url?: string; location?: string; apifyTaskId?: string }
    | null;

  const name = body?.name?.trim() ?? "";
  const url = normalizeFacebookUrl(body?.url ?? "");
  const location = body?.location?.trim() || null;
  const apifyTaskId = body?.apifyTaskId?.trim() || null;

  if (!name || !url) {
    return NextResponse.json({ error: "اكتب اسم المجموعة ورابط صحيح يبدأ بـ https://" }, { status: 400 });
  }

  if (!url.includes("facebook.com/groups/")) {
    return NextResponse.json({ error: "الرابط يجب أن يكون رابط مجموعة فيسبوك." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("facebook_groups")
    .insert({ name, url, location, apify_task_id: apifyTaskId })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "هذه المجموعة موجودة مسبقاً." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The group is saved either way. A failure to reach Apify is reported as a
  // warning, not an error, so the row is not lost over a bad token.
  let warning: string | undefined;
  try {
    const results = await pushActiveGroups();
    const failed = results.filter((result) => result.error);
    if (failed.length > 0) warning = describeSync(failed);
  } catch (syncError) {
    warning = syncError instanceof Error ? syncError.message : "تعذر تحديث قائمة المجموعات في Apify.";
  }

  return NextResponse.json({ group: mapGroup(data as GroupRow), warning }, { status: 201 });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير مربوطة. أضف مفاتيح Supabase في .env.local ثم أعد التشغيل." },
      { status: 503 }
    );
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "حدد المجموعة المطلوب حذفها." }, { status: 400 });
  }

  const { error } = await supabase.from("facebook_groups").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let warning: string | undefined;
  try {
    const results = await pushActiveGroups();
    const failed = results.filter((result) => result.error);
    if (failed.length > 0) warning = describeSync(failed);
  } catch (syncError) {
    warning = syncError instanceof Error ? syncError.message : "تعذر تحديث قائمة المجموعات في Apify.";
  }

  return NextResponse.json({ deleted: true, warning });
}
