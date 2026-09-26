"use client";

import Link from "next/link";
import { useState } from "react";
import { EXTERNAL_URLS } from "@/lib/site";
import { useAccount } from "./AccountProvider";

/*
 * Écran de suppression du compte ELSATIA commun.
 *
 * Deux exigences de Store se croisent ici, et elles tirent dans le même sens :
 *
 * 1. l'écran doit être atteignable, ce qu'assure la route publique `/suppression-compte` ;
 * 2. il ne doit RIEN promettre qu'il ne fasse. La RPC `tools_demander_suppression_compte`
 *    enregistre une demande — elle n'efface rien — et le texte le dit sans détour.
 *
 * Le piège corrigé ici est ailleurs. `requestAccountDeletion()` déconnecte l'utilisateur dès que
 * la demande est enregistrée, ce qui est correct : la session ne doit pas survivre à la demande.
 * Mais l'écran se contentait de suivre `account.user`, qui repassait à `null` : l'utilisateur
 * cliquait « Demander la suppression », et voyait apparaître « Connectez-vous d'abord ». Aucune
 * confirmation, et un message qui suggérait l'échec exact de ce qui venait de réussir. Un
 * relecteur Apple ou Google qui teste ce parcours en conclurait que la suppression ne marche pas.
 *
 * L'état `submitted` est donc tenu localement et l'emporte sur l'état de session, précisément
 * parce que la déconnexion est une CONSÉQUENCE du succès et non un retour en arrière.
 */
export function AccountDeletionWorkspace() {
  const account = useAccount();
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);

  async function requestDeletion() {
    if (!window.confirm("Demander la suppression définitive du compte ELSATIA commun et de ses données associées ?")) return;
    setError("");
    setPending(true);
    try {
      await account.requestAccountDeletion();
      setSubmitted(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Demande impossible.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="account-page">
      <section className="shell account-card">
        <p className="eyebrow">COMPTE ELSATIA</p>
        <h1>Supprimer mon compte</h1>
        <p>
          La suppression concerne le compte ELSATIA commun et les données associées dans toutes les
          applications ELSATIA. Elle ne résilie pas automatiquement un abonnement Apple ou Google en cours.
        </p>
        <p>
          ELSATIA confirme la demande, traite les obligations légales de conservation puis supprime les
          données non soumises à conservation. La demande est enregistrée sans supprimer immédiatement vos données.
        </p>

        {submitted ? (
          <>
            {/*
              * `role="status"` et non `role="alert"` : c'est une confirmation, pas une erreur, et
              * les lecteurs d'écran doivent l'annoncer sans interrompre.
              */}
            <p role="status" className="account-success">
              Demande de suppression enregistrée. Vous avez été déconnecté de cet appareil.
            </p>
            <p>
              ELSATIA traite la demande, puis supprime les données qui ne sont pas soumises à une obligation
              légale de conservation. Vous serez informé par e-mail lorsque le traitement sera terminé.
            </p>
            <p>
              Un abonnement Tools Pro souscrit dans l’App Store ou sur Google Play reste actif tant que vous ne
              le résiliez pas vous-même, depuis les réglages d’abonnement de votre compte Apple ou Google.
            </p>
            <p>
              <a href={EXTERNAL_URLS.support}>Contacter l’assistance</a> pour suivre ou annuler cette demande.
            </p>
          </>
        ) : account.user ? (
          <button className="danger" onClick={() => void requestDeletion()} disabled={pending}>
            {pending ? "Enregistrement…" : "Demander la suppression définitive"}
          </button>
        ) : (
          <>
            <p>Connectez-vous d’abord afin que la demande soit rattachée au compte exact.</p>
            <Link href="/compte">Se connecter</Link>
            <p>
              <a href="mailto:support@elsatia.fr?subject=Suppression%20de%20mon%20compte%20ELSATIA">
                Demander depuis le Web sans connexion
              </a>
            </p>
          </>
        )}

        {error && <p role="alert" className="account-error">{error}</p>}
        <p>
          <a href={EXTERNAL_URLS.privacy}>Politique de confidentialité</a> ·{" "}
          <a href={EXTERNAL_URLS.support}>Assistance</a>
        </p>
        <Link href="/compte">Retour au compte</Link>
      </section>
    </main>
  );
}
