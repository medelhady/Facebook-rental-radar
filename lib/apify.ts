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

// Cookies are the one input that must never travel back out. Reads return
// this summary; the values themselves only ever move browser -> server -> Apify.
export type CookieStatus = {
  key: string | null;
  count: number;
  hasSession: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
};

type CookieEntry = { name?: string; value?: string; expirationDate?: number };

function findCookieKey(input: TaskInput) {
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      const first = value[0] as CookieEntry | undefined;
      if (first && typeof first === "object" && "name" in first && "value" in first) return key;
    }
    if (typeof value === "string" && value.includes("c_user")) return key;
  }
  return null;
}

// c_user identifies the account and xs is the session itself. An export that
// is missing either one authenticates as nobody, and the run comes back in a
// few seconds with almost nothing rather than with an error.
const SESSION_COOKIES = ["c_user", "xs"];

export function summarizeCookies(entries: CookieEntry[], key: string | null): CookieStatus {
  const names = new Set(entries.map((entry) => entry.name));
  const hasSession = SESSION_COOKIES.every((name) => names.has(name));

  // The session dies with whichever of the essential cookies expires first.
  const stamps = entries
    .filter((entry) => entry.name && SESSION_COOKIES.includes(entry.name))
    .map((entry) => entry.expirationDate)
    .filter((value): value is number => typeof value === "number" && value > 0);

  const soonest = stamps.length > 0 ? Math.min(...stamps) : null;
  const expiresAt = soonest ? new Date(soonest * 1000).toISOString() : null;
  const daysLeft = soonest ? Math.floor((soonest * 1000 - Date.now()) / 86_400_000) : null;

  return { key, count: entries.length, hasSession, expiresAt, daysLeft };
}

export async function getCookieStatus(taskId: string): Promise<CookieStatus> {
  const input = await getTaskInput(taskId);
  const key = findCookieKey(input);
  if (!key) return { key: null, count: 0, hasSession: false, expiresAt: null, daysLeft: null };

  const raw = input[key];
  const entries: CookieEntry[] = Array.isArray(raw)
    ? (raw as CookieEntry[])
    : parseCookies(String(raw ?? ""));

  return summarizeCookies(entries, key);
}

export function parseCookies(text: string): CookieEntry[] {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("الصق الكوكيز أولاً.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error("الكوكيز يجب أن تكون بصيغة JSON كما تصدّرها الإضافة، تبدأ بـ [ وتنتهي بـ ].");
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("الكوكيز يجب أن تكون قائمة غير فارغة.");
  }

  const entries = parsed as CookieEntry[];
  if (!entries.every((entry) => entry && typeof entry === "object" && "name" in entry)) {
    throw new Error("الصيغة غير متوقعة — كل عنصر يجب أن يحمل name و value.");
  }

  return entries;
}

export async function syncApifyCookies(taskId: string, text: string) {
  const entries = parseCookies(text);
  const input = await getTaskInput(taskId);
  // Written back under whichever key the task already uses, so the actor keeps
  // reading the field it expects.
  const key = findCookieKey(input) ?? "cookies";
  const asString = typeof input[key] === "string";

  await call(`/actor-tasks/${normalizeTaskId(taskId)}/input`, {
    method: "PUT",
    body: JSON.stringify({ [key]: asString ? JSON.stringify(entries) : entries })
  });

  return summarizeCookies(entries, key);
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

export type RunSummary = {
  id: string;
  status: string;
  startedAt: string | null;
  seconds: number | null;
  itemCount: number | null;
  // A run that succeeds in seconds with almost nothing is an invalidated
  // Facebook session. Apify reports it as a success because nothing crashed,
  // which is why it costs hours to find by hand.
  looksEmpty: boolean;
};

const EMPTY_RUN_SECONDS = 20;
const EMPTY_RUN_ITEMS = 3;

async function datasetItemCount(datasetId: string | undefined) {
  if (!datasetId) return null;
  try {
    const data = (await call(`/datasets/${encodeURIComponent(datasetId)}`)) as {
      data?: { itemCount?: number };
    } | null;
    return data?.data?.itemCount ?? null;
  } catch {
    return null;
  }
}

export async function getRecentRuns(taskId: string, limit = 5): Promise<RunSummary[]> {
  const data = (await call(
    `/actor-tasks/${normalizeTaskId(taskId)}/runs?desc=1&limit=${limit}`
  )) as { data?: { items?: Array<Record<string, any>> } } | null;

  const items = data?.data?.items ?? [];

  return Promise.all(
    items.map(async (item, index) => {
      const startedAt = item.startedAt ?? null;
      const finishedAt = item.finishedAt ?? null;
      const seconds =
        startedAt && finishedAt
          ? Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 1000)
          : null;

      // Only the newest run pays for the extra lookup; the rest are context.
      const itemCount = index === 0 ? await datasetItemCount(item.defaultDatasetId) : null;
      const status = String(item.status ?? "");

      return {
        id: String(item.id ?? ""),
        status,
        startedAt,
        seconds,
        itemCount,
        // The post count alone is the signal. Requiring a short duration as
        // well let a 21-second run returning one post pass as healthy, which
        // is the exact case this was written to catch. Duration only stands in
        // when the count could not be read.
        looksEmpty:
          status === "SUCCEEDED" &&
          (itemCount !== null
            ? itemCount <= EMPTY_RUN_ITEMS
            : seconds !== null && seconds < EMPTY_RUN_SECONDS)
      };
    })
  );
}

export async function runTaskNow(taskId: string) {
  const data = (await call(`/actor-tasks/${normalizeTaskId(taskId)}/runs`, { method: "POST" })) as {
    data?: { id?: string; status?: string };
  } | null;

  return { id: data?.data?.id ?? "", status: data?.data?.status ?? "" };
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
