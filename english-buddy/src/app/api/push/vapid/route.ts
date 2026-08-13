import { NextResponse } from "next/server";
import { apnsConfigured } from "@/lib/push/apns";

/**
 * Serves the Web Push public key at runtime. The client normally gets it
 * inlined at build time (NEXT_PUBLIC_*), but if the build ran without the
 * variable the browser bundle would be stuck keyless forever — this endpoint
 * is the fallback that always reflects the server's current configuration.
 */
export async function GET() {
  return NextResponse.json({
    key: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null,
    // Presence flag only (no secrets): lets us check the APNs setup remotely.
    apns: apnsConfigured(),
  });
}
