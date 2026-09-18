"use client";

import { Radar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error ?? "تعذر تسجيل الدخول.");
        return;
      }

      // Back to wherever the person was headed before being stopped.
      const next = params.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit} style={{ maxWidth: 380, width: "100%" }}>
      <div className="panelHeader">
        <div>
          <h3>رادار الإيجار</h3>
          <p>أدخل كلمة المرور للمتابعة.</p>
        </div>
        <Radar size={22} />
      </div>
      <div className="panelBody">
        <div className="field">
          <label>كلمة المرور</label>
          <input
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            value={password}
          />
        </div>
        {error && <div className="notice">{error}</div>}
        <button className="button" disabled={busy || !password} style={{ marginTop: 14 }} type="submit">
          {busy ? "جاري الدخول..." : "دخول"}
        </button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 20
      }}
    >
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
