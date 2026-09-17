import { NextResponse } from "next/server";
import { ALLOWED_INTERVALS, apifyConfigStatus, cronForInterval, syncApifySchedule } from "@/lib/apify";
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
  return NextResponse.json({
    intervalHours,
    cron: cronForInterval(intervalHours),
    updatedAt: data?.updated_at ?? null,
    allowed: ALLOWED_INTERVALS,
    apify: apifyConfigStatus()
  });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as { intervalHours?: number } | null;
  const intervalHours = Number(body?.intervalHours);

  let cron: string;
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

  return NextResponse.json({
    intervalHours,
    cron,
    message: `تم ضبط البحث كل ${intervalHours} ساعة.`
  });
}
