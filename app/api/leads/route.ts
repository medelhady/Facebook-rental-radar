import { NextResponse } from "next/server";
import { buildLeadDraft } from "@/lib/lead-pipeline";
import { mapKeyword, mapLead, type KeywordRow, type LeadRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
// supabase-js calls fetch(); without this Next caches the first response forever.
export const fetchCache = "force-no-store";

type Body = {
  postText?: string;
  postUrl?: string;
  authorName?: string;
  groupId?: string;
  groupUrl?: string;
  phone?: string;
  price?: string;
  location?: string;
  officeName?: string;
  suggestedComment?: string;
};

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "قاعدة البيانات غير مربوطة. أضف مفاتيح Supabase في .env.local ثم أعد التشغيل." },
      { status: 503 }
    );
  }

  // Optional shared secret. Set CAPTURE_TOKEN to lock the endpoint down;
  // leave it unset and the endpoint stays open (fine for localhost only).
  const expectedToken = process.env.CAPTURE_TOKEN;
  if (expectedToken && request.headers.get("x-capture-token") !== expectedToken) {
    return NextResponse.json({ error: "مفتاح الالتقاط غير صحيح." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;

  const postText = body?.postText?.trim() ?? "";
  const postUrl = body?.postUrl?.trim() ?? "";
  const authorName = body?.authorName?.trim() ?? "";
  let groupId = body?.groupId?.trim() || null;
  const groupUrl = body?.groupUrl?.trim() || "";
  const suggestedComment = body?.suggestedComment?.trim() || null;

  if (!postText) {
    return NextResponse.json({ error: "الصق نص المنشور أولاً." }, { status: 400 });
  }

  if (!postUrl.startsWith("http")) {
    return NextResponse.json({ error: "أضف رابط المنشور كاملاً (يبدأ بـ https://)." }, { status: 400 });
  }

  if (!authorName) {
    return NextResponse.json({ error: "اكتب اسم صاحب المنشور." }, { status: 400 });
  }

  // The extension knows the group's URL, not its id.
  if (!groupId && groupUrl) {
    const { data: match } = await supabase
      .from("facebook_groups")
      .select("id")
      .ilike("url", `%${groupUrl.replace(/^https?:\/\/(www\.)?facebook\.com/, "").replace(/\/+$/, "")}%`)
      .limit(1);
    groupId = match?.[0]?.id ?? null;
  }

  // Recompute on the server so the saved row never trusts the browser's numbers.
  const { data: keywordRows, error: keywordsError } = await supabase.from("keywords").select("*").eq("active", true);
  if (keywordsError) {
    return NextResponse.json({ error: keywordsError.message }, { status: 500 });
  }

  const draft = buildLeadDraft({
    postText,
    authorName,
    keywords: ((keywordRows ?? []) as KeywordRow[]).map(mapKeyword),
    overrides: {
      phone: body?.phone,
      price: body?.price,
      location: body?.location,
      officeName: body?.officeName
    }
  });

  const { data: existing, error: existingError } = await supabase
    .from("facebook_leads")
    .select("id")
    .eq("duplicate_hash", draft.duplicateHash)
    .limit(1);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const isDuplicate = (existing ?? []).length > 0;
  const status = isDuplicate ? "duplicate" : suggestedComment ? "comment_ready" : "new";

  const { data, error } = await supabase
    .from("facebook_leads")
    .insert({
      group_id: groupId,
      post_url: postUrl,
      author_name: authorName,
      post_text: postText,
      phone: draft.phone ?? null,
      office_name: draft.officeName ?? null,
      price: draft.price ?? null,
      location: draft.location ?? null,
      confidence: draft.confidence,
      status,
      suggested_comment: suggestedComment,
      duplicate_hash: draft.duplicateHash,
      raw_payload: { source: "manual_capture" }
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "هذا المنشور مضاف مسبقاً بنفس الرابط." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      lead: mapLead(data as LeadRow, ""),
      duplicate: isDuplicate,
      message: isDuplicate
        ? "تم الحفظ بحالة «مكرر» — نفس الرقم والبيانات مسجلة مسبقاً."
        : "تم حفظ الـ Lead."
    },
    { status: 201 }
  );
}
