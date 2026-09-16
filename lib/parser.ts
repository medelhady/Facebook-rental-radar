const phonePattern =
  /(?:\+?966|00966|0)?\s?5[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d/;

const pricePattern =
  /(?:السعر|الايجار|الإيجار|اجار|ايجار)?\s*([0-9٠-٩]{3,7})\s*(?:ريال|ر\.س|شهري|شهر|سنوي|سنويا)?/;

const officePattern = /(مكتب|عقارات|للعقارات|وسيط|تسويق عقاري|وساطة عقارية)/;

export function normalizeArabicDigits(value: string) {
  return value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function extractPhone(text: string) {
  const match = normalizeArabicDigits(text).match(phonePattern);
  if (!match) return undefined;
  return match[0].replace(/[^\d+]/g, "");
}

export function extractPrice(text: string) {
  const normalized = normalizeArabicDigits(text);
  const match = normalized.match(pricePattern);
  if (!match) return undefined;
  return match[0].trim();
}

export function extractLocation(text: string, locations: string[]) {
  const normalized = text.toLowerCase();
  return locations.find((location) => normalized.includes(location.toLowerCase()));
}

export function inferOfficeName(authorName: string, postText: string) {
  if (officePattern.test(authorName)) return authorName;
  if (officePattern.test(postText)) return authorName;
  return undefined;
}

export function scoreLead(fields: {
  phone?: string;
  price?: string;
  location?: string;
  officeName?: string;
}) {
  let score = 35;
  if (fields.phone) score += 30;
  if (fields.price) score += 15;
  if (fields.location) score += 10;
  if (fields.officeName) score += 10;
  return Math.min(score, 100);
}

export function createDuplicateHash(input: {
  phone?: string;
  authorName: string;
  price?: string;
  location?: string;
  postText: string;
}) {
  const base = input.phone
    ? `${input.phone}:${input.location ?? ""}:${input.price ?? ""}`
    : `${input.authorName}:${input.postText.slice(0, 120)}`;

  let hash = 0;
  for (let i = 0; i < base.length; i += 1) {
    hash = (hash << 5) - hash + base.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
