import type { CampaignObjective } from "@prisma/client";
import type { WorkflowNodeType, WorkflowTrigger } from "@/lib/constants";

/**
 * Ready-made templates for the Templates gallery, the setup wizard and the automation builder.
 * Everything a template creates starts as a draft (automations start switched off).
 */

type Cfg = Record<string, unknown>;

export type AutomationTemplate = { key: string; name: string; description: string; trigger: WorkflowTrigger; triggerConfig?: Cfg; nodes: { type: WorkflowNodeType; label: string; config: Cfg }[] };

export type CampaignTemplate = {
  key: string;
  name: string;
  description: string;
  objective: CampaignObjective;
  channels: string[];
  durationWeeks: number;
  kpis: Record<string, number>;
  tasks: string[];
  /** Goal handed to the AI campaign autopilot when the user builds it with AI. */
  goal: string;
};

export type EmailTemplateDef = { key: string; name: string; category: string; subject: string; previewText: string; body: string };

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    key: "product-launch",
    name: "Product launch",
    description: "Build anticipation, launch with a bang and convert early interest into customers.",
    objective: "LEADS",
    channels: ["LinkedIn", "Instagram", "Email", "Blog"],
    durationWeeks: 6,
    kpis: { leads: 300, conversions: 40 },
    tasks: ["Finalize positioning and launch messaging", "Build the launch landing page", "Write launch announcement blog post", "Create teaser posts for two weeks before launch", "Send launch email to all subscribers", "Brief sales on the launch offer", "Publish customer proof within 2 weeks of launch", "Post-launch report and learnings"],
    goal: "Launch our new product and generate 300 qualified leads in 6 weeks",
  },
  {
    key: "webinar",
    name: "Webinar or live event",
    description: "Fill the seats, keep attendees engaged and follow up while interest is hot.",
    objective: "LEADS",
    channels: ["LinkedIn", "Email", "X"],
    durationWeeks: 4,
    kpis: { registrations: 250, attendees: 120 },
    tasks: ["Choose topic, speakers and date", "Create registration page", "Announce on LinkedIn and X", "Send 3-email invite sequence", "Reminder emails 1 day and 1 hour before", "Host and record the session", "Send recording and next step to attendees", "Hand hot leads to sales"],
    goal: "Get 250 registrations for our upcoming webinar in 4 weeks",
  },
  {
    key: "seasonal-sale",
    name: "Seasonal sale / festival offer",
    description: "Time-boxed promotion for Diwali, Black Friday or any seasonal moment.",
    objective: "SALES",
    channels: ["Instagram", "Facebook", "Email"],
    durationWeeks: 3,
    kpis: { orders: 500, revenue: 25000 },
    tasks: ["Define the offer and discount codes", "Design sale creatives", "Announce early access to subscribers", "Daily countdown posts in the final week", "Last-chance email 24 hours before end", "Retarget cart abandoners", "Measure revenue and ROAS"],
    goal: "Drive online orders with our festival season sale over the next 3 weeks",
  },
  {
    key: "lead-generation",
    name: "Always-on lead generation",
    description: "A steady flow of qualified leads from content, social proof and nurture.",
    objective: "LEADS",
    channels: ["Blog", "LinkedIn", "Email"],
    durationWeeks: 8,
    kpis: { leads: 400, mqls: 120 },
    tasks: ["Pick 3 pillar topics your buyers search for", "Publish one in-depth article per week", "Create a gated checklist or guide", "Share each article on LinkedIn 3 times", "Nurture new leads with a 4-email sequence", "Review lead quality with sales every two weeks"],
    goal: "Generate 400 qualified B2B leads over the next 8 weeks with content and LinkedIn",
  },
  {
    key: "brand-awareness",
    name: "Brand awareness",
    description: "Get known by the right audience with consistent, useful presence.",
    objective: "AWARENESS",
    channels: ["LinkedIn", "Instagram", "X"],
    durationWeeks: 8,
    kpis: { reach: 200000, followers: 1500 },
    tasks: ["Define 3 content pillars", "Post 4 times a week per channel", "Partner with 2 creators or industry voices", "Share one behind-the-scenes story weekly", "Track reach and follower growth weekly"],
    goal: "Grow brand awareness and followers among our target audience over 8 weeks",
  },
  {
    key: "customer-reactivation",
    name: "Win back inactive customers",
    description: "Re-engage customers who haven't bought or logged in for a while.",
    objective: "RETENTION",
    channels: ["Email", "Instagram"],
    durationWeeks: 3,
    kpis: { reactivated: 150 },
    tasks: ["Segment customers inactive 60+ days", "Write a 3-email win-back sequence", "Offer a time-limited incentive", "Survey those who don't return", "Report reactivation rate"],
    goal: "Win back customers who have been inactive for 60+ days",
  },
];

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "welcome",
    name: "Welcome email",
    category: "Onboarding",
    subject: "Welcome aboard, {{first_name}} 👋",
    previewText: "Here's how to get the most out of your first week.",
    body: "Hi {{first_name}},\n\nThanks for joining us! We're glad you're here.\n\n**Here's how to get started:**\n\n1. Set up your account in two minutes\n2. Explore the feature our customers love most\n3. Reply to this email if you have any questions — a real person reads every reply\n\n[Get started]({{cta_url}})\n\nCheers,\nThe team",
  },
  {
    key: "newsletter",
    name: "Monthly newsletter",
    category: "Newsletter",
    subject: "{{first_name}}, what's new this month",
    previewText: "Three updates worth two minutes of your time.",
    body: "Hi {{first_name}},\n\nHere's what happened this month:\n\n### 1. Product update\nA short description of the most useful new feature and why it matters.\n\n### 2. From the blog\nOne article your readers will actually want to read.\n\n### 3. Customer story\nHow a customer got a measurable result.\n\n[Read more]({{cta_url}})\n\nSee you next month!",
  },
  {
    key: "product-launch",
    name: "Product launch announcement",
    category: "Announcement",
    subject: "It's here: meet the new way to [benefit]",
    previewText: "Built from your feedback — available today.",
    body: "Hi {{first_name}},\n\nToday we're launching something we've been working on for months.\n\n**What it does:** one sentence on the main benefit.\n\n**Why it matters:** the problem it removes for you.\n\n**What's next:** try it free for 14 days.\n\n[See it in action]({{cta_url}})",
  },
  {
    key: "promotion",
    name: "Limited-time offer",
    category: "Promotion",
    subject: "{{first_name}}, 20% off ends Friday",
    previewText: "Our biggest offer of the season — only a few days left.",
    body: "Hi {{first_name}},\n\nFor a limited time, get **20% off** everything.\n\n- Offer ends Friday at midnight\n- Use code **SEASON20** at checkout\n- Free shipping on all orders\n\n[Shop the sale]({{cta_url}})",
  },
  {
    key: "re-engagement",
    name: "We miss you (re-engagement)",
    category: "Retention",
    subject: "It's been a while, {{first_name}}",
    previewText: "Here's what you've missed — and a little something to come back.",
    body: "Hi {{first_name}},\n\nWe noticed it's been a while. Here's what's new since you last visited:\n\n- Improvement one\n- Improvement two\n- Improvement three\n\nCome back this week and enjoy a special welcome-back offer.\n\n[Take a look]({{cta_url}})",
  },
  {
    key: "event-invite",
    name: "Event / webinar invite",
    category: "Event",
    subject: "You're invited: [event name] on [date]",
    previewText: "45 minutes, practical takeaways, live Q&A.",
    body: "Hi {{first_name}},\n\nJoin us live on **[date] at [time]** for [event name].\n\n**You'll learn:**\n- Takeaway one\n- Takeaway two\n- Takeaway three\n\nSeats are limited.\n\n[Save my seat]({{cta_url}})",
  },
];

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    key: "lead-welcome",
    name: "New lead → qualify → welcome → assign worker",
    description: "Qualify inbound leads, send a welcome email and ask Nova for an account plan.",
    trigger: "LEAD_CREATED",
    nodes: [
      { type: "CONDITION", label: "Score is at least 30", config: { field: "lead.score", operator: "gte", value: "30" } },
      { type: "UPDATE_LEAD", label: "Mark as contacted", config: { status: "CONTACTED", addTag: "auto-qualified" } },
      { type: "SEND_EMAIL", label: "Welcome email", config: { to: "lead", email: "", subject: "Thanks for your interest, {{lead.firstName}}", body: "Hi {{lead.firstName}}, thanks for reaching out!" } },
      { type: "ASSIGN_WORKER", label: "Account plan from Nova", config: { workerKey: "marketing-strategist", capability: "audience-analysis", instructions: "Account plan for {{lead.company}}" } },
    ],
  },
  {
    key: "blog-to-social",
    name: "New blog → social posts → schedule",
    description: "Turn every published article into a LinkedIn post awaiting approval.",
    trigger: "CONTENT_PUBLISHED",
    nodes: [
      { type: "AI_ACTION", label: "Draft social posts", config: { workerKey: "social-media-manager", capability: "post-creation", instructions: "{{payload.title}}", saveAsContent: false } },
      { type: "CREATE_SOCIAL_POST", label: "Queue LinkedIn post", config: { platform: "LINKEDIN", text: "New on the blog: {{payload.title}}", scheduleInHours: 24 } },
    ],
  },
  { key: "campaign-report", name: "Campaign completed → performance report", description: "Generate an executive report the moment a campaign ends.", trigger: "CAMPAIGN_COMPLETED", nodes: [{ type: "GENERATE_REPORT", label: "Generate report", config: { days: 90 } }, { type: "NOTIFY", label: "Notify team", config: { title: "Report ready for {{payload.name}}", body: "" } }] },
  {
    key: "low-engagement",
    name: "Low engagement → AI optimization",
    description: "When 7-day social engagement drops under 2%, ask Apex for fixes.",
    trigger: "ENGAGEMENT_LOW",
    triggerConfig: { threshold: 0.02 },
    nodes: [{ type: "AI_ACTION", label: "Optimization ideas", config: { workerKey: "growth-strategist", capability: "conversion-ideas", instructions: "Engagement rate is {{payload.engagementRate}}. Suggest fixes.", saveAsContent: true } }],
  },
];
