import type { PlanKey } from "@prisma/client";

export type PlanLimits = {
  aiCredits: number; // per month; -1 = unlimited
  seats: number;
  activeWorkers: number;
  campaigns: number;
  socialAccounts: number;
  emailsPerMonth: number;
  contacts: number;
  automations: number;
};

export type Plan = {
  key: PlanKey;
  name: string;
  tagline: string;
  audience: string;
  monthlyPriceCents: number | null; // null = custom
  yearlyPriceCents: number | null; // per month when billed yearly
  highlighted?: boolean;
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Plan[] = [
  {
    key: "FREE",
    name: "Free",
    tagline: "Explore AI marketing operations",
    audience: "Trial users",
    monthlyPriceCents: 0,
    yearlyPriceCents: 0,
    limits: { aiCredits: 100, seats: 1, activeWorkers: 2, campaigns: 3, socialAccounts: 1, emailsPerMonth: 250, contacts: 250, automations: 1 },
    features: ["2 AI workers", "100 AI credits / month", "Content Studio", "1 social account", "Basic analytics"],
  },
  {
    key: "STARTER",
    name: "Starter",
    tagline: "Everything a small business needs",
    audience: "Small businesses",
    monthlyPriceCents: 2900,
    yearlyPriceCents: 2400,
    limits: { aiCredits: 1000, seats: 3, activeWorkers: 4, campaigns: 15, socialAccounts: 3, emailsPerMonth: 5000, contacts: 2500, automations: 5 },
    features: ["4 AI workers", "1,000 AI credits / month", "3 team seats", "Email marketing", "SEO toolkit", "5 automations"],
  },
  {
    key: "GROWTH",
    name: "Growth",
    tagline: "Scale content and campaigns",
    audience: "Growing businesses",
    monthlyPriceCents: 7900,
    yearlyPriceCents: 6500,
    highlighted: true,
    limits: { aiCredits: 5000, seats: 8, activeWorkers: 8, campaigns: 50, socialAccounts: 10, emailsPerMonth: 25000, contacts: 15000, automations: 25 },
    features: ["All 8 AI workers", "5,000 AI credits / month", "8 team seats", "Approval workflows", "Advanced analytics & PDF reports", "25 automations"],
  },
  {
    key: "SCALE",
    name: "Scale",
    tagline: "For marketing teams and agencies",
    audience: "Marketing teams",
    monthlyPriceCents: 19900,
    yearlyPriceCents: 16500,
    limits: { aiCredits: 20000, seats: 25, activeWorkers: 8, campaigns: -1, socialAccounts: 30, emailsPerMonth: 100000, contacts: 75000, automations: -1 },
    features: ["20,000 AI credits / month", "25 team seats", "Unlimited campaigns & automations", "Custom roles", "Priority support"],
  },
  {
    key: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Security, scale and dedicated support",
    audience: "Large organizations",
    monthlyPriceCents: null,
    yearlyPriceCents: null,
    limits: { aiCredits: -1, seats: -1, activeWorkers: 8, campaigns: -1, socialAccounts: -1, emailsPerMonth: -1, contacts: -1, automations: -1 },
    features: ["Unlimited AI credits", "Unlimited seats", "SSO & audit exports", "Dedicated success manager", "Custom AI model routing", "99.9% uptime SLA"],
  },
];

export function getPlan(key: PlanKey): Plan {
  const plan = PLANS.find((p) => p.key === key);
  if (!plan) throw new Error(`Unknown plan ${key}`);
  return plan;
}

export const PLAN_ORDER: PlanKey[] = ["FREE", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"];

export function isUpgrade(from: PlanKey, to: PlanKey): boolean {
  return PLAN_ORDER.indexOf(to) > PLAN_ORDER.indexOf(from);
}

export function withinLimit(limit: number, used: number, adding = 1): boolean {
  return limit < 0 || used + adding <= limit;
}
