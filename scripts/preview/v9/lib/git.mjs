// ELSATIA — Pack opérateur V9 : contrôles git (base V9.1 ancêtre, branche, worktree propre).
//
// Le pack vit DANS le train canonique (V9.2 et suivants) : le code et les migrations à
// déployer sont ceux de HEAD. On prouve donc :
//   1. la base publiée V9.1 (24a0c2e9…) est présente et ancêtre de HEAD ;
//   2. branche autorisée : integration/elsatia-canonical-train-v9.2, toute branche
//      integration/elsatia-canonical-train-v<N>[.<M>], ou la branche de travail du pack ;
//      jamais main / master / release/* / production ;
//   3. worktree propre.
// Le SHA déployé = HEAD : il est consigné dans le rapport de cutover (`sha_deploye`) et la porte
// code vérifie que le rapport porte le SHA de HEAD.
// La collecte appelle `git` en lecture seule ; l'évaluation est pure (testée).

import { spawnSync } from "node:child_process";
import { BRANCHES_INTERDITES, BRANCHES_PACK_AUTORISEES, MOTIF_BRANCHE_TRAIN, SHA_BASE_V9_1 } from "./constantes.mjs";

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return { code: r.status, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

/** Lecture seule de l'état git. */
export function collecterEtatGit(root) {
  const head = git(root, ["rev-parse", "HEAD"]).out;
  const branche = git(root, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
  const statut = git(root, ["status", "--porcelain", "--untracked-files=all"]).out;
  const basePresente = git(root, ["cat-file", "-e", `${SHA_BASE_V9_1}^{commit}`]).code === 0;
  const ancetre = basePresente && git(root, ["merge-base", "--is-ancestor", SHA_BASE_V9_1, "HEAD"]).code === 0;
  return { head, branche, sale: statut ? statut.split("\n").length : 0, basePresente, ancetre };
}

/** Vrai si la branche peut porter le pack. */
export function brancheAutorisee(branche) {
  const b = String(branche ?? "");
  if (BRANCHES_INTERDITES.some((m) => m.test(b))) return false;
  return BRANCHES_PACK_AUTORISEES.includes(b) || MOTIF_BRANCHE_TRAIN.test(b);
}

/** Évaluation pure. */
export function evaluerGit(e) {
  const constats = [];
  const c = (ok, code, message) => constats.push({ ok, code, message });
  const head = String(e.head ?? "");
  c(/^[0-9a-f]{40}$/.test(head), "GIT-HEAD", /^[0-9a-f]{40}$/.test(head) ? `SHA déployé = HEAD ${head}` : "HEAD illisible");
  c(Boolean(e.basePresente), "GIT-BASE-CONNUE", e.basePresente ? `base publiée V9.1 ${SHA_BASE_V9_1.slice(0, 12)} présente` : `base publiée V9.1 ${SHA_BASE_V9_1.slice(0, 12)} introuvable (git fetch)`);
  c(Boolean(e.ancetre), "GIT-BASE-ANCETRE", e.ancetre ? `HEAD ${head.slice(0, 12)} contient la base V9.1 ${SHA_BASE_V9_1.slice(0, 12)}` : `HEAD ${head.slice(0, 12)} ne contient PAS la base V9.1 : mauvais SHA`);
  const interdite = BRANCHES_INTERDITES.some((m) => m.test(e.branche ?? ""));
  const ok = brancheAutorisee(e.branche);
  c(ok, "GIT-BRANCHE", interdite ? `branche ${e.branche} INTERDITE` : ok ? `branche ${e.branche}` : `branche ${e.branche || "(détachée)"} non autorisée (attendu : ${BRANCHES_PACK_AUTORISEES.join(" ou ")} ou integration/elsatia-canonical-train-v<N>[.<M>])`);
  c(e.sale === 0, "GIT-PROPRE", e.sale === 0 ? "worktree propre" : `worktree sale : ${e.sale} entrée(s) (git status --porcelain)`);
  return { ok: constats.every((x) => x.ok), head, constats };
}
