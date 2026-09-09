import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { decisionOcr, RAISONS_OCR_INACTIF, VALEUR_ACTIVATION } from "@/lib/ocr/politique";
import { etatOcrColors, fournisseurOcrActif, fournisseursConnus } from "@/lib/ocr/fournisseurs";
import { champsAConfirmer, estRejet, resultatConfirme } from "@/lib/ocr/confirmation";
import type { PropositionOcrColors } from "@/lib/ocr-colors";

const CONNUS = ["prestataire-fictif"] as const;

describe("decisionOcr — refus par défaut", () => {
  it("reste inactif sans aucune configuration", () => {
    expect(decisionOcr({ actif: undefined, fournisseur: undefined, fournisseursConnus: CONNUS }))
      .toEqual({ actif: false, raison: "desactive" });
  });

  it("n'accepte que la valeur d'activation exacte", () => {
    for (const approchant of ["true", "1", "OUI ", "yes", "oui-mais", ""]) {
      const etat = decisionOcr({ actif: approchant, fournisseur: CONNUS[0], fournisseursConnus: CONNUS });
      if (approchant === "OUI ") expect(etat.actif).toBe(true);
      else expect(etat).toEqual({ actif: false, raison: "desactive" });
    }
    expect(VALEUR_ACTIVATION).toBe("oui");
  });

  it("refuse une activation sans prestataire nommé : le destinataire serait inconnu", () => {
    expect(decisionOcr({ actif: "oui", fournisseur: "  ", fournisseursConnus: CONNUS }))
      .toEqual({ actif: false, raison: "fournisseur_non_declare" });
  });

  it("refuse un prestataire que cette version n'implémente pas", () => {
    expect(decisionOcr({ actif: "oui", fournisseur: "prestataire-imaginaire", fournisseursConnus: CONNUS }))
      .toEqual({ actif: false, raison: "fournisseur_inconnu" });
  });

  it("refuse un prestataire déclaré sans décision d'exploitation", () => {
    expect(decisionOcr({ actif: undefined, fournisseur: CONNUS[0], fournisseursConnus: CONNUS }))
      .toEqual({ actif: false, raison: "desactive" });
  });

  it("n'active que si les deux déclarations convergent", () => {
    expect(decisionOcr({ actif: "oui", fournisseur: CONNUS[0], fournisseursConnus: CONNUS }))
      .toEqual({ actif: true, fournisseur: CONNUS[0] });
  });

  it("chaque raison d'inactivité est affichable", () => {
    for (const libelle of Object.values(RAISONS_OCR_INACTIF)) expect(libelle).toMatch(/\S/);
  });
});

describe("registre des prestataires", () => {
  it("est vide : aucun prestataire n'est contractualisé dans cette version", () => {
    expect(fournisseursConnus()).toEqual([]);
  });

  it("ne peut donc être activé par aucune configuration", () => {
    const etat = etatOcrColors({ COLORS_OCR_ACTIF: "oui", COLORS_OCR_FOURNISSEUR: "n-importe-lequel" });
    expect(etat).toEqual({ actif: false, raison: "fournisseur_inconnu" });
    expect(fournisseurOcrActif({ COLORS_OCR_ACTIF: "oui", COLORS_OCR_FOURNISSEUR: "n-importe-lequel" })).toBeNull();
  });

  it("est inactif sur un environnement vierge", () => {
    expect(etatOcrColors({})).toEqual({ actif: false, raison: "desactive" });
  });
});

describe("confirmation champ par champ", () => {
  const proposition: PropositionOcrColors = {
    statut: "a_confirmer",
    champs: {
      marque: { valeur: "Peintures Martin", confiance: 96 },
      produit: { valeur: "Acrylique mate", confiance: 71 },
      reference: { valeur: "   ", confiance: 12 },
      teinte: { valeur: "Bleu atelier", confiance: null },
    },
  };

  it("ne soumet à confirmation que les champs réellement proposés", () => {
    const champs = champsAConfirmer(proposition);
    expect(champs.map((c) => c.champ)).toEqual(["marque", "produit", "teinte"]);
    expect(champs[0].libelle).toBe("Marque");
    expect(champs[2].confiance).toBeNull();
  });

  it("n'écrit que ce qui a été explicitement accepté", () => {
    expect(resultatConfirme(proposition, ["marque"])).toEqual({ marque: "Peintures Martin" });
  });

  it("n'écrit rien quand rien n'est coché, et le traite comme un rejet", () => {
    const resultat = resultatConfirme(proposition, []);
    expect(resultat).toEqual({});
    expect(estRejet(resultat)).toBe(true);
  });

  it("ignore un champ accepté qui n'était pas proposé", () => {
    expect(resultatConfirme(proposition, ["reference", "volumeNominal"])).toEqual({});
  });
});

describe("analyserEtiquetteColors — le statut est imposé, pas reçu", () => {
  it("ramène toujours à « à confirmer », même si le prestataire annonce une confirmation", async () => {
    const { analyserEtiquetteColors } = await import("@/lib/ocr-colors");
    const fournisseur = { analyser: vi.fn().mockResolvedValue({ statut: "confirmee", champs: { marque: { valeur: "X", confiance: 100 } } }) };
    const resultat = await analyserEtiquetteColors(fournisseur, { mime: "image/jpeg", bytes: new Uint8Array([1]) });
    expect(resultat.statut).toBe("a_confirmer");
  });
});

describe("invariants d'exposition", () => {
  function sources(dossier: string): string[] {
    const racine = fileURLToPath(new URL(dossier, import.meta.url));
    const fichiers: string[] = [];
    for (const entree of readdirSync(racine)) {
      const chemin = join(racine, entree);
      if (statSync(chemin).isDirectory()) fichiers.push(...sources(`${dossier}/${entree}/`));
      else if (/\.(ts|tsx)$/.test(entree) && !entree.endsWith(".test.ts")) fichiers.push(chemin);
    }
    return fichiers;
  }

  it("aucune variable publique ne porte la configuration OCR", () => {
    for (const fichier of sources("../../")) {
      const contenu = readFileSync(fichier, "utf8");
      expect(contenu).not.toMatch(/NEXT_PUBLIC_[A-Z_]*OCR/);
    }
  });

  it("la route d'analyse décide de l'état avant de lire le corps de la requête", () => {
    const route = readFileSync(fileURLToPath(new URL("../../app/api/ocr/route.ts", import.meta.url)), "utf8");
    const positionEtat = route.indexOf("etatOcrColors()");
    const positionCorps = route.indexOf("request.formData()");
    expect(positionEtat).toBeGreaterThan(-1);
    expect(positionCorps).toBeGreaterThan(positionEtat);
  });

  it("la route exige un consentement explicite", () => {
    const route = readFileSync(fileURLToPath(new URL("../../app/api/ocr/route.ts", import.meta.url)), "utf8");
    expect(route).toContain('consentement');
    expect(route).toContain("consentement_requis");
  });

  it("la route n'écrit jamais directement dans colors_seaux", () => {
    const route = readFileSync(fileURLToPath(new URL("../../app/api/ocr/route.ts", import.meta.url)), "utf8");
    expect(route).not.toMatch(/from\("colors_seaux"\)\s*\.\s*(?:insert|update|upsert|delete)/);
    expect(route).toContain("colors_creer_analyse_ocr");
  });
});
