// §5 BACKUP · §6 LEDGER · §7 DB PUSH · §8 DB VERIFY
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { verifierRefLieeCli } from "../../../garde-scripts-production.mjs";
import { versionsLocales } from "../../db-verify.mjs";
import { Identifiant, NATURE, Reseau, STATUT, Saut, resultat } from "../lib/core.mjs";
import { LEDGER, argumentsPgDump, classerLedger, commandeRestauration, dryRunConforme, majeurePg, validerToc } from "../lib/database.mjs";
import { depuisScript, exigerDbPreview, exigerVars, scriptDistant } from "./helpers.mjs";
import { repertoireHorsDepot } from "./preflight.mjs";

/** Le répertoire de sauvegarde ne doit JAMAIS être dans le dépôt (données de recette hors Git). */
export const repertoireSauvegardeAutorise = repertoireHorsDepot;

function lireLedger(c) {
  const r = c.rt.distant("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", "select version from supabase_migrations.schema_migrations order by 1"], { env: { ...c.pgEnv(), PGOPTIONS: "-c default_transaction_read_only=on" }, timeoutMs: 60_000 });
  if (r.code !== 0) {
    if (/could not translate|timeout expired|Connection refused|Network is unreachable/i.test(r.stderr)) throw new Reseau("PostgreSQL Preview injoignable");
    if (/does not exist/i.test(r.stderr)) return { versions: [], absent: true };
    return { erreur: c.masque.appliquer(r.stderr.trim().split("\n").at(-1) ?? "psql en échec") };
  }
  return { versions: r.stdout.split("\n").map((s) => s.trim()).filter(Boolean) };
}

function envCli(c) {
  const u = new URL(c.q("ELSATIA_PREVIEW_DB_URL"));
  const env = { SUPABASE_DB_PASSWORD: decodeURIComponent(u.password) };
  if (c.q("SUPABASE_ACCESS_TOKEN")) env.SUPABASE_ACCESS_TOKEN = c.q("SUPABASE_ACCESS_TOKEN");
  return env;
}

/** La CLI Supabase doit être liée à la Preview confirmée ; la lie si un jeton est fourni. */
function exigerLienCli(c) {
  exigerDbPreview(c);
  const fichier = c.cheminLienCli;
  const lire = () => (existsSync(fichier) ? readFileSync(fichier, "utf8").trim() : "");
  if (!lire()) {
    exigerVars(c, "qualification", ["SUPABASE_ACCESS_TOKEN"]);
    const r = c.rt.distant("npx", ["--no-install", "supabase", "link", "--project-ref", c.cible.supabase.project_ref], { env: envCli(c), cwd: c.root, timeoutMs: 180_000 });
    if (r.code !== 0) throw new Identifiant("supabase link a échoué (jeton ou mot de passe DB refusé)");
  }
  const v = verifierRefLieeCli(lire());
  if (!v.autorise || lire() !== c.cible.supabase.project_ref) throw new Error(`CLI Supabase : ${v.motif ?? "projet lié ≠ cible confirmée"}`);
}

export const etapesBase = [
  {
    id: "backup.dump", section: 5, titre: "Sauvegarde PostgreSQL de la Preview (pg_dump -Fc)", nature: NATURE.READ, critique: true, requise: true, modeComplet: true,
    async executer(c) {
      exigerDbPreview(c);
      const dir = resolve(c.options.backupDir);
      if (!repertoireSauvegardeAutorise(c.root, dir)) return resultat(STATUT.NO_GO, "--backup-dir est dans le dépôt : refus (les sauvegardes ne doivent jamais être versionnées)");
      if (c.etat.outils?.manquants?.some((o) => ["pg_dump", "pg_restore"].includes(o))) return resultat(STATUT.NO_GO, "pg_dump / pg_restore absents (brew install postgresql@17)");
      if (c.rt.horsLigne) throw new Reseau("mode --offline : aucune sauvegarde");
      const vDump = majeurePg(c.rt.local("pg_dump", ["--version"]).stdout);
      const vServeur = majeurePg(String(c.etat.serveurPg ?? ""));
      if (vServeur && vDump && vDump < vServeur) return resultat(STATUT.NO_GO, `pg_dump ${vDump} < serveur PostgreSQL ${vServeur} : installer postgresql@${vServeur}`);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const horodatage = new Date(c.maintenant).toISOString().replace(/[:.]/g, "-");
      const fichier = join(dir, `elsatia-preview-${c.cible.supabase.project_ref}-${horodatage}-${(c.etat.git?.head ?? "nohead").slice(0, 8)}.dump`);
      const r = c.rt.distant("pg_dump", argumentsPgDump(fichier), { env: c.pgEnv(), timeoutMs: 1_800_000 });
      if (r.code !== 0 || !existsSync(fichier)) return resultat(STATUT.NO_GO, "pg_dump en échec", [c.masque.appliquer(r.stderr.trim().split("\n").slice(-3).join(" | "))]);
      const taille = statSync(fichier).size;
      c.etat.sauvegarde = { fichier, taille };
      return resultat(STATUT.GO, `archive ${basename(fichier)} (${(taille / 1e6).toFixed(1)} Mo)`, [`répertoire hors dépôt : ${dir}`]);
    },
  },
  {
    id: "backup.validate", section: 5, titre: "Validation de la sauvegarde (TOC, SHA-256, restauration d'essai facultative)", nature: NATURE.READ, critique: true, requise: true, modeComplet: true,
    async executer(c) {
      const s = c.etat.sauvegarde;
      if (!s) throw new Saut("aucune sauvegarde produite par backup.dump");
      if (s.taille < 1024) return resultat(STATUT.NO_GO, `archive trop petite (${s.taille} octets)`);
      const l = c.rt.local("pg_restore", ["--list", s.fichier]);
      if (l.code !== 0) return resultat(STATUT.NO_GO, "pg_restore --list : archive illisible");
      const toc = validerToc(l.stdout, { minimumEntrees: c.options.backupMinEntries });
      const sha = createHash("sha256").update(readFileSync(s.fichier)).digest("hex");
      writeFileSync(`${s.fichier}.sha256`, `${sha}  ${basename(s.fichier)}\n`, { mode: 0o600 });
      Object.assign(s, { sha256: sha, entrees: toc.entrees, tablesDonnees: toc.tablesDonnees, restauration: commandeRestauration(s.fichier) });
      const details = [`${toc.entrees} entrées, ${toc.tablesDonnees} tables de données`, `SHA-256 ${sha}`, `empreinte écrite : ${basename(s.fichier)}.sha256`];
      if (!toc.ok) return resultat(STATUT.NO_GO, toc.erreurs[0], [...toc.erreurs, ...details]);
      // Restauration d'essai facultative, UNIQUEMENT sur une base locale jetable.
      if (c.options.restoreDrillDb) {
        const u = new URL(c.options.restoreDrillDb);
        if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)) return resultat(STATUT.NO_GO, "--restore-drill-db n'accepte qu'une base locale", details);
        const r = c.rt.local("pg_restore", ["--dbname", c.options.restoreDrillDb, "--no-owner", "--no-privileges", "--schema", "supabase_migrations", "--schema", "public", s.fichier], { timeoutMs: 1_800_000 });
        const n = c.rt.local("psql", [c.options.restoreDrillDb, "-X", "-At", "-c", "select count(*) from supabase_migrations.schema_migrations"]);
        const attendu = c.etat.ledger?.nbDistantes;
        const obtenu = Number(n.stdout.trim());
        details.push(`restauration d'essai locale : code ${r.code}, ${obtenu} migration(s) au registre restauré`);
        if (n.code !== 0 || (attendu !== undefined && obtenu !== attendu)) return resultat(STATUT.NO_GO, "restauration d'essai non conforme", details);
      } else details.push("restauration d'essai : non demandée (--restore-drill-db postgresql://localhost/… pour l'exécuter)");
      return resultat(STATUT.GO, "sauvegarde valide", details, { restauration: s.restauration });
    },
  },
  {
    id: "ledger.read", section: 6, titre: "Ledger supabase_migrations.schema_migrations vs train", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      exigerDbPreview(c);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : ledger non lu (jamais déduit d'un rapport)");
      const l = lireLedger(c);
      if (l.erreur) return resultat(STATUT.NO_GO, "ledger illisible", [l.erreur]);
      const cl = classerLedger(versionsLocales(resolve(c.root, "supabase/migrations")), l.versions);
      c.etat.ledger = cl;
      const details = [
        `distant : ${cl.nbDistantes} version(s), dernière ${cl.derniereDistante ?? "—"}`,
        `train : ${cl.nbLocales} version(s), dernière ${cl.derniereLocale}`,
        `classe : ${cl.classe}`,
      ];
      if (l.absent) details.push("table supabase_migrations.schema_migrations absente : projet jamais migré par la CLI");
      if (cl.enAttente.length) details.push(`en attente (${cl.enAttente.length}) : ${cl.enAttente.slice(0, 10).join(", ")}${cl.enAttente.length > 10 ? "…" : ""}`);
      if (cl.etrangeres.length) details.push(`versions distantes inconnues du dépôt : ${cl.etrangeres.slice(0, 10).join(", ")}`);
      if (cl.horsOrdre.length) details.push(`versions en attente antérieures à la dernière distante : ${cl.horsOrdre.slice(0, 10).join(", ")}`);
      if (!cl.compatible) return resultat(STATUT.NO_GO, `ledger incompatible (${cl.classe}) : aucune migration — décision humaine (migration repair / reset)`, details, { ledger: cl });
      return resultat(STATUT.GO, cl.classe === LEDGER.ALIGNED ? `ledger aligné sur le train (${cl.nbDistantes})` : `${cl.enAttente.length} migration(s) à appliquer, ordre compatible`, details, { ledger: cl });
    },
  },
  {
    id: "db.push-dry-run", section: 7, titre: "supabase db push --dry-run", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      const l = c.etat.ledger;
      if (!l) throw new Saut("ledger non lu");
      if (l.classe === LEDGER.ALIGNED) throw new Saut("ledger aligné : rien à pousser");
      if (!l.compatible) throw new Saut(`ledger ${l.classe} : dry-run inutile`);
      exigerLienCli(c);
      const r = c.rt.distant("npx", ["--no-install", "supabase", "db", "push", "--linked", "--dry-run"], { env: envCli(c), cwd: c.root, timeoutMs: 300_000 });
      const sortie = `${r.stdout}\n${r.stderr}`;
      const d = dryRunConforme(sortie, l.enAttente);
      c.etat.dryRun = { ok: r.code === 0 && d.ok, annoncees: d.annoncees };
      const details = [`annoncées par la CLI : ${d.annoncees.length}`, `attendues (ledger) : ${l.enAttente.length}`];
      if (r.code !== 0) return resultat(STATUT.NO_GO, "dry-run en échec", [...details, c.masque.appliquer(r.stderr.trim().split("\n").at(-1) ?? "")]);
      if (!d.ok) return resultat(STATUT.NO_GO, "le dry-run n'annonce pas exactement les migrations en attente du ledger", details);
      return resultat(STATUT.GO, `dry-run conforme : ${d.annoncees.length} migration(s) dans l'ordre`, details);
    },
  },
  {
    id: "db.push", section: 7, titre: "supabase db push (migrations du train)", nature: NATURE.DANGEROUS_WRITE, critique: true, requise: false, modeComplet: true,
    async executer(c) {
      const l = c.etat.ledger;
      if (!l) throw new Saut("ledger non lu");
      if (l.classe === LEDGER.ALIGNED) throw new Saut("ledger déjà aligné : aucune migration à appliquer");
      if (!c.options.applyMigrations) throw new Saut("--apply-migrations absent : migrations NON appliquées (relancer avec ce drapeau)");
      const preconditions = [
        ["backup.validate", "sauvegarde validée"], ["ledger.read", "ledger compatible"],
        ["db.push-dry-run", "dry-run conforme"], ["protection.target", "cible Preview confirmée"], ["preflight.git", "arbre propre sur le train"],
      ];
      const manquantes = preconditions.filter(([id]) => c.etape(id)?.statut !== STATUT.GO).map(([id, nom]) => `${nom} (${id}=${c.etape(id)?.statut ?? "absent"})`);
      if (manquantes.length) return resultat(STATUT.NO_GO, `db push refusé : ${manquantes.join(", ")}`);
      exigerLienCli(c);
      const r = c.rt.distant("npx", ["--no-install", "supabase", "db", "push", "--linked"], { env: envCli(c), cwd: c.root, input: "y\n", timeoutMs: 1_800_000 });
      const apres = lireLedger(c);
      const cl = apres.versions ? classerLedger(versionsLocales(resolve(c.root, "supabase/migrations")), apres.versions) : null;
      if (cl) c.etat.ledger = cl;
      const details = [`code de sortie CLI : ${r.code}`, cl ? `ledger après push : ${cl.classe}, ${cl.nbDistantes}/${cl.nbLocales}` : "ledger après push illisible"];
      if (r.code !== 0 || cl?.classe !== LEDGER.ALIGNED) return resultat(STATUT.NO_GO, "db push incomplet : restaurer ou décider (commande de restauration dans le rapport)", [...details, c.masque.appliquer(r.stderr.trim().split("\n").slice(-3).join(" | "))]);
      return resultat(STATUT.GO, `${l.enAttente.length} migration(s) appliquée(s), ledger aligné`, details);
    },
  },
  {
    id: "db.verify", section: 8, titre: "DB verify du train (contrôles SQL, préflight sécurité, RLS, RPC service-only)", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      exigerDbPreview(c);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : DB verify non exécuté");
      const args = ["--preview-ref", c.cible.supabase.project_ref];
      const enAttente = c.etat.ledger && c.etat.ledger.classe !== LEDGER.ALIGNED;
      if (enAttente) args.push("--allow-pending");
      if (c.options.beforeOwner) args.push("--before-owner");
      const uids = ["tenant_a", "tenant_b"].map((t) => c.cible.qa?.[t]?.user_id).filter(Boolean);
      if (uids.length) args.push("--rls-users", uids.join(","));
      const r = scriptDistant(c, "scripts/preview/db-verify.mjs", args, { ELSATIA_PREVIEW_DB_URL: c.q("ELSATIA_PREVIEW_DB_URL") });
      const res = depuisScript(c, r, `${c.etat.train?.controles ?? "?"} contrôles du train : GO`, "DB verify : NO-GO");
      if (enAttente) {
        // Une Preview qui n'a pas le train complet n'est jamais qualifiée, quels que soient les contrôles.
        res.details.unshift(`ATTENTION : ${c.etat.ledger.enAttente.length} migration(s) du train non appliquée(s) — contrôles exécutés sur un état antérieur au train`);
        if (res.statut === STATUT.GO) return resultat(STATUT.NO_GO, `contrôles GO mais ${c.etat.ledger.enAttente.length} migration(s) du train ${c.train.train} non appliquée(s)`, res.details);
      }
      return res;
    },
  },
  {
    id: "db.pgtap", section: 8, titre: "pgTAP du dépôt sur la base Preview (facultatif, --pgtap)", nature: NATURE.SAFE_WRITE, critique: false, requise: false, modeComplet: true,
    async executer(c) {
      if (!c.options.pgtap) throw new Saut("--pgtap absent (suites transactionnelles, exécution facultative)");
      exigerLienCli(c);
      const r = c.rt.distant("npx", ["--no-install", "supabase", "test", "db", "--linked"], { env: envCli(c), cwd: c.root, timeoutMs: 1_800_000 });
      const sortie = `${r.stdout}\n${r.stderr}`;
      const notOk = (sortie.match(/^not ok /gm) ?? []).length;
      const ok = (sortie.match(/^ok /gm) ?? []).length;
      return resultat(r.code === 0 && !notOk ? STATUT.GO : STATUT.NO_GO, `pgTAP : ${ok} ok, ${notOk} not ok`, sortie.split("\n").filter((x) => /^not ok|Failed|Result:/.test(x)).slice(0, 30).map((x) => c.masque.appliquer(x)));
    },
  },
];
