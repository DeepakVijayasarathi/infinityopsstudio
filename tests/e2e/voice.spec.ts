import { expect, test } from "@playwright/test";

// Headless Chromium has no speech engine, so a scripted microphone and speaker stand in:
// each recognition session "hears" the next queued phrase, and speech finishes instantly.
const FAKE_SPEECH = `
  window.__heard = [];
  window.__spoken = [];
  class FakeRecognition {
    start() {
      setTimeout(() => {
        const text = window.__heard.shift();
        if (text && this.onresult) this.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] });
        if (this.onend) this.onend();
      }, 300);
    }
    stop() {}
    abort() {}
  }
  window.SpeechRecognition = FakeRecognition;
  window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 50); };
  window.speechSynthesis.cancel = () => {};
`;

test("voice mode: ask, hear the answer, approve by saying yes", async ({ page }) => {
  await page.addInitScript(FAKE_SPEECH);
  const stamp = Date.now();
  await page.goto("/signup");
  await page.locator("#name").fill("Vani Voice");
  await page.locator("#email").fill(`vani.${stamp}@example.com`);
  await page.locator("#workspaceName").fill(`Voice Co ${stamp}`);
  await page.locator("#password").fill("Speaking2026");
  await page.getByRole("checkbox", { name: "Accept terms" }).click();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/app(\?|$)/);
  await page.keyboard.press("Escape");

  await page.evaluate(() => (window as unknown as { __heard: string[] }).__heard.push("Draft 2 LinkedIn posts about our summer offer", "yes"));
  await page.getByRole("button", { name: "Talk to Copilot (voice)" }).click();
  const dialog = page.getByRole("dialog", { name: "Voice assistant" });
  await expect(dialog).toBeVisible();
  // After "yes" the drafts are created and the result is read out.
  await expect.poll(async () => (await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).join(" | "), { timeout: 60_000 }).toMatch(/Shall I go ahead\?.*\|.*(Drafted|draft)/i);
  await expect(dialog.getByRole("link", { name: /Open:/ })).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // The spoken exchange is part of the normal Copilot conversation.
  await page.getByRole("button", { name: "Open Copilot" }).click();
  await expect(page.getByText("Draft 2 LinkedIn posts about our summer offer")).toBeVisible();
});
