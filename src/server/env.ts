import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";
const isBuild = process.env.NEXT_PHASE === "phase-production-build";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  // 64 hex chars = 32 bytes for AES-256-GCM
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "ENCRYPTION_KEY must be 64 hex characters"),
  ALLOWED_ORIGINS: z.string().optional(),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  AI_DEFAULT_PROVIDER: z.enum(["openai", "anthropic", "google", "local"]).default("local"),
  AI_DEFAULT_MODEL: z.string().optional(),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["console", "smtp"]).default("console"),
  EMAIL_FROM: z.string().default("InfinityOps Studio <no-reply@infinityuniquers.com>"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),

  BILLING_PROVIDER: z.enum(["manual", "stripe", "razorpay"]).default("manual"),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_DIR: z.string().default("./storage"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),

  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const raw = { ...process.env };
  // During `next build` no runtime secrets exist; use inert placeholders so static analysis passes.
  if (isBuild) {
    raw.DATABASE_URL ??= "postgresql://build:build@localhost:5432/build";
    raw.AUTH_SECRET ??= "build-time-placeholder-secret-not-used-at-runtime";
    raw.ENCRYPTION_KEY ??= "0".repeat(64);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  if (isProd && !isBuild) {
    if (parsed.data.AUTH_SECRET.startsWith("dev-only")) throw new Error("AUTH_SECRET must be set to a strong secret in production");
    if (/^0+$/.test(parsed.data.ENCRYPTION_KEY)) throw new Error("ENCRYPTION_KEY must be set to a random key in production");
  }
  return parsed.data;
}

let cached: Env | undefined;
export function env(): Env {
  cached ??= load();
  return cached;
}
