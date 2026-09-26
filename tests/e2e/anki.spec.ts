import { test, expect, type Page } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
test("long Reading selection is never auto-saved; Open existing opens and reopens the shared editor", async ({
  page,
}) => {
  const result = await (
    await page.request.post("/api/state", {
      data: { type: "start", articleId: "bird" },
    })
  ).json();
  await page.goto(`/learn/${result.id}`);
  await page
    .getByRole("button", { name: "이 문단에서 질문", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Save to Anki", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "선택 내용이 너무 길어요",
  );
  await expect(
    page.getByRole("dialog").getByLabel("Expression", { exact: true }),
  ).toHaveValue("");
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Save candidate", exact: true }),
  ).toBeDisabled();
  const before = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  expect(
    before.ankiCandidates.some((c) => c.sourceSessionId === result.id),
  ).toBe(false);
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "able to", exact: true }).click();
  await page.getByRole("button", { name: "Save to Anki", exact: true }).click();
  const expression = `existing link ${Date.now()}`;
  await page
    .getByRole("dialog")
    .getByLabel("Expression", { exact: true })
    .fill(expression);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save candidate", exact: true })
    .click();
  await page.getByRole("link", { name: "카드 편집하기", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Quick Add", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByLabel("Expression", { exact: true })
      .fill(expression);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save candidate", exact: true })
      .click();
    await page.getByRole("link", { name: /Open existing/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Anki Card Editor" }),
    ).toBeVisible();
    await expect(
      page.getByRole("dialog").getByLabel("Expression", { exact: true }),
    ).toHaveValue(expression);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "닫기", exact: true })
      .click();
  }
  const after = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  expect(
    after.ankiCandidates.filter((c) => c.expression === expression),
  ).toHaveLength(1);
});
async function exportOne(page: Page, expression: string) {
  await page.getByRole("button", { name: /^Ready to Export/ }).click();
  await page.getByLabel("Search candidates").fill(expression);
  await page
    .getByLabel(`${expression} export selection`, { exact: true })
    .check();
  await page.getByRole("button", { name: "Export TSV", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Target deck:");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "계속 · Download TSV" }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toMatch(/^anki-.*\.tsv$/);
  await file.saveAs(`artifacts/anki/${file.suggestedFilename()}`);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return file.suggestedFilename();
}
test("Reading → Companion takeaway → Candidate editor → Ready → Export → re-export warning", async ({
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
    .fill("can과 달리 다양한 시제에서 사용한다.");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save to Anki", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Expression", { exact: true })).toHaveValue(
    "able to",
  );
  await dialog
    .getByText("Meaning · Explanation · Example 추가", { exact: true })
    .click();
  await expect(dialog.getByLabel("Explanation", { exact: true })).toHaveValue(
    "can과 달리 다양한 시제에서 사용한다.",
  );
  const expression = `able to ${Date.now()}`;
  await dialog.getByLabel("Expression", { exact: true }).fill(expression);
  await dialog
    .getByRole("button", { name: "Save candidate", exact: true })
    .click();
  await page.getByRole("link", { name: "카드 편집하기", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Anki Card Editor" }),
  ).toBeVisible();
  await page.getByLabel("Meaning", { exact: true }).fill("할 수 있다");
  await page
    .getByLabel("Example", { exact: true })
    .fill("I will be able to swim.");
  await expect(page.getByRole("dialog")).toContainText("Front preview");
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await exportOne(page, expression);
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  const c = state.ankiCandidates.find((c) => c.expression === expression)!;
  expect(c.sourceType).toBe("READING");
  expect(c.status).toBe("EXPORTED");
  expect(c.exportedAt).toBeTruthy();
  expect(
    state.candidateExports.some((b) => b.candidateIds.includes(c.id)),
  ).toBe(true);
  await page
    .getByLabel(`${expression} export selection`, { exact: true })
    .check();
  await page.getByRole("button", { name: "Export TSV", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("already been exported");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.goto("/history");
  await expect(
    page.getByRole("link", { name: new RegExp(expression) }),
  ).toBeVisible();
  await page.getByRole("link", { name: new RegExp(expression) }).click();
  await expect(
    page.getByRole("dialog", { name: "Anki Card Editor" }),
  ).toBeVisible();
});
test("Listening Script Check → Quick Add → Companion → editor Sentence → Ready → Export", async ({
  page,
}) => {
  await page.goto("/listening");
  await page
    .getByLabel("Lesson URL", { exact: true })
    .fill("https://breakingnewsenglish.com/2609/260925-test.html");
  await page
    .getByLabel("학습 제목 (직접 입력)")
    .fill(`Listening Anki ${Date.now()}`);
  await page.getByRole("button", { name: "Start Listening Session" }).click();
  await page.getByLabel("1차 이해도 (0~100%)").fill("40");
  await page
    .getByRole("button", { name: "Finish Round 1", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "ROUND 2 — Script Check" }),
  ).toBeVisible();
  const sessionId = page.url().split("/").at(-1)!;
  await page
    .locator(".listening-work")
    .getByRole("button", { name: "Save to Anki", exact: true })
    .click();
  const expression = `connected speech ${Date.now()}`;
  await page
    .getByRole("dialog")
    .getByLabel("Expression", { exact: true })
    .fill(expression);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save candidate", exact: true })
    .click();
  await expect(
    page.getByText("Candidate 저장됨", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("내가 배운 핵심 내용")
    .fill("단어가 이어질 때 약한 소리에 주의한다.");
  await page
    .getByRole("button", { name: "배운 내용 저장", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "배운 내용 저장됨" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "카드 편집하기", exact: true }).click();
  await page.getByLabel("Meaning", { exact: true }).fill("연결 발음");
  await page
    .getByLabel("Explanation", { exact: true })
    .fill("단어가 이어질 때 약한 소리에 주의한다.");
  await page
    .getByLabel("Example", { exact: true })
    .fill("I noticed the connected speech.");
  await page.getByLabel("Card type", { exact: true }).selectOption("SENTENCE");
  await expect(page.locator(".card-preview")).toContainText("Key expression:");
  await page.getByRole("button", { name: "Mark Ready" }).click();
  await exportOne(page, expression);
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  const c = state.ankiCandidates.find((c) => c.expression === expression)!;
  expect(c.sourceSessionId).toBe(sessionId);
  expect(c.sourceType).toBe("LISTENING");
  expect(c.status).toBe("EXPORTED");
  expect(c.cardType).toBe("SENTENCE");
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Review Anki candidates" }),
  ).toBeVisible();
  await expect(page.locator(".dashboard-learning")).toContainText(
    "New candidates",
  );
});
test("duplicate warning → Open existing / Save anyway; deck presets and mobile editor", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/cards");
  const expression = `duplicate phrase ${Date.now()}`;
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Quick Add", exact: true }).click();
    await page
      .getByLabel("Expression", { exact: true })
      .fill(
        i
          ? `  ${expression.toUpperCase().replaceAll(" ", "   ")}  `
          : expression,
      );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Save candidate", exact: true })
      .click();
    if (i) {
      await expect(page.getByRole("dialog")).toContainText(
        "Similar card already exists",
      );
      await expect(
        page.getByRole("link", { name: /Open existing/ }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Save anyway", exact: true })
        .click();
    }
  }
  await page.getByLabel("Search candidates").fill("duplicate phrase");
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  expect(
    state.ankiCandidates.filter(
      (c) =>
        c.expression.toLowerCase().replace(/\s+/g, " ").trim() === expression,
    ),
  ).toHaveLength(2);
  await page.getByText("설정 · Deck presets", { exact: true }).click();
  await page
    .getByLabel("Deck presets (한 줄에 하나)")
    .fill("English::General Vocabulary\nMy English");
  await page.getByRole("button", { name: "Save deck presets" }).click();
  await expect(page.getByText("덱 preset 저장됨")).toBeVisible();
  await page.reload();
  await page.getByText("설정 · Deck presets", { exact: true }).click();
  await expect(page.getByLabel("Deck presets (한 줄에 하나)")).toContainText(
    "My English",
  );
  await page.getByRole("button", { name: "Quick Add", exact: true }).click();
  await page
    .getByText("Meaning · Explanation · Example 추가", { exact: true })
    .click();
  await page
    .getByLabel("Deck preset", { exact: true })
    .selectOption("My English");
  await expect(page.getByLabel("Deck", { exact: true })).toHaveValue(
    "My English",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/anki/mobile-editor.png",
    fullPage: true,
  });
});
