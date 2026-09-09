"use client";

import { useEffect } from "react";
import { purgerDonneesLocales } from "@/lib/mobile/purge-locale";

/**
 * Filet de sécurité : toute arrivée sur /login efface les données locales.
 *
 * Être sur cette page signifie qu'aucune session n'est active — que l'utilisateur se soit
 * déconnecté, que son jeton ait expiré, ou qu'il ait été révoqué à distance après la perte de
 * l'appareil. Dans les trois cas, ce qui reste sur le téléphone ne doit plus y être.
 *
 * Ne rend rien.
 */
export function PurgeLocaleAuLogin() {
  useEffect(() => { purgerDonneesLocales(); }, []);
  return null;
}
