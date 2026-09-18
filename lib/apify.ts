// Server-only wrapper around the Apify REST API.
// The dashboard drives the saved Tasks and the Schedule through here so the
// Apify console is only needed for the cookies themselves.

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

  // APIFY_TASK_ID is no longer required: tasks live in the apify_tasks table,
  // and the environment value is only a fallback before that table is filled.
  if (!status.hasToken) status.problem = "APIFY_TOKEN غير موجود.";
  else if (!status.hasScheduleId) status.problem = "APIFY_SCHEDULE_ID غير موجود.";

  return status;
}

function token() {
  const value = clean(process.env.APIFY_TOKEN);
  if (!value) throw new Error("APIFY_TOKEN غير موجود في متغيرات البيئة.");
  return value;
}

// The console shows a task as "user/task-name", but the API path wants
// "user~task-name". Copied as shown, the slash turns /actor-tasks/{id}/input
// into a different URL and every call comes back 404.
export function normalizeTaskId(value: string) {
  return clean(value).replace("/", "~");
}

// Kept for the fallback path: before apify_tasks is filled, the dashboard
// still drives the single task named in the environment.
export function envTaskId() {
  return normalizeTaskId(process.env.APIFY_TASK_ID ?? "");
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

export async function getTaskInput(taskId: string): Promise<TaskInput> {
  return ((await call(`/actor-tasks/${normalizeTaskId(taskId)}/input`)) as TaskInput) ?? {};
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

export async function syncApifyGroups(taskId: string, urls: string[]) {
  const input = await getTaskInput(taskId);
  const key = findUrlKey(input);
  const existing = input[key];

  // Match whichever shape the task already stores: ["url"] or [{ url }].
  const plainStrings = Array.isArray(existing) && typeof existing[0] === "string";
  const payload = plainStrings ? urls : urls.map((url) => ({ url }));

  await call(`/actor-tasks/${normalizeTaskId(taskId)}/input`, {
    method: "PUT",
    body: JSON.stringify({ [key]: payload })
  });

  return { key, count: urls.length };
}

// Every actor names its cap differently, and the saved task only carries the
// one its own actor uses. Guessing writes a key nobody reads: the call
// succeeds, the cap never changes, and nothing says so.
const LIMIT_KEYS = ["resultsLimit", "maxPosts", "maxItems", "maxResults", "postsLimit", "limit"];

export function findLimitKey(input: TaskInput) {
  for (const key of LIMIT_KEYS) {
    if (typeof input[key] === "number") return key;
  }
  return null;
}

export type TaskOverview = {
  taskId: string;
  urlKey: string;
  groupCount: number;
  limitKey: string | null;
  resultsLimit: number | null;
};

export async function getTaskOverview(taskId: string): Promise<TaskOverview> {
  const input = await getTaskInput(taskId);
  const urlKey = findUrlKey(input);
  const limitKey = findLimitKey(input);
  const urls = input[urlKey];

  return {
    taskId: normalizeTaskId(taskId),
    urlKey,
    groupCount: Array.isArray(urls) ? urls.length : 0,
    limitKey,
    resultsLimit: limitKey ? (input[limitKey] as number) : null
  };
}

export const MAX_RESULTS_LIMIT = 1000;

export async function syncApifyResultsLimit(taskId: string, limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS_LIMIT) {
    throw new Error(`عدد النتائج يجب أن يكون رقماً بين 1 و ${MAX_RESULTS_LIMIT}.`);
  }

  const input = await getTaskInput(taskId);
  // Falls back to the Apify convention when the task has never carried a cap.
  const key = findLimitKey(input) ?? "resultsLimit";

  await call(`/actor-tasks/${normalizeTaskId(taskId)}/input`, {
    method: "PUT",
    body: JSON.stringify({ [key]: limit })
  });

  return { key, limit };
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

type ScheduleAction = Record<string, any>;

async function getScheduleActions(): Promise<ScheduleAction[]> {
  const data = (await call(`/schedules/${scheduleId()}`)) as {
    data?: { actions?: ScheduleAction[] };
  } | null;
  return data?.data?.actions ?? [];
}

// Sending `actions` replaces the whole array, so it is always read first and
// merged. Anything in the schedule that the dashboard did not put there stays.
async function putScheduleActions(actions: ScheduleAction[]) {
  await call(`/schedules/${scheduleId()}`, {
    method: "PUT",
    body: JSON.stringify({ actions })
  });
}

export async function addTaskToSchedule(taskId: string) {
  const id = normalizeTaskId(taskId);
  const actions = await getScheduleActions();
  if (actions.some((action) => action.actorTaskId === id)) return { added: false };

  await putScheduleActions([...actions, { type: "RUN_ACTOR_TASK", actorTaskId: id }]);
  return { added: true };
}

export async function removeTaskFromSchedule(taskId: string) {
  const id = normalizeTaskId(taskId);
  const actions = await getScheduleActions();
  const remaining = actions.filter((action) => action.actorTaskId !== id);
  if (remaining.length === actions.length) return { removed: false };

  await putScheduleActions(remaining);
  return { removed: true };
}

export type ScheduleSummary = {
  id: string;
  name: string;
  cron: string;
  target: string;
  isTask: boolean;
};

// Shown when APIFY_SCHEDULE_ID is missing. The console only displays the
// schedule's name, while the API path needs its id, and hunting for that id in
// the address bar is where this setup usually stalls.
export async function listSchedules(): Promise<ScheduleSummary[]> {
  const data = (await call("/schedules?limit=50")) as {
    data?: { items?: Array<Record<string, any>> };
  } | null;

  return (data?.data?.items ?? []).map((item) => {
    // A schedule can hold several actions and starts all of them together, so
    // reading only the first hides an Actor sitting behind a correct Task.
    const actions = (item.actions ?? []) as ScheduleAction[];
    return {
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      cron: String(item.cronExpression ?? ""),
      target: actions.map((a) => String(a.actorTaskId ?? a.actorId ?? "")).join("، "),
      // An Actor among them runs with an empty default input: no cookies, no
      // groups, no results, and no error either.
      isTask: actions.length > 0 && actions.every((a) => a.type === "RUN_ACTOR_TASK")
    };
  });
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
