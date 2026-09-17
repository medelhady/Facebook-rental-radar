import { NextResponse } from "next/server";
import {
  commentTemplates as demoTemplates,
  groups as demoGroups,
  keywords as demoKeywords,
  leads as demoLeads
} from "@/lib/demo-data";
import {
  mapGroup,
  mapKeyword,
  mapLead,
  mapTemplate,
  type GroupRow,
  type KeywordRow,
  type LeadRow,
  type TemplateRow
} from "@/lib/mappers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
// supabase-js calls fetch(); without this Next caches the first response forever.
export const fetchCache = "force-no-store";

export async function GET() {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({
      source: "demo",
      groups: demoGroups,
      keywords: demoKeywords,
      commentTemplates: demoTemplates,
      leads: demoLeads
    });
  }

  const [groupsRes, keywordsRes, templatesRes, leadsRes] = await Promise.all([
    supabase.from("facebook_groups").select("*").order("created_at", { ascending: false }),
    supabase.from("keywords").select("*").eq("active", true).order("created_at", { ascending: true }),
    supabase.from("comment_templates").select("*").order("created_at", { ascending: true }),
    supabase.from("facebook_leads").select("*").order("first_seen_at", { ascending: false }).limit(200)
  ]);

  const failed = [groupsRes, keywordsRes, templatesRes, leadsRes].find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const groupRows = (groupsRes.data ?? []) as GroupRow[];
  const leadRows = (leadsRes.data ?? []) as LeadRow[];

  const groupNames = new Map(groupRows.map((row) => [row.id, row.name]));
  const newPerGroup = new Map<string, number>();
  for (const row of leadRows) {
    if (!row.group_id || row.status !== "new") continue;
    newPerGroup.set(row.group_id, (newPerGroup.get(row.group_id) ?? 0) + 1);
  }

  return NextResponse.json({
    source: "supabase",
    groups: groupRows.map((row) => mapGroup(row, newPerGroup.get(row.id) ?? 0)),
    keywords: ((keywordsRes.data ?? []) as KeywordRow[]).map(mapKeyword),
    commentTemplates: ((templatesRes.data ?? []) as TemplateRow[]).map(mapTemplate),
    leads: leadRows.map((row) => mapLead(row, groupNames.get(row.group_id ?? "") ?? "غير محددة"))
  });
}
