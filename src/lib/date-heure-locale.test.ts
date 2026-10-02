import { afterEach, describe, expect, it } from "vitest";
import {
  FUSEAU_REFERENCE,
  fuseauValide,
  instantDepuisDateHeureLocale,
  lireDateHeureFormulaire,
  valeurDateHeureDansFuseau,
} from "./date-heure-locale";

// V9-01 (post-V9) : contrat explicite des champs datetime-local. Les attendus sont des
// instants UTC calculés à la main, indépendants du fuseau du processus de test.

const TZ_INITIAL = process.env.TZ;
afterEach(() => {
  if (TZ_INITIAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_INITIAL;
});

const CAS: Array<{ fuseau: string; murale: string; utc: string }> = [
  // Europe/Paris : heure d'hiver (+01:00) et d'été (+02:00)
  { fuseau: "Europe/Paris", murale: "2026-01-15T09:00", utc: "2026-01-15T08:00:00.000Z" },
  { fuseau: "Europe/Paris", murale: "2026-07-15T09:00", utc: "2026-07-15T07:00:00.000Z" },
  // UTC
  { fuseau: "UTC", murale: "2026-07-15T09:00", utc: "2026-07-15T09:00:00.000Z" },
  // Fuseau positif différent : Asia/Tokyo (+09:00, sans heure d'été)
  { fuseau: "Asia/Tokyo", murale: "2026-07-15T09:00", utc: "2026-07-15T00:00:00.000Z" },
  { fuseau: "Asia/Tokyo", murale: "2026-01-01T03:30", utc: "2025-12-31T18:30:00.000Z" },
  // Fuseau négatif : America/New_York (-05:00 hiver, -04:00 été)
  { fuseau: "America/New_York", murale: "2026-01-15T09:00", utc: "2026-01-15T14:00:00.000Z" },
  { fuseau: "America/New_York", murale: "2026-07-15T21:45", utc: "2026-07-16T01:45:00.000Z" },
  // Demi-heure : Asia/Kolkata (+05:30)
  { fuseau: "Asia/Kolkata", murale: "2026-07-15T09:00", utc: "2026-07-15T03:30:00.000Z" },
];

describe("V9-01 — conversion heure murale + fuseau → instant UTC", () => {
  for (const { fuseau, murale, utc } of CAS) {
    it(`${fuseau} : ${murale} → ${utc}`, () => {
      expect(instantDepuisDateHeureLocale(murale, fuseau)?.toISOString()).toBe(utc);
    });
    it(`${fuseau} : rendu aller-retour de ${utc} → ${murale}`, () => {
      expect(valeurDateHeureDansFuseau(utc, fuseau)).toBe(murale);
    });
  }

  it("indépendante du fuseau du serveur", () => {
    for (const tz of ["UTC", "Europe/Paris", "Asia/Tokyo", "America/Los_Angeles"]) {
      process.env.TZ = tz;
      expect(instantDepuisDateHeureLocale("2026-07-15T09:00", "Europe/Paris")?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
      expect(valeurDateHeureDansFuseau("2026-07-15T07:00:00.000Z", "Europe/Paris")).toBe("2026-07-15T09:00");
    }
  });

  it("contre-épreuve : l'ancienne conversion V9 (new Date(valeur) côté serveur UTC) décale de 2 h à Paris", () => {
    process.env.TZ = "UTC";
    const ancienne = new Date("2026-07-15T09:00").toISOString();
    expect(ancienne).toBe("2026-07-15T09:00:00.000Z");
    expect(ancienne).not.toBe(instantDepuisDateHeureLocale("2026-07-15T09:00", "Europe/Paris")?.toISOString());
  });

  it("changement d'heure : heure inexistante poussée vers l'avant, heure ambiguë = première occurrence", () => {
    // 29/03/2026 02:30 n'existe pas à Paris (02:00 → 03:00) : 03:30 CEST = 01:30 UTC.
    expect(instantDepuisDateHeureLocale("2026-03-29T02:30", "Europe/Paris")?.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // 25/10/2026 02:30 existe deux fois : première occurrence (CEST) = 00:30 UTC.
    expect(instantDepuisDateHeureLocale("2026-10-25T02:30", "Europe/Paris")?.toISOString()).toBe("2026-10-25T00:30:00.000Z");
    // New York, 01/11/2026 01:30 existe deux fois : première occurrence (EDT) = 05:30 UTC.
    expect(instantDepuisDateHeureLocale("2026-11-01T01:30", "America/New_York")?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
    // New York, 08/03/2026 02:30 n'existe pas : 03:30 EDT = 07:30 UTC.
    expect(instantDepuisDateHeureLocale("2026-03-08T02:30", "America/New_York")?.toISOString()).toBe("2026-03-08T07:30:00.000Z");
  });

  it("refuse les valeurs invalides sans les confondre avec « pas de date »", () => {
    for (const valeur of ["", "incorrecte", "2026-02-30T10:00", "2026-13-01T10:00", "2026-01-01T24:00", "2026-01-01", "2026-01-01T10:00Z"]) {
      expect(instantDepuisDateHeureLocale(valeur, "Europe/Paris")).toBeNull();
    }
    expect(instantDepuisDateHeureLocale("2026-01-01T10:00", "Pas/UnFuseau")).toBeNull();
  });

  it("valide les fuseaux IANA", () => {
    expect(fuseauValide("Europe/Paris")).toBe(true);
    expect(fuseauValide("UTC")).toBe(true);
    expect(fuseauValide("Mars/Olympus")).toBe(false);
    expect(fuseauValide("Europe/Paris; drop")).toBe(false);
    expect(fuseauValide(null)).toBe(false);
  });
});

describe("lecture serveur d'un ChampDateHeure", () => {
  const formulaire = (valeurs: Record<string, string>) => {
    const formData = new FormData();
    for (const [cle, valeur] of Object.entries(valeurs)) formData.set(cle, valeur);
    return formData;
  };

  it("utilise le fuseau transmis par le navigateur", () => {
    expect(lireDateHeureFormulaire(formulaire({ fin: "2026-07-15T09:00", fin__fuseau: "America/New_York" }), "fin"))
      .toEqual({ statut: "valide", iso: "2026-07-15T13:00:00.000Z" });
  });

  it(`sans JavaScript : repli sur ${FUSEAU_REFERENCE}`, () => {
    expect(lireDateHeureFormulaire(formulaire({ fin: "2026-07-15T09:00" }), "fin")).toEqual({ statut: "valide", iso: "2026-07-15T07:00:00.000Z" });
    expect(lireDateHeureFormulaire(formulaire({ fin: "2026-07-15T09:00", fin__fuseau: "n'importe/quoi" }), "fin").iso).toBe("2026-07-15T07:00:00.000Z");
  });

  it("V9-02 : « Sans date de fin » cochée l'emporte sur la valeur que Safari ne sait pas vider", () => {
    expect(lireDateHeureFormulaire(formulaire({ fin: "2026-07-15T09:00", fin__aucune: "1" }), "fin")).toEqual({ statut: "vide", iso: null });
  });

  it("vide → pas de date ; invalide → invalide", () => {
    expect(lireDateHeureFormulaire(formulaire({}), "fin")).toEqual({ statut: "vide", iso: null });
    expect(lireDateHeureFormulaire(formulaire({ fin: "  " }), "fin")).toEqual({ statut: "vide", iso: null });
    expect(lireDateHeureFormulaire(formulaire({ fin: "demain" }), "fin")).toEqual({ statut: "invalide", iso: null });
  });
});
