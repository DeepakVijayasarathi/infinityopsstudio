import { expect, test, type Page } from "@playwright/test";

// One continuous customer journey: a new user signs up and uses each core module.
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const user = { name: "Jordan Lee", email: `jordan.${stamp}@example.com`, company: `Harbor Coffee ${stamp}`, password: "Espresso2026" };

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test("sign up creates a workspace", async () => {
  await page.goto("/signup");
  await page.locator("#name").fill(user.name);
  await page.locator("#email").fill(user.email);
  await page.locator("#workspaceName").fill(user.company);
  await page.locator("#password").fill(user.password);
  await page.getByRole("checkbox", { name: "Accept terms" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app(\?|$)/);
  await page.keyboard.press("Escape"); // dismiss the welcome guide
  await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
});

test("create a campaign", async () => {
  await page.goto("/app/campaigns");
  await page.getByRole("button", { name: "New campaign" }).first().click();
  await page.locator("#name").fill("Autumn menu launch");
  await page.getByRole("button", { name: "Create campaign" }).click();
  await page.waitForURL(/\/app\/campaigns\/[a-z0-9]+/);
  await expect(page.getByRole("heading", { name: "Autumn menu launch" })).toBeVisible();
});

test("generate and save content", async () => {
  await page.goto("/app/content/new");
  await page.locator("#f-topic").fill("Why single-origin beans taste different");
  await page.locator("form").getByRole("button", { name: /^Generate/ }).click();
  const save = page.getByRole("button", { name: "Save & edit" });
  await expect(save).toBeEnabled({ timeout: 60_000 });
  await save.click();
  await page.waitForURL(/\/app\/content\/[a-z0-9]+$/);
  await expect(page.getByText("Saved to Content Studio")).toBeVisible();
});

test("run an AI worker task", async () => {
  await page.goto("/app/workers");
  // Free workspaces start with the first two workers active; open the first one.
  await page.getByRole("link", { name: "Open workspace" }).first().click();
  await expect(page.getByText("Inactive")).toHaveCount(0);
  await page.locator("#instructions").fill("Plan a two-week launch for our autumn seasonal menu");
  await page.getByRole("button", { name: /^Assign to/ }).click();
  await expect(page.getByText(/Awaiting approval|Queued|Running/).first()).toBeVisible({ timeout: 60_000 });
});

test("create an automation", async () => {
  await page.goto("/app/automations/new");
  await page.getByLabel("Automation name").fill("Welcome new leads");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByRole("menuitem", { name: /Notify/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("New lead: {{lead.firstName}}");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/\/app\/automations\/[a-z0-9]+$/);
  await expect(page.getByLabel("Automation name")).toHaveValue("Welcome new leads");
});

test("view analytics", async () => {
  await page.goto("/app/analytics");
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();
});

test("upgrade the plan", async () => {
  await page.goto("/app/billing");
  await page.getByRole("button", { name: "Upgrade" }).first().click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("You're now on Starter")).toBeVisible();
  await expect(page.getByRole("button", { name: "Current plan" })).toBeVisible();
  await expect(page.getByText("Starter plan (monthly)")).toBeVisible(); // invoice issued
});
