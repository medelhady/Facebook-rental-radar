export type SourceStatus = "active" | "paused" | "error";
export type LeadStatus = "new" | "comment_ready" | "contacted" | "duplicate" | "ignored";
export type KeywordType = "include" | "exclude" | "location" | "rent" | "sale";
export type OfferType = "rent" | "sale" | "unknown";

export type FacebookGroup = {
  id: string;
  name: string;
  url: string;
  location?: string;
  status: SourceStatus;
  lastCheckedAt?: string;
  newPosts: number;
  error?: string;
};

export type Keyword = {
  id: string;
  value: string;
  type: KeywordType;
};

export type CommentTemplate = {
  id: string;
  title: string;
  body: string;
  active: boolean;
};

export type Lead = {
  id: string;
  groupId: string;
  groupName: string;
  postUrl: string;
  authorName: string;
  authorProfileUrl?: string;
  postText: string;
  phone?: string;
  officeName?: string;
  price?: string;
  location?: string;
  confidence: number;
  offerType: OfferType;
  status: LeadStatus;
  suggestedComment: string;
  publishedAt?: string;
  firstSeenAt: string;
  duplicateHash: string;
};
