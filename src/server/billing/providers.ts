import type { BillingInterval, PlanKey } from "@prisma/client";
import { createHmac } from "node:crypto";
import { env } from "../env";
import { AppError, badRequest } from "../errors";
import { safeEqual } from "../crypto";
import { getPlan } from "@/config/plans";

export type CheckoutInput = {
  workspaceId: string;
  workspaceName: string;
  plan: PlanKey;
  interval: BillingInterval;
  email: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutResult = { type: "redirect"; url: string } | { type: "applied" };

/** Provider-neutral billing events produced by webhook parsing. */
export type BillingEvent =
  | { type: "subscription.activated"; workspaceId: string; plan: PlanKey; interval: BillingInterval; providerCustomerId?: string; providerSubscriptionId?: string; periodStart?: Date; periodEnd?: Date }
  | { type: "subscription.updated"; providerSubscriptionId: string; status: "ACTIVE" | "PAST_DUE" | "CANCELED"; cancelAtPeriodEnd?: boolean; periodEnd?: Date }
  | { type: "subscription.canceled"; providerSubscriptionId: string }
  | { type: "invoice.paid"; providerSubscriptionId?: string; workspaceId?: string; providerInvoiceId: string; amountCents: number; currency: string; hostedUrl?: string; periodStart: Date; periodEnd: Date }
  | { type: "payment.failed"; providerSubscriptionId?: string; workspaceId?: string; message: string }
  | { type: "ignored" };

export interface BillingProvider {
  id: "manual" | "stripe" | "razorpay";
  label: string;
  isConfigured(): boolean;
  checkout(input: CheckoutInput): Promise<CheckoutResult>;
  portal(customerId: string, returnUrl: string): Promise<string | null>;
  cancel(providerSubscriptionId: string): Promise<void>;
  parseWebhook(rawBody: string, headers: Headers): Promise<BillingEvent>;
}

export function priceFor(plan: PlanKey, interval: BillingInterval): number {
  const p = getPlan(plan);
  if (p.monthlyPriceCents === null) throw badRequest("Enterprise pricing is custom — contact sales");
  return interval === "YEARLY" ? (p.yearlyPriceCents ?? p.monthlyPriceCents) * 12 : p.monthlyPriceCents;
}

// ─── Manual (invoice billing): plan changes apply immediately, invoices are settled offline ───
export const manualProvider: BillingProvider = {
  id: "manual",
  label: "Invoice billing",
  isConfigured: () => true,
  async checkout() {
    return { type: "applied" };
  },
  async portal() {
    return null;
  },
  async cancel() {},
  async parseWebhook() {
    return { type: "ignored" };
  },
};

// ─── Stripe (REST API, no SDK dependency) ───
async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${env().STRIPE_SECRET_KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new AppError("SERVICE_UNAVAILABLE", `Stripe: ${(json.error as { message?: string })?.message ?? res.status}`);
  return json;
}

export function verifyStripeSignature(raw: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  if (!t || Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return header
    .split(",")
    .filter((p) => p.startsWith("v1="))
    .some((p) => safeEqual(p.slice(3), expected));
}

const epoch = (v: unknown) => (typeof v === "number" ? new Date(v * 1000) : undefined);

export const stripeProvider: BillingProvider = {
  id: "stripe",
  label: "Stripe",
  isConfigured: () => !!env().STRIPE_SECRET_KEY,
  async checkout(i) {
    const plan = getPlan(i.plan);
    const session = await stripe("checkout/sessions", {
      mode: "subscription",
      success_url: i.successUrl,
      cancel_url: i.cancelUrl,
      ...(i.customerId ? { customer: i.customerId } : { customer_email: i.email }),
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(priceFor(i.plan, i.interval)),
      "line_items[0][price_data][recurring][interval]": i.interval === "YEARLY" ? "year" : "month",
      "line_items[0][price_data][product_data][name]": `Infinity Ops Studio ${plan.name}`,
      "metadata[workspaceId]": i.workspaceId,
      "metadata[plan]": i.plan,
      "metadata[interval]": i.interval,
      "subscription_data[metadata][workspaceId]": i.workspaceId,
      "subscription_data[metadata][plan]": i.plan,
    });
    return { type: "redirect", url: String(session.url) };
  },
  async portal(customerId, returnUrl) {
    const s = await stripe("billing_portal/sessions", { customer: customerId, return_url: returnUrl });
    return String(s.url);
  },
  async cancel(subId) {
    await stripe(`subscriptions/${subId}`, { cancel_at_period_end: "true" });
  },
  async parseWebhook(raw, headers) {
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret || !verifyStripeSignature(raw, headers.get("stripe-signature"), secret)) throw new AppError("UNAUTHENTICATED", "Invalid Stripe signature");
    const event = JSON.parse(raw) as { type: string; data: { object: Record<string, unknown> } };
    const o = event.data.object;
    const meta = (o.metadata ?? {}) as Record<string, string>;
    switch (event.type) {
      case "checkout.session.completed":
        return { type: "subscription.activated", workspaceId: meta.workspaceId!, plan: meta.plan as PlanKey, interval: (meta.interval as BillingInterval) ?? "MONTHLY", providerCustomerId: String(o.customer ?? ""), providerSubscriptionId: String(o.subscription ?? "") };
      case "customer.subscription.updated": {
        const status = String(o.status);
        return { type: "subscription.updated", providerSubscriptionId: String(o.id), status: status === "active" || status === "trialing" ? "ACTIVE" : status === "past_due" || status === "unpaid" ? "PAST_DUE" : "CANCELED", cancelAtPeriodEnd: Boolean(o.cancel_at_period_end), periodEnd: epoch(o.current_period_end) };
      }
      case "customer.subscription.deleted":
        return { type: "subscription.canceled", providerSubscriptionId: String(o.id) };
      case "invoice.paid":
        return { type: "invoice.paid", providerSubscriptionId: String(o.subscription ?? ""), providerInvoiceId: String(o.id), amountCents: Number(o.amount_paid ?? 0), currency: String(o.currency ?? "usd").toUpperCase(), hostedUrl: o.hosted_invoice_url as string | undefined, periodStart: epoch(o.period_start) ?? new Date(), periodEnd: epoch(o.period_end) ?? new Date() };
      case "invoice.payment_failed":
        return { type: "payment.failed", providerSubscriptionId: String(o.subscription ?? ""), message: "Your latest payment failed. Update your payment method to keep your plan." };
      default:
        return { type: "ignored" };
    }
  },
};

// ─── Razorpay (plans are pre-created in the Razorpay dashboard and mapped via env) ───
function razorpayPlanId(plan: PlanKey, interval: BillingInterval): string {
  const id = process.env[`RAZORPAY_PLAN_${plan}_${interval}`];
  if (!id) throw badRequest(`Razorpay plan RAZORPAY_PLAN_${plan}_${interval} is not configured`);
  return id;
}

export const razorpayProvider: BillingProvider = {
  id: "razorpay",
  label: "Razorpay",
  isConfigured: () => !!env().RAZORPAY_KEY_ID && !!env().RAZORPAY_KEY_SECRET,
  async checkout(i) {
    const auth = Buffer.from(`${env().RAZORPAY_KEY_ID}:${env().RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify({ plan_id: razorpayPlanId(i.plan, i.interval), total_count: i.interval === "YEARLY" ? 10 : 120, customer_notify: 1, notes: { workspaceId: i.workspaceId, plan: i.plan, interval: i.interval } }),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await res.json()) as { short_url?: string; error?: { description?: string } };
    if (!res.ok || !json.short_url) throw new AppError("SERVICE_UNAVAILABLE", `Razorpay: ${json.error?.description ?? res.status}`);
    return { type: "redirect", url: json.short_url };
  },
  async portal() {
    return null;
  },
  async cancel(subId) {
    const auth = Buffer.from(`${env().RAZORPAY_KEY_ID}:${env().RAZORPAY_KEY_SECRET}`).toString("base64");
    await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}/cancel`, { method: "POST", headers: { authorization: `Basic ${auth}`, "content-type": "application/json" }, body: JSON.stringify({ cancel_at_cycle_end: 1 }) });
  },
  async parseWebhook(raw, headers) {
    const secret = env().RAZORPAY_WEBHOOK_SECRET;
    const sig = headers.get("x-razorpay-signature") ?? "";
    if (!secret || !safeEqual(createHmac("sha256", secret).update(raw).digest("hex"), sig)) throw new AppError("UNAUTHENTICATED", "Invalid Razorpay signature");
    const event = JSON.parse(raw) as { event: string; payload: { subscription?: { entity: Record<string, unknown> }; payment?: { entity: Record<string, unknown> } } };
    const sub = event.payload.subscription?.entity;
    const notes = (sub?.notes ?? {}) as Record<string, string>;
    switch (event.event) {
      case "subscription.activated":
        return { type: "subscription.activated", workspaceId: notes.workspaceId!, plan: notes.plan as PlanKey, interval: (notes.interval as BillingInterval) ?? "MONTHLY", providerSubscriptionId: String(sub?.id), providerCustomerId: String(sub?.customer_id ?? ""), periodStart: epoch(sub?.current_start), periodEnd: epoch(sub?.current_end) };
      case "subscription.charged": {
        const pay = event.payload.payment?.entity;
        return { type: "invoice.paid", providerSubscriptionId: String(sub?.id), providerInvoiceId: String(pay?.invoice_id ?? pay?.id ?? ""), amountCents: Number(pay?.amount ?? 0), currency: String(pay?.currency ?? "INR"), periodStart: epoch(sub?.current_start) ?? new Date(), periodEnd: epoch(sub?.current_end) ?? new Date() };
      }
      case "subscription.halted":
      case "subscription.pending":
        return { type: "subscription.updated", providerSubscriptionId: String(sub?.id), status: "PAST_DUE" };
      case "subscription.cancelled":
      case "subscription.completed":
        return { type: "subscription.canceled", providerSubscriptionId: String(sub?.id) };
      case "payment.failed":
        return { type: "payment.failed", providerSubscriptionId: sub ? String(sub.id) : undefined, message: "A payment attempt failed." };
      default:
        return { type: "ignored" };
    }
  },
};

export const BILLING_PROVIDERS = { manual: manualProvider, stripe: stripeProvider, razorpay: razorpayProvider } as const;

export function billingProvider(id?: string): BillingProvider {
  const key = (id ?? env().BILLING_PROVIDER) as keyof typeof BILLING_PROVIDERS;
  return BILLING_PROVIDERS[key] ?? manualProvider;
}
