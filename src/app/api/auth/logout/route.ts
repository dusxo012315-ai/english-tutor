import { NextResponse } from "next/server";
import {
  COOKIE,
  cookieOptions,
  sameOrigin,
  requestAuthorized,
} from "@/server/auth";
export async function POST(request: Request) {
  try {
    if (!requestAuthorized(request))
      return NextResponse.json(
        { error: "로그인이 필요합니다." },
        { status: 401 },
      );
    if (!sameOrigin(request))
      return NextResponse.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json(
      { error: "로그아웃하지 못했어요." },
      { status: 503 },
    );
  }
}
