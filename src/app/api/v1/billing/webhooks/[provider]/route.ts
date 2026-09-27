import { NextResponse, type NextRequest } from "next/server";
import { AppError } from "@/server/errors";
import { logger } from "@/server/logger";
import { handleBillingWebhook } from "@/server/billing/service";

export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!["stripe", "razorpay"].includes(provider)) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const raw = await req.text();
  try {
    const type = await handleBillingWebhook(provider, raw, req.headers);
    return NextResponse.json({ received: true, type });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    logger.error("Billing webhook failed", { err, provider });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
