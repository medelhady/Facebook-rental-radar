// One place to fold the spelling variants that make an Arabic dictionary miss.
// The groups this radar watches write Hassaniya, where the same post carries
// كراء / كراي / كريه and أرض / ارض, and a dictionary entry only matches one.

// Facebook wraps text in zero-width marks that survive a copy and make two
// identical reposts look like different strings.
const invisible = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
const tatweel = /\u0640/g;
const diacritics = /[\u064B-\u0652\u0670]/g;
const letters = /[\u0621-\u064Aa-zA-Z]/g;

export function stripInvisible(value: string) {
  return value.replace(invisible, "");
}

export function normalizeArabic(value: string) {
  return stripInvisible(value)
    .replace(tatweel, "")
    .replace(diacritics, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Both sides get normalized, so a dictionary entry written "شقة" still matches
// a post that wrote "شقه", and the dictionary does not need every spelling.
export function containsWord(normalizedText: string, word: string) {
  const needle = normalizeArabic(word);
  return needle.length > 0 && normalizedText.includes(needle);
}

// A third of scraped posts are reshares with no caption, and some of what is
// left is a bare phone number or a row of emoji. None of it can be matched or
// parsed, so it never reaches the keyword stage.
export function isJunkText(text: string) {
  const cleaned = stripInvisible(text).trim();
  if (cleaned.length < 15) return true;
  return (cleaned.match(letters) ?? []).length < 8;
}
