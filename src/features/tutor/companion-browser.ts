export const CHATGPT_URL = "https://chatgpt.com";
export async function copyPrompt(prompt: string) {
  if (!navigator.clipboard?.writeText)
    throw new Error(
      "클립보드를 사용할 수 없어요. 아래 프롬프트를 직접 선택해 복사해 주세요.",
    );
  try {
    await navigator.clipboard.writeText(prompt);
  } catch {
    throw new Error(
      "클립보드 복사가 허용되지 않았어요. 브라우저 권한을 확인하거나 아래 프롬프트를 직접 복사해 주세요.",
    );
  }
}
export function openChatGPT(): boolean {
  try {
    // Do not pass noopener in features: some browsers then return null even on success.
    // Detach the opener synchronously; never read or manipulate the remote page.
    const popup = window.open(
      CHATGPT_URL,
      "_blank",
      "popup=yes,width=500,height=800,resizable=yes,scrollbars=yes",
    );
    if (!popup) return false;
    popup.opener = null;
    return true;
  } catch {
    return false;
  }
}
