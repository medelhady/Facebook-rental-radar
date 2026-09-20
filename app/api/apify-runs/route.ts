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

  return NextResponse.json({ tasks: results });
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
