import { describe, expect, it } from "vitest";
import { creerMutation, TENTATIVES_MAX, type EtatMutation, type Mutation } from "./contrat";
import {
  REPRISE_BASE_MS, REPRISE_PLAFOND_MS, cycleSuivant, delaiReprise, echecsRattrapables,
  pretesAEnvoyer, repriseUtile,
} from "./reprise";

const A = {
  entrepriseId: "a0000000-0000-0000-0000-000000000001",
  utilisateurId: "10000000-0000-0000-0000-000000000001",
};

function mutation(etat: EtatMutation, tentatives = 0): Mutation {
  return {
    ...creerMutation({
      type: "commentaire_ajouter", entrepriseId: A.entrepriseId,
      utilisateurId: A.utilisateurId, reserveId: "e5000000-0000-0000-0000-000000000101",
      chantierId: null, payload: { contenu: "essai" },
    }),
    etat,
    tentatives,
  };
}

describe("temporisation exponentielle", () => {
  it("part de l'intervalle de base, jamais moins de sa moitié", () => {
    expect(delaiReprise(0, () => 0)).toBe(REPRISE_BASE_MS / 2);
    expect(delaiReprise(0, () => 1)).toBe(REPRISE_BASE_MS);
  });

  it("double à chaque cycle sans progression", () => {
    // Bruit neutralisé : on observe la seule composante déterministe.
    const suite = [0, 1, 2, 3].map((n) => delaiReprise(n, () => 1));
    expect(suite).toEqual([5_000, 10_000, 20_000, 40_000]);
  });

  it("ne dépasse jamais le plafond, même très loin dans la suite", () => {
    for (const cycle of [10, 20, 100, 10_000, Number.MAX_SAFE_INTEGER]) {
      const delai = delaiReprise(cycle, () => 1);
      expect(delai).toBeLessThanOrEqual(REPRISE_PLAFOND_MS);
      expect(Number.isFinite(delai)).toBe(true);
    }
  });

  it("reste au plafond une fois atteint, sans repasser en dessous de sa moitié", () => {
    expect(delaiReprise(50, () => 0)).toBe(REPRISE_PLAFOND_MS / 2);
    expect(delaiReprise(50, () => 1)).toBe(REPRISE_PLAFOND_MS);
  });

  it("introduit un bruit : deux appareils repartis ensemble ne restent pas en phase", () => {
    // Sans bruit, toute une équipe qui remonte du sous-sol frapperait à la même seconde.
    const tirages = new Set(Array.from({ length: 200 }, () => delaiReprise(3)));
    expect(tirages.size).toBeGreaterThan(50);
  });

  it("traite un cycle négatif ou fractionnaire comme le premier", () => {
    expect(delaiReprise(-5, () => 1)).toBe(REPRISE_BASE_MS);
    expect(delaiReprise(0.7, () => 1)).toBe(REPRISE_BASE_MS);
  });
});

describe("progression du cycle", () => {
  it("remet à zéro dès qu'une mutation est passée", () => {
    expect(cycleSuivant(7, true)).toBe(0);
  });
  it("monte d'un cran sinon, et se borne", () => {
    expect(cycleSuivant(0, false)).toBe(1);
    expect(cycleSuivant(20, false)).toBe(20);
  });
});

describe("ce que la reprise a le droit de faire avancer", () => {
  it("envoie ce qui est en attente", () => {
    expect(pretesAEnvoyer([mutation("en_attente"), mutation("brouillon")])).toHaveLength(1);
  });

  it("rattrape un échec tant qu'il n'a pas épuisé son budget", () => {
    expect(echecsRattrapables([mutation("echec", TENTATIVES_MAX - 1)])).toHaveLength(1);
  });

  it("n'insiste plus sur un échec qui a épuisé son budget", () => {
    // C'est ce qui empêche un refus métier de tourner en boucle indéfiniment.
    expect(echecsRattrapables([mutation("echec", TENTATIVES_MAX)])).toHaveLength(0);
    expect(echecsRattrapables([mutation("echec", TENTATIVES_MAX + 3)])).toHaveLength(0);
  });

  it("ne rattrape JAMAIS un conflit : il exige une décision humaine", () => {
    expect(echecsRattrapables([mutation("conflit")])).toHaveLength(0);
    expect(repriseUtile([mutation("conflit")])).toBe(false);
  });

  it("ne rattrape ni un brouillon ni une action annulée", () => {
    // Un brouillon est délibérément retenu par son auteur : le pousser serait un abus.
    expect(repriseUtile([mutation("brouillon"), mutation("annule")])).toBe(false);
  });
});

describe("arrêt de la boucle", () => {
  it("s'éteint sur une file vide", () => {
    expect(repriseUtile([])).toBe(false);
  });

  it("s'éteint quand tout est synchronisé", () => {
    expect(repriseUtile([mutation("synchronise"), mutation("synchronise")])).toBe(false);
  });

  it("s'éteint quand il ne reste que des échecs définitifs", () => {
    // Régression V5 : la coquille sondait le réseau toutes les cinq secondes, sans fin,
    // pour une file que rien ne pouvait plus faire avancer.
    expect(repriseUtile([mutation("echec", TENTATIVES_MAX)])).toBe(false);
  });

  it("reste allumée tant qu'une seule mutation peut partir", () => {
    expect(repriseUtile([
      mutation("synchronise"), mutation("conflit"), mutation("en_attente"),
    ])).toBe(true);
  });
});
