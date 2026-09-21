"use client";

import { useState } from "react";
import { deconnexionAction } from "@/app/actions";
import { purgerSession } from "@/lib/offline/base-locale";
import { lireIdentiteLocale, oublierIdentiteLocale } from "@/lib/offline/identite-locale";

/**
 * Déconnexion — et purge locale associée.
 *
 * Se déconnecter ne doit rien laisser de consultable : le cache de lecture (chantiers,
 * réserves) est effacé, le pointeur d'identité est oublié, et le service worker reçoit
 * l'ordre de vider ses caches. Après ce geste, la coquille hors-ligne n'ouvre plus
 * aucune base — donc aucune donnée d'une organisation ne peut apparaître à la personne
 * qui se connectera ensuite sur le même appareil.
 *
 * La FILE, elle, n'est pas détruite. Supprimer un travail non transmis parce que la
 * session s'est fermée — ce qui arrive tout seul, sur un chantier, quand le jeton
 * expire — ferait perdre des constats que leur auteur croit enregistrés. Elle reste
 * cloisonnée dans la base de son identité, que personne d'autre ne peut ouvrir, et le
 * serveur revérifie l'identité de chaque mutation avant de l'appliquer.
 *
 * Le cache du service worker n'est PAS vidé, et c'est délibéré : il ne contient que la
 * coquille hors-ligne — une page sans aucune donnée — et des ressources statiques. Le
 * purger ne retirerait donc rien de confidentiel, mais rendrait l'application incapable
 * de s'ouvrir sans réseau pour la session suivante, tant qu'un passage en ligne n'aurait
 * pas eu lieu. Ce qui protège réellement, c'est la purge du cache de lecture et l'oubli
 * du pointeur d'identité, tous deux effectués ci-dessus.
 *
 * La purge précède l'appel à l'action serveur, et le bouton n'intercepte PAS une
 * soumission de formulaire : `requestSubmit()` relancerait le même gestionnaire, dont le
 * `preventDefault` empêcherait indéfiniment l'envoi — la purge aurait lieu, jamais la
 * déconnexion.
 */
export function BoutonDeconnexion() {
  const [enCours, setEnCours] = useState(false);

  async function purgerPuisPartir() {
    if (enCours) return;
    setEnCours(true);
    try {
      const identite = lireIdentiteLocale();
      try {
        if (identite) await purgerSession(identite, { viderFile: false });
      } catch { /* base illisible : la déconnexion doit aboutir malgré tout */ }
      oublierIdentiteLocale();
    } finally {
      // L'action serveur redirige vers /login : c'est elle qui clôt réellement la session.
      await deconnexionAction();
    }
  }

  return (
    <button
      type="button"
      className="bouton secondaire"
      onClick={() => void purgerPuisPartir()}
      style={{ color: "#fff", borderColor: "#3a5a57", minHeight: 32, padding: "0 10px", marginTop: 4, fontSize: 13 }}
    >
      Se déconnecter
    </button>
  );
}
