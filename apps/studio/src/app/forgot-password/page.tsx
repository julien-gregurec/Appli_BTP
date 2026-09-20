import Link from "next/link";
import { requestPasswordReset } from "../actions";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  return (
    <main id="main" className="auth">
      <div className="brand">
        ELSATIA<span>Studio.</span>
      </div>
      <h1>Mot de passe oublié</h1>
      <p>
        Indiquez l’email de votre compte. Si un compte existe, vous recevrez un
        lien pour choisir un nouveau mot de passe.
      </p>
      <Notice message={params.error} />
      {params.notice === "sent" && (
        <p role="status" className="notice">
          Si un compte existe pour cet email, un lien de réinitialisation vient
          d’être envoyé. Pensez à vérifier vos courriers indésirables.
        </p>
      )}
      <form action={requestPasswordReset}>
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
        <Submit>Envoyer le lien</Submit>
      </form>
      <p>
        <Link href="/login">Retour à la connexion</Link>
      </p>
    </main>
  );
}
