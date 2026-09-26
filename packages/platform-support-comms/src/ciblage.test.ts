import { describe, expect, it } from "vitest";
import {
  CORRESPONDANCES_ROLES,
  correspondanceRole,
  ecartsRolesDocumentes,
  evaluerCiblage,
  statistiquesLisiblesPar,
  type Audience,
  type Lecteur,
} from "./ciblage";

function lecteur(surcharge: Partial<Lecteur> = {}): Lecteur {
  return {
    utilisateurId: "u1",
    entrepriseId: "ent-1",
    applicationCode: "gestion_pro",
    segment: "actif",
    modelePoste: "ouvrier",
    permissions: ["saisir_son_pointage"],
    rolesApplicatifs: [],
    ...surcharge,
  };
}

const toutLeMonde: Audience = { applications: null, entreprises: null, segments: null, roles: null };

describe("évaluation d'audience", () => {
  it("un message global atteint tout le monde", () => {
    expect(evaluerCiblage(toutLeMonde, lecteur())).toEqual({ cible: true });
  });

  it("filtre par application", () => {
    const a: Audience = { ...toutLeMonde, applications: ["colors"] };
    expect(evaluerCiblage(a, lecteur())).toMatchObject({ cible: false, raison: "application_non_ciblee" });
    expect(evaluerCiblage(a, lecteur({ applicationCode: "colors" }))).toEqual({ cible: true });
  });

  it("filtre par entreprise", () => {
    const a: Audience = { ...toutLeMonde, entreprises: ["ent-2"] };
    expect(evaluerCiblage(a, lecteur())).toMatchObject({ cible: false, raison: "entreprise_non_ciblee" });
  });

  it("filtre par segment d'abonnement", () => {
    const a: Audience = { ...toutLeMonde, segments: ["essai", "pilote"] };
    expect(evaluerCiblage(a, lecteur())).toMatchObject({ cible: false, raison: "segment_non_cible" });
    expect(evaluerCiblage(a, lecteur({ segment: "essai" }))).toEqual({ cible: true });
  });

  it("un message aux responsables de chantier n'atteint pas les salariés terrain", () => {
    const a: Audience = { ...toutLeMonde, roles: ["chef_chantier", "conducteur_travaux"] };
    expect(evaluerCiblage(a, lecteur())).toMatchObject({ cible: false, raison: "role_non_cible" });
    expect(evaluerCiblage(a, lecteur({ modelePoste: "chef_chantier", permissions: [] }))).toEqual({ cible: true });
  });

  it("cible un poste renommé via sa permission", () => {
    const a: Audience = { ...toutLeMonde, roles: ["chef_chantier"] };
    const posteRenomme = lecteur({ modelePoste: null, permissions: ["gerer_planning"] });
    expect(evaluerCiblage(a, posteRenomme)).toEqual({ cible: true });
  });

  it("cible un rôle applicatif Colors sans passer par Gestion Pro", () => {
    const a: Audience = { ...toutLeMonde, roles: ["gestionnaire_stock"] };
    const magasinier = lecteur({
      applicationCode: "colors",
      modelePoste: null,
      permissions: [],
      rolesApplicatifs: ["colors_gestionnaire_stock"],
    });
    expect(evaluerCiblage(a, magasinier)).toEqual({ cible: true });
  });

  it("accepte un ciblage libre par permission", () => {
    const a: Audience = { ...toutLeMonde, roles: [], permissions: ["gerer_outillage"] };
    expect(evaluerCiblage(a, lecteur({ permissions: ["gerer_outillage"] }))).toEqual({ cible: true });
    expect(evaluerCiblage(a, lecteur())).toMatchObject({ cible: false, raison: "role_non_cible" });
  });
});

describe("correspondance des rôles demandés", () => {
  it("couvre les onze postes du cahier des charges", () => {
    expect(CORRESPONDANCES_ROLES).toHaveLength(11);
    for (const c of CORRESPONDANCES_ROLES) {
      const chemins = c.modelesPostes.length + c.permissions.length + c.rolesApplicatifs.length;
      expect(chemins).toBeGreaterThan(0);
    }
  });

  it("documente explicitement les deux écarts connus", () => {
    const ecarts = ecartsRolesDocumentes().map((c) => c.cle);
    expect(ecarts.sort()).toEqual(["gestionnaire_stock", "responsable_materiel"]);
  });

  it("n'invente pas de modèle de poste inexistant", () => {
    const modelesReels = new Set([
      "ouvrier",
      "chef_equipe",
      "chef_chantier",
      "conducteur_travaux",
      "directeur_travaux",
      "administration",
      "rh",
      "comptable",
      "gerant",
    ]);
    for (const c of CORRESPONDANCES_ROLES) {
      for (const m of c.modelesPostes) expect(modelesReels.has(m)).toBe(true);
    }
  });

  it("renvoie null pour une clé inconnue", () => {
    expect(correspondanceRole("stagiaire")).toBeNull();
  });
});

describe("statistiques", () => {
  it("une entreprise ne lit jamais les statistiques d'une autre", () => {
    expect(
      statistiquesLisiblesPar({ demandeurEstPlateforme: false, entrepriseDemandeur: "ent-1", entrepriseCible: "ent-2" }),
    ).toBe(false);
    expect(
      statistiquesLisiblesPar({ demandeurEstPlateforme: false, entrepriseDemandeur: "ent-1", entrepriseCible: "ent-1" }),
    ).toBe(true);
    expect(
      statistiquesLisiblesPar({ demandeurEstPlateforme: false, entrepriseDemandeur: "ent-1", entrepriseCible: null }),
    ).toBe(false);
    expect(
      statistiquesLisiblesPar({ demandeurEstPlateforme: true, entrepriseDemandeur: null, entrepriseCible: "ent-2" }),
    ).toBe(true);
  });
});
