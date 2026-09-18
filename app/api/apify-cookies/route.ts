import { NextResponse } from "next/server";
import { envTaskId, getCookieStatus, syncApifyCookies } from "@/lib/apify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// This route carries a live Facebook session on its way to Apify, and these
// routes have no login. Setting ADMIN_TOKEN requires a shared secret on writes;
// leaving it unset keeps the route open, which is only safe on localhost.
function unauthorized(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) return null;
  if (request.headers.get("x-admin-token") === expected) return null;
  return NextResponse.json({ error: "كلمة مرور الإدارة غير صحيحة." }, { status: 401 });
}

// Accepts the task by its row id in apify_tasks, and falls back to the
// environment task so this works before the table is filled.
async function resolveTaskId(rowId: string) {
  if (!rowId) return envTaskId();

  const supabase = getSupabaseAdmin();
  if (!supabase) return envTaskId();

  const { data } = await supabase
    .from("apify_tasks")
    .select("task_id")
    .eq("id", rowId)
    .maybeSingle();

  return (data as { task_id?: string } | null)?.task_id ?? envTaskId();
}

// Returns counts and an expiry date. Never the cookie values: a read that
// could hand them back would make every other safeguard here pointless.
export async function GET(request: Request) {
  const rowId = new URL(request.url).searchParams.get("taskRowId")?.trim() ?? "";
  const taskId = await resolveTaskId(rowId);

  if (!taskId) {
    return NextResponse.json({ error: "لا يوجد Task محدد." }, { status: 400 });
  }

  try {
    return NextResponse.json({ taskId, status: await getCookieStatus(taskId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر قراءة حالة الكوكيز." },
      { status: 502 }
    );
  }
}

export async function POST(request: Request) {
  const denied = unauthorized(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as
    | { taskRowId?: string; cookies?: string }
    | null;

  const taskId = await resolveTaskId(body?.taskRowId?.trim() ?? "");
  if (!taskId) {
    return NextResponse.json({ error: "لا يوجد Task محدد." }, { status: 400 });
  }

  try {
    const status = await syncApifyCookies(taskId, body?.cookies ?? "");

    // A paste that parses but carries no session is the failure worth catching
    // here: the run would succeed, return almost nothing, and report no error.
    if (!status.hasSession) {
      return NextResponse.json(
        {
          status,
          warning:
            "حُفظت الكوكيز لكنها لا تحتوي c_user و xs — الجلسة ناقصة ولن ينجح تسجيل الدخول. صدّرها من جديد وأنت مسجّل الدخول فعلاً."
        },
        { status: 200 }
      );
    }

    return NextResponse.json({
      status,
      message: `تم حفظ ${status.count} كوكي${
        status.daysLeft !== null ? ` — تنتهي بعد ${status.daysLeft} يوماً` : ""
      }.`
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر حفظ الكوكيز." },
      { status: 502 }
    );
  }
}
