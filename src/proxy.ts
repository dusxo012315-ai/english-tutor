import { NextRequest, NextResponse } from "next/server";
import { requestAuthorized } from "./server/auth";
export function proxy(request: NextRequest) {
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/api/auth/login"
  )
    return NextResponse.next();
  if (requestAuthorized(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/"))
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  return NextResponse.redirect(new URL("/login", request.url));
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
