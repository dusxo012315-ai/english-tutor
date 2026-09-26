import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { AppState } from "../../src/domain/types";
import { reviewService } from "../../src/domain/review/review-service";
async function state(page: Page): Promise<AppState> {
  return (await (await page.request.get("/api/state")).json()).state;
}
async function act(page: Page, data: unknown) {
  const res = await page.request.post("/api/state", { data });
  expect(res.ok()).toBeTruthy();
  return await res.json();
}
async function clearRecommendations(page: Page) {
  for (const i of reviewService(await state(page)).eligible.filter(
    (i) =>
      ![
        "difficulty:pronunciation",
        "expression:were formed",
        "expression:natural boundary",
        "expression:over millions of years",
        "expression:grow crops",
      ].includes(i.key),
  ))
    await act(page, {
      type: "recordReview",
      requestId: randomUUID(),
      sourceReference: i.key,
      action: "DISMISSED",
      dismissal: "TODAY",
      note: "Test isolation",
      userUnderstandingAfter: null,
      candidateId: null,
    });
}
async function reading(page: Page, expression: string) {
  const { id } = await act(page, { type: "start", articleId: "himalayas" });
  const s = await state(page);
  const block = s.articles
    .find((a) => a.id === "himalayas")!
    .blocks.find((b) => b.text.includes(expression))!;
  const start = block.text.indexOf(expression);
  const { id: itemId } = await act(page, {
    type: "select",
    sessionId: id,
    blockId: block.id,
    start,
    end: start + expression.length,
  });
  const interactionId = randomUUID();
  await act(page, {
    type: "recordReadingInteraction",
    itemId,
    interactionId,
    questionType: "grammar",
    generatedPrompt: `Explain ${expression}`,
    chatOpened: false,
  });
  await act(page, {
    type: "interactionReflection",
    interactionId,
    userTakeaway: "내가 기록한 문법 설명",
    userUnderstanding: "PARTLY",
    pastedExplanation: "",
  });
  return { id, interactionId };
}
const tile = (page: Page, text: string) =>
  page
    .locator(".review-suggestion")
    .filter({ has: page.getByRole("heading", { name: text, exact: true }) });
test("A Reading low understanding → Review details → reassessment retains original history", async ({
  page,
}) => {
  await clearRecommendations(page);
  const { id, interactionId } = await reading(page, "were formed");
  await page.goto(`/learn/${id}`);
  await page.getByLabel("Need review · 이 학습 다시 보기").check();
  await expect
    .poll(
      async () =>
        (await state(page)).learningSessions.find((s) => s.id === id)
          ?.needReview,
    )
    .toBe(true);
  await page.goto("/review");
  const card = tile(page, "were formed");
  await expect(card).toContainText("Understanding 2 / 5");
  await card.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("내가 기록한 문법 설명");
  await dialog.getByText("원래 질문 프롬프트", { exact: true }).click();
  await expect(dialog).toContainText("Explain were formed");
  await dialog
    .getByLabel("How well do you understand this now?")
    .selectOption("4");
  await dialog.getByLabel("Review note").fill("이제 수동태를 이해했다");
  await dialog
    .getByRole("button", { name: "Review 완료", exact: true })
    .click();
  await expect(dialog).toContainText("After Review 4 / 5");
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(card).toHaveCount(0);
  const s = await state(page);
  expect(
    s.reviewEvents.find(
      (e) =>
        e.sourceReference === "expression:were formed" &&
        e.action === "REVIEWED",
    )?.userUnderstandingAfter,
  ).toBe(4);
  expect(
    s.companionInteractions.find((i) => i.id === interactionId)
      ?.userUnderstanding,
  ).toBe("PARTLY");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Start Review", exact: true }),
  ).toBeVisible();
});
test("B repeated Listening difficulty → clipboard + mocked popup → event and blocked fallback", async ({
  page,
  context,
}) => {
  await clearRecommendations(page);
  for (let i = 0; i < 2; i++) {
    const { id } = await act(page, {
      type: "startListening",
      sourceUrl: "https://breakingnewsenglish.com/2609/260925-test.html",
      userProvidedTitle: `Review listening ${i}`,
      level: "3",
    });
    await act(page, {
      type: "saveRound1",
      sessionId: id,
      data: {
        comprehension: 50,
        keywords: "weather",
        summary: "My summary",
        difficulty: "hard",
      },
    });
    await act(page, {
      type: "saveRound2",
      sessionId: id,
      data: { difficultyReasons: ["pronunciation"], reason: "Sounds join" },
    });
  }
  // A prior test run may have hidden this shared difficulty key today.
  const s = await state(page);
  expect(
    s.listeningDetails.filter((d) =>
      d.round2?.difficultyReasons.includes("pronunciation"),
    ).length,
  ).toBeGreaterThanOrEqual(2);
  await context.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ body: "<title>Mock ChatGPT</title>" }),
  );
  await page.goto("/review");
  const card = tile(page, "발음/축약·연결음");
  await card.getByRole("button", { name: "Ask ChatGPT", exact: true }).click();
  const prompt = await page.getByLabel("Review prompt").inputValue();
  expect(prompt).toContain("듣기 학습 전략");
  const popupPromise = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const popup = await popupPromise;
  await popup.close();
  await expect
    .poll(async () =>
      (await page.evaluate(() => navigator.clipboard.readText())).replace(
        /\r\n/g,
        "\n",
      ),
    )
    .toBe(prompt);
  await expect
    .poll(async () =>
      (await state(page)).reviewEvents.some(
        (e) =>
          e.sourceReference === "difficulty:pronunciation" &&
          e.action === "CHATGPT",
      ),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const fallback = page.getByRole("link", {
    name: "ChatGPT를 새 탭으로 열기 ↗",
  });
  await expect(fallback).toHaveAttribute("target", "_blank");
  const tabPromise = page.waitForEvent("popup");
  await fallback.click();
  await (await tabPromise).close();
});
test("C Review creates one Anki candidate then opens existing editor", async ({
  page,
}) => {
  await clearRecommendations(page);
  await reading(page, "natural boundary");
  await page.goto("/review");
  const card = tile(page, "natural boundary");
  await card
    .getByRole("button", { name: "Save to Anki", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Expression", { exact: true })).toHaveValue(
    "natural boundary",
  );
  await dialog
    .getByRole("button", { name: "Save candidate", exact: true })
    .click();
  await expect(card).toContainText("Existing candidate");
  await card
    .getByRole("button", { name: "Open Candidate", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Anki Card Editor" }),
  ).toBeVisible();
  const s = await state(page);
  expect(
    s.ankiCandidates.filter((c) => c.expression === "natural boundary"),
  ).toHaveLength(1);
  expect(
    s.reviewEvents.some(
      (e) =>
        e.sourceReference === "expression:natural boundary" &&
        e.action === "ANKI",
    ),
  ).toBe(true);
});
test("D/E Not now hides today without deleting data; permanent dismissal requires confirmation", async ({
  page,
}) => {
  await clearRecommendations(page);
  const first = await reading(page, "Over millions of years");
  await page.goto("/review");
  const temporary = tile(page, "Over millions of years");
  await temporary.getByRole("button", { name: "Not now", exact: true }).click();
  await expect(temporary).toHaveCount(0);
  await page.reload();
  await expect(temporary).toHaveCount(0);
  expect(
    (await state(page)).companionInteractions.some(
      (i) => i.id === first.interactionId,
    ),
  ).toBe(true);
  await reading(page, "grow crops");
  await page.reload();
  const permanent = tile(page, "grow crops");
  await permanent
    .getByRole("button", { name: "Don't recommend this again", exact: true })
    .click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(permanent).toBeVisible();
  await permanent
    .getByRole("button", { name: "Don't recommend this again", exact: true })
    .click();
  await page
    .getByRole("button", { name: "확인 · 더 이상 추천하지 않기", exact: true })
    .click();
  await expect(permanent).toHaveCount(0);
  await page.reload();
  await expect(permanent).toHaveCount(0);
  expect(
    (await state(page)).reviewEvents.some(
      (e) =>
        e.sourceReference === "expression:grow crops" &&
        e.dismissal === "FOREVER",
    ),
  ).toBe(true);
});
