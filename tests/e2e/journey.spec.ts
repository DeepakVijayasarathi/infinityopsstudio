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

test("Copilot answers questions and drafts posts on approval", async () => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Open Copilot" }).click();
  await page.getByRole("button", { name: "What needs my approval?" }).click();
  await expect(page.getByText(/waiting|Nothing is waiting/).first()).toBeVisible();
  await page.getByLabel("Message Copilot").fill("Draft 2 LinkedIn posts about our autumn menu");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Approve" }).last().click();
  await expect(page.getByText("Drafted 2 posts")).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");
});

test("AI campaign autopilot builds a full draft campaign", async () => {
  await page.goto("/app/campaigns");
  await page.getByRole("button", { name: "AI campaign" }).click();
  await page.getByLabel("Campaign goal").fill("Get 80 pre-orders for our autumn menu in 2 weeks");
  await page.getByRole("button", { name: "Build campaign" }).click();
  await expect(page.getByRole("link", { name: "Open campaign" })).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/Everything is a draft for your review/)).toBeVisible();
  await page.getByRole("link", { name: "Open campaign" }).click();
  await page.waitForURL(/\/app\/campaigns\/[a-z0-9]+$/);
});

test("templates and guided setup", async () => {
  await page.goto("/app/templates?tab=emails");
  await page.getByRole("button", { name: "Add to my templates" }).first().click();
  await page.waitForURL(/\/app\/email/);
  await page.goto("/app/setup");
  await page.getByLabel("Industry").fill("Coffee roasting");
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByText("Launch your first campaign")).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: /Add 1 automation/ }).click();
  await expect(page.getByText("You're all set")).toBeVisible();
});

test("AI landing page captures a lead and website chat reaches the inbox", async () => {
  await page.goto("/app/pages");
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByLabel("What are you offering?").fill("Free coffee tasting for office teams");
  await page.getByRole("button", { name: "Generate page" }).click();
  await page.waitForURL(/\/app\/pages\/[a-z0-9]+$/);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  const url = await page.getByLabel("Public URL").inputValue();

  const visitor = await page.context().browser()!.newPage();
  await visitor.goto(url);
  await expect(visitor.getByRole("heading", { level: 1 })).toContainText("coffee tasting");
  await visitor.getByLabel("Your name").fill("Sam Visitor");
  await visitor.getByLabel("Work email").fill(`sam.${stamp}@office.example`);
  await visitor.getByRole("button", { name: /Get started|Start free|Book a demo/ }).last().click();
  await expect(visitor.getByRole("status")).toBeVisible();

  await visitor.getByRole("button", { name: "Chat with us" }).click();
  await visitor.getByLabel("Message").fill("Do you deliver on Saturdays?");
  await visitor.getByLabel("Message").press("Enter");
  await expect(visitor.getByText("Do you deliver on Saturdays?")).toBeVisible();
  await visitor.close();

  await page.goto("/app/leads");
  await expect(page.getByText("Sam Visitor").first()).toBeVisible();
  await page.goto("/app/inbox");
  await page.getByRole("button", { name: /Sam Visitor/ }).click();
  await expect(page.getByText("Do you deliver on Saturdays?")).toBeVisible();
  await page.getByLabel("Reply", { exact: true }).fill("Yes, every Saturday until noon.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Yes, every Saturday until noon.")).toBeVisible();
});

test("AI Manager writes a brief and runs an approved action", async () => {
  await page.goto("/app/agent");
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page.getByText("Good morning", { exact: false })).toBeVisible({ timeout: 30_000 });
  const approve = page.getByRole("button", { name: "Approve" }).first();
  await approve.click();
  await expect(page.getByRole("heading", { name: "Recently handled" })).toBeVisible({ timeout: 60_000 });
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
