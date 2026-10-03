// ELSATIA — Pack opérateur V9 : contrôles git (SHA canonique, branche, worktree propre).
//
// Le pack vit sur une branche qui CONTIENT le train canonique 6392131 et n'ajoute que de
// l'outillage et de la documentation. On prouve donc :
//   1. 6392131 est un ancêtre de HEAD ;
//   2. supabase/migrations de HEAD = celui de 6392131 (même arbre git, octet pour octet) ;
//   3. entre 6392131 et HEAD, seuls des fichiers du pack ont changé (liste blanche) : le code
//      à déployer reste exactement 6392131 ;
//   4. branche autorisée, jamais main / release / production ; worktree propre.
// La collecte appelle `git` en lecture seule ; l'évaluation est pure (testée).

import { spawnSync } from "node:child_process";
import { BRANCHES_INTERDITES, BRANCHES_PACK_AUTORISEES, SHA_CANONIQUE } from "./constantes.mjs";

/** Chemins que le pack a le droit d'ajouter ou de modifier par rapport au train canonique. */
export const CHEMINS_PACK = Object.freeze([
  /^scripts\/preview\/v9\//,
  /^docs\/runbooks\/ELSATIA_V9_[A-Z0-9_]+\.md$/,
  /^docs\/runbooks\/sql\/ELSATIA_V9_[A-Z0-9_]+\.sql$/,
  /^docs\/qualification\/ELSATIA_V9_PREVIEW_OPERATOR_PACK_V\d+\.md$/,
  /^docs\/qualification\/preview-pack\/V9_[A-Z0-9_]+\.generated\.md$/,
  /^package\.json$/, // scripts npm seulement : vérifié par dependancesIdentiques()
]);

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

/** Lecture seule de l'état git. */
export function collecterEtatGit(root) {
  const head = git(root, ["rev-parse", "HEAD"]).out;
  const branche = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
  const statut = git(root, ["status", "--porcelain", "--untracked-files=all"]).out;
  const canoniquePresent = git(root, ["cat-file", "-e", `${SHA_CANONIQUE}^{commit}`]).code === 0;
  const ancetre = canoniquePresent && git(root, ["merge-base", "--is-ancestor", SHA_CANONIQUE, "HEAD"]).code === 0;
  const arbreCanonique = canoniquePresent ? git(root, ["rev-parse", `${SHA_CANONIQUE}:supabase/migrations`]).out : null;
  const arbreHead = git(root, ["rev-parse", "HEAD:supabase/migrations"]).out;
  const fichiersModifies = ancetre ? git(root, ["diff", "--name-only", SHA_CANONIQUE, "HEAD"]).out.split("\n").filter(Boolean) : null;
  const pkgCanonique = canoniquePresent ? git(root, ["show", `${SHA_CANONIQUE}:package.json`]).out : null;
  const pkgHead = git(root, ["show", "HEAD:package.json"]).out;
  return { head, branche, sale: statut ? statut.split("\n").length : 0, canoniquePresent, ancetre, arbreCanonique, arbreHead, fichiersModifies, pkgCanonique, pkgHead };
}

/** package.json : seule la section `scripts` peut différer du canonique. */
export function dependancesIdentiques(pkgA, pkgB) {
  try {
    const a = JSON.parse(pkgA);
    const b = JSON.parse(pkgB);
    delete a.scripts; delete b.scripts;
    return JSON.stringify(a) === JSON.stringify(b);
  } catch { return false; }
}

/** Évaluation pure. */
export function evaluerGit(e) {
  const constats = [];
  const c = (ok, code, message) => constats.push({ ok, code, message });
  c(e.canoniquePresent, "GIT-SHA-CONNU", e.canoniquePresent ? `commit canonique ${SHA_CANONIQUE.slice(0, 12)} présent` : `commit canonique ${SHA_CANONIQUE.slice(0, 12)} introuvable (git fetch origin ${"integration/elsatia-canonical-train-v9-final"})`);
  c(e.ancetre, "GIT-SHA-ANCETRE", e.ancetre ? `HEAD ${String(e.head).slice(0, 12)} contient ${SHA_CANONIQUE.slice(0, 12)}` : `HEAD ${String(e.head).slice(0, 12)} ne contient PAS le train canonique : mauvais SHA`);
  c(Boolean(e.arbreCanonique) && e.arbreCanonique === e.arbreHead, "GIT-MIGRATIONS-IDENTIQUES", e.arbreCanonique === e.arbreHead ? "supabase/migrations identique au canonique (même arbre git)" : "supabase/migrations DIFFÈRE du canonique");
  if (e.fichiersModifies) {
    const horsPack = e.fichiersModifies.filter((f) => !CHEMINS_PACK.some((m) => m.test(f)));
    c(horsPack.length === 0, "GIT-CODE-IDENTIQUE", horsPack.length ? `${horsPack.length} fichier(s) hors pack modifié(s) depuis le canonique : ${horsPack.slice(0, 5).join(", ")}` : `code déployable identique au canonique (${e.fichiersModifies.length} fichier(s) du pack seulement)`);
    if (e.fichiersModifies.includes("package.json")) c(dependancesIdentiques(e.pkgCanonique, e.pkgHead), "GIT-PACKAGE-JSON", "package.json : seuls les scripts npm diffèrent du canonique");
  }
  const interdite = BRANCHES_INTERDITES.some((m) => m.test(e.branche ?? ""));
  c(!interdite && BRANCHES_PACK_AUTORISEES.includes(e.branche), "GIT-BRANCHE", interdite ? `branche ${e.branche} INTERDITE` : BRANCHES_PACK_AUTORISEES.includes(e.branche) ? `branche ${e.branche}` : `branche ${e.branche || "(détachée)"} non autorisée (attendu : ${BRANCHES_PACK_AUTORISEES.join(" ou ")})`);
  c(e.sale === 0, "GIT-PROPRE", e.sale === 0 ? "worktree propre" : `worktree sale : ${e.sale} entrée(s) (git status --porcelain)`);
  return { ok: constats.every((x) => x.ok), constats };
}
