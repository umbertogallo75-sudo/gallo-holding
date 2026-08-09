import { googleEnabled, appleEnabled } from "@/lib/oauth";
import { OAuthButtons } from "@/components/OAuthButtons";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return <LoginForm oauth={<OAuthButtons google={googleEnabled()} apple={appleEnabled()} />} />;
}
