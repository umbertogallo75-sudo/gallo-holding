import { cookies, headers } from "next/headers";

/**
 * Detection of the native store-app wrappers. The iOS shell appends
 * "ExecLingoApp" to its User-Agent and the native Android app appends
 * "ExecLingoAndroid"; older TWA builds could not brand the UA, so they launch
 * on /home?app=twa and the proxy pins an "eb_app" cookie. Inside any shell the
 * site behaves as a reader app: no web pricing or checkout (Apple 3.1.1 / Play
 * payments policy) — accounts, free level check and corporate-code redemption
 * remain available. Each shell exposes its own purchase bridge, unlocked by
 * APPSTORE_IAP_UI (iOS) and PLAY_IAP_UI (Android).
 */
const APP_MARKER = "ExecLingoApp";          // iOS wrapper
const ANDROID_MARKER = "ExecLingoAndroid";  // native Android app
export const APP_COOKIE = "eb_app";         // Android TWA (legacy builds)

/** For server components / pages. */
export async function isEmbeddedApp(): Promise<boolean> {
  const [requestHeaders, requestCookies] = await Promise.all([headers(), cookies()]);
  const ua = requestHeaders.get("user-agent") ?? "";
  if (ua.includes(APP_MARKER) || ua.includes(ANDROID_MARKER)) return true;
  return requestCookies.has(APP_COOKIE);
}

/** For route handlers that already hold the Request. */
export function isEmbeddedRequest(request: Request): boolean {
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes(APP_MARKER) || ua.includes(ANDROID_MARKER)) return true;
  return new RegExp(`(?:^|;\\s*)${APP_COOKIE}=`).test(request.headers.get("cookie") ?? "");
}

export const EMBEDDED_PAYWALL_MESSAGE =
  "Il tuo account non ha un piano attivo. Se hai un codice aziendale, inseriscilo nella pagina Abbonamento del tuo profilo.";

/**
 * Android variant: no purchase UI there, so point locked users at the email
 * we sent them (a neutral "check your email" — no external-purchase steering,
 * which Play forbids).
 */
export const ANDROID_PAYWALL_MESSAGE =
  "Il tuo account non ha un piano attivo. Controlla la tua email: ti abbiamo scritto i passaggi per attivare l'accesso completo. Se hai un codice aziendale, inseriscilo nella pagina Abbonamento.";

/** Which store shell is talking to us, when it matters for messaging. */
export function embeddedShellOf(request: Request): "ios" | "android" | null {
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.includes(APP_MARKER)) return "ios";
  if (ua.includes(ANDROID_MARKER)) return "android";
  if (new RegExp(`(?:^|;\\s*)${APP_COOKIE}=`).test(request.headers.get("cookie") ?? "")) return "android";
  return null;
}
