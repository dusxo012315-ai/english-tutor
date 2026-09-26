import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:3108";
test("authentication gates pages/APIs, wrong password, cookie, cross-device conflict, logout", async ({
  page,
  browser,
}) => {
  for (const path of [
    "/",
    "/learn",
    "/listening",
    "/history",
    "/review",
    "/cards",
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  expect((await page.request.get("/api/state")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/state", {
        data: { type: "fontSize", value: 20 },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await page.request.post("/api/articles/resolve", {
        data: { input: "Bird" },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel("비밀번호", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("test password 123456");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await expect(page).toHaveURL(origin + "/");
  const cookie = (await page.context().cookies()).find(
    (c) => c.name === "reading_room_auth",
  )!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  const other = await browser.newContext();
  try {
    const login = await other.request.post(origin + "/api/auth/login", {
      headers: { Origin: origin },
      data: { password: "test password 123456" },
    });
    expect(login.ok()).toBe(true);
    const secondPage = await other.newPage();
    await secondPage.goto(origin + "/history");
    await expect(
      secondPage.getByRole("heading", {
        name: "학습 기록",
        exact: true,
        level: 1,
      }),
    ).toBeVisible();
    const snapshot = await (
      await other.request.get(origin + "/api/state")
    ).json();
    const create = await page.request.post("/api/state", {
      headers: { Origin: origin, "If-Match": snapshot.revision },
      data: {
        type: "startListening",
        sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
        userProvidedTitle: "Two device test",
        level: "2",
      },
    });
    expect(create.ok()).toBe(true);
    await secondPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(
      secondPage.getByText("Two device test", { exact: true }),
    ).toBeVisible();
    const stale = await other.request.post(origin + "/api/state", {
      headers: { Origin: origin, "If-Match": snapshot.revision },
      data: {
        type: "sessionNotes",
        sessionId: (await create.json()).id,
        notes: "old screen",
      },
    });
    expect(stale.status()).toBe(409);
    const fresh = await (await other.request.get(origin + "/api/state")).json();
    expect(
      fresh.state.learningSessions.some(
        (s: { userProvidedTitle: string }) =>
          s.userProvidedTitle === "Two device test",
      ),
    ).toBe(true);
    const missing = await other.request.post(origin + "/api/state", {
      headers: { Origin: origin },
      data: { type: "sessionNotes", sessionId: "none", notes: "x" },
    });
    expect(missing.status()).toBe(409);
    const csrf = await other.request.post(origin + "/api/auth/logout", {
      headers: { Origin: "https://evil.example" },
    });
    expect(csrf.status()).toBe(403);
  } finally {
    await other.close();
  }
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/state")).status()).toBe(401);
});

test("authenticated tablet pages at 768, 800 and 1024 pixels", async ({
  page,
}) => {
  const login = await page.request.post("/api/auth/login", {
    headers: { Origin: origin },
    data: { password: "test password 123456" },
  });
  expect(login.ok()).toBe(true);
  async function create(data: object) {
    const { revision } = await (await page.request.get("/api/state")).json();
    const response = await page.request.post("/api/state", {
      headers: { Origin: origin, "If-Match": revision },
      data,
    });
    expect(response.ok()).toBe(true);
    return response.json();
  }
  const reading = await create({ type: "start", articleId: "bird" });
  const listening = await create({
    type: "startListening",
    sourceUrl: "https://breakingnewsenglish.com/2609/260924-test.html",
    userProvidedTitle: "Tablet layout",
    level: "2",
  });
  for (const width of [768, 800, 1024]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, heading, name] of [
      [`/learn/${reading.id}`, "Bird", "reading"],
      [`/listening/${listening.id}`, "Tablet layout", "listening"],
      ["/review", "Today's Review", "review"],
      ["/cards", "Anki", "anki"],
      ["/history", "학습 기록", "history"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, exact: true, level: 1 })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: `artifacts/deployment/${name}-${width}.png`, fullPage: true });
    }
    await page.screenshot({
      path: `artifacts/deployment/tablet-${width}.png`,
      fullPage: true,
    });
  }
});
