import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Non-régression du bandeau d'accueil (ELSATIA-TOOLS-MOBILE-HEADER-OVERLAP-FIX-V1).
 *
 * Défaut corrigé : `.topline` était un conteneur flex en `space-between` SANS
 * `flex-wrap` ni `gap`. Dès que la place manquait (≤ 430 px), les libellés
 * d'action se cassaient en colonnes de 33 px (« Mes / projets ») et venaient
 * toucher le logotype « ELSATIA TOOLS » — gap mesuré à 0 px — et sous 360 px le
 * groupe d'actions débordait de son conteneur de 40 px.
 *
 * Ces assertions verrouillent le contrat de mise en page. Une régression ici
 * (retrait du `flex-wrap`, du `gap` ou du `nowrap`) ramènerait le chevauchement.
 */
const CSS = readFileSync(
  path.join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);

/** Retourne le corps de la première règle portant exactement ce sélecteur. */
function regle(selecteur: string, dansMediaMax?: number): string {
  const source = dansMediaMax === undefined ? CSS : blocMedia(dansMediaMax);
  const motif = new RegExp(
    `(^|[},])\\s*${selecteur.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\s*\\{([^}]*)\\}`,
    "m",
  );
  const trouve = source.match(motif);
  if (!trouve) throw new Error(`Règle introuvable : ${selecteur}`);
  return trouve[2];
}

/** Corps d'un `@media (max-width: Npx)`. */
function blocMedia(maxWidth: number): string {
  const debut = CSS.indexOf(`@media (max-width: ${maxWidth}px) {`);
  if (debut < 0) throw new Error(`Media query introuvable : max-width ${maxWidth}px`);
  let profondeur = 0;
  for (let i = CSS.indexOf("{", debut); i < CSS.length; i++) {
    if (CSS[i] === "{") profondeur++;
    else if (CSS[i] === "}" && --profondeur === 0) return CSS.slice(debut, i);
  }
  throw new Error("Media query non refermée");
}

describe("bandeau d'accueil — mise en page responsive", () => {
  it("autorise le passage à la ligne plutôt que d'écraser les éléments", () => {
    const topline = regle(".topline");
    expect(topline).toMatch(/flex-wrap:\s*wrap/);
  });

  it("impose une gouttière non nulle entre le logotype et les actions", () => {
    const topline = regle(".topline");
    const gap = topline.match(/(?:^|;)\s*gap:\s*([^;]+)/);
    expect(gap, "`.topline` doit déclarer un `gap`").not.toBeNull();
    // Chaque composante du gap doit être strictement positive.
    const valeurs = gap![1].trim().split(/\s+/).map((v) => parseFloat(v));
    expect(valeurs.length).toBeGreaterThan(0);
    for (const v of valeurs) expect(v).toBeGreaterThan(0);
  });

  it("empêche le logotype de se comprimer", () => {
    expect(regle(".brand")).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  it("laisse les actions se replier en gardant leur alignement à droite", () => {
    const actions = regle(".home-actions");
    expect(actions).toMatch(/flex-wrap:\s*wrap/);
    expect(actions).toMatch(/justify-content:\s*flex-end/);
    expect(actions).toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it("interdit la coupure des libellés d'action et de la pastille", () => {
    const nowrap = CSS.match(
      /\.home-actions\s*>\s*a,\s*\.home-actions\s*>\s*\.free-pill\s*\{([^}]*)\}/,
    );
    expect(nowrap, "les libellés doivent être en `white-space: nowrap`").not.toBeNull();
    expect(nowrap![1]).toMatch(/white-space:\s*nowrap/);
  });

  it("garde une gouttière et des cibles tactiles suffisantes sur petit écran", () => {
    const topline = regle(".topline", 680);
    const gapMobile = topline.match(/gap:\s*([^;]+)/);
    expect(gapMobile).not.toBeNull();
    for (const v of gapMobile![1].trim().split(/\s+/).map((x) => parseFloat(x))) {
      expect(v).toBeGreaterThan(0);
    }

    const liens = regle(".home-actions > a", 680);
    const hauteur = liens.match(/min-height:\s*(\d+)px/);
    expect(hauteur, "les liens doivent avoir une hauteur minimale tactile").not.toBeNull();
    expect(Number(hauteur![1])).toBeGreaterThanOrEqual(44);
  });

  it("ne réduit pas les libellés sous une taille lisible", () => {
    const liens = regle(".home-actions > a", 680);
    const taille = liens.match(/font-size:\s*(\d+)px/);
    if (taille) expect(Number(taille[1])).toBeGreaterThanOrEqual(11);
  });

  it("ne masque ni le logotype ni « Mes projets »", () => {
    // Aucun `display: none` ne doit viser le bandeau d'accueil ou ses actions.
    expect(CSS).not.toMatch(/\.topline[^{]*\{[^}]*display:\s*none/);
    expect(CSS).not.toMatch(/\.home-actions[^{]*\{[^}]*display:\s*none/);
    expect(CSS).not.toMatch(/\.brand\b[^{]*\{[^}]*display:\s*none/);
  });
});
