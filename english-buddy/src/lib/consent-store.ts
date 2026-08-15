import { readConsent, type ConsentChoice } from "@/lib/consent";

/**
 * The recorded consent choice, exposed as an external store.
 *
 * A cookie is state that lives outside React and can only be read in the
 * browser, which is exactly what useSyncExternalStore is for: the banner and
 * the withdraw control both read the same snapshot, and a choice made in one
 * is seen immediately by the other without either holding its own copy.
 */

export type ConsentState = ConsentChoice | "unknown" | "ssr";

let listeners: Array<() => void> = [];

export function subscribeConsent(callback: () => void): () => void {
  listeners = [...listeners, callback];
  return () => {
    listeners = listeners.filter((listener) => listener !== callback);
  };
}

export function consentSnapshot(): ConsentState {
  return readConsent(document.cookie) ?? "unknown";
}

/** On the server nothing is known, so every consent-dependent view renders empty. */
export function consentServerSnapshot(): ConsentState {
  return "ssr";
}

export function notifyConsentChanged(): void {
  for (const listener of listeners) listener();
}
