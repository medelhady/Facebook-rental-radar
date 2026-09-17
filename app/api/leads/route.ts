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
  try {
    return await saveLead(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "خطأ غير متوقع أثناء الحفظ." },
      { status: 500 }
    );
  }
}

async function saveLead(request: Request) {
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

const editableStatuses = ["new", "comment_ready", "contacted", "duplicate", "ignored"];

// Corrections by hand. The parser gets a number wrong often enough that a
// lead list you cannot fix is a lead list you stop trusting.
export async function PATCH(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: string; phone?: string; status?: string; suggestedComment?: string }
    | null;

  const id = body?.id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "حدد الإعلان المطلوب تعديله." }, { status: 400 });
  }

  const patch: Record<string, string | null> = {};

  if (body?.phone !== undefined) {
    const phone = body.phone.replace(/[^\d]/g, "");
    if (phone && (phone.length < 8 || phone.length > 12)) {
      return NextResponse.json({ error: "رقم الهاتف يجب أن يكون بين 8 و 12 رقماً." }, { status: 400 });
    }
    patch.phone = phone || null;
  }

  if (body?.status !== undefined) {
    if (!editableStatuses.includes(body.status)) {
      return NextResponse.json({ error: "حالة غير معروفة." }, { status: 400 });
    }
    patch.status = body.status;
  }

  if (body?.suggestedComment !== undefined) {
    patch.suggested_comment = body.suggestedComment.trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "لا يوجد شيء لتعديله." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("facebook_leads")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "الإعلان غير موجود." }, { status: 404 });

  return NextResponse.json({ lead: mapLead(data as LeadRow, ""), message: "تم حفظ التعديل." });
}

export async function DELETE(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "حدد الإعلان المطلوب حذفه." }, { status: 400 });
  }

  // The unique index on post_url means a deleted post can come back on the
  // next run. Deleting is for clearing the view, not for blocking a post.
  const { error } = await supabase.from("facebook_leads").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: true, message: "تم حذف الإعلان." });
}
