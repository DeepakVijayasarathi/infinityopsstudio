import { siteConfig } from "@/config/site";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function layout(title: string, bodyHtml: string, footer?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f7fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #e5e7eb">
<tr><td style="padding:28px 32px 8px;font-weight:700;font-size:16px">∞ ${escape(siteConfig.name)}</td></tr>
<tr><td style="padding:8px 32px 28px;font-size:15px;line-height:1.6"><h1 style="font-size:20px;margin:8px 0 16px">${escape(title)}</h1>${bodyHtml}</td></tr>
</table>
<p style="font-size:12px;color:#64748b;margin-top:16px">${footer ?? `${escape(siteConfig.company)} · You received this email because of activity on your ${escape(siteConfig.name)} account.`}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string) {
  return `<p style="margin:24px 0"><a href="${escape(href)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escape(label)}</a></p>`;
}

export function actionEmail(opts: { title: string; intro: string; actionUrl: string; actionLabel: string; outro?: string }) {
  const html = layout(
    opts.title,
    `<p>${escape(opts.intro)}</p>${button(opts.actionUrl, opts.actionLabel)}<p style="font-size:13px;color:#64748b">Or paste this link into your browser:<br>${escape(opts.actionUrl)}</p>${opts.outro ? `<p>${escape(opts.outro)}</p>` : ""}`,
  );
  const text = `${opts.title}\n\n${opts.intro}\n\n${opts.actionLabel}: ${opts.actionUrl}\n\n${opts.outro ?? ""}`;
  return { html, text };
}

export function notificationEmail(title: string, body: string, link?: string) {
  const url = link ? (link.startsWith("http") ? link : `${siteConfig.url}${link}`) : undefined;
  return {
    html: layout(title, `<p>${escape(body)}</p>${url ? button(url, "Open in InfinityOps Studio") : ""}`),
    text: `${title}\n\n${body}${url ? `\n\n${url}` : ""}`,
  };
}

export { escape as escapeHtml };
