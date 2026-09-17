import { NextResponse } from "next/server";
import {
  ALLOWED_INTERVALS,
  apifyConfigStatus,
  cronForInterval,
  getTaskOverview,
  listSchedules,
  MAX_RESULTS_LIMIT,
  syncApifyResultsLimit,
  syncApifySchedule,
  type ScheduleSummary,
  type TaskOverview
} from "@/lib/apify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("schedule_settings")
    .select("interval_hours, updated_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const intervalHours = data?.interval_hours ?? 6;
  const apify = apifyConfigStatus();

  // With a token but no schedule id, the account's schedules are listed so the
  // id can be read off this screen instead of the Apify console.
  let candidates: ScheduleSummary[] = [];
  let candidatesError: string | null = null;
  if (apify.hasToken && !apify.hasScheduleId) {
    try {
      candidates = await listSchedules();
      if (candidates.length === 0) {
        candidatesError = "التوكن يعمل، لكن لا توجد أي جدولة في هذا الحساب. أنشئ واحدة في Apify أولاً.";
      }
    } catch (listError) {
      // Swallowing this left the screen looking identical to a deploy that
      // never happened, with nothing to tell the two apart.
      candidatesError = listError instanceof Error ? listError.message : "تعذر قراءة الجدولات.";
    }
  }

  // The task is the single source of truth for the cap and the group count,
  // so it is read live rather than mirrored into Supabase and drifting.
  let task: TaskOverview | null = null;
  let taskError: string | null = null;
  if (apify.hasToken && apify.hasTaskId) {
    try {
      task = await getTaskOverview();
    } catch (readError) {
      taskError = readError instanceof Error ? readError.message : "تعذر قراءة إعدادات الـ Task.";
    }
  }

  return NextResponse.json({
    intervalHours,
    cron: cronForInterval(intervalHours),
    updatedAt: data?.updated_at ?? null,
    allowed: ALLOWED_INTERVALS,
    maxResultsLimit: MAX_RESULTS_LIMIT,
    apify,
    candidates,
    candidatesError,
    task,
    taskError
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { intervalHours?: number; resultsLimit?: number }
    | null;

  const wantsInterval = body?.intervalHours !== undefined;
  const wantsLimit = body?.resultsLimit !== undefined;
  if (!wantsInterval && !wantsLimit) {
    return NextResponse.json({ error: "لا يوجد شيء لحفظه." }, { status: 400 });
  }

  const done: string[] = [];
  let cron: string | undefined;

  if (wantsInterval) {
    const intervalHours = Number(body?.intervalHours);
    try {
      cron = cronForInterval(intervalHours);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "قيمة غير صالحة." },
        { status: 400 }
      );
    }

    // Apify goes first: if it refuses, the saved value would be a lie.
    try {
      await syncApifySchedule(intervalHours);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "تعذر تحديث الجدولة في Apify." },
        { status: 502 }
      );
    }

    const { error } = await supabase
      .from("schedule_settings")
      .upsert({ id: 1, interval_hours: intervalHours, updated_at: new Date().toISOString() });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    done.push(`البحث كل ${intervalHours} ساعة`);
  }

  if (wantsLimit) {
    try {
      const result = await syncApifyResultsLimit(Number(body?.resultsLimit));
      done.push(`${result.limit} نتيجة لكل مجموعة (الحقل ${result.key})`);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "تعذر تحديث عدد النتائج." },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ cron, message: `تم الحفظ: ${done.join("، ")}.` });
}
