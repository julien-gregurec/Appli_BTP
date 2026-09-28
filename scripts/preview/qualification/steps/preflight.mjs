// §3 PREFLIGHT et §4 PROTECTION PRODUCTION — aucune écriture distante.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { refDepuisUrlApi, refDepuisUrlDb, typeCleStripe } from "../../lib/preview-guard.mjs";
import { Identifiant, NATURE, Reseau, STATUT, Saut, resultat } from "../lib/core.mjs";
import { APPS_WEB, recouperIdentites, validerCible } from "../lib/target.mjs";
import { estDefinie, exigerCible, exigerDbPreview, exigerVars, jsonOuNull, lignesSignificatives, scriptLocal } from "./helpers.mjs";

const FICHIERS_REQUIS = ["gp", "tools", "colors", "reserves"];
/** Variables opérateur (qualification.env ou shell) — noms seulement dans les sorties. */
export const VARS_OPERATEUR = {
  requises: ["ELSATIA_PREVIEW_DB_URL", "VERCEL_TOKEN", "ELSATIA_QA_PASSWORD_A", "ELSATIA_QA_PASSWORD_B"],
  facultatives: ["SUPABASE_ACCESS_TOKEN", "VERCEL_AUTOMATION_BYPASS_SECRET", "STUDIO_REDIS_URL"],
};

/** Hôtes que la qualification doit joindre (pour DNS et réseau). */
export function hotesAttendus(c) {
  const h = new Map();
  const ref = c.cible?.supabase?.project_ref;
  if (ref) h.set(`${ref}.supabase.co`, "Supabase API");
  const db = c.q("ELSATIA_PREVIEW_DB_URL");
  if (estDefinie(db)) { try { h.set(new URL(db).hostname, "Supabase PostgreSQL"); } catch { /* invalide : signalé ailleurs */ } }
  h.set("api.supabase.com", "Supabase Management (logs)");
  h.set("api.vercel.com", "Vercel API");
  h.set("api.stripe.com", "Stripe API");
  h.set("api.brevo.com", "Brevo API");
  for (const app of APPS_WEB) {
    const o = c.cible?.vercel?.projects?.[app]?.preview_origin;
    if (o) { try { h.set(new URL(o).hostname, `Preview ${app}`); } catch { /* invalide */ } }
  }
  const redis = c.q("STUDIO_REDIS_URL") ?? c.envs.worker?.STUDIO_REDIS_URL;
  if (estDefinie(redis)) { try { h.set(new URL(redis).hostname, "Redis"); } catch { /* invalide */ } }
  return h;
}

/** Un répertoire d'écriture de données Preview (variables, sauvegardes) doit être HORS du dépôt. */
export function repertoireHorsDepot(racineDepot, dir) {
  const rel = relative(resolve(racineDepot), resolve(dir));
  return !(rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)));
}

/**
 * Pur : variables d'un projet Vercel (réponse /v10/projects/:id/env) applicables à la Preview du
 * train. Une valeur propre à la branche du train l'emporte sur la valeur Preview générique ; les
 * variables « sensitive » (jamais déchiffrables par l'API) sont listées par NOM seulement.
 */
export function variablesPreview(envs, branche) {
  const env = {};
  const specifiques = new Set();
  const sensibles = [];
  for (const e of envs) {
    const cibles = Array.isArray(e.target) ? e.target : [e.target];
    if (!cibles.includes("preview")) continue;
    if (e.gitBranch && e.gitBranch !== branche) continue;
    if (e.type === "sensitive" || typeof e.value !== "string") { if (!sensibles.includes(e.key)) sensibles.push(e.key); continue; }
    if (specifiques.has(e.key) && !e.gitBranch) continue;
    env[e.key] = e.value;
    if (e.gitBranch) specifiques.add(e.key);
  }
  return { env, sensibles: sensibles.filter((k) => !(k in env)) };
}

/** Pur : fichier dotenv relisible par parseEnvFile (une ligne par variable, sauts de ligne échappés). */
export function ecrireDotenv(env) {
  return `${Object.entries(env).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${String(v).replace(/\r?\n/g, "\\n")}"`).join("\n")}\n`;
}

export const etapesPreflight = [
  {
    id: "preflight.git", section: 3, titre: "Git : HEAD, branche, arbre, train", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      const git = (...a) => c.rt.local("git", a, { cwd: c.root });
      const head = git("rev-parse", "HEAD").stdout.trim();
      const branche = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
      // artifacts/ est écrit par ce pack lui-même : exclu du contrôle d'arbre.
      const sale = git("status", "--porcelain", "--untracked-files=normal").stdout.split("\n").filter((l) => l.trim() && !/\sartifacts\//.test(l));
      c.etat.git = { head, branche, sale: sale.length > 0 };
      const details = [`HEAD ${head.slice(0, 12)} sur ${branche}`, sale.length ? `${sale.length} fichier(s) modifié(s) ou non suivi(s)` : "arbre propre"];
      const erreurs = [];
      if (!head) erreurs.push("HEAD illisible");
      if (sale.length) erreurs.push("arbre de travail sale : committer ou remiser avant toute qualification");
      const anc = git("merge-base", "--is-ancestor", c.train.qualified_commit, "HEAD");
      if (anc.code !== 0) erreurs.push(`HEAD ne contient pas le commit qualifié ${c.train.qualified_commit.slice(0, 8)} du train ${c.train.train}`);
      const mig = git("diff", "--quiet", c.train.qualified_commit, "HEAD", "--", "supabase/migrations");
      if (mig.code !== 0) erreurs.push(`supabase/migrations diffère du train ${c.train.train} qualifié : refus (train non qualifié)`);
      else details.push(`migrations identiques au train ${c.train.train} qualifié (${c.train.qualified_commit.slice(0, 8)})`);

      // Train plus récent (V6…) : jamais choisi ni ignoré silencieusement.
      if (c.rt.horsLigne) details.push("trains plus récents : non vérifiés (--offline)");
      else {
        const ls = c.rt.distant("git", ["ls-remote", "--heads", "origin", `refs/heads/${c.train.newer_train_pattern}`], { cwd: c.root, timeoutMs: 60_000 });
        if (ls.code !== 0) details.push("trains plus récents : ls-remote impossible (vérifier à la main)");
        else {
          const courant = Number(/v(\d+)$/i.exec(c.train.branch)?.[1] ?? 0);
          const plusRecents = ls.stdout.split("\n").map((l) => l.split("\t")[1]).filter(Boolean)
            .map((r) => r.replace("refs/heads/", "")).filter((b) => Number(/v(\d+)$/i.exec(b)?.[1] ?? 0) > courant);
          for (const b of plusRecents) {
            c.rt.distant("git", ["fetch", "--no-tags", "--depth=50", "origin", `refs/heads/${b}:refs/remotes/origin/${b}`], { cwd: c.root, timeoutMs: 120_000 });
            // Seuls les commits propres à ce train (absents de HEAD) comptent, et seul SON numéro :
            // un train V6 contient l'historique V5 et donc le verdict « V5 LOCALLY QUALIFIED ».
            const sujets = git("log", "-200", "--format=%s", `HEAD..origin/${b}`).stdout;
            const numero = /v(\d+)$/i.exec(b)?.[1];
            const m = [...sujets.matchAll(new RegExp(c.train.newer_train_verdict_regex, "g"))].find((x) => x[1] === numero);
            if (m) erreurs.push(`train plus récent QUALIFIÉ détecté (${b} : « ${m[0]} ») : ce pack vise ${c.train.train} — mettre à jour scripts/preview/qualification/train.json par revue avant d'exécuter`);
            else details.push(`${b} existe mais n'est pas qualifié : ${c.train.train} reste le train canonique`);
          }
          if (!plusRecents.length) details.push(`aucun train plus récent que ${c.train.train} sur origin`);
        }
      }
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, `HEAD ${head.slice(0, 8)} — train ${c.train.train}`, details, { head, branche });
    },
  },
  {
    id: "preflight.train", section: 3, titre: "Attendus du train (migrations, DB verify)", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      const t = scriptLocal(c, "scripts/preview/train-expectations.mjs", ["--check"]);
      const m = /train : (\d+) migrations, dernière (\d{14}) ; DB verify : (\d+) contrôles/.exec(t.sortie);
      const v = scriptLocal(c, "scripts/verify-migrations.mjs", []);
      if (m) c.etat.train = { nb: Number(m[1]), derniere: m[2], controles: Number(m[3]) };
      if (t.code !== 0 || v.code !== 0 || !m) return resultat(STATUT.NO_GO, "attendus du train incohérents", lignesSignificatives(c, `${t.sortie}\n${v.sortie}`));
      return resultat(STATUT.GO, `${m[1]} migrations, dernière ${m[2]}, ${m[3]} contrôles DB verify`, ["train-expectations --check : à jour", "verify-migrations : OK"]);
    },
  },
  {
    id: "preflight.tooling", section: 3, titre: "Outils locaux (psql, pg_dump, pg_restore, supabase, playwright)", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      const outils = [
        ["psql", ["--version"]], ["pg_dump", ["--version"]], ["pg_restore", ["--version"]],
        ["npx", ["--no-install", "supabase", "--version"]], ["npx", ["--no-install", "playwright", "--version"]],
      ];
      const details = [`node ${process.version}`];
      const manquants = [];
      for (const [cmd, args] of outils) {
        const r = c.rt.local(cmd, args, { cwd: c.root, timeoutMs: 60_000 });
        const nom = cmd === "npx" ? args[1] : cmd;
        if (r.code !== 0) manquants.push(nom);
        else details.push(`${nom} : ${r.stdout.trim().split("\n")[0]}`);
      }
      c.etat.outils = { manquants };
      if (Number(process.versions.node.split(".")[0]) < 20) manquants.push("node ≥ 20");
      return manquants.length
        ? resultat(STATUT.NO_GO, `outil(s) manquant(s) : ${manquants.join(", ")}`, [...details, "installer : brew install postgresql@17 ; npm ci ; npx playwright install chromium"])
        : resultat(STATUT.GO, "outils présents", details);
    },
  },
  {
    id: "preflight.pull-env", section: 3, titre: "Variables Preview récupérées via l'API Vercel (--pull-env)", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      if (!c.options.pullEnv) throw new Saut("--pull-env absent : fichiers <app>.env fournis par l'opérateur (vercel env pull)");
      exigerCible(c);
      exigerVars(c, "qualification", ["VERCEL_TOKEN"]);
      if (!repertoireHorsDepot(c.root, c.options.envDir)) return resultat(STATUT.NO_GO, "--env-dir est dans le dépôt : refus (les variables Preview ne doivent jamais y être écrites)");
      if (c.rt.horsLigne) throw new Reseau("mode --offline : variables non récupérées");
      mkdirSync(c.options.envDir, { recursive: true, mode: 0o700 });
      const team = c.cible.vercel?.team_id ? `&teamId=${encodeURIComponent(c.cible.vercel.team_id)}` : "";
      const details = [];
      const erreurs = [];
      for (const app of APPS_WEB) {
        const p = c.cible.vercel.projects[app];
        const r = await c.rt.fetch(`https://api.vercel.com/v10/projects/${encodeURIComponent(p.project_id)}/env?decrypt=true${team}`, { headers: { Authorization: `Bearer ${c.q("VERCEL_TOKEN")}` } });
        if (r.status === 401 || r.status === 403) throw new Identifiant(`VERCEL_TOKEN refusé pour ${app} (HTTP ${r.status})`);
        const j = r.ok ? await jsonOuNull(r) : null;
        if (!Array.isArray(j?.envs)) { erreurs.push(`${app} : variables illisibles (HTTP ${r.status})`); continue; }
        const { env, sensibles } = variablesPreview(j.envs, c.train.branch);
        c.masque.ajouterEnv(env);
        writeFileSync(join(c.options.envDir, `${app}.env`), ecrireDotenv(env), { mode: 0o600 });
        c.envs[app] = env;
        details.push(`${app}.env : ${Object.keys(env).length} variable(s) Preview écrites (0600)${sensibles.length ? ` ; ${sensibles.length} « sensitive » non récupérable(s) : ${sensibles.join(", ")}` : ""}`);
      }
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, `variables Preview des 4 projets écrites dans ${c.options.envDir}`, details);
    },
  },
  {
    id: "preflight.env", section: 3, titre: "Complétude des environnements Preview", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      const absents = FICHIERS_REQUIS.filter((f) => !c.envs[f]);
      if (absents.length) throw new Identifiant(`fichier(s) absent(s) de --env-dir : ${absents.map((f) => `${f}.env`).join(", ")} (vercel env pull --environment=preview)`);
      const opManquantes = VARS_OPERATEUR.requises.filter((n) => !estDefinie(c.q(n)));
      // Observations pour la protection Production.
      c.etat.observe.envProduction = Object.entries(c.envs).filter(([, e]) => e && (e.ELSATIA_APPLICATION_ENV?.trim() === "production" || e.VERCEL_ENV?.trim() === "production")).map(([f]) => `${f}.env`);
      for (const f of FICHIERS_REQUIS) {
        const ref = refDepuisUrlApi(c.envs[f].NEXT_PUBLIC_SUPABASE_URL);
        if (ref) c.etat.observe.supabaseRefs[`${f}.env NEXT_PUBLIC_SUPABASE_URL`] = ref;
        for (const n of ["STRIPE_SECRET_KEY", "STRIPE_TOOLS_SECRET_KEY"]) {
          const t = typeCleStripe(c.envs[f][n]);
          if (t) c.etat.observe.stripe.typesCles[`${f}.${n}`] = t;
        }
      }
      const refCible = c.cible?.supabase?.project_ref;
      const ec = scriptLocal(c, "scripts/preview/env-check.mjs", ["--dir", c.options.envDir, "--require", FICHIERS_REQUIS.join(","), ...(refCible ? ["--preview-ref", refCible] : [])]);
      const details = [...lignesSignificatives(c, ec.sortie), `variables opérateur requises : ${VARS_OPERATEUR.requises.length - opManquantes.length}/${VARS_OPERATEUR.requises.length}`];
      for (const n of VARS_OPERATEUR.facultatives) details.push(`${n} : ${estDefinie(c.q(n)) ? "présente" : "absente (facultative)"}`);
      if (c.etat.observe.envProduction.length) return resultat(STATUT.NO_GO, `environnement Production déclaré dans ${c.etat.observe.envProduction.join(", ")}`, details);
      if (ec.code !== 0) return resultat(STATUT.NO_GO, "env-check : erreurs de manifeste ou de cohérence inter-applications", details);
      if (opManquantes.length) throw new Identifiant(`variables opérateur absentes : ${opManquantes.join(", ")}`);
      return resultat(STATUT.GO, "4 fichiers Preview conformes au manifeste, cohérence croisée OK", details);
    },
  },
  {
    id: "preflight.dns", section: 3, titre: "Résolution DNS des cibles", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      const hotes = hotesAttendus(c);
      if (c.rt.horsLigne) throw new Reseau(`mode --offline : ${hotes.size} hôte(s) non résolu(s)`);
      const ko = [];
      const details = [];
      for (const [h, role] of hotes) {
        try { const a = await c.rt.dns(h); details.push(`${role} : ${h} → ${a.length} adresse(s)`); } catch (e) { ko.push(`${role} : ${h} (${e.message})`); }
      }
      c.etat.dnsKo = ko;
      if (ko.length) throw new Reseau(`${ko.length} hôte(s) non résolu(s) : ${ko.join(" ; ")}`);
      return resultat(STATUT.GO, `${hotes.size} hôte(s) résolu(s)`, details);
    },
  },
  {
    id: "preflight.network", section: 3, titre: "Joignabilité réseau (HTTPS, PostgreSQL, Redis)", nature: NATURE.READ, critique: false, requise: true,
    async executer(c) {
      if (c.rt.horsLigne) throw new Reseau("mode --offline : aucune connexion");
      const details = [];
      const ko = [];
      const essais = [["https://api.stripe.com/v1/account", "Stripe"], ["https://api.vercel.com/v2/user", "Vercel"], ["https://api.brevo.com/v3/account", "Brevo"]];
      const ref = c.cible?.supabase?.project_ref;
      if (ref) essais.push([`https://${ref}.supabase.co/auth/v1/health`, "Supabase Auth"]);
      for (const app of APPS_WEB) { const o = c.cible?.vercel?.projects?.[app]?.preview_origin; if (o) essais.push([`${o}/robots.txt`, `Preview ${app}`]); }
      for (const [url, nom] of essais) {
        // Requêtes SANS identifiant : un 401/403 prouve la joignabilité, sans rien révéler.
        try { const r = await c.rt.fetch(url, { method: "GET" }, 10_000); details.push(`${nom} : HTTP ${r.status}`); } catch (e) { if (e instanceof Reseau) ko.push(`${nom} (${e.message})`); else throw e; }
      }
      const db = c.q("ELSATIA_PREVIEW_DB_URL");
      if (estDefinie(db)) {
        try { const u = new URL(db); await c.rt.tcp(u.hostname, u.port || 5432); details.push(`PostgreSQL : TCP ${u.port || 5432} ouvert`); } catch (e) { ko.push(`PostgreSQL (${e.message})`); }
      }
      const redis = c.q("STUDIO_REDIS_URL") ?? c.envs.worker?.STUDIO_REDIS_URL;
      if (estDefinie(redis)) {
        try { const u = new URL(redis); await c.rt.tcp(u.hostname, u.port || 6379); details.push("Redis : TCP ouvert"); } catch (e) { ko.push(`Redis (${e.message})`); }
      }
      if (ko.length) throw new Reseau(`injoignable(s) : ${ko.join(" ; ")}`);
      return resultat(STATUT.GO, `${details.length} service(s) joignable(s)`, details);
    },
  },
  {
    id: "preflight.supabase-identity", section: 3, titre: "Identité Supabase (ref Preview ≠ Production)", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "qualification", ["ELSATIA_PREVIEW_DB_URL"]);
      const obs = c.etat.observe.supabaseRefs;
      obs.ELSATIA_PREVIEW_DB_URL = refDepuisUrlDb(c.q("ELSATIA_PREVIEW_DB_URL"));
      const lien = c.cheminLienCli;
      if (existsSync(lien)) obs["supabase/.temp/project-ref (CLI liée)"] = readFileSync(lien, "utf8").trim().toLowerCase();
      const details = Object.entries(obs).filter(([, r]) => r).map(([s, r]) => `${s} : ${r === c.cible?.supabase?.project_ref ? "= cible" : "≠ cible"}`);
      // Contradiction (Production, autre projet) : NO-GO AVANT toute connexion.
      const { erreurs: avant } = recouperIdentites(c.cible, { supabaseRefs: obs });
      if (avant.length) return resultat(STATUT.NO_GO, avant[0], [...avant, ...details, "aucune connexion PostgreSQL n'a été ouverte"]);
      exigerDbPreview(c);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : identité Supabase non vérifiée à distance");
      // Lecture seule : version serveur, base, et nom du projet via l'API de gestion si jeton fourni.
      const r = c.rt.distant("psql", ["-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", "select current_setting('server_version_num'), current_database(), current_setting('transaction_read_only')"], { env: { ...c.pgEnv(), PGOPTIONS: "-c default_transaction_read_only=on" }, timeoutMs: 60_000 });
      if (r.code !== 0) {
        if (/could not translate|timeout expired|Connection refused|Network is unreachable/i.test(r.stderr)) throw new Reseau("PostgreSQL Preview injoignable");
        return resultat(STATUT.NO_GO, "connexion PostgreSQL Preview refusée", [c.masque.appliquer(r.stderr.trim().split("\n").at(-1) ?? "")]);
      }
      const [version, base, ro] = r.stdout.trim().split("|");
      c.etat.serveurPg = Number(version);
      details.push(`PostgreSQL ${version}, base ${base}, session lecture seule = ${ro}`);
      const tok = c.q("SUPABASE_ACCESS_TOKEN");
      if (estDefinie(tok)) {
        const p = await c.rt.fetch(`https://api.supabase.com/v1/projects/${c.cible.supabase.project_ref}`, { headers: { Authorization: `Bearer ${tok}` } });
        const j = p.ok ? await jsonOuNull(p) : null;
        if (!j) details.push(`API de gestion : HTTP ${p.status} (nom du projet non vérifié)`);
        else {
          details.push(`API de gestion : projet « ${j.name} » (${j.region ?? "région ?"}), statut ${j.status ?? "?"}`);
          if (c.cible.supabase.project_name && j.name !== c.cible.supabase.project_name) return resultat(STATUT.NO_GO, "nom du projet Supabase ≠ supabase.project_name confirmé", details);
          if (/prod/i.test(j.name ?? "") && !/preview|staging|recette/i.test(j.name ?? "")) return resultat(STATUT.NO_GO, "le projet Supabase porte un nom de Production", details);
        }
      } else details.push("SUPABASE_ACCESS_TOKEN absent : nom du projet non vérifié (facultatif)");
      const { erreurs } = recouperIdentites(c.cible, { supabaseRefs: obs });
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, `Supabase Preview ${c.cible.supabase.project_ref} confirmée par ${Object.values(obs).filter(Boolean).length} source(s)`, details);
    },
  },
  {
    id: "preflight.vercel-identity", section: 3, titre: "Identité Vercel (projets Preview, déploiements sur le train)", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "qualification", ["VERCEL_TOKEN"]);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : Vercel non interrogé");
      const tok = c.q("VERCEL_TOKEN");
      const team = c.cible.vercel?.team_id ? `teamId=${encodeURIComponent(c.cible.vercel.team_id)}` : "";
      const api = (chemin) => c.rt.fetch(`https://api.vercel.com${chemin}${chemin.includes("?") ? "&" : "?"}${team}`, { headers: { Authorization: `Bearer ${tok}` } });
      const u = await api("/v2/user");
      if (u.status === 401 || u.status === 403) throw new Identifiant(`VERCEL_TOKEN refusé (HTTP ${u.status})`);
      const details = [];
      const erreurs = [];
      const shasAdmis = new Set([c.train.qualified_commit, c.etat.git?.head].filter(Boolean));
      c.etat.deploiements = {};
      for (const app of APPS_WEB) {
        const p = c.cible.vercel.projects[app];
        const pr = await api(`/v9/projects/${encodeURIComponent(p.project_id)}`);
        const pj = pr.ok ? await jsonOuNull(pr) : null;
        if (!pj) { erreurs.push(`${app} : projet ${p.project_id} illisible (HTTP ${pr.status})`); continue; }
        if (p.project_name && pj.name !== p.project_name) erreurs.push(`${app} : nom du projet Vercel ≠ project_name confirmé`);
        const hote = new URL(p.preview_origin).hostname;
        const dr = await api(`/v13/deployments/${encodeURIComponent(hote)}`);
        const d = dr.ok ? await jsonOuNull(dr) : null;
        if (!d) { erreurs.push(`${app} : déploiement ${hote} introuvable (HTTP ${dr.status})`); continue; }
        const sha = d.meta?.githubCommitSha ?? null;
        c.etat.observe.vercel[app] = { projectId: d.projectId, target: d.target ?? "preview", url: hote };
        c.etat.deploiements[app] = { id: d.id ?? d.uid, projectId: d.projectId, sha, etat: d.readyState ?? d.status };
        details.push(`${app} : projet « ${pj.name} », déploiement ${d.target ?? "preview"} ${d.readyState ?? d.status}, commit ${sha ? sha.slice(0, 8) : "inconnu"}`);
        if ((d.readyState ?? d.status) !== "READY") erreurs.push(`${app} : déploiement non prêt (${d.readyState ?? d.status})`);
        if (!sha) erreurs.push(`${app} : commit du déploiement inconnu (déploiement hors Git ?)`);
        else if (!shasAdmis.has(sha)) erreurs.push(`${app} : déploiement sur ${sha.slice(0, 8)} ≠ train ${c.train.train} (${c.train.qualified_commit.slice(0, 8)}) ni HEAD — redéployer le train`);
      }
      const { erreurs: prot } = recouperIdentites(c.cible, { vercel: c.etat.observe.vercel });
      erreurs.unshift(...prot);
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...details]) : resultat(STATUT.GO, "4 déploiements Preview READY sur le train, projets confirmés", details);
    },
  },
  {
    id: "preflight.stripe-mode", section: 3, titre: "Stripe : Test Mode uniquement", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      // AVANT tout réseau : une clé live n'est jamais envoyée nulle part.
      const types = c.etat.observe.stripe.typesCles;
      const live = Object.entries(types).filter(([, t]) => t === "live").map(([n]) => n);
      if (live.length) return resultat(STATUT.NO_GO, `clé(s) Stripe LIVE en Preview : ${live.join(", ")} — refus`, ["aucune requête Stripe n'a été émise"]);
      exigerCible(c);
      exigerVars(c, "gp", ["STRIPE_SECRET_KEY"]);
      if (types["gp.STRIPE_SECRET_KEY"] !== "test") return resultat(STATUT.NO_GO, "gp.STRIPE_SECRET_KEY n'est pas une clé sk_test_/rk_test_");
      if (c.rt.horsLigne) throw new Reseau("mode --offline : compte Stripe non interrogé");
      const r = await c.rt.fetch("https://api.stripe.com/v1/account", { headers: { Authorization: `Bearer ${c.envs.gp.STRIPE_SECRET_KEY}` } });
      if (r.status === 401) throw new Identifiant("gp.STRIPE_SECRET_KEY refusée par Stripe (401)");
      const j = r.ok ? await jsonOuNull(r) : null;
      if (!j?.id) return resultat(STATUT.NO_GO, `Stripe /v1/account : HTTP ${r.status}`);
      c.etat.observe.stripe.accountId = j.id;
      const { erreurs, ok } = recouperIdentites(c.cible, { stripe: c.etat.observe.stripe });
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], erreurs) : resultat(STATUT.GO, `Stripe Test, compte ${j.id} confirmé`, ok);
    },
  },
  {
    id: "preflight.redis", section: 3, titre: "Redis Preview (identité)", nature: NATURE.READ, critique: true, requise: false,
    async executer(c) {
      const url = c.q("STUDIO_REDIS_URL") ?? c.envs.worker?.STUDIO_REDIS_URL;
      if (!estDefinie(url) && !c.cible?.redis) throw new Saut("aucune URL Redis ni redis déclaré : Redis n'est utilisé que par le worker Studio, hors périmètre V5");
      if (!estDefinie(url)) throw new Identifiant("STUDIO_REDIS_URL absente (qualification.env ou worker.env)");
      let hote;
      try { hote = new URL(url).hostname; } catch { return resultat(STATUT.NO_GO, "STUDIO_REDIS_URL invalide"); }
      c.etat.observe.redisHost = hote;
      if (!c.cible?.redis) return resultat(STATUT.NO_GO, "URL Redis fournie mais redis non confirmé dans le fichier de cible");
      const { erreurs, ok } = recouperIdentites(c.cible, { redisHost: hote });
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], erreurs) : resultat(STATUT.GO, "Redis Preview confirmé", ok);
    },
  },
  {
    id: "preflight.brevo", section: 3, titre: "Brevo : compte de recette", nature: NATURE.READ, critique: true, requise: true,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "gp", ["BREVO_API_KEY", "EMAIL_FROM_ADDRESS"]);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : compte Brevo non interrogé");
      const r = await c.rt.fetch("https://api.brevo.com/v3/account", { headers: { "api-key": c.envs.gp.BREVO_API_KEY, accept: "application/json" } });
      if (r.status === 401) throw new Identifiant("gp.BREVO_API_KEY refusée par Brevo (401)");
      const j = r.ok ? await jsonOuNull(r) : null;
      if (!j?.email) return resultat(STATUT.NO_GO, `Brevo /v3/account : HTTP ${r.status}`);
      c.etat.observe.brevoEmail = j.email;
      const { erreurs, ok } = recouperIdentites(c.cible, { brevoEmail: j.email });
      return erreurs.length ? resultat(STATUT.NO_GO, erreurs[0], erreurs) : resultat(STATUT.GO, "Brevo : compte de recette confirmé", [...ok, `allowlist : ${c.cible.brevo.recipient_allowlist.length} adresse(s)`]);
    },
  },
  {
    id: "protection.target", section: 4, titre: "Protection Production : confirmation machine-readable", nature: NATURE.READ, critique: true, requise: true, bloqueSiSaute: true,
    async executer(c) {
      const { erreurs, avertissements } = validerCible(c.cible, { maintenant: c.maintenant });
      if (c.options.confirmPreview !== c.cible?.supabase?.project_ref) erreurs.push("--confirm-preview <ref> absent ou ≠ supabase.project_ref (confirmation tapée à l'exécution)");
      const { erreurs: contradictions, ok } = recouperIdentites(c.cible ?? {}, c.etat.observe);
      erreurs.push(...contradictions);
      if (erreurs.length) return resultat(STATUT.NO_GO, erreurs[0], [...erreurs, ...avertissements]);
      // Les preuves observées doivent exister : sans elles, la cible n'est pas CONFIRMÉE.
      const preuves = ["preflight.supabase-identity", "preflight.vercel-identity", "preflight.stripe-mode", "preflight.brevo"];
      const nonGo = preuves.map((id) => c.etape(id)).filter((e) => e && e.statut !== STATUT.GO);
      if (nonGo.length) {
        const s = nonGo.find((e) => e.statut === STATUT.NO_GO) ?? nonGo.find((e) => e.statut === STATUT.BLOCKED_NETWORK) ?? nonGo[0];
        return resultat(s.statut === STATUT.SKIPPED ? STATUT.NO_GO : s.statut, `cible non confirmée : ${nonGo.map((e) => `${e.id}=${e.statut}`).join(", ")}`, [...ok, ...avertissements]);
      }
      return resultat(STATUT.GO, "cible Preview confirmée (fichier + observations + --confirm-preview)", [...ok, ...avertissements]);
    },
  },
];
