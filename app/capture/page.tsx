"use client";

import { ClipboardPaste, Loader2, Radar, Save } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { buildLeadDraft, type LeadFields } from "@/lib/lead-pipeline";
import type { CommentTemplate, FacebookGroup, Keyword } from "@/lib/types";

export default function CapturePage() {
  return (
    <Suspense fallback={<div className="capture">جاري التحميل...</div>}>
      <CaptureScreen />
    </Suspense>
  );
}

function CaptureScreen() {
  const params = useSearchParams();

  const [postText, setPostText] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [overrides, setOverrides] = useState<LeadFields>({});

  const [groups, setGroups] = useState<FacebookGroup[]>([]);
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [templates, setTemplates] = useState<CommentTemplate[]>([]);

  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // The Facebook app hands us a link, sometimes with a snippet of the post.
  useEffect(() => {
    const sharedUrl = params.get("url") ?? "";
    const sharedText = params.get("text") ?? "";
    const found = unwrapFacebookUrl(sharedUrl || firstUrl(sharedText));
    if (found) setPostUrl(found);

    const withoutUrl = sharedText.replace(/https?:\/\/\S+/g, "").trim();
    if (withoutUrl) setPostText(withoutUrl);
  }, [params]);

  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.error) return;
        setGroups(payload.groups ?? []);
        setKeywords(payload.keywords ?? []);
        setTemplates(payload.commentTemplates ?? []);
      })
      .catch(() => setMessage("تعذر تحميل المجموعات والكلمات."));
  }, []);

  // Pick the group automatically from the post link when we can.
  useEffect(() => {
    if (groupId || groups.length === 0 || !postUrl) return;
    const id = groupIdFromUrl(postUrl);
    if (!id) return;
    const match = groups.find((group) => group.url.includes(id));
    if (match) setGroupId(match.id);
  }, [groupId, groups, postUrl]);

  const draft = useMemo(
    () => buildLeadDraft({ postText, authorName, keywords, overrides }),
    [authorName, keywords, overrides, postText]
  );

  const pasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text.trim()) {
        setPostText(text.trim());
        setMessage("");
      } else {
        setMessage("الحافظة فارغة. انسخ نص المنشور من فيسبوك أولاً.");
      }
    } catch {
      setMessage("المتصفح منع قراءة الحافظة. الصق يدوياً بالضغط المطول داخل الصندوق.");
    }
  }, []);

  function setField(field: keyof LeadFields, value: string) {
    setOverrides((current) => ({ ...current, [field]: value }));
  }

  function startOver() {
    setPostText("");
    setPostUrl("");
    setAuthorName("");
    setTemplateId("");
    setOverrides({});
    setMessage("");
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postText,
          postUrl,
          authorName,
          groupId,
          groupUrl: postUrl,
          phone: draft.phone ?? "",
          price: draft.price ?? "",
          location: draft.location ?? "",
          officeName: draft.officeName ?? "",
          suggestedComment: templates.find((template) => template.id === templateId)?.body ?? ""
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر الحفظ.");
        return;
      }

      setMessage(payload?.message ?? "تم الحفظ.");
      setSaved(true);
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
    } finally {
      setSaving(false);
    }
  }

  if (saved) {
    return (
      <div className="capture">
        <div className="captureCard captureOk">
          <strong>{message}</strong>
          <p className="muted">
            الثقة {draft.confidence}% · {draft.phone ?? "بلا رقم"}
          </p>
          <button className="button" onClick={startOver} style={{ marginTop: 14 }} type="button">
            التقاط منشور آخر
          </button>
          <div style={{ marginTop: 12 }}>
            <Link className="linkBtn" href="/">
              فتح الداشبورد
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="capture">
      <div className="captureHead">
        <div>
          <h1>التقاط منشور</h1>
          <p>الصق النص، والباقي يستخرجه النظام.</p>
        </div>
        <Radar size={26} />
      </div>

      <div className="captureCard">
        <h2>نص المنشور</h2>
        <textarea
          className="captureBig"
          onChange={(event) => setPostText(event.target.value)}
          placeholder="الصق نص المنشور هنا"
          rows={6}
          value={postText}
        />
        <button className="button" onClick={pasteFromClipboard} style={{ marginTop: 10 }} type="button">
          <ClipboardPaste size={18} />
          لصق من الحافظة
        </button>
      </div>

      <div className="captureCard">
        <h2>بيانات المنشور</h2>
        <div className="field">
          <label>الرابط</label>
          <input
            dir="ltr"
            onChange={(event) => setPostUrl(event.target.value)}
            placeholder="https://www.facebook.com/groups/..."
            value={postUrl}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>اسم صاحب المنشور</label>
          <input
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="مثال: مكتب ركن الياسمين"
            value={authorName}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>المجموعة</label>
          <select onChange={(event) => setGroupId(event.target.value)} value={groupId}>
            <option value="">بدون تحديد</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>التعليق المقترح</label>
          <select onChange={(event) => setTemplateId(event.target.value)} value={templateId}>
            <option value="">بدون تعليق</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {postText.trim().length > 0 && (
        <div className="captureCard">
          <h2>ما استخرجه النظام — صححه إن أخطأ</h2>
          {draft.matchedExclude.length > 0 && (
            <div className="notice">كلمة استبعاد: {draft.matchedExclude.join("، ")}</div>
          )}
          <div className="captureGrid">
            <div className="field">
              <label>الهاتف</label>
              <input
                dir="ltr"
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="—"
                value={draft.phone ?? ""}
              />
            </div>
            <div className="field">
              <label>السعر</label>
              <input
                onChange={(event) => setField("price", event.target.value)}
                placeholder="—"
                value={draft.price ?? ""}
              />
            </div>
            <div className="field">
              <label>الحي</label>
              <input
                onChange={(event) => setField("location", event.target.value)}
                placeholder="—"
                value={draft.location ?? ""}
              />
            </div>
            <div className="field">
              <label>المكتب</label>
              <input
                onChange={(event) => setField("officeName", event.target.value)}
                placeholder="—"
                value={draft.officeName ?? ""}
              />
            </div>
          </div>
          <div className="progress" style={{ marginTop: 12 }}>
            <span style={{ width: `${draft.confidence}%` }} />
          </div>
          <div className="muted">الثقة {draft.confidence}%</div>
        </div>
      )}

      {message && <div className="notice">{message}</div>}

      <button className="button captureBig" disabled={saving} onClick={handleSave} type="button">
        {saving ? <Loader2 size={18} /> : <Save size={18} />}
        {saving ? "جاري الحفظ..." : "حفظ كـ Lead"}
      </button>

      <div style={{ textAlign: "center", marginTop: 14 }}>
        <Link className="linkBtn" href="/">
          فتح الداشبورد
        </Link>
      </div>
    </div>
  );
}

function firstUrl(text: string) {
  return text.match(/https?:\/\/\S+/)?.[0] ?? "";
}

// Facebook wraps outgoing links as l.facebook.com/l.php?u=<encoded>
function unwrapFacebookUrl(value: string) {
  if (!value) return "";
  try {
    const parsed = new URL(value);
    const wrapped = parsed.searchParams.get("u");
    if (wrapped && parsed.hostname.includes("facebook.com")) return decodeURIComponent(wrapped);
  } catch {
    return value;
  }
  return value;
}

function groupIdFromUrl(value: string) {
  return value.match(/\/groups\/([^/?#]+)/)?.[1] ?? "";
}
