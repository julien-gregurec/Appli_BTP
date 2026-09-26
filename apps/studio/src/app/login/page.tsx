import Link from "next/link";
import { login } from "../actions";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
import { safeStudioDestination } from "@elsatia/studio-domain";
import { identityMessage, identityMode } from "../../lib/identity-policy";
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    error_code?: string;
    notice?: string;
    next?: string;
  }>;
}) {
  const params = await searchParams;
  const next = safeStudioDestination(params.next);
  if (identityMode() === "elsatia")
    return (
      <main id="main" className="auth">
        <div className="brand">
          ELSATIA<span>Studio.</span>
        </div>
        <p className="eyebrow">BIENVENUE DANS VOTRE STUDIO</p>
        <h1>
          Vos histoires
          <br />
          commencent ici.
        </h1>
        <p>
          Studio utilise votre compte ELSATIA : aucun mot de passe de plus, aucune
          entreprise nécessaire.
        </p>
        <Notice message={identityMessage(params.error_code) ?? params.error} />
        <a
          className="button"
          href={`/auth/elsatia/start?next=${encodeURIComponent(next)}`}
        >
          Continuer avec mon compte ELSATIA
        </a>
      </main>
    );
  return (
    <main id="main" className="auth">
      <div className="brand">
        ELSATIA<span>Studio.</span>
      </div>
      <p className="eyebrow">BIENVENUE DANS VOTRE STUDIO</p>
      <h1>
        Vos histoires
        <br />
        commencent ici.
      </h1>
      <p>
        Connectez-vous avec votre compte ELSATIA. Aucune entreprise n’est
        nécessaire.
      </p>
      <Notice message={params.error} />
      {params.notice === "confirmation" && (
        <p role="status" className="notice">
          Si l’inscription peut être finalisée, un email de confirmation vous a
          été envoyé. Vous pouvez aussi utiliser votre compte ELSATIA existant.
        </p>
      )}
      <form action={login}>
        <input
          type="hidden"
          name="next"
          value={safeStudioDestination(params.next)}
        />
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
          />
        </label>
        <label>
          Mot de passe
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={256}
          />
        </label>
        <Submit>Se connecter</Submit>
      </form>
      <p>
        Première visite ? <Link href="/signup">Créer mon compte</Link>
      </p>
    </main>
  );
}
