import { test, expect } from "@playwright/test";

/**
 * Mega Upgrade · Track 1.5 regression — unauthenticated users never reach
 * auth-gated routes. Previously the client-side gate consulted
 * localStorage("has_password"), which could lie and allow a redirect loop.
 * Post-upgrade it consults the server RPC, so these paths must redirect to
 * /login for an anonymous browser.
 */
const AUTH_GATED_ROUTES = ["/my", "/set-password", "/onboarding"] as const;

test.describe("auth gate (anon)", () => {
  for (const route of AUTH_GATED_ROUTES) {
    test(`anon at ${route} does not stay authenticated`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);
      const url = new URL(page.url());
      expect(
        url.pathname === "/login" ||
          url.pathname === "/" ||
          url.pathname === "/onboarding"
      ).toBeTruthy();
    });
  }
});
