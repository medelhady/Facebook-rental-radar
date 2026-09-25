import { NextResponse, type NextRequest } from "next/server";
import { adminPassword, isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Apify calls this one and cannot log in. It carries its own secret in the
// query string and verifies every run against the Apify API before trusting it.
const PUBLIC_PATHS = ["/login", "/api/login", "/api/apify-webhook", "/api/health", "/api/offices/register"];

export async function middleware(request: NextRequest) {
  const secret = adminPassword();

  // With no password set the dashboard stays open, exactly as it was before
  // this existed. Locking the owner out of their own deployment over a missing
  // variable would be worse than the thing this guards against.
  if (!secret) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value, secret)) {
    return NextResponse.next();
  }

  // An API call gets a status it can act on; a page gets the login screen,
  // remembering where the person was headed.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "يلزم تسجيل الدخول." }, { status: 401 });
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the PWA files the browser fetches
  // before any session exists.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)"]
};