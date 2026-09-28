import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  creerFournisseurBrevo,
  creerFournisseurFactice,
  creerRegistreEnMemoire,
  deciderDestinataire,
  ErreurFournisseurEmail,
  IDENTITE_LEGALE_ELSATIA,
  journaliserEvenementEmail,
  LienEmailRefuseError,
  lireListeAutorisee,
  livrerEmail,
  marquerPourEnvironnement,
  masquerPourJournal,
  natureStatutHttp,
  rendreEmailTransactionnel,
  type MessageEmail,
} from "./index";

const PROD = {
  ELSATIA_APPLICATION_ENV: "production",
  NEXT_PUBLIC_APP_URL: "https://app.elsatia.fr",
  NEXT_PUBLIC_RESERVES_URL: "https://reserves.elsatia.fr",
  SUPPORT_EMAIL: "contact@elsatia.fr",
};
const PREVIEW = {
  ELSATIA_APPLICATION_ENV: "preview",
  NEXT_PUBLIC_RESERVES_URL: "https://reserves-preview.vercel.app",
  EMAIL_PREVIEW_ALLOWLIST: "qa@elsatia.fr, @recette.elsatia.fr",
};
const ADRESSE_PERSONNELLE = /Rhinau|Maréchal Leclerc|67860/i;

describe("gabarit transactionnel commun", () => {
  const rendu = rendreEmailTransactionnel({
    application: "reserves",
    sujet: "Invitation",
    titre: "Invitation à <intervenir>",
    paragraphes: ["Chantier « <script>alert(1)</script> »"],
    bouton: { libelle: "Rejoindre", url: "https://reserves.elsatia.fr/invitation/abc" },
    raison: "Vous recevez cet e-mail car une entreprise vous a invité.",
    environnement: PROD,
  });

  it("porte logo, nom d'application, CTA, URL d'application, support et ligne légale", () => {
    expect(rendu.html).toContain(">ELSATIA<");
    expect(rendu.html).toContain("ELSATIA Réserves");
    expect(rendu.html).toContain('href="https://reserves.elsatia.fr/invitation/abc"');
    expect(rendu.html).toContain('href="https://reserves.elsatia.fr"');
    expect(rendu.html).toContain("contact@elsatia.fr");
    expect(rendu.html).toContain("Julien GREGUREC, EI, 850 559 873 R.C.S. Strasbourg");
    expect(rendu.texte).toContain("Rejoindre : https://reserves.elsatia.fr/invitation/abc");
    expect(rendu.texte).toContain("850 559 873 R.C.S. Strasbourg");
  });

  it("échappe toute donnée saisie (titre, paragraphes)", () => {
    expect(rendu.html).not.toContain("<script>");
    expect(rendu.html).toContain("&lt;script&gt;");
    expect(rendu.html).toContain("Invitation à &lt;intervenir&gt;");
  });

  it("aucune bannière ni préfixe en Production", () => {
    expect(rendu.sujet).toBe("Invitation");
    expect(rendu.html).not.toContain("data-elsatia-environnement");
  });

  it("bannière et préfixe [PREVIEW] en Preview", () => {
    const preview = rendreEmailTransactionnel({
      application: "reserves",
      sujet: "Invitation",
      titre: "T",
      paragraphes: [],
      bouton: { libelle: "Ouvrir", url: "https://reserves-preview.vercel.app/dashboard" },
      environnement: PREVIEW,
    });
    expect(preview.sujet).toBe("[PREVIEW] Invitation");
    expect(preview.html).toContain('data-elsatia-environnement="preview"');
    expect(preview.texte.startsWith("*** PREVIEW")).toBe(true);
  });

  it("n'affiche aucune adresse de contact quand SUPPORT_EMAIL n'est pas configurée", () => {
    const sans = rendreEmailTransactionnel({ application: "gestion_pro", sujet: "S", titre: "T", paragraphes: [], environnement: { ELSATIA_APPLICATION_ENV: "production" } });
    expect(sans.html).not.toMatch(/@elsatia\.fr/);
    expect(sans.texte).not.toContain("Besoin d'aide");
  });

  it("ne propage jamais l'adresse personnelle de l'éditeur", () => {
    expect(JSON.stringify(IDENTITE_LEGALE_ELSATIA)).not.toMatch(ADRESSE_PERSONNELLE);
    expect(rendu.html).not.toMatch(ADRESSE_PERSONNELLE);
    expect(rendu.texte).not.toMatch(ADRESSE_PERSONNELLE);
  });

  it("refuse un bouton vers une autre application ou un domaine tiers", () => {
    const base = { application: "reserves" as const, sujet: "S", titre: "T", paragraphes: [], environnement: PROD };
    expect(() => rendreEmailTransactionnel({ ...base, bouton: { libelle: "x", url: "https://app.elsatia.fr/dashboard" } })).toThrow(LienEmailRefuseError);
    expect(() => rendreEmailTransactionnel({ ...base, bouton: { libelle: "x", url: "https://evil.example/" } })).toThrow(LienEmailRefuseError);
    expect(() => rendreEmailTransactionnel({ ...base, bouton: { libelle: "x", url: "javascript:alert(1)" } })).toThrow(LienEmailRefuseError);
    expect(() => rendreEmailTransactionnel({ ...base, bouton: { libelle: "x", url: "https://u:p@reserves.elsatia.fr/" } })).toThrow(LienEmailRefuseError);
  });

  it("admet un lien tiers HTTPS seulement sur choix explicite du code (facture Stripe)", () => {
    const base = { application: "gestion_pro" as const, sujet: "S", titre: "T", paragraphes: [], environnement: PROD, boutonExterneAutorise: true };
    expect(rendreEmailTransactionnel({ ...base, bouton: { libelle: "Payer", url: "https://invoice.stripe.com/i/x" } }).html)
      .toContain("https://invoice.stripe.com/i/x");
    expect(() => rendreEmailTransactionnel({ ...base, bouton: { libelle: "Payer", url: "http://invoice.stripe.com/i/x" } })).toThrow(LienEmailRefuseError);
  });

  it("marquerPourEnvironnement est idempotent et neutre en Production", () => {
    const m = { sujet: "S", texte: "B", html: "<html><body>x</body></html>" };
    const une = marquerPourEnvironnement(m, "preview");
    expect(marquerPourEnvironnement(une, "preview")).toEqual(une);
    expect(marquerPourEnvironnement(m, "production")).toBe(m);
  });
});

describe("gabarits Supabase Auth (supabase/templates)", () => {
  const lire = (nom: string) =>
    readFileSync(fileURLToPath(new URL(`../../../supabase/templates/${nom}`, import.meta.url)), "utf8");

  it.each(["reset_password.html", "confirm_signup.html"])("%s : marque neutre, ligne légale, sans adresse personnelle", (nom) => {
    const html = lire(nom);
    expect(html).toContain("Compte ELSATIA");
    expect(html).toContain("850 559 873 R.C.S. Strasbourg");
    expect(html).not.toMatch(ADRESSE_PERSONNELLE);
    expect(html).not.toContain("© ELSATIA Gestion Pro");
  });

  it("le lien passe par la page /auth/confirm (consommation au clic, jamais au GET)", () => {
    const html = lire("reset_password.html");
    expect(html).toContain("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery");
    // `ConfirmationURL` consomme le jeton au premier GET (scanner de liens, aperçu).
    expect(html).not.toContain("ConfirmationURL");
    expect(html).not.toContain("{{ .Token }}");
  });

  it("la durée de vie des jetons e-mail reste bornée (≤ 1 h)", () => {
    const config = readFileSync(fileURLToPath(new URL("../../../supabase/config.toml", import.meta.url)), "utf8");
    const otp = /^otp_expiry\s*=\s*(\d+)/m.exec(config);
    expect(otp && Number(otp[1])).toBeLessThanOrEqual(3600);
  });
});

describe("garde des destinataires (Preview)", () => {
  it("n'autorise que la liste, domaine exact, sans joker", () => {
    expect(deciderDestinataire("qa@elsatia.fr", PREVIEW).autorise).toBe(true);
    expect(deciderDestinataire("QA@Elsatia.fr ", PREVIEW).autorise).toBe(true);
    expect(deciderDestinataire("x@recette.elsatia.fr", PREVIEW).autorise).toBe(true);
    expect(deciderDestinataire("x@elsatia.fr", PREVIEW)).toMatchObject({ autorise: false, motif: "hors_liste_preview" });
    expect(deciderDestinataire("x@sous.recette.elsatia.fr", PREVIEW).autorise).toBe(false);
    expect(deciderDestinataire("vrai.client@gmail.com", PREVIEW).autorise).toBe(false);
    expect(lireListeAutorisee("*, @*, *@x.fr").domaines.size + lireListeAutorisee("*").adresses.size).toBe(0);
  });

  it("liste absente : personne n'est servi hors Production", () => {
    expect(deciderDestinataire("qa@elsatia.fr", { ELSATIA_APPLICATION_ENV: "preview" }))
      .toMatchObject({ autorise: false, motif: "liste_preview_absente" });
    expect(deciderDestinataire("qa@elsatia.fr", {})).toMatchObject({ autorise: false, environnement: "local" });
  });

  it("refuse partout une adresse porteuse d'injection ou d'envoi multiple", () => {
    for (const adresse of ["a@b.fr,c@d.fr", "a@b.fr\r\nBcc: x@y.fr", "Nom <a@b.fr>", "a@b", "@b.fr", ""]) {
      expect(deciderDestinataire(adresse, PROD)).toMatchObject({ autorise: false, motif: "adresse_invalide" });
    }
    expect(deciderDestinataire("client@example.com", PROD).autorise).toBe(true);
  });
});

describe("journalisation sans fuite", () => {
  it("masque jetons, URL de réinitialisation complètes, adresses et clés", () => {
    const brut = [
      "reset https://app.elsatia.fr/auth/confirm?token_hash=abc123&type=recovery",
      "invitation https://reserves.elsatia.fr/invitation/SECRET_JETON_43",
      "pour jean.dupont@example.com",
      "cle xkeysib-0123456789abcdef-XYZ et sb_secret_ABCdef123",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "?token=zzz&code=yyy",
    ].join(" | ");
    const propre = masquerPourJournal(brut);
    for (const fuite of ["abc123", "SECRET_JETON_43", "jean.dupont", "xkeysib-0123", "sb_secret_ABC", "eyJhbGci", "zzz", "yyy", "type=recovery"]) {
      expect(propre).not.toContain(fuite);
    }
    expect(propre).toContain("https://app.elsatia.fr/auth/…");
    expect(propre).toContain("***@example.com");
  });

  it("l'événement structuré ne contient ni adresse ni lien complet", () => {
    const lignes: string[] = [];
    journaliserEvenementEmail(
      { evenement: "echec_definitif", flux: "reset", application: "gestion_pro", environnement: "preview", motif: "https://app.elsatia.fr/auth/confirm?token_hash=t0k3n pour a@b.fr" },
      (l) => lignes.push(l),
    );
    expect(lignes[0]).not.toContain("t0k3n");
    expect(lignes[0]).not.toContain("a@b.fr");
  });
});

describe("livraison — fournisseur factice, reprise, lettre morte, doublons", () => {
  const message: MessageEmail = { to: "qa@elsatia.fr", sujet: "Réinitialisation", texte: "Lien https://app.elsatia.fr/auth/confirm?token_hash=SECRET" };
  const sansAttente = async () => {};

  it("envoie une fois, marque [PREVIEW], et ignore le rejeu de la même clé", async () => {
    const fournisseur = creerFournisseurFactice();
    const registre = creerRegistreEnMemoire();
    const journal: string[] = [];
    const commun = { cleIdempotence: "reset:user-1:2026-09-28", flux: "reset", application: "gestion_pro", message, fournisseur, registre, environnement: PREVIEW, journal: (l: string) => journal.push(l) };
    const premier = await livrerEmail(commun);
    const rejeu = await livrerEmail(commun);
    expect(premier).toMatchObject({ statut: "envoye", tentatives: 1 });
    expect(rejeu).toEqual({ statut: "doublon" });
    expect(fournisseur.envoyes).toHaveLength(1);
    expect(fournisseur.envoyes[0].sujet).toBe("[PREVIEW] Réinitialisation");
    expect(journal.join("\n")).not.toContain("SECRET");
    expect(journal.join("\n")).not.toContain("qa@elsatia.fr");
  });

  it("bloque un vrai client en Preview sans appeler le fournisseur", async () => {
    const fournisseur = creerFournisseurFactice();
    const resultat = await livrerEmail({
      cleIdempotence: "facture:F-1:envoi", flux: "document", application: "gestion_pro",
      message: { ...message, to: "vrai.client@gmail.com" }, fournisseur, registre: creerRegistreEnMemoire(), environnement: PREVIEW, journal: () => {},
    });
    expect(resultat).toEqual({ statut: "bloque", motif: "hors_liste_preview" });
    expect(fournisseur.appels()).toBe(0);
  });

  it("reprend un échec transitoire puis réussit", async () => {
    const fournisseur = creerFournisseurFactice({ echecs: ["transitoire", "transitoire"] });
    const attentes: number[] = [];
    const resultat = await livrerEmail({
      cleIdempotence: "notif:env-42", flux: "notification", application: "reserves", message, fournisseur,
      registre: creerRegistreEnMemoire(), environnement: PREVIEW, attendre: async (ms) => { attentes.push(ms); }, journal: () => {},
    });
    expect(resultat).toMatchObject({ statut: "envoye", tentatives: 3 });
    expect(attentes).toEqual([500, 2000]);
    expect(fournisseur.envoyes).toHaveLength(1);
  });

  it("fournisseur indisponible durablement → lettre morte, pas de boucle infinie", async () => {
    const fournisseur = creerFournisseurFactice({ echecs: ["transitoire", "transitoire", "transitoire", "transitoire"] });
    const registre = creerRegistreEnMemoire();
    const resultat = await livrerEmail({
      cleIdempotence: "notif:env-43", flux: "notification", application: "reserves", message, fournisseur, registre,
      environnement: PREVIEW, attendre: sansAttente, journal: () => {},
    });
    expect(resultat).toMatchObject({ statut: "lettre_morte", nature: "transitoire", tentatives: 3 });
    expect(fournisseur.appels()).toBe(3);
    expect(registre.etats.get("notif:env-43")).toMatchObject({ etat: "lettre_morte" });
  });

  it("issue AMBIGUË (délai dépassé) → aucune reprise : pas de doublon chez le client", async () => {
    const fournisseur = creerFournisseurFactice({ echecs: ["ambigu"] });
    const resultat = await livrerEmail({
      cleIdempotence: "support:reponse-9", flux: "support", application: "gestion_pro", message, fournisseur,
      registre: creerRegistreEnMemoire(), environnement: PREVIEW, attendre: sansAttente, journal: () => {},
    });
    expect(resultat).toMatchObject({ statut: "lettre_morte", nature: "ambigu", tentatives: 1 });
    expect(fournisseur.appels()).toBe(1);
  });

  it("échec définitif (400) → une seule tentative", async () => {
    const fournisseur = creerFournisseurFactice({ echecs: ["definitif"] });
    const resultat = await livrerEmail({
      cleIdempotence: "abonnement:in_123", flux: "abonnement", application: "gestion_pro", message, fournisseur,
      registre: creerRegistreEnMemoire(), environnement: PREVIEW, attendre: sansAttente, journal: () => {},
    });
    expect(resultat).toMatchObject({ statut: "lettre_morte", nature: "definitif", tentatives: 1 });
  });

  it("une lettre morte peut être reprise explicitement (même clé), un envoi réussi jamais", async () => {
    const registre = creerRegistreEnMemoire();
    const commun = { cleIdempotence: "notif:env-44", flux: "n", application: "reserves", message, registre, environnement: PREVIEW, attendre: sansAttente, journal: () => {} };
    await livrerEmail({ ...commun, fournisseur: creerFournisseurFactice({ echecs: ["definitif"] }) });
    const reprise = await livrerEmail({ ...commun, fournisseur: creerFournisseurFactice() });
    expect(reprise.statut).toBe("envoye");
    expect((await livrerEmail({ ...commun, fournisseur: creerFournisseurFactice() })).statut).toBe("doublon");
  });

  it("refuse une clé d'idempotence absente ou fantaisiste", async () => {
    const r = await livrerEmail({ cleIdempotence: "x", flux: "n", application: "a", message, fournisseur: creerFournisseurFactice(), registre: creerRegistreEnMemoire(), environnement: PREVIEW, journal: () => {} });
    expect(r).toEqual({ statut: "bloque", motif: "cle_idempotence_invalide" });
  });
});

describe("fournisseur Brevo (fetch simulé, aucun réseau)", () => {
  const env = { BREVO_API_KEY: "xkeysib-test", EMAIL_FROM_ADDRESS: "no-reply@elsatia.fr" };
  const reponse = (status: number, corps: unknown = {}) =>
    ({ ok: status < 300, status, json: async () => corps }) as unknown as Response;

  it("classe les statuts HTTP", () => {
    expect([429, 500, 502, 503, 504].map(natureStatutHttp)).toEqual(Array(5).fill("transitoire"));
    expect([400, 401, 403, 404, 422].map(natureStatutHttp)).toEqual(Array(5).fill("definitif"));
  });

  it("un 503 est transitoire, sans fuite du corps de réponse", async () => {
    const brevo = creerFournisseurBrevo(env, async () => reponse(503, { message: "adresse a@b.fr" }));
    const erreur = await brevo.envoyer({ to: "a@b.fr", sujet: "s", texte: "t" }).catch((e) => e);
    expect(erreur).toBeInstanceOf(ErreurFournisseurEmail);
    expect(erreur.nature).toBe("transitoire");
    expect(erreur.message).not.toContain("a@b.fr");
  });

  it("délai dépassé = ambigu ; connexion refusée = transitoire", async () => {
    const delai = creerFournisseurBrevo(env, async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); });
    expect((await delai.envoyer({ to: "a@b.fr", sujet: "s", texte: "t" }).catch((e) => e)).nature).toBe("ambigu");
    const refus = creerFournisseurBrevo(env, async () => { throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } }); });
    expect((await refus.envoyer({ to: "a@b.fr", sujet: "s", texte: "t" }).catch((e) => e)).nature).toBe("transitoire");
  });

  it("configuration absente = définitif, sans appel", async () => {
    let appels = 0;
    const brevo = creerFournisseurBrevo({}, async () => { appels += 1; return reponse(200); });
    expect((await brevo.envoyer({ to: "a@b.fr", sujet: "s", texte: "t" }).catch((e) => e)).nature).toBe("definitif");
    expect(appels).toBe(0);
  });

  it("pose un délai maximal sur l'appel", async () => {
    let signal: AbortSignal | undefined;
    const brevo = creerFournisseurBrevo(env, async (_url, init) => { signal = init?.signal ?? undefined; return reponse(201, { messageId: "m" }); });
    expect(await brevo.envoyer({ to: "a@b.fr", sujet: "s", texte: "t" })).toEqual({ messageId: "m" });
    expect(signal).toBeDefined();
  });
});

describe("jetons expirés et rejeu (contrats en base)", () => {
  it("une invitation Réserves n'est acceptée que non consommée, non révoquée, non expirée", () => {
    const sql = readFileSync(
      fileURLToPath(new URL("../../../supabase/migrations/20260907000270_reserves_v3_collaboration_livrables_v1.sql", import.meta.url)),
      "utf8",
    );
    expect(sql).toContain("and consomme_at is null and revoque_at is null and expire_at > now()");
    // Seule l'empreinte du jeton est stockée : un vol de base ne rejoue rien.
    expect(sql).toContain("token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$')");
  });
});
