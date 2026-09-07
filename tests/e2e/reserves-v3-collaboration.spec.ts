import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { createHash } from "node:crypto";

/**
 * Parcours V3 de bout en bout, dans le navigateur.
 *
 * Périmètre : l'application ELSATIA Réserves (port 3020), distincte de Gestion Pro que
 * visent les autres spécifications de ce dossier. Elle exige donc son propre serveur et
 * le décor de `scripts/e2e/prepare-reserves-v3-recipe.sql` :
 *
 *   npm run db:reset
 *   psql "$DATABASE_URL" -f scripts/e2e/prepare-local-recipe.sql
 *   psql "$DATABASE_URL" -f scripts/e2e/prepare-reserves-v3-recipe.sql
 *   npm --prefix apps/reserves run build && npm --prefix apps/reserves run start
 *   E2E_RESERVES_URL=http://127.0.0.1:3020 npx playwright test reserves-v3
 *
 * Le lien d'invitation ne peut pas être lu dans un e-mail : le jeton en clair n'existe
 * que dans l'URL remise à l'émetteur. Le test le PRODUIT donc lui-même, exactement comme
 * l'application — jeton aléatoire, empreinte SHA-256 envoyée à la base — et vérifie que
 * l'invitation ouvre bien l'accès. C'est ce qui prouve que le lien, et lui seul, est le
 * mécanisme d'accès.
 */

const RESERVES = process.env.E2E_RESERVES_URL ?? "http://127.0.0.1:3020";
const INTERVENANT = "e2000000-0000-0000-0000-00000000000b";
const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const PLAN = "e3000000-0000-0000-0000-000000000001";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);

async function jetonSupabase(request: APIRequestContext, email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !key || !url.startsWith("http://127.0.0.1")) {
    throw new Error("La recette E2E exige un Supabase local explicite");
  }
  const reponse = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password: "test" },
  });
  expect(reponse.status()).toBe(200);
  return (await reponse.json()).access_token as string;
}

async function rpc(
  request: APIRequestContext,
  accessToken: string,
  fonction: string,
  parametres: Record<string, unknown>,
) {
  const url = process.env.E2E_SUPABASE_URL!;
  const key = process.env.E2E_SUPABASE_ANON_KEY!;
  return request.post(`${url}/rest/v1/rpc/${fonction}`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    data: parametres,
  });
}

async function connexion(page: Page, email: string, destination: string) {
  await page.goto(`${RESERVES}/login?next=${encodeURIComponent(destination)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("A invite B, B rejoint, lève une réserve pointée page 2, A exporte puis révoque", async ({
  page, request,
}) => {
  const jetonA = await jetonSupabase(request, "admin-a@invalid.local");

  // ── 1. A émet l'invitation ────────────────────────────────────────────────
  const jeton = `recette-${Date.now()}`;
  const empreinte = createHash("sha256").update(jeton).digest("hex");
  const invitation = await rpc(request, jetonA, "reserves_inviter_intervenant", {
    p_intervenant_id: INTERVENANT,
    p_token_hash: empreinte,
    p_email: "gerant-b@invalid.local",
    p_contact_nom: "Bernard É.",
  });
  expect(invitation.status()).toBe(200);

  // ── 2. La page d'invitation est lisible SANS session ──────────────────────
  await page.goto(`${RESERVES}/invitation/${jeton}`);
  await expect(page.locator("body")).toContainText("RECETTE_A_Groupe scolaire");
  await expect(page.locator("body")).toContainText("Étanchéité B");

  // ── 3. B se connecte et rejoint ───────────────────────────────────────────
  await connexion(page, "gerant-b@invalid.local", `/invitation/${jeton}`);
  await expect(page).toHaveURL(new RegExp(`/invitation/`));
  await page.getByRole("button", { name: "Rejoindre l’intervention" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.locator("body")).toContainText("rattaché à l’intervention");

  // Le lien est à usage unique : le rejouer ne rattache rien.
  await page.goto(`${RESERVES}/invitation/${jeton}`);
  await expect(page.locator("body")).toContainText("n’est plus valide");
  await page.getByRole("button", { name: "Se déconnecter" }).click().catch(() => {});

  // ── 4. A crée une réserve pointée sur la page 2 du plan PDF ───────────────
  const creation = await rpc(request, jetonA, "reserves_creer", {
    p_chantier_id: CHANTIER,
    p_titre: "Relevé d’étanchéité insuffisant",
    p_description: "Le relevé ne monte pas à 15 cm au-dessus du niveau fini.",
    p_priorite: "haute",
    p_intervenant_id: INTERVENANT,
    p_plan_id: PLAN,
    p_position_x: 0.6125,
    p_position_y: 0.32,
    p_photo_obligatoire_levee: false,
    p_echeance: null,
    p_origine_client_id: null,
    p_plan_page: 2,
  });
  expect(creation.status()).toBe(200);
  const reserveId = (await creation.json()) as string;

  // ── 5. B est notifiée, accepte, puis demande la levée ─────────────────────
  await connexion(page, "gerant-b@invalid.local", "/notifications");
  await expect(page.locator("body")).toContainText("Réserve attribuée à votre entreprise");

  await page.goto(`${RESERVES}/reserves/${reserveId}`);
  await page.getByRole("button", { name: /Accepter/i }).click();
  await expect(page.locator("body")).toContainText(/Acceptée/i);

  await page.getByRole("button", { name: /Demander la levée/i }).click();
  await expect(page.locator("body")).toContainText(/Levée demandée/i);
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  // ── 6. A valide la levée ──────────────────────────────────────────────────
  await connexion(page, "admin-a@invalid.local", `/reserves/${reserveId}`);
  await page.getByRole("button", { name: "Valider la levée" }).click();
  await expect(page.locator("body")).toContainText(/Levée/);

  // ── 7. A exporte le PDF de B ──────────────────────────────────────────────
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}/export?entreprise=${INTERVENANT}`);
  await expect(page.locator("body")).toContainText("1 réserve dans ce document");
  const imprimable = await page.request.get(
    `${RESERVES}/imprimer/chantier/${CHANTIER}?entreprise=${INTERVENANT}&historique=complet`,
  );
  expect(imprimable.status()).toBe(200);
  const documentHtml = await imprimable.text();
  expect(documentHtml).toContain("Étanchéité B");
  expect(documentHtml).toContain("page 2");
  // Le document restreint ne doit rien contenir d'une autre entreprise.
  expect(documentHtml).not.toContain("RECETTE_B_Etancheite");

  // ── 8. A révoque B, l'historique reste intact ─────────────────────────────
  await page.goto(`${RESERVES}/intervenants`);
  await page.getByRole("button", { name: "Révoquer l’accès" }).first().click();
  await expect(page.locator("body")).toContainText(/révoqué/i);

  const historique = await rpc(request, jetonA, "reserves_export_historique", {
    p_chantier_id: CHANTIER, p_intervenant_id: INTERVENANT,
  });
  expect(historique.status()).toBe(200);
  const lignes = (await historique.json()) as { action: string }[];
  expect(lignes.map((l) => l.action)).toEqual(
    expect.arrayContaining(["creation", "acceptation", "demande_levee", "levee_validee"]),
  );
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  // ── 9. B n'a plus accès ───────────────────────────────────────────────────
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");
  const apresRevocation = await rpc(request, jetonB, "reserves_export_chantier", {
    p_chantier_id: CHANTIER,
  });
  expect(apresRevocation.status()).toBe(200);
  expect((await apresRevocation.json()) as unknown[]).toHaveLength(0);
});
