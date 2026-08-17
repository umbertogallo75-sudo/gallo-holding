/**
 * Pages a visitor can reach before having an account.
 *
 * This list used to live inside the splash screen, which meant that whoever
 * added a public page had to know the splash existed in order to not break it
 * — and that is exactly what went wrong when the campaign landing page was
 * added and every advertised visitor met a tap-to-start gate instead of the
 * page they had been promised.
 *
 * It now sits on its own because two things need the same answer: the splash,
 * which must not cover a public page, and the traffic counter, which must
 * count public pages and stay out of the signed-in app.
 */
const PUBLIC_PAGES = new Set([
  "/",
  "/inglese-lavoro",
  "/scarica",
  "/aziende",
  "/partner",
  "/register",
  "/login",
  "/forgot",
  "/reset",
  "/privacy",
  "/cookie",
  "/termini",
  "/elimina-account",
]);

export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.has(pathname) || pathname.startsWith("/reset/") || pathname.startsWith("/r/");
}

/**
 * The path as it should be recorded: the known public routes as themselves,
 * and the two parameterised ones collapsed to a shape, so a thousand referral
 * codes do not become a thousand rows nobody can read.
 */
export function trackablePath(pathname: string): string | null {
  if (PUBLIC_PAGES.has(pathname)) return pathname;
  if (pathname.startsWith("/reset/")) return "/reset/:token";
  if (pathname.startsWith("/r/")) return "/r/:code";
  return null;
}
