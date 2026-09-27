import type { BillingInterval, PlanKey, Prisma } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { badRequest, notFound } from "../errors";
import { audit } from "../audit";
import { logger } from "../logger";
import type { WorkspaceContext } from "../tenant";
import { getPlan, isUpgrade, PLANS } from "@/config/plans";
import { billingProvider, priceFor, type BillingEvent } from "./providers";
import { currentPeriod, getUsage } from "./usage";
import { notify } from "../services/notifications";

function addInterval(date: Date, interval: BillingInterval) {
  const d = new Date(date);
  if (interval === "YEARLY") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

async function nextInvoiceNumber() {
  const year = new Date().getUTCFullYear();
  const count = await db.invoice.count({ where: { number: { startsWith: `IOS-${year}-` } } });
  return `IOS-${year}-${String(count + 1).padStart(5, "0")}`;
}

export async function issueInvoice(workspaceId: string, input: { amountCents: number; description: string; periodStart: Date; periodEnd: Date; status?: "OPEN" | "PAID"; provider?: string; providerInvoiceId?: string; hostedUrl?: string; currency?: string }) {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  return db.invoice.create({
    data: {
      workspaceId,
      subscriptionId: sub?.id,
      number: await nextInvoiceNumber(),
      amountCents: input.amountCents,
      currency: input.currency ?? "USD",
      status: input.status ?? "OPEN",
      description: input.description,
      lineItems: [{ description: input.description, amountCents: input.amountCents, quantity: 1 }] as Prisma.InputJsonValue,
      provider: input.provider ?? "manual",
      providerInvoiceId: input.providerInvoiceId,
      hostedUrl: input.hostedUrl,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      paidAt: input.status === "PAID" ? new Date() : null,
    },
  });
}

export async function billingOverview(workspaceId: string) {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const plan = getPlan(sub?.plan ?? "FREE");
  const period = currentPeriod();
  const [aiCredits, emails, contacts, seats, workers, campaigns, social, automations, invoices] = await Promise.all([
    getUsage(workspaceId, "AI_CREDITS", period),
    getUsage(workspaceId, "EMAILS_SENT", period),
    db.lead.count({ where: { workspaceId, deletedAt: null } }),
    db.workspaceMember.count({ where: { workspaceId } }),
    db.aIWorker.count({ where: { workspaceId, isActive: true } }),
    db.campaign.count({ where: { workspaceId, deletedAt: null, status: { not: "ARCHIVED" } } }),
    db.socialAccount.count({ where: { workspaceId } }),
    db.workflow.count({ where: { workspaceId, isEnabled: true } }),
    db.invoice.findMany({ where: { workspaceId }, orderBy: { issuedAt: "desc" }, take: 24 }),
  ]);
  const provider = billingProvider(sub?.provider);
  return {
    subscription: sub,
    plan,
    provider: { id: provider.id, label: provider.label, hasPortal: provider.id === "stripe" && !!sub?.providerCustomerId },
    usage: [
      { key: "aiCredits", label: "AI credits this month", used: aiCredits, limit: plan.limits.aiCredits },
      { key: "emailsPerMonth", label: "Emails sent this month", used: emails, limit: plan.limits.emailsPerMonth },
      { key: "contacts", label: "Contacts", used: contacts, limit: plan.limits.contacts },
      { key: "seats", label: "Team seats", used: seats, limit: plan.limits.seats },
      { key: "activeWorkers", label: "Active AI workers", used: workers, limit: plan.limits.activeWorkers },
      { key: "campaigns", label: "Campaigns", used: campaigns, limit: plan.limits.campaigns },
      { key: "socialAccounts", label: "Social accounts", used: social, limit: plan.limits.socialAccounts },
      { key: "automations", label: "Active automations", used: automations, limit: plan.limits.automations },
    ],
    invoices,
    plans: PLANS,
  };
}

/** Upgrade (checkout) or schedule a downgrade at period end. */
export async function changePlan(ctx: WorkspaceContext, plan: PlanKey, interval: BillingInterval) {
  if (plan === "ENTERPRISE") throw badRequest("Enterprise plans are set up by our sales team. Contact sales@infinityuniquers.com.");
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!sub) throw notFound("Subscription");
  if (sub.plan === plan && sub.interval === interval && !sub.cancelAtPeriodEnd) throw badRequest(`You're already on the ${getPlan(plan).name} plan`);

  // Downgrades take effect at the end of the paid period.
  if (!isUpgrade(sub.plan, plan) && sub.plan !== "FREE") {
    await db.subscription.update({ where: { id: sub.id }, data: { pendingPlan: plan, cancelAtPeriodEnd: plan === "FREE" } });
    if (plan === "FREE" && sub.providerSubscriptionId) await billingProvider(sub.provider).cancel(sub.providerSubscriptionId);
    await audit({ action: "billing.downgrade_scheduled", workspaceId: ctx.workspace.id, actorId: ctx.user.id, metadata: { from: sub.plan, to: plan } });
    return { type: "scheduled" as const, effectiveAt: sub.currentPeriodEnd };
  }

  const provider = billingProvider();
  const appUrl = env().APP_URL;
  const result = await provider.checkout({
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    plan,
    interval,
    email: ctx.user.email,
    customerId: sub.providerCustomerId,
    successUrl: `${appUrl}/app/billing?checkout=success`,
    cancelUrl: `${appUrl}/app/billing?checkout=cancelled`,
  });
  if (result.type === "redirect") return { type: "redirect" as const, url: result.url };

  // Manual/invoice billing: apply immediately and issue an invoice for the period.
  const now = new Date();
  const periodEnd = addInterval(now, interval);
  await db.subscription.update({
    where: { id: sub.id },
    data: { plan, interval, status: "ACTIVE", provider: "manual", currentPeriodStart: now, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: false, pendingPlan: null },
  });
  const amount = priceFor(plan, interval);
  if (amount > 0) await issueInvoice(ctx.workspace.id, { amountCents: amount, description: `${getPlan(plan).name} plan (${interval.toLowerCase()})`, periodStart: now, periodEnd });
  await audit({ action: "billing.plan_changed", workspaceId: ctx.workspace.id, actorId: ctx.user.id, metadata: { from: sub.plan, to: plan, interval } });
  await notify({ workspaceId: ctx.workspace.id, type: "payment.event", title: `Plan changed to ${getPlan(plan).name}`, body: amount > 0 ? "An invoice has been issued for the new billing period." : undefined, link: "/app/billing", permission: "billing:view" });
  return { type: "applied" as const };
}

export async function cancelPendingChange(ctx: WorkspaceContext) {
  await db.subscription.update({ where: { workspaceId: ctx.workspace.id }, data: { pendingPlan: null, cancelAtPeriodEnd: false } });
  await audit({ action: "billing.pending_change_cancelled", workspaceId: ctx.workspace.id, actorId: ctx.user.id });
}

export async function portalUrl(ctx: WorkspaceContext) {
  const sub = await db.subscription.findUnique({ where: { workspaceId: ctx.workspace.id } });
  if (!sub?.providerCustomerId) return null;
  return billingProvider(sub.provider).portal(sub.providerCustomerId, `${env().APP_URL}/app/billing`);
}

export async function handleBillingWebhook(providerId: string, raw: string, headers: Headers) {
  const provider = billingProvider(providerId);
  const event = await provider.parseWebhook(raw, headers);
  await applyBillingEvent(provider.id, event);
  return event.type;
}

export async function applyBillingEvent(providerId: string, event: BillingEvent) {
  const bySubId = async (id?: string) => (id ? db.subscription.findUnique({ where: { providerSubscriptionId: id } }) : null);
  switch (event.type) {
    case "subscription.activated": {
      const now = new Date();
      await db.subscription.update({
        where: { workspaceId: event.workspaceId },
        data: { plan: event.plan, interval: event.interval, status: "ACTIVE", provider: providerId, providerCustomerId: event.providerCustomerId || undefined, providerSubscriptionId: event.providerSubscriptionId || undefined, currentPeriodStart: event.periodStart ?? now, currentPeriodEnd: event.periodEnd ?? addInterval(now, event.interval), cancelAtPeriodEnd: false, pendingPlan: null },
      });
      await audit({ action: "billing.subscription_activated", workspaceId: event.workspaceId, metadata: { plan: event.plan, provider: providerId } });
      await notify({ workspaceId: event.workspaceId, type: "payment.event", title: `Welcome to ${getPlan(event.plan).name}!`, body: "Your subscription is active.", link: "/app/billing", permission: "billing:view" });
      return;
    }
    case "subscription.updated": {
      const sub = await bySubId(event.providerSubscriptionId);
      if (!sub) return;
      await db.subscription.update({ where: { id: sub.id }, data: { status: event.status, ...(event.cancelAtPeriodEnd !== undefined ? { cancelAtPeriodEnd: event.cancelAtPeriodEnd } : {}), ...(event.periodEnd ? { currentPeriodEnd: event.periodEnd } : {}) } });
      if (event.status === "PAST_DUE") await notify({ workspaceId: sub.workspaceId, type: "payment.event", title: "Payment past due", body: "Update your payment method to avoid losing access to paid features.", link: "/app/billing", permission: "billing:manage" });
      return;
    }
    case "subscription.canceled": {
      const sub = await bySubId(event.providerSubscriptionId);
      if (!sub) return;
      await db.subscription.update({ where: { id: sub.id }, data: { plan: "FREE", status: "ACTIVE", providerSubscriptionId: null, cancelAtPeriodEnd: false, pendingPlan: null } });
      await audit({ action: "billing.subscription_canceled", workspaceId: sub.workspaceId });
      await notify({ workspaceId: sub.workspaceId, type: "payment.event", title: "Subscription ended", body: "Your workspace is now on the Free plan.", link: "/app/billing", permission: "billing:view" });
      return;
    }
    case "invoice.paid": {
      const sub = await bySubId(event.providerSubscriptionId);
      const workspaceId = sub?.workspaceId ?? event.workspaceId;
      if (!workspaceId) return;
      const exists = await db.invoice.findFirst({ where: { providerInvoiceId: event.providerInvoiceId } });
      if (exists) return; // idempotent webhook replay
      await issueInvoice(workspaceId, { amountCents: event.amountCents, currency: event.currency, description: `Subscription payment`, periodStart: event.periodStart, periodEnd: event.periodEnd, status: "PAID", provider: providerId, providerInvoiceId: event.providerInvoiceId, hostedUrl: event.hostedUrl });
      return;
    }
    case "payment.failed": {
      const sub = await bySubId(event.providerSubscriptionId);
      const workspaceId = sub?.workspaceId ?? event.workspaceId;
      if (!workspaceId) return;
      if (sub) await db.subscription.update({ where: { id: sub.id }, data: { status: "PAST_DUE" } });
      await notify({ workspaceId, type: "payment.event", title: "Payment failed", body: event.message, link: "/app/billing", permission: "billing:manage" });
      return;
    }
    case "ignored":
      return;
  }
}

/** Scheduler: roll manual subscriptions into the next period and apply scheduled downgrades. */
export async function processBillingPeriods() {
  const due = await db.subscription.findMany({ where: { currentPeriodEnd: { lte: new Date() }, provider: "manual" } });
  for (const sub of due) {
    try {
      const plan = sub.pendingPlan ?? sub.plan;
      const start = sub.currentPeriodEnd;
      const end = addInterval(start, sub.interval);
      await db.subscription.update({ where: { id: sub.id }, data: { plan, currentPeriodStart: start, currentPeriodEnd: end, pendingPlan: null, cancelAtPeriodEnd: false } });
      const amount = plan === "FREE" || plan === "ENTERPRISE" ? 0 : priceFor(plan, sub.interval);
      if (amount > 0) await issueInvoice(sub.workspaceId, { amountCents: amount, description: `${getPlan(plan).name} plan renewal`, periodStart: start, periodEnd: end });
    } catch (err) {
      logger.error("Billing period rollover failed", { err, subscriptionId: sub.id });
    }
  }
  return due.length;
}
