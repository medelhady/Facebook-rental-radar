import { NextResponse } from "next/server";
import { envTaskId, getRecentRuns, runTaskNow, type RunSummary } from "@/lib/apify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Supabase = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

async function taskFor(supabase: Supabase, rowId: string) {
  if (!rowId) return { taskId: envTaskId(), label: "الحساب الافتراضي" };

  const { data } = await supabase
    .from("apify_tasks")
    .select("task_id, label")
    .eq("id", rowId)
    .maybeSingle();

  const row = data as { task_id?: string; label?: string } | null;
  return { taskId: row?.task_id ?? envTaskId(), label: row?.label ?? "" };
}

// The three questions that otherwise mean opening the Apify console: did it
// run, how long did it take, and did anything come back.
export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const { data } = await supabase
    .from("apify_tasks")
    .select("id, label, task_id")
    .order("created_at", { ascending: true });

  const rows = (data ?? []) as Array<{ id: string; label: string; task_id: string }>;
  const targets =
    rows.length > 0
      ? rows
      : envTaskId()
      ? [{ id: "", label: "الحساب الافتراضي", task_id: envTaskId() }]
      : [];

  const results: Array<{ id: string; label: string; runs: RunSummary[]; error?: string }> = [];

  for (const row of targets) {
    try {
      results.push({ id: row.id, label: row.label, runs: await getRecentRuns(row.task_id) });
    } catch (error) {
      results.push({
        id: row.id,
        label: row.label,
        runs: [],
        error: error instanceof Error ? error.message : "تعذر قراءة التشغيلات."
      });
    }
  }

  // Both ways the radar goes quiet: runs that return nothing, and runs that
  // stop happening. The first is a dead Facebook session, the second is the
  // schedule or the Apify credit, and neither announces itself.
  const alerts: Array<{ label: string; message: string }> = [];
  const now = Date.now();

  for (const task of results) {
    if (task.error) {
      alerts.push({ label: task.label, message: task.error });
      continue;
    }

    const last = task.runs[0];
    if (!last) {
      alerts.push({ label: task.label, message: "لم يُسجَّل أي تشغيل بعد." });
      continue;
    }

    if (last.looksEmpty) {
      alerts.push({
        label: task.label,
        message: `آخر تشغيل رجع ${last.itemCount ?? 0} منشوراً فقط — الجلسة مُبطلة غالباً. جدّد الكوكيز.`
      });
      continue;
    }

    // The longest interval the dashboard offers is 24 hours, so a gap past
    // that is a stopped schedule rather than a slow one.
    const startedAt = last.startedAt ? new Date(last.startedAt).getTime() : 0;
    const hours = startedAt ? Math.floor((now - startedAt) / 3_600_000) : null;
    if (hours !== null && hours > 26) {
      alerts.push({
        label: task.label,
        message: `لم يشتغل منذ ${hours} ساعة — راجع الجدولة في Apify ورصيد الحساب.`
      });
    }
  }

  // No red banner is ambiguous on its own: it reads the same whether every
  // account is healthy or the check never ran. So health is stated positively
  // and the dashboard can show green rather than show nothing.
  const newest = results
    .flatMap((task) => task.runs.slice(0, 1))
    .filter((run) => run.startedAt)
    .sort((a, b) => new Date(b.startedAt!).getTime() - new Date(a.startedAt!).getTime())[0];

  const parts: string[] = [];
  if (newest?.startedAt) {
    const hours = Math.floor((now - new Date(newest.startedAt).getTime()) / 3_600_000);
    parts.push(hours < 1 ? "آخر تشغيل قبل أقل من ساعة" : `آخر تشغيل قبل ${hours} ساعة`);
  }
  if (newest?.itemCount !== null && newest?.itemCount !== undefined) {
    parts.push(`${newest.itemCount} منشور`);
  }

  return NextResponse.json({
    tasks: results,
    alerts,
    health: {
      ok: alerts.length === 0 && results.length > 0,
      accounts: results.length,
      summary: parts.join(" · ")
    }
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { taskRowId?: string } | null;
  const { taskId, label } = await taskFor(supabase, body?.taskRowId?.trim() ?? "");

  if (!taskId) {
    return NextResponse.json({ error: "لا يوجد Task محدد." }, { status: 400 });
  }

  try {
    const run = await runTaskNow(taskId);
    return NextResponse.json({
      run,
      // The webhook delivers the results, so the dashboard fills in by itself
      // a minute or two later rather than on this response.
      message: `بدأ تشغيل «${label}». النتائج تصل خلال دقيقة أو اثنتين عبر الويب هوك.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر بدء التشغيل." },
      { status: 502 }
    );
  }
}
