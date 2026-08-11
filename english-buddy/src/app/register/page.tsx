import { isEmbeddedApp } from "@/lib/appclient";
import { googleEnabled, appleEnabled } from "@/lib/oauth";
import { OAuthButtons } from "@/components/OAuthButtons";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  // Store-app wrappers: email-only sign-up (see login/page.tsx).
  const embedded = await isEmbeddedApp();
  return <RegisterForm oauth={embedded ? null : <OAuthButtons google={googleEnabled()} apple={appleEnabled()} />} />;
}
