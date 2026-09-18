import { envTaskId, syncApifyGroups } from "./apify";
import { getSupabaseAdmin } from "./supabase-admin";

export type TaskSyncResult = {
  taskId: string;
  label: string;
  count: number;
  error?: string;
};

type TaskRow = { id: string; label: string; task_id: string };

// Before supabase/apify-tasks.sql is run there is no table to read, so the
// single task named in the environment is still the one driven. This keeps a
// half-migrated deployment working instead of failing on a missing relation.
async function loadTasks(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { data, error } = await supabase
    .from("apify_tasks")
    .select("id, label, task_id")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) return null;
  return data as TaskRow[];
}

// Pushes each task's own groups into that task's Apify input.
// The groups route calls it after every change; the button on the schedule
// screen calls it when Supabase and Apify have drifted apart.
export async function pushActiveGroups(): Promise<TaskSyncResult[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("قاعدة البيانات غير مربوطة.");

  const tasks = await loadTasks(supabase);

  if (!tasks) {
    const fallback = envTaskId();
    if (!fallback) {
      throw new Error("لا يوجد أي Task — أضف واحداً في شاشة «وقت البحث».");
    }

    const { data, error } = await supabase.from("facebook_groups").select("url").eq("status", "active");
    if (error) throw new Error(error.message);

    const urls = (data ?? []).map((row: { url: string }) => row.url).filter(Boolean);
    const result = await syncApifyGroups(fallback, urls);
    return [{ taskId: fallback, label: "الحساب الافتراضي", count: result.count }];
  }

  const results: TaskSyncResult[] = [];

  for (const task of tasks) {
    const { data, error } = await supabase
      .from("facebook_groups")
      .select("url")
      .eq("status", "active")
      .eq("apify_task_id", task.id);

    if (error) {
      results.push({ taskId: task.task_id, label: task.label, count: 0, error: error.message });
      continue;
    }

    const urls = (data ?? []).map((row: { url: string }) => row.url).filter(Boolean);

    try {
      const result = await syncApifyGroups(task.task_id, urls);
      results.push({ taskId: task.task_id, label: task.label, count: result.count });
      await supabase
        .from("apify_tasks")
        .update({ last_synced_at: new Date().toISOString(), last_error: null })
        .eq("id", task.id);
    } catch (syncError) {
      // One bad token or deleted task must not stop the others from syncing.
      const message = syncError instanceof Error ? syncError.message : "تعذر الإرسال إلى Apify.";
      results.push({ taskId: task.task_id, label: task.label, count: 0, error: message });
      await supabase.from("apify_tasks").update({ last_error: message }).eq("id", task.id);
    }
  }

  return results;
}

export function describeSync(results: TaskSyncResult[]) {
  return results
    .map((result) =>
      result.error ? `${result.label}: ${result.error}` : `${result.label}: ${result.count} مجموعة`
    )
    .join(" · ");
}
