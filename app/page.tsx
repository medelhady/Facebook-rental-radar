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
  Settings
} from "lucide-react";
import { useMemo, useState } from "react";
import { commentTemplates, groups, keywords, leads } from "@/lib/demo-data";
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

export default function Home() {
  const [sampleText, setSampleText] = useState(
    "شقة للايجار حي النرجس 3 غرف وصالة السعر 4200 شهري للتواصل 0551112233"
  );

  const locationWords = keywords
    .filter((keyword) => keyword.type === "location")
    .map((keyword) => keyword.value);

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

  const activeGroups = groups.filter((group) => group.status === "active").length;
  const phoneLeads = leads.filter((lead) => lead.phone).length;
  const readyComments = leads.filter((lead) => lead.status === "comment_ready").length;

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
          <div className="navItem active">
            <Activity size={18} />
            لوحة التحكم
          </div>
          <div className="navItem">
            <Database size={18} />
            مصادر المجموعات
          </div>
          <div className="navItem">
            <Search size={18} />
            قاموس الكلمات
          </div>
          <div className="navItem">
            <MessageSquare size={18} />
            قوالب التعليق
          </div>
          <div className="navItem">
            <Settings size={18} />
            الإعدادات
          </div>
        </nav>
      </aside>

      <main className="main">
        <section className="topbar">
          <div>
            <h2>لوحة متابعة منشورات الإيجار</h2>
            <p>أضف روابط مجموعات فيسبوك، راقب الكلمات العقارية، وجهز تعليق تواصل لكل Lead.</p>
          </div>
          <button className="button">
            <Plus size={18} />
            إضافة مجموعة
          </button>
        </section>

        <section className="grid">
          <div className="stat">
            <span>المجموعات المفعلة</span>
            <strong>{activeGroups}</strong>
          </div>
          <div className="stat">
            <span>Leads جديدة</span>
            <strong>{leads.length}</strong>
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

        <section className="contentGrid">
          <div>
            <Panel
              title="روابط مجموعات فيسبوك"
              subtitle="هذه القائمة هي المصادر التي سيقرأ منها الـ Worker كل 6 ساعات."
            >
              <div className="formGrid">
                <div className="field">
                  <label>اسم المجموعة</label>
                  <input placeholder="مثال: عقارات الرياض للايجار" />
                </div>
                <div className="field">
                  <label>رابط المجموعة</label>
                  <input placeholder="https://www.facebook.com/groups/..." />
                </div>
                <button className="button" type="button">
                  <Plus size={18} />
                  حفظ
                </button>
              </div>
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
                  </tbody>
                </table>
              </div>
            </Panel>

            <Panel
              title="نتائج الرصد"
              subtitle="كل منشور مناسب يتحول إلى Lead مع نص تعليق مقترح وحالة متابعة."
            >
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
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div>
            <Panel title="قاموس الكلمات" subtitle="الكلمات التي تحدد هل المنشور يستحق المتابعة.">
              <div className="chips">
                {keywords.map((keyword) => (
                  <span className="chip" key={keyword.id}>
                    {keyword.value} · {keywordLabel(keyword.type)}
                  </span>
                ))}
              </div>
            </Panel>

            <Panel title="قوالب التعليق" subtitle="النظام يقترح منها ولا ينشر تلقائيا في هذه المرحلة.">
              {commentTemplates.map((template) => (
                <div className="commentBox" key={template.id} style={{ marginBottom: 10 }}>
                  <strong>{template.title}</strong>
                  <div>{template.body}</div>
                </div>
              ))}
            </Panel>

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

            <Panel title="خطوة التشغيل القادمة" subtitle="ماذا يحدث بعد ربط Supabase والـ Worker؟">
              <div className="commentBox">
                <ClipboardCheck size={18} /> كل 6 ساعات: فحص المصادر، فلترة المنشورات، استخراج البيانات، تجهيز
                التعليق، ثم عرضها للموافقة اليدوية.
              </div>
            </Panel>
          </div>
        </section>
      </main>
    </div>
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
