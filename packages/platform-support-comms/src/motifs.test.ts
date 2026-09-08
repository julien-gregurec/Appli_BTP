import { describe, expect, it } from "vitest";
import {
  MOTIFS_ASSISTANCE,
  motifInterne,
  motifPublic,
  validerMotifAssistance,
} from "./motifs";

describe("motif obligatoire", () => {
  it("refuse une catégorie inconnue", () => {
    expect(validerMotifAssistance({ categorie: "curiosite" })).toMatchObject({ valide: false });
  });

  it("accepte une catégorie sans détail quand le détail est facultatif", () => {
    expect(validerMotifAssistance({ categorie: "demande_client" })).toMatchObject({
      valide: true,
      detail: null,
    });
  });

  it("exige un détail lisible pour « autre »", () => {
    expect(validerMotifAssistance({ categorie: "autre", detail: "  ok " })).toMatchObject({ valide: false });
    expect(
      validerMotifAssistance({ categorie: "autre", detail: "Reprise de données après import raté" }),
    ).toMatchObject({ valide: true });
  });

  it("exige un détail pour sécurité et contrôle après signalement", () => {
    for (const categorie of ["securite", "controle_signalement"]) {
      expect(validerMotifAssistance({ categorie })).toMatchObject({ valide: false });
    }
  });

  it("refuse un motif trop long", () => {
    expect(validerMotifAssistance({ categorie: "autre", detail: "a".repeat(501) })).toMatchObject({
      valide: false,
    });
  });
});

describe("motif public / motif interne", () => {
  it("chaque catégorie a un libellé public et un libellé interne distincts", () => {
    for (const m of MOTIFS_ASSISTANCE) {
      expect(m.libellePublic.length).toBeGreaterThan(3);
      expect(m.libelleInterne.length).toBeGreaterThan(3);
    }
  });

  it("le libellé public d'un contrôle de sécurité ne révèle ni signalement ni investigation", () => {
    for (const categorie of ["securite", "controle_signalement"] as const) {
      const texte = motifPublic(categorie).toLowerCase();
      for (const mot of ["signalement", "fraude", "enquête", "investigation", "suspicion"]) {
        expect(texte).not.toContain(mot);
      }
    }
  });

  it("le détail interne n'apparaît que dans le libellé interne", () => {
    const detail = "suspicion de fraude signalée par un tiers";
    expect(motifInterne("securite", detail)).toContain(detail);
    expect(motifPublic("securite")).not.toContain("fraude");
  });

  it("les catégories sensibles sont marquées « détail strictement interne »", () => {
    for (const cle of ["securite", "controle_signalement"]) {
      const m = MOTIFS_ASSISTANCE.find((x) => x.cle === cle);
      expect(m?.detailStrictementInterne).toBe(true);
    }
  });
});
