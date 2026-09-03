/**
 * Explicit post-authentication destinations.
 *
 * The public `/` route is an institutional home and must not double as an
 * implicit application router: changing the marketing home must never alter
 * where a completed login or registration lands.
 */
export const LOGIN_SUCCESS_PATH = "/home";
export const PASSWORD_SIGNUP_SUCCESS_PATH = "/onboarding";

export function oauthSuccessPath(created: boolean): string {
  return created ? "/onboarding?signup=1" : LOGIN_SUCCESS_PATH;
}
