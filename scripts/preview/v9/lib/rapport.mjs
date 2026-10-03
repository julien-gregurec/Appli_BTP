// ELSATIA — Pack opérateur V9 : rapport de cutover et porte « code après base » (Phase G).
//
// Le script de cutover consigne chaque étape dans un rapport JSON (HORS dépôt). La porte
// CODE_DEPLOY_ALLOWED ne passe à `true` qu'au vu de ce rapport : ledger V9 complet (389),
// DB verify GO et contrôles V9 GO, sur la Preview, pour le SHA canonique, rapport récent.
//
// POURQUOI la base AVANT le code : le code V9 appelle des objets créés par les 17 migrations.
//  - Limiteur de connexion (1113) : `verifierBudgetConnexion` appelle `consulter_rate_limit` ;
//    toute erreur REFUSE la connexion (fail-closed) → code V9 sur base 372 = plus personne ne
//    se connecte.
//  - Onboarding légal (901) : `creer_entreprise_avec_acceptation`, `documents_legaux_a_accepter`.
//  - Agrégats GP (1101-1111) : tableaux de bord, planning, pointage, fiches → erreurs PostgREST.
//  - Registre IBAN (1112) : `bank-keys status` et la garde d'écriture.
// Le code V8 reste compatible avec la base 389 (fonctions remplacées à signature constante,
// objets nouveaux additifs, création d'entreprise V8 par RPC SECURITY DEFINER) : l'ordre
// base → code est donc le seul sans fenêtre cassée.

import { readFileSync, writeFileSync } from "node:fs";
import { REF_PREVIEW_AUTORISEE, SHA_CANONIQUE, VERDICT } from "./constantes.mjs";

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
 * @param {{ maintenant?: Date, ageMaxHeures?: number, ledgerPost?: {verdict: string}|null }} o
 */
export function evaluerPorte(r, { maintenant = new Date(), ageMaxHeures = 24, ledgerPost = null } = {}) {
  const motifs = [];
  if (!r || r.format !== FORMAT_RAPPORT) return { autorise: false, motifs: ["rapport de cutover absent ou de format inconnu"] };
  const e = r.etapes ?? {};
  if (r.ref !== REF_PREVIEW_AUTORISEE) motifs.push("rapport d'une autre cible que la Preview");
  if (r.sha_canonique !== SHA_CANONIQUE) motifs.push("rapport d'un autre train que le SHA canonique V9");
  if (!["apply", "verify"].includes(r.mode)) motifs.push(`mode ${r.mode ?? "?"} : seule une exécution --apply-preview ou --verify-only prouve la base`);
  if (e.ledger_apres?.verdict !== VERDICT.LEDGER_V9_COMPLET) motifs.push(`ledger après cutover : ${e.ledger_apres?.verdict ?? "non vérifié"} (attendu ${VERDICT.LEDGER_V9_COMPLET})`);
  if (e.db_verify?.code !== 0) motifs.push(`DB verify : ${e.db_verify?.code === undefined ? "non exécuté" : `code ${e.db_verify.code}`}`);
  if (e.controles_v9?.ok !== true) motifs.push("contrôles V9 post-cutover non verts");
  const date = new Date(r.maj_le ?? "");
  const ageH = (maintenant - date) / 3.6e6;
  if (Number.isNaN(date.getTime()) || ageH < -0.1 || ageH > ageMaxHeures) motifs.push(`rapport trop ancien ou daté dans le futur (max ${ageMaxHeures} h) : relancer v9-cutover.sh --verify-only`);
  if (ledgerPost && ledgerPost.verdict !== VERDICT.LEDGER_V9_COMPLET) motifs.push(`ledger fourni : ${ledgerPost.verdict}`);
  return { autorise: motifs.length === 0, motifs };
}
