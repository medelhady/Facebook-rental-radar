import { NextResponse } from "next/server";
import {
  ALLOWED_INTERVALS,
  apifyConfigStatus,
  cronForInterval,
  envTaskId,
  getTaskOverview,
  listSchedules,
  MAX_RESULTS_LIMIT,
  syncApifyResultsLimit,
  syncApifySchedule,
  type ScheduleSummary,
  type TaskOverview
} from "@/lib/apify";
import { mapApifyTask, type ApifyTaskRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

// The apify_tasks table is the source of truth once it exists. Before the
// migration runs, the single task named in the environment stands in for it so
// a half-migrated deployment keeps working.
async function activeTaskIds(supabase: Supabase) {
  const { data, error } = await supabase
    .from("apify_tasks")
    .select("task_id")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    const fallback = envTaskId();
    return fallback ? [fallback] : [];
  }

  return (data as Array<{ task_id: string }>).map((row) => row.task_id);
}

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

  const { data: taskRows } = await supabase
    .from("apify_tasks")
    .select("*")
    .order("created_at", { ascending: true });

  // Each task is read live from Apify: the cap and the group count belong to
  // the task, and mirroring them into Supabase only lets the two drift.
  const overviews: TaskOverview[] = [];
  let taskError: string | null = null;
  if (apify.hasToken) {
    for (const id of await activeTaskIds(supabase)) {
      try {
        overviews.push(await getTaskOverview(id));
      } catch (readError) {
        taskError = `${id}: ${readError instanceof Error ? readError.message : "تعذر القراءة"}`;
      }
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
    tasks: ((taskRows ?? []) as ApifyTaskRow[]).map(mapApifyTask),
    overviews,
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
    const ids = await activeTaskIds(supabase);
    if (ids.length === 0) {
      return NextResponse.json({ error: "لا يوجد أي حساب مفعّل لتطبيق العدد عليه." }, { status: 400 });
    }

    // The cap is per run, so every active account gets the same one. A failure
    // on one account is reported rather than silently leaving it behind.
    const failures: string[] = [];
    for (const id of ids) {
      try {
        await syncApifyResultsLimit(id, Number(body?.resultsLimit));
      } catch (error) {
        failures.push(`${id}: ${error instanceof Error ? error.message : "تعذر التحديث"}`);
      }
    }

    if (failures.length === ids.length) {
      return NextResponse.json({ error: failures.join(" · ") }, { status: 502 });
    }

    done.push(`${Number(body?.resultsLimit)} نتيجة لكل مجموعة على ${ids.length - failures.length} حساب`);
    if (failures.length > 0) done.push(`لم ينجح: ${failures.join(" · ")}`);
  }

  return NextResponse.json({ cron, message: `تم الحفظ: ${done.join("، ")}.` });
}
