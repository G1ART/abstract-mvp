import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  LOCALE_COOKIE,
  defaultLocaleFromRequest,
} from "@/lib/i18n/locale";

const DEBUG_ROUTE_PATTERNS = [/^\/debug-schema(\/|$)/, /^\/my\/diagnostics(\/|$)/];

function isDebugRouteBlocked(pathname: string): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.NEXT_PUBLIC_DIAGNOSTICS === "1") return false;
  return DEBUG_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export function middleware(request: NextRequest) {
  if (isDebugRouteBlocked(request.nextUrl.pathname)) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const cookie = request.cookies.get(LOCALE_COOKIE);
  if (cookie?.value) {
    return NextResponse.next();
  }

  const locale = defaultLocaleFromRequest(request.headers);
  const response = NextResponse.next();
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 31536000,
    sameSite: "lax",
  });
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api routes
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
