import { googleEnabled, appleEnabled } from "@/lib/oauth";
import { OAuthButtons } from "@/components/OAuthButtons";
import { RegisterForm } from "./RegisterForm";

export default function RegisterPage() {
  return <RegisterForm oauth={<OAuthButtons google={googleEnabled()} apple={appleEnabled()} />} />;
}
