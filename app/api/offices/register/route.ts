import { NextResponse } from "next/server";
import { createApifyTask, addTaskToSchedule } from "@/lib/apify";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body = { officeName?: string; ownerEmail?: string; groupUrls?: string[]; authUserId?: string };

function noDatabase() {
  return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
}

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return noDatabase();

  const body = (await request.json().catch(() => null)) as Body | null;
  const officeName = body?.officeName?.trim() ?? "";
  const ownerEmail = body?.ownerEmail?.trim() ?? "";
  const groupUrls = body?.groupUrls ?? [];
  const authUserId = body?.authUserId?.trim() || null;

  if (!officeName || !ownerEmail) {
    return NextResponse.json({ error: "اكتب اسم المكتب والبريد الإلكتروني." }, { status: 400 });
  }

  // 1. تسجيل المكتب
  const { data: office, error: officeError } = await supabase
    .from("offices")
    .insert({ name: officeName, owner_email: ownerEmail, auth_user_id: authUserId })
    .select("*")
    .single();

  if (officeError) {
    if (officeError.code === "23505") {
      return NextResponse.json({ error: "هذا البريد مسجل مسبقاً." }, { status: 409 });
    }
    return NextResponse.json({ error: officeError.message }, { status: 500 });
  }

  // 2. إنشاء Apify Task خاص بهذا المكتب
  let taskId: string;
  try {
    taskId = await createApifyTask({ label: officeName, groupUrls });
  } catch (error) {
    // المكتب اتسجل لكن فشل إنشاء الـ Task — نرجع خطأ واضح بدل ما نخفي المشكلة
    return NextResponse.json(
      {
        office,
        error: `تم تسجيل المكتب لكن فشل إنشاء الـ Task: ${
          error instanceof Error ? error.message : "خطأ غير معروف"
        }`
      },
      { status: 502 }
    );
  }

  // 3. ربط الـ Task بالمكتب داخل apify_tasks
  const { data: task, error: taskError } = await supabase
    .from("apify_tasks")
    .insert({ label: officeName, task_id: taskId, office_id: office.id })
    .select("*")
    .single();

  if (taskError) {
    return NextResponse.json(
      { office, taskId, error: `تم إنشاء الـ Task لكن فشل ربطه: ${taskError.message}` },
      { status: 500 }
    );
  }

  // 4. إضافته للجدولة عشان يشتغل تلقائيًا
  let warning: string | undefined;
  try {
    await addTaskToSchedule(taskId);
  } catch (scheduleError) {
    warning =
      scheduleError instanceof Error
        ? `المكتب والـ Task جاهزين لكن لم يُربطا بالجدولة: ${scheduleError.message}`
        : "لم يُربط بالجدولة.";
  }

  return NextResponse.json(
    { office, task, warning, message: `تم تسجيل «${officeName}» وإنشاء نظامه.` },
    { status: 201 }
  );
}