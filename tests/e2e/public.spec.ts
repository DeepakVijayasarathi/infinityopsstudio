import { expect, test } from "@playwright/test";

test("marketing site navigation and blog", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/InfinityOps Studio/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI marketing");

  await page.getByRole("banner").getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/\/pricing/);
  await expect(page.getByText("Growth").first()).toBeVisible();

  await page.goto("/blog");
  const first = page.locator("main a[href^='/blog/']").first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(new RegExp(href!));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("protected pages redirect to login", async ({ page }) => {
  await page.goto("/app/campaigns");
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Fcampaigns|\/login\?next=\/app\/campaigns/);
});

test("health endpoints respond", async ({ request }) => {
  expect((await request.get("/api/health")).ok()).toBe(true);
  const ready = await request.get("/api/ready");
  expect(ready.status()).toBeLessThan(600);
});
