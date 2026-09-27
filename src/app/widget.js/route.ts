import { WIDGET_SCRIPT } from "@/server/widget-script";

// The embeddable website script (tracking, forms → leads, AI chat). Cached briefly so updates roll out fast.
export function GET() {
  return new Response(WIDGET_SCRIPT, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
    },
  });
}
