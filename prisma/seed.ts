/* eslint-disable no-console */
import { PrismaClient, type LeadSource, type LeadStatus, type MetricChannel, type Prisma, type SocialPlatform } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SYSTEM_ROLES } from "../src/config/permissions";
import { WORKER_TEMPLATES } from "../src/config/workers";
import { localProvider } from "../src/server/ai/providers/local";
import { BLOG_POSTS } from "./seed-data/blog";

const db = new PrismaClient();

// Deterministic PRNG so seeded data is stable between runs.
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)]!;
const daysAgo = (d: number, h = 10) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - d);
  date.setUTCHours(h, int(0, 59), 0, 0);
  // Never produce timestamps in the future for "today".
  if (d >= 0 && date.getTime() > Date.now()) return new Date(Date.now() - int(5, 240) * 60_000);
  return date;
};
const dayOnly = (d: number) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - d);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
};

async function gen(prompt: string, system = "") {
  const r = await localProvider.generate({ model: "infinity-local", system, messages: [{ role: "user", content: prompt }], maxTokens: 2000 });
  return r.text;
}

const BRAND_SYSTEM = "Company: Northwind Growth\nTarget audience: operations leaders at mid-size logistics and e-commerce companies";

async function ensureRoles() {
  const ids: Record<string, string> = {};
  for (const [key, def] of Object.entries(SYSTEM_ROLES)) {
    const existing = await db.role.findFirst({ where: { workspaceId: null, key } });
    const data = { name: def.name, description: def.description, permissions: def.permissions, rank: def.rank, isSystem: true };
    const role = existing ? await db.role.update({ where: { id: existing.id }, data }) : await db.role.create({ data: { ...data, key } });
    ids[key] = role.id;
  }
  return ids;
}

async function upsertUser(email: string, name: string, password: string, extra: Partial<Prisma.UserCreateInput> = {}) {
  const passwordHash = await bcrypt.hash(password, 12);
  return db.user.upsert({
    where: { email },
    create: { email, name, passwordHash, emailVerifiedAt: new Date(), lastLoginAt: daysAgo(int(0, 5)), ...extra },
    update: { name, passwordHash, status: "ACTIVE", deletedAt: null, ...extra },
  });
}

async function main() {
  console.log("Seeding InfinityOps Studio…");
  const roles = await ensureRoles();

  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Admin12345!";
  const demoPassword = process.env.SEED_DEMO_PASSWORD || "Demo12345!";
  const admin = await upsertUser("admin@infinityops.studio", "Platform Admin", adminPassword, { platformRole: "SUPER_ADMIN" });
  const demo = await upsertUser("demo@infinityops.studio", "Alex Morgan", demoPassword);
  const sarah = await upsertUser("sarah@northwindgrowth.com", "Sarah Chen", demoPassword);
  const raj = await upsertUser("raj@northwindgrowth.com", "Raj Patel", demoPassword);
  const lena = await upsertUser("lena@northwindgrowth.com", "Lena Fischer", demoPassword);

  // Recreate the demo workspace from scratch for a clean, repeatable dataset.
  const existing = await db.workspace.findUnique({ where: { slug: "northwind-growth" } });
  if (existing) await db.workspace.delete({ where: { id: existing.id } });

  const now = new Date();
  const periodStart = daysAgo(12);
  const periodEnd = new Date(periodStart);
  periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);

  const ws = await db.workspace.create({
    data: {
      name: "Northwind Growth",
      slug: "northwind-growth",
      industry: "Logistics SaaS",
      website: "https://northwindgrowth.com",
      timezone: "America/New_York",
      members: {
        create: [
          { userId: demo.id, roleId: roles.owner! },
          { userId: sarah.id, roleId: roles.manager! },
          { userId: raj.id, roleId: roles.member! },
          { userId: lena.id, roleId: roles.viewer! },
          { userId: admin.id, roleId: roles.admin! },
        ],
      },
      subscription: { create: { plan: "GROWTH", status: "ACTIVE", interval: "MONTHLY", provider: "manual", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, seats: 8 } },
      brandKit: {
        create: {
          companyName: "Northwind Growth",
          tagline: "Route planning that pays for itself",
          website: "https://northwindgrowth.com",
          industry: "Logistics SaaS",
          primaryColor: "#4f46e5",
          secondaryColor: "#0ea5e9",
          accentColor: "#f59e0b",
          headingFont: "Inter",
          bodyFont: "Inter",
          voice: "Confident, practical and warm. We explain with real numbers and customer examples — never hype.",
          voiceAttributes: ["Practical", "Confident", "Warm", "Data-driven"],
          targetAudience: "Operations and logistics leaders at mid-size distribution, 3PL and e-commerce companies (50–1,000 employees) who are under pressure to cut delivery costs.",
          productsServices: "Northwind Route Optimizer (AI route planning), Fleet Insights (fuel and utilization analytics) and Dispatch Hub (driver app + live tracking).",
          usps: ["Cuts fuel costs 12–18% in the first 90 days", "Live in under two weeks with no IT project", "Integrates with Shopify, NetSuite and SAP out of the box"],
          competitors: ["Routific", "OptimoRoute", "Onfleet"],
          guidelines: "Lead with the customer's outcome. Use concrete numbers. Keep sentences short. Mention a customer example whenever possible.",
          dos: ["Use active voice", "Quote real metrics", "End with one clear CTA"],
          donts: ["Say 'revolutionary' or 'game-changing'", "Use more than one exclamation mark", "Criticize competitors by name"],
        },
      },
    },
  });
  await db.user.updateMany({ where: { id: { in: [demo.id, sarah.id, raj.id, lena.id] } }, data: { lastWorkspaceId: ws.id } });
  console.log(`  workspace ${ws.name}`);

  // AI workers (6 of 8 active on Growth)
  for (const [i, w] of WORKER_TEMPLATES.entries()) {
    await db.aIWorker.create({
      data: {
        workspaceId: ws.id,
        key: w.key,
        name: w.name,
        title: w.title,
        description: w.description,
        color: w.color,
        capabilities: w.capabilities.map((c) => c.key),
        systemPrompt: w.systemPrompt,
        isActive: i < 6,
        requiresApproval: w.key !== "analytics-specialist",
        customInstructions: w.key === "content-writer" ? "Always include one customer example with a concrete number (e.g. 'Coastal Freight cut fuel spend 16%')." : null,
      },
    });
  }
  const workers = await db.aIWorker.findMany({ where: { workspaceId: ws.id } });
  const worker = (key: string) => workers.find((w) => w.key === key)!;

  // Campaigns
  const campaignDefs = [
    { name: "Q3 Route Optimizer launch", objective: "LEADS", status: "ACTIVE", budget: 4500000, start: 45, end: -30, channels: ["LinkedIn", "Google Ads", "Email", "Webinar"], audience: "VP Operations at 3PLs and distributors in North America" },
    { name: "Fuel savings calculator", objective: "CONVERSIONS", status: "ACTIVE", budget: 1800000, start: 30, end: -45, channels: ["Google Ads", "SEO", "Blog"], audience: "Fleet managers researching fuel cost reduction" },
    { name: "Peak season readiness webinar", objective: "ENGAGEMENT", status: "COMPLETED", budget: 900000, start: 80, end: 50, channels: ["Email", "LinkedIn", "Webinar"], audience: "Operations leaders preparing for Q4 volume" },
    { name: "Shopify merchant partnership", objective: "AWARENESS", status: "PLANNING", budget: 1200000, start: -10, end: -60, channels: ["Partnerships", "Email", "Blog"], audience: "Shopify Plus merchants shipping 500+ orders/day" },
    { name: "Customer expansion: Fleet Insights", objective: "RETENTION", status: "ACTIVE", budget: 600000, start: 20, end: -40, channels: ["Email", "Webinar"], audience: "Existing Route Optimizer customers" },
    { name: "Brand awareness — LogiTech Expo", objective: "AWARENESS", status: "PAUSED", budget: 2500000, start: 25, end: -20, channels: ["Events", "LinkedIn", "Meta Ads"], audience: "Attendees of LogiTech Expo Chicago" },
    { name: "Case study series 2024", objective: "TRAFFIC", status: "COMPLETED", budget: 400000, start: 140, end: 90, channels: ["Blog", "LinkedIn", "SEO"], audience: "Mid-market logistics buyers" },
    { name: "Holiday re-engagement", objective: "SALES", status: "DRAFT", budget: 750000, start: -40, end: -75, channels: ["Email", "Meta Ads"], audience: "Churned and dormant trial accounts" },
  ] as const;

  const campaigns: Awaited<ReturnType<typeof db.campaign.create>>[] = [];
  for (const [i, c] of campaignDefs.entries()) {
    const strategy = i < 3 ? await gen(`Plan a marketing campaign for the brief below.\n\nBrief: ${c.name}`, BRAND_SYSTEM) : null;
    const campaign = await db.campaign.create({
      data: {
        workspaceId: ws.id,
        ownerId: pick([demo.id, sarah.id, sarah.id, raj.id]),
        name: c.name,
        description: `${c.name} — targeting ${c.audience.toLowerCase()}.`,
        objective: c.objective,
        status: c.status,
        approvalStatus: c.status === "PLANNING" ? "PENDING" : c.status === "DRAFT" ? "NOT_REQUIRED" : "APPROVED",
        targetAudience: c.audience,
        budgetCents: c.budget,
        spentCents: c.status === "DRAFT" || c.status === "PLANNING" ? 0 : Math.round(c.budget * (0.35 + rand() * 0.55)),
        startDate: daysAgo(c.start),
        endDate: daysAgo(c.end),
        channels: [...c.channels],
        strategy,
        kpis: { leads: int(80, 600), conversions: int(20, 120), ctr: 2 },
        createdAt: daysAgo(c.start + 10),
        tasks: {
          create: [
            { workspaceId: ws.id, title: "Finalize messaging and positioning", status: "DONE", sortOrder: 1 },
            { workspaceId: ws.id, title: "Produce landing page copy", status: c.status === "DRAFT" ? "TODO" : "DONE", sortOrder: 2, workerId: worker("content-writer").id },
            { workspaceId: ws.id, title: "Build LinkedIn ad set (3 creatives)", status: c.status === "ACTIVE" ? "IN_PROGRESS" : "TODO", sortOrder: 3, workerId: worker("ad-specialist").id },
            { workspaceId: ws.id, title: "Schedule nurture email sequence", status: "TODO", sortOrder: 4, dueDate: daysAgo(-7) },
            { workspaceId: ws.id, title: "Mid-campaign performance review", status: "TODO", sortOrder: 5, dueDate: daysAgo(-14), workerId: worker("analytics-specialist").id },
          ],
        },
      },
    });
    campaigns.push(campaign);
  }
  console.log(`  ${campaigns.length} campaigns`);

  // 90 days of daily metrics per channel, with campaign attribution for running campaigns.
  const channels: MetricChannel[] = ["WEBSITE", "SOCIAL", "EMAIL", "ADS", "SEO"];
  const metricRows: Prisma.MetricDailyCreateManyInput[] = [];
  for (let d = 89; d >= 0; d--) {
    const growth = 1 + (89 - d) / 180;
    const weekday = new Date(dayOnly(d)).getUTCDay();
    const weekend = weekday === 0 || weekday === 6 ? 0.62 : 1;
    for (const ch of channels) {
      const base = { WEBSITE: 2400, SOCIAL: 5200, EMAIL: 1500, ADS: 6800, SEO: 1800 }[ch];
      const impressions = Math.round(base * growth * weekend * (0.85 + rand() * 0.3));
      const clicks = Math.round(impressions * ({ WEBSITE: 0.34, SOCIAL: 0.018, EMAIL: 0.09, ADS: 0.024, SEO: 0.21 }[ch] * (0.8 + rand() * 0.4)));
      const visits = ch === "WEBSITE" || ch === "SEO" ? clicks : Math.round(clicks * 0.82);
      const leads = Math.round(visits * (0.026 + rand() * 0.012));
      const conversions = Math.round(leads * (0.14 + rand() * 0.08));
      const running = campaigns.filter((c) => c.status !== "DRAFT" && c.status !== "PLANNING" && c.startDate && c.startDate <= daysAgo(d) && (!c.endDate || c.endDate >= daysAgo(d)));
      const campaign = running.length && (ch === "ADS" || ch === "SOCIAL" || ch === "EMAIL") ? pick(running) : null;
      metricRows.push({
        workspaceId: ws.id,
        campaignId: campaign?.id ?? null,
        date: dayOnly(d),
        channel: ch,
        impressions,
        reach: Math.round(impressions * 0.71),
        visits,
        clicks,
        engagements: ch === "SOCIAL" ? Math.round(impressions * (0.035 + rand() * 0.02)) : Math.round(clicks * 0.3),
        leads,
        conversions,
        revenueCents: conversions * int(35000, 90000),
        spendCents: ch === "ADS" ? Math.round(impressions * 0.9 * (0.9 + rand() * 0.2)) : ch === "SOCIAL" ? Math.round(impressions * 0.12) : 0,
      });
    }
  }
  await db.metricDaily.createMany({ data: metricRows });
  console.log(`  ${metricRows.length} daily metric rows`);

  // Leads
  const first = ["Olivia", "Liam", "Emma", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella", "Lucas", "Mia", "James", "Amelia", "Benjamin", "Harper", "Daniel", "Aisha", "Mateo", "Chloe", "Arjun", "Yuki", "Diego", "Fatima", "Kofi", "Ingrid", "Hana", "Omar", "Grace", "Tomás", "Nadia"];
  const last = ["Johnson", "Williams", "Garcia", "Martinez", "Nguyen", "Kim", "Okafor", "Schmidt", "Rossi", "Silva", "Patel", "Hughes", "Dubois", "Andersson", "Tanaka", "Kowalski", "Haddad", "Murphy", "Costa", "Novak"];
  const companies = ["Coastal Freight", "BluePeak Logistics", "Harbor Distribution", "Summit 3PL", "Evergreen Supply", "Metro Parcel", "Atlas Cold Chain", "Redwood Wholesale", "Prairie Fulfillment", "Keystone Carriers", "Lakeside Foods", "Urban Courier Co", "Pioneer Building Supply", "Northstar Pharma Logistics", "Beacon Retail Group", "Granite Auto Parts", "Sunset Beverage", "Ironwood Furniture", "Cascade Medical Supply", "Horizon Home Goods"];
  const titles = ["VP Operations", "Director of Logistics", "Fleet Manager", "Head of Supply Chain", "COO", "Operations Manager", "Transportation Manager", "Founder & CEO", "Logistics Coordinator", "Director of Fulfillment"];
  const sources: LeadSource[] = ["WEBSITE", "WEBSITE", "ADS", "SOCIAL", "EMAIL", "REFERRAL", "EVENT"];
  const statusWeights: LeadStatus[] = ["NEW", "NEW", "NEW", "CONTACTED", "CONTACTED", "QUALIFIED", "QUALIFIED", "PROPOSAL", "WON", "LOST"];
  const leadIds: string[] = [];
  const usedEmails = new Set<string>();
  for (let i = 0; i < 140; i++) {
    const fn = pick(first);
    const ln = pick(last);
    const company = pick(companies);
    const domain = company.toLowerCase().replace(/[^a-z]/g, "") + ".com";
    let email = `${fn.toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "")}.${ln.toLowerCase()}@${domain}`;
    if (usedEmails.has(email)) email = email.replace("@", `${i}@`);
    usedEmails.add(email);
    const status = pick(statusWeights);
    const source = pick(sources);
    const title = pick(titles);
    const senior = /VP|Director|Head|COO|CEO/.test(title);
    const score = Math.min(100, (senior ? 25 : 8) + { NEW: 5, CONTACTED: 15, QUALIFIED: 30, PROPOSAL: 40, WON: 45, LOST: 0 }[status] + int(5, 25));
    const created = int(0, 88);
    const lead = await db.lead.create({
      data: {
        workspaceId: ws.id,
        ownerId: pick([demo.id, sarah.id, raj.id]),
        campaignId: rand() > 0.35 ? pick(campaigns.slice(0, 6)).id : null,
        firstName: fn,
        lastName: ln,
        email,
        phone: rand() > 0.4 ? `+1 (${int(200, 989)}) ${int(200, 989)}-${int(1000, 9999)}` : null,
        company,
        jobTitle: title,
        website: `https://${domain}`,
        source,
        status,
        score,
        tags: [pick(["enterprise", "mid-market", "smb"]), ...(rand() > 0.6 ? [pick(["webinar", "calculator", "demo-request", "expo"])] : [])],
        valueCents: status === "PROPOSAL" || status === "WON" || status === "QUALIFIED" ? int(1200000, 9600000) : 0,
        lastContactedAt: status === "NEW" ? null : daysAgo(int(0, created)),
        createdAt: daysAgo(created, int(8, 18)),
        activities: {
          create: [
            { workspaceId: ws.id, type: "CREATED", content: `Lead created from ${source.toLowerCase()}`, createdAt: daysAgo(created) },
            ...(status !== "NEW" ? [{ workspaceId: ws.id, type: "EMAIL_SENT" as const, content: "Email sent: Welcome to Northwind Growth", createdAt: daysAgo(Math.max(0, created - 1)) }] : []),
            ...(["QUALIFIED", "PROPOSAL", "WON"].includes(status) ? [{ workspaceId: ws.id, type: "CALL" as const, content: `Discovery call with ${fn}: running ${int(20, 180)} vehicles, evaluating route tools this quarter.`, actorId: sarah.id, createdAt: daysAgo(Math.max(0, created - 3)) }] : []),
            ...(status === "PROPOSAL" || status === "WON" ? [{ workspaceId: ws.id, type: "STATUS_CHANGE" as const, content: `Status changed from QUALIFIED to ${status}`, actorId: sarah.id, createdAt: daysAgo(Math.max(0, created - 6)) }] : []),
          ],
        },
      },
    });
    leadIds.push(lead.id);
    if (status === "QUALIFIED" || status === "PROPOSAL") {
      await db.leadTask.create({ data: { workspaceId: ws.id, leadId: lead.id, title: status === "PROPOSAL" ? "Follow up on proposal" : "Book product demo", dueDate: daysAgo(-int(1, 10)), assigneeId: sarah.id } });
    }
  }
  console.log(`  ${leadIds.length} leads`);

  // Content library
  const contentDefs = [
    { title: "How Coastal Freight cut fuel costs 16% in 90 days", type: "BLOG_POST", status: "PUBLISHED", prompt: "Write a complete blog post on the topic below.\n\nTopic: How Coastal Freight cut fuel costs 16% in 90 days" },
    { title: "Route optimization buyer's guide for 3PLs", type: "BLOG_POST", status: "APPROVED", prompt: "Write a complete blog post.\n\nTopic: Route optimization buyer's guide for 3PLs" },
    { title: "Q3 launch — LinkedIn post set", type: "SOCIAL_POST", status: "PUBLISHED", prompt: "Write 5 social captions.\n\nTopic: Route Optimizer launch" },
    { title: "Fuel calculator — Google Ads copy", type: "AD_COPY", status: "PUBLISHED", prompt: "Write 5 ad variations.\n\nOffer: Free fuel savings calculator" },
    { title: "Route Optimizer landing page", type: "LANDING_PAGE", status: "IN_REVIEW", prompt: "Write website copy.\n\nPage: Route Optimizer product page" },
    { title: "Peak season webinar invitation", type: "EMAIL", status: "PUBLISHED", prompt: "Write a marketing email.\n\nBrief: Invite operations leaders to our peak season readiness webinar" },
    { title: "Fleet Insights product description", type: "PRODUCT_DESCRIPTION", status: "DRAFT", prompt: "Write website copy.\n\nPage: Fleet Insights analytics add-on" },
    { title: "Pricing page SEO meta", type: "SEO_META", status: "APPROVED", prompt: "Produce keyword research.\n\nTopic: route optimization software pricing" },
    { title: "5 signs your delivery routes are costing you money", type: "BLOG_POST", status: "DRAFT", prompt: "Write a complete blog post.\n\nTopic: 5 signs your delivery routes are costing you money" },
    { title: "Q3 performance summary", type: "OTHER", status: "APPROVED", prompt: "Write an executive marketing report.\n\nData: Q3 leads 1,840 (+22%), CPL $38, pipeline $2.4M" },
  ] as const;
  for (const [i, c] of contentDefs.entries()) {
    const body = await gen(c.prompt, BRAND_SYSTEM);
    const created = daysAgo(int(2, 60));
    await db.content.create({
      data: {
        workspaceId: ws.id,
        authorId: pick([demo.id, sarah.id, raj.id]),
        campaignId: i < 6 ? campaigns[i % 3]!.id : null,
        title: c.title,
        type: c.type,
        status: c.status,
        body,
        tone: pick(["Professional", "Friendly", "Persuasive"]),
        excerpt: body.replace(/[#*_>`\-[\]()|]/g, "").trim().slice(0, 200),
        keywords: c.type === "BLOG_POST" ? ["route optimization", "fuel costs", "logistics software"] : [],
        generatedByAI: i !== 1,
        wordCount: body.split(/\s+/).length,
        publishedAt: c.status === "PUBLISHED" ? created : null,
        createdAt: created,
        versions: { create: [{ version: 1, title: c.title, body, note: i !== 1 ? "AI generated" : "Created", createdById: demo.id, createdAt: created }] },
      },
    });
  }
  console.log(`  ${contentDefs.length} content items`);

  // Social
  const accounts: { platform: SocialPlatform; handle: string; followers: number }[] = [
    { platform: "LINKEDIN", handle: "northwind-growth", followers: 18400 },
    { platform: "INSTAGRAM", handle: "northwindgrowth", followers: 6200 },
    { platform: "X", handle: "northwindgrowth", followers: 9100 },
    { platform: "YOUTUBE", handle: "NorthwindGrowth", followers: 2300 },
  ];
  const accountRows = [];
  for (const a of accounts) {
    accountRows.push(await db.socialAccount.create({ data: { workspaceId: ws.id, platform: a.platform, handle: a.handle, displayName: "Northwind Growth", followers: a.followers, connectedById: demo.id, lastSyncAt: daysAgo(0) } }));
  }
  const postTexts = [
    "Coastal Freight cut fuel spend 16% in 90 days. Here's the three-step playbook their ops team used 👇",
    "Peak season is 8 weeks away. Is your routing ready for 2× order volume?",
    "Route planning used to take our customers 3 hours every morning. Now it takes 4 minutes.",
    "New: Fleet Insights shows idle time, fuel burn and utilization per vehicle — in one view.",
    "What's the #1 hidden cost in last-mile delivery? (Hint: it isn't fuel.)",
    "We're at LogiTech Expo Chicago, booth 412. Come see live route optimization on real data.",
    "Behind the scenes: how our data team tests routing algorithms against 10M real deliveries.",
    "3 metrics every fleet manager should review weekly: cost per stop, on-time rate, miles per route.",
  ];
  for (let i = 0; i < 26; i++) {
    const acc = accountRows[i % 3]!;
    const published = i < 18;
    const impressions = published ? int(1800, 24000) : 0;
    await db.socialPost.create({
      data: {
        workspaceId: ws.id,
        socialAccountId: acc.id,
        platform: acc.platform,
        campaignId: pick(campaigns.slice(0, 3)).id,
        text: postTexts[i % postTexts.length]!,
        hashtags: acc.platform === "INSTAGRAM" ? ["logistics", "supplychain", "fleetmanagement"] : ["logistics", "routeoptimization"],
        status: published ? "PUBLISHED" : i < 22 ? "SCHEDULED" : i < 24 ? "PENDING_APPROVAL" : "DRAFT",
        scheduledAt: published ? daysAgo(int(1, 45)) : daysAgo(-int(1, 20), int(13, 17)),
        publishedAt: published ? daysAgo(int(1, 45)) : null,
        impressions,
        reach: Math.round(impressions * 0.72),
        likes: Math.round(impressions * (0.02 + rand() * 0.03)),
        comments: Math.round(impressions * (0.002 + rand() * 0.004)),
        shares: Math.round(impressions * (0.002 + rand() * 0.006)),
        clicks: Math.round(impressions * (0.008 + rand() * 0.012)),
        createdById: pick([sarah.id, raj.id]),
      },
    });
  }
  console.log("  social accounts & posts");

  // SEO
  const project = await db.sEOProject.create({ data: { workspaceId: ws.id, name: "northwindgrowth.com", domain: "northwindgrowth.com", competitors: ["routific.com", "optimoroute.com", "onfleet.com"] } });
  const kws = [
    ["route optimization software", 8100, 72, 1450, "Commercial", 14, 18],
    ["delivery route planner", 5400, 58, 980, "Commercial", 9, 11],
    ["fleet fuel cost reduction", 1300, 34, 620, "Informational", 6, 9],
    ["last mile delivery software", 4400, 66, 1820, "Commercial", 22, 25],
    ["route planning for 3pl", 720, 28, 540, "Commercial", 4, 7],
    ["multi stop route planner", 12100, 61, 710, "Transactional", 17, 17],
    ["how to reduce delivery costs", 2900, 31, 410, "Informational", 11, 15],
    ["dispatch software for small business", 1900, 45, 890, "Commercial", 28, 31],
    ["routific alternatives", 880, 38, 1210, "Commercial", null, null],
    ["fleet utilization metrics", 590, 22, 330, "Informational", 8, 8],
    ["delivery driver app", 3600, 57, 760, "Transactional", 34, 29],
    ["route optimization api", 1000, 49, 1640, "Commercial", 19, 24],
  ] as const;
  await db.keyword.createMany({
    data: kws.map(([term, vol, diff, cpc, intent, pos, prev], i) => ({
      workspaceId: ws.id,
      projectId: project.id,
      term,
      searchVolume: vol,
      difficulty: diff,
      cpcCents: cpc,
      intent,
      position: pos,
      previousPosition: prev,
      status: i === 8 || i === 10 ? "OPPORTUNITY" : "TRACKING",
      targetUrl: pos ? `https://northwindgrowth.com/${term.replace(/\s+/g, "-")}` : null,
    })),
  });
  console.log("  SEO project & keywords");

  // Email
  const tplBody = "Hi {{first_name}},\n\nThanks for your interest in Northwind Growth. Teams like yours typically cut fuel costs **12–18%** within 90 days.\n\n[Book a 20-minute walkthrough]({{cta_url}})\n\nBest,\nSarah";
  await db.emailTemplate.createMany({
    data: [
      { workspaceId: ws.id, name: "Welcome — new lead", category: "onboarding", subject: "Welcome to Northwind Growth, {{first_name}}", previewText: "Here's how teams like yours save 12–18% on fuel", body: tplBody },
      { workspaceId: ws.id, name: "Webinar invitation", category: "events", subject: "You're invited: Peak season readiness live session", previewText: "45 minutes, real routing data, live Q&A", body: "Hi {{first_name}},\n\nJoin our operations team for a 45-minute live session on preparing your routes for peak season.\n\n- Real data from 10M deliveries\n- Capacity planning checklist\n- Live Q&A\n\n[Save your seat]({{cta_url}})" },
      { workspaceId: ws.id, name: "Monthly product update", category: "newsletter", subject: "What's new at Northwind — this month", previewText: "Fleet Insights, faster planning and more", body: "Hi {{first_name}},\n\nHere's what shipped this month:\n\n1. **Fleet Insights** — idle time and fuel burn per vehicle\n2. **Faster planning** — 40% faster route generation for 500+ stops\n3. **Shopify sync** — orders flow in automatically\n\n[See what's new]({{cta_url}})" },
    ],
  });
  await db.emailCampaign.createMany({
    data: [
      { workspaceId: ws.id, campaignId: campaigns[2]!.id, name: "Peak season webinar — invite", subject: "You're invited: Peak season readiness live session", previewText: "45 minutes, real routing data", body: "Hi {{first_name}},\n\nJoin us for a live session on peak season routing.\n\n[Save your seat]({{cta_url}})", status: "SENT", sentAt: daysAgo(58), recipientsCount: 4820, deliveredCount: 4731, openCount: 2081, clickCount: 412, conversionCount: 188, unsubscribeCount: 14, segment: { statuses: ["NEW", "CONTACTED", "QUALIFIED"] } },
      { workspaceId: ws.id, campaignId: campaigns[0]!.id, name: "Route Optimizer launch announcement", subject: "Meet the new Route Optimizer — 40% faster planning", previewText: "Built for 500+ stop days", body: "Hi {{first_name}},\n\nThe new Route Optimizer plans 500-stop days in under a minute.\n\n[See it in action]({{cta_url}})", status: "SENT", sentAt: daysAgo(21), recipientsCount: 6210, deliveredCount: 6104, openCount: 2502, clickCount: 537, conversionCount: 142, unsubscribeCount: 22, segment: {} },
      { workspaceId: ws.id, name: "Monthly product update — this month", subject: "What's new at Northwind — this month", body: "Hi {{first_name}},\n\nHere's what shipped this month.", status: "SCHEDULED", scheduledAt: daysAgo(-3, 14), segment: { minScore: 20 } },
      { workspaceId: ws.id, name: "Trial nurture sequence", type: "SEQUENCE", subject: "Your Northwind trial: 3 quick wins", body: "Hi {{first_name}},\n\nHere are three quick wins for your first week.", status: "ACTIVE", sentAt: daysAgo(30), recipientsCount: 380, deliveredCount: 1012, openCount: 486, clickCount: 121, conversionCount: 38, unsubscribeCount: 5, segment: { statuses: ["NEW"] }, steps: [{ delayDays: 2, subject: "Did you import your first routes?", body: "Hi {{first_name}}, importing a CSV of stops takes about 2 minutes." }, { delayDays: 4, subject: "How Coastal Freight saved 16%", body: "Hi {{first_name}}, here's a quick case study." }] },
      { workspaceId: ws.id, name: "Holiday re-engagement (draft)", subject: "We saved you a seat for 2025 planning", body: "Hi {{first_name}},\n\nPlanning next year's routes? We can help.", status: "DRAFT", segment: { statuses: ["LOST"] } },
    ],
  });
  console.log("  email templates & campaigns");

  // Automations (the example workflows from the product spec)
  const wf = async (name: string, description: string, trigger: Prisma.WorkflowCreateInput["trigger"], nodes: { type: Prisma.WorkflowNodeCreateWithoutWorkflowInput["type"]; label: string; config: Prisma.InputJsonValue }[], enabled = true, triggerConfig?: Prisma.InputJsonValue) =>
    db.workflow.create({
      data: { workspaceId: ws.id, name, description, trigger, triggerConfig, isEnabled: enabled, createdById: demo.id, runCount: int(3, 60), lastRunAt: daysAgo(int(0, 4)), nodes: { create: nodes.map((n, i) => ({ ...n, position: i })) } },
    });
  const w1 = await wf("New lead → qualify → welcome → assign worker", "Qualifies inbound leads, sends a welcome email and asks the strategist for an account plan.", "LEAD_CREATED", [
    { type: "CONDITION", label: "Score is at least 30", config: { field: "lead.score", operator: "gte", value: "30" } },
    { type: "UPDATE_LEAD", label: "Mark as contacted", config: { status: "CONTACTED", addTag: "auto-qualified" } },
    { type: "SEND_EMAIL", label: "Send welcome email", config: { to: "lead", subject: "Welcome to Northwind Growth, {{lead.firstName}}", body: "Hi {{lead.firstName}}, thanks for your interest! Teams like {{lead.company}} typically cut fuel costs 12–18% within 90 days." } },
    { type: "ASSIGN_WORKER", label: "Account plan from Nova", config: { workerKey: "marketing-strategist", capability: "audience-analysis", instructions: "Account plan for {{lead.company}} ({{lead.jobTitle}})" } },
  ]);
  await wf("New blog → social posts → schedule", "Turns every published article into scheduled social posts awaiting approval.", "CONTENT_PUBLISHED", [
    { type: "AI_ACTION", label: "Draft social posts", config: { workerKey: "social-media-manager", capability: "post-creation", instructions: "{{payload.title}}", saveAsContent: false } },
    { type: "CREATE_SOCIAL_POST", label: "Queue LinkedIn post", config: { platform: "LINKEDIN", text: "New on the blog: {{payload.title}}", scheduleInHours: 24 } },
    { type: "NOTIFY", label: "Notify the team", config: { title: "Social posts drafted for “{{payload.title}}”", body: "Review them in Social Media → Approvals." } },
  ]);
  await wf("Campaign completed → performance report", "Generates an executive report when a campaign ends.", "CAMPAIGN_COMPLETED", [
    { type: "GENERATE_REPORT", label: "Generate report", config: { days: 90 } },
    { type: "NOTIFY", label: "Share with the team", config: { title: "Report ready for {{payload.name}}", body: "Find it in Content Studio." } },
  ]);
  await wf("Low engagement → AI optimization", "When 7-day engagement drops under 2%, ask the Growth Strategist for fixes.", "ENGAGEMENT_LOW", [
    { type: "AI_ACTION", label: "Optimization ideas", config: { workerKey: "growth-strategist", capability: "conversion-ideas", instructions: "Our 7-day social engagement rate is {{payload.engagementRate}} (threshold {{payload.threshold}}). Suggest fixes.", saveAsContent: true } },
    { type: "NOTIFY", label: "Alert marketing", config: { title: "Engagement dropped below target", body: "Apex drafted optimization ideas — see Content Studio." } },
  ], true, { threshold: 0.02 });
  await db.workflowExecution.createMany({
    data: Array.from({ length: 6 }, (_, i) => ({
      workspaceId: ws.id,
      workflowId: w1.id,
      status: i === 2 ? ("STOPPED" as const) : ("COMPLETED" as const),
      payload: { leadId: leadIds[i], source: "WEBSITE" },
      currentStep: i === 2 ? 1 : 4,
      startedAt: daysAgo(i, 9 + i),
      finishedAt: daysAgo(i, 9 + i),
      logs: i === 2
        ? [{ at: daysAgo(i).toISOString(), step: 1, label: "Score is at least 30", status: "stopped", message: "lead.score gte 30 → false" }]
        : [
            { at: daysAgo(i).toISOString(), step: 1, label: "Score is at least 30", status: "ok", message: "lead.score gte 30 → true" },
            { at: daysAgo(i).toISOString(), step: 2, label: "Mark as contacted", status: "ok", message: "Lead updated" },
            { at: daysAgo(i).toISOString(), step: 3, label: "Send welcome email", status: "ok", message: "Email sent" },
            { at: daysAgo(i).toISOString(), step: 4, label: "Account plan from Nova", status: "ok", message: "Task assigned to Nova" },
          ],
    })),
  });
  console.log("  automations");

  // AI task history + request log (drives usage & cost analytics)
  const taskDefs = [
    ["marketing-strategist", "campaign-plan", "Launch plan for Fleet Insights add-on", "APPROVED"],
    ["content-writer", "blog-post", "How to plan routes for peak season", "AWAITING_APPROVAL"],
    ["content-writer", "social-captions", "Customer story: Coastal Freight", "APPROVED"],
    ["social-media-manager", "content-calendar", "October social calendar", "COMPLETED"],
    ["seo-specialist", "keyword-research", "last mile delivery software", "APPROVED"],
    ["email-specialist", "email-sequence", "Trial onboarding sequence", "AWAITING_APPROVAL"],
    ["analytics-specialist", "report", "September performance report", "COMPLETED"],
    ["seo-specialist", "seo-brief", "route optimization software", "REJECTED"],
    ["marketing-strategist", "competitor-analysis", "Routific, OptimoRoute and Onfleet", "APPROVED"],
    ["content-writer", "ad-copy", "Free fuel savings calculator", "COMPLETED"],
  ] as const;
  const capPrompt = (key: string, cap: string) => WORKER_TEMPLATES.find((w) => w.key === key)!.capabilities.find((c) => c.key === cap)!.prompt;
  for (const [i, [wk, cap, instr, status]] of taskDefs.entries()) {
    const w = worker(wk);
    const output = await gen(capPrompt(wk, cap).replace("{{input}}", instr), BRAND_SYSTEM);
    const created = daysAgo(int(0, 25), int(8, 17));
    const promptTokens = int(900, 2400);
    const completionTokens = int(700, 2600);
    await db.aITask.create({
      data: {
        workspaceId: ws.id,
        workerId: w.id,
        createdById: pick([demo.id, sarah.id, raj.id]),
        campaignId: i < 4 ? campaigns[0]!.id : null,
        title: `${WORKER_TEMPLATES.find((t) => t.key === wk)!.capabilities.find((c) => c.key === cap)!.label}: ${instr}`,
        capability: cap,
        instructions: instr,
        status,
        output,
        promptTokens,
        completionTokens,
        costMicros: Math.round(promptTokens * 5 + completionTokens * 25),
        model: "claude-opus-5",
        provider: "anthropic",
        startedAt: created,
        completedAt: created,
        approvedById: ["APPROVED", "REJECTED"].includes(status) ? sarah.id : null,
        approvedAt: ["APPROVED", "REJECTED"].includes(status) ? created : null,
        reviewNote: status === "REJECTED" ? "Too generic — needs our 3PL angle." : null,
        createdAt: created,
      },
    });
  }
  const features = ["content:blog", "content:social", "worker:content-writer:blog-post", "campaign:strategy", "social:caption", "email:email", "content:inline:rewrite", "seo:keyword-suggestions"];
  const models = [
    ["anthropic", "claude-opus-5", 5, 25],
    ["anthropic", "claude-sonnet-5", 2, 10],
    ["anthropic", "claude-haiku-4-5", 1, 5],
  ] as const;
  const aiRows: Prisma.AIRequestCreateManyInput[] = [];
  const usageRows: Prisma.UsageRecordCreateManyInput[] = [];
  for (let d = 29; d >= 0; d--) {
    for (let n = 0; n < int(6, 22); n++) {
      const [provider, model, inP, outP] = pick([models[0], models[0], models[1], models[1], models[1], models[2]]);
      const promptTokens = int(400, 3200);
      const completionTokens = int(200, 2800);
      const at = daysAgo(d, int(7, 20));
      aiRows.push({ workspaceId: ws.id, userId: pick([demo.id, sarah.id, raj.id]), feature: pick(features), provider, model, promptTokens, completionTokens, costMicros: promptTokens * inP + completionTokens * outP, latencyMs: int(1200, 14000), status: rand() > 0.97 ? "ERROR" : "SUCCESS", createdAt: at });
      const period = `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`;
      usageRows.push({ workspaceId: ws.id, metric: "AI_CREDITS", quantity: Math.max(1, Math.ceil((promptTokens + completionTokens) / 1000)), period, createdAt: at });
    }
  }
  await db.aIRequest.createMany({ data: aiRows });
  await db.usageRecord.createMany({ data: usageRows });
  console.log(`  ${aiRows.length} AI requests`);

  // Billing history
  const inv = (monthsAgo: number, n: number) => {
    const start = new Date(periodStart);
    start.setUTCMonth(start.getUTCMonth() - monthsAgo);
    const end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 1);
    return { workspaceId: ws.id, number: `IOS-${start.getUTCFullYear()}-D${String(n).padStart(4, "0")}`, amountCents: monthsAgo >= 3 ? 2900 : 7900, currency: "USD", status: "PAID" as const, description: monthsAgo >= 3 ? "Starter plan (monthly)" : "Growth plan (monthly)", lineItems: [{ description: monthsAgo >= 3 ? "Starter plan" : "Growth plan", amountCents: monthsAgo >= 3 ? 2900 : 7900, quantity: 1 }], periodStart: start, periodEnd: end, issuedAt: start, paidAt: start };
  };
  await db.invoice.createMany({ data: [inv(0, 1), inv(1, 2), inv(2, 3), inv(3, 4), inv(4, 5)] });

  // Notifications & activity
  await db.notification.createMany({
    data: [
      { workspaceId: ws.id, userId: demo.id, type: "ai_task.approval", title: "Quill finished “How to plan routes for peak season” — review needed", link: "/app/workers", createdAt: daysAgo(0, 9) },
      { workspaceId: ws.id, userId: demo.id, type: "lead.created", title: "New lead: Aisha Okafor", body: "Summit 3PL", link: "/app/leads", createdAt: daysAgo(0, 8) },
      { workspaceId: ws.id, userId: demo.id, type: "campaign.completed", title: "Campaign “Peak season readiness webinar” completed", link: `/app/campaigns/${campaigns[2]!.id}`, createdAt: daysAgo(3), readAt: daysAgo(2) },
      { workspaceId: ws.id, userId: demo.id, type: "payment.event", title: "Invoice paid — Growth plan", link: "/app/billing", createdAt: daysAgo(12), readAt: daysAgo(12) },
    ],
  });
  const actions = ["campaign.created", "content.created", "worker.task_created", "worker.task_approved", "social.post_created", "lead.imported", "workflow.enabled", "seo.audit_run", "email.campaign_scheduled", "brand.updated"];
  await db.auditLog.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({ workspaceId: ws.id, actorId: pick([demo.id, sarah.id, raj.id]), action: pick(actions), entityType: "Campaign", entityId: campaigns[i % campaigns.length]!.id, createdAt: daysAgo(Math.floor(i / 3), 17 - (i % 8)) })),
  });

  // Public blog
  await db.blogPost.deleteMany({ where: { slug: { in: BLOG_POSTS.map((p) => p.slug) } } });
  await db.blogPost.createMany({
    data: BLOG_POSTS.map((p) => ({
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      body: p.body,
      category: p.category,
      tags: p.tags,
      authorName: p.authorName,
      authorRole: p.authorRole,
      readingMinutes: p.readingMinutes,
      featured: !!p.featured,
      seoTitle: p.title,
      seoDescription: p.excerpt,
      publishedAt: daysAgo(p.daysAgo),
    })),
  });

  // Platform
  await db.featureFlag.upsert({ where: { key: "ai.streaming" }, create: { key: "ai.streaming", description: "Stream AI responses token-by-token", enabled: true }, update: {} });
  await db.featureFlag.upsert({ where: { key: "workflows.visual-builder-v2" }, create: { key: "workflows.visual-builder-v2", description: "Next-gen branching workflow canvas", enabled: false, rolloutPercent: 10 }, update: {} });
  await db.systemLog.create({ data: { level: "info", source: "seed", message: `Database seeded at ${now.toISOString()}` } });

  console.log("\nDone. Sign in with:");
  console.log(`  Owner (demo):   demo@infinityops.studio / ${demoPassword}`);
  console.log(`  Manager:        sarah@northwindgrowth.com / ${demoPassword}`);
  console.log(`  Member:         raj@northwindgrowth.com / ${demoPassword}`);
  console.log(`  Viewer:         lena@northwindgrowth.com / ${demoPassword}`);
  console.log(`  Super admin:    admin@infinityops.studio / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
