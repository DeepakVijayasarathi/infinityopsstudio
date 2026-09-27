import nodemailer from "nodemailer";
import { env } from "../env";
import { logger } from "../logger";

export type EmailMessage = { to: string; subject: string; html: string; text: string; headers?: Record<string, string> };

export interface EmailProvider {
  id: string;
  send(msg: EmailMessage): Promise<{ id: string }>;
}

const consoleProvider: EmailProvider = {
  id: "console",
  async send(msg) {
    logger.info("email.console", { to: msg.to, subject: msg.subject, text: msg.text.slice(0, 2000) });
    return { id: `console_${Date.now()}` };
  },
};

let smtp: EmailProvider | undefined;
function smtpProvider(): EmailProvider {
  if (smtp) return smtp;
  const e = env();
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT ?? 587,
    secure: (e.SMTP_PORT ?? 587) === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  smtp = {
    id: "smtp",
    async send(msg) {
      const info = await transport.sendMail({ from: e.EMAIL_FROM, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
      return { id: info.messageId };
    },
  };
  return smtp;
}

/** Email provider abstraction: add providers (SES, Postmark, Resend…) here without touching callers. */
export function emailProvider(): EmailProvider {
  return env().EMAIL_PROVIDER === "smtp" ? smtpProvider() : consoleProvider;
}

export async function sendEmail(msg: EmailMessage) {
  return emailProvider().send(msg);
}

/** Build a provider from a workspace's own SMTP integration (falls back to the platform provider). */
export function smtpFromCredentials(config: Record<string, string>, credentials: Record<string, string>): EmailProvider {
  const port = Number(config.port || 587);
  const transport = nodemailer.createTransport({
    host: config.host,
    port,
    secure: port === 465,
    auth: config.username ? { user: config.username, pass: credentials.password } : undefined,
  });
  return {
    id: "workspace-smtp",
    async send(msg) {
      const info = await transport.sendMail({ from: config.fromEmail, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers });
      return { id: info.messageId };
    },
  };
}
