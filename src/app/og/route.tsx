import { ImageResponse } from "next/og";
import { MARK_ARROW_HEAD, MARK_ARROW_SHAFT, MARK_LOOP, MARK_STOPS, MARK_VIEWBOX } from "@/lib/brand";

export const runtime = "edge";

// Dynamic Open Graph image: /og?title=...
export function GET(req: Request) {
  const title = (new URL(req.url).searchParams.get("title") ?? "Your AI marketing operations team").slice(0, 110);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "linear-gradient(135deg, #070b1f 0%, #0d1b4d 55%, #2a0f63 100%)", color: "white", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 30, fontWeight: 700 }}>
          <svg width="101" height="56" viewBox={MARK_VIEWBOX}>
            <defs>
              <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="720" y2="200">
                {MARK_STOPS.map(([o, c]) => (
                  <stop key={o} offset={o} stopColor={c} />
                ))}
              </linearGradient>
            </defs>
            <circle cx="62" cy="58" r="52" fill="url(#g)" />
            <path d={MARK_LOOP} fill="none" stroke="url(#g)" strokeWidth="84" />
            <path d={MARK_ARROW_SHAFT} fill="none" stroke="url(#g)" strokeWidth="56" />
            <path d={MARK_ARROW_HEAD} fill="url(#g)" />
          </svg>
          <span style={{ display: "flex" }}>
            InfinityOps<span style={{ color: "#8fa8ff", marginLeft: 10 }}>Studio</span>
          </span>
        </div>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>{title}</div>
        <div style={{ fontSize: 26, color: "#b9ccff" }}>AI workers - Campaigns - Content - Automation - Analytics</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
