import { createHmac, randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { peut, ROLES_SOCIAL } from "@/lib/social/roles";
import { calculerStatutPublication, deplacementCalendrier, estModifiable, peutEtrePublie, transitionPossible, verifierDateProgrammation } from "@/lib/social/workflow";
import { compterHashtags, texteDuReseau, validerContenu } from "@/lib/social/contenu";
import { empreinteContenu } from "@/lib/social/empreinte";
import { chiffrerSecret, dechiffrerSecret, estChiffreAvecCleCourante } from "@/lib/social/crypto";
import { creerEtatOAuth, reponseDefiLinkedIn, verifierEtatOAuth, verifierSignatureLinkedIn, verifierSignatureMeta } from "@/lib/social/securite";
import { echapperCommentaire, LinkedInConnector } from "@/lib/social/linkedin";
import { classifierMeta, MetaConnector } from "@/lib/social/meta";
import { masquerSecrets, requete } from "@/lib/social/http";
import { modeSimulation } from "@/lib/social/config";
import { ErreurSocial, type MediaAPublier } from "@/lib/social/provider";

const CLE = randomBytes(32).toString("hex");
const image: MediaAPublier = { type: "image", urlSignee: "https://stockage/x.jpg", mimeType: "image/jpeg", tailleOctets: 200_000, largeur: 1080, hauteur: 1080, dureeSecondes: null, texteAlternatif: "Logo", lireOctets: async () => new ArrayBuffer(8) };

beforeEach(() => {
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", CLE);
  vi.stubEnv("META_APP_ID", "123");
  vi.stubEnv("META_APP_SECRET", "secret-meta");
  vi.stubEnv("LINKEDIN_CLIENT_ID", "abc");
  vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret-li");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rôles ELSATIA Social", () => {
  it("seuls Administrateur et Validateur autorisent ou déclenchent une publication", () => {
    const autorises = ROLES_SOCIAL.filter((r) => peut(r.cle, "valider")).map((r) => r.cle);
    expect(autorises.sort()).toEqual(["administrateur", "validateur"]);
    expect(ROLES_SOCIAL.filter((r) => peut(r.cle, "publier")).map((r) => r.cle).sort()).toEqual(["administrateur", "validateur"]);
    expect(ROLES_SOCIAL.filter((r) => peut(r.cle, "envoyer_reponse")).map((r) => r.cle).sort()).toEqual(["administrateur", "validateur"]);
  });
  it("la lecture seule ne fait que consulter", () => {
    expect(peut("lecture", "consulter")).toBe(true);
    expect(peut("lecture", "rediger")).toBe(false);
    expect(peut(null, "consulter")).toBe(false);
  });
  it("seul l'administrateur gère comptes et équipe", () => {
    expect(ROLES_SOCIAL.filter((r) => peut(r.cle, "gerer_comptes")).map((r) => r.cle)).toEqual(["administrateur"]);
  });
});

describe("workflow de publication", () => {
  const empreinte = "e1";
  const valide = { statut: "valide" as const, approuve_par: "v@elsatia.fr", approuve_at: "2026-10-01T10:00:00Z", empreinte_validee: empreinte, reseaux: ["facebook" as const] };

  it("refuse toute publication sans validation humaine", () => {
    expect(peutEtrePublie({ ...valide, statut: "brouillon" }, empreinte).ok).toBe(false);
    expect(peutEtrePublie({ ...valide, statut: "a_valider" }, empreinte).ok).toBe(false);
    expect(peutEtrePublie({ ...valide, approuve_par: null }, empreinte).ok).toBe(false);
  });
  it("refuse un contenu modifié depuis la validation", () => {
    expect(peutEtrePublie(valide, "autre")).toEqual({ ok: false, raison: expect.stringContaining("changé") });
    expect(peutEtrePublie(valide, empreinte).ok).toBe(true);
  });
  it("refuse de republier un contenu déjà publié", () => {
    expect(peutEtrePublie({ ...valide, statut: "publie" }, empreinte).ok).toBe(false);
  });
  it("transitions", () => {
    expect(transitionPossible("brouillon", "soumettre")).toBe(true);
    expect(transitionPossible("brouillon", "valider")).toBe(false);
    expect(transitionPossible("a_valider", "valider")).toBe(true);
    expect(transitionPossible("valide", "programmer")).toBe(true);
    expect(estModifiable("publie")).toBe(false);
    expect(estModifiable("valide")).toBe(true);
  });
  it("statut calculé à partir des cibles", () => {
    expect(calculerStatutPublication([{ statut: "publie", prochaine_tentative_at: null }, { statut: "publie", prochaine_tentative_at: null }])).toBe("publie");
    expect(calculerStatutPublication([{ statut: "publie", prochaine_tentative_at: null }, { statut: "echec", prochaine_tentative_at: null }])).toBe("partiel");
    expect(calculerStatutPublication([{ statut: "echec", prochaine_tentative_at: "2026-10-03T10:00:00Z" }])).toBe("publication_en_cours");
    expect(calculerStatutPublication([{ statut: "echec", prochaine_tentative_at: null }])).toBe("echec");
    // Une simulation ne publie rien : le contenu reste validé.
    expect(calculerStatutPublication([{ statut: "simule", prochaine_tentative_at: null }])).toBe("valide");
  });
  it("date de programmation", () => {
    const maintenant = new Date("2026-10-03T10:00:00Z");
    expect(verifierDateProgrammation(new Date("2026-10-03T10:01:00Z"), maintenant)).not.toBeNull();
    expect(verifierDateProgrammation(new Date("2026-10-04T10:00:00Z"), maintenant)).toBeNull();
    expect(verifierDateProgrammation(new Date("2027-10-04T10:00:00Z"), maintenant)).not.toBeNull();
  });
  it("calendrier : seuls les contenus non validés se déplacent librement", () => {
    expect(deplacementCalendrier("idee")).toBe("libre");
    expect(deplacementCalendrier("programme")).toBe("validateur");
    expect(deplacementCalendrier("publie")).toBe("interdit");
  });
});

describe("contenu par réseau", () => {
  it("Instagram exige un média et limite les hashtags", () => {
    expect(validerContenu("instagram", { texte: "Bonjour", lienUrl: null, medias: [] }).erreurs.join()).toMatch(/exige une image/);
    const hashtags = Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" ");
    expect(compterHashtags(hashtags)).toBe(31);
    expect(validerContenu("instagram", { texte: hashtags, lienUrl: null, medias: [{ type: "image", mimeType: "image/jpeg", tailleOctets: 1000, largeur: 1080, hauteur: 1080, dureeSecondes: null }] }).erreurs.join()).toMatch(/30 hashtags/);
  });
  it("Instagram refuse un format d'image hors 4:5 – 1,91:1", () => {
    const r = validerContenu("instagram", { texte: "x", lienUrl: null, medias: [{ type: "image", mimeType: "image/jpeg", tailleOctets: 1000, largeur: 500, hauteur: 2000, dureeSecondes: null }] });
    expect(r.erreurs.join()).toMatch(/rapport/);
  });
  it("LinkedIn limite à 3000 caractères", () => {
    expect(validerContenu("linkedin", { texte: "a".repeat(3001), lienUrl: null, medias: [] }).erreurs.length).toBe(1);
    expect(validerContenu("linkedin", { texte: "a".repeat(3000), lienUrl: null, medias: [] }).erreurs.length).toBe(0);
  });
  it("une version vide reprend le texte principal", () => {
    const p = { contenu_principal: "Principal", contenu_facebook: "  ", contenu_instagram: "Insta", contenu_linkedin: null };
    expect(texteDuReseau(p, "facebook")).toBe("Principal");
    expect(texteDuReseau(p, "instagram")).toBe("Insta");
  });
  it("l'empreinte change avec le texte, les réseaux et les médias", () => {
    const base = { titre: "T", contenu_principal: "A", contenu_facebook: null, contenu_instagram: null, contenu_linkedin: null, lien_url: null, reseaux: ["facebook", "linkedin"], mediaIds: ["m1"] };
    const e = empreinteContenu(base);
    expect(empreinteContenu({ ...base, reseaux: ["linkedin", "facebook"] })).toBe(e);
    expect(empreinteContenu({ ...base, contenu_principal: "B" })).not.toBe(e);
    expect(empreinteContenu({ ...base, mediaIds: ["m2"] })).not.toBe(e);
    expect(empreinteContenu({ ...base, reseaux: ["facebook"] })).not.toBe(e);
  });
});

describe("chiffrement des jetons", () => {
  it("chiffre, déchiffre et détecte l'altération", () => {
    const c = chiffrerSecret("jeton-secret");
    expect(c).not.toContain("jeton-secret");
    expect(dechiffrerSecret(c)).toBe("jeton-secret");
    const morceaux = c.split(":");
    morceaux[4] = Buffer.from("autre").toString("base64url");
    expect(() => dechiffrerSecret(morceaux.join(":"))).toThrow();
  });
  it("rotation : l'ancienne clé reste lisible le temps du rechiffrement", () => {
    const ancien = chiffrerSecret("jeton");
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS", CLE);
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", randomBytes(32).toString("hex"));
    expect(estChiffreAvecCleCourante(ancien)).toBe(false);
    expect(dechiffrerSecret(ancien)).toBe("jeton");
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY_PREVIOUS", "");
    expect(() => dechiffrerSecret(ancien)).toThrow(/rotation/);
  });
  it("refuse une clé de mauvaise taille", () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "trop-courte");
    expect(() => chiffrerSecret("x")).toThrow(/32 octets/);
  });
});

describe("OAuth et webhooks", () => {
  it("état OAuth lié à l'utilisateur, au nonce et limité dans le temps", () => {
    const { etat, nonce } = creerEtatOAuth("meta", "Admin@Elsatia.fr", 1_000_000);
    expect(verifierEtatOAuth(etat, nonce, "meta", "admin@elsatia.fr", 1_000_000)).toBe(true);
    expect(verifierEtatOAuth(etat, "autre-nonce", "meta", "admin@elsatia.fr", 1_000_000)).toBe(false);
    expect(verifierEtatOAuth(etat, nonce, "linkedin", "admin@elsatia.fr", 1_000_000)).toBe(false);
    expect(verifierEtatOAuth(etat, nonce, "meta", "pirate@exemple.fr", 1_000_000)).toBe(false);
    expect(verifierEtatOAuth(etat, nonce, "meta", "admin@elsatia.fr", 1_000_000 + 11 * 60_000)).toBe(false);
    expect(verifierEtatOAuth(`${etat}x`, nonce, "meta", "admin@elsatia.fr", 1_000_000)).toBe(false);
    expect(verifierEtatOAuth(etat, undefined, "meta", "admin@elsatia.fr", 1_000_000)).toBe(false);
  });
  it("signature Meta X-Hub-Signature-256", () => {
    const corps = '{"object":"page"}';
    const sig = `sha256=${createHmac("sha256", "secret-meta").update(corps).digest("hex")}`;
    expect(verifierSignatureMeta(corps, sig, "secret-meta")).toBe(true);
    expect(verifierSignatureMeta(`${corps} `, sig, "secret-meta")).toBe(false);
    expect(verifierSignatureMeta(corps, null, "secret-meta")).toBe(false);
    expect(verifierSignatureMeta(corps, sig, undefined)).toBe(false);
  });
  it("signature et défi LinkedIn", () => {
    const corps = '{"type":"ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS"}';
    const sig = createHmac("sha256", "secret-li").update(`hmacsha256=${corps}`).digest("hex");
    expect(verifierSignatureLinkedIn(corps, sig, "secret-li")).toBe(true);
    expect(verifierSignatureLinkedIn(corps, sig, "mauvais")).toBe(false);
    expect(reponseDefiLinkedIn("abc", "secret-li")).toBe(createHmac("sha256", "secret-li").update("abc").digest("hex"));
  });
});

describe("connecteurs", () => {
  it("le mode simulation est actif par défaut", () => {
    vi.stubEnv("SOCIAL_DRY_RUN", "");
    expect(modeSimulation()).toBe(true);
    vi.stubEnv("SOCIAL_DRY_RUN", "0");
    expect(modeSimulation()).toBe(true);
    // SOCIAL_DRY_RUN=false ne suffit pas hors production (local, prévisualisation).
    vi.stubEnv("SOCIAL_DRY_RUN", "false");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(modeSimulation()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "");
    expect(modeSimulation()).toBe(true);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(modeSimulation()).toBe(false);
    vi.stubEnv("SOCIAL_DRY_RUN", "true");
    expect(modeSimulation()).toBe(true);
  });

  it("en simulation, aucune requête n'est envoyée aux plateformes", async () => {
    vi.stubEnv("SOCIAL_DRY_RUN", "true");
    const fetchEspion = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("aucun appel réseau attendu"));
    const fb = new MetaConnector({ reseau: "facebook", externalAccountId: "1", pageId: "1", scopes: [] }, "jeton");
    const ig = new MetaConnector({ reseau: "instagram", externalAccountId: "2", pageId: "1", scopes: [] }, "jeton");
    const li = new LinkedInConnector("42", "jeton", []);
    const contenu = { titre: "T", texte: "Bonjour #ELSATIA", lienUrl: null, medias: [image], cleIdempotence: "k" };
    for (const c of [fb, ig, li]) {
      const r = await c.publishPost(contenu);
      expect(r.simule).toBe(true);
      expect(JSON.stringify(r.apercuRequete)).not.toContain("jeton");
    }
    expect((await fb.replyToComment({ externalCommentId: "c", externalPostId: "p" }, "Merci")).simule).toBe(true);
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it("LinkedIn : messagerie et programmation déclarées indisponibles, jamais simulées", async () => {
    const li = new LinkedInConnector("42", "jeton", []);
    expect(li.capacites.messages.disponible).toBe(false);
    expect(li.capacites.programmationNative.disponible).toBe(false);
    expect(() => li.getMessages()).toThrow(ErreurSocial);
    await expect(li.schedulePost()).rejects.toThrow(/non disponible via API/);
  });

  it("une permission non accordée rend la fonction indisponible", () => {
    const fb = new MetaConnector({ reseau: "facebook", externalAccountId: "1", pageId: "1", scopes: ["pages_manage_posts"] }, "j");
    expect(fb.capacites.image.disponible).toBe(true);
    expect(fb.capacites.messages.disponible).toBe(false);
  });

  it("Instagram refuse une publication sans média avant tout appel", async () => {
    vi.stubEnv("SOCIAL_DRY_RUN", "false");
    const fetchEspion = vi.spyOn(globalThis, "fetch");
    const ig = new MetaConnector({ reseau: "instagram", externalAccountId: "2", pageId: "1", scopes: [] }, "jeton");
    await expect(ig.publishPost({ titre: "T", texte: "Sans image", lienUrl: null, medias: [], cleIdempotence: "k" })).rejects.toMatchObject({ code: "validation" });
    expect(fetchEspion).not.toHaveBeenCalled();
  });

  it("échappement du texte LinkedIn et hashtags", () => {
    expect(echapperCommentaire("Prix (HT) : 10 € *promo* #ELSATIA")).toBe("Prix \\(HT\\) : 10 € \\*promo\\* {hashtag|\\#|ELSATIA}");
    expect(echapperCommentaire("a_b @x")).toBe("a\\_b \\@x");
  });

  it("classification des erreurs Meta", () => {
    expect(classifierMeta(400, { error: { code: 190, message: "expired" } }).code).toBe("jeton_expire");
    expect(classifierMeta(400, { error: { code: 4 } }).code).toBe("limite");
    expect(classifierMeta(403, { error: { code: 200 } }).code).toBe("permission");
    expect(classifierMeta(500, { error: { code: 2 } }).code).toBe("transitoire");
  });

  it("une écriture sans réponse est « incertaine » (pas de relance automatique)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("timeout"));
    await expect(requete("https://graph.facebook.com/x", { method: "POST", classifier: classifierMeta, ecriture: true })).rejects.toMatchObject({ code: "incertain" });
    await expect(requete("https://graph.facebook.com/x", { classifier: classifierMeta })).rejects.toMatchObject({ code: "transitoire" });
  });

  it("les jetons sont masqués dans les messages d'erreur", () => {
    expect(masquerSecrets("https://x?access_token=EAAB123&a=1")).toBe("https://x?access_token=***&a=1");
    expect(masquerSecrets("Authorization: Bearer abc.def")).toBe("Authorization: Bearer ***");
  });
});
