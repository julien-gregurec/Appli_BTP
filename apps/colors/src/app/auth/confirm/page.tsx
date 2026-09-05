import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { confirmerRecuperationAction } from "@/app/actions";
import { jetonRecuperationSur, TYPE_RECUPERATION } from "@/lib/jeton-recuperation";

export const metadata: Metadata = { title: "Réinitialisation" };

/**
 * Page intermédiaire de récupération de mot de passe.
 *
 * Elle ne consomme rien au chargement : le jeton n'est vérifié qu'à la
 * soumission explicite du formulaire. Un lien à usage unique préchargé par un
 * client mail ou un scanner de sécurité ne fait ici qu'un GET inerte, et le
 * vrai clic de la personne trouve toujours le jeton disponible. C'est la même
 * mécanique que celle retenue pour Gestion Pro (`AUTH-RECOVERY-V1`).
 *
 * Aucune destination n'est acceptée par l'URL : la suite du parcours est une
 * constante de l'application, pas un paramètre.
 */
export default async function ConfirmerRecuperationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const jeton = jetonRecuperationSur(params.token_hash, params.type);

  return (
    <div className="public-page">
      <section className="public-art">
        <div className="art-content">
          <Brand />
          <h1>Presque<br/>terminé.</h1>
          <p>Confirmez que c’est bien vous qui ouvrez ce lien, puis choisissez votre nouveau mot de passe.</p>
          <div className="art-palette" aria-hidden="true"><span/><span/><span/></div>
        </div>
      </section>
      <section className="public-content">
        <div className="auth-card">
          <div className="mobile-public-brand"><Brand /></div>
          <span className="eyebrow">Compte ELSATIA commun</span>
          <h2>Réinitialisation du mot de passe</h2>
          {jeton ? (
            <>
              <p>Ce lien est à usage unique. Il n’est consommé qu’au moment où vous cliquez ci-dessous.</p>
              <form action={confirmerRecuperationAction}>
                <input type="hidden" name="token_hash" value={jeton}/>
                <input type="hidden" name="type" value={TYPE_RECUPERATION}/>
                <button className="primary-button" type="submit">Continuer vers le nouveau mot de passe</button>
              </form>
            </>
          ) : (
            <>
              <div className="form-message">
                Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.
              </div>
              <p className="auth-foot">
                <Link href="/mot-de-passe-oublie">Demander un nouveau lien</Link>
              </p>
            </>
          )}
          <p className="auth-foot">
            Le lien ne modifie que le mot de passe de votre compte ELSATIA commun : vos
            habilitations Colors restent inchangées.
          </p>
        </div>
      </section>
    </div>
  );
}
