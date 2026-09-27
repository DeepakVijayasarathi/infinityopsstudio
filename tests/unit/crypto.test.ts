import { describe, expect, it } from "vitest";
import { decrypt, encrypt, hmac, randomToken, safeEqual, sha256 } from "@/server/crypto";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, verifyTotp } from "@/server/auth/totp";
import { TOTP, Secret } from "otpauth";
import { hashPassword, passwordSchema, verifyPassword } from "@/server/auth/password";

describe("encryption", () => {
  it("round-trips with a fresh IV every time", () => {
    const a = encrypt("sk_live_secret");
    const b = encrypt("sk_live_secret");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("sk_live_secret");
  });

  it("rejects tampered ciphertext", () => {
    const payload = encrypt("hello");
    const tampered = payload.slice(0, -2) + (payload.endsWith("A") ? "BB" : "AA");
    expect(() => decrypt(tampered)).toThrow();
  });
});

describe("hashing helpers", () => {
  it("produces stable digests and random tokens", () => {
    expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hmac("x")).toBe(hmac("x"));
    expect(randomToken()).not.toBe(randomToken());
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("passwords", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("Correct-Horse-9");
    expect(await verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("enforces the password policy", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("Longenough123").success).toBe(true);
  });
});

describe("two-factor", () => {
  it("accepts the current TOTP code and rejects others", () => {
    const secret = generateTotpSecret();
    const code = new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
    expect(verifyTotp(secret, code)).toBe(true);
    expect(verifyTotp(secret, code === "000000" ? "111111" : "000000")).toBe(false);
  });

  it("issues unique recovery codes with matching hashes", () => {
    const { plain, hashed } = generateRecoveryCodes(8);
    expect(new Set(plain).size).toBe(8);
    expect(hashed).toHaveLength(8);
    expect(hashed[0]).toBe(sha256(normalizeRecoveryCode(plain[0]!)));
  });
});
