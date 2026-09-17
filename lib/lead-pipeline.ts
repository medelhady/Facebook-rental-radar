import {
  createDuplicateHash,
  extractLocation,
  extractPhone,
  extractPrice,
  inferOfficeName,
  scoreLead
} from "./parser";
import type { Keyword } from "./types";

// The single place where a raw post becomes lead fields.
// The manual capture screen calls it in the browser for a live preview,
// the API recomputes it on the server, and the scheduled worker will reuse it.

export type LeadFields = {
  phone?: string;
  price?: string;
  location?: string;
  officeName?: string;
};

export type LeadDraft = LeadFields & {
  confidence: number;
  duplicateHash: string;
  matchedInclude: string[];
  matchedExclude: string[];
};

export function buildLeadDraft(input: {
  postText: string;
  authorName: string;
  keywords: Keyword[];
  overrides?: LeadFields;
}): LeadDraft {
  const { postText, authorName, keywords, overrides } = input;

  const locationWords = keywords.filter((keyword) => keyword.type === "location").map((k) => k.value);

  const matchedInclude = keywords
    .filter((keyword) => keyword.type === "include" && postText.includes(keyword.value))
    .map((keyword) => keyword.value);

  const matchedExclude = keywords
    .filter((keyword) => keyword.type === "exclude" && postText.includes(keyword.value))
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
