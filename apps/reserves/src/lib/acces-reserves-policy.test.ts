import { describe, expect, it } from "vitest";
import {
  ROLES_RESERVES, estRoleReserves, CODES_APPLICATIONS_ELSATIA,
} from "@elsatia/application-access";
import {
  estCompteIntervenant, peutEmettre, peutGererChantiers,
  peutInviterEntreprise, peutValiderLevee,
} from "./acces-reserves-policy";

describe("contrat canonique", () => {
  it("inscrit Réserves au catalogue partagé", () => {
    expect(CODES_APPLICATIONS_ELSATIA).toContain("reserves");
  });

  it("déclare les cinq rôles de la migration", () => {
    expect([...ROLES_RESERVES]).toEqual([
      "reserves_admin_organisation",
      "reserves_responsable",
      "reserves_emetteur",
      "reserves_intervenant",
      "reserves_consultation",
    ]);
  });

  it("rejette un rôle appartenant à une autre application", () => {
    expect(estRoleReserves("colors_admin_organisation")).toBe(false);
    expect(estRoleReserves("gestion_pro_admin")).toBe(false);
    expect(estRoleReserves("reserves_responsable")).toBe(true);
  });
});

describe("droits par rôle", () => {
  it("réserve la validation de levée au responsable et à l'administrateur", () => {
    expect(peutValiderLevee("reserves_admin_organisation")).toBe(true);
    expect(peutValiderLevee("reserves_responsable")).toBe(true);
    expect(peutValiderLevee("reserves_emetteur")).toBe(false);
    expect(peutValiderLevee("reserves_consultation")).toBe(false);
    expect(peutValiderLevee("reserves_intervenant")).toBe(false);
  });

  it("laisse l'émetteur constater sans lui donner le dernier mot", () => {
    expect(peutEmettre("reserves_emetteur")).toBe(true);
    expect(peutGererChantiers("reserves_emetteur")).toBe(false);
    expect(peutInviterEntreprise("reserves_emetteur")).toBe(false);
  });

  it("n'accorde rien au compte gratuit intervenant", () => {
    expect(estCompteIntervenant("reserves_intervenant")).toBe(true);
    expect(peutEmettre("reserves_intervenant")).toBe(false);
    expect(peutGererChantiers("reserves_intervenant")).toBe(false);
    expect(peutInviterEntreprise("reserves_intervenant")).toBe(false);
  });

  it("laisse la consultation en lecture seule", () => {
    expect(peutEmettre("reserves_consultation")).toBe(false);
    expect(estCompteIntervenant("reserves_consultation")).toBe(false);
  });

  it("ne dérive aucun droit d'un rôle absent", () => {
    expect(peutEmettre(null)).toBe(false);
    expect(peutValiderLevee(null)).toBe(false);
    expect(estCompteIntervenant(null)).toBe(false);
  });

  // Le propriétaire global entre par le rôle plateforme du socle multi-app : il n'a
  // délibérément aucun droit d'écriture métier sur le tenant d'un client.
  it("n'ouvre aucune écriture métier au rôle plateforme", () => {
    expect(peutEmettre("administrateur_plateforme_global")).toBe(false);
    expect(peutValiderLevee("administrateur_plateforme_global")).toBe(false);
    expect(peutInviterEntreprise("administrateur_plateforme_global")).toBe(false);
  });
});
