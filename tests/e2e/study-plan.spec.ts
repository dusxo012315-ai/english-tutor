import { test, expect, type Page } from "@playwright/test";
import { planArticle } from "../fixtures/plan-article";
import type { AppState } from "../../src/domain/types";
const origin = "http://127.0.0.1:3112";
async function snapshot(
  page: Page,
): Promise<{ state: AppState; revision: string }> {
  return (await page.request.get("/api/state")).json();
}
async function act(page: Page, data: object) {
  const { revision } = await snapshot(page);
  const r = await page.request.post("/api/state", {
    headers: { Origin: origin, "If-Match": revision },
    data,
  });
  expect(r.ok()).toBe(true);
  return r.json();
}
async function login(page: Page) {
  expect(
    (
      await page.request.post("/api/auth/login", {
        headers: { Origin: origin },
        data: { password: "test password 123456" },
      })
    ).ok(),
  ).toBe(true);
}
async function create(page: Page, name: string, type: string) {
  await page.goto("/plan");
  await page.getByRole("button", { name: "New Plan", exact: true }).click();
  await page.getByLabel("Plan name").fill(name);
  await page.getByLabel("Learning type").selectOption(type);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return page.getByRole("region", { name, exact: true });
}
test("Reading Plan UI → duplicate items → print → start/resume → completion → History deletion", async ({
  page,
  context,
}) => {
  await login(page);
  // Browser transport fixture; the same synthetic Article already exists in this isolated DB.
  await page.route("**/api/articles/resolve", (r) =>
    r.fulfill({ json: { status: "resolved", article: planArticle } }),
  );
  const name = `Reading plan ${Date.now()}`;
  const region = await create(page, name, "READING");
  for (let i = 0; i < 2; i++) {
    await region.getByRole("button", { name: "Add item" }).click();
    await page
      .getByLabel("Wikipedia title or URL")
      .fill(i ? planArticle.sourceUrl : "Himalayas");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(region.getByTestId("plan-item")).toHaveCount(i + 1);
  }
  await region.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Plan name").fill(`${name} renamed`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const renamed = page.getByRole("region", {
    name: `${name} renamed`,
    exact: true,
  });
  const initial = (await snapshot(page)).state;
  const beforeOrder = initial.studyPlanItems.filter(
    (i) =>
      i.planId ===
      initial.studyPlans.find((p) => p.name === `${name} renamed`)?.id,
  );
  await renamed
    .getByRole("button", { name: /Move .* down/ })
    .first()
    .click();
  await expect
    .poll(
      async () =>
        (await snapshot(page)).state.studyPlanItems.find(
          (i) => i.id === beforeOrder[0].id,
        )?.position,
    )
    .toBe(1);
  await page.reload();
  await expect(renamed.getByTestId("plan-item")).toHaveCount(2);
  const popup = page.waitForEvent("popup");
  await renamed
    .getByRole("link", { name: "Print / Save as PDF" })
    .first()
    .click();
  const print = await popup;
  await expect(
    print.getByRole("heading", { name: planArticle.title, exact: true }),
  ).toBeVisible();
  await expect(print.locator("footer")).toContainText("Revision: 456");
  await expect(print.locator("footer")).toContainText("CC BY-SA 4.0");
  await expect(print.locator("footer")).toContainText("Wikipedia contributors");
  await expect(print.locator("footer")).toContainText(planArticle.sourceUrl);
  await print.evaluate(() => {
    window.print = () => {
      document.body.dataset.printCalled = "yes";
    };
  });
  await print.getByRole("button", { name: "Print / Save as PDF" }).click();
  expect(await print.locator("body").getAttribute("data-print-called")).toBe(
    "yes",
  );
  await print.emulateMedia({ media: "print" });
  await expect(print.locator(".print-controls")).toBeHidden();
  await expect(print.locator(".sidebar")).toHaveCount(0);
  await print.screenshot({
    path: "artifacts/study-plan/print.png",
    fullPage: true,
  });
  await print.close();
  await renamed.getByRole("button", { name: "Start Reading" }).first().click();
  await expect(page).toHaveURL(/\/learn\//);
  const sessionId = page.url().split("/learn/")[1];
  await page.goto("/plan");
  await renamed.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${sessionId}$`));
  await act(page, { type: "finish", sessionId });
  await page.goto("/plan");
  await page.reload();
  await expect(renamed).toContainText("1 / 2 completed");
  await page.goto("/history");
  const row = page
    .locator(".history-group")
    .filter({ has: page.locator(`a[href="/learn/${sessionId}"]`) });
  await row.getByRole("button", { name: /학습 기록 삭제/ }).click();
  await page.getByRole("button", { name: "삭제 확인", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page.goto("/plan");
  await page.reload();
  await expect(
    renamed.getByRole("button", { name: "Start Reading" }),
  ).toHaveCount(2);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Next to Study" }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/plan");
  await expect(
    other.getByRole("region", { name: `${name} renamed` }),
  ).toContainText("PLANNED");
  await other.close();
});

test("Listening Plan UI → session/rounds → completion, delete confirmation and preservation; responsive layout", async ({
  page,
}) => {
  await login(page);
  const name = `Listening plan ${Date.now()}`;
  const region = await create(page, name, "LISTENING");
  await region.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Lesson title").fill("BNE personal plan");
  await page
    .getByLabel("BNE lesson HTML URL")
    .fill("https://breakingnewsenglish.com/2609/260924-test.html");
  await page
    .getByRole("combobox", { name: "Level", exact: true })
    .selectOption("2");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    region.getByRole("link", { name: "Print / Save as PDF" }),
  ).toHaveCount(0);
  for (const width of [375, 768, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      region.getByRole("button", { name: "Start Listening" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `artifacts/study-plan/plan-${width}.png`,
      fullPage: true,
    });
  }
  await region.getByRole("button", { name: "Start Listening" }).click();
  await expect(page).toHaveURL(/\/listening\//);
  const sessionId = page.url().split("/listening/")[1];
  await page.getByLabel("1차 이해도 (0~100%)").fill("40");
  await page
    .getByRole("button", { name: "Finish Round 1", exact: true })
    .click();
  await page.getByLabel("몰랐던 단어", { exact: true }).check();
  await page
    .getByRole("button", { name: "Finish Round 2", exact: true })
    .click();
  await page.getByLabel("두 번째 이해도 (0~100%)").fill("70");
  await page
    .getByRole("button", { name: "Finish Round 3", exact: true })
    .click();
  await page
    .getByLabel("What was the story about?", { exact: true })
    .fill("My own summary about the news.");
  await page.getByLabel("최종 이해도 (0~100%)").fill("80");
  await page
    .getByRole("button", { name: "Finish Listening Session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Listening Session 결과" }),
  ).toBeVisible();
  await page.goto("/plan");
  await page.reload();
  await expect(region).toContainText("COMPLETED");
  await region
    .getByRole("button", { name: "Delete Plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(region).toBeVisible();
  await region
    .getByRole("button", { name: "Delete Plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(region).toHaveCount(0);
  expect(
    (await snapshot(page)).state.learningSessions.some(
      (s) => s.id === sessionId,
    ),
  ).toBe(true);
  await page.goto("/history");
  await expect(
    page.getByRole("heading", { name: "BNE personal plan", exact: true }),
  ).toBeVisible();
});

test("Plan auth, invalid IDs, stale revision and second-device focus refresh", async ({
  page,
  browser,
}) => {
  expect((await page.request.get("/api/state")).status()).toBe(401);
  await page.goto("/plan");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto(`/print/${planArticle.id}`);
  await expect(page).toHaveURL(/\/login$/);
  await login(page);
  await page.goto("/plan");
  const old = await snapshot(page);
  const id = crypto.randomUUID();
  await act(page, {
    type: "createPlan",
    requestId: id,
    name: "Two devices",
    planType: "LISTENING",
  });
  expect(
    (
      await page.request.post("/api/state", {
        headers: { Origin: origin, "If-Match": old.revision },
        data: { type: "deletePlan", planId: id },
      })
    ).status(),
  ).toBe(409);
  const secondContext = await browser.newContext({ baseURL: origin });
  const second = await secondContext.newPage();
  await login(second);
  await second.goto("/plan");
  await expect(
    second.getByRole("region", { name: "Two devices", exact: true }),
  ).toBeVisible();
  await act(page, {
    type: "renamePlan",
    planId: id,
    name: "Updated on laptop",
  });
  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    second.getByRole("region", { name: "Updated on laptop", exact: true }),
  ).toBeVisible();
  const revision = (await snapshot(page)).revision;
  const invalid = await page.request.post("/api/state", {
    headers: { Origin: origin, "If-Match": revision },
    data: { type: "startPlanItem", itemId: "missing" },
  });
  expect(invalid.status()).toBe(400);
  expect((await snapshot(page)).revision).toBe(revision);
  await second
    .getByRole("region", { name: "Updated on laptop", exact: true })
    .getByRole("button", { name: "Rename", exact: true })
    .click();
  await second.getByLabel("Plan name").fill("Older tablet draft");
  await act(page, {
    type: "renamePlan",
    planId: id,
    name: "Newer laptop name",
  });
  await second.getByRole("button", { name: "Save", exact: true }).focus();
  const refreshed = second.waitForResponse(
    (r) => r.url().endsWith("/api/state") && r.request().method() === "GET",
  );
  await second.evaluate(() => window.dispatchEvent(new Event("focus")));
  await (await refreshed).finished();
  await second.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(
    second.getByRole("region", { name: "Updated on laptop", exact: true }),
  ).toBeVisible();
  const saved = second.waitForResponse(
    (r) => r.url().endsWith("/api/state") && r.request().method() === "POST",
  );
  await second.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).status()).toBe(409);
  expect(
    (await snapshot(page)).state.studyPlans.find((p) => p.id === id)?.name,
  ).toBe("Newer laptop name");
  await secondContext.close();
});
