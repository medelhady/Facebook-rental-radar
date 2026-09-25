"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function OfficeSignupPage() {
  const router = useRouter();
  const [officeName, setOfficeName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseBrowser();

      // 1. إنشاء حساب الدخول
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email,
        password
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      const authUserId = authData.user?.id;
      if (!authUserId) {
        setError("تعذر إنشاء الحساب. حاول مرة أخرى.");
        setLoading(false);
        return;
      }

      // 2. إنشاء المكتب وربطه بالحساب + إنشاء Apify Task
      const res = await fetch("/api/offices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeName, ownerEmail: email, groupUrls: [], authUserId })
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error ?? "حدث خطأ غير متوقع.");
        setLoading(false);
        return;
      }

      router.push("/office/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
      setLoading(false);
    }
  }

  return (
    <main dir="rtl" style={{ maxWidth: 480, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>سجّل مكتبك العقاري</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>
        بعد التسجيل، رح ننشئ لك نظام جمع طلبات تلقائي من فيسبوك.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <label>
          اسم المكتب
          <input
            value={officeName}
            onChange={(e) => setOfficeName(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          البريد الإلكتروني
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          كلمة السر
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6 }}
        >
          {loading ? "جاري التسجيل..." : "سجّل الآن"}
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 14 }}>
        عندك حساب؟ <a href="/office/login">سجّل الدخول</a>
      </p>
    </main>
  );
}