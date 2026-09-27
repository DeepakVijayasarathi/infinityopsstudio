import { route } from "@/server/api";
import { db } from "@/server/db";
import { notFound } from "@/server/errors";
import { escapeHtml } from "@/server/email/templates";
import { siteConfig } from "@/config/site";

export const GET = route({ permission: "billing:view" }, async ({ ctx, params }) => {
  const inv = await db.invoice.findFirst({ where: { id: params.id, workspaceId: ctx.workspace.id }, include: { workspace: { select: { name: true } } } });
  if (!inv) throw notFound("Invoice");
  const money = (c: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: inv.currency }).format(c / 100);
  const items = (inv.lineItems as { description: string; amountCents: number; quantity: number }[]) ?? [];
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(inv.number)}</title>
<style>body{font-family:system-ui,sans-serif;color:#0f172a;max-width:760px;margin:40px auto;padding:0 20px}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}.r{text-align:right}.muted{color:#64748b}.badge{display:inline-block;padding:2px 10px;border-radius:999px;background:${inv.status === "PAID" ? "#dcfce7" : "#fef3c7"};font-size:12px}@media print{button{display:none}}</style></head><body>
<button onclick="window.print()" style="float:right;padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer">Print / Save as PDF</button>
<h1>∞ ${escapeHtml(siteConfig.name)}</h1><p class="muted">${escapeHtml(siteConfig.company)}</p>
<h2>Invoice ${escapeHtml(inv.number)} <span class="badge">${inv.status}</span></h2>
<p><strong>Billed to:</strong> ${escapeHtml(inv.workspace.name)}<br><span class="muted">Issued ${inv.issuedAt.toDateString()} · Period ${inv.periodStart.toDateString()} – ${inv.periodEnd.toDateString()}</span></p>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead><tbody>
${items.map((i) => `<tr><td>${escapeHtml(i.description)}</td><td class="r">${i.quantity}</td><td class="r">${money(i.amountCents)}</td></tr>`).join("")}
<tr><td></td><td class="r">Tax</td><td class="r">${money(inv.taxCents)}</td></tr>
<tr><td></td><td class="r"><strong>Total</strong></td><td class="r"><strong>${money(inv.amountCents + inv.taxCents)}</strong></td></tr></tbody></table>
${inv.status !== "PAID" ? `<p class="muted">Payment instructions: reply to ${escapeHtml(siteConfig.salesEmail)} with this invoice number.</p>` : `<p class="muted">Paid ${inv.paidAt?.toDateString() ?? ""}. Thank you!</p>`}
</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } });
});
