import { test, expect } from "@playwright/test";
test("mock learning cycle, persistence, history and card download", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:3100") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "오늘의 학습" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Wikipedia 제목 또는 URL" })
    .fill("Bird");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Bird", exact: true, level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: "able to", exact: true }).click();
  await page.screenshot({ path: "test-results/screenshots/tutor-guess.png" });
  await expect(
    page.getByRole("button", { name: "설명 확인", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("내 생각에는…").fill("할 수 있다는 뜻이다");
  await page.getByRole("button", { name: "설명 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "문맥 속 뜻" })).toBeVisible();
  await page.screenshot({
    path: "test-results/screenshots/tutor-explanation.png",
  });
  await page.reload();
  await expect(
    page.getByText("할 수 있다는 뜻이다", { exact: true }),
  ).toBeVisible();
  await page.locator("button.primary").filter({ hasText: "기억 확인" }).click();
  await expect(page.getByText("정답:", { exact: false })).toHaveCount(0);
  await page.screenshot({ path: "test-results/screenshots/tutor-quiz.png" });
  await page.getByRole("button", { name: "A ~해야 한다", exact: true }).click();
  await page.getByRole("button", { name: "답 제출하기" }).click();
  await expect(
    page.getByText("다시 확인해 볼까요?", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("내 영어 문장").fill("I am able to learn English.");
  await page.getByRole("button", { name: "내 문장 저장" }).click();
  await expect(page.getByRole("button", { name: "영작 저장됨" })).toBeVisible();
  await page.getByRole("button", { name: "새로 도전하기" }).click();
  await page
    .getByRole("button", { name: "B ~할 수 있다", exact: true })
    .click();
  await page.getByRole("button", { name: "답 제출하기" }).click();
  await expect(page.getByText("✓ 정답이에요")).toBeVisible();
  await page.getByRole("button", { name: "설명과 카드 다시 보기" }).click();
  await page.getByRole("button", { name: "카드 만들기", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.getByText("FRONT", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/screenshots/card-preview.png" });
  await page.getByRole("button", { name: "검토 완료·확정" }).click();
  await page
    .getByRole("checkbox", { name: "be able to 내보내기 선택", exact: true })
    .last()
    .check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /TSV 내보내기/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.tsv$/);
  await page.getByRole("link", { name: "학습 기록", exact: true }).click();
  await page.getByRole("button", { name: "확인 필요", exact: true }).click();
  await expect(page.getByText("able to", { exact: true }).last()).toBeVisible();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("responsive layout and visual evidence", async ({ page }) => {
  test.setTimeout(120000);
  const viewports = [
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 900, height: 900 },
    { width: 901, height: 900 },
    { width: 650, height: 900 },
    { width: 651, height: 900 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "오늘의 학습" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/screenshots/home-${viewport.width}.png`,
      fullPage: true,
    });
    await page.goto("/learn/demo-himalayas");
    if (viewport.width <= 1100)
      await page
        .getByRole("button", { name: "원문 읽기", exact: true })
        .click();
    await expect(
      page.getByRole("heading", { name: "Himalayas", exact: true, level: 1 }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `test-results/screenshots/reading-${viewport.width}.png`,
      fullPage: true,
    });
    if (viewport.width <= 1100) {
      await page.getByRole("button", { name: "AI Tutor", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "어떤 문장이 궁금한가요?" }),
      ).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const url of ["/history", "/cards"]) {
    await page.goto(url);
    await expect(page.locator(".page")).toBeVisible();
    await page.screenshot({
      path: `test-results/screenshots/${url.slice(1)}-1440.png`,
      fullPage: true,
    });
  }
});

test("mobile paragraph workflow, invalid input and dialog keyboard behavior", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Wikipedia 제목 또는 URL" })
    .fill("https://example.org/wiki/Bird");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Simple English Wikipedia의" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Wikipedia 제목 또는 URL" })
    .fill("Ocean");
  await page.getByRole("button", { name: "글 불러오기", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ocean", exact: true, level: 1 }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "이 문단에서 질문", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("내 생각에는…")).toBeVisible();
  await page.getByLabel("내 생각에는…").fill("많은 생물이 사는 곳이다");
  await page.getByRole("button", { name: "설명 확인", exact: true }).click();
  await expect(page.getByRole("heading", { name: "문맥 속 뜻" })).toBeVisible();
  await page.screenshot({
    path: "test-results/screenshots/tutor-mobile-390.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "원문으로", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Our blue planet", exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "AI Tutor", exact: true }).click();
  await expect(
    page.getByText("많은 생물이 사는 곳이다", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "카드 만들기", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let index = 0; index < 12; index++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => !!document.activeElement?.closest("dialog")),
    ).toBe(true);
  }
  await page.getByLabel("앞면", { exact: true }).fill("수정한 앞면");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "수정한 내용을 버릴까요?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "계속 편집" }).click();
  await expect(page.getByLabel("앞면", { exact: true })).toHaveValue(
    "수정한 앞면",
  );
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
