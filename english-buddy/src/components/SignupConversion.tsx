"use client";

import { useEffect } from "react";
import { reportSignupConversion } from "@/lib/conversions";

/**
 * Reports a registration that completed on the server.
 *
 * Signing up with Google or Apple ends in a redirect, so there is no moment
 * on the registration page where the browser could report it — by the time
 * the account exists, that page is gone. The callback marks the redirect
 * instead, and this reads the mark.
 *
 * The mark is stripped from the address bar straight after: a reload of a URL
 * that still said "signup" would report the same registration twice, and a
 * conversion counted twice is worse than one missed, because it makes the
 * cost per customer look better than it is.
 */
export function SignupConversion() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("signup") !== "1") return;
    reportSignupConversion();
    params.delete("signup");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, []);
  return null;
}
