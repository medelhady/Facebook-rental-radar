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

type GroupData = {
  id: string;
  url: string;
  status: string | null;
  last_checked_at: string | null;
  last_error: string | null;
};

export default function OfficeDashboardPage() {
  const router = useRouter();
  const [office, setOffice] = useState<OfficeData | null>(null);
  const [task, setTask] = useState<TaskData | null>(null);
  const [groups, setGroups] = useState<GroupData[]>([]);
  const [groupUrlsText, setGroupUrlsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groupsMessage, setGroupsMessage] = useState<string | null>(null);

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

      // المجموعات تُجلب عبر الـ API (يحتاج صلاحيات service role لقراءتها بأمان)
      const res = await fetch("/api/offices/groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups ?? []);
        setGroupUrlsText((data.groups ?? []).map((g: GroupData) => g.url).join("\n"));
      }

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleSaveGroups(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setGroupsMessage(null);

    const groupUrls = groupUrlsText
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/offices/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupUrls })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setGroupsMessage(data.error ?? "حدث خطأ غير متوقع.");
      } else {
        setGroupsMessage(data.warning ? `تم الحفظ، لكن: ${data.warning}` : "تم تحديث المجموعات بنجاح.");
        const refreshed = await fetch("/api/offices/groups");
        if (refreshed.ok) {
          const refreshedData = await refreshed.json();
          setGroups(refreshedData.groups ?? []);
        }
      }
    } catch (err) {
      setGroupsMessage(err instanceof Error ? err.message : "تعذر الاتصال بالسيرفر.");
    } finally {
      setSaving(false);
    }
  }

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

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 16 }}>
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

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>مجموعات فيسبوك</h2>
        <p style={{ color: "#555", fontSize: 14, marginBottom: 12 }}>
          أضف روابط المجموعات التي تريد جمع الطلبات منها (رابط واحد بكل سطر).
        </p>

        <form onSubmit={handleSaveGroups} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={groupUrlsText}
            onChange={(e) => setGroupUrlsText(e.target.value)}
            rows={5}
            placeholder={"https://www.facebook.com/groups/123456789"}
            style={{ width: "100%", padding: 8 }}
          />

          {groupsMessage && (
            <p style={{ color: groupsMessage.includes("بنجاح") ? "green" : "red" }}>{groupsMessage}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6 }}
          >
            {saving ? "جاري الحفظ..." : "احفظ المجموعات"}
          </button>
        </form>

        {groups.length > 0 && (
          <table style={{ width: "100%", marginTop: 16, fontSize: 14, borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "right", padding: 4 }}>الرابط</th>
                <th style={{ textAlign: "right", padding: 4 }}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 4, wordBreak: "break-all" }}>{g.url}</td>
                  <td style={{ padding: 4 }}>{g.status ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}