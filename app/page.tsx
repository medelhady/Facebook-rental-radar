"use client";

import {
  Activity,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileSearch,
  MessageSquare,
  Plus,
  Radar,
  Search,
  Settings,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { commentTemplates, groups, keywords, leads } from "@/lib/demo-data";
import type { CommentTemplate, FacebookGroup, Keyword, Lead } from "@/lib/types";
import { buildLeadDraft, type LeadFields } from "@/lib/lead-pipeline";
import {
  createDuplicateHash,
  extractLocation,
  extractPhone,
  extractPrice,
  inferOfficeName,
  scoreLead
} from "@/lib/parser";

const dateFormatter = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short"
});

type View = "dashboard" | "groups" | "keywords" | "capture" | "leads" | "comments" | "settings";

type RadarData = {
  source: "demo" | "supabase";
  groups: FacebookGroup[];
  keywords: Keyword[];
  commentTemplates: CommentTemplate[];
  leads: Lead[];
};

const demoData: RadarData = {
  source: "demo",
  groups,
  keywords,
  commentTemplates,
  leads
};

const navItems: Array<{
  id: View;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "dashboard", label: "لوحة التحكم", icon: Activity },
  { id: "groups", label: "مصادر المجموعات", icon: Database },
  { id: "keywords", label: "قاموس الكلمات", icon: Search },
  { id: "capture", label: "إضافة منشور", icon: Sparkles },
  { id: "leads", label: "نتائج الرصد", icon: FileSearch },
  { id: "comments", label: "قوالب التعليق", icon: MessageSquare },
  { id: "settings", label: "الإعدادات", icon: Settings }
];

export default function Home() {
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [data, setData] = useState<RadarData>(demoData);
  const [loadError, setLoadError] = useState("");
  const [sampleText, setSampleText] = useState(
    "شقة للايجار حي النرجس 3 غرف وصالة السعر 4200 شهري للتواصل 0551112233"
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/data", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error ?? "تعذر تحميل البيانات من قاعدة البيانات.");
      }
      setData(payload as RadarData);
      setLoadError("");
    } catch (error) {
      setData(demoData);
      setLoadError(error instanceof Error ? error.message : "تعذر الاتصال بقاعدة البيانات.");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const locationWords = useMemo(
    () => data.keywords.filter((keyword) => keyword.type === "location").map((keyword) => keyword.value),
    [data.keywords]
  );

  const parsedSample = useMemo(() => {
    const phone = extractPhone(sampleText);
    const price = extractPrice(sampleText);
    const location = extractLocation(sampleText, locationWords);
    const officeName = inferOfficeName("اسم الحساب التجريبي", sampleText);
    return {
      phone,
      price,
      location,
      officeName,
      confidence: scoreLead({ phone, price, location, officeName }),
      duplicateHash: createDuplicateHash({
        phone,
        authorName: "اسم الحساب التجريبي",
        price,
        location,
        postText: sampleText
      })
    };
  }, [locationWords, sampleText]);

  const activeGroups = data.groups.filter((group) => group.status === "active").length;
  const phoneLeads = data.leads.filter((lead) => lead.phone).length;
  const readyComments = data.leads.filter((lead) => lead.status === "comment_ready").length;
  const pageTitle = navItems.find((item) => item.id === activeView)?.label ?? "لوحة التحكم";
  const connected = data.source === "supabase";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandIcon">
            <Radar size={24} />
          </div>
          <div>
            <h1>رادار الإيجار</h1>
            <p>Facebook lead monitor</p>
          </div>
        </div>
        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`navItem ${activeView === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => setActiveView(item.id)}
                type="button"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div>
            <h2>{pageTitle}</h2>
            <p>{viewSubtitle(activeView)}</p>
          </div>
          <button className="button" onClick={() => setActiveView("groups")} type="button">
            <Plus size={18} />
            إضافة مجموعة
          </button>
        </section>

        {!connected && (
          <div className="notice">
            {loadError
              ? `${loadError} — المعروض الآن بيانات تجريبية.`
              : "قاعدة البيانات غير مربوطة بعد. المعروض بيانات تجريبية ولن يحفظ أي شيء."}
          </div>
        )}

        {(activeView === "dashboard" || activeView === "groups" || activeView === "leads") && (
          <Stats
            activeGroups={activeGroups}
            leadsCount={data.leads.length}
            phoneLeads={phoneLeads}
            readyComments={readyComments}
          />
        )}

        {activeView === "dashboard" && (
          <section className="contentGrid">
            <div>
              <GroupsPanel connected={connected} groups={data.groups} onSaved={refresh} />
              <LeadsPanel leads={data.leads} />
            </div>
            <div>
              <KeywordsPanel keywords={data.keywords} />
              <CommentsPanel templates={data.commentTemplates} />
              <ParserPanel
                parsedSample={parsedSample}
                sampleText={sampleText}
                setSampleText={setSampleText}
              />
              <NextStepPanel />
            </div>
          </section>
        )}

        {activeView === "groups" && (
          <GroupsPanel connected={connected} groups={data.groups} onSaved={refresh} />
        )}
        {activeView === "keywords" && (
          <KeywordsPanel connected={connected} expanded keywords={data.keywords} onSaved={refresh} />
        )}
        {activeView === "capture" && (
          <CapturePanel
            connected={connected}
            groups={data.groups}
            keywords={data.keywords}
            onSaved={refresh}
            templates={data.commentTemplates}
          />
        )}
        {activeView === "leads" && <LeadsPanel leads={data.leads} />}
        {activeView === "comments" && (
          <CommentsPanel connected={connected} expanded onSaved={refresh} templates={data.commentTemplates} />
        )}
        {activeView === "settings" && (
          <section className="contentGrid">
            <ParserPanel parsedSample={parsedSample} sampleText={sampleText} setSampleText={setSampleText} />
            <NextStepPanel />
          </section>
        )}
      </main>
    </div>
  );
}

function Stats({
  activeGroups,
  leadsCount,
  phoneLeads,
  readyComments
}: {
  activeGroups: number;
  leadsCount: number;
  phoneLeads: number;
  readyComments: number;
}) {
  return (
    <section className="grid">
      <div className="stat">
        <span>المجموعات المفعلة</span>
        <strong>{activeGroups}</strong>
      </div>
      <div className="stat">
        <span>Leads جديدة</span>
        <strong>{leadsCount}</strong>
      </div>
      <div className="stat">
        <span>Leads فيها أرقام</span>
        <strong>{phoneLeads}</strong>
      </div>
      <div className="stat">
        <span>تعليقات جاهزة</span>
        <strong>{readyComments}</strong>
      </div>
    </section>
  );
}

function GroupsPanel({
  connected,
  groups,
  onSaved
}: {
  connected: boolean;
  groups: FacebookGroup[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddGroup() {
    if (!connected) {
      setMessage("لا يمكن الحفظ قبل ربط Supabase.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, url, location })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر حفظ المجموعة.");
        return;
      }

      setName("");
      setUrl("");
      setLocation("");
      setMessage("تم حفظ المجموعة في قاعدة البيانات.");
      await onSaved();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="روابط مجموعات فيسبوك" subtitle="هذه القائمة هي المصادر التي سيقرأ منها الـ Worker كل 6 ساعات.">
      <div className="formGrid">
        <div className="field">
          <label>اسم المجموعة</label>
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder="مثال: عقارات الرياض للايجار"
            value={name}
          />
        </div>
        <div className="field">
          <label>رابط المجموعة</label>
          <input
            dir="ltr"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.facebook.com/groups/..."
            value={url}
          />
        </div>
        <div className="field">
          <label>المدينة</label>
          <input
            onChange={(event) => setLocation(event.target.value)}
            placeholder="مثال: الرياض"
            value={location}
          />
        </div>
        <button className="button" disabled={saving} onClick={handleAddGroup} type="button">
          <Plus size={18} />
          {saving ? "جاري الحفظ..." : "حفظ"}
        </button>
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="tableWrap" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>المجموعة</th>
              <th>المدينة</th>
              <th>الحالة</th>
              <th>آخر فحص</th>
              <th>جديد</th>
              <th>الرابط</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => (
              <tr key={group.id}>
                <td>{group.name}</td>
                <td>{group.location ?? "-"}</td>
                <td>
                  <span className={`badge ${group.status === "active" ? "green" : "amber"}`}>
                    {group.status === "active" ? "مفعلة" : "متوقفة"}
                  </span>
                </td>
                <td className="muted">
                  {group.lastCheckedAt ? dateFormatter.format(new Date(group.lastCheckedAt)) : "-"}
                </td>
                <td>{group.newPosts}</td>
                <td>
                  <a href={group.url} target="_blank">
                    <ExternalLink size={16} />
                  </a>
                </td>
              </tr>
            ))}
            {groups.length === 0 && (
              <tr>
                <td className="muted" colSpan={6}>
                  لا توجد مجموعات بعد. أضف أول رابط من النموذج بالأعلى.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function LeadsPanel({ leads }: { leads: Lead[] }) {
  return (
    <Panel title="نتائج الرصد" subtitle="كل منشور مناسب يتحول إلى Lead مع نص تعليق مقترح وحالة متابعة.">
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>الحساب</th>
              <th>المجموعة</th>
              <th>البيانات</th>
              <th>النص</th>
              <th>الثقة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <strong>{lead.authorName}</strong>
                  <div className="muted">{lead.officeName ?? "حساب فردي أو غير مؤكد"}</div>
                </td>
                <td>{lead.groupName}</td>
                <td>
                  <div>الهاتف: {lead.phone ?? "-"}</div>
                  <div>السعر: {lead.price ?? "-"}</div>
                  <div>الموقع: {lead.location ?? "-"}</div>
                </td>
                <td className="leadText">{lead.postText}</td>
                <td>
                  <div className="progress">
                    <span style={{ width: `${lead.confidence}%` }} />
                  </div>
                  <div className="muted">{lead.confidence}%</div>
                </td>
                <td>
                  <span className={statusClass(lead.status)}>{statusLabel(lead.status)}</span>
                </td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr>
                <td className="muted" colSpan={6}>
                  لا توجد نتائج بعد. الـ Worker لم يسجل أي Lead حتى الآن.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function KeywordsPanel({
  connected = false,
  expanded = false,
  keywords,
  onSaved
}: {
  connected?: boolean;
  expanded?: boolean;
  keywords: Keyword[];
  onSaved?: () => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [type, setType] = useState("include");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddKeyword() {
    if (!connected) {
      setMessage("لا يمكن الحفظ قبل ربط Supabase.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, type })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر حفظ الكلمة.");
        return;
      }

      setValue("");
      setMessage("تمت إضافة الكلمة.");
      await onSaved?.();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="قاموس الكلمات" subtitle="الكلمات التي تحدد هل المنشور يستحق المتابعة.">
      {expanded && (
        <div className="formGrid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label>الكلمة</label>
            <input
              onChange={(event) => setValue(event.target.value)}
              placeholder="مثال: شقة للايجار"
              value={value}
            />
          </div>
          <div className="field">
            <label>النوع</label>
            <select onChange={(event) => setType(event.target.value)} value={type}>
              <option value="include">كلمة بحث</option>
              <option value="exclude">استبعاد</option>
              <option value="location">موقع</option>
            </select>
          </div>
          <button className="button" disabled={saving} onClick={handleAddKeyword} type="button">
            <Plus size={18} />
            {saving ? "جاري الحفظ..." : "إضافة"}
          </button>
        </div>
      )}
      {expanded && message && <div className="notice">{message}</div>}
      <div className="chips">
        {keywords.map((keyword) => (
          <span className="chip" key={keyword.id}>
            {keyword.value} · {keywordLabel(keyword.type)}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function CommentsPanel({
  connected = false,
  expanded = false,
  onSaved,
  templates
}: {
  connected?: boolean;
  expanded?: boolean;
  onSaved?: () => Promise<void>;
  templates: CommentTemplate[];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleAddTemplate() {
    if (!connected) {
      setMessage("لا يمكن الحفظ قبل ربط Supabase.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر حفظ القالب.");
        return;
      }

      setTitle("");
      setBody("");
      setMessage("تمت إضافة القالب.");
      await onSaved?.();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel title="قوالب التعليق" subtitle="النظام يقترح منها ولا ينشر تلقائيا في هذه المرحلة.">
      {expanded && (
        <div style={{ marginBottom: 16 }}>
          <div className="field">
            <label>عنوان القالب</label>
            <input
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثال: طلب تفاصيل العقار"
              value={title}
            />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>قالب جديد</label>
            <textarea
              onChange={(event) => setBody(event.target.value)}
              placeholder="السلام عليكم، مهتمين بالتفاصيل..."
              value={body}
            />
          </div>
          <button
            className="button"
            disabled={saving}
            onClick={handleAddTemplate}
            style={{ marginTop: 10 }}
            type="button"
          >
            <Plus size={18} />
            {saving ? "جاري الحفظ..." : "إضافة"}
          </button>
          {message && <div className="notice">{message}</div>}
        </div>
      )}
      {templates.map((template) => (
        <div className="commentBox" key={template.id} style={{ marginBottom: 10 }}>
          <strong>{template.title}</strong>
          <div>{template.body}</div>
        </div>
      ))}
    </Panel>
  );
}

function ParserPanel({
  parsedSample,
  sampleText,
  setSampleText
}: {
  parsedSample: { phone?: string; price?: string; location?: string; confidence: number; duplicateHash: string };
  sampleText: string;
  setSampleText: (value: string) => void;
}) {
  return (
    <Panel title="اختبار استخراج البيانات" subtitle="الصق نص منشور لترى ماذا سيستخرج النظام.">
      <div className="field">
        <label>نص المنشور</label>
        <textarea value={sampleText} onChange={(event) => setSampleText(event.target.value)} />
      </div>
      <div className="commentBox" style={{ marginTop: 12 }}>
        <div>الهاتف: {parsedSample.phone ?? "-"}</div>
        <div>السعر: {parsedSample.price ?? "-"}</div>
        <div>الموقع: {parsedSample.location ?? "-"}</div>
        <div>الثقة: {parsedSample.confidence}%</div>
        <div>بصمة التكرار: {parsedSample.duplicateHash}</div>
      </div>
    </Panel>
  );
}

function NextStepPanel() {
  return (
    <Panel title="خطوة التشغيل القادمة" subtitle="ماذا يحدث بعد ربط Supabase والـ Worker؟">
      <div className="commentBox">
        <ClipboardCheck size={18} /> كل 6 ساعات: فحص المصادر، فلترة المنشورات، استخراج البيانات، تجهيز التعليق، ثم
        عرضها للموافقة اليدوية.
      </div>
    </Panel>
  );
}

function Panel({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <FileSearch size={20} />
      </div>
      <div className="panelBody">{children}</div>
    </section>
  );
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    new: "جديد",
    comment_ready: "تعليق جاهز",
    contacted: "تم التواصل",
    duplicate: "مكرر",
    ignored: "متجاهل"
  };
  return labels[status] ?? status;
}

function statusClass(status: string) {
  if (status === "contacted") return "badge green";
  if (status === "comment_ready") return "badge amber";
  if (status === "duplicate" || status === "ignored") return "badge red";
  return "badge";
}

function keywordLabel(type: string) {
  const labels: Record<string, string> = {
    include: "بحث",
    exclude: "استبعاد",
    location: "موقع"
  };
  return labels[type] ?? type;
}

function viewSubtitle(view: View) {
  const subtitles: Record<View, string> = {
    dashboard: "ملخص سريع للمجموعات والـ Leads وقوالب التواصل.",
    groups: "أضف روابط مجموعات فيسبوك التي تريد مراقبتها.",
    keywords: "إدارة كلمات البحث والاستبعاد والمناطق المستهدفة.",
    capture: "الصق منشوراً رأيته بنفسك وحوله إلى Lead محفوظ.",
    leads: "مراجعة المنشورات المطابقة والبيانات المستخرجة منها.",
    comments: "إدارة الرسائل الجاهزة التي ستستخدم للموافقة اليدوية قبل التعليق.",
    settings: "اختبار الاستخراج وتجهيز إعدادات التشغيل القادمة."
  };
  return subtitles[view];
}

function CapturePanel({
  connected,
  groups,
  keywords,
  onSaved,
  templates
}: {
  connected: boolean;
  groups: FacebookGroup[];
  keywords: Keyword[];
  onSaved: () => Promise<void>;
  templates: CommentTemplate[];
}) {
  const [postText, setPostText] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [overrides, setOverrides] = useState<LeadFields>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const draft = useMemo(
    () => buildLeadDraft({ postText, authorName, keywords, overrides }),
    [authorName, keywords, overrides, postText]
  );

  const edited = Object.keys(overrides).length > 0;

  function setField(field: keyof LeadFields, value: string) {
    setOverrides((current) => ({ ...current, [field]: value }));
  }

  function resetForm() {
    setPostText("");
    setPostUrl("");
    setAuthorName("");
    setOverrides({});
    setTemplateId("");
  }

  async function handleSave() {
    if (!connected) {
      setMessage("لا يمكن الحفظ قبل ربط Supabase.");
      return;
    }

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
          phone: draft.phone ?? "",
          price: draft.price ?? "",
          location: draft.location ?? "",
          officeName: draft.officeName ?? "",
          suggestedComment: templates.find((template) => template.id === templateId)?.body ?? ""
        })
      });
      const payload = await response.json();

      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر حفظ المنشور.");
        return;
      }

      resetForm();
      setMessage(payload?.message ?? "تم حفظ الـ Lead.");
      await onSaved();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="contentGrid">
      <Panel title="الصق منشوراً" subtitle="انسخ نص المنشور من فيسبوك والصقه هنا، والباقي يستخرجه النظام.">
        <div className="field">
          <label>نص المنشور</label>
          <textarea
            onChange={(event) => setPostText(event.target.value)}
            placeholder="للايجار شقة في حي الياسمين غرفتين وصالة السعر 32000 سنوي للتواصل 0559887766"
            value={postText}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>رابط المنشور</label>
          <input
            dir="ltr"
            onChange={(event) => setPostUrl(event.target.value)}
            placeholder="https://www.facebook.com/groups/.../posts/..."
            value={postUrl}
          />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>اسم صاحب المنشور</label>
          <input
            onChange={(event) => setAuthorName(event.target.value)}
            placeholder="مثال: مكتب ركن الياسمين العقاري"
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
        <button className="button" disabled={saving} onClick={handleSave} style={{ marginTop: 14 }} type="button">
          <Plus size={18} />
          {saving ? "جاري الحفظ..." : "حفظ كـ Lead"}
        </button>
        {message && <div className="notice">{message}</div>}
      </Panel>

      <Panel title="ما استخرجه النظام" subtitle="راجع الحقول وصححها قبل الحفظ. ما تكتبه بيدك هو ما يُحفظ.">
        {postText.trim().length === 0 ? (
          <div className="muted">الصق نص المنشور لترى الاستخراج مباشرة.</div>
        ) : (
          <>
            {draft.matchedExclude.length > 0 && (
              <div className="notice">
                تحذير: المنشور يحتوي كلمة استبعاد ({draft.matchedExclude.join("، ")}). يمكنك الحفظ رغم ذلك.
              </div>
            )}
            {draft.matchedInclude.length === 0 && (
              <div className="notice">
                تنبيه: لا توجد أي كلمة من كلمات البحث في هذا النص. الجامع الآلي كان سيتجاهله.
              </div>
            )}

            <div className="field">
              <label>الهاتف</label>
              <input
                dir="ltr"
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="لم يُستخرج رقم"
                value={draft.phone ?? ""}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>السعر</label>
              <input
                onChange={(event) => setField("price", event.target.value)}
                placeholder="لم يُستخرج سعر"
                value={draft.price ?? ""}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>الحي أو الموقع</label>
              <input
                onChange={(event) => setField("location", event.target.value)}
                placeholder="لم يُستخرج موقع"
                value={draft.location ?? ""}
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>المكتب العقاري</label>
              <input
                onChange={(event) => setField("officeName", event.target.value)}
                placeholder="حساب فردي أو غير مؤكد"
                value={draft.officeName ?? ""}
              />
            </div>

            <div className="commentBox" style={{ marginTop: 14 }}>
              <div>الثقة: {draft.confidence}%</div>
              <div className="progress">
                <span style={{ width: `${draft.confidence}%` }} />
              </div>
              <div className="muted">بصمة التكرار: {draft.duplicateHash}</div>
              {draft.matchedInclude.length > 0 && (
                <div className="muted">كلمات مطابقة: {draft.matchedInclude.join("، ")}</div>
              )}
            </div>

            {edited && (
              <button className="button" onClick={() => setOverrides({})} style={{ marginTop: 12 }} type="button">
                إرجاع الحقول للاستخراج التلقائي
              </button>
            )}
          </>
        )}
      </Panel>
    </section>
  );
}
