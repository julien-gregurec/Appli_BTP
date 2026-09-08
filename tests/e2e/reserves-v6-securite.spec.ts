import { expect, test, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { connexion, jetonSupabase, RESERVES, rpc } from "./reserves-aides";

/**
 * Recette ADVERSARIALE ELSATIA Réserves V6.
 *
 * Les recettes V3 à V5 démontrent que le produit FONCTIONNE. Celle-ci démontre qu'il
 * RÉSISTE : chaque test joue le rôle de l'attaquant, avec une session légitime, et essaie
 * d'obtenir ce à quoi il n'a pas droit. Un test qui passe ici veut dire « la tentative a
 * été refusée », jamais « la fonctionnalité marche ».
 *
 * Trois principes de rédaction :
 *   • on attaque par les VRAIES portes — PostgREST, les routes d'API, les écrans — jamais
 *     par une fonction interne qu'un attaquant ne pourrait pas appeler ;
 *   • on cherche une PREUVE de fuite (un marqueur unique), pas une absence de preuve : un
 *     écran vide peut être vide pour de mauvaises raisons ;
 *   • un refus doit être un refus NET, pas une page à moitié servie.
 *
 * Décor : `scripts/e2e/recette-reserves-v4.sh` puis
 * `scripts/e2e/prepare-reserves-v6-securite.sql`.
 */

const CHANTIER_A = "e0000000-0000-0000-0000-000000000001";
const CHANTIER_B = "e0000000-0000-0000-0000-0000000000b1";
const RESERVE_B = "e5000000-0000-0000-0000-0000000000b1";
const INTERVENANT_B = "e2000000-0000-0000-0000-00000000000b";
const MARQUEUR_B = "MARQUEUR_SECRET_B_ne_doit_jamais_fuiter";
const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const ENTREPRISE_B = "b0000000-0000-0000-0000-000000000001";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);
test.describe.configure({ mode: "serial", timeout: 300_000 });

/** Budget large : la recette mesure des REFUS, pas la latence d'un poste chargé. */
const BUDGET = 60_000;

function rest(request: APIRequestContext, jeton: string, chemin: string) {
  return request.get(`${process.env.E2E_SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
    },
    timeout: BUDGET,
  });
}

function patch(
  request: APIRequestContext, jeton: string, chemin: string, corps: Record<string, unknown>,
) {
  return request.patch(`${process.env.E2E_SUPABASE_URL}/rest/v1/${chemin}`, {
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    data: corps,
    timeout: BUDGET,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// §1 — Cloisonnement entre deux organisations SANS LIEN
// ─────────────────────────────────────────────────────────────────────────────

test("A ne voit rien de B, quel qu'en soit le chemin d'accès", async ({ request }) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");

  // Les identifiants de B sont ici CONNUS de l'attaquant : c'est l'hypothèse forte, et
  // la bonne — un uuid n'est pas un secret, il circule dans les URL et les exports.
  const lectures: [string, string][] = [
    ["chantier deviné", `reserves_chantiers?id=eq.${CHANTIER_B}&select=*`],
    ["réserve devinée", `reserves?id=eq.${RESERVE_B}&select=*`],
    ["photos de la réserve", `reserves_photos?reserve_id=eq.${RESERVE_B}&select=*`],
    ["historique de la réserve", `reserves_historique?reserve_id=eq.${RESERVE_B}&select=*`],
    ["messages de B", `reserves_messages?entreprise_id=eq.${ENTREPRISE_B}&select=*`],
    ["intervenants de B", `reserves_intervenants?entreprise_id=eq.${ENTREPRISE_B}&select=*`],
    ["plans de B", `reserves_plans?entreprise_id=eq.${ENTREPRISE_B}&select=*`],
    ["toutes les réserves, sans filtre", "reserves?select=id,titre&limit=1000"],
    ["registre d'idempotence", "reserves_mutations_appliquees?select=*&limit=1000"],
  ];

  for (const [nom, chemin] of lectures) {
    const reponse = await rest(request, jetonA, chemin);
    expect(reponse.status(), `${nom} : la requête doit aboutir, pas planter`).toBeLessThan(300);
    const corps = await reponse.text();
    expect(corps, `${nom} : aucune donnée de B ne doit apparaître`).not.toContain(MARQUEUR_B);
    expect(corps, `${nom} : aucun identifiant de B ne doit apparaître`).not.toContain(CHANTIER_B);
  }
});

test("B ne voit rien de A, symétriquement", async ({ request }) => {
  const jetonB = await jetonSupabase(request, "admin-b@invalid.local");
  const reponse = await rest(request, jetonB, `reserves?chantier_id=eq.${CHANTIER_A}&select=*`);
  expect(reponse.status()).toBeLessThan(300);
  expect(await reponse.json()).toEqual([]);
});

test("A ne peut ni exporter ni imprimer le chantier de B", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");

  // Le PDF serveur : la vérification préalable rend 404, et Chromium n'est même pas lancé.
  const pdf = await page.request.get(
    `${RESERVES}/api/documents/chantier/${CHANTIER_B}/pdf`, { timeout: 120_000 });
  expect(pdf.status()).toBe(404);

  // Le document imprimable, qui EST le rendu du PDF : il ne doit rien servir non plus.
  const imprimable = await page.request.get(`${RESERVES}/imprimer/chantier/${CHANTIER_B}`);
  expect(await imprimable.text()).not.toContain(MARQUEUR_B);

  // Et l'écran d'export.
  await page.goto(`${RESERVES}/chantiers/${CHANTIER_B}/export`);
  expect(await page.locator("body").innerText()).not.toContain(MARQUEUR_B);

  // La fiche de réserve, ouverte par identifiant deviné.
  await page.goto(`${RESERVES}/reserves/${RESERVE_B}`);
  expect(await page.locator("body").innerText()).not.toContain(MARQUEUR_B);
});

test("l'annuaire ne s'élargit pas : ni caractère joker, ni terme trop court", async ({
  request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  // `%` et `_` sont les jokers de `like` : un terme qui n'en est composé que ne doit pas
  // rendre le registre des organisations ELSATIA.
  for (const terme of ["%%%", "___", "%_%", "a"]) {
    const reponse = await rpc(request, jetonA, "reserves_annuaire_rechercher", {
      p_entreprise_id: ENTREPRISE_A, p_terme: terme,
    });
    expect(reponse.status()).toBeLessThan(300);
    const resultats = (await reponse.json()) as unknown[];
    // Le décor ne publie AUCUNE organisation à l'annuaire : tout résultat serait un
    // élargissement. La borne à 20 de la fonction ne suffirait pas à excuser une liste.
    expect(resultats, `terme « ${terme} »`).toEqual([]);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §2 — Invitations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Crée une entreprise intervenante NEUVE sur le chantier de A.
 *
 * Les tests d'invitation ne peuvent pas s'appuyer sur l'intervenant du décor : une
 * invitation est à usage unique, et le décor est traversé par les recettes V3 à V5 qui
 * le laissent « rattaché ». Chaque test part donc de sa propre ligne, au statut
 * « invitée », ce qui le rend rejouable indéfiniment et indépendant de l'ordre.
 */
async function intervenantNeuf(request: APIRequestContext, jetonA: string): Promise<string> {
  const reponse = await request.post(
    `${process.env.E2E_SUPABASE_URL}/rest/v1/reserves_intervenants`,
    {
      headers: {
        apikey: process.env.E2E_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jetonA}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      data: {
        entreprise_id: ENTREPRISE_A,
        chantier_id: CHANTIER_A,
        nom: `Securite ${randomUUID().slice(0, 8)}`,
        corps_etat: "Recette sécurité",
        email_contact: "gerant-b@invalid.local",
      },
      timeout: BUDGET,
    },
  );
  expect(reponse.status(), await reponse.text()).toBeLessThan(300);
  return ((await reponse.json()) as { id: string }[])[0].id;
}

test("un jeton expiré, révoqué ou rejoué donne exactement le même écran", async ({
  page, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const { createHash } = await import("node:crypto");
  const empreinte = (jeton: string) => createHash("sha256").update(jeton).digest("hex");

  // 1. Révoqué.
  const jetonRevoque = `securite-revoque-${Date.now()}`;
  const emission = await rpc(request, jetonA, "reserves_inviter_intervenant", {
    p_intervenant_id: await intervenantNeuf(request, jetonA),
    p_token_hash: empreinte(jetonRevoque),
    p_email: "gerant-b@invalid.local", p_contact_nom: null,
  });
  expect(emission.status()).toBe(200);
  const invitationId = await emission.json();
  expect((await rpc(request, jetonA, "reserves_invitation_revoquer", {
    p_invitation_id: invitationId,
  })).status()).toBeLessThan(300);

  // 2. Inexistant.
  const jetonInconnu = `securite-inconnu-${Date.now()}`;

  // Le même écran, mot pour mot : sans cela, la différence entre les deux réponses
  // dirait à un tiers si un lien a existé — et donc si une entreprise a été invitée.
  const textes: string[] = [];
  for (const jeton of [jetonRevoque, jetonInconnu]) {
    await page.goto(`${RESERVES}/invitation/${jeton}`);
    const texte = await page.locator("body").innerText();
    expect(texte).toContain("n’est plus valide");
    // Aucune information sur le chantier, l'hôte ou l'intervenant ne doit filtrer.
    expect(texte).not.toContain("RECETTE_A_Groupe scolaire");
    expect(texte).not.toContain("Étanchéité B");
    textes.push(texte);
  }
  expect(textes[0]).toBe(textes[1]);
});

test("un jeton émis pour une organisation précise n'en rattache aucune autre", async ({
  request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const jetonB = await jetonSupabase(request, "admin-b@invalid.local");
  const { createHash } = await import("node:crypto");
  const clair = `securite-cible-${Date.now()}`;

  const emission = await rpc(request, jetonA, "reserves_inviter_intervenant", {
    p_intervenant_id: await intervenantNeuf(request, jetonA),
    p_token_hash: createHash("sha256").update(clair).digest("hex"),
    p_email: "gerant-b@invalid.local", p_contact_nom: null,
    // Lien NOMINATIF : émis pour l'entreprise intervenante, pas pour B.
    p_entreprise_cible_id: "f0000000-0000-0000-0000-000000000001",
  });
  expect(emission.status()).toBe(200);

  // B, qui détient le lien (volé, transféré par erreur), tente de s'en servir.
  const acceptation = await rpc(request, jetonB, "reserves_invitation_accepter", {
    p_token_hash: createHash("sha256").update(clair).digest("hex"),
    p_entreprise_id: ENTREPRISE_B,
  });
  expect(acceptation.status()).toBeGreaterThanOrEqual(400);
  expect(await acceptation.text()).toContain("autre organisation");

  // Et B n'a rien gagné au passage.
  const apres = await rest(request, jetonB, `reserves?chantier_id=eq.${CHANTIER_A}&select=id`);
  expect(await apres.json()).toEqual([]);
});

test("le lien d'invitation ne voyage plus dans l'URL de retour", async ({ page }) => {
  // Régression V5 : le lien — donc le jeton en clair — était placé en paramètre d'URL
  // quand l'e-mail ne partait pas. Il atterrissait dans l'historique du navigateur et
  // dans les journaux d'accès du serveur, où il survivait aux trente jours de validité.
  await connexion(page, "admin-a@invalid.local");
  await page.goto(`${RESERVES}/intervenants`);

  const champ = page.locator('input[name="email"]').first();
  if (await champ.count() === 0) test.skip(true, "Aucun formulaire d'invitation dans ce décor");

  const avant = page.url();
  await champ.fill(`securite-${Date.now()}@invalid.local`);
  await page.getByRole("button", { name: /Inviter|Envoyer l’invitation/i }).first().click();
  await page.waitForURL((u) => u.toString() !== avant, { timeout: 30_000 }).catch(() => undefined);

  // Le canal e-mail n'est pas configuré en recette : c'est précisément le chemin d'échec
  // qui exposait le jeton. L'URL ne doit porter qu'un drapeau.
  expect(page.url()).not.toContain("/invitation/");
  expect(page.url()).not.toMatch(/lien=https?%3A/);
});

// ─────────────────────────────────────────────────────────────────────────────
// §3 — Workflow : ce que la base refuse, quoi qu'en dise le client
// ─────────────────────────────────────────────────────────────────────────────

test("le cœur de transition n'est pas appelable par un utilisateur authentifié", async ({
  request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const reponse = await rpc(request, jetonA, "reserves_appliquer_transition", {
    p_reserve_id: RESERVE_B, p_statut_apres: "levee", p_commentaire: null,
    p_intervenant_id: null,
  });
  // Fonction non exposée : PostgREST ne la trouve pas, ou le droit d'exécution manque.
  expect(reponse.status()).toBeGreaterThanOrEqual(400);
});

test("le statut d'une réserve ne se force pas par écriture directe", async ({ request }) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER_A, p_titre: `Statut force ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: null,
    p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;

  // L'écriture directe est ACCORDÉE sur la table — c'est ainsi que se corrige un titre.
  // Ce qui doit être impossible, c'est de sauter la machine à états.
  for (const champ of [
    { statut: "levee" }, { levee_at: new Date().toISOString() }, { numero: 99999 },
    { entreprise_id: ENTREPRISE_B },
  ]) {
    const reponse = await patch(request, jetonA, `reserves?id=eq.${reserveId}`, champ);
    expect(reponse.status(), JSON.stringify(champ)).toBeGreaterThanOrEqual(400);
  }

  const apres = await rest(request, jetonA, `reserves?id=eq.${reserveId}&select=statut`);
  expect((await apres.json())[0].statut).toBe("emise");
});

/**
 * DÉFAUT CONNU, NON CORRIGÉ DANS CE LOT — correctif SQL bloqué par le train global.
 *
 * Marqué `fixme` à dessein : il énonce le comportement ATTENDU, échoue aujourd'hui, et
 * passera au vert le jour où la garde de rattachement proposée dans
 * `docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql` sera numérotée et
 * jouée. Le laisser en échec silencieux, ou le supprimer, reviendrait à oublier le
 * défaut ; le laisser rouge rendrait la recette inutilisable comme garde-fou.
 */
test.fixme(
  "le porteur d'une réserve ne change pas par écriture directe, sans trace",
  async ({ request }) => {
    const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
    const reponse = await patch(
      request, jetonA, `reserves_intervenants?id=eq.${INTERVENANT_B}`,
      { entreprise_intervenante_id: ENTREPRISE_B },
    );
    // Aujourd'hui : 200, l'entreprise précédente est dessaisie sans révocation tracée.
    expect(reponse.status()).toBeGreaterThanOrEqual(400);
  },
);

test("l'historique ne peut être ni réécrit ni effacé", async ({ request }) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const lignes = await rest(
    request, jetonA, `reserves_historique?select=id&limit=1`);
  const historique = (await lignes.json()) as { id: string }[];
  expect(historique.length, "le décor doit contenir de l'historique").toBeGreaterThan(0);
  const id = historique[0].id;

  expect((await patch(request, jetonA, `reserves_historique?id=eq.${id}`, {
    commentaire: "réécrit",
  })).status()).toBeGreaterThanOrEqual(400);

  const suppression = await request.delete(
    `${process.env.E2E_SUPABASE_URL}/rest/v1/reserves_historique?id=eq.${id}`,
    {
      headers: {
        apikey: process.env.E2E_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${jetonA}`,
      },
      timeout: BUDGET,
    },
  );
  expect(suppression.status()).toBeGreaterThanOrEqual(400);

  const toujours = await rest(request, jetonA, `reserves_historique?id=eq.${id}&select=id`);
  expect((await toujours.json())).toHaveLength(1);
});

test("un intervenant ne valide pas sa propre levée", async ({ request }) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");

  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER_A, p_titre: `Auto-levée ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;
  expect((await rpc(request, jetonB, "reserves_repondre_responsabilite", {
    p_reserve_id: reserveId, p_accepte: true,
  })).status()).toBeLessThan(300);
  expect((await rpc(request, jetonB, "reserves_demander_levee", {
    p_reserve_id: reserveId, p_commentaire: null,
  })).status()).toBeLessThan(300);

  // L'intervenant tente la validation par les deux portes disponibles.
  expect((await rpc(request, jetonB, "reserves_statuer_levee", {
    p_reserve_id: reserveId, p_validee: true, p_commentaire: null,
  })).status()).toBeGreaterThanOrEqual(400);

  const differee = await rpc(request, jetonB, "reserves_transition_differee", {
    p_reserve_id: reserveId, p_statut_apres: "levee", p_commentaire: null,
    p_intervenant_id: null, p_origine_client_id: randomUUID(),
  });
  const issues = (await differee.json()) as { issue: string }[];
  // Un refus franc, ou un conflit — jamais une application.
  if (differee.status() < 300) {
    expect(issues[0]?.issue).not.toBe("appliquee");
  }

  const etat = await rest(request, jetonA, `reserves?id=eq.${reserveId}&select=statut`);
  expect((await etat.json())[0].statut).toBe("levee_demandee");
});

test("la photo obligatoire ne se contourne pas par la file hors-ligne", async ({
  page, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER_A, p_titre: `Preuve exigée ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: INTERVENANT_B,
    p_photo_obligatoire_levee: true, p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");
  expect((await rpc(request, jetonB, "reserves_repondre_responsabilite", {
    p_reserve_id: reserveId, p_accepte: true,
  })).status()).toBeLessThan(300);

  // L'intervenant demande la levée par la route hors-ligne, SANS avoir déposé de preuve.
  await connexion(page, "gerant-b@invalid.local");
  const contexte = await page.evaluate(async () => {
    const r = await fetch("/api/offline/ping"); return r.status;
  });
  expect(contexte).toBe(204);

  const identite = await rest(request, jetonB, "reserves_intervenants?select=id&limit=1");
  expect(identite.status()).toBeLessThan(300);

  const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: {
      mutations: [{
        id: randomUUID(), type: "levee_demander",
        entrepriseId: "f0000000-0000-0000-0000-000000000001",
        utilisateurId: "f0000000-0000-0000-0000-0000000000a1",
        reserveId, chantierId: null, version: 1, payload: {},
      }],
    },
    timeout: BUDGET,
  });
  expect(reponse.status()).toBe(200);
  const corps = (await reponse.json()) as { resultats: { issue: string; motif?: string }[] };
  expect(corps.resultats[0].issue).toBe("refus");
  expect(corps.resultats[0].motif).toContain("Photo obligatoire");

  const etat = await rest(request, jetonA, `reserves?id=eq.${reserveId}&select=statut`);
  expect((await etat.json())[0].statut).toBe("acceptee");
});

// ─────────────────────────────────────────────────────────────────────────────
// §4 — File hors-ligne : cloisonnement et format
// ─────────────────────────────────────────────────────────────────────────────

test("une mutation préparée par A ne part jamais sous la session de B", async ({ page }) => {
  await connexion(page, "gerant-b@invalid.local");
  const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: {
      mutations: [{
        id: randomUUID(), type: "reserve_creer",
        // Identité DÉCLARÉE = organisation A. La session, elle, est celle de B.
        entrepriseId: ENTREPRISE_A,
        utilisateurId: "10000000-0000-0000-0000-000000000001",
        reserveId: null, chantierId: CHANTIER_A, version: 1,
        payload: { titre: "Injection inter-tenant" },
      }],
    },
    timeout: BUDGET,
  });
  expect(reponse.status()).toBe(200);
  const corps = (await reponse.json()) as { resultats: { issue: string; motif?: string }[] };
  expect(corps.resultats[0].issue).toBe("refus");
  expect(corps.resultats[0].motif).toContain("autre identité");
});

test("une photo préparée sous une autre identité est refusée", async ({ page }) => {
  await connexion(page, "gerant-b@invalid.local");
  const corps = new FormData();
  const reponse = await page.request.post(`${RESERVES}/api/offline/photo`, {
    multipart: {
      mutationId: randomUUID(),
      reserveId: randomUUID(),
      usage: "constat",
      entrepriseId: ENTREPRISE_A,
      utilisateurId: "10000000-0000-0000-0000-000000000001",
      photo: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff]) },
    },
    timeout: BUDGET,
  });
  expect(corps).toBeDefined();
  expect(reponse.status()).toBe(403);
  expect((await reponse.json()).motif).toContain("autre identité");
});

test("une charge utile d'un format plus récent est refusée, pas interprétée", async ({
  page,
}) => {
  // Scénario réel : l'application se met à jour pendant qu'une file est active, ou un
  // appareil rouvre un onglet servi par un service worker plus ancien. Deviner le sens
  // d'un format inconnu serait pire que refuser.
  await connexion(page, "admin-a@invalid.local");
  const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
    data: {
      mutations: [{
        id: randomUUID(), type: "reserve_creer",
        entrepriseId: ENTREPRISE_A,
        utilisateurId: "10000000-0000-0000-0000-000000000001",
        reserveId: null, chantierId: CHANTIER_A, version: 99,
        payload: { titre: "Format inconnu" },
      }],
    },
    timeout: BUDGET,
  });
  const corps = (await reponse.json()) as { resultats: { issue: string; motif?: string }[] };
  expect(corps.resultats[0].issue).toBe("refus");
  expect(corps.resultats[0].motif).toContain("version plus récente");
});

test("les routes hors-ligne répondent 401, jamais une redirection HTML", async ({
  request,
}) => {
  // Un client hors ligne qui reçoit un 307 vers /login ne peut pas le distinguer d'une
  // réponse métier : il classerait une session expirée en échec définitif et perdrait
  // des constats valides.
  for (const chemin of ["/api/offline/mutations", "/api/offline/photo"]) {
    const reponse = await request.post(`${RESERVES}${chemin}`, {
      data: { mutations: [] }, maxRedirects: 0,
      timeout: BUDGET,
    });
    expect(reponse.status(), chemin).toBe(401);
    expect(reponse.headers()["content-type"] ?? "").toContain("json");
  }
});

test("rejouer trois fois la même mutation ne crée qu'une réserve", async ({ page }) => {
  await connexion(page, "admin-a@invalid.local");
  const cle = randomUUID();
  const titre = `Idempotence V6 ${randomUUID().slice(0, 8)}`;
  const mutation = {
    id: cle, type: "reserve_creer", entrepriseId: ENTREPRISE_A,
    utilisateurId: "10000000-0000-0000-0000-000000000001",
    reserveId: null, chantierId: CHANTIER_A, version: 1, payload: { titre },
  };

  const identifiants = new Set<string>();
  for (let i = 0; i < 3; i += 1) {
    const reponse = await page.request.post(`${RESERVES}/api/offline/mutations`, {
      data: { mutations: [mutation] },
      timeout: BUDGET,
    });
    expect(reponse.status()).toBe(200);
    const corps = (await reponse.json()) as
      { resultats: { issue: string; identifiant: string }[] };
    expect(["applique", "rejeu"]).toContain(corps.resultats[0].issue);
    identifiants.add(corps.resultats[0].identifiant);
  }
  expect(identifiants.size, "les trois envois rendent la MÊME réserve").toBe(1);
});

test("une photo dont l'objet est déjà déposé finit par être acquittée", async ({
  page, request,
}) => {
  // LE scénario que la V5 perdait. La route dépose l'objet, puis l'accusé se perd — un
  // tunnel, une batterie vide, un onglet fermé. La file renvoie la même mutation : le
  // chemin étant dérivé de la clé d'idempotence, l'objet est déjà là. En V5, ce renvoi
  // demandait l'écrasement, que les policies Storage refusent délibérément ; la photo
  // échouait cinq fois puis était abandonnée, alors qu'elle se trouvait dans le bucket.
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER_A, p_titre: `Photo rejouée ${randomUUID().slice(0, 8)}`,
    p_description: null, p_priorite: "normale", p_intervenant_id: null,
    p_origine_client_id: randomUUID(),
  });
  const reserveId = (await creation.json()) as string;

  await connexion(page, "admin-a@invalid.local");
  const mutationId = randomUUID();
  // Un JPEG minimal mais RÉEL : le serveur valide le type, pas le nom du fichier.
  const image = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a"
    + "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA"
    + "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64");

  const envoi = () => page.request.post(`${RESERVES}/api/offline/photo`, {
    multipart: {
      mutationId, reserveId, usage: "constat",
      entrepriseId: ENTREPRISE_A,
      utilisateurId: "10000000-0000-0000-0000-000000000001",
      photo: { name: "constat.jpg", mimeType: "image/jpeg", buffer: image },
    },
    timeout: BUDGET,
  });

  const premier = await envoi();
  expect(premier.status(), await premier.text()).toBe(200);
  const identifiant = (await premier.json()).identifiant as string;

  // Deux renvois, exactement comme la file les produirait.
  for (const essai of [1, 2]) {
    const rejeu = await envoi();
    expect(rejeu.status(), `renvoi ${essai} : ${await rejeu.text()}`).toBe(200);
    expect((await rejeu.json()).identifiant).toBe(identifiant);
  }

  // Et une seule photo en base, disponible : ni doublon, ni preuve fantôme.
  const photos = await rpc(request, jetonA, "reserves_photos_visibles", {
    p_reserve_id: reserveId,
  });
  expect(((await photos.json()) as unknown[])).toHaveLength(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// §5 — Surface HTTP
// ─────────────────────────────────────────────────────────────────────────────

test("les en-têtes de sécurité sont posés sur toutes les pages", async ({ request }) => {
  for (const chemin of ["/login", "/hors-ligne", "/invitation/inexistant"]) {
    const reponse = await request.get(`${RESERVES}${chemin}`);
    const entetes = reponse.headers();
    const csp = entetes["content-security-policy"] ?? "";
    expect(csp, chemin).toContain("frame-ancestors 'none'");
    expect(csp, chemin).toMatch(/script-src [^;]*'nonce-[a-f0-9]+'/);
    expect(csp, chemin).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(entetes["x-content-type-options"], chemin).toBe("nosniff");
    expect(entetes["x-frame-options"], chemin).toBe("DENY");
    expect(entetes["referrer-policy"], chemin).toBe("strict-origin-when-cross-origin");
    expect(entetes["x-powered-by"], chemin).toBeUndefined();
    // Aucune page ne doit être mémorisable par un cache PARTAGÉ : elles portent
    // les données d'un tenant, et un nonce valable pour une seule requête.
    expect(entetes["cache-control"] ?? "", chemin).toContain("no-store");
  }
});

test("chaque requête reçoit un nonce distinct, et le HTML le porte", async ({ request }) => {
  const nonces = new Set<string>();
  for (let i = 0; i < 3; i += 1) {
    const reponse = await request.get(`${RESERVES}/login`);
    const csp = reponse.headers()["content-security-policy"] ?? "";
    const nonce = /nonce-([a-f0-9]+)/.exec(csp)?.[1];
    expect(nonce).toBeTruthy();
    nonces.add(nonce!);
    const html = await reponse.text();
    const scripts = html.match(/<script/g)?.length ?? 0;
    const avecNonce = html.match(new RegExp(`<script[^>]*nonce="${nonce}"`, "g"))?.length ?? 0;
    // Un seul script sans nonce et la page ne s'anime plus : c'est le piège d'une CSP
    // à nonce posée sur une page pré-rendue à la construction.
    expect(avecNonce, "tous les scripts portent le nonce").toBe(scripts);
  }
  expect(nonces.size, "le nonce n'est jamais réutilisé").toBe(3);
});

test("la sonde de joignabilité ne dit rien de l'utilisateur", async ({ request }) => {
  const reponse = await request.get(`${RESERVES}/api/offline/ping`);
  expect(reponse.status()).toBe(204);
  expect((await reponse.body()).length).toBe(0);
  expect(reponse.headers()["cache-control"]).toContain("no-store");
});

test("la tâche planifiée refuse un secret absent ou faux", async ({ request }) => {
  for (const entete of [undefined, "Bearer faux", "Bearer "] as (string | undefined)[]) {
    const reponse = await request.get(`${RESERVES}/api/cron/notifications`, {
      headers: entete ? { authorization: entete } : {},
      maxRedirects: 0,
      timeout: BUDGET,
    });
    // 401 quand le secret est configuré, 503 quand il ne l'est pas : jamais un traitement.
    expect([401, 503]).toContain(reponse.status());
  }
});
