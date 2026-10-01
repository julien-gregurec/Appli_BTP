#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview V8 : garde de l'upgrade hébergé « état actuel → train V8 ».
 *
 * Ne fait JAMAIS d'écriture distante. Lit le ledger réel (supabase_migrations.schema_migrations)
 * dans une session forcée en lecture seule, le compare au dépôt, et décide :
 *
 *   --plan            chemin Hosted → V8 (train reconnu, migrations restantes par train).
 *   --authorize-push  GO uniquement si : cible = Preview (ref + nom `elsatia-preview`), jamais
 *                     Production ; dépôt au train V8 ; ledger préfixe exact du dépôt (ni version
 *                     étrangère, ni trou) ; projet lié par la CLI = Preview ; sauvegarde complète
 *                     de moins de 6 h, du même ledger (backup-preview.mjs). Affiche alors la
 *                     commande `db push` à lancer PAR L'OPÉRATEUR.
 *   --accept-off-train  (avec --authorize-push) accepte un ledger vierge ou préfixe hors train publié,
 *                     après revue humaine (DECISION_REQUIRED) ; jamais un ledger étranger ou à trous.
 *   --post-push       exige le ledger exactement V8 (371, dernière 20260928000812).
 *
 * Entrées :
 *   ELSATIA_PREVIEW_DB_URL='postgresql://…'  (jamais affichée)
 *   --projects-json <fichier>  sortie de `npx supabase projects list -o json` (exigé par --authorize-push)
 *   --backup-dir <dossier>     dossier écrit par backup-preview.mjs (exigé par --authorize-push)
 *   --local-harness            répétition sur le banc local (localhost uniquement) : ref Preview simulée
 *   --ledger-file <fichier>    DRY-RUN hors réseau : versions du ledger, une par ligne, au lieu de
 *                              psql ; exige --dry-run-ref <ref> (refusé avec --authorize-push)
 * Sortie : 0 GO / aligné · 1 NO-GO · 2 refus.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { REF_PREVIEW_AUTORISEE, Refus, SORTIE, estPointEntree, ligne, lireOptions, refDepuisUrlDb, refuserProduction } from "./lib/preview-guard.mjs";
import {
  FICHIERS_SAUVEGARDE, TRAIN_V8, analyserLedger, cheminVersV8, deciderPush, evaluerSauvegarde, exigerDepotV8,
  exigerIdentiteProjet, exigerLedgerV8,
} from "./lib/v8-gate.mjs";
import { estBancLocal, versionsLocales } from "./db-verify.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

/** psql en lecture seule forcée ; l'URL n'apparaît jamais dans les messages. */
export function psqlLectureSeule(url, sql) {
  const r = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "15" },
  });
  if (r.error) throw new Refus(`psql introuvable (${r.error.code ?? r.error.message})`);
  const erreur = (r.stderr ?? "").replace(/postgres(?:ql)?:\/\/\S+/g, "<url masquée>").trim().split("\n").at(-1);
  return { code: r.status, stdout: r.stdout ?? "", erreur };
}

export function lireLedgerDistant(url) {
  const ro = psqlLectureSeule(url, "select current_setting('transaction_read_only')");
  if (ro.code !== 0) throw new Refus(`connexion impossible : ${ro.erreur}`);
  if (ro.stdout.trim() !== "on") throw new Refus("session non forcée en lecture seule : arrêt");
  const m = psqlLectureSeule(url, "select version from supabase_migrations.schema_migrations order by 1");
  if (m.code !== 0) throw new Refus(`ledger illisible (supabase_migrations.schema_migrations) : ${m.erreur}`);
  return m.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
}

/**
 * Cible d'exécution. `--local-harness` (répétition sur le banc local, localhost uniquement) simule
 * la ref Preview ; tout ce qu'il produit est marqué « simulation » et refusé hors banc local.
 */
export function resoudreCible(url, o, { exigerNom = false } = {}) {
  const projets = typeof o["projects-json"] === "string" ? JSON.parse(readFileSync(o["projects-json"], "utf8")) : null;
  if (o["local-harness"]) {
    if (!estBancLocal(url)) throw new Refus("--local-harness n'accepte qu'une base locale (localhost / 127.0.0.1)");
    return { ...exigerIdentiteProjet({ ref: REF_PREVIEW_AUTORISEE, projets, exigerNom }), simulation: true };
  }
  return { ...exigerIdentiteProjet({ ref: refDepuisUrlDb(url), projets, exigerNom }), simulation: false };
}

export function lireRefLieeCli(racine = ROOT) {
  const f = join(racine, "supabase", ".temp", "project-ref");
  return existsSync(f) ? readFileSync(f, "utf8").trim() : null;
}

export function sha256Fichier(chemin) {
  return existsSync(chemin) ? createHash("sha256").update(readFileSync(chemin)).digest("hex") : null;
}

export function lireSauvegarde(dossier) {
  const f = join(dossier, "manifest.json");
  let manifeste = null;
  try { manifeste = JSON.parse(readFileSync(f, "utf8")); } catch { return { manifeste: null, empreintes: {} }; }
  const empreintes = {};
  for (const cle of Object.keys(FICHIERS_SAUVEGARDE)) {
    const nom = manifeste?.fichiers?.[cle]?.nom;
    empreintes[cle] = typeof nom === "string" && !nom.includes("/") ? sha256Fichier(join(dossier, nom)) : null;
  }
  return { manifeste, empreintes };
}

export function executer(o, env = process.env, log = console.log) {
  refuserProduction(env);
  const mode = o["authorize-push"] ? "authorize-push" : o["post-push"] ? "post-push" : "plan";
  const locales = versionsLocales();
  const depot = exigerDepotV8(locales);
  log(`ELSATIA — garde upgrade Preview → train V8 (${mode}, lecture seule, URL masquée)\n`);
  log(ligne("ok", "V8-DEPOT", "dépôt", `${depot.nb} migrations, dernière ${depot.derniere} (${TRAIN_V8.branche})`));

  let ref;
  let distantes;
  let simulation = false;
  if (typeof o["ledger-file"] === "string") {
    if (mode === "authorize-push") throw new Refus("--ledger-file est un dry-run : jamais accepté pour autoriser un push");
    ref = typeof o["dry-run-ref"] === "string" ? o["dry-run-ref"].toLowerCase() : null;
    exigerIdentiteProjet({ ref });
    distantes = readFileSync(o["ledger-file"], "utf8").split("\n").map((s) => s.trim()).filter((s) => /^\d{14}$/.test(s));
    log(ligne("warn", "V8-DRY-RUN", "ledger", "lu depuis un fichier (simulation) : aucune preuve distante"));
  } else {
    const url = env.ELSATIA_PREVIEW_DB_URL;
    if (!url) throw new Refus("ELSATIA_PREVIEW_DB_URL absente (URL PostgreSQL de la Preview)");
    const cible = resoudreCible(url, o, { exigerNom: mode === "authorize-push" });
    ref = cible.ref;
    simulation = cible.simulation;
    if (simulation) log(ligne("warn", "V8-SIMULATION", "banc local", "répétition locale : aucune preuve distante"));
    distantes = lireLedgerDistant(url);
  }
  log(ligne("ok", "V8-CIBLE", "projet", `Preview ${ref}`));

  const analyse = analyserLedger(locales, distantes);
  const train = analyse.train ? `train ${analyse.train.train}` : "hors train publié";
  log(ligne("info", "V8-LEDGER", "hébergé", `${analyse.statut} — ${analyse.nbDistantes} appliquée(s), dernière ${analyse.derniereDistante ?? "—"} (${train}) ; empreinte ${analyse.empreinte.slice(0, 12)}`));
  if (analyse.statut === "EN_RETARD" || analyse.statut === "VIERGE") {
    for (const s of cheminVersV8(locales, analyse)) log(ligne("info", "V8-CHEMIN", s.train, `+${s.nb} (${s.premiere} → ${s.derniere})`));
    log(ligne("info", "V8-CHEMIN", "total", `${analyse.enAttente.length} migration(s) à appliquer, toutes postérieures à la dernière appliquée (upgrade monotone)`));
    if (analyse.statut === "VIERGE") log(ligne("warn", "V8-CHEMIN", "état", "projet VIERGE : DECISION_REQUIRED (la Preview existante ne devrait pas l'être ; vérifier la cible avant push)"));
    else if (!analyse.train) log(ligne("warn", "V8-CHEMIN", "état", "préfixe exact du dépôt mais hors train publié : DECISION_REQUIRED (vérifier l'historique de ce projet avant push)"));
  }
  if (analyse.inconnues.length) log(ligne("ko", "V8-LEDGER", "versions étrangères", analyse.inconnues.slice(0, 10).join(", ")));
  if (analyse.trous.length) log(ligne("ko", "V8-LEDGER", "trous", analyse.trous.slice(0, 10).join(", ")));

  if (mode === "post-push") {
    exigerLedgerV8(analyse);
    log(ligne("ok", "V8-LEDGER", "post-push", `${TRAIN_V8.nb}/${TRAIN_V8.nb}, dernière ${TRAIN_V8.derniere}`));
    log("\nALIGNÉ V8 : enchaîner `npm run preview:db-verify -- --before-owner`.");
    return SORTIE.GO;
  }
  if (mode === "plan") {
    const bloquant = analyse.statut === "MAUVAIS_LEDGER" || analyse.statut === "LEDGER_A_TROUS";
    log(bloquant ? "\nNO-GO : ledger incompatible avec le train V8 (voir ci-dessus)." : "\nPLAN : lecture terminée, aucune écriture effectuée.");
    return bloquant ? SORTIE.NO_GO : SORTIE.GO;
  }

  if (typeof o["backup-dir"] !== "string") throw new Refus("--backup-dir requis (npm run preview:backup)");
  const { manifeste, empreintes } = lireSauvegarde(resolve(o["backup-dir"]));
  const problemesSauvegarde = evaluerSauvegarde(manifeste, { ref, empreinte: analyse.empreinte, empreintesFichiers: empreintes, simulation });
  const d = deciderPush({ analyse, problemesSauvegarde, refLieeCli: lireRefLieeCli(), ref, accepterHorsTrain: Boolean(o["accept-off-train"]) });
  for (const m of d.motifs) log(ligne("ko", "V8-PUSH", "garde", m));
  if (d.decision === "A_JOUR") { log("\nDÉJÀ V8 : aucun push nécessaire."); return SORTIE.GO; }
  if (d.decision !== "GO") { log(`\nNO-GO : ${d.motifs.length} motif(s). Aucune écriture.`); return SORTIE.NO_GO; }
  log(ligne("ok", "V8-BACKUP", "sauvegarde", "base, ledger, Auth, inventaire Storage : présents, intacts, même ledger"));
  log(`\nGO : l'opérateur peut lancer (et seulement maintenant) :\n  npx supabase db push --linked --dry-run   # doit lister exactement ${analyse.enAttente.length} migration(s)\n  npx supabase db push --linked\npuis : node scripts/preview/v8-upgrade-gate.mjs --post-push`);
  return SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  try {
    process.exitCode = executer(lireOptions(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
