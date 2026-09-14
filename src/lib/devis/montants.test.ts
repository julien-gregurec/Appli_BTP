import { describe, expect, it } from "vitest";
import {
  add,
  arrondir,
  dec,
  montantLigneHt,
  multipleProche,
  multipleSuperieur,
  repartirArrondi,
  totauxDocument,
  versNombre,
  versTexte,
  type LigneMontant,
} from "@/lib/devis/montants";

const ligne = (quantite: number, prixUnitaireHt: number, tauxTva = 20, remiseLignePct = 0): LigneMontant => ({
  quantite,
  prixUnitaireHt,
  tauxTva,
  remiseLignePct,
});

const centimes = (x: number) => Math.round(x * 100);

describe("décimal exact", () => {
  it("lit les nombres tels que PostgREST les écrit, y compris en notation exponentielle", () => {
    expect(versTexte(dec("12.50"))).toBe("12.5");
    expect(versTexte(dec(1e-7))).toBe("0.0000001");
    expect(versTexte(dec("-0.005"))).toBe("-0.005");
    expect(versTexte(dec("1.5E+3"))).toBe("1500");
  });
  it("refuse une valeur illisible ou non finie", () => {
    expect(() => dec("douze")).toThrow(RangeError);
    expect(() => dec(Number.NaN)).toThrow(RangeError);
    expect(() => dec(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
  it("additionne sans l'erreur binaire des flottants", () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(versNombre(add(dec(0.1), dec(0.2)))).toBe(0.3);
  });
});

describe("arrondi de PostgreSQL round(x, 2)", () => {
  it("arrondit la moitié en s'éloignant de zéro, là où le flottant se trompe", () => {
    expect((2.675).toFixed(2)).toBe("2.67"); // le piège : 2,675 vaut 2,67499999… en double
    expect((1.005).toFixed(2)).toBe("1.00");
    expect(versNombre(arrondir(dec(2.675)))).toBe(2.68);
    expect(versNombre(arrondir(dec(1.005)))).toBe(1.01);
    expect(versNombre(arrondir(dec(-2.675)))).toBe(-2.68);
    expect(versNombre(arrondir(dec(0.124)))).toBe(0.12);
    expect(versNombre(arrondir(dec(2.5), 0))).toBe(3);
  });
  it("ne touche pas une valeur déjà à la bonne échelle", () => {
    expect(versTexte(arrondir(dec("10.1")))).toBe("10.1");
  });
});

describe("arrondis au conditionnement", () => {
  it("prend le multiple supérieur, sans jamais réduire une quantité", () => {
    expect(versNombre(multipleSuperieur(dec(126.3), dec(1)))).toBe(127);
    expect(versNombre(multipleSuperieur(dec(10.01), dec(0.5)))).toBe(10.5);
    expect(versNombre(multipleSuperieur(dec(10), dec(0.5)))).toBe(10);
    expect(versNombre(multipleSuperieur(dec(0.2), dec(25)))).toBe(25);
  });
  it("prend le multiple le plus proche sur demande", () => {
    expect(versNombre(multipleProche(dec(10.25), dec(0.5)))).toBe(10.5);
    expect(versNombre(multipleProche(dec(10.24), dec(0.5)))).toBe(10);
  });
  it("refuse un pas nul ou négatif", () => {
    expect(() => multipleSuperieur(dec(1), dec(0))).toThrow(RangeError);
    expect(() => multipleProche(dec(1), dec(-1))).toThrow(RangeError);
  });
});

describe("totaux identiques à recalc_totaux_devis / recalc_totaux_facture", () => {
  it("n'arrondit jamais une ligne avant de sommer", () => {
    // 3 × 0,335 = 1,005 → arrondi ligne par ligne on aurait 1,01 × 3 lignes ; la base somme d'abord.
    const t = totauxDocument([ligne(1, 0.335), ligne(1, 0.335), ligne(1, 0.335)], 0);
    expect(t.totalHt).toBe(1.01);
  });
  it("reproduit l'arrondi « moitié s'éloignant de zéro » sur le total", () => {
    expect(totauxDocument([ligne(1, 2.675, 0)]).totalHt).toBe(2.68);
  });
  it("applique la remise de ligne puis la remise globale au HT ET à la TVA", () => {
    const t = totauxDocument([ligne(1, 100, 20), ligne(1, 50, 10)], 10);
    expect(t).toMatchObject({ sousTotalHt: 150, remiseGlobaleHt: 15, totalHt: 135, totalTva: 22.5, totalTtc: 157.5 });
    expect(montantLigneHt(ligne(3, 19.99, 20, 10))).toBe(53.97); // 53,973
  });
  it("ventile la TVA par taux, du plus fort au plus faible", () => {
    const t = totauxDocument([ligne(1, 100, 20), ligne(1, 50, 10), ligne(2, 10, 20)], 10);
    expect(t.ventilation).toEqual([
      { tauxTva: 20, baseHt: 108, montantTva: 21.6 },
      { tauxTva: 10, baseHt: 45, montantTva: 4.5 },
    ]);
  });
  it("traite un avoir (quantités négatives) symétriquement", () => {
    expect(totauxDocument([ligne(-1, 100, 20)])).toMatchObject({ totalHt: -100, totalTva: -20, totalTtc: -120 });
  });
  it("hérite de la base : le TTC arrondit la somme NON arrondie (écart possible d'un centime)", () => {
    // HT 0,0049 → 0,00 ; TVA 0,0008 → 0,00 ; mais HT + TVA = 0,0057 → 0,01. C'est ce que la base
    // enregistre ; l'aperçu doit afficher la même chose, pas « corriger » en silence.
    const t = totauxDocument([ligne(1, 0.004, 20), ligne(1, 0.0009, 0)]);
    expect(t).toMatchObject({ totalHt: 0, totalTva: 0, totalTtc: 0.01 });
  });
});

describe("ventilation cohérente au centime près", () => {
  it("répartit par plus forts restes pour retomber exactement sur la cible", () => {
    const r = repartirArrondi([dec("0.333"), dec("0.333"), dec("0.334")], dec("1.00")).map(versNombre);
    expect(r).toEqual([0.33, 0.33, 0.34]);
  });
  it("départage deux restes égaux par l'ordre d'entrée", () => {
    expect(repartirArrondi([dec("0.005"), dec("0.005")], dec("0.01")).map(versNombre)).toEqual([0.01, 0]);
  });
  it("tient sur 500 documents aléatoires : bases et TVA somment exactement aux totaux", () => {
    let graine = 20260911;
    const aleatoire = () => {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      return graine / 2147483648;
    };
    const taux = [20, 10, 5.5, 0];
    for (let d = 0; d < 500; d += 1) {
      const lignes = Array.from({ length: 1 + Math.floor(aleatoire() * 12) }, () =>
        ligne(
          Math.round(aleatoire() * 5000) / 1000,
          Math.round(aleatoire() * 1_000_000) / 1000,
          taux[Math.floor(aleatoire() * taux.length)],
          Math.floor(aleatoire() * 4) * 5,
        ));
      const t = totauxDocument(lignes, Math.floor(aleatoire() * 3) * 2.5);
      expect(t.ventilation.reduce((s, v) => s + centimes(v.baseHt), 0)).toBe(centimes(t.totalHt));
      expect(t.ventilation.reduce((s, v) => s + centimes(v.montantTva), 0)).toBe(centimes(t.totalTva));
      expect(centimes(t.sousTotalHt) - centimes(t.remiseGlobaleHt)).toBe(centimes(t.totalHt));
    }
  });
});
