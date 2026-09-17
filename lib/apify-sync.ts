import { syncApifyGroups } from "./apify";
import { getSupabaseAdmin } from "./supabase-admin";

// Pushes the active groups into the saved Apify Task input.
// The groups route calls it after every change; the button on the schedule
// screen calls it when Supabase and Apify have drifted apart.
export async function pushActiveGroups() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("قاعدة البيانات غير مربوطة.");

  const { data, error } = await supabase.from("facebook_groups").select("url").eq("status", "active");
  if (error) throw new Error(error.message);

  const urls = (data ?? []).map((row: { url: string }) => row.url).filter(Boolean);
  return syncApifyGroups(urls);
}
