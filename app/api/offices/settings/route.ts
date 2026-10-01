import { NextResponse } from "next/server";
import { getCurrentOffice } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  addTaskToSchedule,
  removeTaskFromSchedule,
  syncApifyResultsLimit,
  getTaskOverview,
  MAX_RESULTS_LIMIT
} from "@/lib/apify";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

async function getOfficeTaskRow(officeId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("apify_tasks")
    .select("id, task_id, is_active")
    .eq("office_id", officeId)
    .maybeSingle();

  return data;
}

export async function GET() {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const task = await getOfficeTaskRow(office.id);
  if (!task) return NextResponse.json({ error: "لا يوجد نظام مرتبط بهذا المكتب بعد." }, { status: 404 });

  try {
    const overview = await getTaskOverview(task.task_id);
    return NextResponse.json({
      isActive: task.is_active,
      resultsLimit: overview.resultsLimit,
      maxResultsLimit: MAX_RESULTS_LIMIT
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر قراءة الإعدادات." },
      { status: 502 }
    );
  }
}

type Body = { isActive?: boolean; resultsLimit?: number };

export async function POST(request: Request) {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });

  const task = await getOfficeTaskRow(office.id);
  if (!task) return NextResponse.json({ error: "لا يوجد نظام مرتبط بهذا المكتب بعد." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const warnings: string[] = [];

  if (typeof body?.isActive === "boolean") {
    try {
      if (body.isActive) await addTaskToSchedule(task.task_id);
      else await removeTaskFromSchedule(task.task_id);

      await supabase.from("apify_tasks").update({ is_active: body.isActive }).eq("id", task.id);
    } catch (error) {
      warnings.push(`تعذر تحديث حالة التشغيل: ${error instanceof Error ? error.message : "خطأ غير معروف"}`);
    }
  }

  if (typeof body?.resultsLimit === "number") {
    try {
      await syncApifyResultsLimit(task.task_id, body.resultsLimit);
    } catch (error) {
      warnings.push(`تعذر تحديث عدد النتائج: ${error instanceof Error ? error.message : "خطأ غير معروف"}`);
    }
  }

  if (warnings.length > 0) {
    return NextResponse.json({ error: warnings.join(" / ") }, { status: 502 });
  }

  return NextResponse.json({ message: "تم تحديث الإعدادات بنجاح." });
}