"use client";

import { useEffect } from "react";
import {
  type ChantierCache, memoriserChantiers, memoriserReserves, type ReserveCache,
} from "@/lib/offline/base-locale";
import { useAtelierOffline } from "./AtelierOffline";

/**
 * Semeur du cache de consultation.
 *
 * Les écrans sont rendus côté serveur ; ce composant recopie dans IndexedDB ce que la
 * page vient d'afficher, pour que la même information reste consultable après une perte
 * de réseau. Il n'ajoute aucune requête : il n'écrit que ce qui est DÉJÀ à l'écran, donc
 * déjà autorisé pour cet utilisateur et cette organisation.
 *
 * C'est ce qui fait que « consulter un chantier déjà chargé » fonctionne hors ligne, sans
 * jamais mettre en cache une page HTML susceptible d'être servie à une autre identité.
 */
export function SemeurCache({
  chantiers = [], reserves = [],
}: {
  chantiers?: Omit<ChantierCache, "majA">[];
  reserves?: Omit<ReserveCache, "majA">[];
}) {
  const { identite } = useAtelierOffline();

  useEffect(() => {
    if (!identite) return;
    if (chantiers.length === 0 && reserves.length === 0) return;
    (async () => {
      try {
        if (chantiers.length > 0) await memoriserChantiers(identite, chantiers);
        if (reserves.length > 0) await memoriserReserves(identite, reserves);
      } catch {
        // Stockage indisponible : la consultation hors-ligne sera vide, l'application
        // en ligne reste intacte. On ne fait pas échouer un écran pour un cache.
      }
    })();
  }, [identite, chantiers, reserves]);

  return null;
}
