import { NextResponse } from "next/server";
import { getCurrentOffice } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { syncApifyGroups, addTaskToSchedule } from "@/lib/apify";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function noDatabase() {
  return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
}

export async function GET() {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const { data: groups, error } = await supabase
    .from("facebook_groups")
    .select("id, url, status, last_checked_at, last_error")
    .eq("office_id", office.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ groups: groups ?? [] });
}

type Body = { groupUrls?: string[] };

export async function POST(request: Request) {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const groupUrls = (body?.groupUrls ?? []).map((url) => url.trim()).filter(Boolean);

  if (groupUrls.length === 0) {
    return NextResponse.json({ error: "أضف رابط مجموعة واحد على الأقل." }, { status: 400 });
  }

  // 1. جلب الـ Task المرتبط بهذا المكتب
  const { data: task, error: taskError } = await supabase
    .from("apify_tasks")
    .select("id, task_id")
    .eq("office_id", office.id)
    .maybeSingle();

  if (taskError) return NextResponse.json({ error: taskError.message }, { status: 500 });
  if (!task) return NextResponse.json({ error: "لا يوجد نظام مرتبط بهذا المكتب بعد." }, { status: 404 });

  // 2. تحديث المجموعات على Apify نفسه (يستبدل الـ placeholder أو القائمة القديمة)
  try {
    await syncApifyGroups(task.task_id, groupUrls);
  } catch (error) {
    return NextResponse.json(
      { error: `تعذر تحديث المجموعات على Apify: ${error instanceof Error ? error.message : "خطأ غير معروف"}` },
      { status: 502 }
    );
  }

  // 3. حفظ نفس القائمة بجدول facebook_groups (نمسح القديم ونضيف الجديد، أبسط من مقارنة الفروقات)
  await supabase.from("facebook_groups").delete().eq("office_id", office.id);

  const { error: insertError } = await supabase
    .from("facebook_groups")
    .insert(groupUrls.map((url) => ({ url, office_id: office.id, apify_task_id: task.id })));

  if (insertError) {
    return NextResponse.json(
      { warning: `تحدّثت المجموعات على Apify لكن فشل حفظها محلياً: ${insertError.message}` },
      { status: 207 }
    );
  }

  // 4. تفعيل الجدولة الآن بعد ما صار فيه مجموعات حقيقية
  let warning: string | undefined;
  try {
    await addTaskToSchedule(task.task_id);
  } catch (scheduleError) {
    warning = scheduleError instanceof Error ? scheduleError.message : "تعذر تفعيل الجدولة.";
  }

  return NextResponse.json({ message: "تم تحديث المجموعات بنجاح.", warning });
}