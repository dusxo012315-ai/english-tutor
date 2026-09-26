import { test } from "node:test";
import assert from "node:assert/strict";
import { WikipediaProvider } from "../src/server/wikipedia/provider";
import { WikipediaError } from "../src/server/wikipedia/errors";
import { parseWikipediaInput } from "../src/server/wikipedia/input";
import { extractArticle } from "../src/server/wikipedia/extract";
import { buildTutorContext } from "../src/domain/selection";
import { SqliteRepository } from "../src/data/repository";
import { MockTutorAdapter } from "../src/server/adapters/mock";
import type { Article, LearningItem } from "../src/domain/types";
const info = {
  query: {
    pages: [
      {
        pageid: 1,
        ns: 0,
        title: "Physics",
        revisions: [{ revid: 23, timestamp: "2026-01-01T00:00:00Z" }],
      },
    ],
    rightsinfo: {
      url: "https://creativecommons.org/licenses/by-sa/4.0/deed.simple",
      text: "Creative Commons Attribution-Share Alike 4.0",
    },
  },
};
const html =
  '<div class="mw-parser-output"><p>Physics is the study of matter and energy.</p><h2>Energy</h2><p>Energy can change from one form to another.</p><ul><li>Motion</li><li>Heat</li></ul></div>';
function fakeProvider(values: unknown[]) {
  const urls: URL[] = [];
  const provider = new WikipediaProvider((async (input) => {
    urls.push(new URL(String(input)));
    return Response.json(values.shift());
  }) as typeof fetch);
  return { provider, urls };
}
test("real provider resolves a revision-pinned API response and attribution", async () => {
  const { provider, urls } = fakeProvider([
    info,
    { parse: { pageid: 1, title: "Physics", revid: 23, text: html } },
  ]);
  const result = await provider.resolve(
    "https://simple.m.wikipedia.org/wiki/Physics#Energy",
  );
  assert.ok(!Array.isArray(result));
  assert.equal(result.provider, "simple_wikipedia");
  assert.equal(result.blocks.length, 4);
  assert.equal(result.blocks[1].heading, "Energy");
  assert.equal(result.revisionId, 23);
  assert.match(result.attribution!.historyUrl, /action=history/);
  assert.match(result.attribution!.licenseUrl, /by-sa\/4.0/);
  assert.equal(urls[1].searchParams.get("oldid"), "23");
  assert.equal(
    urls.every(
      (u) =>
        u.origin === "https://simple.wikipedia.org" &&
        u.pathname === "/w/api.php",
    ),
    true,
  );
});
test("input validation rejects malformed and unsupported URLs", () => {
  for (const value of [
    "http://simple.wikipedia.org/wiki/Physics",
    "https://simple.wikipedia.org.evil.test/wiki/Physics",
    "https://user@simple.wikipedia.org/wiki/Physics",
    "https://simple.wikipedia.org:123/wiki/Physics",
    "https://simple.wikipedia.org/w/index.php?title=Physics",
    "https://simple.wikipedia.org/wiki/%253AAdmin",
    "ftp://simple.wikipedia.org/wiki/Physics",
    "simple.wikipedia.org/wiki/Physics",
    "https://simple.wikipedia.org/wiki/%ZZ",
    "Special:Random",
    "",
  ])
    assert.throws(() => parseWikipediaInput(value));
  assert.equal(
    parseWikipediaInput("https://simple.wikipedia.org/wiki/Albert_Einstein"),
    "Albert Einstein",
  );
});
test("HTML extraction removes active content, tables, images and formulas without rewriting prose", () => {
  const value = extractArticle(
    `<div class="mw-parser-output"><div class="attribution">This incorporates public domain text. <a href="https://example.com/credit">Credit</a></div><table><tr><td>OMIT TABLE</td></tr></table><figure>OMIT IMAGE<img src="x"></figure><script>BAD()</script><h2>Topic</h2><p onclick="BAD()">Exact <b>words</b> &amp; punctuation.<sup class="reference">[1]</sup></p><p>Equation <math>x+y</math> omitted as a whole.</p><ul><li>Parent<ul><li>Child</li></ul></li></ul><div class="reflist"><ol><li>OMIT REF</li></ol></div></div>`,
  );
  assert.deepEqual(
    value.blocks.map((b) => b.text),
    ["Exact words & punctuation.", "Parent", "Child"],
  );
  assert.ok(value.omissions.length >= 4);
  assert.match(
    value.extraNotices[0],
    /public domain.*https:\/\/example.com\/credit/,
  );
  assert.equal(value.blocks[0].heading, "Topic");
  assert.throws(
    () => extractArticle("<table><tr><td>only table</td></tr></table>"),
    /본문/,
  );
  assert.throws(
    () => extractArticle(`<p>${"a".repeat(100001)}</p>`),
    /100,000/,
  );
});
test("missing, disambiguation, invalid license, revision mismatch and HTTP-200 API errors are distinct", async () => {
  for (const [response, code] of [
    [
      {
        ...info,
        query: { ...info.query, pages: [{ title: "Absent", missing: true }] },
      },
      "ARTICLE_NOT_FOUND",
    ],
    [
      {
        ...info,
        query: {
          ...info.query,
          pages: [
            { ...info.query.pages[0], pageprops: { disambiguation: "" } },
          ],
        },
      },
      "DISAMBIGUATION",
    ],
    [
      {
        query: {
          ...info.query,
          rightsinfo: { text: "unknown", url: "https://example.com/license" },
        },
      },
      "SOURCE_ATTRIBUTION_UNVERIFIED",
    ],
    [{ error: { code: "badrequest" } }, "UPSTREAM_ERROR"],
  ] as const) {
    await assert.rejects(
      () => fakeProvider([response]).provider.resolve("Physics"),
      (e: unknown) => e instanceof WikipediaError && e.code === code,
    );
  }
  await assert.rejects(
    () =>
      fakeProvider([
        info,
        { parse: { pageid: 1, title: "Physics", revid: 24, text: html } },
      ]).provider.resolve("Physics"),
    (e: unknown) =>
      e instanceof WikipediaError && e.code === "INVALID_RESPONSE",
  );
});
test("network failure, slow API, rate limits and oversized responses are bounded", async () => {
  await assert.rejects(
    () =>
      new WikipediaProvider(
        (async () => new Response("{invalid json")) as typeof fetch,
      ).resolve("Physics"),
    (e: unknown) =>
      e instanceof WikipediaError && e.code === "INVALID_RESPONSE",
  );
  await assert.rejects(
    () =>
      new WikipediaProvider((async () => {
        throw new TypeError("offline");
      }) as typeof fetch).resolve("Physics"),
    (e: unknown) => e instanceof WikipediaError && e.code === "NETWORK_ERROR",
  );
  const slow = (async (_input, init) =>
    new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(Response.json(info)), 1000);
      init?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(new Error("aborted"));
        },
        { once: true },
      );
    })) as typeof fetch;
  await assert.rejects(
    () => new WikipediaProvider(slow, 10).resolve("Physics"),
    (e: unknown) =>
      e instanceof WikipediaError && e.code === "UPSTREAM_TIMEOUT",
  );
  await assert.rejects(
    () =>
      new WikipediaProvider(
        (async () => new Response("", { status: 429 })) as typeof fetch,
      ).resolve("Physics"),
    (e: unknown) =>
      e instanceof WikipediaError && e.code === "UPSTREAM_RATE_LIMIT",
  );
  await assert.rejects(
    () =>
      new WikipediaProvider(
        (async () =>
          new Response("data", {
            headers: { "content-length": "9999999" },
          })) as typeof fetch,
      ).resolve("Physics"),
    (e: unknown) =>
      e instanceof WikipediaError && e.code === "SOURCE_TOO_LARGE",
  );
});
test("exact selection and bounded original context reach the Tutor adapter and survive snapshot changes", async () => {
  const result = await fakeProvider([
    info,
    { parse: { pageid: 1, title: "Physics", revid: 23, text: html } },
  ]).provider.resolve("Physics");
  assert.ok(!Array.isArray(result));
  const article: Article = result;
  let received: LearningItem | undefined;
  class CaptureTutor extends MockTutorAdapter {
    explain(item: LearningItem) {
      if (item.tutorContext?.source.provider === "simple_wikipedia") {
        received = structuredClone(item);
        throw new Error("AI not connected");
      }
      return super.explain(item);
    }
  }
  const repo = new SqliteRepository(":memory:", new CaptureTutor());
  try {
    await repo.saveArticle(article);
    const sessionId = (
      await repo.execute({
        type: "start",
        articleId: article.id,
      })
    ).id!;
    const block = article.blocks[0];
    const start = block.text.indexOf("matter");
    const end = start + "matter and energy".length;
    const itemId = (
      await repo.execute({
        type: "select",
        sessionId,
        blockId: block.id,
        start,
        end,
      })
    ).id!;
    await repo.execute({
      type: "draft",
      itemId,
      guess: "물질과 에너지",
      question: "뜻?",
      questionType: "meaning",
      production: "",
    });
    await assert.rejects(
      async () =>
        await repo.execute({ type: "explain", itemId, unknown: false }),
      /AI not connected/,
    );
    assert.equal(received!.quote, "matter and energy");
    assert.equal(
      received!.tutorContext!.selection.quote,
      block.text.slice(start, end),
    );
    assert.equal(
      received!.tutorContext!.context.find((c) => c.blockId === block.id)!.text,
      block.text,
    );
    assert.equal(received!.tutorContext!.source.revisionId, 23);
    await repo.saveArticle({
      ...article,
      blocks: [
        { ...block, text: "A newer extraction must not overwrite history." },
      ],
    });
    assert.deepEqual(
      (await repo.getState()).articles.find((a) => a.id === article.id)!.blocks,
      article.blocks,
    );
    assert.equal(
      (await repo.getState()).items.find((i) => i.id === itemId)!.guess,
      "물질과 에너지",
    );
  } finally {
    await repo.close();
  }
});
test("repeated phrases use offsets; Unicode boundaries and long context remain exact", () => {
  const article: Article = {
    id: "x",
    title: "x",
    topic: "",
    description: "",
    sourceUrl: "",
    notice: "",
    blocks: [
      {
        id: "b",
        heading: "",
        text: "😀 same and same. " + "word ".repeat(1600),
      },
    ],
  };
  const text = article.blocks[0].text;
  const start = text.lastIndexOf("same");
  const context = buildTutorContext(article, "b", start, start + 4);
  assert.equal(context.selection.start, start);
  assert.equal(context.selection.quote, "same");
  assert.ok(context.context.reduce((sum, c) => sum + c.text.length, 0) <= 6000);
  assert.equal(context.contextTruncated, true);
  assert.throws(() => buildTutorContext(article, "b", 1, 2));
  assert.throws(() => buildTutorContext(article, "b", 0, 1201));
});
