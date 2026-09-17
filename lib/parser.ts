// Mauritanian mobile numbers are 8 digits starting with 2, 3 or 4
// (Mattel, Mauritel, Chinguitel), written with or without +222 and often
// spaced in pairs: "36 93 00 96".
const mrPhonePattern =
  /(?<!\d)(?:(?:\+|00)?\s?222[\s.-]?)?([234])[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d(?!\d)/;

// Kept so the same dictionary still reads Gulf posts.
const saPhonePattern =
  /(?<!\d)(?:\+?966|00966|0)?\s?5[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d[\s.-]?\d(?!\d)/;

// A number only counts as a price when something in the text says it is one.
// Without that rule a phone number becomes the rent.
const priceWords = "أوقية|اوقية|أوقيه|اوقيه|MRU|UM|ريال|ر[.]س|درهم|دينار";
const periodWords = "شهري|شهريا|شهرياً|في الشهر|بالشهر|الشهر|سنوي|سنويا|سنوياً|في السنة|بالسنة";
const priceLabels = "السعر|سعر|الكراء|الكرا|كراء|الايجار|الإيجار|ايجار|إيجار|المبلغ|بسعر|القيمة";

const labelledPrice = new RegExp(
  String.raw`(?:${priceLabels})\s*:?\s*([0-9]{2,7})\s*(الف|ألف)?\s*(?:${priceWords})?\s*(?:${periodWords})?`
);

const suffixedPrice = new RegExp(
  String.raw`([0-9]{2,7})\s*(الف|ألف)?\s*(?:(?:${priceWords})|(?:${periodWords}))`
);

const officePattern = /(مكتب|عقارات|للعقارات|وسيط|سمسار|تسويق عقاري|وساطة عقارية|وكالة)/;

// "قرب كارفور SNDE" carries the location even when no dictionary word matches.
const nearbyPattern =
  /(?:قرب|بالقرب من|بجانب|جنب|أمام|امام|خلف|في حي|بحي|حي|منطقة|مقاطعة)\s+([^\n,،.؛]{2,28})/;

export function normalizeArabicDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function extractPhone(text: string) {
  const normalized = normalizeArabicDigits(text);
  const match = normalized.match(mrPhonePattern) ?? normalized.match(saPhonePattern);
  if (!match) return undefined;

  const digits = match[0].replace(/[^\d]/g, "");
  // Drop the country code so the saved number is the one people dial.
  if (digits.startsWith("222") && digits.length === 11) return digits.slice(3);
  return digits;
}

export function extractPrice(text: string, phone?: string) {
  const normalized = normalizeArabicDigits(text);
  // Take the phone out of the running before looking for a number.
  const withoutPhone = phone ? normalized.replace(new RegExp(spaced(phone), "g"), " ") : normalized;

  const match = withoutPhone.match(labelledPrice) ?? withoutPhone.match(suffixedPrice);
  if (!match) return undefined;

  const amount = match[1];
  if (!amount || amount.length < 2) return undefined;

  return match[0].replace(/\s+/g, " ").trim();
}

export function extractLocation(text: string, locations: string[]) {
  const normalized = text.toLowerCase();
  const known = locations.find((location) => normalized.includes(location.toLowerCase()));
  if (known) return known;

  const nearby = text.match(nearbyPattern)?.[1];
  if (!nearby) return undefined;

  // Keep it to the landmark itself: no phone numbers, no trailing sentence.
  const words = nearby
    .trim()
    .split(/\s+/)
    .filter((word) => !/[0-9٠-٩۰-۹]/.test(word))
    .slice(0, 3);

  return words.length > 0 ? words.join(" ") : undefined;
}

export function inferOfficeName(authorName: string, postText: string) {
  if (officePattern.test(authorName)) return authorName;
  if (officePattern.test(postText)) return authorName || undefined;
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

// The phone may appear spaced in the text but arrives here as bare digits.
function spaced(phone: string) {
  return phone.split("").join("[ .-]?");
}
