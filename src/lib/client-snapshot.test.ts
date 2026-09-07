// ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1 — couche de lecture.
//
// La capture et l'immuabilité sont prouvées en base
// (supabase/tests/client_document_snapshot_v1.test.sql). Ces tests couvrent la
// règle de LECTURE : quelle identité un document affiche, envoie et exporte.
import { describe, expect, it } from "vitest";
import {
  identiteClientDocument,
  mentionOrigineIdentite,
  nomClientDocument,
} from "@/lib/client-snapshot";

const ficheB = {
  nom: "Après",
  prenom: "Jean",
  societe: "IDENTITE_B_SAS",
  email: "identite-b@invalid.local",
  adresse_facturation: "2 rue Après",
  code_postal: "68000",
  ville: "Colmar",
  siret: "22222222222222",
};

const snapshotA = {
  version: 1,
  client_id: "11111111-1111-1111-1111-111111111111",
  provenance: "emission",
  nom_affiche: "IDENTITE_A_SARL",
  societe: "IDENTITE_A_SARL",
  nom: "Avant",
  prenom: "Jean",
  siret: "11111111111111",
  adresse_facturation: "1 rue Avant",
  code_postal: "67000",
  ville: "Strasbourg",
  email: "identite-a@invalid.local",
  contact: { nom: "Contact Avant", fonction: "Gérant", telephone: null, email: "contact-avant@invalid.local" },
};

describe("identiteClientDocument", () => {
  it("affiche l'identité figée d'un document émis, jamais la fiche client actuelle", () => {
    const identite = identiteClientDocument({ snapshot: snapshotA, fiche: ficheB });
    expect(identite.entete.nom_affiche).toBe("IDENTITE_A_SARL");
    expect(identite.entete.siret).toBe("11111111111111");
    expect(identite.entete.adresse_facturation).toBe("1 rue Avant");
    expect(identite.entete.ville).toBe("Strasbourg");
    expect(identite.origine).toBe("figee");
  });

  it("adresse un renvoi ou un duplicata à l'e-mail figé sur le document", () => {
    expect(identiteClientDocument({ snapshot: snapshotA, fiche: ficheB }).email).toBe(
      "contact-avant@invalid.local",
    );
  });

  it("retombe sur l'e-mail client figé quand le document n'avait pas de contact", () => {
    const sansContact = { ...snapshotA, contact: null };
    expect(identiteClientDocument({ snapshot: sansContact, fiche: ficheB }).email).toBe(
      "identite-a@invalid.local",
    );
  });

  it("lit la fiche client en direct tant que le document est un brouillon", () => {
    const identite = identiteClientDocument({ snapshot: null, fiche: ficheB });
    expect(identite.entete.nom_affiche).toBe("IDENTITE_B_SAS");
    expect(identite.email).toBe("identite-b@invalid.local");
    expect(identite.origine).toBe("fiche_client");
  });

  it("signale une identité reconstituée par le rattrapage des documents antérieurs", () => {
    const identite = identiteClientDocument({
      snapshot: { ...snapshotA, provenance: "backfill_identite_actuelle", identite_incertaine: true },
      fiche: ficheB,
    });
    expect(identite.origine).toBe("figee_reconstituee");
    expect(mentionOrigineIdentite(identite)).toMatch(/reconstituée/);
  });

  it("expose la facture d'origine dont un avoir hérite l'identité", () => {
    const identite = identiteClientDocument({
      snapshot: {
        ...snapshotA,
        provenance: "herite_facture_origine",
        herite_de: { facture_id: "f1", numero: "FAC-2026-0007" },
      },
      fiche: ficheB,
      captureeLe: "2026-09-01T10:00:00.000Z",
    });
    expect(identite.heriteDeFactureNumero).toBe("FAC-2026-0007");
    expect(mentionOrigineIdentite(identite)).toContain("FAC-2026-0007");
  });

  it("recompose un nom d'affichage si le snapshot historique n'en porte pas", () => {
    const identite = identiteClientDocument({
      snapshot: { societe: null, prenom: "Marie", nom: "Durand" },
      fiche: ficheB,
    });
    expect(identite.entete.nom_affiche).toBe("Marie Durand");
  });

  it("ne confond pas un tableau vide renvoyé par une jointure avec un snapshot", () => {
    const identite = identiteClientDocument({ snapshot: [], fiche: ficheB });
    expect(identite.origine).toBe("fiche_client");
    expect(identite.entete.nom_affiche).toBe("IDENTITE_B_SAS");
  });

  it("rend « — » quand ni identité figée ni fiche client ne sont disponibles", () => {
    expect(identiteClientDocument({ snapshot: null, fiche: null }).entete.nom_affiche).toBe("—");
  });
});

describe("nomClientDocument", () => {
  it("sert le nom figé aux listes et aux exports comptables", () => {
    expect(nomClientDocument(snapshotA, ficheB)).toBe("IDENTITE_A_SARL");
  });

  it("sert le nom courant quand le document n'a jamais été émis", () => {
    expect(nomClientDocument(null, ficheB)).toBe("IDENTITE_B_SAS");
  });
});

describe("mentionOrigineIdentite", () => {
  it("annonce à l'utilisateur qu'un brouillon suit encore la fiche client", () => {
    const identite = identiteClientDocument({ snapshot: null, fiche: ficheB });
    expect(mentionOrigineIdentite(identite)).toMatch(/Brouillon/);
  });

  it("annonce la date à laquelle l'identité a été figée", () => {
    const identite = identiteClientDocument({
      snapshot: snapshotA,
      fiche: ficheB,
      captureeLe: "2026-09-01T10:00:00.000Z",
    });
    expect(mentionOrigineIdentite(identite)).toContain("01/09/2026");
  });
});
