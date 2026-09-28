import { expect, test } from "@playwright/test";

// Needs the seeded platform admin (npm run db:seed).
test("admins can connect a Claude plan from the browser; bad tokens are refused", async ({ page, request }) => {
  await page.goto("/login");
  await page.locator("#email").fill("admin@infinityops.studio");
  await page.locator("#password").fill(process.env.SEED_ADMIN_PASSWORD ?? "Admin12345!");
  await page.getByRole("button", { name: /Sign in/ }).click();
  await page.waitForURL(/\/(app|admin)/);

  await page.goto("/admin/settings");
  await expect(page.getByText("Claude Pro / Max plan")).toBeVisible();
  await expect(page.getByText("Claude Code in container")).toBeVisible();

  await page.getByLabel("Claude token").fill("definitely-not-a-claude-token");
  await page.getByRole("button", { name: /Connect & test/ }).click();
  await expect(page.getByText(/doesn't look like a Claude token/)).toBeVisible();

  // Signed-out callers can't reach the endpoint.
  expect((await request.get("/api/v1/admin/claude", { headers: { cookie: "" } })).status()).toBe(401);
});
