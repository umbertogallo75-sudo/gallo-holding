import { cookies, headers } from "next/headers";

/**
 * Detection of the native store-app wrappers. The iOS shell appends
 * "ExecLingoApp" to its User-Agent; the Android TWA cannot alter the UA, so
 * it launches on /home?app=twa and the proxy pins an "eb_app" cookie. Inside
 * either shell the site behaves as a reader app: no purchase flows or
 * pricing (Apple 3.1.1 / Play payments policy) — accounts, free level check
 * and corporate-code redemption remain available. iOS additionally exposes
 * the StoreKit bridge, which unlocks the native plans when APPSTORE_IAP_UI
 * is on.
 */
const APP_MARKER = "ExecLingoApp";
export const APP_COOKIE = "eb_app";

/** For server components / pages. */
export async function isEmbeddedApp(): Promise<boolean> {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  if ((requestHeaders.get("user-agent") ?? "").includes(APP_MARKER)) return true;
  return requestCookies.has(APP_COOKIE);
}

/** For route handlers that already hold the Request. */
export function isEmbeddedRequest(request: Request): boolean {
  if ((request.headers.get("user-agent") ?? "").includes(APP_MARKER)) return true;
  return new RegExp(`(?:^|;\\s*)${APP_COOKIE}=`).test(request.headers.get("cookie") ?? "");
}

export const EMBEDDED_PAYWALL_MESSAGE =
  "Il tuo account non ha un piano attivo. Se hai un codice aziendale, inseriscilo nella pagina Abbonamento del tuo profilo.";
