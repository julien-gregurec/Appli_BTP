import { describe, expect, it } from "vitest";
import {
  delaiAvantNouvelleTentative,
  estCleIdempotence,
  estEnSuspens,
  estTypeMutation,
  etatApresReponse,
  ETATS_MUTATION,
  LIBELLES_ETAT,
  nouvelleCle,
  peutAnnuler,
  peutPartirSous,
  peutReessayer,
  transitionAutorisee,
  type EtatMutation,
} from "@/lib/mobile/offline/contrat";

describe("clé d'idempotence", () => {
  it("n'accepte qu'un uuid", () => {
    expect(estCleIdempotence("3f2504e0-4f89-41d3-9a0c-0305e82c3301")).toBe(true);
    expect(estCleIdempotence("pas-un-uuid")).toBe(false);
    expect(estCleIdempotence(42)).toBe(false);
    expect(estCleIdempotence(null)).toBe(false);
  });

  it("produit des clés distinctes et valides", () => {
    const cles = new Set(Array.from({ length: 200 }, nouvelleCle));
    expect(cles.size).toBe(200);
    for (const cle of cles) expect(estCleIdempotence(cle)).toBe(true);
  });
});

describe("table de transitions", () => {
  it("interdit de renvoyer une mutation déjà acquittée", () => {
    // LA règle centrale. Sans elle, une reprise maladroite qui remettrait un pointage
    // d'arrivée acquitté en file créerait une SECONDE session ouverte pour le même salarié.
    for (const etat of ETATS_MUTATION) {
      expect(transitionAutorisee("synchronise", etat)).toBe(false);
    }
  });

  it("interdit de réessayer un conflit comme une panne réseau", () => {
    // Un conflit signifie que l'état serveur a changé : il exige une décision humaine.
    // Le rejouer en boucle ne le résoudrait jamais et masquerait le besoin d'arbitrage.
    expect(transitionAutorisee("conflit", "en_attente")).toBe(false);
    expect(transitionAutorisee("conflit", "en_cours")).toBe(false);
    expect(peutReessayer("conflit")).toBe(false);
    // Il ne reste qu'une issue : l'abandonner explicitement.
    expect(transitionAutorisee("conflit", "annule")).toBe(true);
  });

  it("laisse un envoi interrompu repartir seul", () => {
    // Sans ce chemin, une coupure de trois secondes exigerait un geste humain pour repartir.
    expect(transitionAutorisee("en_cours", "en_attente")).toBe(true);
  });

  it("ne rend réessayable que l'échec", () => {
    const reessayables = ETATS_MUTATION.filter(peutReessayer);
    expect(reessayables).toEqual(["echec"]);
  });

  it("n'autorise l'annulation que tant que rien n'est parti", () => {
    expect(peutAnnuler("en_attente")).toBe(true);
    expect(peutAnnuler("echec")).toBe(true);
    expect(peutAnnuler("conflit")).toBe(true);
    // Une mutation en cours d'envoi ou déjà acquittée ne s'annule plus côté appareil :
    // le serveur, lui, l'a peut-être déjà appliquée.
    expect(peutAnnuler("en_cours")).toBe(false);
    expect(peutAnnuler("synchronise")).toBe(false);
  });

  it("ne laisse aucun état sans libellé affichable", () => {
    for (const etat of ETATS_MUTATION) {
      expect(LIBELLES_ETAT[etat as EtatMutation]).toBeTruthy();
    }
  });

  it("compte comme « en suspens » tout ce qui n'est ni parti ni abandonné", () => {
    expect(estEnSuspens("en_attente")).toBe(true);
    expect(estEnSuspens("echec")).toBe(true);
    expect(estEnSuspens("conflit")).toBe(true);
    expect(estEnSuspens("synchronise")).toBe(false);
    expect(estEnSuspens("annule")).toBe(false);
  });
});

describe("classement d'une réponse serveur", () => {
  it("traite « déjà appliqué » exactement comme « appliqué »", () => {
    // Cœur de l'idempotence : du point de vue de l'appareil, « le serveur vient de
    // l'enregistrer » et « il l'avait déjà enregistré » sont le même succès. Les
    // distinguer ferait rejouer sans fin une mutation dont la réponse s'est perdue.
    expect(etatApresReponse("applique")).toBe("synchronise");
    expect(etatApresReponse("rejeu")).toBe("synchronise");
  });

  it("renvoie en file — et non en échec — quand le service n'a pas répondu", () => {
    // Marquer un échec exigerait un geste humain pour une coupure de trois secondes.
    expect(etatApresReponse("indisponible")).toBe("en_attente");
  });

  it("distingue un refus d'un conflit", () => {
    expect(etatApresReponse("refus")).toBe("echec");
    expect(etatApresReponse("conflit")).toBe("conflit");
  });
});

describe("refus d'envoi sous une autre identité", () => {
  const preparee = { entrepriseId: "ent-a", utilisateurId: "usr-1" };

  it("laisse partir sous l'identité qui a préparé la saisie", () => {
    expect(peutPartirSous(preparee, { entrepriseId: "ent-a", utilisateurId: "usr-1" })).toBe(true);
  });

  it("refuse un autre utilisateur de la même entreprise", () => {
    // Le téléphone de chantier que deux salariés se passent dans la journée.
    expect(peutPartirSous(preparee, { entrepriseId: "ent-a", utilisateurId: "usr-2" })).toBe(false);
  });

  it("refuse la même personne sous une autre entreprise", () => {
    // L'intérimaire déclaré chez deux sociétés du même groupe.
    expect(peutPartirSous(preparee, { entrepriseId: "ent-b", utilisateurId: "usr-1" })).toBe(false);
  });
});

describe("types de mutation", () => {
  it("n'accepte que le périmètre V1 terrain arbitré", () => {
    expect(estTypeMutation("pointage_arrivee")).toBe(true);
    expect(estTypeMutation("pointage_depart")).toBe(true);
    expect(estTypeMutation("note_frais_brouillon")).toBe(true);
    // Une file qui accepte « tout » finit par transporter des gestes dont personne n'a
    // vérifié qu'ils supportent d'être rejoués.
    expect(estTypeMutation("supprimer_chantier")).toBe(false);
    expect(estTypeMutation("valider_facture")).toBe(false);
  });
});

describe("délai avant nouvelle tentative", () => {
  it("croît avec le nombre de tentatives", () => {
    expect(delaiAvantNouvelleTentative(1)).toBeLessThan(delaiAvantNouvelleTentative(2));
    expect(delaiAvantNouvelleTentative(2)).toBeLessThan(delaiAvantNouvelleTentative(3));
  });

  it("plafonne à cinq minutes", () => {
    // Sans plafond, un appareil resté hors ligne une nuit attendrait des heures avant de
    // retenter, alors que le réseau est revenu depuis longtemps.
    expect(delaiAvantNouvelleTentative(50)).toBe(5 * 60_000);
    expect(delaiAvantNouvelleTentative(1000)).toBe(5 * 60_000);
  });

  it("reste défini pour une valeur nulle ou négative", () => {
    expect(delaiAvantNouvelleTentative(0)).toBeGreaterThan(0);
    expect(delaiAvantNouvelleTentative(-3)).toBeGreaterThan(0);
  });
});

describe("perte de session", () => {
  // Importé ici pour ne pas toucher à l'en-tête du fichier.
  const verifier = async () => (await import("@/lib/mobile/offline/contrat")).reponseEstPerteDeSession;

  it("reconnaît la page de connexion servie en 200 après redirection", async () => {
    // Le cas RÉEL : le proxy redirige vers /login, fetch suit, et reçoit du HTML en 200.
    const f = await verifier();
    expect(f({ status: 200, redirected: true, contentType: "text/html; charset=utf-8" })).toBe(true);
  });

  it("reconnaît un succès qui n'est pas du JSON", async () => {
    const f = await verifier();
    expect(f({ status: 200, redirected: false, contentType: "text/html" })).toBe(true);
  });

  it("reconnaît le 401 explicite", async () => {
    const f = await verifier();
    expect(f({ status: 401, redirected: false, contentType: "application/json" })).toBe(true);
  });

  it("ne confond pas une vraie réponse d'API avec une perte de session", async () => {
    const f = await verifier();
    expect(f({ status: 200, redirected: false, contentType: "application/json; charset=utf-8" })).toBe(false);
    expect(f({ status: 409, redirected: false, contentType: "application/json" })).toBe(false);
    expect(f({ status: 503, redirected: false, contentType: "application/json" })).toBe(false);
  });
});
