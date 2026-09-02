"use client";

import Link from "next/link";
import { useState } from "react";
import { EXTERNAL_URLS } from "@/lib/site";
import { useAccount } from "./AccountProvider";

export function AccountDeletionWorkspace() {
  const account = useAccount(); const [error,setError] = useState("");
  async function requestDeletion() {
    if (!window.confirm("Demander la suppression définitive du compte ELSATIA commun et de ses données associées ?")) return;
    setError(""); try { await account.requestAccountDeletion(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Demande impossible."); }
  }
  return <main className="account-page"><section className="shell account-card"><p className="eyebrow">COMPTE ELSATIA</p><h1>Supprimer mon compte</h1><p>La suppression concerne le compte ELSATIA commun et les données associées dans toutes les applications ELSATIA. Elle ne résilie pas automatiquement un abonnement Apple ou Google en cours.</p><p>ELSATIA confirme la demande, traite les obligations légales de conservation puis supprime les données non soumises à conservation. La demande est enregistrée sans supprimer immédiatement vos données.</p>{account.user ? <button className="danger" onClick={() => void requestDeletion()}>Demander la suppression définitive</button> : <><p>Connectez-vous d’abord afin que la demande soit rattachée au compte exact.</p><Link href="/compte">Se connecter</Link><p><a href="mailto:support@elsatia.fr?subject=Suppression%20de%20mon%20compte%20ELSATIA">Demander depuis le Web sans connexion</a></p></>}{error && <p role="alert" className="account-error">{error}</p>}<p><a href={EXTERNAL_URLS.privacy}>Politique de confidentialité</a> · <a href={EXTERNAL_URLS.support}>Assistance</a></p><Link href="/compte">Retour au compte</Link></section></main>;
}
