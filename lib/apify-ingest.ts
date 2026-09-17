import type { ApifyPost } from "./apify";
import { buildLeadDraft, judgeRelevance } from "./lead-pipeline";
import { stripInvisible } from "./normalize-arabic";
import { extractPhone } from "./parser";
import type { Keyword } from "./types";

export type IngestStats = {
  checked: number;
  empty: number;
  junk: number;
  excluded: number;
  noMatch: number;
  matched: number;
  withPhone: number;
};

export type LeadInsert = {
  group_id: string | null;
  post_url: string;
  author_name: string;
  post_text: string;
  phone: string | null;
  office_name: string | null;
  price: string | null;
  location: string | null;
  confidence: number;
  offer_type: string;
  status: string;
  duplicate_hash: string;
  published_at: string | null;
  raw_payload: Record<string, unknown>;
};

// One group is stored as .../groups/1484099551860940 and scraped back as
// .../groups/mouanasidisidi/, so the numeric id and the vanity slug never
// match. Apify echoes the URL it was given as inputUrl, which does.
export function groupKey(url: string) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

export function buildLeadInserts(input: {
  posts: ApifyPost[];
  keywords: Keyword[];
  groups: Array<{ id: string; url: string }>;
  runId: string;
}): { rows: LeadInsert[]; stats: IngestStats } {
  const { posts, keywords, groups, runId } = input;

  const groupsByKey = new Map(groups.map((group) => [groupKey(group.url), group.id]));
  const stats: IngestStats = {
    checked: posts.length,
    empty: 0,
    junk: 0,
    excluded: 0,
    noMatch: 0,
    matched: 0,
    withPhone: 0
  };

  const rows: LeadInsert[] = [];
  // A run can return the same post twice, and the same ad reposted under a new
  // id hashes the same. Both are collapsed before anything reaches Supabase.
  const seenUrls = new Set<string>();
  const seenHashes = new Set<string>();

  for (const post of posts) {
    const postText = stripInvisible(post.text ?? "").trim();
    const postUrl = post.url?.trim() ?? "";
    if (!postUrl) continue;

    const verdict = judgeRelevance({ postText, keywords });
    if (!verdict.relevant) {
      if (verdict.reason === "empty") stats.empty += 1;
      else if (verdict.reason === "junk") stats.junk += 1;
      else if (verdict.reason === "excluded") stats.excluded += 1;
      else stats.noMatch += 1;
      continue;
    }

    if (seenUrls.has(postUrl)) continue;
    seenUrls.add(postUrl);

    const authorName = post.user?.name?.trim() || "غير معروف";
    const draft = buildLeadDraft({ postText, authorName, keywords });

    // In these groups the number is often left in the first comment instead of
    // the post, so the comments are a fallback for the phone only.
    const phone = draft.phone ?? phoneFromComments(post);
    if (seenHashes.has(draft.duplicateHash)) continue;
    seenHashes.add(draft.duplicateHash);

    stats.matched += 1;
    if (phone) stats.withPhone += 1;

    rows.push({
      group_id: groupsByKey.get(groupKey(post.inputUrl ?? "")) ?? null,
      post_url: postUrl,
      author_name: authorName,
      post_text: postText,
      phone: phone ?? null,
      office_name: draft.officeName ?? null,
      price: draft.price ?? null,
      location: draft.location ?? null,
      confidence: draft.confidence,
      offer_type: draft.offerType,
      status: "new",
      duplicate_hash: draft.duplicateHash,
      // Apify sends seconds; Date wants milliseconds. Nouakchott runs on UTC
      // all year, so no offset is applied.
      published_at: post.createdAt ? new Date(post.createdAt * 1000).toISOString() : null,
      raw_payload: { source: "apify", runId, postId: post.id ?? null, groupId: post.groupId ?? null }
    });
  }

  return { rows, stats };
}

function phoneFromComments(post: ApifyPost) {
  for (const comment of post.topComments ?? []) {
    const found = extractPhone(comment?.text ?? "");
    if (found) return found;
  }
  return undefined;
}
