#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview V8 : entreprise pilote PILOTE-BTP-V1 (essai échu, rapport V8 §8).
 *
 *   --diagnose   état commercial du pilote, session forcée en lecture seule (aucune écriture).
 *   --apply A|B  DECISION_REQUIRED_PILOT_SUBSCRIPTION, écriture gardée :
 *                  A = prolonger explicitement l'essai (≤ 30 jours, règle inchangée) ;
 *                  B = abonnement pilote explicite (statut actif, facturation manuelle / offline).
 *                Exige : --until AAAA-MM-JJ, --decision DECISION_REQUIRED_PILOT_SUBSCRIPTION=<A|B>:<auteur-date>,
 *                --projects-json (nom elsatia-preview), --backup-dir (sauvegarde < 6 h, même ledger),
 *                ledger hébergé exactement V8, projet lié par la CLI = Preview.
 *
 * Aucune option n'est choisie par défaut : sans décision explicite du propriétaire, --apply refuse.
 * Usage : ELSATIA_PREVIEW_DB_URL='postgresql://…' node scripts/preview/pilot-subscription.mjs --diagnose
 * Sortie : 0 OK · 1 NO-GO · 2 refus.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Refus, SORTIE, estPointEntree, ligne, lireOptions, refuserProduction } from "./lib/preview-guard.mjs";
import { analyserLedger, deciderPush, evaluerSauvegarde, exigerDepotV8, exigerLedgerV8 } from "./lib/v8-gate.mjs";
import { versionsLocales } from "./db-verify.mjs";
import { lireLedgerDistant, lireRefLieeCli, lireSauvegarde, psqlLectureSeule, resoudreCible } from "./v8-upgrade-gate.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
export const SQL_DIAGNOSTIC = resolve(ROOT, "docs/runbooks/sql/ELSATIA_PILOT_SUBSCRIPTION_DIAGNOSTIC_V1.sql");
export const SQL_APPLICATION = resolve(ROOT, "docs/runbooks/sql/ELSATIA_PILOT_SUBSCRIPTION_APPLY_V1.sql");

/** Valide les paramètres de --apply (pur). Lève Refus. */
export function validerDemande({ option, jusquAu, decision, aujourdhui = new Date().toISOString().slice(0, 10) }) {
  if (option !== "A" && option !== "B") throw new Refus("--apply A (prolonger l'essai) ou --apply B (abonnement pilote explicite) : aucune option par défaut");
  if (typeof jusquAu !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(jusquAu) || Number.isNaN(Date.parse(jusquAu))) throw new Refus("--until AAAA-MM-JJ requis");
  const jours = Math.round((Date.parse(jusquAu) - Date.parse(aujourdhui)) / 86400000);
  const max = option === "A" ? 30 : 366;
  if (jours < 1 || jours > max) throw new Refus(`--until hors fenêtre pour l'option ${option} (1 à ${max} jours) ; la règle des 30 jours d'essai n'est pas assouplie`);
  if (typeof decision !== "string" || !new RegExp(`^DECISION_REQUIRED_PILOT_SUBSCRIPTION=${option}:[^:]{3,}$`).test(decision)) {
    throw new Refus(`--decision DECISION_REQUIRED_PILOT_SUBSCRIPTION=${option}:<auteur-date> requis (décision propriétaire tracée dans la note de l'entreprise)`);
  }
  return { option, jusquAu, decision, jours };
}

/** Analyse la ligne de diagnostic (pur). */
export function analyserDiagnostic(sortie) {
  const l = sortie.trim().split("\n").filter(Boolean);
  if (l.length !== 1) return null;
  const [reference, statut, essaiDebut, essaiFin, essaiEchu, echeance, etatGp, stripeLie, membresActifs, applications] = l[0].split("|");
  return { reference, statut, essaiDebut, essaiFin, essaiEchu: essaiEchu === "true", echeance, etatGp, stripeLie: stripeLie === "true", membresActifs: Number(membresActifs), applications };
}

export function executer(o, env = process.env, log = console.log) {
  refuserProduction(env);
  exigerDepotV8(versionsLocales());
  const url = env.ELSATIA_PREVIEW_DB_URL;
  if (!url) throw new Refus("ELSATIA_PREVIEW_DB_URL absente (URL PostgreSQL de la Preview)");
  const apply = typeof o.apply === "string" || o.apply === true;
  const demande = apply ? validerDemande({ option: o.apply, jusquAu: o.until, decision: o.decision }) : null;
  const { ref, simulation } = resoudreCible(url, o, { exigerNom: apply });
  if (simulation) log(ligne("warn", "PILOTE-SIMULATION", "banc local", "répétition locale : aucune preuve distante"));
  log(`ELSATIA — entreprise pilote, Preview ${ref} (${apply ? `APPLICATION option ${demande.option}` : "diagnostic lecture seule"}, URL masquée)\n`);

  const d = psqlLectureSeule(url, readFileSync(SQL_DIAGNOSTIC, "utf8").replace(/^--.*$/gm, "").replace(/\n/g, " "));
  if (d.code !== 0) throw new Refus(`diagnostic impossible : ${d.erreur}`);
  const diag = analyserDiagnostic(d.stdout);
  if (!diag) { log(ligne("ko", "PILOTE", "entreprise", "PILOTE-BTP-V1 absente (seed pilote non chargé)")); return SORTIE.NO_GO; }
  log(ligne(diag.essaiEchu ? "warn" : "info", "PILOTE", "état", `statut ${diag.statut}, essai ${diag.essaiDebut} → ${diag.essaiFin}${diag.essaiEchu ? " (ÉCHU)" : ""}, GP ${diag.etatGp}, ${diag.membresActifs} membres actifs, Stripe ${diag.stripeLie ? "lié" : "non lié"}`));
  log(ligne("info", "PILOTE", "applications", diag.applications));
  if (!apply) {
    log(diag.essaiEchu ? "\nDECISION_REQUIRED_PILOT_SUBSCRIPTION : essai échu, Gestion Pro fermé aux membres. Voir le runbook V8 §7." : "\nDiagnostic terminé, aucune écriture.");
    return SORTIE.GO;
  }

  const analyse = analyserLedger(versionsLocales(), lireLedgerDistant(url));
  exigerLedgerV8(analyse);
  if (typeof o["backup-dir"] !== "string") throw new Refus("--backup-dir requis (npm run preview:backup)");
  const { manifeste, empreintes } = lireSauvegarde(resolve(o["backup-dir"]));
  const garde = deciderPush({ analyse: { ...analyse, statut: "EN_RETARD" }, problemesSauvegarde: evaluerSauvegarde(manifeste, { ref, empreinte: analyse.empreinte, empreintesFichiers: empreintes, simulation }), refLieeCli: lireRefLieeCli(), ref });
  for (const m of garde.motifs) log(ligne("ko", "PILOTE", "garde", m));
  if (garde.decision !== "GO") return SORTIE.NO_GO;
  if (diag.stripeLie) { log(ligne("ko", "PILOTE", "Stripe", "entreprise liée à Stripe : procédure refusée")); return SORTIE.NO_GO; }

  const r = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", "-v", `option=${demande.option}`, "-v", `jusqu_au=${demande.jusquAu}`, "-v", `decision=${demande.decision}`, "-f", SQL_APPLICATION], {
    encoding: "utf8", env: { ...process.env, PGCONNECT_TIMEOUT: "15" },
  });
  const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/postgres(?:ql)?:\/\/\S+/g, "<url masquée>");
  const notice = /PILOTE \| option=\S+ \| etat_gp=\S+ \| jusqu_au=\S+/.exec(sortie)?.[0];
  if (r.status !== 0 || !notice) { log(ligne("ko", "PILOTE", "application", (sortie.split("\n").find((l) => /ERROR|ERREUR/.test(l)) ?? sortie.trim().split("\n").at(-1)).trim())); log("\nNO-GO : transaction annulée, rien n'est modifié."); return SORTIE.NO_GO; }
  log(ligne("ok", "PILOTE", "application", notice));
  log("\nAPPLIQUÉ : relancer --diagnose, puis la recette pilote (docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md).");
  return SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  try {
    process.exitCode = executer(lireOptions(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
