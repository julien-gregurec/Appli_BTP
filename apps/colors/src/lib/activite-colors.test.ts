import { describe, expect, it } from "vitest";
import {
  borneDepuis,
  curseurSuivant,
  grouperParJour,
  libelleChamp,
  libelleType,
  lireFamille,
  lireInstant,
  lirePeriode,
  lireUuid,
  resumerEvenement,
  TAILLE_PAGE_ACTIVITE,
  typesDeFamille,
  valeurAffichable,
  type EvenementActiviteColors,
} from "@/lib/activite-colors";

const evenement = (partiel: Partial<EvenementActiviteColors>): EvenementActiviteColors => ({
  id: "11111111-1111-1111-1111-111111111111",
  seau_id: "22222222-2222-2222-2222-222222222222",
  type: "entree",
  created_at: "2026-09-07T10:00:00.000Z",
  motif: null,
  champs_modifies: null,
  quantite_avant: null,
  quantite_apres: null,
  pourcentage_avant: null,
  pourcentage_apres: null,
  unite: null,
  etat_avant: null,
  etat_apres: null,
  emplacement_avant: null,
  emplacement_apres: null,
  auteur_id: null,
  auteur_nom: null,
  seau_marque: "Zolpan",
  seau_produit: "Mat Velours",
  seau_teinte: null,
  seau_couleur_hex: null,
  seau_etat: "ferme",
  ...partiel,
});

describe("lecture des paramètres d’URL", () => {
  it("retombe sur la période par défaut pour toute valeur inconnue", () => {
    expect(lirePeriode("7j")).toBe("7j");
    expect(lirePeriode("tout")).toBe("tout");
    expect(lirePeriode("42j")).toBe("30j");
    expect(lirePeriode(undefined)).toBe("30j");
  });

  it("retombe sur « toute l’activité » pour une famille inconnue", () => {
    expect(lireFamille("ajouts")).toBe("ajouts");
    expect(lireFamille("<script>")).toBe("tout");
  });

  it("ne transmet un identifiant à la base que s’il a la forme d’un UUID", () => {
    expect(lireUuid("3f8a1c22-9c1e-4f2b-8f77-2b0c1d5e6a90")).toBe("3f8a1c22-9c1e-4f2b-8f77-2b0c1d5e6a90");
    expect(lireUuid("' or 1=1 --")).toBeNull();
    expect(lireUuid(12)).toBeNull();
  });

  it("ne transmet une borne de pagination que si elle est une date", () => {
    expect(lireInstant("2026-09-07T10:00:00.000Z")).toBe("2026-09-07T10:00:00.000Z");
    expect(lireInstant("hier")).toBeNull();
    expect(lireInstant("")).toBeNull();
  });
});

describe("bornes de période", () => {
  it("« aujourd’hui » démarre au début de la journée locale", () => {
    const depuis = borneDepuis("aujourdhui", new Date("2026-09-07T18:30:00"));
    const attendu = new Date("2026-09-07T18:30:00");
    attendu.setHours(0, 0, 0, 0);
    expect(depuis).toBe(attendu.toISOString());
  });

  it("recule du bon nombre de jours", () => {
    const reference = new Date("2026-09-07T18:30:00");
    const sept = new Date(borneDepuis("7j", reference)!);
    const trente = new Date(borneDepuis("30j", reference)!);
    expect(sept.getDate()).toBe(31);
    expect(trente.getMonth()).toBe(7);
    expect(borneDepuis("tout", reference)).toBeNull();
  });
});

describe("familles d’événements", () => {
  it("ne filtre rien pour « toute l’activité »", () => {
    expect(typesDeFamille("tout")).toBeNull();
  });

  it("regroupe les modifications descriptives et les changements de photo", () => {
    expect(typesDeFamille("modifications")).toEqual(["modification", "photo"]);
  });

  it("assimile la suppression à la mise en corbeille", () => {
    expect(typesDeFamille("suppressions")).toEqual(["archivage"]);
    expect(typesDeFamille("restaurations")).toEqual(["restauration"]);
  });

  it("sépare les ajouts des mouvements de stock", () => {
    expect(typesDeFamille("ajouts")).toEqual(["entree"]);
    expect(typesDeFamille("mouvements")).not.toContain("entree");
  });
});

describe("mise en mots des événements", () => {
  it("nomme chaque type en français", () => {
    expect(libelleType("entree")).toBe("Ajouté");
    expect(libelleType("archivage")).toBe("Supprimé (corbeille)");
    expect(libelleType("restauration")).toBe("Restauré");
    expect(libelleType("modification")).toBe("Modifié");
  });

  it("nomme chaque champ modifiable", () => {
    expect(libelleChamp("teinte_nom")).toBe("Teinte");
    expect(libelleChamp("inconnu")).toBe("inconnu");
  });

  it("affiche « — » plutôt que rien pour une valeur absente", () => {
    expect(valeurAffichable(null)).toBe("—");
    expect(valeurAffichable("  ")).toBe("—");
    expect(valeurAffichable("Blanc")).toBe("Blanc");
  });

  it("résume une modification par les champs touchés", () => {
    const resume = resumerEvenement(evenement({
      type: "modification",
      champs_modifies: [{ champ: "produit", avant: "Mat", apres: "Satin" }, { champ: "notes", avant: null, apres: "x" }],
    }));
    expect(resume).toBe("Produit, Notes");
  });

  it("résume un déplacement par ses deux emplacements", () => {
    expect(resumerEvenement(evenement({ type: "deplacement", emplacement_avant: "Dépôt", emplacement_apres: "Camion" })))
      .toBe("Dépôt → Camion");
  });

  it("résume une consommation par la quantité avant et après", () => {
    expect(resumerEvenement(evenement({ type: "consommation", quantite_avant: 10, quantite_apres: 4, unite: "l" })))
      .toBe("10 l → 4 l");
  });

  it("résume un changement d’état lorsque rien d’autre ne bouge", () => {
    expect(resumerEvenement(evenement({ type: "ouverture", etat_avant: "ferme", etat_apres: "ouvert" })))
      .toBe("ferme → ouvert");
  });
});

describe("timeline et pagination", () => {
  it("regroupe les événements par journée en conservant l’ordre reçu", () => {
    const groupes = grouperParJour([
      evenement({ id: "a", created_at: "2026-09-07T10:00:00.000Z" }),
      evenement({ id: "b", created_at: "2026-09-07T08:00:00.000Z" }),
      evenement({ id: "c", created_at: "2026-09-05T08:00:00.000Z" }),
    ]);
    expect(groupes.map((g) => g.jour)).toEqual(["2026-09-07", "2026-09-05"]);
    expect(groupes[0].evenements.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("ne propose pas de page suivante quand la page reçue n’est pas pleine", () => {
    expect(curseurSuivant([evenement({})])).toBeNull();
  });

  it("propose le dernier événement comme curseur quand la page est pleine", () => {
    const page = Array.from({ length: TAILLE_PAGE_ACTIVITE }, (_, index) =>
      evenement({ id: `id-${index}`, created_at: `2026-09-07T10:00:${String(index).padStart(2, "0")}.000Z` }));
    expect(curseurSuivant(page)).toEqual({ avant: page[page.length - 1].created_at, avantId: page[page.length - 1].id });
  });
});
