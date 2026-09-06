import { describe, expect, it } from "vitest";
import {
  DUREE_ESSAI_JOURS,
  OFFRE_SOCLE,
  PERMISSIONS_HORS_SOCLE,
  PERMISSIONS_SOCLE,
  droitOuvertSansModule,
  essaiEnCours,
  finEssaiEffective,
  permissionEstSocle,
  socleOuvertPendantEssai,
} from "./acces-socle-essai";
import { MODULE_PERMISSION_PAR_CHEMIN } from "./module-permissions";
import { NAVIGATION_APPLICATION } from "./navigation";
import { OFFRES_TARIFAIRES, offreTarifaireParCle } from "./tarification";

/**
 * ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-CAPACITY-FIX-V1 — P0-1.
 *
 * BUG FERMÉ ICI : une entreprise en essai valide SANS `abonnement_offre` se
 * voyait refuser /clients, /devis, /factures, /employes, /planning et
 * /messagerie (redirection /abonnement/module-non-inclus), alors que ces entrées
 * étaient visibles dans la navigation. `permissionEstPorteDEntreeModule`
 * classait tout le SOCLE en « porte d'entrée de module », et aucun module
 * `modules_gestion_pro` de statut `actif` ne couvre ces permissions : la branche
 * essai de `acces_module_pour_permission` ne pouvait jamais les rattraper.
 */

const MAINTENANT = new Date("2026-09-06T12:00:00.000Z");

/** Essai ouvert le 2026-09-01, donc valide jusqu'au 2026-10-01 inclus. */
const ESSAI_VALIDE = {
  abonnementOffre: null,
  abonnementStatut: "essai",
  essaiDebut: "2026-09-01",
  essaiFin: null,
} as const;

const ESSAI_EXPIRE = {
  abonnementOffre: null,
  abonnementStatut: "essai",
  essaiDebut: "2026-07-01",
  essaiFin: "2026-07-31",
} as const;

/** Routes SOCLE du parcours premier client (P0-1). */
const ROUTES_SOCLE: [string, string][] = [
  ["/clients", "acces_clients"],
  ["/devis", "acces_devis"],
  ["/prestations", "acces_devis"],
  ["/factures", "acces_factures"],
  ["/facturation-avancee", "acces_facturation_avancee"],
  ["/employes", "acces_employes"],
  ["/planning", "acces_planning"],
  ["/messagerie", "acces_messagerie"],
  ["/chantiers", "acces_chantiers"],
];

/**
 * Permissions couvertes par un module `modules_gestion_pro` de statut `actif`
 * (seed migration 20260903000257). Reproduites ici pour prouver qu'AUCUNE
 * permission SOCLE n'a besoin de ce chemin — le SOCLE ne dépend jamais d'une
 * ligne `modules_entreprises`.
 */
const PERMISSIONS_MODULES_CATALOGUE_ACTIFS = new Set([
  "acces_chantiers", "gerer_chantiers",
  "acces_pointage", "gerer_pointage", "saisir_son_pointage", "valider_pointages",
  "saisir_ses_notes_frais", "gerer_notes_frais",
  "acces_flotte", "gerer_flotte",
  "acces_outillage", "gerer_outillage",
  "acces_stock", "gerer_stock", "utiliser_borne_stock",
  "acces_rentabilite", "voir_rentabilite", "acces_exports",
  "acces_ia",
]);

describe("définition du SOCLE", () => {
  it("dérive le SOCLE de l'offre d'entrée de la grille canonique, sans liste codée en dur", () => {
    expect(OFFRE_SOCLE).toBe("mini");
    expect([...PERMISSIONS_SOCLE].sort()).toEqual(
      [...offreTarifaireParCle("mini").fonctionnalites].sort(),
    );
    // Même normalisation que capacite_personnes_base (migration 20260903000256) :
    // une entreprise sans offre est traitée comme l'offre d'entrée.
    expect(OFFRES_TARIFAIRES[0].cle).toBe(OFFRE_SOCLE);
  });

  it("couvre exactement les fonctions du premier parcours client", () => {
    for (const permission of [
      "acces_dashboard", "acces_messagerie", "acces_clients", "acces_chantiers",
      "acces_devis", "acces_factures", "acces_facturation_avancee", "acces_planning",
      "acces_employes", "acces_ia",
    ]) {
      expect(permissionEstSocle(permission)).toBe(true);
    }
  });

  it("laisse les modules optionnels et les paliers supérieurs hors SOCLE", () => {
    for (const permission of [
      "acces_stock", "utiliser_borne_stock", "acces_pointage", "acces_achats",
      "acces_crm", "acces_interventions", "acces_ouvrages", "acces_flotte",
      "acces_outillage", "acces_rentabilite", "acces_exports", "acces_connecteurs",
      "acces_appels_offres", "acces_sous_traitants", "acces_paiements_bancaires",
      "gerer_paie", "consulter_sa_paie", "saisir_ses_notes_frais", "demander_ses_conges",
      "voir_devis_chantier_sans_prix",
    ]) {
      expect(permissionEstSocle(permission)).toBe(false);
      expect(PERMISSIONS_HORS_SOCLE).toContain(permission);
    }
  });

  it("SOCLE et hors-SOCLE partitionnent la grille tarifaire, sans recouvrement", () => {
    const grille = new Set(OFFRES_TARIFAIRES.flatMap((offre) => [...offre.fonctionnalites]));
    expect(new Set([...PERMISSIONS_SOCLE, ...PERMISSIONS_HORS_SOCLE])).toEqual(grille);
    expect(PERMISSIONS_SOCLE.filter((p) => PERMISSIONS_HORS_SOCLE.includes(p))).toEqual([]);
  });
});

describe("fenêtre d'essai (30 jours calendaires)", () => {
  it("abonnement_essai_fin fait autorité", () => {
    expect(finEssaiEffective({ abonnementStatut: "essai", essaiDebut: "2026-09-01", essaiFin: "2026-09-10" }))
      .toBe("2026-09-10");
  });

  it("à défaut, début + 30 jours (repli identique à la migration 20260905000265)", () => {
    expect(DUREE_ESSAI_JOURS).toBe(30);
    expect(finEssaiEffective({ abonnementStatut: "essai", essaiDebut: "2026-09-01", essaiFin: null }))
      .toBe("2026-10-01");
  });

  it("essai valide le dernier jour, expiré le lendemain", () => {
    const fenetre = { abonnementStatut: "essai", essaiDebut: null, essaiFin: "2026-09-06" };
    expect(essaiEnCours(fenetre, new Date("2026-09-06T23:00:00.000Z"))).toBe(true);
    expect(essaiEnCours(fenetre, new Date("2026-09-07T00:00:01.000Z"))).toBe(false);
  });

  it("un statut autre que « essai » n'est jamais un essai en cours", () => {
    for (const abonnementStatut of ["actif", "suspendu", "annule", null]) {
      expect(essaiEnCours({ abonnementStatut, essaiDebut: "2026-09-01", essaiFin: null }, MAINTENANT)).toBe(false);
    }
  });

  it("fenêtre non calculable = jamais expirée (aucun accès retiré par défaut)", () => {
    expect(essaiEnCours({ abonnementStatut: "essai", essaiDebut: null, essaiFin: null }, MAINTENANT)).toBe(true);
  });
});

describe("P0-1 — essai valide sans offre : le SOCLE est accessible", () => {
  it.each(ROUTES_SOCLE)("%s (%s) est ouvert sans aucun entitlement module", (chemin, permission) => {
    expect(MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => c === chemin)?.[1]).toBe(permission);
    expect(droitOuvertSansModule(permission, ESSAI_VALIDE, MAINTENANT)).toBe(true);
  });

  it("aucune permission SOCLE ne dépend d'une ligne modules_entreprises", () => {
    for (const permission of PERMISSIONS_SOCLE) {
      // Ouvert par le SOCLE seul, que le catalogue couvre ou non la permission.
      expect(socleOuvertPendantEssai(permission, ESSAI_VALIDE, MAINTENANT)).toBe(true);
    }
    // Preuve du contraire pour les 8 permissions que le catalogue ne couvre pas :
    // avant ce correctif, elles n'avaient AUCUN chemin d'ouverture pendant l'essai.
    // (acces_dashboard n'est pas gardée par MODULE_PERMISSION_PAR_CHEMIN, mais
    // reste du SOCLE : elle ne doit jamais dépendre d'un module non plus.)
    const socleHorsCatalogue = PERMISSIONS_SOCLE
      .filter((p) => !PERMISSIONS_MODULES_CATALOGUE_ACTIFS.has(p)).sort();
    expect(socleHorsCatalogue).toEqual([
      "acces_clients", "acces_dashboard", "acces_devis", "acces_employes",
      "acces_facturation_avancee", "acces_factures", "acces_messagerie", "acces_planning",
    ]);
    expect(socleHorsCatalogue.map((p) => droitOuvertSansModule(p, ESSAI_VALIDE, MAINTENANT)))
      .toEqual(socleHorsCatalogue.map(() => true));
  });

  it("navigation : toute entrée SOCLE visible est réellement accessible pendant l'essai", () => {
    const entreesSocle = NAVIGATION_APPLICATION.filter((item) => {
      const attendues = Array.isArray(item.permission) ? item.permission : item.permission ? [item.permission] : [];
      return attendues.some((droit) => permissionEstSocle(droit));
    });
    expect(entreesSocle.map((item) => item.href).sort()).toEqual([
      "/chantiers", "/clients", "/devis", "/facturation-avancee", "/factures",
      "/employes", "/messagerie", "/planning", "/prestations",
    ].sort());
    for (const item of entreesSocle) {
      const attendues = Array.isArray(item.permission) ? item.permission : [item.permission as string];
      expect(attendues.some((droit) => droitOuvertSansModule(droit, ESSAI_VALIDE, MAINTENANT))).toBe(true);
    }
  });
});

describe("modules optionnels — contrat ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1 préservé", () => {
  it("G. module optionnel absent : la garde plan reste fermée pendant l'essai", () => {
    for (const permission of ["acces_stock", "acces_pointage", "acces_achats", "acces_crm", "acces_flotte"]) {
      expect(droitOuvertSansModule(permission, ESSAI_VALIDE, MAINTENANT)).toBe(false);
    }
  });

  it("H. module optionnel présent : l'ouverture reste le fait de acces_module_pour_permission (OU)", () => {
    // La fonction centrale ne connaît pas l'entitlement : elle refuse, et c'est
    // la branche module du proxy qui accorde. Contrat inchangé.
    expect(droitOuvertSansModule("acces_stock", ESSAI_VALIDE, MAINTENANT)).toBe(false);
  });

  it("les permissions administratives restent ouvertes, offre ou pas (inchangé)", () => {
    for (const permission of ["acces_parametres", "gerer_parametres", "gerer_utilisateurs"]) {
      expect(droitOuvertSansModule(permission, ESSAI_VALIDE, MAINTENANT)).toBe(true);
      expect(droitOuvertSansModule(permission, ESSAI_EXPIRE, MAINTENANT)).toBe(true);
    }
  });
});

describe("B. essai expiré — le SOCLE se referme, aucun élargissement", () => {
  it.each(ROUTES_SOCLE)("%s (%s) n'est plus ouvert par le SOCLE", (_chemin, permission) => {
    expect(socleOuvertPendantEssai(permission, ESSAI_EXPIRE, MAINTENANT)).toBe(false);
    // Comportement strictement identique à avant le correctif : seul
    // l'entitlement module (branche OU du proxy) peut encore ouvrir.
    expect(droitOuvertSansModule(permission, ESSAI_EXPIRE, MAINTENANT)).toBe(false);
  });

  it("un statut suspendu/annulé sans offre n'ouvre jamais le SOCLE", () => {
    for (const abonnementStatut of ["suspendu", "annule", "actif"]) {
      expect(socleOuvertPendantEssai("acces_clients", {
        abonnementOffre: null, abonnementStatut, essaiDebut: "2026-09-01", essaiFin: null,
      }, MAINTENANT)).toBe(false);
    }
  });
});

describe("C→F. non-régression abonnés — aucun accès perdu", () => {
  const offres = ["mini", "pro", "business", "entreprise", "sur_mesure"] as const;

  it.each(offres)("%s : le périmètre de l'offre reste exactement celui de la grille", (cle) => {
    const etat = { abonnementOffre: cle, abonnementStatut: "actif", essaiDebut: null, essaiFin: null };
    for (const permission of offreTarifaireParCle(cle).fonctionnalites) {
      expect(droitOuvertSansModule(permission, etat, MAINTENANT)).toBe(true);
    }
    for (const permission of PERMISSIONS_HORS_SOCLE) {
      const attendu = offreTarifaireParCle(cle).fonctionnalites.includes(permission);
      expect(droitOuvertSansModule(permission, etat, MAINTENANT)).toBe(attendu);
    }
  });

  it("le SOCLE d'essai ne s'applique jamais à une entreprise ayant choisi une offre", () => {
    // Mini n'inclut pas acces_stock : un abonné Mini ne gagne rien du correctif.
    expect(socleOuvertPendantEssai("acces_clients", {
      abonnementOffre: "mini", abonnementStatut: "essai", essaiDebut: "2026-09-01", essaiFin: null,
    }, MAINTENANT)).toBe(false);
    expect(droitOuvertSansModule("acces_stock", {
      abonnementOffre: "mini", abonnementStatut: "essai", essaiDebut: "2026-09-01", essaiFin: null,
    }, MAINTENANT)).toBe(false);
  });

  it("les libellés d'offre historiques (essentiel/premium) restent non filtrés", () => {
    for (const abonnementOffre of ["essentiel", "premium"]) {
      expect(droitOuvertSansModule("acces_clients", {
        abonnementOffre, abonnementStatut: "actif", essaiDebut: null, essaiFin: null,
      }, MAINTENANT)).toBe(true);
    }
  });
});

describe("§12 — parcours premier client, essai sans offre ni SQL manuel", () => {
  /**
   * Chaque étape du parcours de recette, avec la garde de module qui s'y
   * applique réellement (MODULE_PERMISSION_PAR_CHEMIN). `null` = route sans
   * garde de module.
   */
  const PARCOURS: [string, string, string | null][] = [
    ["signup", "/signup", null],
    ["onboarding", "/onboarding", null],
    ["tableau de bord", "/dashboard", null],
    ["mon espace", "/mon-espace", null],
    ["client", "/clients", "acces_clients"],
    ["chantier", "/chantiers", "acces_chantiers"],
    ["devis", "/devis", "acces_devis"],
    ["facture", "/factures", "acces_factures"],
    ["employé", "/employes", "acces_employes"],
    ["planning", "/planning", "acces_planning"],
    ["messagerie", "/messagerie", "acces_messagerie"],
    ["aide", "/aide", null],
    ["abonnement", "/abonnement", "acces_parametres"],
  ];

  it.each(PARCOURS)("%s (%s) est franchissable pendant l'essai", (_etape, chemin, permission) => {
    const gardeReelle = MODULE_PERMISSION_PAR_CHEMIN
      .find(([base]) => chemin === base || chemin.startsWith(`${base}/`))?.[1] ?? null;
    expect(gardeReelle).toBe(permission);
    if (permission === null) return;
    // Ouvert sans offre, sans entitlement module, sans geste plateforme.
    expect(droitOuvertSansModule(permission, ESSAI_VALIDE, MAINTENANT)).toBe(true);
  });

  it("aucune étape du parcours ne dépend d'une offre souscrite", () => {
    const permissions = PARCOURS.map(([, , permission]) => permission).filter((p): p is string => p !== null);
    expect(permissions.every((p) => droitOuvertSansModule(p, ESSAI_VALIDE, MAINTENANT))).toBe(true);
    expect(ESSAI_VALIDE.abonnementOffre).toBeNull();
  });
});
