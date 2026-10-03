#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : recette post-cutover (Phase L), automatique + guidée.
 *
 * Automatique (ce qui est fourni est vérifié, le reste est déclaré NON VÉRIFIÉ) :
 *   --ledger <export>          ledger = train complet (CURRENT_LEDGER = TARGET_LEDGER, PENDING_MIGRATIONS=0),
 *                              813 originale (preuve exigée)
 *   --v9-checks <sortie>       sortie de ELSATIA_V9_POST_CUTOVER_CHECKS.sql (813, Security 1001,
 *                              Stripe 1002/1003, IBAN 1112, limiteur 1113, RLS, droits V9 / V9.2)
 *   --report <rapport>         rapport de cutover : DB verify et porte code (SHA de HEAD)
 *   --gp-url https://…         HTTP anonyme : /login, /api/health, /api/elsatia-identity/jwks,
 *                              pages GP protégées fermées (307 → /login) ; GET seulement
 * Guidé : parcours GP avec le pilote pilote.karim.haddad@example.test. AUCUN mot de passe n'est
 * demandé, lu ni stocké : l'opérateur se connecte lui-même dans son navigateur.
 *
 * Usage :
 *   node scripts/preview/v9/post-cutover-check.mjs --ledger L --v9-checks C --report R --gp-url https://<alias>.vercel.app
 *        [--allow-custom-domain] [--offline]
 * Sortie : 0 GO automatique (la recette guidée reste à cocher) · 1 NO-GO · 2 refus.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyserVerify, compterControles } from "../db-verify.mjs";
import { Refus, estPointEntree, exigerOriginePreview, lireOptions } from "../lib/preview-guard.mjs";
import { HOTES_PRODUCTION, PILOTE, REF_PRODUCTION_CONNUE, VERDICT } from "./lib/constantes.mjs";
import { collecterEtatGit } from "./lib/git.mjs";
import { analyserLedger, lignesTrain, lireLedger } from "./lib/ledger.mjs";
import { evaluerPorte, lireRapport } from "./lib/rapport.mjs";
import { ROOT, trainLocal } from "./lib/train.mjs";

export const V9_CHECKS_SQL = resolve(ROOT, "docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql");
/** Nombre de contrôles V9 : compté dans le SQL (jamais codé). */
export const NB_CONTROLES_V9 = compterControles(readFileSync(V9_CHECKS_SQL, "utf8"));

/** Contrôles V9 (sortie psql -At -F '|'). */
export function evaluerControlesV9(sortie, attendus = NB_CONTROLES_V9) {
  const lignes = analyserVerify(sortie);
  return { ok: lignes.length === attendus && lignes.every((l) => l.ok || !l.bloquant), lignes, attendus };
}

export const ATTENTES_HTTP = Object.freeze([
  { path: "/login", status: [200] },
  { path: "/api/health", status: [200], json: true, note: "503 = OUTAGE (base ou Auth injoignable)" },
  { path: "/api/elsatia-identity/jwks", status: [200], json: true, avertirSur: [503], note: "503 = identité centrale non configurée en Preview (à confirmer, non bloquant)" },
  ...["/dashboard", "/planning", "/pointage", "/employes", "/devis", "/factures", "/plateforme", "/parametres/acces"].map((path) => ({ path, status: [307], location: /\/login/, protege: true })),
]);

export function evaluerReponse(a, { status, location, contentType }) {
  if (a.status.includes(status)) {
    if (a.location && !a.location.test(location ?? "")) return { etat: "ko", message: `${status} vers ${location ?? "—"} (attendu /login)` };
    if (a.json && !/json/.test(contentType ?? "")) return { etat: "ko", message: `${status} non JSON` };
    return { etat: "ok", message: String(status) };
  }
  if (a.avertirSur?.includes(status)) return { etat: "warn", message: `${status} — ${a.note}` };
  if (a.protege && status === 200) return { etat: "ko", message: "200 anonyme sur une page protégée : FUITE" };
  return { etat: "ko", message: `${status} (attendu ${a.status.join("/")})${a.note ? ` — ${a.note}` : ""}` };
}

export const PARCOURS_GP = Object.freeze([
  ["Connexion", `se connecter avec ${PILOTE} (mot de passe saisi par l'opérateur, jamais consigné) ; aucune erreur « indisponible » (limiteur 1113)`],
  ["Dashboard", "/dashboard : indicateurs chargés, aucune erreur PostgREST (agrégats 1109)"],
  ["Planning", "/planning : semaine affichée, équipes et chantiers (1102)"],
  ["Pointage", "/pointage et /pointage/gestion : totaux du mois cohérents (1105)"],
  ["Employés", "/employes puis une fiche : identité, options de sélecteurs (1111)"],
  ["Devis", "/devis : liste et un devis, totaux (812, inchangé)"],
  ["Facturation", "/factures : modifier une facture BROUILLON de recette, totaux recalculés (1106)"],
  ["Plateforme", "/plateforme (compte plateforme seulement) : annuaire des entreprises affiché SANS erreur « read-only transaction » (813 originale) ; compteurs (1110)"],
  ["Habilitations", "fiche employé → habilitations, et /parametres/acces : droits affichés ; aucun accès inter-entreprise"],
  ["Version servie", "/parametres/version : commit = SHA déployé (HEAD du pack, `sha_deploye` du rapport de cutover ; ou VERCEL_GIT_COMMIT_SHA du déploiement)"],
]);

async function sonder(origine, a, bypass) {
  const headers = { "user-agent": "elsatia-v9-post-cutover/1" };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const r = await fetch(new URL(a.path, origine), { method: "GET", redirect: "manual", headers, signal: AbortSignal.timeout(15000) });
  return { status: r.status, location: r.headers.get("location"), contentType: r.headers.get("content-type") };
}

export async function executer(argv, { log = console.log, env = process.env, maintenant = new Date(), shaHead } = {}) {
  const o = lireOptions(argv);
  let erreurs = 0;
  const ko = (m) => { erreurs += 1; log(`  ✖ ${m}`); };

  log("— DB —");
  if (typeof o.ledger === "string") {
    try {
      const a = analyserLedger(lireLedger(readFileSync(o.ledger, "utf8")), trainLocal(), { attente: "post", exigerPreuve813: true });
      for (const l of lignesTrain(a)) log(`  · ${l}`);
      if (a.verdict === VERDICT.LEDGER_V9_COMPLET) log(`  ✓ ${a.verdict} : ${a.courant.nb}/${a.cible.nb}, dernière ${a.derniereDistante}, 813 originale prouvée`);
      else ko(`${a.verdict} : ${a.divergences.map((d) => d.detail).join(" ; ") || `${a.nbDistantes} migrations`}`);
    } catch { ko("ledger illisible"); }
  } else log("  · ledger : NON VÉRIFIÉ (--ledger absent)");
  if (typeof o["v9-checks"] === "string") {
    try {
      const v = evaluerControlesV9(readFileSync(o["v9-checks"], "utf8"));
      for (const l of v.lignes) (l.ok ? (m) => log(`  ✓ ${m}`) : ko)(`${l.controle}${l.ok ? "" : ` — attendu ${l.attendu}, observé ${l.observe}`}`);
      if (v.lignes.length !== v.attendus) ko(`${v.lignes.length} contrôle(s) V9 lu(s), ${v.attendus} attendus`);
    } catch { ko("sortie des contrôles V9 illisible"); }
  } else log("  · contrôles V9 (813, Security 1001, Stripe 1002/1003, IBAN, limiteur) : NON VÉRIFIÉS (--v9-checks absent)");
  if (typeof o.report === "string") {
    const r = lireRapport(o.report);
    const p = evaluerPorte(r, { maintenant, shaHead: shaHead ?? collecterEtatGit(ROOT).head });
    if (r?.etapes?.db_verify?.code === 0) log("  ✓ DB verify (contrôles du train + préflight sécurité + RLS + RPC service) : GO"); else ko("DB verify non GO dans le rapport");
    log(`  ${p.autorise ? "✓" : "✖"} CODE_DEPLOY_ALLOWED=${p.autorise}`);
    if (!p.autorise) erreurs += 1;
  } else log("  · rapport de cutover : NON VÉRIFIÉ (--report absent)");

  log("— HTTP —");
  if (typeof o["gp-url"] === "string" && !o.offline) {
    let origine;
    try {
      origine = exigerOriginePreview(o["gp-url"], { domainePersonnaliseAutorise: Boolean(o["allow-custom-domain"]) });
      const h = new URL(origine).hostname;
      if (HOTES_PRODUCTION.includes(h) || h.includes(REF_PRODUCTION_CONNUE)) throw new Refus(`hôte de Production ${h}`);
    } catch (e) { if (e instanceof Refus) { log(`REFUS : ${e.message}`); return 2; } throw e; }
    for (const a of ATTENTES_HTTP) {
      try {
        const rep = await sonder(origine, a, env.VERCEL_AUTOMATION_BYPASS_SECRET);
        const e = evaluerReponse(a, rep);
        if (e.etat === "ko") ko(`GET ${a.path} → ${e.message}`);
        else log(`  ${e.etat === "ok" ? "✓" : "!"} GET ${a.path} → ${e.message}`);
      } catch { ko(`GET ${a.path} → injoignable`); }
    }
  } else log("  · HTTP : NON VÉRIFIÉ (--gp-url absent ou --offline)");

  log(`— Recette guidée GP (pilote ${PILOTE}, à cocher par l'opérateur) —`);
  for (const [n, d] of PARCOURS_GP) log(`  [ ] ${n} : ${d}`);

  log(erreurs ? `\nPOST_CUTOVER_NO_GO : ${erreurs} échec(s) automatique(s).` : "\nPOST_CUTOVER_AUTO_GO : contrôles automatiques fournis verts ; recette guidée à compléter.");
  return erreurs ? 1 : 0;
}

if (estPointEntree(import.meta.url)) executer(process.argv.slice(2)).then((c) => { process.exitCode = c; });
