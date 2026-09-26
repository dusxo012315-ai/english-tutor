import { UserFacingError } from "@/domain/errors";
import type { Action } from "@/domain/schemas";
import type { SqliteRepository } from "@/data/repository";
export function tutorRuntimeState() {
  return {
    mode:
      process.env.TUTOR_MODE === "mock"
        ? ("mock" as const)
        : ("companion" as const),
    configured: true,
  };
}
// Integrated OpenAI adapter is intentionally not imported into the active runtime.
// Old TUTOR_MODE=openai settings cannot enable paid requests in this version.
export async function executeCurrentTutor(
  repo: SqliteRepository,
  action: Action,
) {
  if (tutorRuntimeState().mode === "companion") {
    if (action.type === "explain" || action.type === "followup")
      throw new UserFacingError(
        "이 버전은 ChatGPT Companion을 사용해요. 프롬프트를 복사해 ChatGPT에서 직접 질문해 주세요.",
      );
    if (
      action.type === "step" &&
      action.step === "quiz" &&
      !(await repo.getState()).items.find((i) => i.id === action.itemId)?.quiz
    )
      throw new UserFacingError(
        "이해도 확인 문제는 ChatGPT에서 만들어 주세요.",
      );
  }
  return await repo.execute(action);
}
