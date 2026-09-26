import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { connexion, jetonSupabase, RESERVES, rpc } from "./reserves-aides";

/**
 * ELSATIA-RESERVES-FULL-LOCAL-QUALIFICATION-V1 — recette navigateur de bout en bout.
 *
 * Contre une pile RÉELLE : GoTrue (compilé), PostgREST (binaire officiel), storage-api
 * (service officiel, stockage fichier), Postgres 16 portant le train complet, Réserves
 * compilée (`next start`). Aucune passerelle simulée : chaque refus vient du vrai service.
 *
 * Décor : `recette-reserves-v4.sh` + `prepare-reserves-v6-securite.sql` +
 * `prepare-reserves-qualification-v1.sql` + `prepare-local-recipe.sql`
 * (voir `scripts/e2e/pile-locale-reserves.sh`).
 *
 * Acteurs : conducteur-a (responsable réserves, hôte A), ouvrier-a (émetteur A),
 * intervenant-libre (organisation SANS accès Réserves : compte gratuit par invitation).
 */

const CHANTIER = "e8100000-0000-0000-0000-000000000001";
const INTERVENANT_LIBRE = "e8200000-0000-0000-0000-000000000001";
const INTERVENANT_TIERS = "e8200000-0000-0000-0000-000000000002";
const ENTREPRISE_A = "a0000000-0000-0000-0000-000000000001";
const ENTREPRISE_LIBRE = "c8000000-0000-0000-0000-000000000001";
const RESPONSABLE = "conducteur-a@invalid.local";
const EMETTEUR = "ouvrier-a@invalid.local";
const LIBRE = "intervenant-libre@invalid.local";
const SUPABASE = process.env.E2E_SUPABASE_URL ?? "";
const ANON = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const BASE = process.env.E2E_DATABASE_URL ?? "";

const TITRE_R1 = `Joint fissuré salle de bain ${randomUUID().slice(0, 6)}`;
const MARQUEUR_INTERNE = `MARQUEUR_INTERNE_${randomUUID().slice(0, 8)}`;
const MARQUEUR_TIERS = `MARQUEUR_TIERS_${randomUUID().slice(0, 8)}`;

test.skip(
  !process.env.E2E_RESERVES_URL || !BASE.startsWith("postgresql://") || !BASE.includes("@127.0.0.1:"),
  "Recette locale : E2E_RESERVES_URL et E2E_DATABASE_URL (127.0.0.1) requis",
);
test.describe.configure({ mode: "serial", timeout: 240_000 });

/** Écriture de service directe, strictement locale : simule le back-office (suspension…). */
function sql(requete: string) {
  return execFileSync("psql", [BASE, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", requete], {
    encoding: "utf8",
  }).trim();
}

async function jpeg(teinte: number) {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: { r: teinte, g: 120, b: 90 } } })
    .jpeg().toBuffer();
}

function stockage(request: APIRequestContext, chemin: string, options: {
  jeton?: string; methode?: "GET" | "POST" | "DELETE"; donnees?: unknown; type?: string;
} = {}) {
  const entetes: Record<string, string> = { apikey: ANON };
  if (options.jeton) entetes.Authorization = `Bearer ${options.jeton}`;
  if (options.type) entetes["Content-Type"] = options.type;
  return request.fetch(`${SUPABASE}/storage/v1/${chemin}`, {
    method: options.methode ?? "GET", headers: entetes, data: options.donnees as never, timeout: 60_000,
  });
}

async function nouvellePage(browser: Browser, email: string, destination: string): Promise<Page> {
  const contexte = await browser.newContext();
  const page = await contexte.newPage();
  await connexion(page, email, destination);
  return page;
}

let reserve1 = "";
let reserveInterne = "";
let reserveTiers = "";
let photoInterne = "";

test.beforeAll(() => {
  // État nominal garanti, quel que soit l'ordre des passes précédentes.
  sql(`update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = null
       where id in ('${ENTREPRISE_A}', '${ENTREPRISE_LIBRE}')`);
  sql("truncate public.rate_limits_applicatifs");
});

test("1. invitation : l'organisation sans accès rejoint par le lien et obtient un compte gratuit", async ({
  page, request,
}) => {
  expect(sql(`select count(*) from public.acces_applications_entreprises
              where entreprise_id = '${ENTREPRISE_LIBRE}'`)).toBe("0");

  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");
  const clair = `qualif-${randomUUID()}`;
  const invitation = await rpc(request, jetonA, "reserves_inviter_intervenant", {
    p_intervenant_id: INTERVENANT_LIBRE,
    p_token_hash: createHash("sha256").update(clair).digest("hex"),
    p_email: LIBRE, p_contact_nom: "Inès C.",
  });
  expect(invitation.status()).toBe(200);

  await connexion(page, LIBRE, `/invitation/${clair}`);
  await expect(page.locator("body")).toContainText("QUALIF_Résidence Les Tilleuls");
  await page.getByRole("button", { name: "Rejoindre l’intervention" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  expect(sql(`select source from public.acces_applications_entreprises
              where entreprise_id = '${ENTREPRISE_LIBRE}' and application_code = 'reserves'`))
    .toBe("reserves_invitation_gratuite");
  expect(sql(`select role_code from public.habilitations_applications_utilisateurs
              where entreprise_id = '${ENTREPRISE_LIBRE}' and application_code = 'reserves'`))
    .toBe("reserves_intervenant");
});

test("2. l'émetteur crée à l'écran une réserve à photo obligatoire, attribuée à l'intervenant", async ({
  page, request,
}) => {
  await connexion(page, EMETTEUR, `/chantiers/${CHANTIER}/nouvelle-reserve`);
  await page.getByLabel("Ce qui est constaté").fill(TITRE_R1);
  await page.getByLabel("Description").fill("Joint de douche fissuré sur 30 cm.");
  await page.getByLabel("Entreprise à qui l’attribuer").selectOption(INTERVENANT_LIBRE);
  await page.getByLabel("Exiger une photo des travaux avant la demande de levée").check();
  await page.getByRole("button", { name: "Envoyer la réserve" }).click();
  await expect(page).toHaveURL(/\/reserves\/[0-9a-f-]{36}/);
  reserve1 = page.url().match(/reserves\/([0-9a-f-]{36})/)![1];
  await expect(page.locator("body")).toContainText("Photo exigée pour la levée");

  // Témoins de cloisonnement : une réserve interne, une réserve d'un autre corps d'état,
  // chacune avec un marqueur unique et une photo déposée par l'hôte.
  const jetonE = await jetonSupabase(request, EMETTEUR);
  reserveInterne = (await (await rpc(request, jetonE, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: MARQUEUR_INTERNE, p_description: "note interne",
  })).json()) as string;
  reserveTiers = (await (await rpc(request, jetonE, "reserves_creer", {
    p_chantier_id: CHANTIER, p_titre: MARQUEUR_TIERS, p_intervenant_id: INTERVENANT_TIERS,
  })).json()) as string;

  const depot = await rpc(request, jetonE, "reserves_ajouter_photo", {
    p_reserve_id: reserveInterne, p_usage: "constat", p_mime_type: "image/jpeg",
  });
  const [{ photo_id, storage_path }] = (await depot.json()) as { photo_id: string; storage_path: string }[];
  photoInterne = storage_path;
  const envoi = await stockage(request, `object/reserves-photos/${storage_path}`, {
    jeton: jetonE, methode: "POST", donnees: await jpeg(40), type: "image/jpeg",
  });
  expect(envoi.status(), await envoi.text()).toBe(200);
  expect((await rpc(request, jetonE, "reserves_confirmer_photo", { p_photo_id: photo_id })).status()).toBe(204);
});

test("3. l'intervenant est notifié, ne voit que sa réserve, commente et accepte", async ({ page }) => {
  await connexion(page, LIBRE, "/notifications");
  await expect(page.locator("body")).toContainText("Réserve attribuée à votre entreprise");

  await page.goto(`${RESERVES}/reserves`);
  await expect(page.locator("body")).toContainText(TITRE_R1);
  await expect(page.locator("body")).not.toContainText(MARQUEUR_INTERNE);
  await expect(page.locator("body")).not.toContainText(MARQUEUR_TIERS);

  for (const id of [reserveInterne, reserveTiers]) {
    await page.goto(`${RESERVES}/reserves/${id}`);
    await expect(page.locator("body")).not.toContainText(/MARQUEUR_/);
  }

  await page.goto(`${RESERVES}/reserves/${reserve1}`);
  await page.getByLabel("Message", { exact: true }).fill("Intervention prévue jeudi matin.");
  await page.getByRole("button", { name: "Envoyer", exact: true }).click();
  await expect(page.locator("body")).toContainText("Intervention prévue jeudi matin.");
  await page.getByRole("button", { name: "J’accepte" }).click();
  await expect(page.locator("body")).toContainText(/Acceptée/i);
});

test("4. photo obligatoire : la levée reste bloquée jusqu'à la photo « après », déposée dans le vrai Storage", async ({
  page,
}) => {
  await connexion(page, LIBRE, `/reserves/${reserve1}`);
  const demande = page.getByRole("button", { name: "Demander la levée" });
  await expect(demande).toBeDisabled();

  await page.getByLabel("Ajouter une photo").setInputFiles({
    name: "apres.jpg", mimeType: "image/jpeg", buffer: await jpeg(200),
  });
  await page.getByLabel("Nature").selectOption("travaux");
  await page.getByRole("button", { name: "Joindre la photo" }).click();
  await expect(page.locator("body")).not.toContainText(/error=/);
  await expect(demande).toBeEnabled();
  await demande.click();
  await expect(page.locator("body")).toContainText(/Levée demandée/i);

  expect(sql(`select count(*) from storage.objects o join public.reserves_photos p
              on p.storage_path = o.name and o.bucket_id = 'reserves-photos'
              where p.reserve_id = '${reserve1}' and p.usage = 'travaux'
                and p.ajoutee_par_entreprise_id = '${ENTREPRISE_LIBRE}'`)).toBe("1");
});

test("5. Storage réel : URL signée pour ses photos, refus pour celles des autres", async ({ request }) => {
  const jetonL = await jetonSupabase(request, LIBRE);
  const chemins = sql(`select string_agg(storage_path, ',') from public.reserves_photos
                       where reserve_id = '${reserve1}'`).split(",");
  expect(chemins.length).toBeGreaterThan(0);

  const signature = await stockage(request, `object/sign/reserves-photos/${chemins[0]}`, {
    jeton: jetonL, methode: "POST", donnees: { expiresIn: 60 }, type: "application/json",
  });
  expect(signature.status()).toBe(200);
  const { signedURL } = (await signature.json()) as { signedURL: string };
  const telechargement = await request.get(`${SUPABASE}/storage/v1${signedURL}`);
  expect(telechargement.status()).toBe(200);
  expect((await telechargement.body()).subarray(0, 2).toString("hex")).toBe("ffd8");

  // Jeton d'URL signée altéré : refus.
  const altere = await request.get(`${SUPABASE}/storage/v1${signedURL.replace(/token=([^&]{5})/, "token=XXXXX")}`);
  expect(altere.status()).toBeGreaterThanOrEqual(400);

  // Photo d'une réserve qui ne lui est pas attribuée : aucune URL n'est émise.
  const refus = await stockage(request, `object/sign/reserves-photos/${photoInterne}`, {
    jeton: jetonL, methode: "POST", donnees: { expiresIn: 60 }, type: "application/json",
  });
  expect(refus.status()).toBeGreaterThanOrEqual(400);
  const lectureDirecte = await stockage(request, `object/authenticated/reserves-photos/${photoInterne}`, { jeton: jetonL });
  expect(lectureDirecte.status()).toBeGreaterThanOrEqual(400);

  // Anonyme : rien.
  const anonyme = await stockage(request, `object/sign/reserves-photos/${chemins[0]}`, {
    methode: "POST", donnees: { expiresIn: 60 }, type: "application/json",
  });
  expect(anonyme.status()).toBeGreaterThanOrEqual(400);
  expect((await stockage(request, `object/public/reserves-photos/${chemins[0]}`)).status()).toBeGreaterThanOrEqual(400);

  // Dépôt dans le dossier d'une réserve d'un autre corps d'état : refus par la vraie RLS.
  const intrus = await stockage(request,
    `object/reserves-photos/${ENTREPRISE_A}/${CHANTIER}/${reserveTiers}/${randomUUID()}.jpg`, {
      jeton: jetonL, methode: "POST", donnees: await jpeg(10), type: "image/jpeg",
    });
  expect(intrus.status()).toBeGreaterThanOrEqual(400);

  // Une URL signée expire.
  const courte = await stockage(request, `object/sign/reserves-photos/${chemins[0]}`, {
    jeton: jetonL, methode: "POST", donnees: { expiresIn: 1 }, type: "application/json",
  });
  const urlCourte = ((await courte.json()) as { signedURL: string }).signedURL;
  await new Promise((r) => setTimeout(r, 2_500));
  expect((await request.get(`${SUPABASE}/storage/v1${urlCourte}`)).status()).toBeGreaterThanOrEqual(400);

  // Personne ne supprime une preuve — ni l'intervenant, ni l'hôte.
  const jetonR = await jetonSupabase(request, RESPONSABLE);
  for (const jeton of [jetonL, jetonR]) {
    const suppression = await stockage(request, "object/reserves-photos", {
      jeton, methode: "DELETE", donnees: { prefixes: chemins }, type: "application/json",
    });
    expect(suppression.status() >= 400 || ((await suppression.json()) as unknown[]).length === 0).toBe(true);
  }
  expect(sql(`select count(*) from storage.objects where bucket_id = 'reserves-photos'
              and name = any(string_to_array('${chemins.join(",")}', ','))`)).toBe(String(chemins.length));
});

test("6. compte gratuit : aucune fonction payante, à l'écran comme par l'API", async ({ page, request }) => {
  await connexion(page, LIBRE, "/dashboard");
  for (const [route, attendu] of [
    ["/chantiers/nouveau", /\/chantiers$/],
    ["/intervenants", /\/dashboard/],
    ["/parametres/membres", /\/dashboard/],
    ["/parametres/annuaire", /\/dashboard/],
    [`/chantiers/${CHANTIER}/plans`, new RegExp(`/chantiers/${CHANTIER}$`)],
    [`/chantiers/${CHANTIER}/nouvelle-reserve`, new RegExp(`/chantiers/${CHANTIER}$`)],
  ] as const) {
    await page.goto(`${RESERVES}${route}`);
    await expect(page, `${route} doit être refusé au compte gratuit`).toHaveURL(attendu);
  }

  const jetonL = await jetonSupabase(request, LIBRE);
  const refuses = [
    ["reserves_creer", { p_chantier_id: CHANTIER, p_titre: "Pirate" }],
    ["reserves_statuer_levee", { p_reserve_id: reserve1, p_validee: true }],
    ["reserves_attribuer_role", {
      p_utilisateur_id: "c8000000-0000-0000-0000-0000000000a1", p_entreprise_id: ENTREPRISE_LIBRE,
      p_role_code: "reserves_admin_organisation",
    }],
    ["reserves_ajouter_plan", { p_chantier_id: CHANTIER, p_nom: "Plan pirate" }],
  ] as const;
  for (const [fonction, parametres] of refuses) {
    const reponse = await rpc(request, jetonL, fonction, parametres);
    expect(reponse.status(), `${fonction} doit être refusée`).toBeGreaterThanOrEqual(400);
  }
  const chantier = await request.post(`${SUPABASE}/rest/v1/reserves_chantiers`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jetonL}`, "Content-Type": "application/json" },
    data: { entreprise_id: ENTREPRISE_LIBRE, nom: "Mon chantier gratuit" },
  });
  expect(chantier.status()).toBeGreaterThanOrEqual(400);
});

test("7. le responsable refuse puis valide la levée ; l'historique trace chaque organisation", async ({
  page, request,
}) => {
  await connexion(page, RESPONSABLE, `/reserves/${reserve1}`);
  await page.getByLabel("Commentaire (obligatoire en cas de refus)").fill("Joint non lissé");
  await page.getByRole("button", { name: "Refuser la levée" }).click();
  await expect(page.locator("body")).toContainText(/Levée refusée/i);

  const jetonL = await jetonSupabase(request, LIBRE);
  expect((await rpc(request, jetonL, "reserves_demander_levee", {
    p_reserve_id: reserve1, p_commentaire: "Joint repris",
  })).status()).toBe(204);

  await page.reload();
  await page.getByRole("button", { name: "Valider la levée" }).click();
  // Seule une réserve LEVÉE propose la réouverture : preuve que la validation est passée.
  await expect(page.getByRole("heading", { name: "Rouvrir la réserve" })).toBeVisible();

  const jetonR = await jetonSupabase(request, RESPONSABLE);
  const historique = (await (await rpc(request, jetonR, "reserves_export_historique", {
    p_chantier_id: CHANTIER, p_intervenant_id: INTERVENANT_LIBRE,
  })).json()) as { action: string; auteur_organisation: string | null; created_at: string }[];
  const actions = historique.map((h) => h.action);
  for (const attendue of ["creation", "commentaire", "acceptation", "photo_ajoutee",
    "demande_levee", "levee_refusee", "levee_validee"]) {
    expect(actions).toContain(attendue);
  }
  // Ordre chronologique réel (transactions distinctes, horodatages distincts).
  const ordre = actions.filter((a) => ["acceptation", "demande_levee", "levee_refusee", "levee_validee"].includes(a));
  expect(ordre).toEqual(["acceptation", "demande_levee", "levee_refusee", "demande_levee", "levee_validee"]);
  // Chaque geste de l'intervenant porte son organisation (correctif D5).
  for (const ligne of historique.filter((h) => ["acceptation", "demande_levee"].includes(h.action))) {
    expect(ligne.auteur_organisation).toBe("CARRELAGE LIBRE SARL");
  }
});

test("8. PDF par entreprise : l'intervenant n'imprime que ses réserves, en-tête compris", async ({ page }) => {
  await connexion(page, LIBRE, "/dashboard");
  const imprimable = await page.request.get(`${RESERVES}/imprimer/chantier/${CHANTIER}?format=detaillee`);
  expect(imprimable.status()).toBe(200);
  const html = await imprimable.text();
  expect(html).toContain(TITRE_R1);
  expect(html).not.toContain(MARQUEUR_INTERNE);
  expect(html).not.toContain(MARQUEUR_TIERS);
  expect(html).not.toContain("Plâtrerie Tierce");
  // En-tête : « N au chantier » ne compte que ce que l'intervenant voit (correctif D3).
  expect(html).toMatch(/<b>1<\/b>au chantier/);

  const pdf = await page.request.get(`${RESERVES}/api/documents/chantier/${CHANTIER}/pdf`, { timeout: 90_000 });
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");

  // L'hôte, lui, obtient la liste d'une entreprise précise.
  await connexion(page, RESPONSABLE, "/dashboard");
  const tiers = await page.request.get(
    `${RESERVES}/imprimer/chantier/${CHANTIER}?entreprise=${INTERVENANT_TIERS}&format=detaillee`);
  const htmlTiers = await tiers.text();
  expect(htmlTiers).toContain(MARQUEUR_TIERS);
  expect(htmlTiers).not.toContain(TITRE_R1);
  expect(htmlTiers).not.toContain(MARQUEUR_INTERNE);
});

test("9. suspension de l'hôte : tout s'éteint et revient SANS reconnexion", async ({ browser }) => {
  const libre = await nouvellePage(browser, LIBRE, "/reserves");
  const responsable = await nouvellePage(browser, RESPONSABLE, "/reserves");
  await expect(libre.locator("body")).toContainText(TITRE_R1);
  await expect(responsable.locator("body")).toContainText(TITRE_R1);

  sql(`update public.entreprises set abonnement_statut = 'suspendu' where id = '${ENTREPRISE_A}'`);
  try {
    await responsable.reload();
    await expect(responsable).toHaveURL(/\/abonnement-requis/);
    await libre.reload();
    await expect(libre.locator("body")).not.toContainText(TITRE_R1);
    await libre.goto(`${RESERVES}/reserves/${reserve1}`);
    await expect(libre.locator("body")).not.toContainText(TITRE_R1);
  } finally {
    sql(`update public.entreprises set abonnement_statut = 'actif' where id = '${ENTREPRISE_A}'`);
  }
  await libre.goto(`${RESERVES}/reserves`);
  await expect(libre.locator("body")).toContainText(TITRE_R1);
  await responsable.goto(`${RESERVES}/reserves`);
  await expect(responsable.locator("body")).toContainText(TITRE_R1);
  await expect(libre).not.toHaveURL(/\/login/);
  await expect(responsable).not.toHaveURL(/\/login/);
  await libre.context().close();
  await responsable.context().close();
});

test("10. révocation de l'entreprise puis réactivation, session ouverte", async ({ browser, request }) => {
  const libre = await nouvellePage(browser, LIBRE, "/reserves");
  await expect(libre.locator("body")).toContainText(TITRE_R1);

  const jetonR = await jetonSupabase(request, RESPONSABLE);
  const revocation = await rpc(request, jetonR, "reserves_revoquer_intervenant", {
    p_intervenant_id: INTERVENANT_LIBRE, p_motif: "Fin de lot",
  });
  expect(revocation.status()).toBe(200);
  await libre.reload();
  await expect(libre).toHaveURL(/\/abonnement-requis/);

  expect((await rpc(request, jetonR, "reserves_reactiver_intervenant", {
    p_intervenant_id: INTERVENANT_LIBRE,
  })).status()).toBe(204);
  await libre.goto(`${RESERVES}/reserves`);
  await expect(libre.locator("body")).toContainText(TITRE_R1);
  await libre.context().close();
});

test("11. habilitation retirée puis membre désactivé : effet à la requête suivante", async ({ browser }) => {
  const libre = await nouvellePage(browser, LIBRE, "/reserves");
  await expect(libre.locator("body")).toContainText(TITRE_R1);

  sql(`update public.habilitations_applications_utilisateurs set autorise = false
       where entreprise_id = '${ENTREPRISE_LIBRE}' and application_code = 'reserves'`);
  try {
    await libre.reload();
    await expect(libre).toHaveURL(/\/acces-refuse|\/abonnement-requis/);
  } finally {
    sql(`update public.habilitations_applications_utilisateurs set autorise = true
         where entreprise_id = '${ENTREPRISE_LIBRE}' and application_code = 'reserves'`);
  }
  await libre.goto(`${RESERVES}/reserves`);
  await expect(libre.locator("body")).toContainText(TITRE_R1);

  sql(`update public.utilisateurs_entreprises set statut = 'desactive'
       where utilisateur_id = 'c8000000-0000-0000-0000-0000000000a1'`);
  try {
    await libre.reload();
    await expect(libre.locator("body")).not.toContainText(TITRE_R1);
  } finally {
    sql(`update public.utilisateurs_entreprises set statut = 'actif'
         where utilisateur_id = 'c8000000-0000-0000-0000-0000000000a1'`);
  }
  await libre.context().close();
});

test("12. session révoquée ailleurs : l'écran repart sur la connexion", async ({ browser, request }) => {
  const libre = await nouvellePage(browser, LIBRE, "/reserves");
  await expect(libre.locator("body")).toContainText(TITRE_R1);

  // Déconnexion globale depuis un autre appareil : toutes les sessions GoTrue tombent.
  const jetonAutre = await jetonSupabase(request, LIBRE);
  const sortie = await request.post(`${SUPABASE}/auth/v1/logout?scope=global`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jetonAutre}` },
  });
  expect(sortie.status()).toBe(204);

  await libre.goto(`${RESERVES}/reserves`);
  await expect(libre).toHaveURL(/\/login/);
  await libre.context().close();
});

test("13. Gestion Pro : le responsable reprend un chantier GP (nom, adresse), le résumé et le lien suivent", async ({
  page, request,
}) => {
  const CHANTIER_GP = "a4000000-0000-0000-0000-000000000001";
  sql(`update public.chantiers set adresse = '12 rue des Tanneurs', code_postal = '68000', ville = 'Colmar'
       where id = '${CHANTIER_GP}'`);

  // L'émetteur n'a pas le droit de gérer les chantiers Réserves : pas d'écran.
  await connexion(page, EMETTEUR, "/chantiers/nouveau");
  await expect(page).toHaveURL(/\/chantiers$/);

  await connexion(page, RESPONSABLE, "/chantiers/nouveau");
  const bloc = page.locator('[data-test="import-gestion-pro"]');
  await expect(bloc).toContainText("TEST_A_Chantier assigné");
  await bloc.getByRole("button", { name: "Reprendre TEST_A_Chantier assigné" }).click();
  await expect(page).toHaveURL(/\/chantiers\/[0-9a-f-]{36}$/);
  const idReserves = page.url().match(/chantiers\/([0-9a-f-]{36})/)![1];
  await expect(page.locator("body")).toContainText("TEST_A_Chantier assigné");

  expect(sql(`select concat_ws('|', source, chantier_gp_id, adresse, code_postal, ville)
              from public.reserves_chantiers where id = '${idReserves}'`))
    .toBe(`gestion_pro|${CHANTIER_GP}|12 rue des Tanneurs|68000|Colmar`);

  // Reprendre à nouveau resynchronise sans doublon.
  await page.goto(`${RESERVES}/chantiers/nouveau`);
  await page.locator('[data-test="import-gestion-pro"]')
    .getByRole("button", { name: "Reprendre TEST_A_Chantier assigné" }).click();
  await expect(page).toHaveURL(new RegExp(`/chantiers/${idReserves}$`));

  // Sens Réserves → GP : résumé et cible du lien, pour qui a le droit Réserves seulement.
  const jetonR = await jetonSupabase(request, RESPONSABLE);
  const resume = (await (await rpc(request, jetonR, "reserves_resume_chantier_gp", {
    p_chantier_gp_id: CHANTIER_GP,
  })).json()) as { chantier_reserves_id: string; total: number }[];
  expect(resume).toHaveLength(1);
  expect(resume[0].chantier_reserves_id).toBe(idReserves);
  const jetonGpSeul = await jetonSupabase(request, "dirigeant-a@invalid.local");
  expect(await (await rpc(request, jetonGpSeul, "reserves_resume_chantier_gp", {
    p_chantier_gp_id: CHANTIER_GP,
  })).json()).toEqual([]);
  const jetonLibre = await jetonSupabase(request, LIBRE);
  expect((await rpc(request, jetonLibre, "reserves_importer_chantier_gp", {
    p_chantier_gp_id: CHANTIER_GP,
  })).status()).toBeGreaterThanOrEqual(400);
});
