import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  COMPTES_SUPPLEMENTAIRES,
  COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE,
  COMPTES_SUPPLEMENTAIRES_PAR_ROLE,
  GENERATION_COMPTES_COURANTE,
  GENERATION_COMPTES_PRECEDENTE,
  MODULES_FACTURABLES,
  OFFRES_TARIFAIRES,
  OPTION_IA_INTENSIVE,
  PACK_CREDITS_IA,
  SERVICES_MISE_EN_SERVICE,
  calculerTarifAbonnement,
  filtrerPermissionsSelonOffre,
  generationComptesSelectionnable,
  moduleInclusDansOffre,
  offreTarifaireParCle,
  permissionIncluseDansOffre,
  tarifCompteSupplementaireCentimes,
  tarifCompteSupplementairePourContratCentimes,
  tarifModuleCentimes,
  verifierGenerationPourNouveauContrat,
} from "./tarification";
import canonique from "./tarification.canonical.json";

describe("grille tarifaire", () => {
  it("expose les cinq offres validées avec des montants en centimes", () => {
    // Grille canonique validée (ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1, 2026-09).
    expect(OFFRES_TARIFAIRES.map((offre) => [offre.cle, offre.prixMensuelCentimes])).toEqual([
      ["mini", 7_900],
      ["pro", 24_900],
      ["business", 44_900],
      ["entreprise", 59_900],
      ["sur_mesure", 0],
    ]);
    expect(OFFRES_TARIFAIRES.slice(0, 4).map((offre) => offre.prixAnnuelCentimes)).toEqual([
      79_000,
      249_000,
      449_000,
      599_000,
    ]);
    for (const offre of OFFRES_TARIFAIRES.filter((item) => !item.devisObligatoire)) {
      expect(offre.prixAnnuelCentimes).toBe(offre.prixMensuelCentimes * 10);
    }
    expect(offreTarifaireParCle("entreprise").libelleComptesInclus).toBe("40 salariés + 10 administrateurs");
    expect(offreTarifaireParCle("sur_mesure")).toMatchObject({ devisObligatoire: true, prixMensuelCentimes: 0, prixAnnuelCentimes: 0 });
    expect(offreTarifaireParCle("entreprise").populaire).toBe(true);
    expect(SERVICES_MISE_EN_SERVICE.map((service) => service.prixMinCentimes)).toEqual([
      199_000,
      49_000,
      69_000,
      150_000,
      49_000,
      90_000,
    ]);
  });

  it("additionne les options récurrentes sans y mêler un achat ponctuel", () => {
    // 2 terrain (2×500) + 1 chef d'équipe (900) + 1 administratif (1500)
    // + stockage (1900) + synchronisation avancée (5900) = 11 200 centimes.
    // Le pack de crédits IA, lui, est un ACHAT PONCTUEL : il ne rejoint jamais
    // la mensualité — sinon le client lirait une mensualité qui contient un
    // achat unique, et la reconduirait dans sa tête tous les mois.
    const total = calculerTarifAbonnement({
      offre: offreTarifaireParCle("pro"),
      comptesSupplementaires: { terrain: 2, chef_equipe: 1, administratif: 1 },
      stockageSupplementaire: true,
      synchronisationBancaire: "avancee",
      packsCreditsIA: 1,
    });
    expect(total).toMatchObject({
      baseCentimes: 24_900,
      optionsCentimes: 11_200,
      totalCentimes: 36_100,
      achatsPonctuelsCentimes: 2_900,
    });
    expect(total.optionsCentimes).not.toContain(PACK_CREDITS_IA.prixCentimes);
  });

  it("reste synchronisée avec tarification.canonical.json (source de vérité partagée site ↔ app ↔ Stripe)", () => {
    const depuisCode = OFFRES_TARIFAIRES.filter((o) => !o.devisObligatoire).map((o) => ({
      cle: o.cle,
      nom: o.nom,
      mensuelCentimes: o.prixMensuelCentimes,
      annuelCentimes: o.prixAnnuelCentimes,
      comptesInclus: o.comptesInclus,
    }));
    expect(depuisCode).toEqual(canonique.offres);
    for (const offre of canonique.offres) {
      expect(offre.annuelCentimes).toBe(offre.mensuelCentimes * 10);
    }
    // Le tarif par compte a QUITTÉ l'offre : il ne dépend plus du forfait.
    expect(canonique.offres.every((offre) => !("parCompteSupEuros" in offre))).toBe(true);
    expect(canonique.version).toBe("CANONICAL-V4-2026-09");
  });

  it("applique la règle annuelle officielle : annuel = 10 × mensuel (2 mois offerts) pour chaque offre payante", () => {
    const attendues: Record<string, [number, number]> = {
      mini: [7_900, 79_000],
      pro: [24_900, 249_000],
      business: [44_900, 449_000],
      entreprise: [59_900, 599_000],
    };
    for (const [cle, [mensuel, annuel]] of Object.entries(attendues)) {
      const offre = offreTarifaireParCle(cle);
      expect([offre.prixMensuelCentimes, offre.prixAnnuelCentimes]).toEqual([mensuel, annuel]);
      expect(offre.prixAnnuelCentimes).toBe(offre.prixMensuelCentimes * 10);
    }
  });
});

describe("droits liés à l'offre", () => {
  it("conserve les droits individuels uniquement si le module est inclus", () => {
    expect(permissionIncluseDansOffre("acces_devis", "mini")).toBe(true);
    expect(permissionIncluseDansOffre("acces_stock", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("acces_stock", "business")).toBe(true);
    expect(filtrerPermissionsSelonOffre(["acces_devis", "acces_stock"], "mini")).toEqual(["acces_devis"]);
  });

  it("ne limite pas rétroactivement les anciennes offres", () => {
    expect(permissionIncluseDansOffre("acces_stock", "essentiel")).toBe(true);
    expect(permissionIncluseDansOffre("gerer_devis", "mini")).toBe(true);
  });

  it("déverrouille les familles de modules palier par palier sans élargir les droits du rôle", () => {
    const matrice = [
      ["mini", true, false, false, false],
      ["pro", true, true, false, false],
      ["business", true, true, true, false],
      ["entreprise", true, true, true, true],
      ["sur_mesure", true, true, true, true],
    ] as const;

    for (const [offre, devis, achats, stock, banque] of matrice) {
      expect(permissionIncluseDansOffre("acces_devis", offre)).toBe(devis);
      expect(permissionIncluseDansOffre("acces_achats", offre)).toBe(achats);
      expect(permissionIncluseDansOffre("acces_stock", offre)).toBe(stock);
      expect(permissionIncluseDansOffre("acces_paiements_bancaires", offre)).toBe(banque);
    }
  });

  it("laisse toujours accessibles les réglages nécessaires à l'administrateur", () => {
    for (const offre of OFFRES_TARIFAIRES) {
      expect(permissionIncluseDansOffre("acces_parametres", offre.cle)).toBe(true);
      expect(permissionIncluseDansOffre("gerer_utilisateurs", offre.cle)).toBe(true);
    }
  });

  it("Mini peut gérer les comptes employés qu'elle facture, sans gagner le reste du palier Terrain (COMPTES-SUPPLEMENTAIRES-V1C)", () => {
    // Mini facture des comptes supplémentaires (comptesInclus=3, tarif selon le rôle) : le client
    // doit donc pouvoir créer/gérer ces comptes (acces_employes), sans pour autant hériter du
    // reste du palier Terrain (pointage, congés, notes de frais) ni d'un palier supérieur.
    expect(permissionIncluseDansOffre("acces_employes", "mini")).toBe(true);
    expect(permissionIncluseDansOffre("acces_pointage", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("demander_ses_conges", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("saisir_ses_notes_frais", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("acces_stock", "mini")).toBe(false);
    // gerer_employes (mutation) n'a jamais été limité par offre : seule la route /employes
    // (acces_employes) l'était. Aucune régression attendue ici, mais on fige le comportement.
    expect(permissionIncluseDansOffre("gerer_employes", "mini")).toBe(true);
    // Paie et RH avancé restent hors de portée pour Mini, même après ce correctif.
    expect(permissionIncluseDansOffre("consulter_sa_paie", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("gerer_paie", "mini")).toBe(false);
    // Les autres offres conservaient déjà acces_employes via le palier Terrain : pas de régression.
    for (const offre of ["pro", "business", "entreprise", "sur_mesure"] as const) {
      expect(permissionIncluseDansOffre("acces_employes", offre)).toBe(true);
    }
  });

  it("reste ouvert (fail-open) pour un code d'offre inconnu ou vide plutôt que de bloquer l'accès", () => {
    expect(permissionIncluseDansOffre("acces_stock", "code_offre_inexistant")).toBe(true);
    expect(permissionIncluseDansOffre("acces_paiements_bancaires", null)).toBe(true);
    expect(permissionIncluseDansOffre("acces_paiements_bancaires", undefined)).toBe(true);
  });
});

// ============================================================================
// ELSATIA-TARIFICATION-DECISIONS-COMMERCIALES-V1
// ----------------------------------------------------------------------------
// Les arbitrages rendus, et la seule chose qui les rend tenables : un test par
// décision, qui tombe le jour où quelqu'un revient dessus sans le dire.
// ============================================================================

describe("comptes supplémentaires — le tarif suit le rôle, jamais le forfait", () => {
  it("applique la grille 5 / 9 / 15 / 0 aux nouveaux contrats", () => {
    expect(
      COMPTES_SUPPLEMENTAIRES_PAR_ROLE.map((role) => [role.cle, role.mensuelCentimes]),
    ).toEqual([
      ["terrain", 500],
      ["chef_equipe", 900],
      ["administratif", 1_500],
      ["expert_comptable", 0],
    ]);
    for (const role of ["terrain", "chef_equipe", "administratif", "expert_comptable"] as const) {
      expect(
        tarifCompteSupplementairePourContratCentimes({
          generationDuContrat: GENERATION_COMPTES_COURANTE,
          role,
          cleOffre: "mini",
        }),
      ).toBe(tarifCompteSupplementaireCentimes(role));
    }
    // Le même rôle coûte le même prix quel que soit le forfait : c'est
    // exactement ce que l'ancienne grille ne faisait pas.
    for (const cleOffre of ["mini", "pro", "business", "entreprise"] as const) {
      expect(
        tarifCompteSupplementairePourContratCentimes({
          generationDuContrat: GENERATION_COMPTES_COURANTE,
          role: "terrain",
          cleOffre,
        }),
      ).toBe(500);
    }
  });

  it("exige le rôle pour un nouveau contrat plutôt que de deviner un prix", () => {
    expect(() =>
      tarifCompteSupplementairePourContratCentimes({
        generationDuContrat: GENERATION_COMPTES_COURANTE,
        cleOffre: "pro",
      }),
    ).toThrow(/rôle/i);
  });

  it("conserve le prix souscrit d'un ancien contrat 15 / 12 / 9 / 9", () => {
    // Le point le plus sensible du lot : un contrat signé sous la génération
    // précédente garde SON prix. Aucun chemin ne le fait glisser vers la
    // grille par rôle — ce serait une hausse ou une baisse silencieuse.
    expect(
      COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE.map((item) => [item.offre, item.mensuelCentimes]),
    ).toEqual([
      ["mini", 1_500],
      ["pro", 1_200],
      ["business", 900],
      ["entreprise", 900],
    ]);
    for (const [cleOffre, attendu] of [
      ["mini", 1_500],
      ["pro", 1_200],
      ["business", 900],
      ["entreprise", 900],
    ] as const) {
      expect(
        tarifCompteSupplementairePourContratCentimes({
          generationDuContrat: GENERATION_COMPTES_PRECEDENTE,
          cleOffre,
          // Un rôle est fourni : il ne doit RIEN changer pour ce contrat.
          role: "terrain",
        }),
      ).toBe(attendu);
    }
  });

  it("fait toujours primer un prix figé au contrat sur toute grille", () => {
    expect(
      tarifCompteSupplementairePourContratCentimes({
        generationDuContrat: GENERATION_COMPTES_COURANTE,
        role: "administratif",
        cleOffre: "pro",
        prixUnitaireContractuelCentimes: 700,
      }),
    ).toBe(700);
  });

  it("empêche la sélection de la génération précédente pour un nouveau client", () => {
    expect(generationComptesSelectionnable(GENERATION_COMPTES_COURANTE)).toBe(true);
    expect(generationComptesSelectionnable(GENERATION_COMPTES_PRECEDENTE)).toBe(false);
    expect(() => verifierGenerationPourNouveauContrat(GENERATION_COMPTES_COURANTE)).not.toThrow();
    expect(() => verifierGenerationPourNouveauContrat(GENERATION_COMPTES_PRECEDENTE)).toThrow(/retirée/i);
    expect(COMPTES_SUPPLEMENTAIRES.generationCourante.selectionnablePourNouveauContrat).toBe(true);
    for (const precedente of COMPTES_SUPPLEMENTAIRES.generationsPrecedentes) {
      expect(precedente.selectionnablePourNouveauContrat).toBe(false);
      expect(precedente.motifRetrait.length).toBeGreaterThan(0);
    }
  });

  it("garde l'accès expert-comptable gratuit", () => {
    expect(tarifCompteSupplementaireCentimes("expert_comptable")).toBe(0);
    const total = calculerTarifAbonnement({
      offre: offreTarifaireParCle("mini"),
      comptesSupplementaires: { expert_comptable: 3 },
    });
    expect(total.optionsCentimes).toBe(0);
    expect(total.totalCentimes).toBe(offreTarifaireParCle("mini").prixMensuelCentimes);
  });
});

describe("IA — un achat ponctuel et une option récurrente, jamais fusionnés", () => {
  it("traite le pack de crédits comme un achat ponctuel", () => {
    expect(PACK_CREDITS_IA.nature).toBe("achat_ponctuel");
    expect(PACK_CREDITS_IA.prixCentimes).toBe(2_900);
    expect(PACK_CREDITS_IA.renouvellementAutomatique).toBe(false);
    const total = calculerTarifAbonnement({
      offre: offreTarifaireParCle("mini"),
      packsCreditsIA: 2,
    });
    // Deux packs = deux achats, pas une mensualité doublée.
    expect(total.achatsPonctuelsCentimes).toBe(5_800);
    expect(total.optionsCentimes).toBe(0);
    expect(total.totalCentimes).toBe(offreTarifaireParCle("mini").prixMensuelCentimes);
  });

  it("ne donne aucun prix annuel au pack ponctuel, ni en mensuel ni en annuel", () => {
    // `null` et non zéro : zéro serait un prix, `null` dit qu'il n'y en a pas.
    expect(PACK_CREDITS_IA.prixAnnuelCentimes).toBeNull();
    for (const periodicite of ["mensuel", "annuel"] as const) {
      const total = calculerTarifAbonnement({
        offre: offreTarifaireParCle("pro"),
        periodicite,
        packsCreditsIA: 1,
      });
      // Ni ×10 ni ×12 : le montant est le même dans les deux périodicités.
      expect(total.achatsPonctuelsCentimes).toBe(2_900);
      expect(total.optionsCentimes).toBe(0);
    }
  });

  it("garde l'IA intensive récurrente et distincte du pack", () => {
    expect(OPTION_IA_INTENSIVE.nature).toBe("recurrente");
    expect(OPTION_IA_INTENSIVE.cle).not.toBe(PACK_CREDITS_IA.cle);
    expect([OPTION_IA_INTENSIVE.mensuelCentimes, OPTION_IA_INTENSIVE.annuelCentimes]).toEqual([7_900, 79_000]);
    expect(OPTION_IA_INTENSIVE.annuelCentimes).toBe(OPTION_IA_INTENSIVE.mensuelCentimes * 10);

    const mensuel = calculerTarifAbonnement({ offre: offreTarifaireParCle("pro"), iaIntensive: true });
    expect(mensuel.optionsCentimes).toBe(7_900);
    // L'annuel ne s'applique QUE si l'abonnement est souscrit en annuel.
    const annuel = calculerTarifAbonnement({
      offre: offreTarifaireParCle("pro"),
      periodicite: "annuel",
      iaIntensive: true,
    });
    expect(annuel.optionsCentimes).toBe(79_000);
  });
});

describe("modules facturables", () => {
  it("applique la règle annuelle : annuel = 10 × mensuel", () => {
    expect(MODULES_FACTURABLES.map((m) => [m.cle, m.mensuelCentimes, m.annuelCentimes])).toEqual([
      ["pointage", 2_500, 25_000],
      ["stock", 2_900, 29_000],
      ["materiel_vehicules", 1_900, 19_000],
      ["notes_frais", 1_200, 12_000],
      ["rentabilite_avancee", 2_900, 29_000],
    ]);
    for (const module_ of MODULES_FACTURABLES) {
      expect(module_.annuelCentimes).toBe(module_.mensuelCentimes * 10);
    }
  });

  it("ne facture jamais deux fois un module déjà compris dans le forfait", () => {
    // Pointage est compris à partir de Pro : Pro ne le paie pas, Mini le paie.
    expect(moduleInclusDansOffre("pointage", offreTarifaireParCle("pro"))).toBe(true);
    expect(tarifModuleCentimes("pointage", offreTarifaireParCle("pro"))).toBe(0);
    expect(moduleInclusDansOffre("pointage", offreTarifaireParCle("mini"))).toBe(false);
    expect(tarifModuleCentimes("pointage", offreTarifaireParCle("mini"))).toBe(2_500);

    const tousLesModules = MODULES_FACTURABLES.map((m) => m.cle);
    const entreprise = calculerTarifAbonnement({
      offre: offreTarifaireParCle("entreprise"),
      modules: tousLesModules,
    });
    // Entreprise comprend tout : aucun module facturé, tous listés comme compris.
    expect(entreprise.optionsCentimes).toBe(0);
    expect(entreprise.modulesNonFactures.sort()).toEqual([...tousLesModules].sort());

    const mini = calculerTarifAbonnement({ offre: offreTarifaireParCle("mini"), modules: tousLesModules });
    expect(mini.modulesNonFactures).toEqual([]);
    expect(mini.optionsCentimes).toBe(2_500 + 2_900 + 1_900 + 1_200 + 2_900);
  });

  it("facture « Matériel et véhicules » une seule fois pour ses deux modules", () => {
    const produit = MODULES_FACTURABLES.find((m) => m.cle === "materiel_vehicules");
    expect(produit?.codesCatalogue).toEqual(["materiel", "vehicules"]);
    const total = calculerTarifAbonnement({
      offre: offreTarifaireParCle("mini"),
      modules: ["materiel_vehicules"],
    });
    expect(total.optionsCentimes).toBe(1_900);
  });

  it("dérive l'inclusion de la même matrice que celle du catalogue de modules", () => {
    // Deux sources décrivent ce qu'un forfait comprend : les `fonctionnalites`
    // de l'offre (qui ouvrent réellement l'accès) et `plans_inclus` de la
    // migration R3 (qui le déclare). Si elles divergent, un client paie un
    // module qu'il a déjà, ou accède à un module qu'il n'a pas payé.
    const sql = readFileSync(
      new URL("../../supabase/migrations/20260903000257_modules_a_la_carte_r3_v1.sql", import.meta.url),
      "utf8",
    );

    /** `plans_inclus` d'un module : c'est le DERNIER littéral array de sa ligne. */
    const plansInclusDe = (code: string): string[] => {
      const debut = sql.indexOf(`('${code}',`);
      expect(debut, `module ${code} absent du catalogue`).toBeGreaterThan(-1);
      const suivant = sql.indexOf("\n  ('", debut + 1);
      const finBloc = sql.indexOf("on conflict", debut);
      const bloc = sql.slice(debut, suivant > -1 && suivant < finBloc ? suivant : finBloc);
      const dernierArray = bloc.lastIndexOf("array[");
      const interieur = bloc.slice(dernierArray + "array[".length, bloc.indexOf("]", dernierArray));
      return interieur
        .split(",")
        .map((valeur) => valeur.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
    };

    for (const module_ of MODULES_FACTURABLES) {
      for (const code of module_.codesCatalogue) {
        const plansInclus = plansInclusDe(code);
        expect(plansInclus.length, `${code} : plans_inclus vide`).toBeGreaterThan(0);
        for (const offre of OFFRES_TARIFAIRES) {
          expect(
            moduleInclusDansOffre(module_.cle, offre) || !plansInclus.includes(offre.cle),
            `${code} / ${offre.cle} : déclaré inclus au catalogue mais non ouvert par les permissions`,
          ).toBe(true);
          expect(
            !moduleInclusDansOffre(module_.cle, offre) || plansInclus.includes(offre.cle),
            `${code} / ${offre.cle} : ouvert par les permissions mais non déclaré inclus au catalogue`,
          ).toBe(true);
        }
      }
    }
  });
});

describe("le contrat public ne porte que des tarifs publics", () => {
  it("ne contient ni remise, ni prix négocié, ni identifiant Stripe privé", () => {
    const serialise = JSON.stringify(canonique).toLowerCase();
    for (const interdit of [
      "remise",
      "negoci",
      "négoci",
      "coupon",
      "price_",
      "prod_",
      "cus_",
      "sub_",
      "sk_live",
      "sk_test",
      "client_id",
      "customer",
      "secret",
    ]) {
      expect(serialise.includes(interdit), `le contrat public porte « ${interdit} »`).toBe(false);
    }
  });

  it("est régénérable : le contrat public dit exactement ce que dit le code", () => {
    // Le site vitrine consomme un artefact dérivé de ce fichier. S'il s'en
    // écarte, le site publie un prix que l'application n'applique pas.
    // Libellés compris : c'est ce que le visiteur lit sur le site, et une
    // divergence d'accentuation se voit tout de suite en production.
    expect(canonique.comptesSupplementaires.generationCourante.roles.map((r) => [r.cle, r.nom, r.mensuelCentimes])).toEqual(
      COMPTES_SUPPLEMENTAIRES_PAR_ROLE.map((r) => [r.cle, r.nom, r.mensuelCentimes]),
    );
    expect(
      canonique.comptesSupplementaires.generationsPrecedentes[0].parForfait.map((f) => [f.offre, f.mensuelCentimes]),
    ).toEqual(COMPTES_SUPPLEMENTAIRES_PAR_FORFAIT_HISTORIQUE.map((f) => [f.offre, f.mensuelCentimes]));
    expect(canonique.comptesSupplementaires.generationsPrecedentes[0].selectionnablePourNouveauContrat).toBe(false);
    // La règle est affichée telle quelle sur le site : elle doit être écrite
    // en français correct, accents compris.
    expect(canonique.comptesSupplementaires.regle).toBe(COMPTES_SUPPLEMENTAIRES.regle);
    expect(canonique.comptesSupplementaires.generationCourante.libelle).toBe(
      COMPTES_SUPPLEMENTAIRES.generationCourante.libelle,
    );
    expect(canonique.optionsIA.packCredits).toMatchObject({
      nature: "achat_ponctuel",
      prixCentimes: PACK_CREDITS_IA.prixCentimes,
      prixAnnuelCentimes: null,
      renouvellementAutomatique: false,
    });
    expect(canonique.optionsIA.capaciteRenforcee).toMatchObject({
      nature: "recurrente",
      mensuelCentimes: OPTION_IA_INTENSIVE.mensuelCentimes,
      annuelCentimes: OPTION_IA_INTENSIVE.annuelCentimes,
    });
    expect(canonique.modules.map((m) => [m.cle, m.nom, m.mensuelCentimes, m.annuelCentimes])).toEqual(
      MODULES_FACTURABLES.map((m) => [m.cle, m.nom, m.mensuelCentimes, m.annuelCentimes]),
    );
    expect(canonique.optionsIA.packCredits.nom).toBe(PACK_CREDITS_IA.nom);
    expect(canonique.optionsIA.capaciteRenforcee.nom).toBe(OPTION_IA_INTENSIVE.nom);
    for (const module_ of canonique.modules) {
      expect(module_.annuelCentimes).toBe(module_.mensuelCentimes * 10);
    }
  });
});
