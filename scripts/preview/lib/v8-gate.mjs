// ELSATIA — Pack Preview V8 : garde d'écriture distante (train canonique V8).
//
// Tout est pur (aucun réseau, aucune écriture) et testé par scripts/preview/v8-gate.test.mjs.
// Ce module décide si une écriture distante (db push, procédure pilote) PEUT être autorisée ;
// il n'écrit jamais lui-même. Les CLI qui l'utilisent (v8-upgrade-gate.mjs, backup-preview.mjs,
// pilot-subscription.mjs) lisent le ledger réel au moment de l'exécution : aucune hypothèse
// n'est faite sur l'état hébergé à partir de la documentation.
//
// GARANTIE : aucune fonction ne renvoie ni n'écrit une valeur d'environnement (URL, mot de passe).

import { createHash } from "node:crypto";
import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, Refus } from "./preview-guard.mjs";

/** Train canonique V8 : référence technique officielle (rapport V8, verdict LOCALLY QUALIFIED). */
export const TRAIN_V8 = Object.freeze({
  branche: "integration/elsatia-canonical-train-v8",
  commit: "53b4bc76b1096acbd8a8a8dd7340b1a577f99307",
  nb: 371,
  derniere: "20260928000812",
  controles: 37,
  rpcServiceSeulement: 39,
  seeds: 16,
});

/** Nom du projet Supabase Preview (tableau de bord). Toute autre valeur est refusée. */
export const NOM_PROJET_PREVIEW = "elsatia-preview";

/**
 * Trains canoniques publiés, identifiés par leur nombre de migrations. Chacun est un PRÉFIXE
 * strict de la liste V8 triée (vérifié sur les branches integration/elsatia-canonical-train-v1..v8) :
 * la version de fin se lit donc dans supabase/migrations, jamais recopiée à la main.
 */
export const TRAINS_CONNUS = Object.freeze([
  { train: "V1", nb: 328 },
  { train: "V2", nb: 335 },
  { train: "V3", nb: 340 },
  { train: "V4", nb: 352 },
  { train: "V5", nb: 355 },
  { train: "V6", nb: 358 },
  { train: "V7", nb: 359 },
  { train: "V8", nb: 371 },
]);

/** Le dépôt courant porte-t-il au moins le train V8 ? Lève Refus sinon (train inférieur à V8). */
export function exigerDepotV8(versionsLocales) {
  const nb = versionsLocales.length;
  const derniere = versionsLocales.at(-1) ?? "";
  if (nb < TRAIN_V8.nb || derniere < TRAIN_V8.derniere) {
    throw new Refus(`dépôt au train inférieur à V8 (${nb} migrations, dernière ${derniere || "—"}) : checkout ${TRAIN_V8.branche} requis`);
  }
  if (!versionsLocales.includes(TRAIN_V8.derniere)) {
    throw new Refus(`migration V8 ${TRAIN_V8.derniere} absente du dépôt : lignée différente du train V8`);
  }
  return { nb, derniere };
}

/**
 * Identité du projet cible. Deux sources indépendantes doivent concorder : la référence lue dans
 * l'URL et, si fournie, la sortie JSON de `supabase projects list -o json` (nom du projet).
 * Refuse : référence Production, nom contenant « production », nom ≠ elsatia-preview, mauvaise ref.
 */
export function exigerIdentiteProjet({ ref, projets = null, exigerNom = false }) {
  if (!ref) throw new Refus("référence Supabase introuvable");
  if (ref === REF_PRODUCTION_CONNUE) throw new Refus("référence Supabase PRODUCTION : refus");
  if (ref !== REF_PREVIEW_AUTORISEE) throw new Refus(`mauvais project ref (${ref}) : seule la Preview ${REF_PREVIEW_AUTORISEE} est autorisée`);
  if (projets === null) {
    if (exigerNom) throw new Refus("nom du projet non vérifié : fournir --projects-json (sortie de `supabase projects list -o json`)");
    return { ref, nom: null };
  }
  if (!Array.isArray(projets)) throw new Refus("--projects-json : tableau JSON attendu");
  const cible = projets.find((p) => [p?.ref, p?.id].map((x) => String(x ?? "")).includes(ref));
  if (!cible) throw new Refus(`projet ${ref} absent de --projects-json : identité non confirmée`);
  const nom = String(cible.name ?? "");
  if (/production/i.test(nom)) throw new Refus(`projet nommé « ${nom} » : Production, refus`);
  if (nom !== NOM_PROJET_PREVIEW) throw new Refus(`projet nommé « ${nom} » : ${NOM_PROJET_PREVIEW} attendu`);
  return { ref, nom };
}

/** Train connu correspondant à un ledger aligné sur un préfixe de la liste locale, sinon null. */
export function identifierTrain(versionsLocales, nbAppliquees) {
  const t = TRAINS_CONNUS.find((x) => x.nb === nbAppliquees);
  if (!t || nbAppliquees > versionsLocales.length) return null;
  return { train: t.train, nb: t.nb, derniere: versionsLocales[t.nb - 1] };
}

/**
 * Analyse du ledger hébergé (supabase_migrations.schema_migrations) contre le dépôt V8.
 * Statuts :
 *  - VIERGE          : 0 migration appliquée ;
 *  - EN_RETARD       : préfixe exact du dépôt, migrations restantes toutes postérieures (upgrade monotone) ;
 *  - A_JOUR          : ledger = dépôt (371, dernière V8) ;
 *  - MAUVAIS_LEDGER  : version(s) distante(s) inconnue(s) du dépôt (autre lignée) → refus ;
 *  - LEDGER_A_TROUS  : une migration du dépôt manque AVANT la dernière appliquée → refus
 *                      (`db push` exigerait --include-all : décision requise, jamais automatique).
 */
export function analyserLedger(versionsLocales, versionsDistantes) {
  const locales = [...versionsLocales].sort();
  const distantes = [...new Set(versionsDistantes.map((v) => String(v).trim()).filter(Boolean))].sort();
  const setLocales = new Set(locales);
  const setDistantes = new Set(distantes);
  const inconnues = distantes.filter((v) => !setLocales.has(v));
  const derniereDistante = distantes.at(-1) ?? null;
  const manquantes = locales.filter((v) => !setDistantes.has(v));
  const trous = derniereDistante ? manquantes.filter((v) => v < derniereDistante) : [];
  const enAttente = manquantes.filter((v) => !derniereDistante || v > derniereDistante);
  let statut;
  if (inconnues.length) statut = "MAUVAIS_LEDGER";
  else if (trous.length) statut = "LEDGER_A_TROUS";
  else if (!distantes.length) statut = "VIERGE";
  else if (!enAttente.length) statut = "A_JOUR";
  else statut = "EN_RETARD";
  const train = statut === "MAUVAIS_LEDGER" || statut === "LEDGER_A_TROUS" ? null : identifierTrain(locales, distantes.length);
  return {
    statut,
    nbDistantes: distantes.length,
    nbLocales: locales.length,
    derniereDistante,
    derniereLocale: locales.at(-1) ?? null,
    train,
    inconnues,
    trous,
    enAttente,
    empreinte: empreinteLedger(distantes),
  };
}

/** Segments du chemin Hosted → V8 : combien de migrations de chaque train restent à appliquer. */
export function cheminVersV8(versionsLocales, analyse) {
  const locales = [...versionsLocales].sort();
  const segments = [];
  let debut = analyse.nbDistantes;
  for (const t of TRAINS_CONNUS) {
    if (t.nb <= debut) continue;
    const fin = Math.min(t.nb, locales.length);
    if (fin > debut) segments.push({ train: t.train, nb: fin - debut, premiere: locales[debut], derniere: locales[fin - 1] });
    debut = fin;
  }
  return segments;
}

/** Empreinte stable d'un ledger (sha256 des versions triées, une par ligne). */
export function empreinteLedger(versions) {
  return createHash("sha256").update([...versions].sort().join("\n")).digest("hex");
}

/** Âge maximal d'une sauvegarde acceptée avant une écriture distante. */
export const AGE_MAX_SAUVEGARDE_MS = 6 * 3600 * 1000;

/** Fichiers exigés par le manifeste de sauvegarde (backup-preview.mjs). */
export const FICHIERS_SAUVEGARDE = Object.freeze({
  db_dump: "base complète (pg_dump, format custom)",
  ledger: "ledger des migrations (supabase_migrations.schema_migrations)",
  auth_snapshot: "snapshot Auth (pg_dump data-only du schéma auth)",
  storage_inventory: "inventaire Storage (buckets et objets : nom, taille, date)",
});

/**
 * Évalue un manifeste de sauvegarde (JSON écrit par backup-preview.mjs) contre la cible et le
 * ledger lus MAINTENANT. `empreintesFichiers` = { cle: sha256 recalculé sur disque } (fourni par
 * la CLI) ; absent → les empreintes ne sont pas revérifiées (tests purs uniquement).
 * Retourne la liste des problèmes (vide = sauvegarde acceptable).
 */
export function evaluerSauvegarde(manifeste, { ref, empreinte, maintenant = Date.now(), empreintesFichiers = null, ageMaxMs = AGE_MAX_SAUVEGARDE_MS, simulation = false }) {
  const problemes = [];
  if (!manifeste || typeof manifeste !== "object") return ["manifeste de sauvegarde absent ou illisible"];
  if (manifeste.simulation === true && !simulation) problemes.push("sauvegarde de répétition locale (simulation) : refusée pour une cible hébergée");
  if (manifeste.ref !== ref) problemes.push("sauvegarde d'un autre projet (ref différente)");
  const date = Date.parse(manifeste.cree_le ?? "");
  if (!Number.isFinite(date)) problemes.push("date de sauvegarde illisible");
  else if (maintenant - date > ageMaxMs) problemes.push(`sauvegarde trop ancienne (> ${Math.round(ageMaxMs / 3600000)} h) : la refaire`);
  else if (date - maintenant > 5 * 60 * 1000) problemes.push("sauvegarde datée dans le futur");
  if (manifeste.ledger?.empreinte !== empreinte) problemes.push("le ledger a changé depuis la sauvegarde : la refaire");
  for (const [cle, libelle] of Object.entries(FICHIERS_SAUVEGARDE)) {
    const f = manifeste.fichiers?.[cle];
    if (!f) { problemes.push(`${libelle} : absent du manifeste`); continue; }
    if (!(Number(f.octets) > 0)) problemes.push(`${libelle} : fichier vide`);
    if (!/^[0-9a-f]{64}$/.test(String(f.sha256 ?? ""))) problemes.push(`${libelle} : empreinte sha256 absente`);
    else if (empreintesFichiers && empreintesFichiers[cle] !== f.sha256) problemes.push(`${libelle} : fichier modifié ou manquant depuis la sauvegarde`);
  }
  return problemes;
}

/**
 * Décision d'autorisation d'un `db push` vers V8 (le push reste lancé par l'opérateur).
 * Entrées déjà lues par la CLI ; retourne { decision: "GO"|"NO_GO"|"A_JOUR", motifs[] }.
 */
export function deciderPush({ analyse, problemesSauvegarde, refLieeCli, ref, accepterHorsTrain = false }) {
  const motifs = [];
  if ((analyse.statut === "VIERGE" || (analyse.statut === "EN_RETARD" && !analyse.train)) && !accepterHorsTrain) {
    motifs.push(`ledger ${analyse.statut === "VIERGE" ? "vierge" : "hors train publié"} (${analyse.nbDistantes} appliquées) : DECISION_REQUIRED, relancer avec --accept-off-train après revue de l'historique du projet`);
  }
  if (analyse.statut === "MAUVAIS_LEDGER") motifs.push(`mauvais ledger : ${analyse.inconnues.length} version(s) inconnue(s) du dépôt V8 (${analyse.inconnues.slice(0, 5).join(", ")})`);
  if (analyse.statut === "LEDGER_A_TROUS") motifs.push(`ledger à trous : ${analyse.trous.length} migration(s) antérieure(s) à la dernière appliquée manquent (${analyse.trous.slice(0, 5).join(", ")}) — DECISION_REQUIRED, jamais --include-all automatique`);
  if (refLieeCli !== ref) motifs.push("projet lié par la CLI (supabase/.temp/project-ref) différent de la Preview : `npx supabase link --project-ref` requis");
  if (analyse.statut === "A_JOUR") return { decision: motifs.length ? "NO_GO" : "A_JOUR", motifs };
  motifs.push(...problemesSauvegarde);
  return { decision: motifs.length ? "NO_GO" : "GO", motifs };
}

/** Ledger exigé APRÈS le push (et avant toute procédure pilote) : exactement le train V8. */
export function exigerLedgerV8(analyse) {
  if (analyse.statut !== "A_JOUR" || analyse.nbDistantes !== TRAIN_V8.nb || analyse.derniereDistante !== TRAIN_V8.derniere) {
    throw new Refus(`ledger hébergé non aligné sur V8 (${analyse.statut}, ${analyse.nbDistantes} appliquées, dernière ${analyse.derniereDistante ?? "—"}) : train inférieur à V8 ou mauvais ledger`);
  }
  return true;
}
