import type { Client } from "@libsql/client";
import { embeddedShellOf } from "@/lib/appclient";
import { trackEvent } from "@/lib/analytics";
import { parseAttributionCookie, saveAttribution, type Attribution } from "@/lib/attribution";
import { db } from "@/lib/db";

export type RegistrationPlatform = "android" | "ios" | "web";

/** Metadata shared by every backend registration path. */
export function registrationEventMeta(request: Request, attribution: Attribution | null): Record<string, unknown> {
  const platform: RegistrationPlatform = embeddedShellOf(request) ?? "web";
  return {
    ...(attribution
      ? { src: attribution.source, medium: attribution.medium, campaign: attribution.campaign }
      : {}),
    platform,
  };
}

/** Records one newly-created account without allowing analytics to block signup. */
export async function recordRegistration(request: Request, userId: string, client: Client = db()): Promise<void> {
  const attribution = parseAttributionCookie(request.headers.get("cookie"));
  await trackEvent("register_done", {
    userId,
    visitorId: attribution?.visitorId ?? null,
    meta: registrationEventMeta(request, attribution),
  }, client);
  await saveAttribution(userId, attribution, client);
}
