import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { AppState } from "../../src/domain/types";
import { emptyCandidateFields } from "../../src/domain/anki";
async function state(page: Page): Promise<AppState> {
  return (await (await page.request.get("/api/state")).json()).state;
}
async function act(page: Page, data: unknown) {
  const r = await page.request.post("/api/state", { data });
  expect(r.ok()).toBeTruthy();
  return await r.json();
}
test("V1 Reading: prompt + takeaway drafts survive reload and Home resume; save, finish, History", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Wikipedia 제목 또는 URL").fill("Bird");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(page).toHaveURL(/\/learn\//);
  const url = page.url();
  await page.getByRole("button", { name: "able to", exact: true }).click();
  await page.getByLabel("질문 유형", { exact: true }).selectOption("grammar");
  await page
    .getByRole("button", { name: "프롬프트 수정", exact: true })
    .click();
  await page
    .getByLabel("학습용 프롬프트")
    .fill("Explain able to with a short Korean explanation.");
  await page
    .getByLabel("내가 배운 핵심 내용")
    .fill("초안: 다양한 시제에서 사용한다.");
  await page.getByLabel("내 이해 정도").selectOption("PARTLY");
  await page.reload();
  await expect(page.getByLabel("내가 배운 핵심 내용")).toHaveValue(
    "초안: 다양한 시제에서 사용한다.",
  );
  await expect(page.getByLabel("학습용 프롬프트")).toHaveValue(
    "Explain able to with a short Korean explanation.",
  );
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "학습 홈", exact: true })
    .click();
  await page
    .getByRole("region", { name: "Continue Learning" })
    .getByRole("link", { name: "Continue Bird", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(url);
  await expect(page.locator(".companion blockquote")).toHaveText("able to");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save to Anki", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Expression", { exact: true })
    .fill(`daily study ${Date.now()}`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save candidate", exact: true })
    .click();
  await page
    .getByRole("button", { name: "이번 학습 마치기", exact: true })
    .click();
  await page.goto("/history");
  await expect(
    page.locator(".history-card").filter({ hasText: "Bird" }).first(),
  ).toBeVisible();
  expect(
    (await state(page)).companionInteractions.some(
      (i) =>
        i.userTakeaway === "초안: 다양한 시제에서 사용한다." &&
        i.userUnderstanding === "PARTLY",
    ),
  ).toBe(true);
});
test("V1 Listening: unsaved rounds resume, previous stages persist, current final summary reaches Companion before completion", async ({
  page,
  context,
}) => {
  await context.route("https://breakingnewsenglish.com/**", (r) =>
    r.fulfill({ body: "<title>Mock lesson</title>" }),
  );
  await page.goto("/");
  await page
    .getByRole("link", { name: "Start Listening", exact: true })
    .click();
  const title = `V1 listening ${Date.now()}`;
  await page
    .getByLabel("Lesson URL", { exact: true })
    .fill("https://breakingnewsenglish.com/2609/260925-test.html");
  await page.getByLabel("학습 제목 (직접 입력)").fill(title);
  await page.getByRole("button", { name: "Start Listening Session" }).click();
  await expect(page).toHaveURL(/\/listening\//);
  const url = page.url();
  await page.getByLabel("1차 이해도 (0~100%)").fill("35");
  await page.getByLabel("들린 핵심 단어/아이디어").fill("weather");
  await page
    .getByLabel("짧은 내용 요약 (영어 또는 한국어)")
    .fill("첫 요약 초안");
  await page.reload();
  await expect(
    page.getByLabel("짧은 내용 요약 (영어 또는 한국어)"),
  ).toHaveValue("첫 요약 초안");
  await page.goto("/");
  await page
    .getByRole("link", { name: `Continue ${title}`, exact: true })
    .click();
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel("1차 이해도 (0~100%)")).toHaveValue("35");
  await page
    .getByRole("button", { name: "Finish Round 1", exact: true })
    .click();
  await page.getByRole("button", { name: /^✓ Round 1/ }).click();
  await expect(
    page.getByLabel("짧은 내용 요약 (영어 또는 한국어)"),
  ).toHaveValue("첫 요약 초안");
  await page
    .getByRole("button", { name: "Round 2 — Script Check", exact: true })
    .click();
  await page.getByLabel("발음/축약·연결음", { exact: true }).check();
  await page
    .getByLabel("내가 배운 핵심 내용")
    .fill("단계 이동 직전 작성한 메모");
  await page
    .getByRole("button", { name: "Finish Round 2", exact: true })
    .click();
  await page.getByLabel("두 번째 이해도 (0~100%)").fill("60");
  await expect(page.getByLabel("내가 배운 핵심 내용")).toHaveValue(
    "단계 이동 직전 작성한 메모",
  );
  await page
    .getByRole("button", { name: "Finish Round 3", exact: true })
    .click();
  const summary =
    "People couldn't travel because it rained. They stayed at home.";
  await page
    .getByLabel("What was the story about?", { exact: true })
    .fill(summary);
  await page.getByLabel("최종 이해도 (0~100%)").fill("65");
  await page.getByLabel("Listening 질문 유형").selectOption("summary");
  await expect(page.getByLabel("Listening 학습 프롬프트")).toHaveValue(
    new RegExp("People couldn"),
  );
  await page
    .getByLabel("임시 질문 텍스트", { exact: true })
    .fill("PRIVATE transient source fragment");
  await page
    .getByRole("button", { name: "프롬프트 복사", exact: true })
    .click();
  await page.getByLabel("내가 배운 핵심 내용").fill("과거 요약 표현");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  const stored = await state(page);
  expect(
    stored.companionInteractions.some((i) =>
      i.generatedPrompt.includes(summary),
    ),
  ).toBe(true);
  expect(JSON.stringify(stored)).not.toContain("PRIVATE transient");
  expect(
    await page.evaluate(() => JSON.stringify(sessionStorage)),
  ).not.toContain("PRIVATE transient");
  await page
    .getByRole("button", { name: "Finish Listening Session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Listening Session 결과" }),
  ).toBeVisible();
  await page.goto("/history");
  await page.getByRole("button", { name: "LISTENING", exact: true }).click();
  await expect(
    page.locator(".history-group").filter({ hasText: title }),
  ).toContainText(summary);
});
test("V1 Anki: editor draft survives refresh, two Unicode cards export atomically and browser Back works", async ({
  page,
}) => {
  const ids: string[] = [];
  for (const expression of [
    `couldn't ${Date.now()}`,
    `한글 표현 ${Date.now()}`,
  ]) {
    const r = await act(page, {
      type: "createCandidate",
      requestId: randomUUID(),
      sessionId: null,
      allowDuplicate: true,
      fields: {
        ...emptyCandidateFields(),
        expression,
        meaning: "뜻\t설명\n둘째 줄",
        exampleSentence: "Special < > & apostrophe: couldn't.",
        tags: ["한글", "daily"],
      },
    });
    ids.push(r.id);
  }
  await page.goto(`/cards?candidate=${ids[0]}`);
  await page.getByLabel("User note", { exact: true }).fill("편집 중인 메모");
  await page.reload();
  await expect(page.getByLabel("User note", { exact: true })).toHaveValue(
    "편집 중인 메모",
  );
  await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto(`/cards?candidate=${ids[1]}`);
  await page.getByRole("button", { name: "Mark Ready", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Ready to Export/ }).click();
  const s = await state(page);
  for (const id of ids) {
    const c = s.ankiCandidates.find((c) => c.id === id)!;
    await page
      .getByLabel(`${c.expression} export selection`, { exact: true })
      .check();
  }
  await page.getByRole("button", { name: "Export TSV", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "계속 · Download TSV" }).click();
  await (await downloaded).saveAs("artifacts/anki/v1-multiple.tsv");
  expect(
    (await state(page)).ankiCandidates.filter(
      (c) => ids.includes(c.id) && c.status === "EXPORTED",
    ),
  ).toHaveLength(2);
  await page.goto("/review");
  await page
    .getByRole("navigation", { name: "주 메뉴" })
    .getByRole("link", { name: "학습 기록", exact: true })
    .click();
  await expect(page).toHaveURL(/\/history$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/review$/);
});
test("V1 safe errors, keyboard labels, storage denial and empty views", async ({
  page,
}) => {
  await page.route("**/api/state", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ status: 503, body: "maintenance" })
      : route.continue(),
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "다시 시도", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Unexpected token");
  await page.unroute("**/api/state");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.getByLabel("Wikipedia 제목 또는 URL")).toBeVisible();
  await page.goto("/history");
  await page.getByLabel("기록의 글 제목 검색").fill("not-a-real-title-99999");
  await expect(
    page.getByRole("heading", { name: "표시할 기록이 없어요" }),
  ).toBeVisible();
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Blocked", "SecurityError");
    };
  });
  const { id } = await act(page, {
    type: "startListening",
    sourceUrl: "https://breakingnewsenglish.com/2609/260925-test.html",
    userProvidedTitle: "Storage blocked",
    level: "1",
  });
  await page.goto(`/listening/${id}`);
  await page
    .getByLabel("짧은 내용 요약 (영어 또는 한국어)")
    .fill("Keep this input");
  await expect(page.getByText(/초안 보관 불가/)).toBeVisible();
  await page.getByLabel("1차 이해도 (0~100%)").fill("50");
  await page
    .getByRole("button", { name: "Finish Round 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ROUND 2 — Script Check" }),
  ).toBeVisible();
});
test("V1 responsive reading and navigation at desktop, tablet and mobile widths", async ({
  page,
}) => {
  const { id } = await act(page, { type: "start", articleId: "bird" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [1280, 1440, 1920, 768, 820, 1024, 375, 430]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/learn/${id}`);
    await expect(page.locator(".reader-main")).toBeVisible();
    if (width >= 768)
      expect(
        (await page.locator(".reader-main").boundingBox())!.width,
      ).toBeGreaterThan(550);
    if (width <= 1100) {
      await expect(page.locator(".mobile-tabs")).toBeVisible();
      await expect(page.locator(".reader-shell > .tutor")).toBeHidden();
    }
    await page.screenshot({
      path: `artifacts/v1/reading-${width}.png`,
      fullPage: true,
    });
    for (const [path, heading] of [
      ["/review", "Today's Review"],
      ["/history", "학습 기록"],
      ["/cards", "Anki"],
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { name: heading, exact: true, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "주 메뉴" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.screenshot({
      path: `artifacts/v1/width-${width}.png`,
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});
