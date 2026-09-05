import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { demanderReinitialisationAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { messageConfirmationConnexion, messageErreurConnexion } from "@/lib/messages-auth";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default async function MotDePasseOubliePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  // Aucun texte reçu par l’URL n’est rendu : seuls des codes connus le sont.
  const error = messageErreurConnexion(params.error);
  const message = messageConfirmationConnexion(params.message);

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>Reprenez<br/>la main.</h1>
          <p>Un lien de réinitialisation vous est envoyé sur l’adresse de votre compte ELSATIA commun.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <form className="auth-card" action={demanderReinitialisationAction}>
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Compte ELSATIA commun</span>
          <h2>Mot de passe oublié</h2>
          <p>Indiquez l’adresse email de votre compte ELSATIA. Si elle correspond à un compte, vous recevrez un lien de réinitialisation.</p>
          {error && <div className="form-message">{error}</div>}
          {message && <div className="form-message success">{message}</div>}
          <label>Adresse email<input name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr"/></label>
          <button className="primary-button" type="submit">Envoyer le lien</button>
          <p className="auth-foot"><Link href="/login">Revenir à la connexion</Link><br/>Le lien reçu est à usage unique et expire rapidement. Il ne modifie que le mot de passe : vos habilitations Colors restent inchangées.</p>
        </form>
      </section>
    </div>
  );
}
