import { test, expect, type Page } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
test("Listening mobile popup fallback opens a native new tab and clipboard failure is visible", async ({
  page,
  context,
}) => {
  await context.route("https://chatgpt.com/**", (r) =>
    r.fulfill({ body: "<!doctype html><title>Mock ChatGPT</title>" }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, `Mobile listening ${Date.now()}`);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const fallback = page.getByRole("link", { name: "ChatGPT를 새 탭으로 열기" });
  await expect(fallback).toBeVisible();
  const opened = page.waitForEvent("popup");
  await fallback.click();
  const popup = await opened;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://chatgpt.com/");
  await popup.close();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () =>
          Promise.reject(new DOMException("denied", "NotAllowedError")),
      },
    });
  });
  await page
    .getByRole("button", { name: "프롬프트 복사", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "복사가 허용되지" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/learning/listening-mobile.png",
    fullPage: true,
  });
});
const lesson = "https://breakingnewsenglish.com/2609/260925-test-lesson.html";
async function start(page: Page, title: string) {
  await page.goto("/listening");
  await page.getByLabel("Lesson URL", { exact: true }).fill(lesson);
  await page.getByLabel("학습 제목 (직접 입력)").fill(title);
  await page.getByLabel("Level", { exact: true }).selectOption("3");
  await page.getByRole("button", { name: "Start Listening Session" }).click();
  await expect(
    page.getByRole("heading", { name: "ROUND 1 — First Listening" }),
  ).toBeVisible();
  return page.url().split("/listening/")[1];
}
async function round1(page: Page) {
  await page.getByLabel("1차 이해도 (0~100%)").fill("45");
  await page.getByLabel("들린 핵심 단어/아이디어").fill("weather, planning");
  await page
    .getByLabel("짧은 내용 요약 (영어 또는 한국어)")
    .fill("People use weather forecasts. It helps them plan.");
  await page.getByLabel("듣기가 어려웠던 정도").selectOption("hard");
  await page
    .getByRole("button", { name: "Finish Round 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ROUND 2 — Script Check" }),
  ).toBeVisible();
}
test("Listening full rounds → reflection → unified History and Dashboard", async ({
  page,
  context,
}) => {
  const external: string[] = [];
  context.on("request", (r) => {
    if (r.url().includes("breakingnewsenglish.com")) external.push(r.url());
  });
  await context.route("https://breakingnewsenglish.com/**", (r) =>
    r.fulfill({ body: "<!doctype html><title>Lesson mock</title>" }),
  );
  const title = `Listening journey ${Date.now()}`;
  const sessionId = await start(page, title);
  expect(external).toEqual([]);
  await expect(page.locator("iframe,audio")).toHaveCount(0);
  const opened = page.waitForEvent("popup");
  await page.getByRole("link", { name: /Open Breaking News English/ }).click();
  const lessonPage = await opened;
  await lessonPage.waitForLoadState();
  expect(lessonPage.url()).toBe(lesson);
  await lessonPage.close();
  expect(external).toEqual([lesson]);
  await round1(page);
  await page.getByLabel("몰랐던 단어", { exact: true }).check();
  await page.getByLabel("발음/축약·연결음", { exact: true }).check();
  await page.getByLabel("문장 연결을 인식하지 못함", { exact: true }).check();
  await page
    .getByLabel("왜 못 들었다고 생각하는가?")
    .fill("Weak sounds were difficult.");
  await page
    .getByRole("button", { name: "Finish Round 2", exact: true })
    .click();
  await page.getByLabel("두 번째 이해도 (0~100%)").fill("70");
  await page.getByLabel("새롭게 들린 내용").fill("the forecast");
  await page.getByLabel("아직 안 들리는 부분").fill("the linking sounds");
  await page
    .getByRole("button", { name: "Finish Round 3", exact: true })
    .click();
  await page.getByLabel("학습 표현 (10단어·80자 이내)").fill("be able to");
  await page.getByLabel("표현 뜻 (내 설명)").fill("할 수 있다");
  await page
    .getByRole("button", { name: "학습 표현으로 저장", exact: true })
    .click();
  await expect(
    page.getByText("be able to · 할 수 있다", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("학습 메모", { exact: true })
    .fill("Review connected speech tomorrow.");
  await page.getByRole("button", { name: "메모 저장", exact: true }).click();
  await expect(page.getByRole("button", { name: "메모 저장됨" })).toBeVisible();
  await page.getByLabel("최종 이해도 (0~100%)").fill("85");
  await page
    .getByLabel("What was the story about?", { exact: true })
    .fill(
      "People use forecasts to plan their day. Better predictions help them.",
    );
  await page.getByLabel("다시 복습할 필요가 있어요").check();
  await page
    .getByRole("button", { name: "Finish Listening Session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Listening Session 결과" }),
  ).toBeVisible();
  await expect(page.getByText("Need review:", { exact: false })).toContainText(
    "YES",
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Listening Session 결과" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "학습 기록", exact: true }).click();
  await page.getByRole("button", { name: "LISTENING", exact: true }).click();
  const record = page.locator(".history-group").filter({ hasText: title });
  await expect(record).toContainText("45%");
  await expect(record).toContainText("85%");
  await expect(record).toContainText("발음/축약·연결음");
  await expect(record).toContainText("Better predictions");
  await expect(record).toContainText("be able to");
  await expect(
    record.getByRole("link", { name: lesson, exact: true }),
  ).toHaveAttribute("href", lesson);
  await page.getByRole("button", { name: "READING", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "ALL", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  expect(
    state.learningSessions.find((s) => s.id === sessionId)?.completedAt,
  ).toBeTruthy();
  await page.getByRole("link", { name: "학습 홈", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "This Week", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-learning")).toContainText("85%");
  await page.screenshot({ path: "artifacts/learning/dashboard.png" });
});
test("Listening Companion copies ephemeral text, opens popup, persists only redacted prompt and takeaways", async ({
  page,
  context,
}) => {
  await context.route("https://chatgpt.com/**", (r) =>
    r.fulfill({ body: "<!doctype html><title>ChatGPT mock</title>" }),
  );
  const sent: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/")) sent.push(r.postData() ?? "");
  });
  const sessionId = await start(page, `Private questions ${Date.now()}`);
  await round1(page);
  const temporary = "TEMPORARY_SOURCE_NEVER_PERSIST_80923";
  await page.getByLabel("Listening 질문 유형").selectOption("summary");
  await page.getByLabel("임시 질문 텍스트", { exact: true }).fill(temporary);
  await expect(page.getByLabel("Listening 학습 프롬프트")).toHaveValue(
    /People use weather forecasts/,
  );
  await page
    .getByRole("button", { name: "프롬프트 복사", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "프롬프트를 복사했어요." }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    temporary,
  );
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const popup = await opened;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://chatgpt.com/");
  await popup.close();
  await page
    .getByLabel("내가 배운 핵심 내용")
    .fill("약한 소리가 연결되면 단어 경계가 바뀐다.");
  await page.getByLabel("내 이해 정도").selectOption("PARTLY");
  await page
    .getByText("ChatGPT 답변에서 핵심 설명 붙여넣기", { exact: true })
    .click();
  await page
    .getByLabel("핵심 설명 직접 붙여넣기")
    .fill("내가 정리한 핵심 설명");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  const interactions = state.companionInteractions.filter(
    (i) => i.sessionId === sessionId,
  );
  expect(interactions).toHaveLength(1);
  expect(interactions[0].chatOpened).toBe(true);
  expect(interactions[0].userTakeaway).toContain("단어 경계");
  expect(interactions[0].selectedText).toBeNull();
  expect(interactions[0].context).toBeNull();
  expect(interactions[0].generatedPrompt).toContain(
    "임시 질문 텍스트: 저장하지 않음",
  );
  expect(JSON.stringify(state)).not.toContain(temporary);
  expect(sent.join("")).not.toContain(temporary);
  await page.reload();
  await expect(
    page.getByLabel("임시 질문 텍스트", { exact: true }),
  ).toHaveValue("");
  await page.getByRole("link", { name: "학습 기록", exact: true }).click();
  await page.getByRole("button", { name: "LISTENING", exact: true }).click();
  const group = page
    .locator(".history-group")
    .filter({
      hasText: state.learningSessions.find((s) => s.id === sessionId)!
        .userProvidedTitle,
    });
  await group.locator(".interaction-history summary").click();
  await expect(group).toContainText("약한 소리가 연결");
  await expect(group).toContainText("내가 정리한 핵심 설명");
  await expect(group).not.toContainText(temporary);
});
test("Reading Companion preserves source selection, What I learned and Anki linkage", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Wikipedia 제목 또는 URL").fill("Bird");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await page.getByRole("button", { name: "able to", exact: true }).click();
  await page.getByLabel("질문 유형", { exact: true }).selectOption("grammar");
  await page
    .getByRole("button", { name: "프롬프트 복사", exact: true })
    .click();
  await page
    .getByLabel("내가 배운 핵심 내용")
    .fill("be able to 다음에는 동사원형");
  await page.getByLabel("내 이해 정도").selectOption("UNDERSTOOD");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("내가 배운 핵심 내용")).toHaveValue(
    "be able to 다음에는 동사원형",
  );
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  const sessionId = page.url().split("/learn/")[1];
  const interaction = state.companionInteractions.find(
    (i) => i.sessionId === sessionId,
  )!;
  expect(interaction.selectedText).toBe("able to");
  expect(interaction.context).toContain("Birds are animals");
  expect(state.learningSessions.find((s) => s.id === sessionId)?.type).toBe(
    "READING",
  );
  await expect(
    page.getByLabel("질문 유형", { exact: true }).locator("option"),
  ).toHaveCount(6);
  await page
    .getByText("직접 정리해서 Anki 카드 만들기", { exact: true })
    .click();
  await page.getByLabel("카드 뜻·설명").fill("할 수 있다");
  await page
    .getByRole("button", { name: "카드 검토하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
test("BNE URL and comprehension validation reject invalid requests without source fetching", async ({
  page,
}) => {
  await page.goto("/listening");
  await page
    .getByLabel("Lesson URL", { exact: true })
    .fill("https://breakingnewsenglish.com/2609/260925-test.mp3");
  await page.getByLabel("학습 제목 (직접 입력)").fill("invalid");
  await page.getByRole("button", { name: "Start Listening Session" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "HTML URL만" }),
  ).toBeVisible();
  const id = await start(page, `Validation ${Date.now()}`);
  const invalid = await page.request.post("/api/state", {
    data: {
      type: "saveRound1",
      sessionId: id,
      data: {
        comprehension: 101,
        keywords: "",
        summary: "",
        difficulty: "hard",
      },
    },
  });
  expect(invalid.status()).toBe(400);
  const leaked = await page.request.post("/api/state", {
    data: {
      type: "recordListeningInteraction",
      sessionId: id,
      interactionId: crypto.randomUUID(),
      questionType: "custom",
      chatOpened: false,
      temporaryText: "should be rejected",
    },
  });
  expect(leaked.status()).toBe(400);
});
