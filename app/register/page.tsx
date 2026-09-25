"use client";

import { useState } from "react";

type RegisterResult = {
  office?: { id: string; name: string };
  error?: string;
  warning?: string;
  message?: string;
};

export default function RegisterPage() {
  const [officeName, setOfficeName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [groupUrlsText, setGroupUrlsText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RegisterResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    const groupUrls = groupUrlsText
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);

    try {
      const res = await fetch("/api/offices/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ officeName, ownerEmail, groupUrls })
      });
      const data = (await res.json()) as RegisterResult;
      setResult(data);
    } catch {
      setResult({ error: "تعذر الاتصال بالسيرفر. حاول مرة أخرى." });
    } finally {
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
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <label>
          روابط مجموعات فيسبوك (رابط واحد بكل سطر)
          <textarea
            value={groupUrlsText}
            onChange={(e) => setGroupUrlsText(e.target.value)}
            rows={4}
            placeholder={"https://www.facebook.com/groups/123456789\nhttps://www.facebook.com/groups/987654321"}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6 }}
        >
          {loading ? "جاري التسجيل..." : "سجّل الآن"}
        </button>
      </form>

      {result?.office && !result.error && (
        <p style={{ marginTop: 16, color: "green" }}>
          تم تسجيل «{result.office.name}» بنجاح! رح نتواصل معك قريباً.
        </p>
      )}
      {result?.error && <p style={{ marginTop: 16, color: "red" }}>{result.error}</p>}
    </main>
  );
}