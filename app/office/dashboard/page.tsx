"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

type OfficeData = {
  id: string;
  name: string;
  owner_email: string;
  subscription_status: string;
};

type TaskData = {
  task_id: string;
  is_active: boolean;
  last_synced_at: string | null;
  last_error: string | null;
};

export default function OfficeDashboardPage() {
  const router = useRouter();
  const [office, setOffice] = useState<OfficeData | null>(null);
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const supabase = getSupabaseBrowser();

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/office/login");
        return;
      }

      const { data: officeData, error: officeError } = await supabase
        .from("offices")
        .select("id, name, owner_email, subscription_status")
        .eq("auth_user_id", user.id)
        .single();

      if (officeError || !officeData) {
        setError("تعذر إيجاد بيانات المكتب المرتبط بهذا الحساب.");
        setLoading(false);
        return;
      }

      setOffice(officeData);

      const { data: taskData } = await supabase
        .from("apify_tasks")
        .select("task_id, is_active, last_synced_at, last_error")
        .eq("office_id", officeData.id)
        .maybeSingle();

      setTask(taskData ?? null);
      setLoading(false);
    }

    load();
  }, [router]);

  async function handleLogout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/office/login");
  }

  if (loading) {
    return (
      <main dir="rtl" style={{ maxWidth: 640, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
        جاري التحميل...
      </main>
    );
  }

  if (error) {
    return (
      <main dir="rtl" style={{ maxWidth: 640, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
        <p style={{ color: "red" }}>{error}</p>
      </main>
    );
  }

  return (
    <main dir="rtl" style={{ maxWidth: 640, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24 }}>لوحة {office?.name}</h1>
        <button onClick={handleLogout} style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: 6 }}>
          تسجيل خروج
        </button>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <p><strong>البريد:</strong> {office?.owner_email}</p>
        <p><strong>حالة الاشتراك:</strong> {office?.subscription_status}</p>
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>نظام الجمع التلقائي</h2>
        {task ? (
          <>
            <p><strong>الحالة:</strong> {task.is_active ? "مفعّل" : "متوقف"}</p>
            <p><strong>آخر مزامنة:</strong> {task.last_synced_at ?? "لم تتم بعد"}</p>
            {task.last_error && <p style={{ color: "red" }}><strong>آخر خطأ:</strong> {task.last_error}</p>}
          </>
        ) : (
          <p>لا يوجد نظام مرتبط بعد.</p>
        )}
      </div>
    </main>
  );
}