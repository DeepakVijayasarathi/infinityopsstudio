import { ImageResponse } from "next/og";

export const runtime = "edge";

// Dynamic Open Graph image: /og?title=...
export function GET(req: Request) {
  const title = (new URL(req.url).searchParams.get("title") ?? "Your AI marketing operations team").slice(0, 110);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #0c0e14 0%, #1e1b4b 55%, #0c4a6e 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <svg width="56" height="56" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#6366f1" />
            <path d="M20.5 24c-4.7 0-8 3.6-8 8s3.3 8 8 8c6.6 0 11.4-16 23-16 4.7 0 8 3.6 8 8s-3.3 8-8 8c-11.6 0-16.4-16-23-16Z" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
          </svg>
          Infinity Ops Studio
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>{title}</div>
        <div style={{ fontSize: 26, color: "#c7d2fe" }}>AI workers - Campaigns - Content - Automation - Analytics</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
