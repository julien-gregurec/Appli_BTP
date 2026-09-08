import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/Brand";
import { modifierMotDePasseAction } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import {
  CODE_LIEN_INVALIDE,
  LONGUEUR_MINIMALE_MOT_DE_PASSE,
  messageErreurConnexion,
} from "@/lib/messages-auth";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

/**
 * Écran hors périmètre `(colors)` : il ne dépend d'aucune habilitation métier.
 * Une personne dont l'accès Colors a été retiré doit pouvoir terminer une
 * réinitialisation déjà engagée. La seule autorisation exigée est la session
 * ouverte par le lien de récupération.
 */
export default async function NouveauMotDePassePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/mot-de-passe-oublie?error=${CODE_LIEN_INVALIDE}`);

  const error = messageErreurConnexion(params.error);

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>Un nouveau<br/>mot de passe.</h1>
          <p>Il vous servira pour toutes les applications ELSATIA rattachées à ce compte.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <form className="auth-card" action={modifierMotDePasseAction}>
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Compte ELSATIA commun</span>
          <h2>Choisissez votre mot de passe</h2>
          <p>Au moins {LONGUEUR_MINIMALE_MOT_DE_PASSE} caractères. Vous serez ensuite invité à vous reconnecter.</p>
          {error && <div className="form-message">{error}</div>}
          <label>Nouveau mot de passe<input name="password" type="password" autoComplete="new-password" required minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE} placeholder="••••••••••••"/></label>
          <label>Confirmation<input name="password_confirmation" type="password" autoComplete="new-password" required minLength={LONGUEUR_MINIMALE_MOT_DE_PASSE} placeholder="••••••••••••"/></label>
          <button className="primary-button" type="submit">Enregistrer le mot de passe</button>
          <p className="auth-foot">La session ouverte par le lien est refermée après modification : reconnectez-vous avec le nouveau mot de passe.</p>
        </form>
      </section>
    </div>
  );
}
