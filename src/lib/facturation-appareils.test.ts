import { describe, expect, it } from "vitest";
import { calculerDepassementsAppareilsFacturables } from "./facturation-appareils";

describe("facturation des appareils par compte salarié", () => {
  const postes = [
    { id: "poste-ouvrier", nom: "Ouvrier", tarif_compte_mensuel: 15 },
    { id: "poste-conducteur", nom: "Conducteur", tarif_compte_mensuel: "25" },
  ];

  it("n'affiche rien jusqu'à deux appareils actifs", () => {
    expect(calculerDepassementsAppareilsFacturables({
      appareils: [{ utilisateur_id: "u1" }, { utilisateur_id: "u1" }],
      employes: [{ utilisateur_id: "u1", prenom: "Jean", nom: "Martin", poste_id: "poste-ouvrier", compte_application_statut: "actif" }],
      postes,
    })).toEqual([]);
  });

  it("facture une seule fois le tarif du poste au-delà de deux appareils", () => {
    const resultat = calculerDepassementsAppareilsFacturables({
      appareils: Array.from({ length: 5 }, () => ({ utilisateur_id: "u1" })),
      employes: [{ utilisateur_id: "u1", prenom: "Jean", nom: "Martin", poste_id: "poste-ouvrier", compte_application_statut: "actif" }],
      postes,
    });
    expect(resultat).toEqual([expect.objectContaining({ nom: "Jean Martin", nbAppareils: 5, supplementMensuelHt: 15 })]);
  });

  it("ignore les appareils orphelins et les comptes fermés", () => {
    expect(calculerDepassementsAppareilsFacturables({
      appareils: [
        ...Array.from({ length: 30 }, () => ({ utilisateur_id: "orphelin" })),
        ...Array.from({ length: 4 }, () => ({ utilisateur_id: "ferme" })),
      ],
      employes: [{ utilisateur_id: "ferme", prenom: "Compte", nom: "Fermé", poste_id: "poste-conducteur", compte_application_statut: "ferme" }],
      postes,
    })).toEqual([]);
  });

  it("conserve les comptes en pause car ils restent facturables", () => {
    const resultat = calculerDepassementsAppareilsFacturables({
      appareils: Array.from({ length: 3 }, () => ({ utilisateur_id: "pause" })),
      employes: [{ utilisateur_id: "pause", prenom: "Léa", nom: "Durand", poste_id: "poste-conducteur", compte_application_statut: "pause" }],
      postes,
    });
    expect(resultat[0]).toMatchObject({ nom: "Léa Durand", supplementMensuelHt: 25 });
  });
});
