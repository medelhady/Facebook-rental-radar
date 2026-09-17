// Minimal service worker: required for the app to be installable on Android,
// which is what puts it in the Facebook share sheet. No caching on purpose —
// the dashboard must always show live data from Supabase.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
