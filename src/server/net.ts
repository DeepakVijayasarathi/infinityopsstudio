import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { badRequest } from "./errors";

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIPv4(v.slice(7));
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/** SSRF guard: only http(s) URLs that resolve to public addresses. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  } catch {
    throw badRequest("Enter a valid website URL");
  }
  if (!["http:", "https:"].includes(url.protocol)) throw badRequest("Only http and https URLs are supported");
  if (url.username || url.password) throw badRequest("URLs with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw badRequest("Private addresses are not allowed");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw badRequest(`Could not resolve ${host}`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw badRequest("Private addresses are not allowed");
  return url;
}

/** Fetch with SSRF checks on every redirect hop. */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 4): Promise<{ res: Response; url: URL }> {
  let url = await assertPublicUrl(raw);
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(url, { ...init, redirect: "manual", signal: init.signal ?? AbortSignal.timeout(15_000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    return { res, url };
  }
  throw badRequest("Too many redirects");
}
