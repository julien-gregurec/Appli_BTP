"use client";

import { useState } from "react";
import { nouvelleCle } from "@/lib/offline/contrat";

/**
 * Clé d'idempotence de la saisie en cours.
 *
 * Sur un chantier, le réseau flanche : la soumission part, la réponse se perd,
 * l'utilisateur réappuie. Sans cette clé, chaque tentative crée une réserve de plus,
 * et le chantier se retrouve avec des doublons qu'il faut ensuite annuler un par un.
 *
 * La clé est tirée UNE fois par montage du formulaire et reste identique à chaque
 * tentative : la base reconnaît alors le rejeu et renvoie la réserve déjà créée au lieu
 * d'en ajouter une (`reserves_creer`, index unique `reserves_origine_client_unique`).
 *
 * `useState(initialiseur)` garantit ce tirage unique : il n'est pas rejoué aux rendus
 * suivants, contrairement à un appel direct dans le corps du composant.
 */
export function CleIdempotence({ nom = "origine_client_id" }: { nom?: string }) {
  const [cle] = useState(nouvelleCle);
  return <input type="hidden" name={nom} value={cle} />;
}
