import { test, expect, type Page } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
async function seededPage(page: Page) {
  const result = await (
    await page.request.post("/api/state", {
      data: { type: "start", articleId: "bird" },
    })
  ).json();
  await page.goto(`/learn/${result.id}`);
  return result.id as string;
}
async function selectSentence(page: Page) {
  const blocks=page.locator('[data-block]');
  const index=await blocks.evaluateAll(elements=>elements.findIndex(e=>(e.textContent?.length??0)<=1200&&e.textContent?.includes('. ')));
  const paragraph = blocks.nth(Math.max(0,index));
  const text=(await paragraph.textContent())!;
  const boundary=text.indexOf('. ');
  const quote=boundary>=0?text.slice(0,boundary+1):text;
  await paragraph.scrollIntoViewIfNeeded();
  await paragraph.evaluate((element, length) => {
    const range = document.createRange();
    const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    const first=walker.nextNode()!;range.setStart(first,0);
    let node:Node|null=first;let remaining=length;
    while(node){if(remaining<=(node.textContent?.length??0)){range.setEnd(node,remaining);break;}remaining-=node.textContent?.length??0;node=walker.nextNode();}
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  }, quote.length);
  await page
    .getByRole("button", { name: "선택한 부분 질문하기", exact: true })
    .click();
  await expect(page.locator("blockquote")).toHaveText(quote);
  return quote;
}
test("selection → grammar prompt → actual clipboard → popup; edit, reset and restore", async ({
  page,
  context,
}) => {
  await context.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      body: "<!doctype html><title>ChatGPT test destination</title>",
    }),
  );
  await page.addInitScript(() => {
    const original = window.open.bind(window);
    window.open = (url, target, features) => {
      (window as unknown as { features?: string }).features = features;
      return original(url, target, features);
    };
  });
  const sessionId = await seededPage(page);
  const quote = await selectSentence(page);
  await page.getByLabel("질문 유형", { exact: true }).selectOption("grammar");
  const prompt = await page.getByLabel("학습용 프롬프트").inputValue();
  expect(prompt).toContain("현재 읽고 있는 글:\nBird");
  expect(prompt).toContain(quote);
  expect(prompt).toContain("주어·동사·수식 관계");
  expect(prompt).toContain("주변 문맥");
  await page
    .getByRole("button", { name: "프롬프트 복사", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "클립보드에 복사" }),
  ).toBeVisible();
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g,'\n')).toBe(
    prompt,
  );
  const opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const popup = await opened;
  await popup.waitForLoadState();
  expect(popup.url()).toBe("https://chatgpt.com/");
  expect(await popup.evaluate(() => window.opener === null)).toBe(true);
  expect(
    await page.evaluate(
      () => (window as unknown as { features: string }).features,
    ),
  ).toContain("width=500,height=800");
  await popup.close();
  await page
    .getByRole("button", { name: "프롬프트 수정", exact: true })
    .click();
  await page
    .getByLabel("학습용 프롬프트")
    .fill(prompt + "\n쉬운 말로 설명해 줘.");
  await expect(page.locator(".tutor-save")).toHaveText("학습 기록에 저장됨");
  await page.reload();
  await expect(page.getByLabel("학습용 프롬프트")).toHaveValue(
    prompt + "\n쉬운 말로 설명해 줘.",
  );
  await page
    .getByRole("button", { name: "선택 내용 초기화", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "어떤 문장이 궁금한가요?" }),
  ).toBeVisible();
  await page.reload();
  await expect(page.locator("blockquote")).toHaveCount(0);
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  const item = state.items.find((i) => i.sessionId === sessionId)!;
  expect(item.companion?.editedPrompt).toContain("쉬운 말로");
  expect(
    state.sessions.find((s) => s.id === sessionId)?.activeItemId,
  ).toBeNull();
  await page.getByRole("link", { name: "학습 기록", exact: true }).click();
  await page.getByRole("button", { name: "질문", exact: true }).click();
  await page
    .locator(".history-item-toggle")
    .filter({ hasText: quote })
    .first()
    .click();
  await page
    .getByRole("button", { name: "원문과 튜터에서 보기" })
    .first()
    .click();
  await expect(page.getByLabel("학습용 프롬프트")).toHaveValue(
    prompt + "\n쉬운 말로 설명해 줘.",
  );
});
test("popup blocked → user-clicked new tab fallback; denied clipboard never claims success", async ({
  page,
  context,
}) => {
  await context.route("https://chatgpt.com/**", (route) =>
    route.fulfill({
      body: "<!doctype html><title>ChatGPT test destination</title>",
    }),
  );
  await seededPage(page);
  await selectSentence(page);
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page
    .getByRole("button", { name: "ChatGPT에서 질문하기", exact: true })
    .click();
  const fallback = page.getByRole("link", { name: "ChatGPT를 새 탭으로 열기" });
  await expect(fallback).toHaveAttribute("target", "_blank");
  await expect(fallback).toHaveAttribute("rel", "noopener noreferrer");
  const opened = page.waitForEvent("popup");
  await fallback.click();
  const tab = await opened;
  await tab.waitForLoadState();
  expect(tab.url()).toBe("https://chatgpt.com/");
  await tab.close();
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
    page.getByRole("alert").filter({ hasText: "복사가 허용되지" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ChatGPT 열기", exact: true }).click();
  await expect(fallback).toBeVisible();
});
test("free question, mobile reading, manual card review and Anki TSV regression", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seededPage(page);
  await page
    .getByRole("button", { name: "이 문단에서 질문", exact: true })
    .first()
    .click();
  await page.getByLabel("질문 유형", { exact: true }).selectOption("custom");
  await expect(
    page.getByRole("button", { name: "ChatGPT에서 질문하기", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("자유 질문", { exact: true })
    .fill("with는 무슨 역할인가요?");
  await expect(page.getByLabel("학습용 프롬프트")).toHaveValue(
    /with는 무슨 역할/,
  );
  await page
    .getByText("직접 정리해서 Anki 카드 만들기", { exact: true })
    .click();
  await page
    .getByLabel("카드 뜻·설명")
    .fill("with는 특징을 나타낸다.\nA bird with blue wings.");
  // The debounced prompt save temporarily disables the card button. Wait for
  // persisted state so the button cannot become disabled between pointer events.
  await expect(page.locator(".tutor-save")).toHaveText("학습 기록에 저장됨");
  await page
    .getByRole("button", { name: "카드 검토하기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByText("FRONT", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "검토 완료·확정", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Birds are animals.*내보내기 선택/ })
    .last()
    .check();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /TSV 내보내기/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.tsv$/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});
test("LIVE Wikipedia import and original sentence context produce a grammar prompt without OpenAI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Wikipedia 제목 또는 URL").fill("Himalayas");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Himalayas", exact: true, level: 1 }),
  ).toBeVisible();
  const quote = await selectSentence(page);
  await page.getByLabel("질문 유형", { exact: true }).selectOption("grammar");
  const prompt = await page.getByLabel("학습용 프롬프트").inputValue();
  expect(prompt).toContain(quote);
  expect(prompt).toContain("Himalayas");
  expect(prompt).toContain("문법/문장 구조 설명");
  const state = (await (await page.request.get("/api/state")).json())
    .state as AppState;
  expect(state.tutor?.mode).toBe("companion");
  const session = state.sessions.find(
    (s) => s.id === page.url().split("/learn/")[1],
  )!;
  const item = state.items.find((i) => i.id === session.activeItemId)!;
  expect(item.tutorContext?.source.provider).toBe("simple_wikipedia");
  for (const b of item.tutorContext!.context) expect(prompt).toContain(b.text);
  expect(
    (
      await page.request.post("/api/state", {
        data: { type: "explain", itemId: item.id, unknown: true },
      })
    ).status(),
  ).toBe(400);
  await expect(page.getByText("API 키 필요", { exact: true })).toHaveCount(0);
  await page.screenshot({ path: "artifacts/companion/wikipedia-grammar.png" });
});
