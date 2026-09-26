import { createHash } from "node:crypto";
import { z } from "zod";
import type { Article, MaterialProvider } from "@/domain/types";
import { parseWikipediaInput } from "./input";
import { extractArticle, EXTRACTOR_VERSION } from "./extract";
import { WikipediaError } from "./errors";
const ENDPOINT = "https://simple.wikipedia.org/w/api.php";
const pageSchema = z.object({
  pageid: z.number().optional(),
  ns: z.number().optional(),
  title: z.string(),
  missing: z.boolean().optional(),
  invalid: z.boolean().optional(),
  pageprops: z.record(z.string(), z.unknown()).optional(),
  revisions: z
    .array(z.object({ revid: z.number(), timestamp: z.string() }))
    .optional(),
});
const querySchema = z.object({
  query: z.object({
    pages: z.array(pageSchema),
    rightsinfo: z.object({ text: z.string(), url: z.string() }),
  }),
});
const parseSchema = z.object({
  parse: z.object({
    title: z.string(),
    pageid: z.number(),
    revid: z.number(),
    text: z.string(),
  }),
});
export class WikipediaProvider implements MaterialProvider {
  constructor(
    private fetcher: typeof fetch = fetch,
    private timeoutMs = 15000,
  ) {}
  private async api(
    params: Record<string, string>,
    signal: AbortSignal,
  ): Promise<unknown> {
    const url = new URL(ENDPOINT);
    url.search = new URLSearchParams({
      format: "json",
      formatversion: "2",
      ...params,
    }).toString();
    try {
      const response = await this.fetcher(url, {
        headers: {
          "User-Agent":
            "ReadingRoom/0.2 (personal English reading application)",
          Accept: "application/json",
        },
        signal,
        redirect: "error",
        cache: "no-store",
      });
      if (response.status === 429) {
        const retry = response.headers.get("retry-after");
        const seconds = retry
          ? /^\d+$/.test(retry)
            ? Number(retry)
            : Math.max(0, Math.ceil((Date.parse(retry) - Date.now()) / 1000))
          : null;
        const retryAfter =
          seconds !== null && Number.isFinite(seconds)
            ? Math.min(seconds, 86400)
            : null;
        throw new WikipediaError(
          "UPSTREAM_RATE_LIMIT",
          retryAfter
            ? `Wikipedia 요청이 많아요. ${retryAfter}초 후 다시 시도해 주세요.`
            : "Wikipedia 요청이 많아요. 잠시 후 다시 시도해 주세요.",
          429,
          true,
          retryAfter,
        );
      }
      if (!response.ok)
        throw new WikipediaError(
          "UPSTREAM_ERROR",
          `Wikipedia가 요청을 처리하지 못했어요 (HTTP ${response.status}). 잠시 후 다시 시도해 주세요.`,
          502,
          true,
        );
      if (Number(response.headers.get("content-length")) > 5 * 1024 * 1024)
        throw new WikipediaError(
          "SOURCE_TOO_LARGE",
          "문서 응답이 너무 커요. 다른 글을 선택해 주세요.",
          413,
        );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Empty response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 5 * 1024 * 1024) {
            await reader.cancel();
            throw new WikipediaError(
              "SOURCE_TOO_LARGE",
              "문서 응답이 너무 커요. 다른 글을 선택해 주세요.",
              413,
            );
          }
          chunks.push(chunk.value);
        }
      } finally {
        reader.releaseLock();
      }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (data.error) {
        const code = data.error.code;
        if (code === "missingtitle" || code === "nosuchrevid")
          throw new WikipediaError(
            "ARTICLE_NOT_FOUND",
            "문서나 해당 판을 찾을 수 없어요. 다시 불러와 주세요.",
            404,
          );
        throw new WikipediaError(
          "UPSTREAM_ERROR",
          "Wikipedia API 오류가 발생했어요. 잠시 후 다시 시도해 주세요.",
          502,
          true,
        );
      }
      return data;
    } catch (error) {
      if (error instanceof WikipediaError) throw error;
      if (error instanceof SyntaxError)
        throw new WikipediaError(
          "INVALID_RESPONSE",
          "Wikipedia 응답을 읽을 수 없어요. 잠시 후 다시 시도해 주세요.",
          502,
          true,
        );
      if (signal.aborted)
        throw new WikipediaError(
          "UPSTREAM_TIMEOUT",
          "Wikipedia 응답이 지연되고 있어요. 입력은 유지되니 다시 시도해 주세요.",
          504,
          true,
        );
      throw new WikipediaError(
        "NETWORK_ERROR",
        "Wikipedia에 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
        502,
        true,
      );
    }
  }
  async resolve(input: string): Promise<Article | Article[]> {
    const title = parseWikipediaInput(input);
    const signal = AbortSignal.timeout(this.timeoutMs);
    const raw = await this.api(
      {
        action: "query",
        titles: title,
        redirects: "1",
        prop: "info|pageprops|revisions",
        inprop: "url",
        rvprop: "ids|timestamp",
        meta: "siteinfo",
        siprop: "rightsinfo",
      },
      signal,
    );
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success)
      throw new WikipediaError(
        "INVALID_RESPONSE",
        "Wikipedia 응답 형식이 올바르지 않아요. 다시 시도해 주세요.",
        502,
        true,
      );
    const page = parsed.data.query.pages[0];
    if (!page || page.missing || page.invalid)
      throw new WikipediaError(
        "ARTICLE_NOT_FOUND",
        "존재하지 않는 문서예요. 영어 제목의 철자나 원문 URL을 확인해 주세요.",
        404,
      );
    if (page.ns !== 0)
      throw new WikipediaError(
        "UNSUPPORTED_SOURCE",
        "일반 문서만 읽을 수 있어요. 사용자·분류·특수 문서는 지원하지 않아요.",
      );
    if (page.pageprops && "disambiguation" in page.pageprops)
      throw new WikipediaError(
        "DISAMBIGUATION",
        "여러 의미가 있는 제목이에요. 원문에서 원하는 문서를 선택해 정확한 제목을 입력해 주세요.",
        422,
      );
    const revision = page.revisions?.[0];
    if (!revision || !page.pageid)
      throw new WikipediaError(
        "INVALID_RESPONSE",
        "문서의 판 정보를 확인할 수 없어요.",
        502,
      );
    const rights = parsed.data.query.rightsinfo;
    // Require the license actually returned by the wiki rather than inventing metadata.
    if (
      !/^https?:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/(?:deed\.[a-z-]+)?$/.test(
        rights.url,
      )
    )
      throw new WikipediaError(
        "SOURCE_ATTRIBUTION_UNVERIFIED",
        "이 문서의 이용 조건을 확인할 수 없어서 불러오기를 보류했어요.",
        422,
      );
    const result = parseSchema.safeParse(
      await this.api(
        {
          action: "parse",
          oldid: String(revision.revid),
          prop: "text|revid",
          disableeditsection: "1",
        },
        signal,
      ),
    );
    if (
      !result.success ||
      result.data.parse.revid !== revision.revid ||
      result.data.parse.pageid !== page.pageid
    )
      throw new WikipediaError(
        "INVALID_RESPONSE",
        "본문과 판 정보가 일치하지 않아요. 다시 불러와 주세요.",
        502,
        true,
      );
    const content = extractArticle(result.data.parse.text);
    const sourceUrl = `https://simple.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;
    const hash = createHash("sha256")
      .update(JSON.stringify(content))
      .digest("hex")
      .slice(0, 16);
    return {
      id: `wiki-${page.pageid}-${revision.revid}-${hash}`,
      provider: "simple_wikipedia",
      title: page.title,
      topic: "Simple English Wikipedia",
      description: content.blocks[0].text.slice(0, 160),
      sourceUrl,
      notice:
        "Wikipedia 원문을 읽기용 일반 텍스트로 표시합니다. 문장을 요약하거나 번역하지 않았습니다.",
      blocks: content.blocks,
      pageId: page.pageid,
      revisionId: revision.revid,
      revisionTimestamp: revision.timestamp,
      fetchedAt: new Date().toISOString(),
      extractorVersion: EXTRACTOR_VERSION,
      omissions: content.omissions,
      attribution: {
        creatorLabel: `Simple English Wikipedia contributors · ${page.title}`,
        historyUrl: `https://simple.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title)}&action=history`,
        revisionUrl: `https://simple.wikipedia.org/w/index.php?oldid=${revision.revid}`,
        licenseName:
          rights.text || "Creative Commons Attribution-ShareAlike 4.0",
        licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
        extraNotices: content.extraNotices,
        changes: [
          "읽기용 텍스트 추출 및 공백 정규화",
          ...content.omissions.map((o) => `${o} 생략`),
        ],
      },
    };
  }
}
