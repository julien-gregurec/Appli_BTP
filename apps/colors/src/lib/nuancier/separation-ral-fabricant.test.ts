import { describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("server-only", () => ({}));

import { analyserNuancier, type EtatNuancier } from "@/lib/nuancier/contrat";
import { FORMAT_RAL, natureReference, proposerReference } from "@/lib/nuancier/correspondance";
import { entetesExport, ligneExport, type LigneExport } from "@/lib/export-inventaire";

/**
 * Décision D1 — les références RAL et les références fabricants sont séparées.
 *
 * `colors_seaux.ral_approxime` est strictement réservé au format `RAL 0000`.
 * Une référence fabricant ne doit jamais y être écrite, ni présentée comme une
 * référence RAL, ni déguisée en RAL. Ces huit démonstrations couvrent le chemin
 * complet : chargement, proposition, affichage, confirmation, écriture, journal
 * et export.
 */

const NUANCIER_RAL: EtatNuancier = analyserNuancier({
  source: "Référentiel RAL de recette",
  version: "recette-2026-09",
  licence: "Jeu de recette interne, aucune valeur colorimétrique",
  referentiel: "ral",
  references: [{ code: "RAL 9010", nom: null, hex: "#F2EFEA" }],
});

const NUANCIER_FABRICANT: EtatNuancier = analyserNuancier({
  source: "Peintures Recette",
  version: "2026-09",
  licence: "Communiqué par le fournisseur",
  referentiel: "fabricant",
  references: [{ code: "PR-1024", nom: "Bleu chantier", hex: "#2E5B8A" }],
});

/** Le piège : un nuancier fabricant qui nomme sa teinte comme un RAL. */
const NUANCIER_FABRICANT_DEGUISE: EtatNuancier = analyserNuancier({
  source: "Peintures Recette",
  version: "2026-09",
  licence: "Communiqué par le fournisseur",
  referentiel: "fabricant",
  references: [{ code: "RAL 9010", nom: "Notre blanc, proche du RAL", hex: "#F2EFEA" }],
});

const SEAU: LigneExport = {
  marque: "Peintures Recette", produit: "Acrylique", reference_produit: null,
  teinte_nom: null, teinte_reference: null, couleur_hex: "#F2EFEA",
  mode_quantite: "volume", quantite_nominale: 10, quantite_restante: 10, unite: "l",
  pourcentage_restant: 100, etat: "ferme", notes: null,
  created_at: "2026-09-10T08:00:00Z", updated_at: "2026-09-10T08:00:00Z", archived_at: null,
  colors_emplacements: null,
};

describe("1. proposition RAL valide", () => {
  it("une référence du référentiel RAL au bon format est proposée et retenable", () => {
    const resultat = proposerReference("#F2EFEA", NUANCIER_RAL);
    expect(resultat).toMatchObject({ statut: "proposition", code: "RAL 9010", nature: "ral", persistable: true });
  });
});

describe("2. confirmation RAL valide", () => {
  it("le format accepté par l'application est exactement celui du schéma", () => {
    const contrainte = readFileSync(
      fileURLToPath(new URL("../../../../../supabase/migrations/20260909000281_colors_finition_reference_nuancier_v15.sql", import.meta.url)),
      "utf8",
    );
    // La RPC et l'application doivent refuser la même chose : deux expressions
    // divergentes produiraient un bouton qui échoue à l'enregistrement.
    expect(contrainte).toContain("'^RAL [0-9]{4}$'");
    expect(FORMAT_RAL.source).toBe("^RAL [0-9]{4}$");
  });

  it("l'action serveur laisse passer une référence RAL", () => {
    const action = readFileSync(fileURLToPath(new URL("../../app/actions-metier.ts", import.meta.url)), "utf8");
    expect(action).toContain("FORMAT_RAL.test(reference)");
    expect(action).toContain("colors_definir_reference_nuancier");
  });
});

describe("3. refus d'un faux format RAL", () => {
  it.each(["RAL9010", "ral 9010", "RAL 901", "RAL 90101", "RAL  9010", "RAL 9010 "])(
    "« %s » n'est pas un format RAL", (candidat) => {
      expect(FORMAT_RAL.test(candidat)).toBe(false);
      expect(natureReference(candidat, "ral")).toBe("fabricant");
    },
  );
});

describe("4. proposition d'une référence fabricant", () => {
  it("est proposée, avec sa provenance, et signalée comme fabricant", () => {
    const resultat = proposerReference("#2E5B8A", NUANCIER_FABRICANT);
    expect(resultat).toMatchObject({
      statut: "proposition", code: "PR-1024", nature: "fabricant",
      persistable: false, source: "Peintures Recette", version: "2026-09",
    });
  });
});

describe("5. aucune écriture dans ral_approxime", () => {
  it("une référence fabricant n'est jamais persistable", () => {
    const resultat = proposerReference("#2E5B8A", NUANCIER_FABRICANT);
    expect(resultat.statut === "proposition" && resultat.persistable).toBe(false);
  });

  it("un nuancier fabricant qui NOMME sa teinte comme un RAL reste fabricant", () => {
    // Le piège central de D1 : la nature vient de la provenance, pas du code.
    const resultat = proposerReference("#F2EFEA", NUANCIER_FABRICANT_DEGUISE);
    expect(resultat).toMatchObject({ code: "RAL 9010", nature: "fabricant", persistable: false });
  });

  it("l'écran ne propose de retenir que ce qui est persistable", () => {
    const composant = readFileSync(fileURLToPath(new URL("../../components/CorrespondanceNuancier.tsx", import.meta.url)), "utf8");
    expect(composant).toContain('resultat.persistable && !reference.confirmee');
    expect(composant).toContain('data-test="reference-non-retenable"');
  });

  it("l'action serveur refuse une référence hors format avant tout appel à la base", () => {
    const action = readFileSync(fileURLToPath(new URL("../../app/actions-metier.ts", import.meta.url)), "utf8");
    const garde = action.indexOf("FORMAT_RAL.test(reference)");
    const appel = action.indexOf('rpc("colors_definir_reference_nuancier"');
    expect(garde).toBeGreaterThan(-1);
    expect(appel).toBeGreaterThan(garde);
  });
});

describe("6. modèle neutre : proposé, non appliqué", () => {
  const propose = readFileSync(
    fileURLToPath(new URL("../../../../../docs/migrations-proposees/colors-references-fabricants-neutres-v1.sql.proposed", import.meta.url)),
    "utf8",
  );

  it("porte les six informations exigées", () => {
    for (const colonne of ["fabricant", "nuancier", "nuancier_version", "reference_proposee", "reference_confirmee", "confirme_par", "confirme_at"]) {
      expect(propose, colonne).toContain(colonne);
    }
  });

  it("interdit explicitement le format RAL dans le modèle fabricant", () => {
    expect(propose).toContain("reference_proposee !~ '^RAL [0-9]{4}$'");
    expect(propose).toContain("reference_confirmee is null or reference_confirmee !~ '^RAL [0-9]{4}$'");
  });

  it("n'est pas dans le ledger : aucun numéro n'a été réservé", () => {
    const migrations = readdirSync(fileURLToPath(new URL("../../../../../supabase/migrations", import.meta.url)));
    expect(migrations.some((nom) => nom.includes("references_fabricants"))).toBe(false);
    expect(migrations).toHaveLength(279);
  });
});

describe("7. provenance et version conservées", () => {
  it("l'export porte le référentiel, la source et la version", () => {
    const entetes = entetesExport(NUANCIER_FABRICANT);
    expect(entetes).toContain("Référentiel");
    expect(entetes).toContain("Nuancier source");
    expect(entetes).toContain("Version du nuancier");

    const ligne = ligneExport(SEAU, NUANCIER_FABRICANT_DEGUISE);
    expect(ligne).toContain("Fabricant");
    expect(ligne).toContain("Peintures Recette");
    expect(ligne).toContain("2026-09");
  });

  it("un code en forme de RAL venu d'un fabricant est exporté comme fabricant", () => {
    // Sans cette colonne, « RAL 9010 » recopié dans un bon de commande se
    // lirait comme une norme alors qu'il vient d'un nuancier de fournisseur.
    const ligne = ligneExport(SEAU, NUANCIER_FABRICANT_DEGUISE);
    expect(ligne).toContain('"RAL 9010";"Fabricant"');
  });

  it("une référence du référentiel RAL est exportée comme RAL", () => {
    expect(ligneExport(SEAU, NUANCIER_RAL)).toContain('"RAL 9010";"RAL"');
  });
});

describe("8. aucune présentation comme mesure certifiée", () => {
  it("les intitulés d'export ne revendiquent aucune certitude", () => {
    const entetes = entetesExport(NUANCIER_RAL).join(" ");
    expect(entetes).toContain("non vérifiée");
    expect(entetes).not.toMatch(/certifi|exact|garanti|mesur/i);
  });

  it("l'écran dit que la couleur est déclarée et la référence proposée", () => {
    const composant = readFileSync(fileURLToPath(new URL("../../components/CorrespondanceNuancier.tsx", import.meta.url)), "utf8");
    expect(composant).toContain("pas mesurée");
    expect(composant).toContain("proposition de proximité");
    expect(composant).not.toMatch(/mesure colorim|correspondance exacte|référence certifiée/i);
  });

  it("le défaut du référentiel est « fabricant » : un nuancier muet n'est jamais normatif", () => {
    const muet = analyserNuancier({
      source: "Sans déclaration", version: "1", licence: "Interne",
      references: [{ code: "RAL 9010", hex: "#F2EFEA" }],
    });
    expect(muet.disponible && muet.referentiel).toBe("fabricant");
    expect(proposerReference("#F2EFEA", muet)).toMatchObject({ nature: "fabricant", persistable: false });
  });
});
