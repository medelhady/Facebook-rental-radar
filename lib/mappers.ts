import type {
  CommentTemplate,
  FacebookGroup,
  Keyword,
  KeywordType,
  Lead,
  LeadStatus,
  OfferType,
  SourceStatus
} from "./types";

export type GroupRow = {
  id: string;
  name: string;
  url: string;
  location: string | null;
  status: SourceStatus;
  last_checked_at: string | null;
  last_error: string | null;
};

export type KeywordRow = {
  id: string;
  value: string;
  type: KeywordType;
};

export type TemplateRow = {
  id: string;
  title: string;
  body: string;
  active: boolean;
};

export type LeadRow = {
  id: string;
  group_id: string | null;
  post_url: string;
  author_name: string;
  author_profile_url: string | null;
  post_text: string;
  phone: string | null;
  office_name: string | null;
  price: string | null;
  location: string | null;
  confidence: number;
  offer_type: OfferType | null;
  status: LeadStatus;
  suggested_comment: string | null;
  published_at: string | null;
  first_seen_at: string;
  duplicate_hash: string;
};

export function mapGroup(row: GroupRow, newPosts = 0): FacebookGroup {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    location: row.location ?? undefined,
    status: row.status,
    lastCheckedAt: row.last_checked_at ?? undefined,
    newPosts,
    error: row.last_error ?? undefined
  };
}

export function mapKeyword(row: KeywordRow): Keyword {
  return { id: row.id, value: row.value, type: row.type };
}

export function mapTemplate(row: TemplateRow): CommentTemplate {
  return { id: row.id, title: row.title, body: row.body, active: row.active };
}

export function mapLead(row: LeadRow, groupName: string): Lead {
  return {
    id: row.id,
    groupId: row.group_id ?? "",
    groupName,
    postUrl: row.post_url,
    authorName: row.author_name,
    authorProfileUrl: row.author_profile_url ?? undefined,
    postText: row.post_text,
    phone: row.phone ?? undefined,
    officeName: row.office_name ?? undefined,
    price: row.price ?? undefined,
    location: row.location ?? undefined,
    confidence: row.confidence,
    offerType: row.offer_type ?? "unknown",
    status: row.status,
    suggestedComment: row.suggested_comment ?? "",
    publishedAt: row.published_at ?? undefined,
    firstSeenAt: row.first_seen_at,
    duplicateHash: row.duplicate_hash
  };
}
