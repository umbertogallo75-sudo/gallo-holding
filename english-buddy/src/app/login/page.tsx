import { isEmbeddedApp } from "@/lib/appclient";
import { googleEnabled, appleEnabled } from "@/lib/oauth";
import { OAuthButtons } from "@/components/OAuthButtons";
import { LoginForm } from "./LoginForm";

const OAUTH_ERRORS: Record<string, string> = {
  state: "La sessione di accesso è scaduta: riprova.",
  exchange: "Il provider non ha accettato le credenziali dell'app (codice: exchange).",
  secret: "Configurazione Apple non valida sul server (codice: secret).",
  claims: "Risposta del provider non valida (codice: claims).",
  method: "Metodo non valido: riprova dal pulsante di accesso.",
  "not-configured": "Questo accesso non è ancora attivo.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ oauth_error?: string; attivata?: string }> }) {
  const { oauth_error, attivata } = await searchParams;
  const oauthError = oauth_error ? (OAUTH_ERRORS[oauth_error] ?? `Accesso non riuscito (codice: ${oauth_error}).`) : null;
  // Store-app wrappers: email/password only — Google forbids OAuth inside
  // embedded webviews and Apple's web flow is clunky there. With no social
  // login shown, Apple's Sign-in-with-Apple mandate (4.8) doesn't apply.
  const embedded = await isEmbeddedApp();
  return <LoginForm oauth={embedded ? null : <OAuthButtons google={googleEnabled()} apple={appleEnabled()} />} oauthError={oauthError} embedded={embedded} trialClaimed={attivata === "1"} />;
}
