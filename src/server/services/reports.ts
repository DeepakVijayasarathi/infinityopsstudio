import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { db } from "../db";
import { generateText } from "../ai/service";
import { byChannel, campaignTable, overview, resolveRange, type DateRange } from "./analytics";
import { campaignPerformance } from "./campaigns";
import { notify } from "./notifications";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

async function dataSummary(workspaceId: string, r: DateRange) {
  const [o, channels, campaigns] = await Promise.all([overview(workspaceId, r), byChannel(workspaceId, r), campaignTable(workspaceId, r)]);
  const k = o.kpis;
  return [
    `Period: ${r.from.toDateString()} – ${r.to.toDateString()}`,
    `Leads: ${k.leadsGenerated.value} (previous period ${k.leadsGenerated.previous})`,
    `Social reach: ${k.socialReach.value}; engagement: ${k.engagement.value}`,
    `Conversion rate: ${pct(k.conversionRate.value)} (previous ${pct(k.conversionRate.previous)})`,
    `Spend: ${money(k.monthlySpend.value)}; revenue: ${money(k.revenue.value)}`,
    `AI requests: ${k.aiUsage.value}`,
    `Channels: ${channels.map((c) => `${c.channel} impressions=${c.impressions ?? 0} clicks=${c.clicks ?? 0} leads=${c.leads ?? 0} conversions=${c.conversions ?? 0}`).join("; ")}`,
    `Top campaigns: ${campaigns.slice(0, 5).map((c) => `${c.name} (${c.status}) impressions=${c.impressions} ctr=${pct(c.ctr)} leads=${c.leads} roas=${c.roas.toFixed(2)}`).join("; ")}`,
  ].join("\n");
}

/** Generates an AI-written performance report and stores it as a Content item. */
export async function generateReportContent(workspaceId: string, days: number, campaignId?: string) {
  const r = resolveRange({ days });
  let summary = await dataSummary(workspaceId, r);
  let title = `Performance report — last ${days} days`;
  if (campaignId) {
    const c = await db.campaign.findFirst({ where: { id: campaignId, workspaceId } });
    if (c) {
      const perf = await campaignPerformance(workspaceId, campaignId);
      title = `Campaign report — ${c.name}`;
      summary = `Campaign: ${c.name}\nObjective: ${c.objective}\nBudget: ${money(c.budgetCents)}\nImpressions: ${perf.totals.impressions}\nClicks: ${perf.totals.clicks} (CTR ${pct(perf.totals.ctr)})\nLeads: ${perf.totals.leads}\nConversions: ${perf.totals.conversions}\nSpend: ${money(perf.totals.spendCents)}\nRevenue: ${money(perf.totals.revenueCents)} (ROAS ${perf.totals.roas.toFixed(2)})`;
    }
  }
  const lens = await db.aIWorker.findFirst({ where: { workspaceId, key: "analytics-specialist" } });
  const result = await generateText({
    workspaceId,
    feature: "reports:performance",
    system: lens?.systemPrompt,
    messages: [{ role: "user", content: `Write an executive marketing performance report with summary, KPI table, what worked, concerns and prioritized recommendations.\n\nData:\n${summary}` }],
  });
  const body = `${result.text}\n\n---\n\n**Source data**\n\n${summary.split("\n").map((l) => `- ${l}`).join("\n")}`;
  return db.content.create({
    data: { workspaceId, title, type: "OTHER", body, generatedByAI: true, campaignId: campaignId ?? null, wordCount: body.split(/\s+/).length, status: "APPROVED" },
  });
}

export async function processCampaignReport(workspaceId: string, campaignId: string) {
  const content = await generateReportContent(workspaceId, 90, campaignId);
  await notify({ workspaceId, type: "campaign.completed", title: `Report ready: ${content.title}`, link: `/app/content/${content.id}` });
}

// ─── PDF export ───

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

// pdf-lib standard fonts only support WinAnsi; strip anything else.
const ascii = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "");

export async function analyticsPdf(workspaceId: string, r: DateRange): Promise<Uint8Array> {
  const [ws, o, channels, campaigns] = await Promise.all([
    db.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { name: true } }),
    overview(workspaceId, r),
    byChannel(workspaceId, r),
    campaignTable(workspaceId, r),
  ]);
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = rgb(0.31, 0.27, 0.9);
  const muted = rgb(0.39, 0.45, 0.55);
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 790;
  const margin = 50;

  const ensure = (h: number) => {
    if (y - h < 60) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
  };
  const text = (s: string, opts: { size?: number; f?: PDFFont; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    const size = opts.size ?? 10;
    for (const line of wrap(ascii(s), opts.f ?? font, size, 495)) {
      ensure(size + 6);
      page.drawText(line, { x: opts.x ?? margin, y, size, font: opts.f ?? font, color: opts.color ?? rgb(0.06, 0.09, 0.16) });
      y -= size + 5;
    }
  };

  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: brand });
  page.drawText("InfinityOps Studio", { x: margin, y: 822, size: 11, font: bold, color: rgb(1, 1, 1) });
  text(`Marketing performance report`, { size: 20, f: bold });
  text(`${ws.name} · ${r.from.toDateString()} - ${r.to.toDateString()}`, { color: muted });
  y -= 10;

  const k = o.kpis;
  const kpis: [string, string][] = [
    ["Leads generated", k.leadsGenerated.value.toLocaleString()],
    ["Social reach", k.socialReach.value.toLocaleString()],
    ["Engagement", k.engagement.value.toLocaleString()],
    ["Conversion rate", pct(k.conversionRate.value)],
    ["Ad spend", money(k.monthlySpend.value)],
    ["Revenue", money(k.revenue.value)],
    ["Active campaigns", String(k.activeCampaigns.value)],
    ["AI requests", k.aiUsage.value.toLocaleString()],
  ];
  text("Key metrics", { size: 13, f: bold });
  kpis.forEach(([label, value], i) => {
    const col = i % 2;
    if (col === 0) ensure(40);
    const x = margin + col * 250;
    page.drawRectangle({ x, y: y - 28, width: 235, height: 34, color: rgb(0.96, 0.96, 0.99), borderColor: rgb(0.88, 0.89, 0.95), borderWidth: 1 });
    page.drawText(label, { x: x + 10, y: y - 6, size: 8, font, color: muted });
    page.drawText(value, { x: x + 10, y: y - 21, size: 12, font: bold });
    if (col === 1 || i === kpis.length - 1) y -= 42;
  });

  y -= 6;
  text("Channel performance", { size: 13, f: bold });
  const header = ["Channel", "Impressions", "Clicks", "Leads", "Conversions", "Spend"];
  const cols = [margin, 150, 240, 310, 370, 450];
  ensure(20);
  header.forEach((h, i) => page.drawText(h, { x: cols[i]!, y, size: 9, font: bold, color: muted }));
  y -= 14;
  for (const c of channels) {
    ensure(14);
    const vals = [c.channel, (c.impressions ?? 0).toLocaleString(), (c.clicks ?? 0).toLocaleString(), String(c.leads ?? 0), String(c.conversions ?? 0), money(c.spendCents ?? 0)];
    vals.forEach((v, i) => page.drawText(ascii(v), { x: cols[i]!, y, size: 9, font }));
    y -= 13;
  }

  y -= 10;
  text("Campaigns", { size: 13, f: bold });
  const ch = ["Campaign", "Status", "Impr.", "CTR", "Leads", "ROAS"];
  const cc = [margin, 250, 320, 380, 430, 480];
  ensure(20);
  ch.forEach((h, i) => page.drawText(h, { x: cc[i]!, y, size: 9, font: bold, color: muted }));
  y -= 14;
  for (const c of campaigns.slice(0, 25)) {
    ensure(14);
    const vals = [c.name.slice(0, 36), c.status, c.impressions.toLocaleString(), pct(c.ctr), String(c.leads), c.roas.toFixed(2)];
    vals.forEach((v, i) => page.drawText(ascii(v), { x: cc[i]!, y, size: 9, font }));
    y -= 13;
  }

  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(`Generated ${new Date().toUTCString()} · Page ${i + 1} of ${pages.length}`, { x: margin, y: 30, size: 8, font, color: muted }));
  return pdf.save();
}
