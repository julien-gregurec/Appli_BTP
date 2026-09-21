import { describe, expect, it } from "vitest";
import {
  aEnvoyer, creerMutation, doitAbandonner, ecrasementAutorise, envoyableSous,
  estCleIdempotence, estEnSuspens, etatApresReponse, ETATS_MUTATION, LIBELLES_ETAT,
  LIBELLES_TYPE, nouvelleCle, peutAnnuler, peutReessayer, politiquePour,
  POLITIQUES_CONFLIT, TENTATIVES_MAX, transitionAutorisee, TYPES_MUTATION,
  VERSION_PAYLOAD, type EtatMutation, type Mutation,
} from "./contrat";

const A = { entrepriseId: "a0000000-0000-0000-0000-000000000001", utilisateurId: "10000000-0000-0000-0000-000000000001" };
const B = { entrepriseId: "b0000000-0000-0000-0000-000000000001", utilisateurId: "20000000-0000-0000-0000-000000000001" };

function mutation(surcharge: Partial<Mutation> = {}): Mutation {
  return {
    ...creerMutation({
      type: "commentaire_ajouter", entrepriseId: A.entrepriseId,
      utilisateurId: A.utilisateurId, reserveId: "e5000000-0000-0000-0000-000000000101",
      chantierId: null, payload: { contenu: "essai" },
    }),
    ...surcharge,
  };
}

describe("clés d'idempotence", () => {
  it("produit une clé au format attendu par la base", () => {
    expect(estCleIdempotence(nouvelleCle())).toBe(true);
  });
  it("ne produit jamais deux fois la même", () => {
    expect(new Set(Array.from({ length: 500 }, nouvelleCle)).size).toBe(500);
  });
  it("refuse ce qui n'est pas une clé plutôt que de le transmettre", () => {
    for (const v of ["", "abc", null, undefined, 42, {}, "zzzzzzzz-0000-0000-0000-000000000000"]) {
      expect(estCleIdempotence(v)).toBe(false);
    }
  });
});

describe("machine à états de la file", () => {
  it("nomme les sept états du contrat", () => {
    expect(ETATS_MUTATION).toEqual([
      "brouillon", "en_attente", "en_cours", "synchronise", "echec", "conflit", "annule",
    ]);
    for (const etat of ETATS_MUTATION) expect(LIBELLES_ETAT[etat]).toBeTruthy();
  });

  it("suit le chemin normal brouillon → en attente → en cours → synchronisé", () => {
    expect(transitionAutorisee("brouillon", "en_attente")).toBe(true);
    expect(transitionAutorisee("en_attente", "en_cours")).toBe(true);
    expect(transitionAutorisee("en_cours", "synchronise")).toBe(true);
  });

  it("laisse un envoi interrompu retourner en file", () => {
    expect(transitionAutorisee("en_cours", "en_attente")).toBe(true);
  });

  it("ne renvoie JAMAIS une mutation déjà acquittée", () => {
    // C'est le seul scénario capable de produire un doublon malgré l'idempotence.
    for (const cible of ETATS_MUTATION) {
      expect(transitionAutorisee("synchronise", cible)).toBe(false);
    }
  });

  it("ne rejoue pas un conflit comme s'il s'agissait d'une panne réseau", () => {
    expect(transitionAutorisee("conflit", "en_attente")).toBe(false);
    expect(peutReessayer("conflit")).toBe(false);
    // Un conflit ne se débloque que par une décision : l'annulation reste possible.
    expect(peutAnnuler("conflit")).toBe(true);
  });

  it("n'autorise la reprise que sur un échec", () => {
    const attendu: Record<EtatMutation, boolean> = {
      brouillon: false, en_attente: false, en_cours: false,
      synchronise: false, echec: true, conflit: false, annule: false,
    };
    for (const etat of ETATS_MUTATION) expect(peutReessayer(etat)).toBe(attendu[etat]);
  });

  it("compte comme « en suspens » tout ce qui n'est ni transmis ni abandonné", () => {
    expect(estEnSuspens("brouillon")).toBe(true);
    expect(estEnSuspens("en_attente")).toBe(true);
    expect(estEnSuspens("en_cours")).toBe(true);
    expect(estEnSuspens("echec")).toBe(true);
    expect(estEnSuspens("conflit")).toBe(true);
    expect(estEnSuspens("synchronise")).toBe(false);
    expect(estEnSuspens("annule")).toBe(false);
  });
});

describe("création d'une mutation", () => {
  it("porte tout ce que le contrat exige", () => {
    const m = mutation();
    expect(estCleIdempotence(m.id)).toBe(true);
    expect(m.version).toBe(VERSION_PAYLOAD);
    expect(m.tentatives).toBe(0);
    expect(m.derniereErreur).toBeNull();
    expect(m.identifiantServeur).toBeNull();
    expect(new Date(m.creeeA).toString()).not.toBe("Invalid Date");
    expect(m.entrepriseId).toBe(A.entrepriseId);
    expect(m.utilisateurId).toBe(A.utilisateurId);
  });

  it("nomme chaque type réellement pris en charge", () => {
    expect(TYPES_MUTATION).toEqual([
      "reserve_creer", "commentaire_ajouter", "photo_ajouter", "levee_demander",
    ]);
    for (const type of TYPES_MUTATION) expect(LIBELLES_TYPE[type]).toBeTruthy();
  });
});

describe("cloisonnement par identité", () => {
  it("n'envoie une mutation que sous l'identité qui l'a préparée", () => {
    expect(envoyableSous(mutation(), A)).toBe(true);
  });

  it("refuse un autre utilisateur du MÊME tenant", () => {
    expect(envoyableSous(mutation(), {
      entrepriseId: A.entrepriseId, utilisateurId: B.utilisateurId,
    })).toBe(false);
  });

  it("refuse le même utilisateur sous un AUTRE tenant", () => {
    expect(envoyableSous(mutation(), {
      entrepriseId: B.entrepriseId, utilisateurId: A.utilisateurId,
    })).toBe(false);
  });

  it("refuse une session sans identité complète", () => {
    expect(envoyableSous(mutation(), { entrepriseId: null, utilisateurId: A.utilisateurId })).toBe(false);
    expect(envoyableSous(mutation(), { entrepriseId: A.entrepriseId, utilisateurId: null })).toBe(false);
  });

  it("écarte de l'envoi toute mutation d'une autre identité", () => {
    const file = [
      mutation({ id: nouvelleCle(), etat: "en_attente" }),
      mutation({ id: nouvelleCle(), etat: "en_attente", entrepriseId: B.entrepriseId }),
      mutation({ id: nouvelleCle(), etat: "en_attente", utilisateurId: B.utilisateurId }),
    ];
    const retenues = aEnvoyer(file, A);
    expect(retenues).toHaveLength(1);
    expect(retenues[0].entrepriseId).toBe(A.entrepriseId);
    expect(retenues[0].utilisateurId).toBe(A.utilisateurId);
  });
});

describe("sélection des mutations à envoyer", () => {
  it("ne retient que celles réellement en attente", () => {
    const file = ETATS_MUTATION.map((etat) => mutation({ id: nouvelleCle(), etat }));
    const retenues = aEnvoyer(file, A);
    expect(retenues).toHaveLength(1);
    expect(retenues[0].etat).toBe("en_attente");
  });

  it("respecte l'ordre de saisie", () => {
    const file = [
      mutation({ id: nouvelleCle(), etat: "en_attente", creeeA: "2026-09-07T12:00:00.000Z" }),
      mutation({ id: nouvelleCle(), etat: "en_attente", creeeA: "2026-09-07T10:00:00.000Z" }),
      mutation({ id: nouvelleCle(), etat: "en_attente", creeeA: "2026-09-07T11:00:00.000Z" }),
    ];
    expect(aEnvoyer(file, A).map((m) => m.creeeA)).toEqual([
      "2026-09-07T10:00:00.000Z", "2026-09-07T11:00:00.000Z", "2026-09-07T12:00:00.000Z",
    ]);
  });
});

describe("classement des réponses serveur", () => {
  it("traite un REJEU comme un succès", () => {
    // Le premier envoi avait abouti ; seul son accusé s'est perdu. Présenter cela comme
    // un échec pousserait à ressaisir une action déjà enregistrée.
    expect(etatApresReponse({ issue: "rejeu", identifiant: "x" })).toBe("synchronise");
    expect(etatApresReponse({ issue: "applique", identifiant: "x" })).toBe("synchronise");
  });

  it("isole le conflit, qui n'est pas une panne", () => {
    expect(etatApresReponse({ issue: "conflit", motif: "levée déjà validée" })).toBe("conflit");
  });

  it("laisse un refus métier en échec : il attend une décision", () => {
    expect(etatApresReponse({ issue: "refus", motif: "x" })).toBe("echec");
  });

  it("remet en file une coupure réseau, qui se répare toute seule", () => {
    // Exiger un clic pour se remettre d'une coupure de trente secondes serait absurde
    // sur un chantier : la file repart d'elle-même au passage suivant.
    expect(etatApresReponse({ issue: "reseau", motif: "x" }, 1)).toBe("en_attente");
    expect(etatApresReponse({ issue: "reseau", motif: "x" }, TENTATIVES_MAX - 1)).toBe("en_attente");
  });

  it("cesse d'insister au plafond de tentatives", () => {
    expect(etatApresReponse({ issue: "reseau", motif: "x" }, TENTATIVES_MAX)).toBe("echec");
  });

  it("plafonne les tentatives pour ne pas boucler sur un refus définitif", () => {
    expect(doitAbandonner({ tentatives: TENTATIVES_MAX - 1 })).toBe(false);
    expect(doitAbandonner({ tentatives: TENTATIVES_MAX })).toBe(true);
  });
});

describe("politique de conflit", () => {
  it("laisse le workflow et l'historique à la base", () => {
    expect(politiquePour("statut_reserve")).toBe("serveur_gagne");
    expect(politiquePour("historique")).toBe("serveur_gagne");
  });

  it("exige un arbitrage humain sur une levée validée", () => {
    expect(politiquePour("levee_validee")).toBe("conflit_manuel");
  });

  it("n'écrase JAMAIS une réserve levée, quelle que soit la donnée", () => {
    for (const nature of Object.keys(POLITIQUES_CONFLIT) as (keyof typeof POLITIQUES_CONFLIT)[]) {
      expect(ecrasementAutorise(nature, "levee")).toBe(false);
    }
  });

  it("n'autorise la reprise locale que là où le terrain fait foi", () => {
    expect(ecrasementAutorise("description_saisie_terrain", "assignee")).toBe(true);
    expect(ecrasementAutorise("photo", "acceptee")).toBe(true);
    expect(ecrasementAutorise("statut_reserve", "assignee")).toBe(false);
  });
});
