"use client";

import { useCallback, useState } from "react";
import { nouvelleCle, type TypeMutation } from "@/lib/mobile/offline/contrat";
import { inscrireMutation, ouvrirBase, type IdentiteBase } from "@/lib/mobile/offline/base-locale";

/**
 * Dépose une mutation dans la file locale quand le réseau manque.
 *
 * ── Ce que ce module résout ─────────────────────────────────────────────────────────────
 *
 * La file hors-ligne existait de bout en bout — contrat, base locale, synchronisation, route
 * de rejeu, écran d'état — mais RIEN N'Y ENTRAIT : aucun écran ne déposait de mutation. Le
 * pointage passait par un Server Action, qui échoue sans réseau et laisse le salarié devant
 * une page d'erreur, sa saisie perdue. Le moteur était livré, la pédale n'était pas branchée.
 *
 * ── Pourquoi le chemin EN LIGNE reste inchangé ──────────────────────────────────────────
 *
 * Quand le réseau est là, on laisse le formulaire partir normalement vers le Server Action.
 * Ce n'est pas de la prudence : c'est une propriété métier. En ligne, l'heure d'arrivée est
 * posée par l'HORLOGE DU SERVEUR, que l'appareil ne peut pas falsifier — c'est ce qui donne
 * sa valeur au pointage GPS comme preuve. Router systématiquement par la file remplacerait
 * cette horloge par celle du téléphone, et affaiblirait le contrôle pour tout le monde afin
 * de servir le cas minoritaire du sous-sol.
 *
 * Hors réseau, l'horloge de l'appareil est la seule disponible. L'écart entre elle et
 * `created_at`, posé par le serveur au rejeu, reste visible et mesurable.
 */

export type ResultatEnfilement =
  | { etat: "enfile"; id: string }
  | { etat: "impossible"; motif: string };

export function useEnfilerHorsLigne(identite: IdentiteBase | null) {
  const [dernier, setDernier] = useState<ResultatEnfilement | null>(null);

  const enfiler = useCallback(
    async (type: TypeMutation, payload: Record<string, unknown>): Promise<ResultatEnfilement> => {
      if (!identite?.entrepriseId || !identite?.utilisateurId) {
        // Sans identité complète, on n'écrit RIEN. Une file « anonyme » serait partagée par
        // tous les comptes de l'appareil — exactement ce que l'isolation locale interdit.
        const echec: ResultatEnfilement = { etat: "impossible", motif: "Identité incomplète." };
        setDernier(echec);
        return echec;
      }

      const base = await ouvrirBase(identite);
      if (!base) {
        // Stockage local indisponible (navigation privée, réglage du navigateur). On le dit
        // franchement plutôt que de laisser croire que la saisie est conservée.
        const echec: ResultatEnfilement = {
          etat: "impossible",
          motif: "Le stockage local n’est pas disponible sur cet appareil.",
        };
        setDernier(echec);
        return echec;
      }

      try {
        // L'identifiant est produit ICI et sert de clé primaire de la ligne créée au rejeu :
        // c'est ce qui rend le renvoi sans effet plutôt que dupliquant.
        const id = nouvelleCle();
        await inscrireMutation(base, {
          id,
          type,
          entrepriseId: identite.entrepriseId,
          utilisateurId: identite.utilisateurId,
          capteA: Date.now(),
          etat: "en_attente",
          tentatives: 0,
          version: 1,
          payload,
        });
        const succes: ResultatEnfilement = { etat: "enfile", id };
        setDernier(succes);
        return succes;
      } finally {
        base.close();
      }
    },
    [identite?.entrepriseId, identite?.utilisateurId],
  );

  return { enfiler, dernier };
}
