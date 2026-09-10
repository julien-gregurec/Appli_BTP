"use client";

import { useEffect } from "react";
import { ecouterPurgeAutresOnglets, purgerAutresEntreprises } from "@/lib/mobile/purge-locale";

/**
 * Gardien des données locales, monté une fois dans le shell authentifié.
 *
 * Deux responsabilités, toutes deux issues de la réserve R4 :
 *
 * 1. OBÉIR À UNE PURGE DÉCIDÉE AILLEURS. Un onglet oublié ouvert sur un chantier tenait la
 *    base IndexedDB ouverte ; la déconnexion faite dans un autre onglet ne pouvait pas la
 *    supprimer. Prévenu par le canal de diffusion, cet onglet se renvoie à la connexion —
 *    ses connexions se ferment d'elles-mêmes sur `versionchange`.
 *
 * 2. PURGER AU CHANGEMENT D'ENTREPRISE. Le nom de chaque base porte l'entreprise : celle d'une
 *    autre entreprise n'est donc jamais LUE par erreur. Mais elle reste sur l'appareil. Un
 *    intérimaire passé chez un autre client garderait sur son téléphone les plans et les notes
 *    du précédent. À l'ouverture sous une entreprise, les bases de ce même utilisateur sous
 *    toute AUTRE entreprise sont supprimées.
 *
 * Ne rend rien.
 */
export function GardienDonneesLocales({ entrepriseId, utilisateurId }: { entrepriseId: string; utilisateurId: string }) {
  useEffect(() => ecouterPurgeAutresOnglets(), []);
  useEffect(() => {
    void purgerAutresEntreprises(entrepriseId, utilisateurId).catch(() => undefined);
  }, [entrepriseId, utilisateurId]);
  return null;
}
