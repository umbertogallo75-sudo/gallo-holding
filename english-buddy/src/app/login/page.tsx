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

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ oauth_error?: string }> }) {
  const { oauth_error } = await searchParams;
  const oauthError = oauth_error ? (OAUTH_ERRORS[oauth_error] ?? `Accesso non riuscito (codice: ${oauth_error}).`) : null;
  return <LoginForm oauth={<OAuthButtons google={googleEnabled()} apple={appleEnabled()} />} oauthError={oauthError} />;
}
