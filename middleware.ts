import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { adminPassword, isValidSession, SESSION_COOKIE } from "@/lib/auth";

// Apify calls this one and cannot log in. It carries its own secret in the
// query string and verifies every run against the Apify API before trusting it.
const PUBLIC_PATHS = [
  "/login",
  "/api/login",
  "/api/apify-webhook",
  "/api/health",
  "/api/offices/register",
  "/office/login",
  "/office/signup",
  "/office/forgot-password",
  "/office/reset-password"
];

// /office/dashboard (and anything else under /office/ not listed above) uses
// its own Supabase-session check, separate from the single admin password
// that guards the rest of the dashboard.
const OFFICE_PROTECTED_PREFIX = "/office/";

function clean(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "").replace(/\s/g, "");
}

async function hasOfficeSession(request: NextRequest, response: NextResponse) {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !key) return false;

  const supabase = createServerClient(url.startsWith("http") ? url : `https://${url}`, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return Boolean(user);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Office routes have their own auth system entirely, independent of the
  // single admin password below.
  if (pathname.startsWith(OFFICE_PROTECTED_PREFIX)) {
    if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
      return NextResponse.next();
    }

    const response = NextResponse.next();
    const authed = await hasOfficeSession(request, response);
    if (authed) return response;

    const login = new URL("/office/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  const secret = adminPassword();

  // With no password set the dashboard stays open, exactly as it was before
  // this existed. Locking the owner out of their own deployment over a missing
  // variable would be worse than the thing this guards against.
  if (!secret) return NextResponse.next();

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