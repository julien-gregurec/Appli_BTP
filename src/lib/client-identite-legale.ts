// ELSATIA-GP-CLIENT-LEGAL-FIELDS-V1 — lecture et validation de l'identité légale du client.
//
// Ce module vit hors de `src/app/actions/` DÉLIBÉRÉMENT. `clients.ts` porte la directive
// `"use server"`, et un module de Server Actions ne peut exporter que des fonctions
// asynchrones : y exposer un helper synchrone fait échouer le build Next.js. La logique de
// lecture et de validation n'a de toute façon rien de spécifique aux Server Actions — elle
// est pure, donc testable directement.

import { normalizeVatNumber, isValidVatNumber } from "@elsatia/client-contracts";

function champ(formData: FormData, nom: string): string | null {
  const v = String(formData.get(nom) ?? "").trim();
  return v === "" ? null : v;
}

// Quatre colonnes ajoutées par la migration 274 (`numero_tva`, `forme_juridique`,
// `adresse_complement`, `pays`) et une cinquième qui existait depuis 20260710000004 sans
// jamais être écrite : `raison_sociale`, la dénomination légale.
//
// La validation de forme n'est PAS réécrite ici. `@elsatia/client-contracts` porte la
// seule définition de « numéro de TVA valide » de l'écosystème — clé de contrôle française
// comprise — et c'est elle qui est appelée. La base pose des contraintes de forme
// (`clients_numero_tva_forme_check`, `clients_pays_forme_check`) comme dernier rempart,
// pas comme validateur métier.
//
// Tous ces champs sont FACULTATIFS. Une saisie vide reste `null` : on n'écrit jamais une
// valeur par défaut que personne n'a saisie. En particulier `pays` n'est pas rempli à "FR"
// à l'enregistrement — ce défaut est appliqué à la lecture, à l'impression, conformément au
// commentaire porté par la colonne.

type IdentiteLegale = {
  raison_sociale: string | null;
  numero_tva: string | null;
  forme_juridique: string | null;
  adresse_complement: string | null;
  pays: string | null;
};

export function lireIdentiteLegale(
  formData: FormData,
): { ok: true; valeurs: IdentiteLegale } | { ok: false; erreur: string } {
  const tva = normalizeVatNumber(champ(formData, "numero_tva"));
  if (tva !== null && !isValidVatNumber(tva)) {
    return { ok: false, erreur: "Le numéro de TVA intracommunautaire saisi n’est pas valide." };
  }

  const paysSaisi = champ(formData, "pays");
  const pays = paysSaisi === null ? null : paysSaisi.toUpperCase();
  if (pays !== null && !/^[A-Z]{2}$/.test(pays)) {
    return { ok: false, erreur: "Le pays doit être un code ISO à deux lettres (FR, BE, CH…)." };
  }

  return {
    ok: true,
    valeurs: {
      raison_sociale: champ(formData, "raison_sociale"),
      numero_tva: tva,
      forme_juridique: champ(formData, "forme_juridique"),
      adresse_complement: champ(formData, "adresse_complement"),
      pays,
    },
  };
}
