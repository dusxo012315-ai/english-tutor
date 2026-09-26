import { requestAuthorized, sameOrigin } from "@/server/auth";
import { environment } from "@/server/environment";
import { WikipediaProvider } from "@/server/wikipedia/provider";
import { WikipediaError } from "@/server/wikipedia/errors";
import { repository } from "@/server/store";
import { MockWikipediaProvider } from "@/server/adapters/mock";
import { parseWikipediaInput } from "@/server/wikipedia/input";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!requestAuthorized(request))
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  try {
    const origin = request.headers.get("origin");
    if ((environment().auth || origin) && !sameOrigin(request))
      return Response.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403 },
      );
    const text = await request.text();
    if (text.length > 8192)
      throw new WikipediaError("INVALID_INPUT", "입력이 너무 길어요.", 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new WikipediaError("INVALID_INPUT", "요청 형식을 확인해 주세요.");
    }
    if (
      !body ||
      typeof body !== "object" ||
      !("input" in body) ||
      typeof body.input !== "string"
    )
      throw new WikipediaError(
        "INVALID_INPUT",
        "제목 또는 URL을 입력해 주세요.",
      );
    // Explicit offline test mode; real errors never fall back to mock articles.
    parseWikipediaInput(body.input);
    const provider =
      process.env.WIKIPEDIA_MODE === "mock"
        ? new MockWikipediaProvider()
        : new WikipediaProvider();
    const result = await provider.resolve(body.input);
    if (Array.isArray(result))
      return Response.json({ status: "choose", candidates: result });
    await repository().atomic(() => repository().saveArticle(result));
    return Response.json(
      { status: "resolved", article: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof WikipediaError)
      return Response.json(
        {
          error: error.message,
          code: error.code,
          retryable: error.retryable,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status: error.status,
          headers: {
            "Cache-Control": "no-store",
            ...(error.retryAfterSeconds !== null
              ? { "Retry-After": String(error.retryAfterSeconds) }
              : {}),
          },
        },
      );
    return Response.json(
      {
        error:
          "자료를 불러오거나 저장하지 못했어요. 인터넷 연결과 저장소를 확인하고 다시 시도해 주세요.",
        code: "IMPORT_FAILED",
        retryable: true,
      },
      { status: 500 },
    );
  }
}
