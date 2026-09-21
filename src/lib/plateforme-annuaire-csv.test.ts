import { describe, expect, it } from "vitest";
import { construireCsvAnnuaire, valeurExport } from "@/lib/plateforme-annuaire-csv";
import type { LigneAnnuaire } from "@/lib/plateforme-annuaire";

const MAINTENANT = new Date("2026-09-08T12:00:00Z");

function ligne(surcharge: Partial<LigneAnnuaire> = {}): LigneAnnuaire {
  return {
    id: "1",
    nom: "Bâtiment Dupré",
    raison_sociale: "SARL Dupré",
    siret: "12345678900012",
    ville: "Nîmes",
    code_postal: "30000",
    reference_interne: "CLI-0001",
    code_adhesion: "ABCD",
    proprietaire_nom: "Amélie Dupré",
    proprietaire_email: "amelie@exemple.fr",
    telephone: "0466112233",
    created_at: "2026-01-15T09:00:00Z",
    abonnement_statut: "actif",
    abonnement_offre: "pro",
    abonnement_periodicite: "mensuel",
    abonnement_echeance: "2026-10-01",
    abonnement_essai_fin: null,
    abonnement_annulation_prevue_at: null,
    prix_contractuel_ht: 199,
    remise_type: null,
    remise_valeur: null,
    remise_description: null,
    remise_duree_mois: null,
    remise_appliquee_at: null,
    suspension_prevue_at: null,
    derniere_facture_statut: "paid",
    derniere_facture_url: null,
    montant_impaye_ht: null,
    nb_comptes_actifs: 12,
    nb_comptes_facturables: 12,
    nb_salaries: 18,
    modules_actifs: ["pointage"],
    applications_actives: ["gestion_pro"],
    option_ia_statut: null,
    derniere_activite: "2026-09-01T08:00:00Z",
    facturation_lisible: true,
    ...surcharge,
  };
}

describe("export CSV", () => {
  it("commence par un BOM et un en-tête lisible", () => {
    const csv = construireCsvAnnuaire([ligne()], ["nom", "statut"], MAINTENANT);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.split("\r\n")[0]).toBe('﻿"Nom commercial";"Statut"');
  });

  it("neutralise une valeur qui serait interprétée comme une formule", () => {
    const csv = construireCsvAnnuaire([ligne({ nom: "=1+1" })], ["nom"], MAINTENANT);
    expect(csv).toContain('"\'=1+1"');
  });

  it("échappe les guillemets sans casser la ligne", () => {
    const csv = construireCsvAnnuaire([ligne({ nom: 'Ets "Dupré"' })], ["nom"], MAINTENANT);
    expect(csv).toContain('"Ets ""Dupré"""');
  });

  it("n'exporte que les colonnes demandées, dans l'ordre du catalogue", () => {
    const csv = construireCsvAnnuaire([ligne()], ["statut", "nom"], MAINTENANT);
    expect(csv.split("\r\n")[0]).toBe('﻿"Nom commercial";"Statut"');
    expect(csv).not.toContain("SIRET");
  });

  it("écrit « Non disponible » plutôt qu'un zéro trompeur", () => {
    expect(valeurExport("prix_souscrit", ligne({ prix_contractuel_ht: null }), MAINTENANT)).toBe("Non disponible");
    expect(valeurExport("montant_impaye", ligne(), MAINTENANT)).toBe("Non disponible");
  });

  it("écrit les décimales à la française", () => {
    expect(valeurExport("prix_souscrit", ligne({ prix_contractuel_ht: 149.5 }), MAINTENANT)).toBe("149,5");
  });

  it("ne laisse fuir aucune référence de paiement", () => {
    const csv = construireCsvAnnuaire([ligne()], ["nom", "statut", "prix_souscrit", "statut_paiement"], MAINTENANT);
    expect(csv).not.toMatch(/sub_|cus_|price_|coupon|in_[A-Za-z0-9]/);
  });
});
