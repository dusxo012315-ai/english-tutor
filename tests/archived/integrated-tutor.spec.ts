import { test, expect } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
test("structured explanation, vocabulary, examples, followup and quiz UI (mock responses)", async ({
  page,
  request,
}) => {
  const session = await (
    await request.post("/api/state", {
      data: { type: "start", articleId: "bird" },
    })
  ).json();
  const selected = await (
    await request.post("/api/state", {
      data: {
        type: "select",
        sessionId: session.id,
        blockId: "b-1",
        start: 0,
        end: 39,
      },
    })
  ).json();
  const state: AppState = selected.state;
  state.tutor = { mode: "openai", configured: true };
  const item = state.items.find((i) => i.id === selected.id)!;
  let calls = 0;
  await page.route("**/api/state", async (route) => {
    if (route.request().method() === "POST") {
      const action = route.request().postDataJSON();
      if (action.type === "explain") {
        calls++;
        item.answer = {
          provider: "openai",
          directAnswerKo: "주어 Birds와 동사 are로 이루어진 문장이에요.",
          translationKo: "새는 깃털과 날개가 있는 동물이에요.",
          explanationKo: "with는 특징을 나타내는 전치사예요.",
          expression: "with",
          meaning: "~을 가진",
          chunks: [{ text: "Birds", role: "주어" }],
          examples: [
            { en: "A bird with blue wings.", ko: "파란 날개를 가진 새." },
          ],
          feedback: "원문에서 with의 역할을 찾아보세요.",
          vocabulary: [{ expression: "feathers", meaning: "깃털" }],
        };
        item.quiz = {
          prompt: "with의 의미는?",
          options: [
            { id: "a", text: "가진" },
            { id: "b", text: "없이" },
            { id: "c", text: "이전에" },
          ],
          correctId: "a",
          explanation: "특징을 나타내요.",
        };
        item.step = "explanation";
      } else if (action.type === "followup") {
        calls++;
        expect(action.requestId).toBeTruthy();
        item.followups.push({
          question: action.question,
          reply: "특징을 설명해요.",
          supplementaryKo: "명사 뒤에서 수식해요.",
        });
      } else if (action.type === "step") item.step = action.step;
      else {
        await route.continue();
        return;
      }
    }
    await route.fulfill({ json: { state } });
  });
  await page.goto(`/learn/${session.id}`);
  await page.getByRole("button", { name: "바로 해설 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "질문에 대한 답변" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "보충 설명 · 문장 구조와 문법" }),
  ).toBeVisible();
  await expect(page.getByText("feathers", { exact: true })).toBeVisible();
  await expect(
    page.getByText("A bird with blue wings.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("추가 질문", { exact: true })
    .fill("with는 무슨 역할인가요?");
  await page.getByRole("button", { name: "추가 질문 보내기" }).click();
  await expect(page.locator(".assistant-bubble")).toContainText(
    "특징을 설명해요.",
  );
  await expect(page.locator(".assistant-bubble")).toContainText("보충 설명");
  await page.locator("button.primary").filter({ hasText: "기억 확인" }).click();
  await expect(
    page.getByRole("heading", { name: "with의 의미는?" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  await page.screenshot({ path: "artifacts/tutor/quiz.png", fullPage: true });
});
test("missing key is safe, immediate explanation is available, guess and exact context survive", async ({
  page,
  request,
}) => {
  const session = await (
    await request.post("/api/state", {
      data: { type: "start", articleId: "bird" },
    })
  ).json();
  const article = session.state.articles.find(
    (a: { id: string }) => a.id === "bird",
  );
  const block = article.blocks[0];
  const start = block.text.indexOf("able to");
  const selected = await (
    await request.post("/api/state", {
      data: {
        type: "select",
        sessionId: session.id,
        blockId: block.id,
        start,
        end: start + 7,
      },
    })
  ).json();
  await page.goto(`/learn/${session.id}`);
  await expect(
    page.getByRole("button", { name: "바로 해설 보기" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "설명 확인", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "바로 해설 보기" }).click();
  await expect(page.locator(".inline-error")).toContainText("OPENAI_API_KEY");
  await page.getByLabel("내 생각에는…").fill("할 수 있다는 뜻");
  await page.getByRole("button", { name: "설명 확인", exact: true }).click();
  await expect(page.locator(".inline-error")).toContainText("OPENAI_API_KEY");
  await page.reload();
  await expect(page.getByLabel("내 생각에는…")).toHaveValue("할 수 있다는 뜻");
  const state = await (await request.get("/api/state")).json();
  const item = state.state.items.find(
    (i: { id: string }) => i.id === selected.id,
  );
  expect(item.tutorContext.selection.quote).toBe("able to");
  expect(item.tutorContext.context[0].text).toBe(block.text);
  expect(item.answer).toBeNull();
  expect(item.tutorPending).toBeUndefined();
  expect(JSON.stringify(state)).not.toContain("sk-");
});
test("server rejects cross-origin and oversized requests", async ({
  request,
}) => {
  expect(
    (
      await request.post("/api/state", {
        headers: { origin: "https://evil.example" },
        data: { type: "font", value: 20 },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/state", {
        data: { type: "followup", itemId: "x", question: "x".repeat(501) },
      })
    ).status(),
  ).toBe(400);
});
