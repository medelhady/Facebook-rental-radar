import { NextResponse } from "next/server";
import { getCurrentOffice } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getCookieStatus, syncApifyCookies } from "@/lib/apify";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function noDatabase() {
  return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
}

async function getOfficeTask(officeId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data } = await supabase
    .from("apify_tasks")
    .select("task_id")
    .eq("office_id", officeId)
    .maybeSingle();

  return data;
}

export async function GET() {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const task = await getOfficeTask(office.id);
  if (!task) return NextResponse.json({ error: "لا يوجد نظام مرتبط بهذا المكتب بعد." }, { status: 404 });

  try {
    const status = await getCookieStatus(task.task_id);
    return NextResponse.json({ status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر قراءة حالة الكوكيز." },
      { status: 502 }
    );
  }
}

type Body = { cookiesText?: string };

export async function POST(request: Request) {
  const office = await getCurrentOffice();
  if (!office) return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const task = await getOfficeTask(office.id);
  if (!task) return NextResponse.json({ error: "لا يوجد نظام مرتبط بهذا المكتب بعد." }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const cookiesText = body?.cookiesText?.trim() ?? "";

  if (!cookiesText) {
    return NextResponse.json({ error: "الصق الكوكيز أولاً." }, { status: 400 });
  }

  try {
    const status = await syncApifyCookies(task.task_id, cookiesText);

    // last_error يتصفّر هنا لأن كوكيز جديدة تعني بداية جديدة؛ لو فشل التشغيل
    // القادم فعليًا، الحقل يتحدّث من جديد بالمزامنة الدورية.
    await supabase.from("apify_tasks").update({ last_error: null }).eq("office_id", office.id);

    return NextResponse.json({ status, message: "تم تحديث الكوكيز بنجاح." });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "تعذر تحديث الكوكيز." },
      { status: 400 }
    );
  }
}