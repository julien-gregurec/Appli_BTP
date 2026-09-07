import { afterEach, describe, expect, it, vi } from "vitest";
import { messageInvitation, messageNotification, type NotificationAExpedier } from "./emails-reserves";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const INVITATION = {
  organisationHote: "Entreprise Isolation A",
  chantier: "Résidence Les Tilleuls",
  intervenant: "Peinture C",
  contactNom: "Claire P.",
  url: "https://reserves.elsatia.fr/invitation/JETON",
  expireLe: new Date("2026-10-07T12:00:00Z"),
};

describe("e-mail d'invitation", () => {
  it("dit qui invite, sur quel chantier, et jusqu'à quand", () => {
    const message = messageInvitation(INVITATION);
    expect(message.sujet).toContain("Résidence Les Tilleuls");
    expect(message.sujet).toContain("Entreprise Isolation A");
    expect(message.texte).toContain("Claire P.");
    expect(message.texte).toContain("7 octobre 2026");
    expect(message.html).toContain("7 octobre 2026");
  });

  it("transporte le lien intact, en texte comme en HTML", () => {
    const message = messageInvitation(INVITATION);
    expect(message.texte).toContain(INVITATION.url);
    expect(message.html).toContain(`href="${INVITATION.url}"`);
  });

  it("annonce la gratuité et la portée limitée de l'accès", () => {
    const message = messageInvitation(INVITATION);
    expect(message.texte).toContain("gratuit");
    expect(message.texte).toMatch(/uniquement les réserves qui vous sont attribuées/);
  });

  it("échappe un nom de chantier qui contiendrait du balisage", () => {
    // Un nom de chantier est une saisie utilisateur : il ne doit jamais devenir du HTML
    // dans un e-mail sortant.
    const message = messageInvitation({
      ...INVITATION,
      chantier: '<img src=x onerror="alert(1)">',
    });
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img src=x");
  });

  it("se passe du nom du contact quand il est inconnu", () => {
    const message = messageInvitation({ ...INVITATION, contactNom: null });
    expect(message.texte.startsWith("Bonjour,")).toBe(true);
  });
});

const EVENEMENT: NotificationAExpedier = {
  envoi_id: "11111111-1111-1111-1111-111111111111",
  email: "peintre@invalid.local",
  type: "reserve_assignee",
  libelle: "Réserve attribuée à votre entreprise",
  categorie: "attribution",
  chantier: "Résidence Les Tilleuls",
  reserve_numero: 12,
  reserve_titre: "Peinture écaillée",
  reserve_id: "22222222-2222-2222-2222-222222222222",
  organisation: "Entreprise Isolation A",
  payload: null,
};

describe("e-mail de notification", () => {
  it("pointe directement sur la réserve concernée", () => {
    const message = messageNotification(EVENEMENT, "https://reserves.elsatia.fr");
    expect(message.texte).toContain("https://reserves.elsatia.fr/reserves/22222222-2222-2222-2222-222222222222");
    expect(message.sujet).toContain("réserve n°12");
  });

  it("retombe sur le tableau de bord quand l'événement ne porte pas de réserve", () => {
    const message = messageNotification(
      { ...EVENEMENT, reserve_id: null, reserve_numero: null, reserve_titre: null,
        type: "intervenant_revoque", libelle: "Accès entreprise révoqué" },
      "https://reserves.elsatia.fr",
    );
    expect(message.texte).toContain("https://reserves.elsatia.fr/dashboard");
    expect(message.sujet).toContain("Accès entreprise révoqué");
  });

  it("rappelle toujours où se règlent les e-mails reçus", () => {
    const message = messageNotification(EVENEMENT, "https://reserves.elsatia.fr");
    expect(message.texte).toContain("/parametres/notifications");
    expect(message.html).toContain("/parametres/notifications");
  });

  it("échappe le titre de réserve dans le corps HTML", () => {
    const message = messageNotification(
      { ...EVENEMENT, reserve_titre: '<script>alert(1)</script>' },
      "https://reserves.elsatia.fr",
    );
    expect(message.html).not.toContain("<script>");
  });
});
