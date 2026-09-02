import { onceKey, sendMarketing } from "./send";
import { welcomeTrial } from "./templates";

/**
 * The welcome email, for whichever door somebody came in through.
 *
 * It used to be sent from the email-and-password registration route and
 * nowhere else, so everybody who signed in with Google or Apple got no
 * welcome, never saw the free-trial offer, and met the paywall as their first
 * communication from us. Three ways to create an account, one of which said
 * hello.
 *
 * Claimed once per account, so arriving twice — a retried callback, a second
 * sign-in treated as new — cannot write to somebody twice.
 */
export async function sendWelcome(userId: string, email: string | null, name: string | null): Promise<void> {
  try {
    await sendMarketing({
      userId,
      email,
      kind: "welcome_trial",
      claimKey: onceKey(userId, "welcome_trial"),
      message: welcomeTrial(userId, name),
    });
  } catch {
    // A greeting must never be the reason a sign-in fails.
  }
}
