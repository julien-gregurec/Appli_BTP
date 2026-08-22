import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// FINAL-FIX-P1-V1 : garde-fou anti-régression. Ces fichiers d'actions
// touchent des modules CORE commercialisables (onboarding, employés, achats,
// notes de frais, import, stock, flotte, prestations, messagerie, notifications
// push, support, devis, comptes-rendus, documents, rentabilité). Toute erreur
// Supabase/Postgres renvoyée à l'utilisateur doit passer par
// messageErreurUtilisateur — jamais error.message / error?.message brut.
const FICHIERS_CORE = [
  "src/app/actions/besoins.ts",
  "src/app/actions/employes.ts",
  "src/app/actions/commandes.ts",
  "src/app/actions/notes-frais.ts",
  "src/app/actions/import.ts",
  "src/app/actions/inventaires.ts",
  "src/app/actions/flotte.ts",
  "src/app/actions/prestations.ts",
  "src/app/actions/messagerie.ts",
  "src/app/actions/push.ts",
  "src/app/actions/support.ts",
  "src/app/actions/suivi-acces.ts",
  "src/app/actions/devis.ts",
  "src/app/actions/comptesRendus.ts",
  "src/app/actions/documents.ts",
  "src/app/actions/rentabilite.ts",
];

// Motif du bug réel corrigé par ce lot : error.message / err.message utilisé
// directement dans un `return`/`redirect(...)` renvoyé à l'utilisateur.
// Capturer le message brut dans une variable locale pour le seul usage des
// logs (journaliserAppelIA) reste légitime et n'est pas ce qui est détecté ici.
const MOTIF_BRUT = /(?:return|redirect)\([^)]*\berr(?:or)?\??\.message\b|return\s*\{[^}]*\berr(?:or)?\??\.message\b/;

describe("erreurs brutes — fichiers CORE (FINAL-FIX-P1-V1)", () => {
  it.each(FICHIERS_CORE)("%s importe messageErreurUtilisateur", (chemin) => {
    const contenu = readFileSync(chemin, "utf-8");
    expect(contenu).toContain("messageErreurUtilisateur");
  });

  it.each(FICHIERS_CORE)("%s ne renvoie jamais error.message brut à l'utilisateur", (chemin) => {
    const contenu = readFileSync(chemin, "utf-8");
    const lignesSuspectes = contenu
      .split("\n")
      .map((ligne, index) => ({ ligne, numero: index + 1 }))
      .filter(({ ligne }) => MOTIF_BRUT.test(ligne));
    expect(lignesSuspectes, `lignes suspectes : ${JSON.stringify(lignesSuspectes)}`).toEqual([]);
  });
});
