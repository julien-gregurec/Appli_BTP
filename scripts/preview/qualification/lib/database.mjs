// ELSATIA — Qualification Preview distante : ledger des migrations et sauvegarde (§5-§7).
// Pur (aucune I/O) : l'orchestrateur exécute les commandes et passe leurs sorties ici.

/**
 * Classe le ledger distant (supabase_migrations.schema_migrations) face au train local.
 *
 *   ALIGNED             : mêmes versions des deux côtés → db push sans objet ;
 *   EMPTY               : aucune migration distante (projet neuf) → push compatible ;
 *   PENDING_COMPATIBLE  : distant ⊂ local ET toutes les versions en attente sont postérieures à la
 *                         dernière distante → `db push` les applique dans l'ordre ;
 *   PENDING_OUT_OF_ORDER: une version en attente est antérieure à la dernière distante → `db push`
 *                         exigerait --include-all : NO-GO, décision humaine ;
 *   FOREIGN             : le distant contient des versions absentes du dépôt (autre lignée) → NO-GO.
 */
export const LEDGER = Object.freeze({
  ALIGNED: "ALIGNED", EMPTY: "EMPTY", PENDING_COMPATIBLE: "PENDING_COMPATIBLE",
  PENDING_OUT_OF_ORDER: "PENDING_OUT_OF_ORDER", FOREIGN: "FOREIGN",
});

export function classerLedger(locales, distantes) {
  const l = [...new Set(locales)].sort();
  const d = [...new Set(distantes)].sort();
  const setL = new Set(l);
  const setD = new Set(d);
  const etrangeres = d.filter((v) => !setL.has(v));
  const enAttente = l.filter((v) => !setD.has(v));
  const derniereDistante = d.at(-1) ?? null;
  const horsOrdre = derniereDistante ? enAttente.filter((v) => v < derniereDistante) : [];
  let classe;
  if (etrangeres.length) classe = LEDGER.FOREIGN;
  else if (!d.length) classe = LEDGER.EMPTY;
  else if (!enAttente.length) classe = LEDGER.ALIGNED;
  else if (horsOrdre.length) classe = LEDGER.PENDING_OUT_OF_ORDER;
  else classe = LEDGER.PENDING_COMPATIBLE;
  return {
    classe,
    compatible: [LEDGER.ALIGNED, LEDGER.EMPTY, LEDGER.PENDING_COMPATIBLE].includes(classe),
    nbLocales: l.length,
    nbDistantes: d.length,
    derniereLocale: l.at(-1) ?? null,
    derniereDistante,
    enAttente,
    etrangeres,
    horsOrdre,
  };
}

/** Versions listées par `supabase db push --dry-run` (lignes « • 20260928000101_nom.sql »). */
export function versionsDryRun(sortie) {
  return [...String(sortie).matchAll(/\b(\d{14})_[A-Za-z0-9_]+\.sql\b/g)].map((m) => m[1]);
}

/**
 * Le dry-run annonce-t-il EXACTEMENT les migrations en attente attendues, dans l'ordre ?
 * (une migration de trop ou hors ordre = NO-GO : la CLI ne ferait pas ce que le ledger prévoit).
 */
export function dryRunConforme(sortie, enAttente) {
  const annoncees = versionsDryRun(sortie);
  if (!enAttente.length) return { ok: /up to date|à jour|No migrations|nothing to push/i.test(sortie) || annoncees.length === 0, annoncees };
  return { ok: JSON.stringify(annoncees) === JSON.stringify(enAttente), annoncees };
}

// ── Sauvegarde ───────────────────────────────────────────────────────────────

/** Schémas de l'application sauvegardés (les schémas gérés par Supabase hors auth/storage sont exclus). */
export const SCHEMAS_SAUVEGARDE = ["public", "platform", "stripe_attestation", "auth", "storage", "supabase_migrations"];

/** Entrées de la table des matières indispensables à une restauration utile. */
export const TOC_REQUIS = [
  /TABLE DATA supabase_migrations schema_migrations\b/,
  /TABLE DATA public entreprises\b/,
  /TABLE DATA auth users\b/,
  /TABLE DATA storage objects\b/,
];

/** Arguments pg_dump (l'URL n'y figure PAS : elle passe par l'environnement PG* du processus). */
export function argumentsPgDump(fichier) {
  return ["--format=custom", "--compress=6", "--no-owner", "--no-privileges", "--quote-all-identifiers",
    ...SCHEMAS_SAUVEGARDE.flatMap((s) => ["--schema", s]), "--file", fichier];
}

/** Valide la sortie de `pg_restore --list` : entrées requises et nombre minimal d'entrées. */
export function validerToc(liste, { minimumEntrees = 500 } = {}) {
  const lignes = String(liste).split("\n").filter((l) => /^\d+;/.test(l));
  const manquantes = TOC_REQUIS.filter((re) => !lignes.some((l) => re.test(l))).map((re) => re.source.replace(/\\b/g, ""));
  const donnees = lignes.filter((l) => / TABLE DATA /.test(l)).length;
  const erreurs = [];
  if (lignes.length < minimumEntrees) erreurs.push(`${lignes.length} entrée(s) dans l'archive (minimum attendu ${minimumEntrees})`);
  if (manquantes.length) erreurs.push(`entrée(s) absente(s) : ${manquantes.join(", ")}`);
  return { ok: !erreurs.length, entrees: lignes.length, tablesDonnees: donnees, erreurs };
}

/** Version majeure de PostgreSQL depuis `pg_dump --version` ou server_version_num. */
export function majeurePg(texte) {
  const s = String(texte).trim();
  if (/^\d{5,6}$/.test(s)) return Math.floor(Number(s) / 10000);
  const m = /(\d+)(?:\.\d+)?/.exec(s.replace(/^[^\d]*/, ""));
  return m ? Number(m[1]) : null;
}

/**
 * Commande de restauration (affichée, JAMAIS exécutée automatiquement). L'URL reste une variable
 * shell : aucune valeur dans le rapport.
 */
export function commandeRestauration(cheminArchive) {
  return [
    "# RESTAURATION de la Preview (manuelle, après décision humaine) — vérifier d'abord la cible :",
    "node scripts/preview/qualification/run.mjs --only preflight.supabase-identity --target \"$ELSATIA_TARGET\" --env-dir \"$ELSATIA_ENV_DIR\"",
    `shasum -a 256 -c "${cheminArchive}.sha256"`,
    `pg_restore --list "${cheminArchive}" | head`,
    `pg_restore --dbname "$ELSATIA_PREVIEW_DB_URL" --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error "${cheminArchive}"`,
  ].join("\n");
}

/**
 * Variables libpq équivalentes à une URL PostgreSQL : pg_dump, pg_restore et psql lisent ainsi la
 * cible sans que l'URL (et son mot de passe) n'apparaisse dans la liste des processus.
 */
export function envPgDepuisUrl(url) {
  const u = new URL(url);
  if (!/^postgres(?:ql)?:$/.test(u.protocol)) throw new Error("URL PostgreSQL attendue");
  const sslmode = u.searchParams.get("sslmode") ?? "require";
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres",
    PGSSLMODE: sslmode,
    PGCONNECT_TIMEOUT: "15",
    PGAPPNAME: "elsatia-preview-qualification",
  };
}
