import { NextResponse } from "next/server";
import {
  commentTemplates as demoTemplates,
  groups as demoGroups,
  keywords as demoKeywords,
  leadFolders as demoFolders,
  leads as demoLeads
} from "@/lib/demo-data";
import {
  mapApifyTask,
  mapGroup,
  mapKeyword,
  mapLead,
  mapTemplate,
  type ApifyTaskRow,
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
  try {
    return await loadDashboardData();
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "خطأ غير متوقع أثناء القراءة من قاعدة البيانات."
      },
      { status: 500 }
    );
  }
}

async function loadDashboardData() {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({
      source: "demo",
      groups: demoGroups,
      keywords: demoKeywords,
      commentTemplates: demoTemplates,
      leads: demoLeads,
      apifyTasks: [],
      // The demo leads are already filed into these, so returning an empty
      // list here left the folder boxes invisible in demo mode.
      folders: demoFolders
    });
  }

  const [groupsRes, keywordsRes, templatesRes, leadsRes] = await Promise.all([
    supabase.from("facebook_groups").select("*").order("created_at", { ascending: false }),
    supabase.from("keywords").select("*").eq("active", true).order("created_at", { ascending: true }),
    supabase.from("comment_templates").select("*").order("created_at", { ascending: true }),
    supabase.from("facebook_leads").select("*").order("first_seen_at", { ascending: false }).limit(200)
  ]);

  // Optional until supabase/apify-tasks.sql has been run, so its error is not
  // allowed to blank the whole dashboard.
  const tasksRes = await supabase
    .from("apify_tasks")
    .select("*")
    .order("created_at", { ascending: true });

  // Also optional until supabase/lead-folders.sql has been run.
  const [foldersRes, itemsRes] = await Promise.all([
    supabase.from("lead_folders").select("*").order("created_at", { ascending: true }),
    supabase.from("lead_folder_items").select("folder_id, lead_id")
  ]);

  const items = (itemsRes.data ?? []) as Array<{ folder_id: string; lead_id: string }>;

  const foldersByLead = new Map<string, string[]>();
  const countByFolder = new Map<string, number>();
  for (const item of items) {
    foldersByLead.set(item.lead_id, [...(foldersByLead.get(item.lead_id) ?? []), item.folder_id]);
    countByFolder.set(item.folder_id, (countByFolder.get(item.folder_id) ?? 0) + 1);
  }

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
    leads: leadRows.map((row) =>
      mapLead(row, groupNames.get(row.group_id ?? "") ?? "غير محددة", foldersByLead.get(row.id) ?? [])
    ),
    apifyTasks: ((tasksRes.data ?? []) as ApifyTaskRow[]).map(mapApifyTask),
    folders: ((foldersRes.data ?? []) as Array<{ id: string; name: string }>).map((folder) => ({
      id: folder.id,
      name: folder.name,
      count: countByFolder.get(folder.id) ?? 0
    }))
  });
}
