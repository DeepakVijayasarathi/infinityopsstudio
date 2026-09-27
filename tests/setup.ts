import { vi } from "vitest";
import { cookieJar, headerBag } from "./helpers/next-headers";

// Test runs are self-contained: deterministic local AI, console email, inline jobs, no Redis.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://ios:ios@localhost:5432/infinityops_test?schema=public";
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.ENCRYPTION_KEY ??= "a1".repeat(32);
process.env.AI_DEFAULT_PROVIDER = "local";
process.env.EMAIL_PROVIDER = "console";
process.env.LOG_LEVEL = "error";
process.env.QUEUE_INLINE = "1";
process.env.QUEUE_INLINE_SYNC = "1";
process.env.STORAGE_LOCAL_DIR = "./.test-storage";
delete process.env.REDIS_URL;

// Server code reads cookies/headers from the request scope; tests use an in-memory stand-in.
vi.mock("next/headers", () => ({
  cookies: async () => cookieJar,
  headers: async () => headerBag,
}));
