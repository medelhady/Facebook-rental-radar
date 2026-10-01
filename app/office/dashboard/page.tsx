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

type LeadData = {
  id: string;
  ad_text: string;
  ad_date: string | null;
  post_url: string | null;
  extracted_area: string | null;
  extracted_type: string | null;
  contact_info: string | null;
  created_at: string;
};

type CookieStatus = {
  key: string | null;
  count: number;
  hasSession: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
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
  const [cookieStatus, setCookieStatus] = useState<CookieStatus | null>(null);
  const [cookiesText, setCookiesText] = useState("");
  const [savingCookies, setSavingCookies] = useState(false);
  const [cookiesMessage, setCookiesMessage] = useState<string | null>(null);
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [resultsLimit, setResultsLimit] = useState<number>(60);
  const [maxResultsLimit, setMaxResultsLimit] = useState<number>(1000);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);

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

      const cookieRes = await fetch("/api/offices/cookies");
      if (cookieRes.ok) {
        const cookieData = await cookieRes.json();
        setCookieStatus(cookieData.status ?? null);
      }

      const leadsRes = await fetch("/api/offices/leads");
      if (leadsRes.ok) {
        const leadsData = await leadsRes.json();
        setLeads(leadsData.leads ?? []);
      }

      const settingsRes = await fetch("/api/offices/settings");
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (typeof settingsData.resultsLimit === "number") setResultsLimit(settingsData.resultsLimit);
        if (typeof settingsData.maxResultsLimit === "number") setMaxResultsLimit(settingsData.maxResultsLimit);
        if (typeof settingsData.isActive === "boolean" && taskData) {
          setTask({ ...taskData, is_active: settingsData.isActive });
        }
      }

      setLoading(false);
    }

    load();
  }, [router]);

  async function handleToggleActive() {
    if (!task) return;
    setSavingSettings(true);
    setSettingsMessage(null);

    const nextActive = !task.is_active;
    try {
      const res = await fetch("/api/offices/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setSettingsMessage(data.error ?? "حدث خطأ غير متوقع.");
      } else {
        setTask({ ...task, is_active: nextActive });
        setSettingsMessage(nextActive ? "تم تفعيل النظام." : "تم إيقاف النظام.");
      }
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "تعذر الاتصال بالسيرفر.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveResultsLimit(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage(null);

    try {
      const res = await fetch("/api/offices/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultsLimit })
      });
      const data = await res.json();

      setSettingsMessage(!res.ok || data.error ? data.error ?? "حدث خطأ غير متوقع." : "تم تحديث عدد النتائج.");
    } catch (err) {
      setSettingsMessage(err instanceof Error ? err.message : "تعذر الاتصال بالسيرفر.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function handleSaveCookies(e: React.FormEvent) {
    e.preventDefault();
    setSavingCookies(true);
    setCookiesMessage(null);

    try {
      const res = await fetch("/api/offices/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cookiesText })
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        setCookiesMessage(data.error ?? "حدث خطأ غير متوقع.");
      } else {
        setCookiesMessage("تم تحديث الكوكيز بنجاح.");
        setCookieStatus(data.status ?? null);
        setCookiesText("");
      }
    } catch (err) {
      setCookiesMessage(err instanceof Error ? err.message : "تعذر الاتصال بالسيرفر.");
    } finally {
      setSavingCookies(false);
    }
  }

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

            <button
              onClick={handleToggleActive}
              disabled={savingSettings}
              style={{
                padding: "8px 16px",
                marginTop: 8,
                marginBottom: 12,
                border: "1px solid #ccc",
                borderRadius: 6,
                background: task.is_active ? "#fef2f2" : "#f0fdf4",
                color: task.is_active ? "#b91c1c" : "#15803d"
              }}
            >
              {task.is_active ? "إيقاف النظام" : "تفعيل النظام"}
            </button>

            <form onSubmit={handleSaveResultsLimit} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 14 }}>عدد النتائج لكل مجموعة (الحد الأقصى {maxResultsLimit}):</label>
              <input
                type="number"
                min={1}
                max={maxResultsLimit}
                value={resultsLimit}
                onChange={(e) => setResultsLimit(Number(e.target.value))}
                style={{ width: 80, padding: 4 }}
              />
              <button
                type="submit"
                disabled={savingSettings}
                style={{ padding: "6px 12px", border: "1px solid #ccc", borderRadius: 6 }}
              >
                حفظ
              </button>
            </form>

            {settingsMessage && (
              <p style={{ marginTop: 8, color: settingsMessage.includes("تم") ? "green" : "red" }}>
                {settingsMessage}
              </p>
            )}
          </>
        ) : (
          <p>لا يوجد نظام مرتبط بعد.</p>
        )}
      </div>

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>حساب فيسبوك (الكوكيز)</h2>

        {cookieStatus?.hasSession ? (
          <p style={{ marginBottom: 12 }}>
            <strong>الحالة:</strong>{" "}
            {cookieStatus.daysLeft !== null && cookieStatus.daysLeft >= 0
              ? `متصل — تنتهي خلال ${cookieStatus.daysLeft} يوم`
              : "متصل، لكن يُنصح بالتجديد قريباً"}
          </p>
        ) : (
          <p style={{ marginBottom: 12, color: "#b45309" }}>
            لا يوجد حساب فيسبوك متصل بعد. الصق الكوكيز بالأسفل عشان يبدأ النظام يجمع لك.
          </p>
        )}

        <p style={{ color: "#555", fontSize: 14, marginBottom: 12 }}>
          افتح فيسبوك بمتصفحك (بحساب ثانوي، ليس حسابك الشخصي)، سجّل دخول، ثم استخدم إضافة
          Cookie-Editor لتصدير الكوكيز والصقها هنا.
        </p>

        <form onSubmit={handleSaveCookies} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <textarea
            value={cookiesText}
            onChange={(e) => setCookiesText(e.target.value)}
            rows={4}
            placeholder='[{"name":"c_user","value":"..."}, ...]'
            style={{ width: "100%", padding: 8, fontFamily: "monospace", fontSize: 12 }}
          />

          {cookiesMessage && (
            <p style={{ color: cookiesMessage.includes("بنجاح") ? "green" : "red" }}>{cookiesMessage}</p>
          )}

          <button
            type="submit"
            disabled={savingCookies}
            style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6 }}
          >
            {savingCookies ? "جاري الحفظ..." : "احفظ الكوكيز"}
          </button>
        </form>
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

      <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginTop: 16 }}>
        <h2 style={{ fontSize: 18, marginBottom: 8 }}>الطلبات المستخرجة ({leads.length})</h2>

        {leads.length === 0 ? (
          <p style={{ color: "#555" }}>
            لا توجد نتائج بعد. بعد ما يشتغل النظام على مجموعاتك، تظهر الطلبات هنا تلقائياً.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {leads.map((lead) => (
              <div key={lead.id} style={{ border: "1px solid #f0f0f0", borderRadius: 6, padding: 12, fontSize: 14 }}>
                <p style={{ marginBottom: 6, whiteSpace: "pre-wrap" }}>{lead.ad_text}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "#555", fontSize: 13 }}>
                  {lead.extracted_type && <span><strong>النوع:</strong> {lead.extracted_type}</span>}
                  {lead.extracted_area && <span><strong>المنطقة:</strong> {lead.extracted_area}</span>}
                  {lead.contact_info && <span><strong>التواصل:</strong> {lead.contact_info}</span>}
                </div>
                {lead.post_url && (
                  <a href={lead.post_url} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: "#2563eb" }}>
                    رابط المنشور الأصلي
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}