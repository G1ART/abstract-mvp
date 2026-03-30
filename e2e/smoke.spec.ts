import { test, expect } from "@playwright/test";

/**
 * Minimal smoke: no auth secrets in repo.
 * Run locally: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 npx playwright test`
 * Or rely on webServer from playwright.config (npm run test:e2e).
 */
test.describe("public shell", () => {
  test("home or feed loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator("body")).toBeVisible();
  });
});
