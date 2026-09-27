import { Secret, TOTP } from "otpauth";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { sha256 } from "../crypto";
import { siteConfig } from "@/config/site";

function totpFor(secretBase32: string, label: string) {
  return new TOTP({
    issuer: siteConfig.name,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secretBase32),
  });
}

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export async function totpQrDataUrl(secretBase32: string, email: string): Promise<{ uri: string; qr: string }> {
  const uri = totpFor(secretBase32, email).toString();
  return { uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

export function verifyTotp(secretBase32: string, code: string): boolean {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return false;
  return totpFor(secretBase32, "verify").validate({ token: clean, window: 1 }) !== null;
}

export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain = Array.from({ length: count }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
  return { plain, hashed: plain.map((c) => sha256(c)) };
}

export function normalizeRecoveryCode(code: string): string {
  return code.trim().toUpperCase();
}
