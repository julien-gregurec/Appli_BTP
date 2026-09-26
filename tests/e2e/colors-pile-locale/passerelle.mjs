/*
 * Passerelle locale Supabase — sous-ensemble servi à ELSATIA Colors.
 *
 * POURQUOI. La recette e2e Colors exige une pile Supabase (GoTrue, PostgREST, Storage).
 * Quand ni Docker ni les binaires officiels ne sont disponibles, cette passerelle rejoue
 * EXACTEMENT les appels que Colors émet — et seulement eux — au-dessus d'un VRAI
 * PostgreSQL 16 portant le vrai train de migrations. Elle n'invente aucune règle d'accès :
 *
 *   - chaque requête REST/RPC s'exécute dans une transaction `set local role <rôle du JWT>`
 *     avec `request.jwt.claims` posés comme PostgREST le fait. Les policies RLS, les
 *     `security definer`, les GRANT et les triggers sont donc ceux de la base, pas une copie ;
 *   - l'authentification vérifie le mot de passe contre `auth.users.encrypted_password`
 *     (bcrypt, `crypt()` de pgcrypto) ; les jetons sont des JWT HS256 signés, avec `exp` ;
 *     le rafraîchissement fait TOURNER le jeton (l'ancien est révoqué), comme GoTrue ;
 *   - Storage lit/écrit `storage.objects` sous le rôle de l'appelant (service_role pour la
 *     clé serveur) : les policies `colors_photos_*` décident, pas la passerelle. Une URL
 *     signée n'est émise que si l'appelant peut SÉLECTIONNER l'objet sous RLS.
 *
 * CE QU'ELLE NE PROUVE PAS. Le comportement propre des services hébergés (limites de débit,
 * e-mails, MFA, redimensionnement d'image réel, Kong, pooler), ni l'égalité octet pour octet
 * des réponses d'erreur. Elle est déclarée comme telle dans le rapport de qualification.
 *
 * Endpoints servis (tout le reste répond 501, jamais un faux succès) :
 *   POST /auth/v1/token?grant_type=password|refresh_token   GET /auth/v1/user
 *   POST /auth/v1/logout                                    POST /auth/v1/recover
 *   GET|HEAD|POST /rest/v1/<table>                          POST|GET /rest/v1/rpc/<fonction>
 *   POST /storage/v1/object/<bucket>/<chemin>               DELETE /storage/v1/object/<bucket>
 *   POST /storage/v1/object/sign/<bucket>/<chemin>          POST /storage/v1/object/sign/<bucket> (groupée)
 *   PATCH /rest/v1/<table> (filtres PostgREST)
 *   GET  /storage/v1/object/sign/<bucket>/<chemin>?token=   GET /storage/v1/render/image/sign/…
 *   GET  /__recette/journal   POST /__recette/duree-jeton   (pilotage de recette, local seulement)
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const PORT = Number(process.env.PASSERELLE_PORT ?? 54321);
const HOTE = process.env.PASSERELLE_HOTE ?? "127.0.0.1";
const SECRET_JWT = process.env.PASSERELLE_SECRET_JWT;
const CLE_PUBLIQUE = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DOSSIER_STOCKAGE = process.env.PASSERELLE_STOCKAGE ?? path.resolve("stockage-recette");
let dureeJeton = Number(process.env.PASSERELLE_DUREE_JETON_S ?? 3600);
/** Fenêtre de réutilisation d'un jeton de rafraîchissement déjà tourné (GoTrue : 10 s). */
const FENETRE_REUTILISATION_MS = 10_000;

for (const [nom, valeur] of Object.entries({ PASSERELLE_SECRET_JWT: SECRET_JWT, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CLE_PUBLIQUE, SUPABASE_SERVICE_ROLE_KEY: CLE_SERVICE })) {
  if (!valeur) { console.error(`[passerelle] ${nom} requise — refus de démarrer sans elle`); process.exit(2); }
}
const URL_BASE = process.env.PASSERELLE_DATABASE_URL;
const URL_BASE_ADMIN = process.env.PASSERELLE_ADMIN_DATABASE_URL;
for (const [nom, valeur] of Object.entries({ PASSERELLE_DATABASE_URL: URL_BASE, PASSERELLE_ADMIN_DATABASE_URL: URL_BASE_ADMIN })) {
  if (!valeur) { console.error(`[passerelle] ${nom} requise`); process.exit(2); }
}
fs.mkdirSync(DOSSIER_STOCKAGE, { recursive: true });

/*
 * Deux connexions, comme sur une vraie pile :
 *  - `pool` se connecte en `authenticator` (rôle de PostgREST) : il ne peut rien faire
 *    d'autre que `SET ROLE` vers anon / authenticated / service_role. Toute requête REST,
 *    RPC ou Storage d'un appelant passe par lui ;
 *  - `poolAdmin` joue le rôle de l'administrateur interne de GoTrue/Storage : lecture de
 *    auth.users pour vérifier un mot de passe, lecture des métadonnées d'un bucket.
 */
const pool = new pg.Pool({ connectionString: URL_BASE, max: 10 });
const poolAdmin = new pg.Pool({ connectionString: URL_BASE_ADMIN, max: 4 });

/** Journal consultable par la recette (jamais de secret : ni mot de passe ni jeton). */
const journal = [];
function consigner(evenement) {
  journal.push({ t: new Date().toISOString(), ...evenement });
  if (journal.length > 2000) journal.shift();
}

// ---------------------------------------------------------------------------
// JWT HS256
// ---------------------------------------------------------------------------
const b64url = (tampon) => Buffer.from(tampon).toString("base64url");
function signerJwt(charge) {
  const entete = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const corps = b64url(JSON.stringify(charge));
  const signature = crypto.createHmac("sha256", SECRET_JWT).update(`${entete}.${corps}`).digest("base64url");
  return `${entete}.${corps}.${signature}`;
}
function verifierJwt(jeton) {
  const morceaux = String(jeton ?? "").split(".");
  if (morceaux.length !== 3) return null;
  const attendue = crypto.createHmac("sha256", SECRET_JWT).update(`${morceaux[0]}.${morceaux[1]}`).digest();
  const recue = Buffer.from(morceaux[2], "base64url");
  if (recue.length !== attendue.length || !crypto.timingSafeEqual(recue, attendue)) return null;
  try {
    const charge = JSON.parse(Buffer.from(morceaux[1], "base64url").toString("utf8"));
    if (typeof charge.exp !== "number" || charge.exp * 1000 <= Date.now()) return null;
    return charge;
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// Sessions (jetons de rafraîchissement rotatifs, révocables)
// ---------------------------------------------------------------------------
/** jeton de rafraîchissement → { sessionId, userId, revoqueA: number|null, remplacant } */
const rafraichissements = new Map();
/** sessionId → { userId, active } */
const sessions = new Map();

function nouveauRafraichissement(sessionId, userId) {
  const jeton = crypto.randomBytes(24).toString("base64url");
  rafraichissements.set(jeton, { sessionId, userId, revoqueA: null, remplacant: null });
  return jeton;
}

async function lireUtilisateur(client, userId) {
  const { rows } = await client.query(
    `select id, email, role, aud, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            email_confirmed_at, last_sign_in_at, banned_until, deleted_at
       from auth.users where id = $1`, [userId]);
  return rows[0] ?? null;
}
function utilisateurPublic(u) {
  return {
    id: u.id, aud: u.aud ?? "authenticated", role: u.role ?? "authenticated", email: u.email,
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
    last_sign_in_at: u.last_sign_in_at, app_metadata: u.raw_app_meta_data ?? {},
    user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: u.updated_at,
    is_anonymous: false,
  };
}
function utilisateurUtilisable(u) {
  if (!u || u.deleted_at) return false;
  if (u.banned_until && new Date(u.banned_until).getTime() > Date.now()) return false;
  return true;
}
function emettreSession(u, sessionId) {
  const maintenant = Math.floor(Date.now() / 1000);
  const exp = maintenant + dureeJeton;
  const access_token = signerJwt({
    aud: "authenticated", exp, iat: maintenant, iss: `http://${HOTE}:${PORT}/auth/v1`, sub: u.id,
    email: u.email, role: "authenticated", aal: "aal1", session_id: sessionId, is_anonymous: false,
    app_metadata: u.raw_app_meta_data ?? {}, user_metadata: u.raw_user_meta_data ?? {},
  });
  return {
    access_token, token_type: "bearer", expires_in: dureeJeton, expires_at: exp,
    refresh_token: nouveauRafraichissement(sessionId, u.id), user: utilisateurPublic(u),
  };
}

// ---------------------------------------------------------------------------
// Utilitaires HTTP
// ---------------------------------------------------------------------------
function repondre(res, statut, corps, entetes = {}) {
  if (corps === undefined || corps === null && statut === 204) { res.writeHead(statut, entetes); res.end(); return; }
  const texte = typeof corps === "string" || Buffer.isBuffer(corps) ? corps : JSON.stringify(corps);
  res.writeHead(statut, { "content-type": "application/json; charset=utf-8", ...entetes });
  res.end(texte);
}
function erreurAuth(res, statut, code, message) {
  repondre(res, statut, { code: statut, error_code: code, msg: message }, { "x-supabase-api-version": "2024-01-01" });
}
async function lireCorps(req) {
  const morceaux = [];
  for await (const m of req) morceaux.push(m);
  return Buffer.concat(morceaux);
}
async function lireJson(req) {
  const brut = await lireCorps(req);
  if (brut.length === 0) return {};
  return JSON.parse(brut.toString("utf8"));
}

/**
 * Rôle Postgres et claims de l'appelant, déduits comme PostgREST/Storage le font :
 * Bearer JWT valide → son rôle ; clé service → service_role ; clé publique → anon.
 * Un Bearer présent mais invalide ou expiré est REFUSÉ (401), jamais rétrogradé en anon.
 */
function identifierAppelant(req) {
  const autorisation = String(req.headers.authorization ?? "");
  const bearer = autorisation.toLowerCase().startsWith("bearer ") ? autorisation.slice(7).trim() : null;
  // Sans en-tête `apikey`, une clé de projet passée en Bearer en tient lieu (comme la
  // passerelle hébergée pour Storage) ; un JWT utilisateur seul reste refusé.
  const apikey = req.headers.apikey ?? ([CLE_PUBLIQUE, CLE_SERVICE].includes(bearer) ? bearer : undefined);
  if (apikey !== CLE_PUBLIQUE && apikey !== CLE_SERVICE) return { refus: "Clé API invalide" };
  if (bearer === CLE_SERVICE || (!bearer && apikey === CLE_SERVICE)) return { role: "service_role", claims: { role: "service_role" } };
  if (!bearer || bearer === CLE_PUBLIQUE) return { role: apikey === CLE_SERVICE ? "service_role" : "anon", claims: { role: apikey === CLE_SERVICE ? "service_role" : "anon" } };
  const claims = verifierJwt(bearer);
  if (!claims) return { refus: "JWT invalide ou expiré" };
  if (!["authenticated", "anon", "service_role"].includes(claims.role)) return { refus: "Rôle JWT inconnu" };
  if (claims.session_id && sessions.get(claims.session_id)?.active === false) return { refus: "Session révoquée" };
  return { role: claims.role, claims };
}

/** Exécute `travail(client)` dans une transaction sous le rôle et les claims de l'appelant. */
async function sousRole(appelant, travail) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${pg.escapeIdentifier(appelant.role)}`);
    await client.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true),
              set_config('request.jwt.claim.role', $3, true), set_config('request.jwt.claim.email', $4, true)`,
      [JSON.stringify(appelant.claims), appelant.claims.sub ?? "", appelant.role, appelant.claims.email ?? ""]);
    const resultat = await travail(client);
    await client.query("commit");
    return resultat;
  } catch (erreur) {
    await client.query("rollback").catch(() => undefined);
    throw erreur;
  } finally {
    client.release();
  }
}

/** Correspondance d'erreur PostgreSQL → HTTP, alignée sur PostgREST. */
function repondreErreurPg(res, erreur, appelant) {
  const code = erreur.code ?? "";
  let statut = 400;
  if (code === "42501") statut = appelant?.role === "anon" ? 401 : 403;
  else if (code === "23505" || code === "23503") statut = 409;
  else if (code === "42883" || code === "42P01") statut = 404;
  else if (code === "P0002") statut = 404;
  else if (/^08|^53|^57/.test(code)) statut = 503;
  repondre(res, statut, { code, message: erreur.message, details: erreur.detail ?? null, hint: erreur.hint ?? null });
}

// ---------------------------------------------------------------------------
// Auth (GoTrue, sous-ensemble)
// ---------------------------------------------------------------------------
async function routeAuth(req, res, url) {
  const route = url.pathname.slice("/auth/v1".length);
  if (req.headers.apikey !== CLE_PUBLIQUE && req.headers.apikey !== CLE_SERVICE) return erreurAuth(res, 401, "no_api_key", "Invalid API key");

  if (route === "/token" && req.method === "POST") {
    const corps = await lireJson(req);
    const type = url.searchParams.get("grant_type");
    if (type === "password") {
      const email = String(corps.email ?? "").trim().toLowerCase();
      const { rows } = await poolAdmin.query(
        `select id from auth.users where lower(email) = $1 and encrypted_password is not null
           and encrypted_password = extensions.crypt($2, encrypted_password)`, [email, String(corps.password ?? "")]);
      const u = rows[0] ? await lireUtilisateur(poolAdmin, rows[0].id) : null;
      if (!utilisateurUtilisable(u)) {
        consigner({ type: "connexion_refusee" });
        return erreurAuth(res, 400, "invalid_credentials", "Invalid login credentials");
      }
      await poolAdmin.query("update auth.users set last_sign_in_at = now() where id = $1", [u.id]);
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, { userId: u.id, active: true });
      consigner({ type: "connexion", userId: u.id, sessionId });
      return repondre(res, 200, emettreSession(u, sessionId));
    }
    if (type === "refresh_token") {
      const ancien = String(corps.refresh_token ?? "");
      const entree = rafraichissements.get(ancien);
      const session = entree ? sessions.get(entree.sessionId) : null;
      if (!entree || !session?.active) {
        consigner({ type: "rafraichissement_refuse", motif: "inconnu_ou_revoque" });
        return erreurAuth(res, 400, "refresh_token_not_found", "Invalid Refresh Token: Refresh Token Not Found");
      }
      if (entree.revoqueA !== null && Date.now() - entree.revoqueA > FENETRE_REUTILISATION_MS) {
        // Réutilisation hors fenêtre : GoTrue révoque toute la session (détection de vol).
        session.active = false;
        consigner({ type: "rafraichissement_refuse", motif: "reutilisation", userId: entree.userId, sessionId: entree.sessionId });
        return erreurAuth(res, 400, "refresh_token_already_used", "Invalid Refresh Token: Already Used");
      }
      const u = await lireUtilisateur(poolAdmin, entree.userId);
      if (!utilisateurUtilisable(u)) return erreurAuth(res, 400, "user_not_found", "User not found");
      const session2 = emettreSession(u, entree.sessionId);
      if (entree.revoqueA === null) { entree.revoqueA = Date.now(); entree.remplacant = session2.refresh_token; }
      consigner({ type: "rafraichissement", userId: u.id, sessionId: entree.sessionId });
      return repondre(res, 200, session2);
    }
    return erreurAuth(res, 400, "unsupported_grant_type", "Unsupported grant type");
  }

  if (route === "/user" && req.method === "GET") {
    const appelant = identifierAppelant(req);
    if (appelant.refus || !appelant.claims?.sub) return erreurAuth(res, 403, "bad_jwt", appelant.refus ?? "invalid claim: missing sub claim");
    const u = await lireUtilisateur(poolAdmin, appelant.claims.sub);
    if (!utilisateurUtilisable(u)) return erreurAuth(res, 403, "user_not_found", "User from sub claim in JWT does not exist");
    return repondre(res, 200, utilisateurPublic(u));
  }

  if (route === "/logout" && req.method === "POST") {
    const appelant = identifierAppelant(req);
    if (!appelant.refus && appelant.claims?.session_id) {
      const portee = url.searchParams.get("scope") ?? "global";
      for (const [id, s] of sessions) {
        if (portee === "global" ? s.userId === appelant.claims.sub : id === appelant.claims.session_id) s.active = false;
      }
      consigner({ type: "deconnexion", userId: appelant.claims.sub, portee });
    }
    return repondre(res, 204);
  }

  if (route === "/recover" && req.method === "POST") {
    // Aucune messagerie en recette : réponse neutre identique pour toute adresse (anti-énumération).
    await lireJson(req);
    consigner({ type: "recuperation_demandee" });
    return repondre(res, 200, {});
  }

  return erreurAuth(res, 501, "not_implemented", `Passerelle de recette : ${req.method} /auth/v1${route} non servi`);
}

// ---------------------------------------------------------------------------
// REST (PostgREST, sous-ensemble)
// ---------------------------------------------------------------------------
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (nom) => {
  if (!IDENT.test(nom)) throw Object.assign(new Error(`Identifiant refusé : ${nom}`), { code: "PGRST100", statut: 400 });
  return pg.escapeIdentifier(nom);
};

/** Découpe au premier niveau (hors parenthèses) : "a,b(c,d),e" → ["a","b(c,d)","e"]. */
function decouper(texte, separateur = ",") {
  const parts = []; let profondeur = 0; let courant = "";
  for (const c of texte) {
    if (c === "(") profondeur++;
    if (c === ")") profondeur--;
    if (c === separateur && profondeur === 0) { parts.push(courant); courant = ""; } else courant += c;
  }
  if (courant.trim() !== "") parts.push(courant);
  return parts.map((p) => p.trim()).filter(Boolean);
}

async function relationFk(client, source, cible, contrainte = null) {
  const { rows } = await client.query(
    `select c.conrelid::regclass::text as de, c.confrelid::regclass::text as vers,
            (select array_agg(a.attname order by k.n) from unnest(c.conkey) with ordinality k(att,n)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att)::text[] as cols_de,
            (select array_agg(a.attname order by k.n) from unnest(c.confkey) with ordinality k(att,n)
               join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att)::text[] as cols_vers
       from pg_constraint c
      where c.contype = 'f'
        and ((c.conrelid = $1::regclass and c.confrelid = $2::regclass)
          or (c.conrelid = $2::regclass and c.confrelid = $1::regclass))
        and ($3::text is null or c.conname = $3)`,
    [`public.${source}`, `public.${cible}`, contrainte]);
  if (rows.length !== 1) throw Object.assign(new Error(`Relation ambiguë ou absente entre ${source} et ${cible}`), { code: "PGRST200", statut: 400 });
  const r = rows[0];
  const versUn = r.de === source || r.de === `public.${source}`;
  return { versUn, colsSource: versUn ? r.cols_de : r.cols_vers, colsCible: versUn ? r.cols_vers : r.cols_de };
}

/** Construit la liste SELECT, avec ressources embarquées (FK) sous le même rôle. */
async function listeSelection(client, table, alias, selection) {
  const morceaux = [];
  for (const element of decouper(selection || "*")) {
    // `cible!contrainte(...)` désigne la clé étrangère quand deux relations existent
    // (PostgREST : « disambiguation ») ; `!inner` reste accepté comme avant.
    const embarque = element.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)(?:!([a-z_][a-z0-9_]*))?\((.*)\)$/s);
    if (embarque) {
      const [, etiquette, cible, indice, sousSelection] = embarque;
      const rel = await relationFk(client, table, cible, indice && indice !== "inner" ? indice : null);
      const a2 = `${alias}_${cible}`;
      const interne = await listeSelection(client, cible, a2, sousSelection);
      const jointure = rel.colsSource.map((c, i) => `${a2}.${ident(rel.colsCible[i])} = ${alias}.${ident(c)}`).join(" and ");
      const sous = rel.versUn
        ? `(select row_to_json(x) from (select ${interne} from public.${ident(cible)} ${a2} where ${jointure}) x)`
        : `(select coalesce(json_agg(row_to_json(x)), '[]'::json) from (select ${interne} from public.${ident(cible)} ${a2} where ${jointure}) x)`;
      morceaux.push(`${sous} as ${ident(etiquette ?? cible)}`);
    } else if (element === "*") {
      morceaux.push(`${alias}.*`);
    } else {
      const m = element.match(/^(?:([a-z_][a-z0-9_]*):)?([a-z_][a-z0-9_]*)$/);
      if (!m) throw Object.assign(new Error(`Sélection non prise en charge : ${element}`), { code: "PGRST100", statut: 400 });
      morceaux.push(`${alias}.${ident(m[2])}${m[1] ? ` as ${ident(m[1])}` : ""}`);
    }
  }
  return morceaux.join(", ");
}

const OPERATEURS = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "ilike" };
const PARAMETRES_RESERVES = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

/** Filtres PostgREST → clause WHERE paramétrée. */
function clauseFiltres(params, alias, valeurs) {
  const clauses = [];
  for (const [colonne, brut] of params) {
    if (PARAMETRES_RESERVES.has(colonne)) continue;
    let expression = brut; let negation = false;
    if (expression.startsWith("not.")) { negation = true; expression = expression.slice(4); }
    const point = expression.indexOf(".");
    const op = expression.slice(0, point); const valeur = expression.slice(point + 1);
    const col = `${alias}.${ident(colonne)}`;
    let sql;
    if (op in OPERATEURS) {
      valeurs.push(op === "like" || op === "ilike" ? valeur.replaceAll("*", "%") : valeur);
      sql = `${col} ${OPERATEURS[op]} $${valeurs.length}`;
    } else if (op === "is") {
      if (!["null", "true", "false", "unknown"].includes(valeur)) throw Object.assign(new Error(`is.${valeur} invalide`), { code: "PGRST100", statut: 400 });
      sql = `${col} is ${valeur}`;
    } else if (op === "in") {
      const liste = valeur.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      valeurs.push(liste);
      sql = `${col}::text = any($${valeurs.length}::text[])`;
    } else {
      throw Object.assign(new Error(`Opérateur non pris en charge : ${op}`), { code: "PGRST100", statut: 400 });
    }
    clauses.push(negation ? `not (${sql})` : sql);
  }
  return clauses.length ? `where ${clauses.join(" and ")}` : "";
}

function clauseOrdre(ordre, alias) {
  if (!ordre) return "";
  return "order by " + ordre.split(",").map((terme) => {
    const [col, ...mods] = terme.split(".");
    const sens = mods.includes("desc") ? "desc" : "asc";
    const nuls = mods.includes("nullsfirst") ? " nulls first" : mods.includes("nullslast") ? " nulls last" : "";
    return `${alias}.${ident(col)} ${sens}${nuls}`;
  }).join(", ");
}

async function routeRest(req, res, url, appelant) {
  const segments = url.pathname.slice("/rest/v1/".length).split("/");
  const prefer = String(req.headers.prefer ?? "");

  if (segments[0] === "rpc" && segments[1]) {
    const fonction = segments[1];
    const args = req.method === "POST" ? await lireJson(req) : Object.fromEntries(url.searchParams);
    return sousRole(appelant, async (client) => {
      const { rows: defs } = await client.query(
        `select p.oid, p.proretset, t.typtype, t.typname, p.prorettype::regtype::text as retour,
                coalesce(p.proargnames, '{}')::text[] as noms, coalesce(p.proargmodes::text[], '{}') as modes,
                coalesce((select array_agg(format_type(x, null) order by n) from unnest(p.proargtypes) with ordinality u(x, n)), '{}')::text[] as types
           from pg_proc p join pg_type t on t.oid = p.prorettype
          where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [fonction]);
      if (defs.length === 0) throw Object.assign(new Error(`Could not find the function public.${fonction}`), { code: "PGRST202", statut: 404 });
      const noms = Object.keys(args);
      const def = defs.find((d) => noms.every((n) => d.noms.includes(n))) ?? defs[0];
      const entrees = def.noms.filter((_, i) => !def.modes[i] || ["i", "b", "v"].includes(def.modes[i]));
      const valeurs = []; const appels = [];
      for (const nom of noms) {
        const i = entrees.indexOf(nom);
        if (i < 0) throw Object.assign(new Error(`Paramètre inconnu ${nom} pour ${fonction}`), { code: "PGRST202", statut: 404 });
        const type = def.types[i];
        const v = args[nom];
        valeurs.push(v === null ? null : type.endsWith("[]") || type === "jsonb" || type === "json" ? (type.startsWith("json") ? JSON.stringify(v) : v) : String(v));
        appels.push(`${ident(nom)} => $${valeurs.length}::${type}`);
      }
      const appel = `public.${ident(fonction)}(${appels.join(", ")})`;
      let corps;
      if (def.proretset || def.typtype === "c") {
        // `.range()` de supabase-js : `limit`/`offset` en paramètres d'URL (ou en-tête Range),
        // appliqués au résultat d'une fonction ensembliste comme le fait PostgREST.
        let pagination = "";
        if (def.proretset) {
          let limite = url.searchParams.get("limit"); let decalage = url.searchParams.get("offset");
          const plage = String(req.headers.range ?? "").match(/^(\d+)-(\d+)$/);
          if (plage) { decalage = plage[1]; limite = String(Number(plage[2]) - Number(plage[1]) + 1); }
          if (limite !== null) pagination += ` limit ${Number(limite)}`;
          if (decalage !== null) pagination += ` offset ${Number(decalage)}`;
        }
        const { rows } = await client.query(`select coalesce(json_agg(r), '[]'::json) as j from (select * from ${appel}${pagination}) r`, valeurs);
        corps = def.proretset ? rows[0].j : (rows[0].j[0] ?? null);
      } else if (def.retour === "void") {
        await client.query(`select ${appel}`, valeurs); corps = null;
      } else {
        const { rows } = await client.query(`select to_json(${appel}) as j`, valeurs); corps = rows[0].j;
      }
      return corps;
      // Un scalaire texte (uuid, text) doit partir ENCODÉ en JSON, comme PostgREST : `repondre`
  // enverrait une chaîne brute, illisible pour supabase-js.
  }).then((corps) => (corps === null ? repondre(res, 204) : repondre(res, 200, typeof corps === "string" ? JSON.stringify(corps) : corps)));
  }

  const table = segments[0];
  ident(table);
  const alias = "t";
  if (req.method === "GET" || req.method === "HEAD") {
    return sousRole(appelant, async (client) => {
      const valeurs = [];
      const where = clauseFiltres(url.searchParams, alias, valeurs);
      const selection = await listeSelection(client, table, alias, url.searchParams.get("select") ?? "*");
      let limite = url.searchParams.get("limit"); let decalage = url.searchParams.get("offset") ?? "0";
      const plage = String(req.headers.range ?? "").match(/^(\d+)-(\d+)$/);
      if (plage) { decalage = plage[1]; limite = String(Number(plage[2]) - Number(plage[1]) + 1); }
      const pagination = `${limite !== null ? `limit ${Number(limite)}` : ""} offset ${Number(decalage)}`;
      const { rows } = await client.query(
        `select coalesce(json_agg(r), '[]'::json) as j from (select ${selection} from public.${ident(table)} ${alias} ${where} ${clauseOrdre(url.searchParams.get("order"), alias)} ${pagination}) r`, valeurs);
      let total = "*";
      if (/count=exact/.test(prefer)) {
        const { rows: c } = await client.query(`select count(*)::int as n from public.${ident(table)} ${alias} ${where}`, valeurs);
        total = String(c[0].n);
      }
      return { lignes: rows[0].j, total, decalage: Number(decalage) };
    }).then(({ lignes, total, decalage }) => {
      const fin = lignes.length ? `${decalage}-${decalage + lignes.length - 1}` : "*";
      const entetes = { "content-range": `${fin}/${total}` };
      if (String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json")) {
        if (lignes.length !== 1) return repondre(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${lignes.length} rows`, hint: null });
        return repondre(res, 200, lignes[0], entetes);
      }
      if (req.method === "HEAD") { res.writeHead(200, entetes); return res.end(); }
      return repondre(res, 200, lignes, entetes);
    });
  }

  if (req.method === "POST") {
    const corps = await lireJson(req);
    const lignes = Array.isArray(corps) ? corps : [corps];
    return sousRole(appelant, async (client) => {
      const resultats = [];
      for (const ligne of lignes) {
        const colonnes = Object.keys(ligne);
        colonnes.forEach(ident);
        const valeurs = colonnes.map((c) => (ligne[c] !== null && typeof ligne[c] === "object" ? JSON.stringify(ligne[c]) : ligne[c]));
        const selection = /return=representation/.test(prefer) ? await listeSelection(client, table, "r", url.searchParams.get("select") ?? "*") : null;
        const insertion = `insert into public.${ident(table)} (${colonnes.map(ident).join(", ")})
          values (${colonnes.map((_, i) => `$${i + 1}`).join(", ")}) returning *`;
        if (selection) {
          const { rows } = await client.query(`with r as (${insertion}) select row_to_json(x) as j from (select ${selection} from r) x`, valeurs);
          resultats.push(rows[0].j);
        } else await client.query(insertion, valeurs);
      }
      return resultats;
    }).then((resultats) => {
      if (!/return=representation/.test(prefer)) return repondre(res, 201, undefined);
      if (String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json")) return repondre(res, 201, resultats[0]);
      return repondre(res, 201, resultats);
    });
  }

  if (req.method === "PATCH") {
    // Mise à jour filtrée, sous le rôle de l'appelant : la policy `using`/`with check`
    // et les triggers de la base décident ; 0 ligne visible = 0 ligne modifiée.
    const corps = await lireJson(req);
    const colonnes = Object.keys(corps);
    colonnes.forEach(ident);
    return sousRole(appelant, async (client) => {
      const valeurs = colonnes.map((c) => (corps[c] !== null && typeof corps[c] === "object" ? JSON.stringify(corps[c]) : corps[c]));
      const where = clauseFiltres(url.searchParams, alias, valeurs);
      const { rows } = await client.query(
        `update public.${ident(table)} ${alias} set ${colonnes.map((c, i) => `${ident(c)} = $${i + 1}`).join(", ")} ${where} returning row_to_json(${alias}.*) as j`,
        valeurs);
      return rows.map((r) => r.j);
    }).then((lignes) => {
      if (!/return=representation/.test(prefer)) return repondre(res, 204);
      if (String(req.headers.accept ?? "").includes("application/vnd.pgrst.object+json")) {
        if (lignes.length !== 1) return repondre(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
        return repondre(res, 200, lignes[0]);
      }
      return repondre(res, 200, lignes);
    });
  }

  return repondre(res, 501, { code: "PGRST501", message: `Passerelle de recette : ${req.method} /rest/v1/${table} non servi` });
}

// ---------------------------------------------------------------------------
// Storage (sous-ensemble)
// ---------------------------------------------------------------------------
const cheminFichier = (bucket, nom) => {
  const cible = path.resolve(DOSSIER_STOCKAGE, bucket, nom);
  if (!cible.startsWith(path.resolve(DOSSIER_STOCKAGE) + path.sep)) throw Object.assign(new Error("Chemin refusé"), { statut: 400 });
  return cible;
};
function repondreErreurStockage(res, statut, erreur, message) {
  repondre(res, statut, { statusCode: String(statut), error: erreur, message });
}

/** Partie « fichier » d'un corps multipart/form-data (la première qui porte un Content-Type). */
function extraireFichierMultipart(corps, enteteType) {
  const limite = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(enteteType);
  if (!limite) return null;
  const separateur = Buffer.from(`--${limite[1] ?? limite[2]}`);
  let debut = corps.indexOf(separateur);
  while (debut !== -1) {
    const suivant = corps.indexOf(separateur, debut + separateur.length);
    if (suivant === -1) break;
    const bloc = corps.subarray(debut + separateur.length + 2, suivant - 2); // \r\n de part et d'autre
    const finEntetes = bloc.indexOf("\r\n\r\n");
    if (finEntetes !== -1) {
      const entetes = bloc.subarray(0, finEntetes).toString("utf8");
      const typePartie = /content-type:\s*([^\r\n;]+)/i.exec(entetes);
      if (typePartie) return { type: typePartie[1].trim(), octets: bloc.subarray(finEntetes + 4) };
    }
    debut = suivant;
  }
  return null;
}

async function routeStockage(req, res, url, appelant) {
  const route = decodeURIComponent(url.pathname.slice("/storage/v1".length));

  // Téléchargement par URL signée : aucun en-tête d'authentification, seul le jeton fait foi.
  const signe = route.match(/^\/(?:object|render\/image)\/sign\/([^/]+)\/(.+)$/);
  if (signe && req.method === "GET") {
    const [, bucket, nom] = signe;
    const charge = verifierJwt(url.searchParams.get("token"));
    if (!charge || charge.url !== `${bucket}/${nom}`) return repondreErreurStockage(res, 400, "InvalidSignature", "Signature invalide ou expirée");
    const fichier = cheminFichier(bucket, nom);
    if (!fs.existsSync(fichier)) return repondreErreurStockage(res, 404, "not_found", "Object not found");
    const { rows } = await poolAdmin.query("select metadata from storage.objects where bucket_id = $1 and name = $2", [bucket, nom]);
    consigner({ type: "stockage_telechargement", bucket, nom });
    res.writeHead(200, { "content-type": rows[0]?.metadata?.mimetype ?? "application/octet-stream", "cache-control": "private, max-age=60" });
    return fs.createReadStream(fichier).pipe(res);
  }

  if (appelant.refus) return repondreErreurStockage(res, 400, "InvalidJWT", appelant.refus);

  // Signature groupée (`createSignedUrls`) : même contrôle, objet par objet, sous RLS.
  const groupe = route.match(/^\/object\/sign\/([^/]+)\/?$/);
  if (groupe && req.method === "POST") {
    const [, bucket] = groupe;
    const corps = await lireJson(req);
    const chemins = Array.isArray(corps.paths) ? corps.paths.map(String) : [];
    const visibles = await sousRole(appelant, async (client) => {
      const { rows } = await client.query("select name from storage.objects where bucket_id = $1 and name = any($2::text[])", [bucket, chemins]);
      return new Set(rows.map((r) => r.name));
    });
    const exp = Math.floor(Date.now() / 1000) + Number(corps.expiresIn ?? 60);
    const resultat = chemins.map((nom) => {
      if (!visibles.has(nom)) { consigner({ type: "stockage_signature_refusee", bucket, nom, role: appelant.role }); return { path: nom, signedURL: null, error: "Object not found" }; }
      consigner({ type: "stockage_signature", bucket, nom });
      const jeton = signerJwt({ url: `${bucket}/${nom}`, exp, iat: Math.floor(Date.now() / 1000) });
      return { path: nom, signedURL: `/object/sign/${bucket}/${nom}?token=${jeton}`, error: null };
    });
    return repondre(res, 200, resultat);
  }

  const signature = route.match(/^\/object\/sign\/([^/]+)\/(.+)$/);
  if (signature && req.method === "POST") {
    const [, bucket, nom] = signature;
    const corps = await lireJson(req);
    const visible = await sousRole(appelant, async (client) => {
      const { rows } = await client.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, nom]);
      return rows.length === 1;
    });
    if (!visible) { consigner({ type: "stockage_signature_refusee", bucket, nom, role: appelant.role }); return repondreErreurStockage(res, 400, "not_found", "Object not found"); }
    const exp = Math.floor(Date.now() / 1000) + Number(corps.expiresIn ?? 60);
    const jeton = signerJwt({ url: `${bucket}/${nom}`, exp, iat: Math.floor(Date.now() / 1000) });
    const base = corps.transform ? "/render/image/sign" : "/object/sign";
    consigner({ type: "stockage_signature", bucket, nom });
    return repondre(res, 200, { signedURL: `${base}/${bucket}/${nom}?token=${jeton}` });
  }

  const suppression = route.match(/^\/object\/([^/]+)\/?$/);
  if (suppression && req.method === "DELETE") {
    const [, bucket] = suppression;
    const { prefixes = [] } = await lireJson(req);
    const supprimes = await sousRole(appelant, async (client) => {
      const { rows } = await client.query("delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning name, id", [bucket, prefixes]);
      return rows;
    });
    for (const { name } of supprimes) fs.rmSync(cheminFichier(bucket, name), { force: true });
    consigner({ type: "stockage_suppression", bucket, noms: supprimes.map((s) => s.name), role: appelant.role });
    return repondre(res, 200, supprimes.map((s) => ({ name: s.name, id: s.id, bucket_id: bucket })));
  }

  const televersement = route.match(/^\/object\/([^/]+)\/(.+)$/);
  if (televersement && (req.method === "POST" || req.method === "PUT")) {
    const [, bucket, nom] = televersement;
    let contenu = await lireCorps(req);
    let type = String(req.headers["content-type"] ?? "application/octet-stream").split(";")[0];
    // storage-js envoie un `File`/`Blob` en multipart/form-data (champ fichier + cacheControl) :
    // on en extrait la partie fichier, son type et ses octets, comme storage-api.
    if (type === "multipart/form-data") {
      const partie = extraireFichierMultipart(contenu, String(req.headers["content-type"]));
      if (!partie) return repondreErreurStockage(res, 400, "invalid_request", "Multipart sans fichier");
      contenu = partie.octets; type = partie.type;
    }
    const upsert = String(req.headers["x-upsert"] ?? "false") === "true" || req.method === "PUT";
    const { rows: seaux } = await poolAdmin.query("select file_size_limit, allowed_mime_types from storage.buckets where id = $1", [bucket]);
    if (!seaux[0]) return repondreErreurStockage(res, 404, "Bucket not found", "Bucket not found");
    if (seaux[0].file_size_limit && contenu.length > Number(seaux[0].file_size_limit)) return repondreErreurStockage(res, 413, "Payload too large", "The object exceeded the maximum allowed size");
    if (seaux[0].allowed_mime_types?.length && !seaux[0].allowed_mime_types.includes(type)) return repondreErreurStockage(res, 415, "invalid_mime_type", `mime type ${type} is not supported`);
    let ligne;
    try {
      ligne = await sousRole(appelant, async (client) => {
        const metadata = JSON.stringify({ mimetype: type, size: contenu.length, cacheControl: req.headers["cache-control"] ?? null });
        const sql = upsert
          ? `insert into storage.objects(bucket_id, name, owner, metadata) values ($1, $2, $3, $4::jsonb)
               on conflict do nothing returning id`
          : `insert into storage.objects(bucket_id, name, owner, metadata) values ($1, $2, $3, $4::jsonb) returning id`;
        const { rows: existe } = await client.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, nom]);
        if (existe.length && !upsert) throw Object.assign(new Error("The resource already exists"), { code: "23505" });
        const { rows } = await client.query(sql, [bucket, nom, appelant.claims.sub ?? null, metadata]);
        return rows[0];
      });
    } catch (erreur) {
      consigner({ type: "stockage_televersement_refuse", bucket, nom, role: appelant.role, code: erreur.code });
      if (erreur.code === "23505") return repondreErreurStockage(res, 409, "Duplicate", "The resource already exists");
      if (erreur.code === "42501") return repondreErreurStockage(res, 403, "Unauthorized", "new row violates row-level security policy");
      throw erreur;
    }
    const fichier = cheminFichier(bucket, nom);
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    fs.writeFileSync(fichier, contenu);
    consigner({ type: "stockage_televersement", bucket, nom, role: appelant.role, octets: contenu.length });
    return repondre(res, 200, { Id: ligne?.id, Key: `${bucket}/${nom}` });
  }

  return repondreErreurStockage(res, 501, "not_implemented", `Passerelle de recette : ${req.method} /storage/v1${route} non servi`);
}

// ---------------------------------------------------------------------------
// Serveur
// ---------------------------------------------------------------------------
const serveur = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? `${HOTE}:${PORT}`}`);
  try {
    if (url.pathname === "/__recette/sante") return repondre(res, 200, { ok: true });
    if (url.pathname === "/__recette/journal" && req.method === "GET") return repondre(res, 200, journal);
    if (url.pathname === "/__recette/duree-jeton" && req.method === "POST") {
      const { secondes } = await lireJson(req);
      dureeJeton = Math.max(1, Number(secondes) || 3600);
      return repondre(res, 200, { secondes: dureeJeton });
    }
    if (url.pathname.startsWith("/auth/v1/")) return await routeAuth(req, res, url);
    if (url.pathname.startsWith("/rest/v1/")) {
      const appelant = identifierAppelant(req);
      if (appelant.refus) return repondre(res, 401, { code: "PGRST301", message: appelant.refus, details: null, hint: null });
      try { return await routeRest(req, res, url, appelant); }
      catch (erreur) {
        if (erreur.statut) return repondre(res, erreur.statut, { code: erreur.code, message: erreur.message, details: null, hint: null });
        return repondreErreurPg(res, erreur, appelant);
      }
    }
    if (url.pathname.startsWith("/storage/v1/")) return await routeStockage(req, res, url, identifierAppelant(req));
    return repondre(res, 404, { message: "Route inconnue de la passerelle de recette" });
  } catch (erreur) {
    console.error("[passerelle]", req.method, url.pathname, erreur);
    if (!res.headersSent) repondre(res, 500, { message: "Erreur interne de la passerelle", code: erreur.code ?? null });
  }
});

serveur.listen(PORT, HOTE, () => console.log(`[passerelle] prête sur http://${HOTE}:${PORT} (jetons ${dureeJeton}s)`));
