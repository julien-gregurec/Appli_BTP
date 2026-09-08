import { describe, expect, it } from "vitest";
import {
  modificationAutoriseeApresPublication,
  statutCalcule,
  transitionAutorisee,
  validerCommunication,
  type BrouillonCommunication,
} from "./communications";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function brouillon(surcharge: Partial<BrouillonCommunication> = {}): BrouillonCommunication {
  return {
    titre: "Maintenance planifiée",
    texteCourt: "Interruption jeudi de 22 h à 23 h.",
    type: "interruption_planifiee",
    priorite: "haute",
    debutAt: "2026-09-10T20:00:00.000Z",
    finAt: "2026-09-11T06:00:00.000Z",
    modeAffichage: "banniere",
    frequence: "une_seule_fois",
    canaux: ["in_app"],
    ...surcharge,
  };
}

describe("validerCommunication", () => {
  it("accepte un message texte seul", () => {
    const r = validerCommunication(brouillon());
    expect(r).toMatchObject({ valide: true });
    expect(r.valide && r.communication.image).toBeNull();
    expect(r.valide && r.communication.lien).toBeNull();
  });

  it("accepte texte + image", () => {
    const r = validerCommunication(
      brouillon({
        image: {
          octets: PNG,
          mimeDeclare: "image/png",
          largeur: 1200,
          hauteur: 675,
          texteAlternatif: "Écran de maintenance",
        },
      }),
    );
    expect(r).toMatchObject({ valide: true });
    expect(r.valide && r.communication.image?.format).toBe("png");
  });

  it("accepte texte + bouton", () => {
    const r = validerCommunication(
      brouillon({ lien: "https://app.elsatia.fr/abonnement", libelleBouton: "Voir mon abonnement" }),
    );
    expect(r).toMatchObject({ valide: true });
  });

  it("refuse un bouton sans lien et un lien sans bouton", () => {
    expect(validerCommunication(brouillon({ libelleBouton: "Cliquez" }))).toMatchObject({
      valide: false,
      champ: "lien",
    });
    expect(validerCommunication(brouillon({ lien: "https://app.elsatia.fr/x" }))).toMatchObject({
      valide: false,
      champ: "libelleBouton",
    });
  });

  it("refuse une publicité bloquante", () => {
    const r = validerCommunication(
      brouillon({ type: "commerciale", modeAffichage: "bloquant", finAt: null }),
    );
    expect(r).toMatchObject({ valide: false, champ: "modeAffichage" });
  });

  it("accepte un message de sécurité bloquant", () => {
    const r = validerCommunication(brouillon({ type: "securite", modeAffichage: "bloquant" }));
    expect(r).toMatchObject({ valide: true });
  });

  it("marque une communication commerciale comme refusable et un message de sécurité comme non refusable", () => {
    const pub = validerCommunication(brouillon({ type: "commerciale" }));
    expect(pub.valide && pub.communication.refusable).toBe(true);
    const secu = validerCommunication(brouillon({ type: "securite" }));
    expect(secu.valide && secu.communication.refusable).toBe(false);
  });

  it("refuse une fenêtre incohérente", () => {
    expect(
      validerCommunication(brouillon({ finAt: "2026-09-09T20:00:00.000Z" })),
    ).toMatchObject({ valide: false, champ: "finAt" });
  });

  it("refuse un titre contenant du HTML", () => {
    expect(validerCommunication(brouillon({ titre: "<b>Alerte</b>" }))).toMatchObject({
      valide: false,
      champ: "titre",
    });
  });

  it("refuse un lien hors domaine ELSATIA", () => {
    expect(
      validerCommunication(brouillon({ lien: "https://evil.example/x", libelleBouton: "Voir" })),
    ).toMatchObject({ valide: false, champ: "lien" });
  });

  it("exige au moins un canal", () => {
    expect(validerCommunication(brouillon({ canaux: [] }))).toMatchObject({ valide: false, champ: "canaux" });
  });
});

describe("cycle de vie", () => {
  it("autorise les transitions attendues", () => {
    expect(transitionAutorisee("brouillon", "publier")).toBe(true);
    expect(transitionAutorisee("publiee", "mettre_en_pause")).toBe(true);
    expect(transitionAutorisee("en_pause", "reprendre")).toBe(true);
    expect(transitionAutorisee("publiee", "archiver")).toBe(true);
  });

  it("refuse de republier une communication archivée", () => {
    expect(transitionAutorisee("archivee", "publier")).toBe(false);
    expect(transitionAutorisee("archivee", "reprendre")).toBe(false);
    expect(transitionAutorisee("archivee", "dupliquer")).toBe(true);
  });

  it("interdit la modification silencieuse du contenu après publication", () => {
    expect(modificationAutoriseeApresPublication("titre")).toBe(false);
    expect(modificationAutoriseeApresPublication("image")).toBe(false);
    expect(modificationAutoriseeApresPublication("finAt")).toBe(true);
  });

  it("calcule expiration et programmation", () => {
    const fenetre = { debutAt: "2026-09-10T20:00:00.000Z", finAt: "2026-09-11T06:00:00.000Z" };
    expect(statutCalcule("publiee", fenetre, new Date("2026-09-09T00:00:00.000Z"))).toBe("programmee");
    expect(statutCalcule("publiee", fenetre, new Date("2026-09-10T22:00:00.000Z"))).toBe("publiee");
    expect(statutCalcule("publiee", fenetre, new Date("2026-09-12T00:00:00.000Z"))).toBe("expiree");
    expect(statutCalcule("archivee", fenetre, new Date("2026-09-12T00:00:00.000Z"))).toBe("archivee");
  });
});
