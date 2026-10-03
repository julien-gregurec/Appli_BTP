// ELSATIA — Pack opérateur V9 : rapport de cutover et porte « code après base » (Phase G).
//
// Le script de cutover consigne chaque étape dans un rapport JSON (HORS dépôt). La porte
// CODE_DEPLOY_ALLOWED ne passe à `true` qu'au vu de ce rapport : ledger = train complet
// (PENDING_MIGRATIONS=0), DB verify GO et contrôles V9 GO, sur la Preview, pour le SHA de HEAD
// (`sha_deploye`), rapport récent.
//
// POURQUOI la base AVANT le code : le code du train appelle des objets créés par les migrations
// en attente (agrégats GP, onboarding légal, registre IBAN, limiteur de connexion — ce dernier
// refuse la connexion sur erreur : fail-closed). Le code déjà servi reste compatible avec la base
// à jour (fonctions remplacées à signature constante, objets nouveaux additifs) : l'ordre
// base → code est donc le seul sans fenêtre cassée.

import { readFileSync, writeFileSync } from "node:fs";
import { REF_PREVIEW_AUTORISEE, VERDICT } from "./constantes.mjs";

export const FORMAT_RAPPORT = "elsatia-v9-cutover-report-v1";

export function lireRapport(chemin) {
  try { return JSON.parse(readFileSync(chemin, "utf8")); } catch { return null; }
}

/** Fixe `cle` (chemin pointé a.b.c) à `valeur` dans le rapport, en créant le fichier si besoin. */
export function majRapport(chemin, cle, valeur, maintenant = new Date()) {
  const r = lireRapport(chemin) ?? { format: FORMAT_RAPPORT, cree_le: maintenant.toISOString(), etapes: {} };
  const parties = cle.split(".");
  let o = r;
  for (const p of parties.slice(0, -1)) o = o[p] ??= {};
  o[parties.at(-1)] = valeur;
  r.maj_le = maintenant.toISOString();
  writeFileSync(chemin, `${JSON.stringify(r, null, 2)}\n`);
  return r;
}

/**
 * @param {object|null} r  rapport
 * @param {{ maintenant?: Date, ageMaxHeures?: number, ledgerPost?: {verdict: string}|null, shaHead?: string|null }} o
 *   shaHead : SHA de HEAD (code à déployer) ; le rapport doit porter exactement ce SHA.
 */
export function evaluerPorte(r, { maintenant = new Date(), ageMaxHeures = 24, ledgerPost = null, shaHead = null } = {}) {
  const motifs = [];
  if (!r || r.format !== FORMAT_RAPPORT) return { autorise: false, motifs: ["rapport de cutover absent ou de format inconnu"] };
  const e = r.etapes ?? {};
  if (r.ref !== REF_PREVIEW_AUTORISEE) motifs.push("rapport d'une autre cible que la Preview");
  if (!/^[0-9a-f]{40}$/.test(String(shaHead ?? ""))) motifs.push("SHA de HEAD inconnu : porte fermée");
  else if (r.sha_deploye !== shaHead) motifs.push(`rapport du SHA ${String(r.sha_deploye ?? "—").slice(0, 12)} ≠ HEAD ${shaHead.slice(0, 12)} (code à déployer)`);
  if (!["apply", "verify"].includes(r.mode)) motifs.push(`mode ${r.mode ?? "?"} : seule une exécution --apply-preview ou --verify-only prouve la base`);
  if (e.ledger_apres?.verdict !== VERDICT.LEDGER_V9_COMPLET) motifs.push(`ledger après cutover : ${e.ledger_apres?.verdict ?? "non vérifié"} (attendu ${VERDICT.LEDGER_V9_COMPLET} : ledger = train complet)`);
  if (e.db_verify?.code !== 0) motifs.push(`DB verify : ${e.db_verify?.code === undefined ? "non exécuté" : `code ${e.db_verify.code}`}`);
  if (e.controles_v9?.ok !== true) motifs.push("contrôles V9 post-cutover non verts");
  const date = new Date(r.maj_le ?? "");
  const ageH = (maintenant - date) / 3.6e6;
  if (Number.isNaN(date.getTime()) || ageH < -0.1 || ageH > ageMaxHeures) motifs.push(`rapport trop ancien ou daté dans le futur (max ${ageMaxHeures} h) : relancer v9-cutover.sh --verify-only`);
  if (ledgerPost && ledgerPost.verdict !== VERDICT.LEDGER_V9_COMPLET) motifs.push(`ledger fourni : ${ledgerPost.verdict}`);
  return { autorise: motifs.length === 0, motifs };
}
