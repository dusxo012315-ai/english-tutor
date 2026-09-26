/** Only deliberately written user messages may cross the API boundary. */
export class UserFacingError extends Error {}
export function publicError(error: unknown) {
  return error instanceof UserFacingError
    ? error.message
    : "저장하지 못했어요. 연결과 저장소를 확인하고 다시 시도해 주세요.";
}
