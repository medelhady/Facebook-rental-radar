import { containsWord, isJunkText, normalizeArabic } from "./normalize-arabic";
import {
  createDuplicateHash,
  extractLocation,
  extractPhone,
  extractPrice,
  inferOfficeName,
  scoreLead
} from "./parser";
import type { Keyword, OfferType } from "./types";

// The single place where a raw post becomes lead fields.
// The manual capture screen calls it in the browser for a live preview,
// the API recomputes it on the server, and the Apify webhook reuses it.

export type LeadFields = {
  phone?: string;
  price?: string;
  location?: string;
  officeName?: string;
};

export type LeadDraft = LeadFields & {
  confidence: number;
  offerType: OfferType;
  duplicateHash: string;
  matchedInclude: string[];
  matchedExclude: string[];
};

// Whether a post is worth storing at all. The capture screen ignores this —
// a human already decided — but the scraper needs it, because only about a
// third of what it pulls is a property post.
export type RelevanceVerdict = {
  relevant: boolean;
  reason?: "empty" | "junk" | "excluded" | "no_match";
};

export function judgeRelevance(input: { postText: string; keywords: Keyword[] }): RelevanceVerdict {
  const { postText, keywords } = input;

  if (!postText.trim()) return { relevant: false, reason: "empty" };
  if (isJunkText(postText)) return { relevant: false, reason: "junk" };

  const text = normalizeArabic(postText);

  // Cars, marriage brokers and phone-swap posts share these groups with the
  // rentals, and they are cheaper to reject than to parse.
  if (keywords.some((k) => k.type === "exclude" && containsWord(text, k.value))) {
    return { relevant: false, reason: "excluded" };
  }

  const matched = keywords.some(
    (k) => (k.type === "include" || k.type === "rent" || k.type === "sale") && containsWord(text, k.value)
  );

  return matched ? { relevant: true } : { relevant: false, reason: "no_match" };
}

export function detectOfferType(postText: string, keywords: Keyword[]): OfferType {
  const text = normalizeArabic(postText);
  const rent = keywords.some((k) => k.type === "rent" && containsWord(text, k.value));
  const sale = keywords.some((k) => k.type === "sale" && containsWord(text, k.value));

  // Posts that advertise both, or neither, are left for a human to read.
  if (rent === sale) return "unknown";
  return rent ? "rent" : "sale";
}

export function buildLeadDraft(input: {
  postText: string;
  authorName: string;
  keywords: Keyword[];
  overrides?: LeadFields;
}): LeadDraft {
  const { postText, authorName, keywords, overrides } = input;

  const text = normalizeArabic(postText);
  const locationWords = keywords.filter((keyword) => keyword.type === "location").map((k) => k.value);

  const matchedInclude = keywords
    .filter(
      (keyword) =>
        (keyword.type === "include" || keyword.type === "rent" || keyword.type === "sale") &&
        containsWord(text, keyword.value)
    )
    .map((keyword) => keyword.value);

  const matchedExclude = keywords
    .filter((keyword) => keyword.type === "exclude" && containsWord(text, keyword.value))
    .map((keyword) => keyword.value);

  const detectedPhone = extractPhone(postText);
  const phone = pick(overrides?.phone, detectedPhone);
  const price = pick(overrides?.price, extractPrice(postText, detectedPhone));
  const location = pick(overrides?.location, extractLocation(postText, locationWords));
  const officeName = pick(overrides?.officeName, inferOfficeName(authorName, postText));

  return {
    phone,
    price,
    location,
    officeName,
    confidence: scoreLead({ phone, price, location, officeName }),
    offerType: detectOfferType(postText, keywords),
    duplicateHash: createDuplicateHash({ phone, authorName, price, location, postText }),
    matchedInclude,
    matchedExclude
  };
}

function pick(override: string | undefined, extracted: string | undefined) {
  if (override === undefined) return extracted;
  const trimmed = override.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
