import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { connexion, deconnexionUI, jetonSupabase, RESERVES, rpc } from "./reserves-aides";

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

const INTERVENANT = "e2000000-0000-0000-0000-00000000000b";
const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const PLAN = "e3000000-0000-0000-0000-000000000001";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);

// Ce parcours enchaîne deux identités réelles, six navigations rendues côté serveur et un
// export : il dépasse structurellement le budget par défaut (45 s) de la configuration,
// calibré pour des tests d'écran. Le budget est donc relevé ICI plutôt que globalement,
// pour ne pas masquer une lenteur sur les tests courts.
test.describe.configure({ timeout: 180_000 });

/** Bascule d'identité : session vierge, sans dépendre d'un bouton propre à la coquille. */
async function deconnexion(page: Page) {
  await page.context().clearCookies();
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
  // Cette page est PUBLIQUE : elle ne porte aucun bouton de déconnexion. La bascule
  // d'identité se fait donc en repartant d'une session vierge, ce qui est aussi la
  // garantie que l'étape suivante s'exécute bien sous l'acteur annoncé.
  await deconnexion(page);

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
  // Libellé réel de l'écran : la prise en charge s'énonce à la première personne.
  await page.getByRole("button", { name: "J’accepte" }).click();
  await expect(page.locator("body")).toContainText(/Acceptée/i);

  await page.getByRole("button", { name: /Demander la levée/i }).click();
  await expect(page.locator("body")).toContainText(/Levée demandée/i);
  await deconnexionUI(page);

  // ── 6. A valide la levée ──────────────────────────────────────────────────
  await connexion(page, "admin-a@invalid.local", `/reserves/${reserveId}`);
  await page.getByRole("button", { name: "Valider la levée" }).click();
  await expect(page.locator("body")).toContainText(/Levée/);

  // ── 7. A exporte le PDF de B ──────────────────────────────────────────────
  await page.goto(`${RESERVES}/chantiers/${CHANTIER}/export?entreprise=${INTERVENANT}`);
  // On n'affirme PAS un décompte : le chantier de recette porte d'autres réserves, et un
  // test couplé à leur nombre casserait à chaque enrichissement du décor sans qu'aucune
  // régression n'ait eu lieu. Ce qui doit être vrai, c'est le CLOISONNEMENT.
  await expect(page.locator("body")).toContainText(/réserves? dans ce document/);
  const imprimable = await page.request.get(
    `${RESERVES}/imprimer/chantier/${CHANTIER}?entreprise=${INTERVENANT}&format=detaillee`,
  );
  expect(imprimable.status()).toBe(200);
  const documentHtml = await imprimable.text();
  expect(documentHtml).toContain("Étanchéité B");
  // La réserve créée par ce parcours, pointée page 2 du plan, est bien dans le document.
  expect(documentHtml).toContain("Relevé d’étanchéité insuffisant");
  expect(documentHtml).toContain("page 2");
  // Le document restreint ne contient AUCUNE réserve d'un autre corps d'état.
  expect(documentHtml).not.toContain("RECETTE_B_Etancheite");
  expect(documentHtml).not.toContain("Menuiserie C");
  expect(documentHtml).not.toContain("Calfeutrement de menuiserie");

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
  await deconnexionUI(page);

  // ── 9. B n'a plus accès ───────────────────────────────────────────────────
  const jetonB = await jetonSupabase(request, "gerant-b@invalid.local");
  const apresRevocation = await rpc(request, jetonB, "reserves_export_chantier", {
    p_chantier_id: CHANTIER,
  });
  expect(apresRevocation.status()).toBe(200);
  expect((await apresRevocation.json()) as unknown[]).toHaveLength(0);
});
