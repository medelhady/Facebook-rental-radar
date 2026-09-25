"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function OfficeLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowser();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message === "Invalid login credentials"
        ? "البريد أو كلمة السر غير صحيحة."
        : signInError.message);
      setLoading(false);
      return;
    }

    router.push("/office/dashboard");
  }

  return (
    <main dir="rtl" style={{ maxWidth: 420, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>تسجيل الدخول</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>

        {error && <p style={{ color: "red" }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: 12, background: "#2563eb", color: "white", border: "none", borderRadius: 6 }}
        >
          {loading ? "جاري الدخول..." : "دخول"}
        </button>
      </form>

      <p style={{ marginTop: 16, fontSize: 14, display: "flex", justifyContent: "space-between" }}>
        <a href="/office/signup">مكتب جديد؟ سجّل هنا</a>
        <a href="/office/forgot-password">نسيت كلمة السر؟</a>
      </p>
    </main>
  );
}