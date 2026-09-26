import { NextResponse } from "next/server";
import {
  checkPassword,
  signSession,
  cookieOptions,
  COOKIE,
  sameOrigin,
} from "@/server/auth";
import { environment } from "@/server/environment";
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  try {
    environment();
    if (!sameOrigin(request))
      return NextResponse.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    // Per-process backstop; Preview must also use the platform's distributed WAF login rate limit.
    const key = request.headers.get("x-vercel-forwarded-for") || "local";
    const now = Date.now();
    for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
    const old = attempts.get(key);
    if (old && old.count >= 10)
      return NextResponse.json(
        { error: "잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    if (attempts.size > 1000)
      return NextResponse.json(
        { error: "잠시 후 다시 시도해 주세요." },
        { status: 429 },
      );
    attempts.set(key, {
      count: (old?.count || 0) + 1,
      until: old?.until || now + 600000,
    });
    const raw = await request.text();
    if (raw.length > 1024)
      return NextResponse.json(
        { error: "입력을 확인해 주세요." },
        { status: 400 },
      );
    const data = JSON.parse(raw);
    if (typeof data.password !== "string" || !checkPassword(data.password))
      return NextResponse.json(
        { error: "비밀번호를 확인해 주세요." },
        { status: 401 },
      );
    attempts.delete(key);
    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set(COOKIE, signSession(), cookieOptions());
    return response;
  } catch {
    return NextResponse.json(
      { error: "로그인 설정 또는 입력을 확인할 수 없어요." },
      { status: 503 },
    );
  }
}
