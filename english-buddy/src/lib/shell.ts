/**
 * Which shell the page is running in, from the browser's point of view.
 *
 * The server-side twin lives in `appclient.ts` (it reads request headers and
 * cannot be imported from a client component). Keep the two markers in sync:
 * the iOS wrapper and the native Android app both append theirs to the User
 * Agent, while the retired Android TWA could not brand the UA and is
 * recognised by the `eb_app` cookie the proxy pins on it.
 */
export const IOS_MARKER = "ExecLingoApp";
export const ANDROID_MARKER = "ExecLingoAndroid";
const APP_COOKIE = "eb_app=";

/**
 * Inside one of the store apps (iOS wrapper, native Android, legacy TWA).
 *
 * The native bridges are checked first because they are the one signal that
 * cannot go missing: the User Agent only reaches the server on a fresh
 * request, so a page still on screen from before an update — or served from
 * a webview cache — can carry the wrong answer, while `window.ExecLingoNative`
 * is injected into every document the app loads.
 */
export function inStoreApp(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as {
    ExecLingoNative?: unknown;
    webkit?: { messageHandlers?: { push?: unknown } };
  };
  if (w.ExecLingoNative || w.webkit?.messageHandlers?.push) return true;
  const ua = navigator.userAgent;
  if (ua.includes(IOS_MARKER) || ua.includes(ANDROID_MARKER)) return true;
  return document.cookie.includes(APP_COOKIE);
}

/**
 * Already running "as an app": a store app, or the site installed to the home
 * screen as a PWA. Install instructions make no sense in either case.
 */
export function installedAsApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    inStoreApp() ||
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}
