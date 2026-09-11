import { describe, expect, it } from "vitest";
import { instancierOuvrage, modifierLigne, type InstanceOuvrage } from "@/lib/devis/ouvrages";
import { avertissementsPrix, indicateursPrix, proposerPrixGlobal } from "@/lib/devis/prix";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

function pc001(): InstanceOuvrage {
  const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "i1", ordre: 1, quantitePrincipale: 120, saisies: { bande: 44 } });
  if (issue.etat !== "pret") throw new Error(issue.motif);
  return issue.instance;
}
const BROUILLON = { statutDevis: "brouillon" };
const achats = (i: InstanceOuvrage) => i.lignes.filter((l) => l.origine !== "ajustement").map((l) => [l.cle, l.prixAchatHt]);

describe("indicateurs conservés séparément", () => {
  it("coût, prix calculé, prix retenu, marge, taux de marge et taux de marque", () => {
    expect(indicateursPrix(pc001())).toEqual({
      coutAchatHt: 4734,
      prixVenteCalculeHt: 8360,
      remiseHt: 0,
      ajustementHt: 0,
      prixVenteRetenuHt: 8360,
      margeHt: 3626,
      tauxMargePct: 76.59, // 3626 / 4734
      tauxMarquePct: 43.37, // 3626 / 8360
    });
  });
});

describe("23. modification du prix global — trois stratégies explicites", () => {
  it("ajustement : les prix des composants restent, une ligne porte l'écart", () => {
    const p = proposerPrixGlobal(pc001(), 8000, "ajustement", BROUILLON);
    if (p.etat !== "propose") throw new Error(p.etat);
    expect(p.changementsPrix).toEqual([]);
    expect(p.lignesAjustement).toEqual([{ cle: "ajustement_prix_global", designation: "Ajustement du prix de l’ouvrage", montantHt: -360, tauxTva: 20 }]);
    expect(p.avant.prixVenteRetenuHt).toBe(8360);
    expect(p.apres).toMatchObject({ prixVenteCalculeHt: 8360, ajustementHt: -360, prixVenteRetenuHt: 8000 });
  });
  it("répartition : les prix unitaires sont mis à l'échelle et le total tombe juste", () => {
    const p = proposerPrixGlobal(pc001(), 9000, "repartition", BROUILLON);
    if (p.etat !== "propose") throw new Error(p.etat);
    expect(p.apres.prixVenteRetenuHt).toBe(9000);
    for (const c of p.changementsPrix) expect(Math.abs(c.apres - c.avant * (9000 / 8360))).toBeLessThanOrEqual(0.005);
  });
  it("remise : pose une remise, et refuse d'augmenter le prix", () => {
    const p = proposerPrixGlobal(pc001(), 8000, "remise", BROUILLON);
    if (p.etat !== "propose") throw new Error(p.etat);
    expect(p.apres).toMatchObject({ remiseHt: 360, prixVenteRetenuHt: 8000 });
    expect(p.lignesAjustement[0].designation).toBe("Remise sur l’ouvrage (4,31 %)");
    expect(proposerPrixGlobal(pc001(), 9000, "remise", BROUILLON).etat).toBe("refuse");
  });
  it("une nouvelle proposition REMPLACE l'ajustement précédent, sans empiler", () => {
    const p1 = proposerPrixGlobal(pc001(), 8000, "ajustement", BROUILLON);
    if (p1.etat !== "propose") throw new Error(p1.etat);
    const p2 = proposerPrixGlobal(p1.instance, 8500, "ajustement", BROUILLON);
    if (p2.etat !== "propose") throw new Error(p2.etat);
    expect(p2.instance.lignes.filter((l) => l.origine === "ajustement")).toHaveLength(1);
    expect(p2.apres.prixVenteRetenuHt).toBe(8500);
  });
  it("annuler ne change rien ; un devis émis ou un prix invalide est refusé", () => {
    const i = pc001();
    expect(proposerPrixGlobal(i, 1, "annuler", BROUILLON)).toEqual({ etat: "annule", instance: i });
    expect(proposerPrixGlobal(i, 8000, "ajustement", { statutDevis: "envoye" }).etat).toBe("refuse");
    expect(proposerPrixGlobal(i, -1, "ajustement", BROUILLON).etat).toBe("refuse");
    expect(proposerPrixGlobal(i, Number.NaN, "ajustement", BROUILLON).etat).toBe("refuse");
  });
  it("ne modifie jamais l'instance d'origine : c'est une proposition", () => {
    const i = pc001();
    const avant = JSON.stringify(i);
    proposerPrixGlobal(i, 9000, "repartition", BROUILLON);
    proposerPrixGlobal(i, 8000, "remise", BROUILLON);
    expect(JSON.stringify(i)).toBe(avant);
  });
  it("tombe exactement sur la cible, pour 200 cibles aléatoires et deux stratégies", () => {
    let graine = 7;
    const aleatoire = () => ((graine = (graine * 16807) % 2147483647), graine / 2147483647);
    for (let k = 0; k < 200; k += 1) {
      const cible = Math.round(aleatoire() * 2_000_000) / 100;
      for (const strategie of ["ajustement", "repartition"] as const) {
        const p = proposerPrixGlobal(pc001(), cible, strategie, BROUILLON);
        if (p.etat !== "propose") throw new Error(`${strategie} ${cible} : ${p.etat}`);
        expect(p.apres.prixVenteRetenuHt, `${strategie} ${cible}`).toBe(cible);
      }
    }
  });
});

describe("24. conservation du coût d'achat", () => {
  it("aucune stratégie ne touche un prix d'achat, et les ajustements n'ont pas de coût", () => {
    const origine = achats(pc001());
    for (const [cible, strategie] of [[8000, "ajustement"], [9000, "repartition"], [7000, "remise"]] as const) {
      const p = proposerPrixGlobal(pc001(), cible, strategie, BROUILLON);
      if (p.etat !== "propose") throw new Error(p.etat);
      expect(achats(p.instance)).toEqual(origine);
      expect(p.apres.coutAchatHt).toBe(4734);
      expect(p.instance.lignes.filter((l) => l.origine === "ajustement").every((l) => l.prixAchatHt === null)).toBe(true);
    }
  });
});

describe("25. avertissements de marge et de prix", () => {
  it("prix inférieur au coût", () => {
    const p = proposerPrixGlobal(pc001(), 4000, "ajustement", BROUILLON);
    if (p.etat !== "propose") throw new Error(p.etat);
    expect(avertissementsPrix(p.instance).map((a) => a.code)).toContain("prix_inferieur_cout");
  });
  it("taux de marque sous le seuil configuré, et seulement s'il y a un seuil", () => {
    expect(avertissementsPrix(pc001(), { seuilTauxMarquePct: 50 }).map((a) => a.code)).toContain("marge_sous_seuil");
    expect(avertissementsPrix(pc001(), { seuilTauxMarquePct: 40 }).map((a) => a.code)).not.toContain("marge_sous_seuil");
    expect(avertissementsPrix(pc001()).map((a) => a.code)).not.toContain("marge_sous_seuil");
  });
  it("prix nul, composant sans prix et coût inconnu", () => {
    const p = proposerPrixGlobal(pc001(), 0, "ajustement", BROUILLON);
    if (p.etat !== "propose") throw new Error(p.etat);
    expect(avertissementsPrix(p.instance).map((a) => a.code)).toContain("prix_nul");
    const sansPrix = avertissementsPrix(modifierLigne(pc001(), "collecteur", { prixVenteHt: 0 }));
    expect(sansPrix.find((a) => a.code === "composant_sans_prix")?.cle).toBe("collecteur");
    const sansCout = avertissementsPrix(modifierLigne(pc001(), "isolant", { prixAchatHt: null }));
    expect(sansCout.find((a) => a.code === "cout_inconnu")?.gravite).toBe("information");
  });
  it("TVA inhabituelle", () => {
    const a = avertissementsPrix(modifierLigne(pc001(), "chape", { tauxTva: 19.6 }));
    expect(a.find((x) => x.code === "tva_incoherente")?.cle).toBe("chape");
  });
});

describe("26. plusieurs taux de TVA", () => {
  const mixte = () => modifierLigne(pc001(), "main_oeuvre", { tauxTva: 10 });

  it("s'arrête et demande une règle explicite plutôt que de répartir en silence", () => {
    for (const strategie of ["ajustement", "repartition", "remise"] as const) {
      expect(proposerPrixGlobal(mixte(), 8000, strategie, BROUILLON)).toMatchObject({ etat: "regle_tva_requise", taux: [20, 10] });
    }
  });
  it("avec la règle « prorata des bases », ventile l'écart au centime exact par taux", () => {
    const p = proposerPrixGlobal(mixte(), 8000, "ajustement", { ...BROUILLON, regleTvaMixte: "prorata_bases" });
    if (p.etat !== "propose") throw new Error(p.etat);
    // Bases : 20 % = 6050, 10 % = 2310 ; écart −360 → −260,53 et −99,47.
    expect(p.lignesAjustement.map((l) => [l.tauxTva, l.montantHt])).toEqual([[20, -260.53], [10, -99.47]]);
    expect(p.apres.prixVenteRetenuHt).toBe(8000);
  });
  it("signale la présence de plusieurs taux", () => {
    expect(avertissementsPrix(mixte()).map((a) => a.code)).toContain("tva_multiple");
  });
});
