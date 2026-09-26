import { repository } from "@/server/store";
import { actionSchema } from "@/domain/schemas";
import { publicError, UserFacingError } from "@/domain/errors";
import { executeCurrentTutor, tutorRuntimeState } from "@/server/tutor-runtime";
import { requestAuthorized, sameOrigin } from "@/server/auth";
import { environment } from "@/server/environment";
import { stateRevision } from "@/server/revision";
const headers = { "Cache-Control": "no-store" };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!requestAuthorized(request))
    return Response.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers },
    );
  try {
    const repo = repository();
    return await repo.atomic(async () => {
      const state = await repo.getState();
      return Response.json(
        {
          state: { ...state, tutor: tutorRuntimeState() },
          revision: stateRevision(state),
        },
        { headers },
      );
    });
  } catch {
    return Response.json(
      { error: "저장소에 연결하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  if (!requestAuthorized(request))
    return Response.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers },
    );
  try {
    const cfg = environment();
    if ((cfg.auth || request.headers.has("origin")) && !sameOrigin(request))
      return Response.json(
        { error: "허용되지 않은 요청입니다." },
        { status: 403, headers },
      );
    const body = await request.text();
    if (body.length > 65536)
      return Response.json(
        { error: "요청이 너무 커요." },
        { status: 413, headers },
      );
    const parsed = actionSchema.safeParse(JSON.parse(body));
    if (!parsed.success)
      return Response.json(
        { error: "입력 형식이나 길이를 확인해 주세요." },
        { status: 400, headers },
      );
    const repo = repository();
    return await repo.atomic(async () => {
      const before = await repo.getState(),
        expected = request.headers.get("if-match");
      if (
        (cfg.auth && !expected) ||
        (expected && expected !== stateRevision(before))
      )
        return Response.json(
          {
            error:
              "다른 기기에서 기록이 변경됐어요. 입력 초안을 보관하고 최신 기록을 확인한 뒤 다시 저장해 주세요.",
          },
          { status: 409, headers },
        );
      const result = await executeCurrentTutor(repo, parsed.data);
      return Response.json(
        {
          ...result,
          state: { ...result.state, tutor: tutorRuntimeState() },
          revision: stateRevision(result.state),
        },
        { headers },
      );
    });
  } catch (error) {
    return Response.json(
      { error: publicError(error) },
      {
        status:
          error instanceof UserFacingError || error instanceof SyntaxError
            ? 400
            : 500,
        headers,
      },
    );
  }
}
