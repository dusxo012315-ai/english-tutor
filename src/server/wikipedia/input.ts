import { WikipediaError } from "./errors";
export function parseWikipediaInput(input: string): string {
  const fail = (message: string): never => {
    throw new WikipediaError("INVALID_INPUT", message);
  };
  if (typeof input !== "string") return fail("제목 또는 URL을 입력해 주세요.");
  const value = input.trim();
  if (!value || value.length > 2048)
    return fail("제목 또는 URL을 1~2,048자로 입력해 주세요.");
  let title = value;
  const looksLikeUrl =
    /^[a-z][a-z\d+.-]*:/i.test(value) ||
    /^(\/\/|www\.)/i.test(value) ||
    /wikipedia\.org/i.test(value);
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return fail("올바른 HTTPS Wikipedia URL을 입력해 주세요.");
    }
    if (
      url.protocol !== "https:" ||
      !["simple.wikipedia.org", "simple.m.wikipedia.org"].includes(
        url.hostname,
      ) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      !url.pathname.startsWith("/wiki/")
    )
      throw new WikipediaError(
        "UNSUPPORTED_SOURCE",
        "Simple English Wikipedia의 HTTPS /wiki/ 문서 URL만 지원해요.",
      );
    try {
      title = decodeURIComponent(url.pathname.slice(6));
    } catch {
      return fail("URL의 문자 인코딩을 확인해 주세요.");
    }
    if (/%[\da-f]{2}/i.test(title))
      return fail(
        "여러 번 인코딩된 URL은 지원하지 않아요. 원문의 주소를 다시 복사해 주세요.",
      );
  }
  title = title.replace(/_/g, " ").normalize("NFC").trim();
  if (
    !title ||
    title.length > 255 ||
    /[\u0000-\u001f\u007f:#?\[\]{}|<>\\]/.test(title)
  )
    return fail("일반 문서 제목을 255자 이내로 입력해 주세요.");
  return title;
}
