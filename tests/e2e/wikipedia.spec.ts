import { test, expect } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
for (const title of ["Himalayas", "Physics", "Albert Einstein"])
  test(`actual Wikipedia reading and exact selection: ${title}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page
      .getByLabel("Wikipedia 제목 또는 URL")
      .fill(
        title === "Physics"
          ? "https://simple.wikipedia.org/wiki/Physics"
          : title,
      );
    await page
      .getByRole("button", { name: "글 불러오기", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: title, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByText("원문 출처와 이용 조건", { exact: true }),
    ).toBeAttached();
    await expect(
      page.getByRole("link", { name: /Creative Commons Attribution/ }),
    ).toHaveAttribute(
      "href",
      "https://creativecommons.org/licenses/by-sa/4.0/",
    );
    const sessionId = page.url().split("/learn/")[1];
    const before = (await (await page.request.get("/api/state")).json())
      .state as AppState;
    const session = before.sessions.find((s) => s.id === sessionId)!;
    const article = before.articles.find((a) => a.id === session.articleId)!;
    expect(article.provider).toBe("simple_wikipedia");
    expect(article.blocks.length).toBeGreaterThan(5);
    const block = article.blocks.find(
      (b) => b.text.length < 1200 && b.text.includes(". "),
    )!;
    const paragraph = page.locator(`[data-block="${block.id}"]`);
    const displayed = await paragraph.textContent();
    expect(displayed).toBe(block.text);
    const quote = block.text.slice(0, block.text.indexOf(". ") + 1);
    await paragraph.scrollIntoViewIfNeeded();
    await paragraph.evaluate((element, length) => {
      const range = document.createRange();
      range.setStart(element.firstChild!, 0);
      range.setEnd(element.firstChild!, length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    }, quote.length);
    const transfer = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/state") &&
        r.request().method() === "POST" &&
        r.request().postDataJSON()?.type === "select",
    );
    await page
      .getByRole("button", { name: "선택한 부분 질문하기", exact: true })
      .click();
    const transferred = (await (await transfer).json()).state as AppState;
    const item = transferred.items.find(
      (i) =>
        i.id ===
        transferred.sessions.find((s) => s.id === sessionId)!.activeItemId,
    )!;
    expect(item.quote).toBe(quote);
    expect(item.tutorContext?.selection.quote).toBe(quote);
    expect(
      item.tutorContext?.context.find((c) => c.blockId === block.id)?.text,
    ).toBe(block.text);
    expect(item.tutorContext?.source.snapshotId).toBe(article.id);
    expect(item.tutorContext?.source.revisionId).toBe(article.revisionId);
    await expect(page.locator("blockquote")).toHaveText(quote);
    await expect(page.locator(`[data-context-block="${block.id}"]`)).toHaveText(
      block.text,
    );
    await page.getByLabel("질문 유형", { exact: true }).selectOption("grammar");
    await expect(page.locator(".tutor-save")).toHaveText("학습 기록에 저장됨");
    await page.reload();
    await expect(page.locator("blockquote")).toHaveText(quote);
    await expect(page.getByLabel("질문 유형", { exact: true })).toHaveValue(
      "grammar",
    );
    await expect(page.getByLabel("학습용 프롬프트")).toHaveValue(
      new RegExp("문법/문장 구조 설명"),
    );
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      const tutor = document.querySelector(".tutor");
      if (tutor) tutor.scrollTop = 0;
    });
    await page.screenshot({
      path: `artifacts/wikipedia/wiki-${title.replace(/ /g, "-")}.png`,
    });
    expect(errors).toEqual([]);
  });
test("import error keeps input and permits explicit retry", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Wikipedia 제목 또는 URL").fill("Physics");
  await page.route("**/api/articles/resolve", (route) =>
    route.fulfill({
      status: 504,
      json: {
        error:
          "Wikipedia 응답이 지연되고 있어요. 입력은 유지되니 다시 시도해 주세요.",
        code: "UPSTREAM_TIMEOUT",
      },
    }),
  );
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "응답이 지연" }),
  ).toBeVisible();
  await expect(page.getByLabel("Wikipedia 제목 또는 URL")).toHaveValue(
    "Physics",
  );
  await expect(
    page.getByRole("button", { name: "글 불러오기", exact: true }),
  ).toBeEnabled();
  await page.unroute("**/api/articles/resolve");
  await page
    .getByLabel("Wikipedia 제목 또는 URL")
    .fill("https://example.org/wiki/Physics");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Simple English Wikipedia의 HTTPS" }),
  ).toBeVisible();
});
