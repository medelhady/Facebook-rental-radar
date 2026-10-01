import { NextResponse } from "next/server";
import { getDatasetItems, getRun, normalizeTaskId } from "@/lib/apify";
import { buildLeadInserts, type LeadInsert } from "@/lib/apify-ingest";
import { mapKeyword, type KeywordRow } from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// A run over several groups can return hundreds of posts, and the default
// serverless limit cuts the insert half way through.
export const maxDuration = 60;

type WebhookBody = {
  eventType?: string;
  resource?: { id?: string; defaultDatasetId?: string; status?: string };
};

export async function POST(request: Request) {
  try {
    return await ingest(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "خطأ غير متوقع أثناء استقبال النتائج." },
      { status: 500 }
    );
  }
}

async function ingest(request: Request) {
  // Apify does not sign its webhooks, so the only thing separating this route
  // from the open internet is a secret carried in the URL it calls.
  const expected = process.env.APIFY_WEBHOOK_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "APIFY_WEBHOOK_SECRET غير مضبوط — نقطة الاستقبال معطلة." },
      { status: 503 }
    );
  }
  // A Base64 secret can contain "+", and URLSearchParams reads that back as a
  // space. Both readings are compared so a correct secret is never rejected.
  const provided = new URL(request.url).searchParams.get("secret") ?? "";
  if (provided !== expected && provided.replace(/ /g, "+") !== expected) {
    return NextResponse.json({ error: "مفتاح الويب هوك غير صحيح." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "قاعدة البيانات غير مربوطة." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const runId = body?.resource?.id?.trim() ?? "";
  if (!runId) {
    return NextResponse.json({ error: "الطلب لا يحمل معرّف تشغيل." }, { status: 400 });
  }

  // Never trust the posted body for the dataset id: read the run back from
  // Apify, which also proves the run exists and actually finished.
  const run = await getRun(runId);
  if (!run?.defaultDatasetId) {
    return NextResponse.json({ error: `لم يُعثر على التشغيل ${runId}.` }, { status: 404 });
  }
  if (run.status !== "SUCCEEDED") {
    return NextResponse.json({ skipped: true, reason: `حالة التشغيل ${run.status}` });
  }

  // A run belongs to an office's task if that task's row carries an office_id.
  // Everything before this existed for the single-tenant setup and is
  // untouched; offices are an entirely separate branch below.
  const office = run.actorTaskId ? await findOfficeForTask(supabase, run.actorTaskId) : null;

  if (office) {
    return ingestForOffice(supabase, run, runId, office);
  }

  return ingestLegacy(supabase, run, runId);
}

async function findOfficeForTask(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  actorTaskId: string
) {
  const { data } = await supabase
    .from("apify_tasks")
    .select("id, office_id")
    .eq("task_id", normalizeTaskId(actorTaskId))
    .not("office_id", "is", null)
    .maybeSingle();

  return data?.office_id ? { apifyTaskRowId: data.id as string, officeId: data.office_id as string } : null;
}

// Original single-tenant path — untouched from before offices existed.
async function ingestLegacy(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  runId: string
) {
  const [{ data: keywordRows, error: keywordsError }, { data: groupRows, error: groupsError }] =
    await Promise.all([
      supabase.from("keywords").select("id, value, type").eq("active", true),
      supabase.from("facebook_groups").select("id, url").eq("status", "active")
    ]);

  if (keywordsError) return NextResponse.json({ error: keywordsError.message }, { status: 500 });
  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });

  const posts = await getDatasetItems(run.defaultDatasetId!);
  const { rows, stats } = buildLeadInserts({
    posts,
    keywords: ((keywordRows ?? []) as KeywordRow[]).map(mapKeyword),
    groups: (groupRows ?? []) as Array<{ id: string; url: string }>,
    runId
  });

  // The unique index on post_url catches a re-scrape of the same post; it does
  // not catch the same ad posted again under a new id, which the hash does.
  const fresh = rows.length > 0 ? await dropKnownHashes(supabase, rows) : [];

  let inserted = 0;
  if (fresh.length > 0) {
    const { data, error } = await supabase
      .from("facebook_leads")
      .upsert(fresh, { onConflict: "post_url", ignoreDuplicates: true })
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  await supabase.from("scan_runs").insert({
    status: "completed",
    checked_posts: stats.checked,
    matched_posts: stats.matched,
    extracted_phones: stats.withPhone,
    duplicates: stats.matched - inserted,
    new_leads: inserted,
    finished_at: new Date().toISOString()
  });

  const touched = [...new Set(fresh.map((row) => row.group_id).filter(Boolean))] as string[];
  if (touched.length > 0) {
    await supabase
      .from("facebook_groups")
      .update({ last_checked_at: new Date().toISOString(), last_error: null })
      .in("id", touched);
  }

  return NextResponse.json({ runId, inserted, stats });
}

// New path for office-owned tasks: same relevance/extraction pipeline, but
// scoped to that office's own groups and written to the "leads" table.
async function ingestForOffice(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  run: NonNullable<Awaited<ReturnType<typeof getRun>>>,
  runId: string,
  office: { apifyTaskRowId: string; officeId: string }
) {
  const [{ data: keywordRows, error: keywordsError }, { data: groupRows, error: groupsError }] =
    await Promise.all([
      // Keywords are shared across every office — there is only one dictionary.
      supabase.from("keywords").select("id, value, type").eq("active", true),
      supabase.from("facebook_groups").select("id, url").eq("office_id", office.officeId)
    ]);

  if (keywordsError) return NextResponse.json({ error: keywordsError.message }, { status: 500 });
  if (groupsError) return NextResponse.json({ error: groupsError.message }, { status: 500 });

  const posts = await getDatasetItems(run.defaultDatasetId!);
  const { rows, stats } = buildLeadInserts({
    posts,
    keywords: ((keywordRows ?? []) as KeywordRow[]).map(mapKeyword),
    groups: (groupRows ?? []) as Array<{ id: string; url: string }>,
    runId
  });

  const officeRows = rows.map((row) => toOfficeLeadRow(row, office.officeId));

  let inserted = 0;
  if (officeRows.length > 0) {
    const { data, error } = await supabase
      .from("leads")
      .upsert(officeRows, { onConflict: "post_url", ignoreDuplicates: true })
      .select("id");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    inserted = data?.length ?? 0;
  }

  await supabase
    .from("apify_tasks")
    .update({ last_synced_at: new Date().toISOString(), last_error: null })
    .eq("id", office.apifyTaskRowId);

  const touched = [...new Set(rows.map((row) => row.group_id).filter(Boolean))] as string[];
  if (touched.length > 0) {
    await supabase
      .from("facebook_groups")
      .update({ last_checked_at: new Date().toISOString(), last_error: null })
      .in("id", touched);
  }

  return NextResponse.json({ runId, officeId: office.officeId, inserted, stats });
}

function toOfficeLeadRow(row: LeadInsert, officeId: string) {
  return {
    office_id: officeId,
    facebook_group_id: row.group_id,
    post_url: row.post_url,
    ad_text: row.post_text,
    ad_date: row.published_at,
    extracted_area: row.location,
    extracted_type: row.offer_type,
    contact_info: row.phone
  };
}

async function dropKnownHashes(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  rows: LeadInsert[]
) {
  const { data } = await supabase
    .from("facebook_leads")
    .select("duplicate_hash")
    .in(
      "duplicate_hash",
      rows.map((row) => row.duplicate_hash)
    );

  const known = new Set((data ?? []).map((row: { duplicate_hash: string }) => row.duplicate_hash));
  return rows.filter((row) => !known.has(row.duplicate_hash));
}