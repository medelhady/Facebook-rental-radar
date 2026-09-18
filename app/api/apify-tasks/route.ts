import { NextResponse } from "next/server";
import {
  addTaskToSchedule,
  getTaskOverview,
  normalizeTaskId,
  removeTaskFromSchedule
} from "@/lib/apify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = { label?: string; taskId?: string; id?: string; isActive?: boolean };

function noDatabase() {
  return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const label = body?.label?.trim() ?? "";
  const taskId = normalizeTaskId(body?.taskId ?? "");

  if (!label || !taskId) {
    return NextResponse.json({ error: "اكتب اسماً للحساب ومعرّف الـ Task." }, { status: 400 });
  }

  // Check the task exists and this token can read it before saving a row that
  // would otherwise fail silently on every sync from now on.
  let overview;
  try {
    overview = await getTaskOverview(taskId);
  } catch (error) {
    return NextResponse.json(
      {
        error: `تعذر قراءة الـ Task من Apify: ${
          error instanceof Error ? error.message : "خطأ غير معروف"
        }`
      },
      { status: 502 }
    );
  }

  const { data, error } = await supabase
    .from("apify_tasks")
    .insert({ label, task_id: taskId })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "هذا الـ Task مضاف مسبقاً." }, { status: 409 });
    }
    if (error.code === "42P01") {
      return NextResponse.json(
        { error: "جدول apify_tasks غير موجود. نفّذ supabase/apify-tasks.sql أولاً." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The task is saved either way; failing to reach the schedule is a warning,
  // not a reason to lose the row.
  let warning: string | undefined;
  try {
    await addTaskToSchedule(taskId);
  } catch (scheduleError) {
    warning =
      scheduleError instanceof Error
        ? `أُضيف الحساب لكن لم يُربط بالجدولة: ${scheduleError.message}`
        : "أُضيف الحساب لكن لم يُربط بالجدولة.";
  }

  return NextResponse.json(
    {
      task: data,
      overview,
      warning,
      message: `تمت إضافة «${label}» وربطه بالجدولة.`
    },
    { status: 201 }
  );
}

export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const id = body?.id?.trim() ?? "";
  if (!id || body?.isActive === undefined) {
    return NextResponse.json({ error: "حدد الحساب والحالة المطلوبة." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("apify_tasks")
    .update({ is_active: body.isActive })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "الحساب غير موجود." }, { status: 404 });

  // A paused account should stop costing money, which means leaving the
  // schedule, not just stopping its group sync.
  let warning: string | undefined;
  try {
    if (body.isActive) await addTaskToSchedule(data.task_id);
    else await removeTaskFromSchedule(data.task_id);
  } catch (scheduleError) {
    warning = scheduleError instanceof Error ? scheduleError.message : "تعذر تحديث الجدولة.";
  }

  return NextResponse.json({
    task: data,
    warning,
    message: body.isActive ? "تم تفعيل الحساب." : "تم إيقاف الحساب."
  });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return NextResponse.json({ error: "حدد الحساب المطلوب حذفه." }, { status: 400 });

  const { data: existing } = await supabase
    .from("apify_tasks")
    .select("task_id, label")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("apify_tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let warning: string | undefined;
  if (existing?.task_id) {
    try {
      await removeTaskFromSchedule(existing.task_id);
    } catch (scheduleError) {
      warning =
        scheduleError instanceof Error
          ? `حُذف الحساب لكنه ما زال في الجدولة: ${scheduleError.message}`
          : "حُذف الحساب لكنه ما زال في الجدولة.";
    }
  }

  // Groups keep their row; the foreign key sets their task to null, and they
  // stop being sent anywhere until reassigned.
  return NextResponse.json({
    deleted: true,
    warning,
    message: "تم حذف الحساب. مجموعاته بلا حساب الآن — أعد إسنادها."
  });
}
