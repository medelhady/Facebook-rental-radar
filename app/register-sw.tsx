"use client";

import { useEffect } from "react";

// Registering a service worker is what makes Chrome on Android offer
// "Add to Home screen" — and an installed app is what appears in the
// Facebook app's share sheet.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are not worth interrupting the dashboard for.
    });
  }, []);

  return null;
}
