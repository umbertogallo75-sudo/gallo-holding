import { headers } from "next/headers";

/**
 * Detection of the native store-app wrappers (iOS/Android WebView shells),
 * which append "ExecLingoApp" to their User-Agent. Inside those shells the
 * site must behave as a reader app: no purchase flows or pricing (Apple
 * guideline 3.1.1) — accounts, free level check and corporate-code
 * redemption remain available.
 */
const APP_MARKER = "ExecLingoApp";

/** For server components / pages. */
export async function isEmbeddedApp(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes(APP_MARKER);
}

/** For route handlers that already hold the Request. */
export function isEmbeddedRequest(request: Request): boolean {
  return (request.headers.get("user-agent") ?? "").includes(APP_MARKER);
}

export const EMBEDDED_PAYWALL_MESSAGE =
  "Il tuo account non ha un piano attivo. Se hai un codice aziendale, inseriscilo nella pagina Abbonamento del tuo profilo.";
