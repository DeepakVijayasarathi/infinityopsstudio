export type SeedPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  tags: string[];
  authorName: string;
  authorRole: string;
  readingMinutes: number;
  featured?: boolean;
  daysAgo: number;
  body: string;
};

export const BLOG_POSTS: SeedPost[] = [
  {
    slug: "ai-marketing-workers-explained",
    title: "AI marketing workers, explained: how specialized agents replace busywork",
    excerpt: "Generic chatbots write generic copy. Specialized AI workers with a role, a brief and your brand context produce work you can actually ship.",
    category: "AI Marketing",
    tags: ["ai workers", "marketing operations", "automation"],
    authorName: "Priya Raman",
    authorRole: "Head of Product",
    readingMinutes: 6,
    featured: true,
    daysAgo: 4,
    body: `Most marketing teams tried AI the same way: open a chat window, paste a prompt, and hope. The results were fast but forgettable — copy that sounded like everyone else's, strategies that ignored the budget, and posts that never made it out of a doc.

## Why a "worker" beats a chat window

A worker is an AI model with three things a chat window lacks:

1. **A role.** Our Content Writer is instructed like a senior conversion copywriter; our SEO Specialist thinks in search intent and topical authority. The role changes what "good" looks like.
2. **A capability menu.** Instead of a blank prompt, each worker offers specific jobs — *blog post*, *keyword research*, *email sequence* — each backed by a tested prompt template.
3. **Your brand context.** Every request is grounded in your Brand Kit: voice, audience, products, USPs and the words you never use.

## Approval keeps humans in charge

Workers don't publish on their own. By default every output lands in an approval queue where a manager can edit, approve or reject it. Approved output flows into the Content library, campaigns and schedules.

## What teams actually delegate

- First drafts of blog posts and landing pages
- Weekly social calendars across four platforms
- Subject-line testing for every newsletter
- Monthly performance summaries for leadership

## Getting started

Activate two workers, fill in your Brand Kit and assign one task you already do every week. Measure the time saved for a month — most teams reclaim six to ten hours per marketer.`,
  },
  {
    slug: "brand-voice-for-ai-content",
    title: "Teaching AI your brand voice: a practical Brand Kit checklist",
    excerpt: "The fastest way to improve AI output isn't a better prompt — it's better context. Here's exactly what to put in your Brand Kit.",
    category: "Brand",
    tags: ["brand voice", "content", "brand kit"],
    authorName: "Marcus Lee",
    authorRole: "Content Strategist",
    readingMinutes: 5,
    featured: true,
    daysAgo: 11,
    body: `When AI copy "doesn't sound like us", the model usually isn't the problem. It simply doesn't know who "us" is.

## The seven fields that matter most

1. **Voice description.** One short paragraph: *"Confident, practical and warm. We explain, we don't hype."*
2. **Voice attributes.** Three to five adjectives you can check copy against.
3. **Target audience.** Role, company size, top frustrations.
4. **Products and services.** What you sell, in plain language.
5. **Unique selling points.** The two or three claims only you can make.
6. **Always / never lists.** "Always use active voice." "Never say *revolutionary*."
7. **Competitors.** So the AI can differentiate instead of imitate.

## Test it

Generate the same LinkedIn post before and after filling the kit. The difference is usually obvious in the first sentence.

## Keep it alive

Review the kit each quarter. New products, a repositioning or a new audience segment should be reflected immediately — every worker reads the kit on every request.`,
  },
  {
    slug: "marketing-automation-workflows-that-pay-off",
    title: "Five marketing automation workflows that pay for themselves",
    excerpt: "Skip the 40-step journeys. These five small workflows save hours every week and are live in under ten minutes each.",
    category: "Automation",
    tags: ["automation", "workflows", "lead nurturing"],
    authorName: "Priya Raman",
    authorRole: "Head of Product",
    readingMinutes: 7,
    featured: true,
    daysAgo: 18,
    body: `Automation projects fail when they try to automate everything at once. Start with small loops that run every day.

## 1. New lead → qualify → welcome email

When a lead arrives, check the score. Above 40, send a personal welcome from the account owner and notify sales. Below 40, enroll them in education content.

## 2. New blog post → social posts

When content is published, the Social Media Manager drafts posts for LinkedIn, X and Instagram and sends them for approval. One article becomes a week of social.

## 3. Campaign completed → performance report

The Analytics Specialist writes an executive summary with what worked, what didn't and what to try next — waiting in your library the morning after a campaign ends.

## 4. Low engagement → optimization ideas

If engagement rate drops below 2% over seven days, the Growth Strategist proposes three experiments and the team gets a notification.

## 5. Proposal stage → follow-up task

When a deal reaches *Proposal*, create a follow-up task for the owner and draft a check-in email two days later.

## Measure it

Track time saved and response speed. Faster follow-up alone often lifts lead-to-meeting conversion by double digits.`,
  },
  {
    slug: "seo-content-briefs-that-rank",
    title: "How to write SEO content briefs that actually rank",
    excerpt: "A good brief answers intent before a writer types a word. Here is the structure we use for every article.",
    category: "SEO",
    tags: ["seo", "content briefs", "keyword research"],
    authorName: "Elena Petrova",
    authorRole: "SEO Lead",
    readingMinutes: 6,
    daysAgo: 26,
    body: `Rankings are won in the brief, not in the editing pass.

## Start with intent

Search the keyword and read the top five results. Are they guides, comparisons or product pages? Your format must match what searchers expect.

## The brief template

- **Primary keyword** and 3–5 secondary keywords
- **Search intent** in one sentence
- **Title and meta description** options
- **Outline** with H2/H3 headings
- **Questions to answer** — pulled from "People also ask"
- **Internal links** to and from existing pages
- **Target length** based on competing pages, not a round number

## Use your data

Pair the brief with your own keyword list: volume, difficulty and current position. Prioritize terms where you rank 8–20 — they move fastest.

## Close the loop

After publishing, track the position weekly and refresh the article after 90 days with new examples and better internal links.`,
  },
  {
    slug: "email-subject-lines-testing-framework",
    title: "A simple framework for testing email subject lines",
    excerpt: "Stop guessing. Test one variable at a time across five subject-line styles and let the data pick your default.",
    category: "Email",
    tags: ["email marketing", "subject lines", "ab testing"],
    authorName: "Marcus Lee",
    authorRole: "Content Strategist",
    readingMinutes: 4,
    daysAgo: 33,
    body: `Subject lines decide whether the rest of your email matters. Yet most teams pick one by gut feel.

## Five styles to rotate

1. **Curiosity** — "The one change we made to onboarding"
2. **Benefit** — "Cut reporting time in half this month"
3. **Urgency** — "Last day: early pricing ends tonight"
4. **Personalization** — "{{first_name}}, your Q3 plan is ready"
5. **Question** — "Is your funnel leaking here?"

## Run it properly

Split at least 1,000 recipients per variant, test one element at a time and judge on clicks, not only opens — privacy features inflate open rates.

## Build a playbook

After six tests you'll see which styles your audience rewards. Make that your default and keep testing the runner-up.`,
  },
  {
    slug: "marketing-analytics-for-small-teams",
    title: "Marketing analytics for small teams: the five numbers that matter",
    excerpt: "You don't need a data team to make good decisions. Track these five metrics weekly and ignore the rest.",
    category: "Analytics",
    tags: ["analytics", "kpis", "reporting"],
    authorName: "Elena Petrova",
    authorRole: "SEO Lead",
    readingMinutes: 5,
    daysAgo: 41,
    body: `Dashboards with forty charts create anxiety, not decisions. Small teams need a short list.

## The five numbers

1. **Qualified leads** — the output marketing is accountable for
2. **Visit-to-lead conversion rate** — tells you whether traffic is the problem
3. **Cost per lead by channel** — where to move budget
4. **Pipeline influenced** — the number leadership cares about
5. **Content velocity** — pieces shipped per week

## A 30-minute weekly review

Look at each number versus last week and last month. For each red number, write one hypothesis and one experiment. That's it.

## Automate the report

Let an analytics worker draft the summary every Monday so the meeting starts with decisions, not data gathering.`,
  },
  {
    slug: "social-media-calendar-in-an-hour",
    title: "Plan a month of social media in one hour",
    excerpt: "A repeatable process for turning one campaign theme into thirty on-brand posts across four platforms.",
    category: "Social Media",
    tags: ["social media", "content calendar", "planning"],
    authorName: "Jordan Blake",
    authorRole: "Social Media Manager",
    readingMinutes: 5,
    daysAgo: 52,
    body: `Consistency beats virality. The teams that win on social publish on a rhythm — and planning in batches is the only way to keep it.

## Step 1: pick four themes (10 minutes)

One per week: a customer story, a product tip, an industry insight and a behind-the-scenes look.

## Step 2: generate drafts (20 minutes)

Ask your Social Media Manager worker for a two-week calendar per theme, adapted to each platform's format.

## Step 3: edit and approve (20 minutes)

Cut anything generic. Add a real number or a real name to every post.

## Step 4: schedule (10 minutes)

Queue posts at your audience's best times — weekday mornings for LinkedIn, lunchtime and evenings for Instagram.

Repeat monthly, and review engagement every Friday to see which themes earn another round.`,
  },
];
