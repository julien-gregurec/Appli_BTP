import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("server-only", () => ({}));

import {
  composerExport,
  entetesExport,
  ligneExport,
  nomFichierExport,
  PLAFOND_EXPORT,
  type LigneExport,
} from "@/lib/export-inventaire";
import { analyserNuancier, type EtatNuancier } from "@/lib/nuancier/contrat";

const NUANCIER: EtatNuancier = analyserNuancier({
  source: "Nuancier interne de recette",
  version: "2026-09",
  licence: "Jeu de recette ELSATIA",
  references: [{ code: "TEST-BLEU", nom: "Bleu chantier", hex: "#2E5B8A" }],
});
const ABSENT: EtatNuancier = { disponible: false, raison: "non_configure" };

const SEAU: LigneExport = {
  marque: "Peintures Martin", produit: "Acrylique mate", reference_produit: "AM-10",
  teinte_nom: "Bleu atelier", teinte_reference: "BA-2", couleur_hex: "#2E5B8A",
  mode_quantite: "volume", quantite_nominale: 10, quantite_restante: 7.5, unite: "l",
  pourcentage_restant: 75, etat: "ouvert", notes: "Reste de chantier",
  created_at: "2026-09-01T08:00:00Z", updated_at: "2026-09-08T17:00:00Z", archived_at: null,
  colors_emplacements: { nom: "Dépôt Nord" },
};

describe("colonnes", () => {
  it("n'émet les colonnes de nuancier que si un nuancier est chargé", () => {
    expect(entetesExport(ABSENT)).not.toContain("Référence proposée (non vérifiée)");
    expect(entetesExport(NUANCIER)).toContain("Référence proposée (non vérifiée)");
  });

  it("nomme la référence comme une proposition, jamais comme une identification", () => {
    const entetes = entetesExport(NUANCIER).join(" ");
    expect(entetes).toContain("proposée");
    expect(entetes).toContain("non vérifiée");
    expect(entetes).not.toMatch(/\bRAL exact|Référence certifiée|Correspondance exacte/i);
  });

  it("accompagne toute référence de son écart et de sa provenance", () => {
    const ligne = ligneExport(SEAU, NUANCIER);
    expect(ligne).toContain("TEST-BLEU");
    expect(ligne).toContain("0.00");
    expect(ligne).toContain("Nuancier interne de recette");
    expect(ligne).toContain("2026-09");
  });

  it("dit « aucune proposition » plutôt que de laisser une cellule vide", () => {
    const ligne = ligneExport({ ...SEAU, couleur_hex: null }, NUANCIER);
    expect(ligne).toContain("Aucune proposition");
  });

  it("n'invente aucune colonne de finition : elle n'existe pas en base", () => {
    expect(entetesExport(NUANCIER).join(" ")).not.toMatch(/finition/i);
  });
});

describe("échappement", () => {
  it("neutralise une valeur qu'un tableur interpréterait comme une formule", () => {
    const ligne = ligneExport({ ...SEAU, marque: "=1+1" }, ABSENT);
    expect(ligne.startsWith(`"'=1+1"`)).toBe(true);
  });

  it("échappe les guillemets et supporte le point-virgule dans une note", () => {
    const ligne = ligneExport({ ...SEAU, notes: 'Teinte "spéciale"; à revoir' }, ABSENT);
    expect(ligne).toContain('"Teinte ""spéciale""; à revoir"');
  });
});

describe("troncature", () => {
  it("ne dit rien quand l'export est complet", () => {
    const csv = composerExport([SEAU], NUANCIER, false);
    expect(csv).not.toContain("EXPORT INCOMPLET");
    expect(csv.split("\n")).toHaveLength(2);
  });

  it("s'annonce dans le fichier quand le plafond est atteint", () => {
    const csv = composerExport([SEAU], NUANCIER, true);
    const derniere = csv.trim().split("\n").at(-1)!;
    expect(derniere).toContain("EXPORT INCOMPLET");
    expect(derniere).toContain(String(PLAFOND_EXPORT));
    // L'avertissement occupe la première colonne et laisse les autres vides :
    // il ne peut pas être confondu avec un seau.
    expect(derniere.split(";").slice(1).every((c) => c === '""')).toBe(true);
  });

  it("s'annonce aussi dans le nom du fichier", () => {
    const date = new Date("2026-09-09T12:00:00Z");
    expect(nomFichierExport(date, false)).toBe("elsatia-colors-inventaire-2026-09-09.csv");
    expect(nomFichierExport(date, true)).toBe("elsatia-colors-inventaire-2026-09-09-partiel.csv");
  });

  it("le plafond est dix fois plus haut que la limite muette qu'il remplace", () => {
    expect(PLAFOND_EXPORT).toBe(50_000);
  });
});

describe("en-tête du fichier", () => {
  it("commence par un BOM UTF-8, sans quoi un tableur français casse les accents", () => {
    expect(composerExport([SEAU], ABSENT, false).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("route d'export", () => {
  const route = readFileSync(fileURLToPath(new URL("../app/api/export/inventaire/route.ts", import.meta.url)), "utf8");

  it("ne comporte plus de limite muette", () => {
    // Le commentaire de la route cite l'ancienne `.limit(5000)` pour expliquer
    // ce qui a été corrigé : on inspecte le code, pas la prose.
    const code = route.split("\n").filter((ligne) => !/^\s*(?:\*|\/\/|\/\*)/.test(ligne)).join("\n");
    expect(code).not.toMatch(/\.limit\(/);
  });

  it("pagine sur un ordre total, faute de quoi deux pages se recouvriraient", () => {
    expect(route).toContain('.order("marque").order("produit").order("id")');
    expect(route).toContain(".range(debut, fin)");
  });

  it("filtre sur l'organisation du contexte canonique", () => {
    expect(route).toContain('.eq("entreprise_id", contexte.entrepriseId)');
  });
});
