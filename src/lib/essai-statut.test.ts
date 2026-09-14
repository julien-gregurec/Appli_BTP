import { describe, expect, it } from "vitest";
import { ctaAbonnementVisible, ecartJours, jourCalendaire, libelleCompactEssai, statutEssai } from "./essai-statut";

// « Maintenant » = 13 septembre 2026, 10:00 à Paris (08:00 UTC).
const MAINTENANT = new Date("2026-09-13T08:00:00.000Z");
const essai = (fin: string) => statutEssai({ abonnementStatut: "essai", essaiDebut: null, essaiFin: fin }, MAINTENANT);

describe("statutEssai — cas obligatoires", () => {
  it("30 jours restants : information discrète, pas de bandeau", () => {
    const s = essai("2026-10-13");
    expect(s).toMatchObject({ etat: "essai", joursRestants: 30, niveau: "info", bandeau: false, titre: "Période d’essai — 30 jours restants", detail: "Votre essai se termine le 13 octobre 2026." });
  });
  it("8 jours : encore discret", () => {
    expect(essai("2026-09-21")).toMatchObject({ etat: "essai", joursRestants: 8, niveau: "info", bandeau: false });
  });
  it("7 jours : avertissement visible avec bandeau", () => {
    expect(essai("2026-09-20")).toMatchObject({ etat: "essai", joursRestants: 7, niveau: "avertissement", bandeau: true, titre: "Votre période d’essai se termine dans 7 jours." });
  });
  it("3 jours : alerte renforcée", () => {
    expect(essai("2026-09-16")).toMatchObject({ joursRestants: 3, niveau: "renforce", titre: "Votre période d’essai se termine dans 3 jours." });
  });
  it("1 jour : alerte forte", () => {
    expect(essai("2026-09-14")).toMatchObject({ joursRestants: 1, niveau: "fort", titre: "Votre période d’essai se termine demain." });
  });
  it("jour de fin : dernier jour, l'essai court encore", () => {
    expect(essai("2026-09-13")).toMatchObject({ etat: "essai", joursRestants: 0, niveau: "fort", titre: "Dernier jour de votre période d’essai.", bandeau: true });
  });
  it("expiré : message explicite, jamais un accès retiré sans explication", () => {
    expect(essai("2026-09-12")).toMatchObject({ etat: "expire", niveau: "expire", bandeau: true, titre: "Votre période d’essai est terminée.", dateFinLisible: "12 septembre 2026" });
  });
  it("abonnement actif : rien à afficher", () => {
    expect(statutEssai({ abonnementStatut: "actif", essaiDebut: "2026-09-13", essaiFin: "2026-10-13" }, MAINTENANT)).toEqual({ etat: "abonnement_actif" });
  });
  it("entreprise sans essai (fenêtre inconnue, ou statut suspendu / annulé) : rien à afficher", () => {
    expect(statutEssai({ abonnementStatut: "essai", essaiDebut: null, essaiFin: null }, MAINTENANT)).toEqual({ etat: "sans_essai" });
    expect(statutEssai({ abonnementStatut: "suspendu", essaiDebut: null, essaiFin: "2026-09-20" }, MAINTENANT)).toEqual({ etat: "sans_essai" });
  });
  it("fin déduite du début + 30 jours quand la fin n'est pas renseignée", () => {
    expect(statutEssai({ abonnementStatut: "essai", essaiDebut: "2026-09-01", essaiFin: null }, MAINTENANT)).toMatchObject({ etat: "essai", dateFin: "2026-10-01", joursRestants: 18 });
  });
});

describe("droits d'affichage", () => {
  it("employé non admin : décompte visible, jamais de bouton d'abonnement", () => {
    expect(ctaAbonnementVisible(essai("2026-09-16"), false)).toBe(false);
    expect(ctaAbonnementVisible(essai("2026-09-12"), false)).toBe(false);
  });
  it("Dirigeant / Admin : bouton pendant l'essai et après expiration, jamais pour un abonné", () => {
    expect(ctaAbonnementVisible(essai("2026-09-16"), true)).toBe(true);
    expect(ctaAbonnementVisible(essai("2026-09-12"), true)).toBe(true);
    expect(ctaAbonnementVisible({ etat: "abonnement_actif" }, true)).toBe(false);
  });
  it("libellé compact de la barre latérale", () => {
    expect(libelleCompactEssai(essai("2026-09-25"))).toBe("Essai · 12 j restants");
    expect(libelleCompactEssai(essai("2026-09-14"))).toBe("Essai · 1 j restant");
    expect(libelleCompactEssai(essai("2026-09-13"))).toBe("Essai · dernier jour");
    expect(libelleCompactEssai(essai("2026-09-12"))).toBe("Essai terminé");
    expect(libelleCompactEssai({ etat: "abonnement_actif" })).toBeNull();
  });
});

describe("fuseau horaire — calendrier de Paris, pas UTC", () => {
  it("à 00:30 à Paris (22:30 UTC la veille), le jour courant est déjà le nouveau jour", () => {
    // 13 sept 00:30 Paris = 12 sept 22:30 UTC
    const nuit = new Date("2026-09-12T22:30:00.000Z");
    expect(jourCalendaire(nuit)).toBe("2026-09-13");
    expect(statutEssai({ abonnementStatut: "essai", essaiDebut: null, essaiFin: "2026-09-13" }, nuit)).toMatchObject({ joursRestants: 0, titre: "Dernier jour de votre période d’essai." });
  });
  it("à 23:30 à Paris le jour de fin (21:30 UTC), l'essai court encore ; une heure après minuit, il est terminé", () => {
    expect(statutEssai({ abonnementStatut: "essai", essaiDebut: null, essaiFin: "2026-09-13" }, new Date("2026-09-13T21:30:00.000Z"))).toMatchObject({ etat: "essai", joursRestants: 0 });
    expect(statutEssai({ abonnementStatut: "essai", essaiDebut: null, essaiFin: "2026-09-13" }, new Date("2026-09-13T22:30:00.000Z"))).toMatchObject({ etat: "expire" });
  });
  it("écart calendaire indépendant des heures", () => {
    expect(ecartJours("2026-09-13", "2026-09-25")).toBe(12);
    expect(ecartJours("2026-12-31", "2027-01-01")).toBe(1);
  });
});
