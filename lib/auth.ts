// One shared password for the whole dashboard, held in a signed cookie so it
// is typed once instead of on every action.
//
// This is a door lock, not user accounts: there is one password and no per-user
// identity. It is what the dashboard needs today, and it replaces having the
// password travel with every request.

export const SESSION_COOKIE = "radar_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // two weeks

// Web Crypto rather than node:crypto, because the middleware that guards every
// page runs on the Edge runtime where node:crypto does not exist.
async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

// Comparing with === leaks how much of the signature matched through timing.
function equals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The cookie carries an expiry and its signature, never the password itself,
// so a stolen cookie cannot be turned back into the password.
export async function createSession(secret: string) {
  const expiresAt = String(Date.now() + SESSION_MAX_AGE * 1000);
  return `${expiresAt}.${await sign(expiresAt, secret)}`;
}

export async function isValidSession(value: string | undefined, secret: string) {
  if (!value || !secret) return false;

  const [expiresAt, signature] = value.split(".");
  if (!expiresAt || !signature) return false;
  if (!Number(expiresAt) || Number(expiresAt) < Date.now()) return false;

  return equals(signature, await sign(expiresAt, secret));
}

export function adminPassword() {
  return (process.env.ADMIN_TOKEN ?? "").trim();
}
