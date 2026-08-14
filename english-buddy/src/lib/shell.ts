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

/** Inside one of the store apps (iOS wrapper, native Android, legacy TWA). */
export function inStoreApp(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (ua.includes(IOS_MARKER) || ua.includes(ANDROID_MARKER)) return true;
  return typeof document !== "undefined" && document.cookie.includes(APP_COOKIE);
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
