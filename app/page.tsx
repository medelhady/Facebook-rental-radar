"use client";

import {
  Activity,
  ClipboardCheck,
  Clock,
  Database,
  Users,
  ExternalLink,
  FileSearch,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Radar,
  Search,
  Check,
  Settings,
  Sparkles,
  Trash2,
  X,
  type LucideIcon
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { commentTemplates, groups, keywords, leads } from "@/lib/demo-data";
import type {
  ApifyTask,
  CommentTemplate,
  FacebookGroup,
  Keyword,
  Lead,
  LeadStatus
} from "@/lib/types";
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

type View =
  | "dashboard"
  | "groups"
  | "keywords"
  | "capture"
  | "leads"
  | "comments"
  | "schedule"
  | "settings";

type RadarData = {
  source: "demo" | "supabase";
  apifyTasks: ApifyTask[];
  groups: FacebookGroup[];
  keywords: Keyword[];
  commentTemplates: CommentTemplate[];
  leads: Lead[];
};

const demoData: RadarData = {
  source: "demo",
  apifyTasks: [],
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
  { id: "schedule", label: "وقت البحث", icon: Clock },
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
    const price = extractPrice(sampleText, phone);
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
              <GroupsPanel apifyTasks={data.apifyTasks} connected={connected} groups={data.groups} onSaved={refresh} />
              <LeadsPanel connected={connected} leads={data.leads} onSaved={refresh} />
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
          <GroupsPanel apifyTasks={data.apifyTasks} connected={connected} groups={data.groups} onSaved={refresh} />
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
        {activeView === "leads" && <LeadsPanel connected={connected} leads={data.leads} onSaved={refresh} />}
        {activeView === "comments" && (
          <CommentsPanel connected={connected} expanded onSaved={refresh} templates={data.commentTemplates} />
        )}
        {activeView === "schedule" && (
          <>
            <TasksPanel apifyTasks={data.apifyTasks} connected={connected} onSaved={refresh} />
            <SchedulePanel connected={connected} />
          </>
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
  apifyTasks = [],
  connected,
  groups,
  onSaved
}: {
  apifyTasks?: ApifyTask[];
  connected: boolean;
  groups: FacebookGroup[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState("");
  const [apifyTaskId, setApifyTaskId] = useState("");
  // A group with no account is stored but never sent to Apify.
  const taskLabels = new Map(apifyTasks.map((task) => [task.id, task.label]));
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
        body: JSON.stringify({ name, url, location, apifyTaskId: apifyTaskId || undefined })
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
            placeholder="مثال: نواكشوط"
            value={location}
          />
        </div>
        {apifyTasks.length > 0 && (
          <div className="field">
            <label>يقرأها حساب</label>
            <select
              onChange={(event) => setApifyTaskId(event.target.value)}
              value={apifyTaskId}
            >
              <option value="">اختر الحساب…</option>
              {apifyTasks
                .filter((task) => task.isActive)
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.label}
                  </option>
                ))}
            </select>
          </div>
        )}
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
              <th>الحساب</th>
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
                <td className="muted">
                  {group.apifyTaskId ? taskLabels.get(group.apifyTaskId) ?? "محذوف" : "بلا حساب"}
                </td>
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

function LeadsPanel({
  leads,
  connected = false,
  onSaved
}: {
  leads: Lead[];
  connected?: boolean;
  onSaved?: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftPhone, setDraftPhone] = useState("");
  const [draftStatus, setDraftStatus] = useState<LeadStatus>("new");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function startEdit(lead: Lead) {
    setEditingId(lead.id);
    setDraftPhone(lead.phone ?? "");
    setDraftStatus(lead.status);
    setMessage("");
  }

  async function save(lead: Lead) {
    setBusyId(lead.id);
    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, phone: draftPhone, status: draftStatus })
      });
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر حفظ التعديل.");
        return;
      }
      setEditingId(null);
      setMessage(payload.message ?? "تم حفظ التعديل.");
      await onSaved?.();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(lead: Lead) {
    // The post comes back on the next run if it is still in the group, so say
    // what deleting does and does not do before doing it.
    const confirmed = window.confirm(
      `حذف هذا الإعلان من القائمة؟\n\n${lead.postText.slice(0, 80)}…\n\nلن يمنع ذلك ظهوره مجدداً إن كان ما زال منشوراً في المجموعة.`
    );
    if (!confirmed) return;

    setBusyId(lead.id);
    try {
      const response = await fetch(`/api/leads?id=${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      const payload = await response.json();
      setMessage(response.ok ? payload.message ?? "تم الحذف." : payload?.error ?? "تعذر الحذف.");
      if (response.ok) await onSaved?.();
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="نتائج الرصد"
      subtitle={
        leads.length > 0
          ? `${leads.length} إعلاناً، الأحدث أولاً.`
          : "لم يُسجَّل أي إعلان بعد."
      }
    >
      {message && <div className="notice">{message}</div>}
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>الحساب</th>
              <th>المجموعة</th>
              <th>الهاتف والمنشور</th>
              <th>النص</th>
              <th>الثقة</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, index) => {
              const editing = editingId === lead.id;
              const busy = busyId === lead.id;

              return (
                <tr key={lead.id}>
                  <td className="muted">{index + 1}</td>
                  <td>
                    <strong>{lead.authorName}</strong>
                    <div className="muted">{lead.officeName ?? "حساب فردي أو غير مؤكد"}</div>
                  </td>
                  <td>{lead.groupName}</td>
                  <td>
                    {editing ? (
                      <input
                        onChange={(event) => setDraftPhone(event.target.value)}
                        placeholder="رقم الهاتف"
                        value={draftPhone}
                      />
                    ) : lead.phone ? (
                      <div>
                        <strong>{lead.phone}</strong>
                      </div>
                    ) : (
                      <div className="muted">بدون رقم</div>
                    )}
                    <div className="muted">{leadDate(lead)}</div>
                    <a href={lead.postUrl} rel="noreferrer" target="_blank">
                      <ExternalLink size={14} /> المنشور
                    </a>
                  </td>
                  <td className="leadText">{lead.postText}</td>
                  <td>
                    <div className="progress">
                      <span style={{ width: `${lead.confidence}%` }} />
                    </div>
                    <div className="muted">{lead.confidence}%</div>
                  </td>
                  <td>
                    {editing ? (
                      <select
                        onChange={(event) => setDraftStatus(event.target.value as LeadStatus)}
                        value={draftStatus}
                      >
                        <option value="new">جديد</option>
                        <option value="comment_ready">تعليق جاهز</option>
                        <option value="contacted">تم التواصل</option>
                        <option value="duplicate">مكرر</option>
                        <option value="ignored">متجاهل</option>
                      </select>
                    ) : (
                      <span className={statusClass(lead.status)}>{statusLabel(lead.status)}</span>
                    )}
                  </td>
                  <td>
                    <div className="rowActions">
                      {editing ? (
                        <>
                          <button disabled={busy} onClick={() => save(lead)} title="حفظ" type="button">
                            <Check size={16} />
                          </button>
                          <button
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                            title="إلغاء"
                            type="button"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            disabled={!connected || busy}
                            onClick={() => startEdit(lead)}
                            title="تعديل"
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            className="danger"
                            disabled={!connected || busy}
                            onClick={() => remove(lead)}
                            title="حذف"
                            type="button"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {leads.length === 0 && (
              <tr>
                <td className="muted" colSpan={8}>
                  لا توجد نتائج بعد. لم يسجل أي تشغيل إعلاناً حتى الآن.
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
              <option value="rent">إيجار</option>
              <option value="sale">بيع</option>
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

function TasksPanel({
  apifyTasks,
  connected,
  onSaved
}: {
  apifyTasks: ApifyTask[];
  connected: boolean;
  onSaved: () => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [taskId, setTaskId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(url: string, init: RequestInit) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, init);
      const payload = await response.json();
      if (!response.ok) {
        setMessage(payload?.error ?? "تعذر تنفيذ الطلب.");
        return false;
      }
      setMessage(payload.warning ?? payload.message ?? "تم.");
      await onSaved();
      return true;
    } catch {
      setMessage("تعذر الاتصال بالخادم.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const ok = await send("/api/apify-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, taskId })
    });
    if (ok) {
      setLabel("");
      setTaskId("");
    }
  }

  async function remove(task: ApifyTask) {
    const confirmed = window.confirm(
      `حذف «${task.label}»؟

مجموعاته ستبقى محفوظة لكن بلا حساب يقرأها، ولن تُرسل لـ Apify حتى تُسند لحساب آخر.

لن يُحذف الـ Task من Apify نفسه.`
    );
    if (!confirmed) return;
    await send(`/api/apify-tasks?id=${encodeURIComponent(task.id)}`, { method: "DELETE" });
  }

  return (
    <Panel
      title="حسابات الجمع"
      subtitle="كل حساب هو Task في Apify بكوكيز فيسبوك خاصة به."
    >
      {message && <div className="notice">{message}</div>}

      <div className="formGrid">
        <div className="field">
          <label>اسم الحساب</label>
          <input
            onChange={(event) => setLabel(event.target.value)}
            placeholder="مثال: الحساب الثاني"
            value={label}
          />
        </div>
        <div className="field">
          <label>Task ID من Apify</label>
          <input
            onChange={(event) => setTaskId(event.target.value)}
            placeholder="user~task-name"
            value={taskId}
          />
        </div>
        <button className="button" disabled={busy || !connected} onClick={add} type="button">
          <Plus size={18} />
          {busy ? "جاري..." : "إضافة حساب"}
        </button>
      </div>

      <div className="tableWrap" style={{ marginTop: 18 }}>
        <table>
          <thead>
            <tr>
              <th>الحساب</th>
              <th>Task</th>
              <th>آخر مزامنة</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {apifyTasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong>{task.label}</strong>
                  {task.lastError && <div className="muted">{task.lastError}</div>}
                </td>
                <td>
                  <code>{task.taskId}</code>
                </td>
                <td className="muted">
                  {task.lastSyncedAt ? dateFormatter.format(new Date(task.lastSyncedAt)) : "-"}
                </td>
                <td>
                  <span className={task.isActive ? "badge green" : "badge"}>
                    {task.isActive ? "مفعل" : "موقوف"}
                  </span>
                </td>
                <td>
                  <div className="rowActions">
                    <button
                      disabled={busy || !connected}
                      onClick={() =>
                        send("/api/apify-tasks", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: task.id, isActive: !task.isActive })
                        })
                      }
                      title={task.isActive ? "إيقاف" : "تفعيل"}
                      type="button"
                    >
                      {task.isActive ? <X size={16} /> : <Check size={16} />}
                    </button>
                    <button
                      className="danger"
                      disabled={busy || !connected}
                      onClick={() => remove(task)}
                      title="حذف"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {apifyTasks.length === 0 && (
              <tr>
                <td className="muted" colSpan={5}>
                  لا يوجد أي حساب بعد. نفّذ supabase/apify-tasks.sql ثم أضف الحساب الأول.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function SchedulePanel({ connected }: { connected: boolean }) {
  const [intervalHours, setIntervalHours] = useState(6);
  const [allowed, setAllowed] = useState<number[]>([1, 2, 3, 4, 6, 8, 12, 24]);
  const [cron, setCron] = useState("");
  const [apifyProblem, setApifyProblem] = useState("");
  const [candidates, setCandidates] = useState<
    Array<{ id: string; name: string; cron: string; target: string; isTask: boolean }>
  >([]);
  const [candidatesError, setCandidatesError] = useState("");
  const [resultsLimit, setResultsLimit] = useState(100);
  const [maxLimit, setMaxLimit] = useState(1000);
  const [overviews, setOverviews] = useState<
    Array<{
      taskId: string;
      urlKey: string;
      groupCount: number;
      limitKey: string | null;
      resultsLimit: number | null;
    }>
  >([]);
  const [taskError, setTaskError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/schedule", { cache: "no-store" });
        const payload = await response.json();
        if (cancelled || !response.ok) return;
        setIntervalHours(payload.intervalHours);
        setAllowed(payload.allowed);
        setCron(payload.cron);
        setApifyProblem(payload.apify?.problem ?? "");
        setCandidates(payload.candidates ?? []);
        setCandidatesError(payload.candidatesError ?? "");
        setMaxLimit(payload.maxResultsLimit ?? 1000);
        setOverviews(payload.overviews ?? []);
        setTaskError(payload.taskError ?? "");
        const seen = (payload.overviews ?? []).find(
          (item: { resultsLimit: number | null }) => item.resultsLimit
        );
        if (seen?.resultsLimit) setResultsLimit(seen.resultsLimit);
      } catch {
        /* the notice below already covers a disconnected dashboard */
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const payload = await response.json();
      setMessage(response.ok ? payload.message ?? "تم." : payload?.error ?? "تعذر تنفيذ الطلب.");
      if (response.ok && payload.cron) setCron(payload.cron);
    } catch {
      setMessage("تعذر الاتصال بالخادم. حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="وقت البحث" subtitle="كل كم ساعة يمر Apify على المجموعات المتابَعة.">
      {!connected && <div className="notice">لا يمكن الحفظ قبل ربط Supabase.</div>}
      {apifyProblem && <div className="notice">{apifyProblem} أضفه في متغيرات البيئة ثم أعد التشغيل.</div>}

      {candidatesError && <div className="notice">{candidatesError}</div>}

      {candidates.length > 0 && (
        <div className="commentBox" style={{ display: "block" }}>
          <strong>جدولاتك في Apify</strong> — انسخ الـ id وضعه في APIFY_SCHEDULE_ID:
          <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
            {candidates.map((item) => (
              <li key={item.id} style={{ marginBottom: 6 }}>
                <code>{item.id}</code> — {item.name} ({item.cron})
                {!item.isTask && (
                  <div style={{ color: "#b45309" }}>
                    ⚠ هذه الجدولة مربوطة بالـ Actor مباشرة، لا بالـ Task. ستعمل بإعدادات فاضية بدون
                    الكوكيز والمجموعات. عدّلها في Apify قبل استخدامها.
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="formGrid">
        <div className="field">
          <label>كل كم ساعة</label>
          <select
            onChange={(event) => setIntervalHours(Number(event.target.value))}
            value={intervalHours}
          >
            {allowed.map((hours) => (
              <option key={hours} value={hours}>
                كل {hours} ساعة
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>عدد النتائج لكل مجموعة</label>
          <input
            max={maxLimit}
            min={1}
            onChange={(event) => setResultsLimit(Number(event.target.value))}
            type="number"
            value={resultsLimit}
          />
        </div>
        <button
          className="button"
          disabled={busy || !connected}
          onClick={() => post("/api/schedule", { intervalHours, resultsLimit })}
          type="button"
        >
          <Clock size={18} />
          {busy ? "جاري الحفظ..." : "حفظ الإعدادات"}
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => post("/api/apify-sync")}
          type="button"
        >
          <RefreshCw size={18} />
          دفع المجموعات إلى Apify
        </button>
      </div>

      {message && <div className="notice">{message}</div>}

      {taskError && <div className="notice">{taskError}</div>}

      {overviews.length > 0 && (
        <div className="commentBox" style={{ display: "block" }}>
          <strong>ما هو مضبوط فعلياً في Apify الآن</strong>
          {overviews.map((item) => (
            <div className="muted" key={item.taskId} style={{ marginTop: 6 }}>
              <code>{item.taskId}</code> — المجموعات المرسلة: {item.groupCount} · حقل الروابط:{" "}
              <code>{item.urlKey}</code>
              {item.limitKey ? (
                <>
                  {" "}
                  · حد النتائج: <code>{item.limitKey}</code> = {item.resultsLimit}
                </>
              ) : (
                " · لا يوجد حد نتائج محفوظ بعد — أول حفظ سينشئه"
              )}
            </div>
          ))}
        </div>
      )}

      {cron && (
        <div className="commentBox">
          <ClipboardCheck size={18} /> صيغة التشغيل الحالية في Apify: <code>{cron}</code>
        </div>
      )}
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

// The date the ad was posted, not the date we happened to scrape it.
// Manual captures carry no published date, so they fall back to first seen.
function leadDate(lead: Lead) {
  const raw = lead.publishedAt ?? lead.firstSeenAt;
  if (!raw) return "-";
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "-" : dateFormatter.format(parsed);
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
    rent: "إيجار",
    sale: "بيع",
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
    schedule: "تحديد كل كم ساعة يبحث Apify، ودفع قائمة المجموعات إليه.",
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
