import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { connexionAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { cheminInterneSur } from "@/lib/redirection-sure";
import { messageConfirmationConnexion, messageErreurConnexion } from "@/lib/messages-auth";
import { urlCompteElsatia } from "@/lib/compte-elsatia";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  // Aucun texte reçu par l’URL n’est rendu : seuls des codes connus le sont.
  const error = messageErreurConnexion(params.error);
  const message = messageConfirmationConnexion(params.message);
  const suivant = cheminInterneSur(params.next);
  const compteUrl = urlCompteElsatia();

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>La couleur,<br/>maîtrisée.</h1>
          <p>Gestion intelligente des stocks et des teintes de peinture, pensée pour les équipes qui travaillent sur le terrain.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <form className="auth-card" action={connexionAction}>
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Compte ELSATIA commun</span>
          <h2>Ravi de vous revoir</h2>
          <p>Utilisez les mêmes identifiants que pour les autres applications ELSATIA. Aucun second compte n’est nécessaire.</p>
          {error && <div className="form-message">{error}</div>}
          {message && <div className="form-message success">{message}</div>}
          <input type="hidden" name="next" value={suivant}/>
          <label>Adresse email<input name="email" type="email" autoComplete="email" required placeholder="vous@entreprise.fr"/></label>
          <label>Mot de passe<input name="password" type="password" autoComplete="current-password" required placeholder="••••••••"/></label>
          <button className="primary-button" type="submit">Se connecter à Colors</button>
          <p className="auth-link"><Link href="/mot-de-passe-oublie">Mot de passe oublié ?</Link></p>
          <p className="auth-foot">L’accès nécessite un droit Colors actif pour votre organisation et une habilitation individuelle. Les sessions de cette application restent isolées sur son domaine.</p>
          {/*
            Colors n’ouvre aucun compte : l’identité ELSATIA naît sur Gestion Pro et
            l’habilitation Colors est accordée par l’organisation. Un formulaire
            d’inscription ici mènerait à un compte sans accès, donc à un refus. On
            dit ce qui est vrai et on renvoie à l’endroit qui peut agir.
          */}
          <p className="auth-foot no-account">
            Pas encore d’accès&nbsp;? Colors est ouvert sur habilitation de votre organisation pendant la phase pilote.
            {" "}
            <a href={compteUrl}>Ouvrir le compte ELSATIA</a> pour demander l’accès à un administrateur.
          </p>
        </form>
      </section>
    </div>
  );
}
