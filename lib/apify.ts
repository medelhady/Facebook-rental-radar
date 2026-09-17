// Server-only wrapper around the Apify REST API.
// The dashboard drives the saved Task and its Schedule through here so the
// user never has to open the Apify console after the first setup.

const API = "https://api.apify.com/v2";

export type ApifyConfigStatus = {
  hasToken: boolean;
  hasTaskId: boolean;
  hasScheduleId: boolean;
  problem?: string;
};

function clean(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function apifyConfigStatus(): ApifyConfigStatus {
  const status: ApifyConfigStatus = {
    hasToken: clean(process.env.APIFY_TOKEN).length > 0,
    hasTaskId: clean(process.env.APIFY_TASK_ID).length > 0,
    hasScheduleId: clean(process.env.APIFY_SCHEDULE_ID).length > 0
  };

  if (!status.hasToken) status.problem = "APIFY_TOKEN غير موجود.";
  else if (!status.hasTaskId) status.problem = "APIFY_TASK_ID غير موجود.";
  else if (!status.hasScheduleId) status.problem = "APIFY_SCHEDULE_ID غير موجود.";

  return status;
}

function token() {
  const value = clean(process.env.APIFY_TOKEN);
  if (!value) throw new Error("APIFY_TOKEN غير موجود في متغيرات البيئة.");
  return value;
}

function taskId() {
  const value = clean(process.env.APIFY_TASK_ID);
  if (!value) throw new Error("APIFY_TASK_ID غير موجود في متغيرات البيئة.");
  // The console shows a task as "user/task-name", but the API path wants
  // "user~task-name". Copied as shown, the slash turns /actor-tasks/{id}/input
  // into a different URL and every call comes back 404.
  return value.replace("/", "~");
}

function scheduleId() {
  const value = clean(process.env.APIFY_SCHEDULE_ID);
  if (!value) throw new Error("APIFY_SCHEDULE_ID غير موجود في متغيرات البيئة.");
  return value;
}

async function call(path: string, init?: RequestInit) {
  const separator = path.includes("?") ? "&" : "?";
  const response = await fetch(`${API}${path}${separator}token=${encodeURIComponent(token())}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store"
  });

  const body = await response.text();
  if (!response.ok) {
    // Apify puts the useful part in error.message; the raw body is the fallback.
    let detail = body.slice(0, 300);
    try {
      detail = JSON.parse(body)?.error?.message ?? detail;
    } catch {
      /* keep the raw body */
    }
    throw new Error(`Apify ${response.status}: ${detail}`);
  }

  return body ? JSON.parse(body) : null;
}

type TaskInput = Record<string, unknown>;

export async function getTaskInput(): Promise<TaskInput> {
  return ((await call(`/actor-tasks/${taskId()}/input`)) as TaskInput) ?? {};
}

// The saved Task holds the Facebook cookies and the proxy config in the same
// input object as the group list. A PUT only updates the keys it carries, so
// sending the URL key alone leaves the cookies untouched — but only if the key
// name is right. Guessing it wrong succeeds silently and keeps the old list,
// so the name is read back from the task instead of hardcoded.
export function findUrlKey(input: TaskInput) {
  for (const [key, value] of Object.entries(input)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const first = value[0];
    const candidate = typeof first === "string" ? first : (first as { url?: string })?.url;
    if (typeof candidate === "string" && candidate.includes("facebook.com")) return key;
  }
  return "startUrls";
}

export async function syncApifyGroups(urls: string[]) {
  const input = await getTaskInput();
  const key = findUrlKey(input);
  const existing = input[key];

  // Match whichever shape the task already stores: ["url"] or [{ url }].
  const plainStrings = Array.isArray(existing) && typeof existing[0] === "string";
  const payload = plainStrings ? urls : urls.map((url) => ({ url }));

  await call(`/actor-tasks/${taskId()}/input`, {
    method: "PUT",
    body: JSON.stringify({ ...input, [key]: payload })
  });

  return { key, count: urls.length };
}

// "0 */5 * * *" does not mean "every 5 hours": it fires at 0,5,10,15,20 and
// then waits 4. Only the divisors of 24 spread evenly across the day.
export const ALLOWED_INTERVALS = [1, 2, 3, 4, 6, 8, 12, 24] as const;

export function cronForInterval(hours: number) {
  if (!ALLOWED_INTERVALS.includes(hours as (typeof ALLOWED_INTERVALS)[number])) {
    throw new Error(`عدد الساعات يجب أن يكون واحداً من: ${ALLOWED_INTERVALS.join("، ")}`);
  }
  return hours === 24 ? "0 0 * * *" : `0 */${hours} * * *`;
}

export async function syncApifySchedule(intervalHours: number) {
  const cron = cronForInterval(intervalHours);
  await call(`/schedules/${scheduleId()}`, {
    method: "PUT",
    body: JSON.stringify({ cronExpression: cron, isEnabled: true })
  });
  return cron;
}

export type ApifyPost = {
  id?: string;
  url?: string;
  text?: string;
  createdAt?: number;
  groupId?: string;
  inputUrl?: string;
  user?: { id?: string; name?: string; url?: string };
  topComments?: Array<{ text?: string }>;
};

// Datasets come back paged. A run over several groups can pass the default
// page size, and a webhook that only reads the first page loses the rest.
export async function getDatasetItems(datasetId: string, max = 2000): Promise<ApifyPost[]> {
  const items: ApifyPost[] = [];
  const limit = 500;

  while (items.length < max) {
    const page = (await call(
      `/datasets/${encodeURIComponent(datasetId)}/items?clean=false&offset=${items.length}&limit=${limit}`
    )) as ApifyPost[] | null;

    if (!page || page.length === 0) break;
    items.push(...page);
    if (page.length < limit) break;
  }

  return items;
}

// A webhook body is just an HTTP POST anyone can forge. Reading the run back
// from Apify is what proves it happened and yields the real dataset id.
export async function getRun(runId: string) {
  const data = (await call(`/actor-runs/${encodeURIComponent(runId)}`)) as {
    data?: { id?: string; status?: string; defaultDatasetId?: string };
  } | null;
  return data?.data ?? null;
}
