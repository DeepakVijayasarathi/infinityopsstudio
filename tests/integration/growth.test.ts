import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { env } from "@/server/env";
import { captureLead, chat, chatMessages, getOrCreateWidget, trackEvent, updateWidget, websiteStats } from "@/server/services/website";
import { emailInbound, getConversation, linkLead, listConversations, reply, suggestReply, updateConversation, whatsappInbound, whatsappVerify } from "@/server/services/inbox";
import { createPage, getPage, publicPage, regenerateSection, setPublished, updatePage } from "@/server/services/landing-pages";
import { agentOverview, decide, runAgent, runDueAgents, updateConfig } from "@/server/services/agent";
import { addMember, createOwner, resetDb } from "../helpers/factory";
import { hmacHex } from "../helpers/hmac";

beforeEach(resetDb);

const meta = (ip = "203.0.113.7") => ({ ip, userAgent: "Mozilla/5.0 (Macintosh)", origin: "https://shop.example.com" });

describe("website tracking and lead capture", () => {
  it("counts unique visitors, pageviews, sources and conversions", async () => {
    const ctx = await createOwner();
    const w = await getOrCreateWidget(ctx.workspace.id);
    await trackEvent(w.publicKey, { type: "pageview", url: "https://shop.example.com/?utm_source=newsletter", referrer: null }, meta());
    await trackEvent(w.publicKey, { type: "pageview", url: "https://shop.example.com/pricing", referrer: "https://www.google.com/" }, meta());
    await trackEvent(w.publicKey, { type: "pageview", url: "https://shop.example.com/", referrer: "https://www.linkedin.com/feed" }, meta("198.51.100.9"));
    await trackEvent(w.publicKey, { type: "pageview", url: "https://shop.example.com/", referrer: null }, { ...meta(), userAgent: "Googlebot/2.1" });

    const r = await captureLead(w.publicKey, { name: "Asha Rao", email: "asha@clinic.in", company: "Smile Clinic", message: "Pricing for 3 branches?" }, meta());
    expect(r.created).toBe(true);
    const lead = await db.lead.findUniqueOrThrow({ where: { id: r.leadId } });
    expect(lead).toMatchObject({ firstName: "Asha", lastName: "Rao", source: "WEBSITE", company: "Smile Clinic" });
    // Same email again updates instead of duplicating.
    expect((await captureLead(w.publicKey, { email: "ASHA@clinic.in" }, meta())).created).toBe(false);

    const s = await websiteStats(ctx.workspace.id, 30);
    expect(s).toMatchObject({ visitors: 2, pageviews: 3, conversions: 2 });
    expect(s.sources.map((x) => x.source).sort()).toEqual(["LinkedIn", "newsletter", "search"]);
  });

  it("enforces the domain allow-list, except for the app's own hosted pages", async () => {
    const ctx = await createOwner();
    const w = await updateWidget(ctx, { allowedDomains: ["example.org"] });
    await expect(trackEvent(w.publicKey, { type: "pageview", url: "https://shop.example.com/" }, meta())).rejects.toThrow(/not allowed/);
    await expect(trackEvent(w.publicKey, { type: "pageview", url: "https://www.example.org/" }, { ...meta(), origin: "https://www.example.org" })).resolves.toEqual({ ok: true });
    await expect(trackEvent(w.publicKey, { type: "pageview", url: `${env().APP_URL}/p/x` }, { ...meta(), origin: new URL(env().APP_URL).origin })).resolves.toEqual({ ok: true });
  });

  it("answers website chat with AI and turns an email into a lead", async () => {
    const ctx = await createOwner();
    const w = await getOrCreateWidget(ctx.workspace.id);
    const first = await chat(w.publicKey, { visitorId: "v_12345678", message: "Hi! How much does it cost?" }, meta());
    expect(first.messages).toHaveLength(2);
    expect(first.messages[1]!.from).toBe("assistant");

    await chat(w.publicKey, { visitorId: "v_12345678", message: "I'm ravi@logistics.io" }, meta());
    const convo = await db.conversation.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id } });
    expect(convo.leadId).toBeTruthy();
    expect(convo.contactHandle).toBe("ravi@logistics.io");

    // Team reply shows up in the visitor's poll.
    await updateConversation(ctx, convo.id, { aiEnabled: false });
    await reply(ctx, convo.id, "Hi Ravi, Priya from sales here.");
    const polled = await chatMessages(w.publicKey, "v_12345678", "https://shop.example.com");
    expect(polled.messages.at(-1)).toMatchObject({ from: "team", body: "Hi Ravi, Priya from sales here." });

    await updateWidget(ctx, { chatEnabled: false });
    await expect(chat(w.publicKey, { visitorId: "v_12345678", message: "hello?" }, meta())).rejects.toThrow(/turned off/);
  });
});

describe("unified inbox", () => {
  it("receives inbound email, drafts a reply and links a lead", async () => {
    const ctx = await createOwner();
    const w = await getOrCreateWidget(ctx.workspace.id);
    await expect(emailInbound("wrong-token", { From: "a@b.co", TextBody: "x" })).rejects.toThrow();

    // Postmark-style payload; a retry with the same MessageID is ignored.
    const payload = { From: '"Meera Iyer" <meera@acme.in>', Subject: "Question about plans", TextBody: "Do you offer annual billing?", MessageID: "pm-1" };
    expect(await emailInbound(w.inboundEmailToken, payload)).toEqual({ received: 1 });
    expect(await emailInbound(w.inboundEmailToken, payload)).toEqual({ received: 0 });
    // SendGrid-style follow-up lands in the same conversation.
    await emailInbound(w.inboundEmailToken, { from: "Meera Iyer <meera@acme.in>", subject: "Re: Question", text: "Also, is there a discount?" });

    const list = await listConversations(ctx.workspace.id, { page: 1, pageSize: 20, order: "desc" });
    expect(list.items).toHaveLength(1);
    expect(list.unread).toBe(1);
    const c = list.items[0]!;
    expect(c).toMatchObject({ channel: "EMAIL", contactName: "Meera Iyer", contactHandle: "meera@acme.in", aiEnabled: false, unread: 2 });

    const full = await getConversation(ctx.workspace.id, c.id);
    expect(full.messages.map((m) => m.body)).toEqual(["Do you offer annual billing?", "Also, is there a discount?"]);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).unread).toBe(0);

    expect((await suggestReply(ctx, c.id)).text.length).toBeGreaterThan(10);
    const sent = await reply(ctx, c.id, "Yes — annual billing saves 20%.");
    expect(sent.failed).toBe(false);

    const { leadId } = await linkLead(ctx, c.id);
    expect((await db.lead.findUniqueOrThrow({ where: { id: leadId } })).email).toBe("meera@acme.in");
    expect((await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).leadId).toBe(leadId);
    expect(await linkLead(ctx, c.id)).toEqual({ leadId });
  });

  it("verifies and accepts signed WhatsApp webhooks", async () => {
    const ctx = await createOwner();
    const w = await getOrCreateWidget(ctx.workspace.id);
    await expect(whatsappVerify(w.publicKey, "subscribe", "tok", "123")).rejects.toThrow(); // not connected yet
    await db.integration.create({
      data: { workspaceId: ctx.workspace.id, provider: "whatsapp", category: "Messaging", config: { phoneNumberId: "111", verifyToken: "verify-me" }, credentials: encrypt(JSON.stringify({ accessToken: "t", appSecret: "app-secret" })) },
    });
    expect(await whatsappVerify(w.publicKey, "subscribe", "verify-me", "challenge-42")).toBe("challenge-42");
    await expect(whatsappVerify(w.publicKey, "subscribe", "wrong", "c")).rejects.toThrow(/Verification failed/);

    const raw = JSON.stringify({ entry: [{ changes: [{ value: { contacts: [{ wa_id: "919876543210", profile: { name: "Karthik" } }], messages: [{ id: "wamid.1", from: "919876543210", type: "text", text: { body: "Is the store open on Sunday?" } }] } }] }] });
    await expect(whatsappInbound(w.publicKey, raw, "sha256=deadbeef")).rejects.toThrow(/signature/);
    expect(await whatsappInbound(w.publicKey, raw, `sha256=${hmacHex("app-secret", raw)}`)).toEqual({ received: 1 });

    const c = await db.conversation.findFirstOrThrow({ where: { workspaceId: ctx.workspace.id } });
    expect(c).toMatchObject({ channel: "WHATSAPP", contactName: "Karthik", contactHandle: "+919876543210" });
  });

  it("keeps conversations inside their workspace", async () => {
    const a = await createOwner("Alpha");
    const b = await createOwner("Beta");
    const wa = await getOrCreateWidget(a.workspace.id);
    await chat(wa.publicKey, { visitorId: "v_abcdefgh", message: "hello" }, meta());
    const c = await db.conversation.findFirstOrThrow({ where: { workspaceId: a.workspace.id } });
    await expect(getConversation(b.workspace.id, c.id)).rejects.toThrow(/not found/i);
    await expect(reply(b, c.id, "hi")).rejects.toThrow(/not found/i);
    expect((await listConversations(b.workspace.id, { page: 1, pageSize: 20, order: "desc" })).items).toHaveLength(0);
  });
});

describe("landing pages", () => {
  it("generates, edits, publishes and tracks a page", async () => {
    const ctx = await createOwner();
    const page = await createPage(ctx, { offer: "Free 30-minute marketing audit for dental clinics", goal: "Book demo calls" });
    expect(page.status).toBe("DRAFT");
    const full = await getPage(ctx.workspace.id, page.id);
    expect(full.content.hero.headline).toContain("marketing audit");
    expect(full.content.form.fields).toContain("email");
    expect(full.content.hero.cta).toBe("Book a demo");

    // Drafts are private; members can preview.
    expect(await publicPage(page.slug)).toBeNull();
    expect(await publicPage(page.slug, [ctx.workspace.id])).not.toBeNull();

    await updatePage(ctx, page.id, { slug: "Dental Audit!", content: { ...full.content, hero: { ...full.content.hero, headline: "Fill every chair" } } });
    await setPublished(ctx, page.id, true);
    const live = await publicPage("dental-audit");
    expect(live).toMatchObject({ title: page.title, content: { hero: { headline: "Fill every chair" } } });
    expect(live!.widgetKey).toMatch(/^pk_/);

    const origin = new URL(env().APP_URL).origin;
    await trackEvent(live!.widgetKey!, { type: "pageview", url: `${origin}/p/dental-audit`, landingPageId: page.id }, { ...meta(), origin });
    await captureLead(live!.widgetKey!, { email: "dr.sen@smiles.in", name: "Dr Sen", landingPageId: page.id, page: `${origin}/p/dental-audit` }, { ...meta(), origin });
    expect(await db.landingPage.findUniqueOrThrow({ where: { id: page.id } })).toMatchObject({ views: 1, conversions: 1 });

    await regenerateSection(ctx, page.id, "faq");
    expect((await getPage(ctx.workspace.id, page.id)).content.hero.headline).toBe("Fill every chair");

    const other = await createOwner("Other");
    await expect(updatePage(other, page.id, { title: "x" })).rejects.toThrow(/not found/i);
    await expect(updatePage(ctx, (await createPage(ctx, { offer: "Second offer" })).id, { slug: "dental-audit" })).rejects.toThrow(/taken/);
  });
});

describe("AI Manager", () => {
  it("writes a brief with proposals, then runs approved ones", async () => {
    const ctx = await createOwner();
    const w = await getOrCreateWidget(ctx.workspace.id);
    await chat(w.publicKey, { visitorId: "v_zzzzzzzz", message: "Do you ship to Kochi?" }, meta());

    const run = await runAgent(ctx.workspace.id, "manual", ctx);
    expect(run.status).toBe("COMPLETED");
    expect(run.summary).toMatch(/Good morning/);

    const o = await agentOverview(ctx.workspace.id);
    const titles = o.pending.map((p) => p.title);
    expect(titles).toContain("Reply to 1 unread conversation");
    expect(titles.some((t) => /blog post/i.test(t))).toBe(true);
    expect(await db.notification.count({ where: { workspaceId: ctx.workspace.id, type: "agent.brief" } })).toBeGreaterThan(0);

    // Re-running doesn't duplicate pending suggestions.
    await runAgent(ctx.workspace.id, "manual", ctx);
    expect((await agentOverview(ctx.workspace.id)).pending).toHaveLength(o.pending.length);

    const blog = o.pending.find((p) => /blog post/i.test(p.title))!;
    const done = await decide(ctx, blog.id, "approve");
    expect(done.status).toBe("DONE");
    expect(done.resultHref).toMatch(/^\/app\/content\//);
    await expect(decide(ctx, blog.id, "approve")).rejects.toThrow(/already handled/);

    const inbox = o.pending.find((p) => p.title.startsWith("Reply to"))!;
    expect((await decide(ctx, inbox.id, "dismiss")).status).toBe("DISMISSED");

    // Viewers can't run write actions even via an approval.
    const viewer = await addMember(ctx.workspace.id, "viewer");
    const next = (await agentOverview(ctx.workspace.id)).pending.find((p) => p.status === "PENDING" && !p.title.startsWith("Install") && !p.title.startsWith("Open"));
    if (next) await expect(decide(viewer, next.id, "approve")).rejects.toThrow();
  });

  it("prepares drafts automatically and runs on schedule once a day", async () => {
    const ctx = await createOwner();
    await updateConfig(ctx, { enabled: true, runHourUtc: 0, autoDrafts: true });
    expect(await runDueAgents()).toBe(1); // queued (inline in tests)
    expect(await runDueAgents()).toBe(0); // already ran today
    const o = await agentOverview(ctx.workspace.id);
    expect(o.latest?.trigger).toBe("schedule");
    expect(o.latest?.summary).toMatch(/prepared \d draft/);
    expect(o.recent.some((p) => p.status === "DONE")).toBe(true);
    expect(await db.content.count({ where: { workspaceId: ctx.workspace.id, generatedByAI: true } })).toBeGreaterThan(0);
    // Nothing was published or sent.
    expect(await db.socialPost.count({ where: { workspaceId: ctx.workspace.id, status: { in: ["PUBLISHED", "SCHEDULED"] } } })).toBe(0);
  });
});
