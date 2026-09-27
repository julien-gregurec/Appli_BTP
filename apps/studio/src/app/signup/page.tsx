import Link from "next/link";
import { signup } from "../actions";
import Notice from "../../components/Notice";
import Submit from "../../components/Submit";
import { redirect } from "next/navigation";
import { identityMode } from "../../lib/identity-policy";
export default async function Signup({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams; // rend la page dynamique : le mode est lu à l'exécution
  // Compte ELSATIA commun : le compte Studio naît au premier passage, jamais par inscription.
  if (identityMode() === "elsatia") redirect("/login");
  return (
    <main id="main" className="auth">
      <div className="brand">
        ELSATIA<span>Studio.</span>
      </div>
      <h1>Un espace à vous.</h1>
      <p>
        Un compte ELSATIA, un Studio personnel. Pour tous vos projets,
        professionnels ou personnels.
      </p>
      <Notice message={error} />
      <form action={signup}>
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
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={256}
          />
          <small>12 caractères minimum.</small>
        </label>
        <Submit>Créer mon compte</Submit>
      </form>
      <p>
        Déjà un compte ELSATIA ? <Link href="/login">Se connecter</Link>
      </p>
    </main>
  );
}
