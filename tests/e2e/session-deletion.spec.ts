import { test, expect, type Page } from "@playwright/test";
import type { AppState } from "../../src/domain/types";
import { emptyCandidateFields } from "../../src/domain/anki";
const origin = "http://127.0.0.1:3108";
async function snapshot(
  page: Page,
): Promise<{ state: AppState; revision: string }> {
  return (await page.request.get("/api/state")).json();
}
async function act(page: Page, data: object) {
  const { revision } = await snapshot(page);
  const response = await page.request.post("/api/state", {
    headers: { Origin: origin, "If-Match": revision },
    data,
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
test.beforeEach(async ({ page }) => {
  // Only the isolated local deployment-test server; never Preview/user data.
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { password: "test password 123456" },
      })
    ).ok(),
  ).toBe(true);
});

for (const sessionType of ["READING", "LISTENING"] as const) {
  test(`${sessionType}: History Delete → Cancel/Confirm → other tab, Home, Review and preserved Anki`, async ({
    page,
  }) => {
    const created = await act(
      page,
      sessionType === "READING"
        ? { type: "start", articleId: "bird" }
        : {
            type: "startListening",
            sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
            userProvidedTitle: "Delete browser test",
            level: "2",
          },
    );
    const id: string = created.id;
    const route =
      sessionType === "READING" ? `/learn/${id}` : `/listening/${id}`;
    const expression = `keep ${sessionType.toLowerCase()}`;
    const candidate = await act(page, {
      type: "createCandidate",
      requestId: crypto.randomUUID(),
      sessionId: id,
      fields: { ...emptyCandidateFields(), expression, meaning: "보존" },
      allowDuplicate: true,
    });
    await page.goto("/history");
    const row = page
      .locator(".history-group")
      .filter({ has: page.locator(`a[href="${route}"]`) });
    await expect(row).toBeVisible();
    const before = await snapshot(page);
    await row.getByRole("button", { name: /학습 기록 삭제/ }).click();
    const dialog = page.getByRole("dialog", {
      name: "학습 기록을 삭제할까요?",
    });
    await expect(dialog).toContainText(
      sessionType === "READING" ? "Bird" : "Delete browser test",
    );
    await expect(dialog).toContainText("Anki 카드·후보와 내보내기 이력은 보존");
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    expect((await snapshot(page)).revision).toBe(before.revision);
    const other = await page.context().newPage();
    await other.goto("/history");
    await expect(
      other.locator(`.history-group a[href="${route}"]`),
    ).toBeVisible();
    await row.getByRole("button", { name: /학습 기록 삭제/ }).click();
    await dialog
      .getByRole("button", { name: "삭제 확인", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    await expect(row).toHaveCount(0);
    await expect(
      page.getByRole("status").filter({ hasText: "학습 기록을 삭제했어요" }),
    ).toContainText("학습 기록을 삭제했어요");
    await other.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(other.locator(`a[href="${route}"]`)).toHaveCount(0);
    await other.close();
    await page.reload();
    await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    await page.goto("/review");
    await expect(
      page.getByRole("heading", { name: "Today's Review", exact: true }),
    ).toBeVisible();
    await expect(page.locator(`a[href="${route}"]`)).toHaveCount(0);
    const fresh = await snapshot(page);
    expect(fresh.state.learningSessions.some((s) => s.id === id)).toBe(false);
    expect(
      fresh.state.ankiCandidates.find((c) => c.id === candidate.id)
        ?.sourceSessionId,
    ).toBeNull();
    await page.goto(`/cards?candidate=${candidate.id}`);
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByLabel("Expression", { exact: true })).toHaveValue(
      expression,
    );
  });
}

test("deletion API respects authentication, CSRF, revision and missing/type validation", async ({
  page,
  playwright,
}) => {
  const id = (await act(page, { type: "start", articleId: "bird" })).id;
  const action = {
    type: "deleteLearningSession",
    sessionId: id,
    sessionType: "READING",
  };
  const anonymous = await playwright.request.newContext({ baseURL: origin });
  try {
    expect(
      (await anonymous.post("/api/state", { data: action })).status(),
    ).toBe(401);
  } finally {
    await anonymous.dispose();
  }
  const old = await snapshot(page);
  expect(
    (
      await page.request.post("/api/state", {
        headers: { Origin: origin },
        data: action,
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.post("/api/state", {
        headers: {
          Origin: "https://invalid.example",
          "If-Match": old.revision,
        },
        data: action,
      })
    ).status(),
  ).toBe(403);
  for (const sessionType of ["LISTENING", "INVALID"]) {
    expect(
      (
        await page.request.post("/api/state", {
          headers: { Origin: origin, "If-Match": old.revision },
          data: { ...action, sessionType },
        })
      ).status(),
    ).toBe(400);
  }
  expect((await snapshot(page)).revision).toBe(old.revision);
  await act(page, {
    type: "sessionNotes",
    sessionId: id,
    notes: "Another device saved this",
  });
  expect(
    (
      await page.request.post("/api/state", {
        headers: { Origin: origin, "If-Match": old.revision },
        data: action,
      })
    ).status(),
  ).toBe(409);
  expect(
    (await snapshot(page)).state.learningSessions.find((s) => s.id === id)
      ?.notes,
  ).toBe("Another device saved this");
  await act(page, action);
  const fresh = await snapshot(page);
  for (const sessionId of [id, "missing"]) {
    expect(
      (
        await page.request.post("/api/state", {
          headers: { Origin: origin, "If-Match": fresh.revision },
          data: { ...action, sessionId },
        })
      ).status(),
    ).toBe(400);
  }
  expect((await snapshot(page)).revision).toBe(fresh.revision);
});
