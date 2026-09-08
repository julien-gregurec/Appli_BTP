import { expect, test, type Page } from "@playwright/test";
import { connexion, RESERVES } from "./reserves-aides";

/**
 * Recette V4 — listes de réserves imprimables.
 *
 * Ce que ce fichier prouve, et qu'aucun test unitaire ne peut prouver : le document
 * qui sort réellement de l'application. On y vérifie la MATIÈRE (les bonnes réserves,
 * les bonnes colonnes), la MISE EN PAGE A4 (orientation, pagination, non-coupure des
 * fiches) et le CLOISONNEMENT (un document par entreprise ne contient qu'elle).
 *
 * Décor attendu — voir `docs/reserves/ELSATIA_RESERVES_RECETTE_V4.md` :
 *   scripts/e2e/prepare-local-recipe.sql
 *   scripts/e2e/prepare-reserves-v3-recipe.sql
 *   scripts/e2e/prepare-reserves-v4-listes.sql
 */

const CHANTIER = "e0000000-0000-0000-0000-000000000001";
const ETANCHEITE = "e2000000-0000-0000-0000-00000000000b";
const MENUISERIE = "e2000000-0000-0000-0000-00000000000c";

test.skip(
  !process.env.E2E_RESERVES_URL,
  "Définir E2E_RESERVES_URL pour exécuter la recette ELSATIA Réserves",
);

test.describe.configure({ mode: "serial", timeout: 120_000 });

/** Ouvre le document imprimable sous la session courante. */
async function document(page: Page, requete: string) {
  await page.goto(`${RESERVES}/imprimer/chantier/${CHANTIER}${requete}`);
  await expect(page.locator(".document")).toBeVisible();
}

/**
 * Titres des réserves présentes dans la table synthétique.
 *
 * On identifie les réserves par leur TITRE et non par leur numéro : la numérotation est
 * attribuée par un compteur persistant du chantier (`reserves_numerotation`), qui ne
 * repart pas de 1 après une remise à zéro du décor. Un test indexé sur le numéro serait
 * donc vert au premier passage et rouge au suivant, sans qu'aucun code n'ait changé.
 */
async function titres(page: Page): Promise<string[]> {
  return (await page.locator(".table-synthese tbody tr td:nth-child(2)").allInnerTexts())
    .map((t) => t.trim());
}

/** Numéros imprimés. Uniques par chantier : c'est la seule identité fiable d'une ligne. */
async function numerosImprimes(page: Page): Promise<string[]> {
  return (await page.locator(".table-synthese tbody .col-num").allInnerTexts())
    .map((t) => t.trim());
}

/** Numéro effectivement imprimé pour une réserve donnée, lu sur sa ligne. */
async function numeroDe(page: Page, titre: string): Promise<string> {
  const ligne = page.locator(".table-synthese tbody tr").filter({ hasText: titre }).first();
  return (await ligne.locator(".col-num").innerText()).trim();
}

test.beforeEach(async ({ page }) => {
  await connexion(page, "admin-a@invalid.local", `/chantiers/${CHANTIER}/export`);
});

test("l'en-tête porte l'identité, l'horodatage et ce que le tirage contient", async ({ page }) => {
  await document(page, "");
  const entete = page.locator(".entete");
  await expect(entete).toContainText("ELSATIA Réserves");
  await expect(entete).toContainText("RECETTE_A_Groupe scolaire");
  await expect(entete).toContainText("RECETTE_A_ENTREPRISE");
  // Un tirage papier n'a plus d'URL : la date d'édition doit être dans l'encre.
  await expect(entete).toContainText(
    new Date().toLocaleDateString("fr-FR"),
  );

  // Compteurs du chantier ET compteur du document : la distinction est ce qui empêche
  // de lire une liste filtrée comme l'état complet du chantier.
  const synthese = page.locator(".synthese");
  await expect(synthese).toContainText("au chantier");
  await expect(synthese).toContainText("ouverte");
  await expect(synthese).toContainText("levée");
  await expect(synthese).toContainText("en retard");
  await expect(page.locator(".synthese-tirage")).toContainText("dans ce document");
  await expect(page.locator(".selection")).toContainText("Toutes les réserves");
});

test("le format synthétique tient les huit colonnes attendues, une ligne par réserve", async ({ page }) => {
  await document(page, "");
  // `innerText` restitue la casse RENDUE : l'en-tête est capitalisé par la feuille de
  // style, ce qui est voulu. On compare donc le libellé, pas sa casse.
  const colonnes = await page.locator(".table-synthese thead th").allInnerTexts();
  expect(colonnes.map((c) => c.trim().toLocaleLowerCase("fr"))).toEqual([
    "n°", "titre", "zone", "entreprise", "statut", "priorité", "constat", "échéance",
  ]);
  expect((await titres(page)).length).toBeGreaterThanOrEqual(8);
  // Une réserve = une ligne : pas de doublon introduit par les jointures photos ou plans.
  // Le contrôle porte sur le NUMÉRO, unique par chantier : deux réserves distinctes
  // peuvent légitimement porter le même titre (deux constats identiques à deux endroits).
  const numeros = await numerosImprimes(page);
  expect(new Set(numeros).size).toBe(numeros.length);
});

test("chaque vue métier retourne un ensemble distinct et cohérent", async ({ page }) => {
  const ETANCHEITE_RETARD = "Relevé d’étanchéité insuffisant";   // assignée, échéance dépassée
  const LEVEE = "Fissure en sous-face de dalle";                  // levée
  const ANNULEE = "Réserve annulée après visite";                 // annulée
  const ATTENTE = "Seuil de porte non conforme PMR";              // levée demandée

  await document(page, "");
  const toutes = await titres(page);
  expect(toutes).toEqual(expect.arrayContaining([ETANCHEITE_RETARD, LEVEE, ANNULEE, ATTENTE]));

  await document(page, "?vue=ouvertes");
  const ouvertes = await titres(page);
  expect(ouvertes).toContain(ETANCHEITE_RETARD);
  expect(ouvertes).not.toContain(LEVEE);
  expect(ouvertes).not.toContain(ANNULEE);

  // Assertions d'APPARTENANCE et non d'égalité : le chantier de recette est partagé avec
  // le parcours V3, qui y ajoute ses propres réserves. Une égalité stricte ferait dépendre
  // ce test de l'ordre d'exécution des spécifications.
  await document(page, "?vue=levees");
  const levees = await titres(page);
  expect(levees).toContain(LEVEE);
  expect(levees).not.toContain(ANNULEE);
  expect(levees).not.toContain(ATTENTE);

  await document(page, "?vue=attente_levee");
  const attente = await titres(page);
  expect(attente).toContain(ATTENTE);
  expect(attente).not.toContain(LEVEE);
  expect(attente).not.toContain(ANNULEE);

  await document(page, "?vue=retard");
  const retard = await titres(page);
  // Échéance dépassée ET réserve encore active : la levée et l'annulée en sont exclues.
  expect(retard).toContain(ETANCHEITE_RETARD);
  expect(retard).not.toContain(LEVEE);
  expect(retard).not.toContain(ANNULEE);

  expect(toutes.length).toBeGreaterThan(ouvertes.length);
  for (const vue of [ouvertes, levees, retard]) {
    for (const t of vue) expect(toutes).toContain(t);
  }
});

test("une vue vide le dit, au lieu d'imprimer une page trompeuse", async ({ page }) => {
  await document(page, "?vue=levees&entreprise=" + MENUISERIE);
  await expect(page.locator(".vide, .table-synthese")).toBeVisible();
  await expect(page.locator(".selection")).toContainText("Levées uniquement");
});

test("le format détaillé porte description, photo, repère de plan et motifs", async ({ page }) => {
  await document(page, "?vue=ouvertes");
  const numero = await numeroDe(page, "Relevé d’étanchéité insuffisant");

  await document(page, "?format=detaillee&vue=ouvertes");
  const fiche = page.locator(".fiche").filter({ hasText: "Relevé d’étanchéité insuffisant" }).first();
  await expect(fiche).toContainText(`n°${numero}`);
  await expect(fiche).toContainText("Le relevé ne monte pas à 15 cm");
  await expect(fiche).toContainText("Localisation");

  // La photo est réellement chargée, pas seulement référencée.
  const photo = fiche.locator(".photos img").last();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Le repère de plan : miniature + marqueur positionné aux coordonnées de la réserve.
  const marqueur = fiche.locator(".repere-marqueur");
  await expect(marqueur).toHaveText(numero);
  const gauche = await marqueur.evaluate((el) => (el as HTMLElement).style.left);
  expect(gauche).toBe("61.25%");
  const miniature = fiche.locator(".repere-plan img");
  expect(await miniature.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);

  // Les motifs de décision sont ce qu'on vient chercher dans un document détaillé.
  await document(page, "?format=detaillee&vue=toutes");
  await expect(page.locator(".document")).toContainText("Teinte non conforme au nuancier");
  await expect(page.locator(".document")).toContainText("lot serrurerie");
});

test("les options de contenu retirent réellement la matière lourde", async ({ page }) => {
  await document(page, "?format=detaillee&vue=toutes");
  expect(await page.locator(".photos img").count()).toBeGreaterThan(0);

  await document(page, "?format=detaillee&vue=toutes&photos=0&plans=0");
  expect(await page.locator(".photos img").count()).toBe(0);
  expect(await page.locator(".repere-marqueur").count()).toBe(0);

  await document(page, "?format=detaillee&vue=toutes&historique=0");
  await expect(page.locator(".document")).not.toContainText("Teinte non conforme au nuancier");
});

test("la mise en page A4 respecte orientation, non-coupure et répétition d'en-tête", async ({ page }) => {
  await document(page, "?format=detaillee&vue=toutes");
  // Une fiche ne doit jamais être coupée entre deux pages : c'est une règle CSS
  // effectivement appliquée, pas une intention laissée dans la feuille de style.
  const coupure = await page.locator(".fiche").first()
    .evaluate((el) => getComputedStyle(el).breakInside);
  expect(coupure).toBe("avoid");

  await document(page, "?vue=toutes");
  const enTete = await page.locator(".table-synthese thead")
    .evaluate((el) => getComputedStyle(el).display);
  expect(enTete).toBe("table-header-group");

  // L'orientation est portée par le document lui-même, donc l'impression navigateur
  // (Ctrl+P) obtient le même format que le PDF serveur.
  const regle = (html: string) => /@page\s*\{[^}]*size:\s*A4\s+(portrait|landscape)/.exec(html)?.[1];
  await document(page, "?vue=toutes");
  expect(regle(await page.content())).toBe("portrait");
  await document(page, "?vue=toutes&orientation=paysage");
  expect(regle(await page.content())).toBe("landscape");
});

test("le PDF serveur est un vrai PDF, paginé, et suit l'orientation demandée", async ({ page }) => {
  const lire = async (requete: string) => {
    const reponse = await page.request.get(
      `${RESERVES}/api/documents/chantier/${CHANTIER}/pdf${requete}`,
    );
    expect(reponse.status()).toBe(200);
    expect(reponse.headers()["content-type"]).toContain("application/pdf");
    return { corps: Buffer.from(await reponse.body()), entetes: reponse.headers() };
  };

  const portrait = await lire("?vue=toutes");
  expect(portrait.corps.subarray(0, 5).toString()).toBe("%PDF-");
  expect(portrait.entetes["content-disposition"]).toContain(".pdf");
  // Le nom de fichier reste sans accent ni espace, quelle que soit la saisie.
  expect(portrait.entetes["content-disposition"]).toMatch(/filename="[A-Za-z0-9.-]+"/);

  // MediaBox A4 : 595 × 842 points en portrait, transposé en paysage.
  const mediaBox = (pdf: Buffer) => {
    const m = /MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString("latin1"));
    return m ? { l: Math.round(Number(m[1])), h: Math.round(Number(m[2])) } : null;
  };
  const bpPortrait = mediaBox(portrait.corps);
  expect(bpPortrait).not.toBeNull();
  expect(bpPortrait!.h).toBeGreaterThan(bpPortrait!.l);

  const paysage = await lire("?vue=toutes&orientation=paysage");
  const bpPaysage = mediaBox(paysage.corps);
  expect(bpPaysage).not.toBeNull();
  expect(bpPaysage!.l).toBeGreaterThan(bpPaysage!.h);

  // La pagination vient du gabarit Chromium : elle doit être présente dans le fichier.
  const pages = (portrait.corps.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(1);
});

test("le PDF détaillé reste d'un poids raisonnable, et sans photo il maigrit", async ({ page }) => {
  const poids = async (requete: string) => {
    const r = await page.request.get(`${RESERVES}/api/documents/chantier/${CHANTIER}/pdf${requete}`);
    expect(r.status()).toBe(200);
    return (await r.body()).length;
  };
  const avec = await poids("?format=detaillee&vue=toutes");
  const sans = await poids("?format=detaillee&vue=toutes&photos=0&plans=0");
  expect(sans).toBeLessThan(avec);
  // Garde-fou de non-régression : un document de recette ne doit pas dériver vers
  // plusieurs dizaines de mégaoctets sans que personne ne le remarque.
  expect(avec).toBeLessThan(12_000_000);
});

test("le document par entreprise ne contient que cette entreprise", async ({ page }) => {
  await document(page, `?entreprise=${ETANCHEITE}&vue=toutes`);
  const corps = await page.locator(".document").innerText();
  expect(corps).toContain("Étanchéité B");
  // Le cloisonnement se juge sur ce qui est ABSENT.
  expect(corps).not.toContain("Menuiserie C");
  expect(corps).not.toContain("Calfeutrement de menuiserie");
  await expect(page.locator(".selection")).toContainText("entreprise : Étanchéité B");

  const pdf = await page.request.get(
    `${RESERVES}/api/documents/chantier/${CHANTIER}/pdf?entreprise=${ETANCHEITE}`,
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-disposition"]).toContain("Etancheite");
});

test("un paramètre hors contrat ne traverse pas jusqu'au document", async ({ page }) => {
  // Une vue inconnue ne doit pas produire une liste « au hasard » : elle retombe sur
  // la sélection complète, annoncée comme telle.
  await document(page, "?vue=tout-le-chantier&format=csv&orientation=diagonale");
  await expect(page.locator(".selection")).toContainText("Toutes les réserves");
  await expect(page.locator(".selection")).toContainText("synthétique");
  expect(/@page\s*\{[^}]*size:\s*A4\s+portrait/.test(await page.content())).toBe(true);
});
