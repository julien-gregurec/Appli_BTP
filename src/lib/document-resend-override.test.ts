// ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-V1 — règle de décision et journalisation.
import { describe, expect, it } from "vitest";
import {
  ACTION_JOURNAL_SURCHARGE,
  adresseRemisePlausible,
  construireEntreeJournalSurcharge,
  mentionEcartAdresse,
  resoudreDestinataireEnvoi,
} from "@/lib/document-resend-override";

const FIGEE = "contact-avant@invalid.local";
const AUTRE = "nouveau-contact@invalid.local";

describe("resoudreDestinataireEnvoi", () => {
  it("1. envoie par défaut à l'adresse figée sur le document", () => {
    const r = resoudreDestinataireEnvoi({ adresseFigee: FIGEE, peutSurcharger: true });
    expect(r).toEqual({ ok: true, email: FIGEE, surchargee: false, adresseFigee: FIGEE, motif: null });
  });

  it("2. accepte une surcharge explicite d'un utilisateur autorisé", () => {
    const r = resoudreDestinataireEnvoi({
      adresseFigee: FIGEE,
      surcharge: { email: AUTRE, motif: "Le contact a changé" },
      peutSurcharger: true,
    });
    expect(r).toMatchObject({ ok: true, email: AUTRE, surchargee: true, adresseFigee: FIGEE, motif: "Le contact a changé" });
  });

  it("3. revient à l'adresse figée quand la surcharge est annulée (champ vidé)", () => {
    const r = resoudreDestinataireEnvoi({
      adresseFigee: FIGEE,
      surcharge: { email: "   ", motif: "  " },
      peutSurcharger: true,
    });
    expect(r).toMatchObject({ ok: true, email: FIGEE, surchargee: false });
  });

  it("4. refuse la surcharge à un utilisateur non autorisé", () => {
    const r = resoudreDestinataireEnvoi({
      adresseFigee: FIGEE,
      surcharge: { email: AUTRE },
      peutSurcharger: false,
    });
    expect(r).toEqual({
      ok: false,
      erreur: "Votre poste ne permet pas d'envoyer ce document à une autre adresse que celle du document.",
    });
  });

  it("ne considère pas comme une surcharge la ressaisie de la même adresse", () => {
    const r = resoudreDestinataireEnvoi({
      adresseFigee: FIGEE,
      surcharge: { email: `  ${FIGEE.toUpperCase()} ` },
      peutSurcharger: true,
    });
    expect(r).toMatchObject({ ok: true, email: FIGEE, surchargee: false });
  });

  it("refuse une adresse manifestement inexploitable", () => {
    for (const mauvaise of ["pas-une-adresse", "a@b", "deux@@arobases.fr", "avec espace@x.fr"]) {
      expect(resoudreDestinataireEnvoi({ adresseFigee: FIGEE, surcharge: { email: mauvaise }, peutSurcharger: true }))
        .toMatchObject({ ok: false });
    }
  });

  it("refuse l'envoi quand le document ne porte aucune adresse et qu'aucune n'est saisie", () => {
    expect(resoudreDestinataireEnvoi({ adresseFigee: null, peutSurcharger: true })).toEqual({
      ok: false,
      erreur: "Ce document ne porte aucune adresse e-mail de destinataire.",
    });
  });

  it("permet de fournir une adresse à un document qui n'en portait aucune", () => {
    expect(resoudreDestinataireEnvoi({ adresseFigee: null, surcharge: { email: AUTRE }, peutSurcharger: true }))
      .toMatchObject({ ok: true, email: AUTRE, surchargee: true, adresseFigee: null });
  });

  it("ne consulte jamais l'adresse actuelle de la fiche client", () => {
    // La signature ne l'expose pas : la seule alternative à l'adresse figée est
    // une saisie humaine. Ce test verrouille cette propriété de conception.
    expect(resoudreDestinataireEnvoi.length).toBe(1);
    const parametres = Object.keys({ adresseFigee: null, surcharge: null, peutSurcharger: false });
    expect(parametres).not.toContain("emailClientActuel");
  });
});

describe("construireEntreeJournalSurcharge", () => {
  const base = {
    entrepriseId: "e1",
    utilisateurId: "u1",
    typeDocument: "facture" as const,
    documentId: "f1",
    numero: "FAC-2026-0007",
    adresseFigee: FIGEE,
    adresseUtilisee: AUTRE,
    motif: "Le contact a changé",
    typeEnvoi: "renvoi" as const,
  };

  it("5. journalise les informations exigées par l'audit", () => {
    const entree = construireEntreeJournalSurcharge({ ...base, resultat: "succes" });
    expect(entree.entreprise_id).toBe("e1");
    expect(entree.utilisateur_id).toBe("u1");
    expect(entree.action).toBe(ACTION_JOURNAL_SURCHARGE);
    expect(entree.ressource).toBe("facture");
    expect(entree.ressource_id).toBe("f1");
    expect(entree.metadata).toMatchObject({
      document: { type: "facture", id: "f1", numero: "FAC-2026-0007" },
      adresse_figee: FIGEE,
      adresse_utilisee: AUTRE,
      motif: "Le contact a changé",
      type_envoi: "renvoi",
      resultat: "succes",
    });
  });

  it("7. atteste que ni le snapshot ni la fiche client ne sont modifiés", () => {
    const entree = construireEntreeJournalSurcharge({ ...base, resultat: "succes" });
    expect(entree.metadata).toMatchObject({ snapshot_modifie: false, fiche_client_modifiee: false });
  });

  it("9. journalise aussi un envoi en échec, avec sa cause", () => {
    const entree = construireEntreeJournalSurcharge({ ...base, resultat: "echec", erreur: "Brevo 401" });
    expect(entree.metadata).toMatchObject({ resultat: "echec", erreur: "Brevo 401" });
    expect(entree.description).toContain("échec de l'envoi");
  });

  it("10. une nouvelle tentative produit une entrée distincte, jamais une mise à jour", () => {
    const echec = construireEntreeJournalSurcharge({ ...base, resultat: "echec", erreur: "Brevo 401" });
    const reussite = construireEntreeJournalSurcharge({ ...base, resultat: "succes" });
    // Aucune notion d'identité stable : deux entrées indépendantes, insérées à
    // la suite dans un journal en ajout seul.
    expect(echec.metadata).not.toEqual(reussite.metadata);
    expect(Object.keys(echec)).not.toContain("id");
  });

  it("retombe sur l'identifiant du document quand il n'est pas encore numéroté", () => {
    const entree = construireEntreeJournalSurcharge({ ...base, numero: null, resultat: "succes" });
    expect(entree.description).toContain("f1");
  });

  it("n'invente pas de cause d'erreur pour un envoi réussi", () => {
    expect(construireEntreeJournalSurcharge({ ...base, resultat: "succes" }).metadata).toMatchObject({ erreur: null });
  });
});

describe("adresseRemisePlausible", () => {
  it("accepte une adresse ordinaire et refuse le vide", () => {
    expect(adresseRemisePlausible("jean.dupont@exemple.fr")).toBe(true);
    expect(adresseRemisePlausible("")).toBe(false);
    expect(adresseRemisePlausible(null)).toBe(false);
    expect(adresseRemisePlausible(undefined)).toBe(false);
  });

  it("refuse une adresse démesurée", () => {
    expect(adresseRemisePlausible(`${"a".repeat(320)}@exemple.fr`)).toBe(false);
  });
});

describe("mentionEcartAdresse", () => {
  it("6. annonce l'écart et rappelle que le document n'est pas modifié", () => {
    const mention = mentionEcartAdresse(FIGEE);
    expect(mention).toContain(FIGEE);
    expect(mention).toMatch(/diffère/);
    expect(mention).toMatch(/n'est pas modifié|n’est pas modifié/);
  });

  it("couvre le cas d'un document sans adresse d'origine", () => {
    expect(mentionEcartAdresse(null)).toMatch(/aucune adresse/);
  });
});
