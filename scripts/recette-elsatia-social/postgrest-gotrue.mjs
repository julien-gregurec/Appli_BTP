// Recette HTTP d'ELSATIA Social sur une pile locale RÉELLE : GoTrue (compilé depuis
// github.com/supabase/auth), PostgREST (binaire officiel) et PostgreSQL 16 portant
// tout le train canonique + la migration Social. Aucun appel à Meta ni LinkedIn.
//
// Prérequis : scripts/local-postgres-bootstrap/gotrue_pilot_bootstrap.sh <base>
// (GoTrue :9999), PostgREST :3001 configuré sur la même base et le même secret JWT.
//
//   RECETTE_DB=social_http GOTRUE_JWT_SECRET=$(cat /tmp/gotrue-build/jwt_secret.txt) \
//     node scripts/recette-elsatia-social/postgrest-gotrue.mjs
//
// Les sessions AAL2 sont obtenues par un vrai enrôlement TOTP GoTrue (aucun claim
// fabriqué) ; seuls les jetons anon/service_role sont signés localement, exactement
// comme les clés d'API d'un projet Supabase.
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

const AUTH = process.env.GOTRUE_URL ?? "http://localhost:9999";
const REST = process.env.POSTGREST_URL ?? "http://localhost:3001";
const DB = process.env.RECETTE_DB ?? "social_http";
const SECRET = process.env.GOTRUE_JWT_SECRET;
if (!SECRET) throw new Error("GOTRUE_JWT_SECRET requis");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function signer(claims) {
  const tete = b64({ alg: "HS256", typ: "JWT" });
  const corps = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  return `${tete}.${corps}.${createHmac("sha256", SECRET).update(`${tete}.${corps}`).digest("base64url")}`;
}
const ANON = signer({ role: "anon", iss: "supabase" });
const SERVICE = signer({ role: "service_role", iss: "supabase" });

function sql(requete) {
  return execFileSync("su", ["postgres", "-c", `psql -X -At -v ON_ERROR_STOP=1 -d ${DB}`], { input: requete }).toString().trim();
}

function totp(secretBase32, t = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const cle = Buffer.from(bits.match(/.{8}/g).map((o) => parseInt(o, 2)));
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)));
  const h = createHmac("sha1", cle).update(compteur).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function http(url, { methode = "GET", jeton, corps, entetes = {} } = {}) {
  const r = await fetch(url, {
    method: methode,
    headers: { apikey: ANON, "content-type": "application/json", ...(jeton ? { authorization: `Bearer ${jeton}` } : {}), ...entetes },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = texte; }
  return { statut: r.status, json };
}

const resultats = [];
function verifier(libelle, condition, detail = "") {
  resultats.push({ libelle, ok: Boolean(condition) });
  console.log(`${condition ? "✓" : "✕"} ${libelle}${condition ? "" : ` — ${detail}`}`);
}

async function utilisateur(email) {
  const cree = await http(`${AUTH}/admin/users`, { methode: "POST", jeton: SERVICE, corps: { email, password: "Recette-Social-2026!", email_confirm: true } });
  if (cree.statut >= 300) throw new Error(`création ${email} : ${JSON.stringify(cree.json)}`);
  const s = await http(`${AUTH}/token?grant_type=password`, { methode: "POST", corps: { email, password: "Recette-Social-2026!" } });
  return { id: cree.json.id, email, aal1: s.json.access_token };
}

async function aal2(u) {
  const f = await http(`${AUTH}/factors`, { methode: "POST", jeton: u.aal1, corps: { factor_type: "totp", friendly_name: `recette-${randomUUID().slice(0, 6)}` } });
  if (f.statut >= 300) throw new Error(`enrôlement TOTP : ${JSON.stringify(f.json)}`);
  const c = await http(`${AUTH}/factors/${f.json.id}/challenge`, { methode: "POST", jeton: u.aal1, corps: {} });
  const v = await http(`${AUTH}/factors/${f.json.id}/verify`, { methode: "POST", jeton: u.aal1, corps: { challenge_id: c.json.id, code: totp(f.json.totp.secret) } });
  if (v.statut >= 300) throw new Error(`vérification TOTP : ${JSON.stringify(v.json)}`);
  return v.json.access_token;
}

const suffixe = randomUUID().slice(0, 8);
const admin = await utilisateur(`social-admin-${suffixe}@elsatia.test`);
const validateur = await utilisateur(`social-validateur-${suffixe}@elsatia.test`);
const client = await utilisateur(`client-${suffixe}@elsatia.test`);

// Provisioning canonique (équivalent de plateforme_ajouter/rattacher/activer_admin).
sql(`insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at) values
  ('${admin.email}', 'total', '${admin.id}', true, 'active', now()),
  ('${validateur.email}', 'support', '${validateur.id}', true, 'active', now());`);

admin.aal2 = await aal2(admin);
validateur.aal2 = await aal2(validateur);
client.aal2 = await aal2(client);
const claim = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).aal;
verifier("GoTrue : session mot de passe = aal1, après TOTP = aal2 (jetons réels)", claim(admin.aal1) === "aal1" && claim(admin.aal2) === "aal2");

// ─── Anonyme ───
let r = await http(`${REST}/social_publications?select=id`, { jeton: ANON });
verifier("anon : publications refusées (PostgREST)", r.statut === 401 || r.statut === 403, `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/rpc/social_session_courante`, { methode: "POST", jeton: ANON, corps: {} });
verifier("anon : RPC de session refusée", r.statut === 401 || r.statut === 403, `${r.statut}`);

// ─── Session et AAL ───
r = await http(`${REST}/rpc/social_session_courante`, { methode: "POST", jeton: admin.aal1, corps: {} });
verifier("admin aal1 : rôle Administrateur résolu par UID, aal2 = false", r.json?.[0]?.role === "administrateur" && r.json?.[0]?.aal2 === false, JSON.stringify(r.json));
r = await http(`${REST}/rpc/social_session_courante`, { methode: "POST", jeton: admin.aal2, corps: {} });
verifier("admin aal2 : aal2 = true lu dans le JWT vérifié", r.json?.[0]?.aal2 === true, JSON.stringify(r.json));
r = await http(`${REST}/rpc/social_session_courante`, { methode: "POST", jeton: client.aal2, corps: {} });
verifier("client hors plateforme : aucune session Social", Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json));

// ─── Rôles (AAL2 en base) ───
r = await http(`${REST}/rpc/social_definir_role`, { methode: "POST", jeton: admin.aal1, corps: { p_utilisateur_id: validateur.id, p_role: "validateur" } });
verifier("rôle : refusé en aal1", r.statut >= 400 && /AAL2/.test(JSON.stringify(r.json)), `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/rpc/social_definir_role`, { methode: "POST", jeton: client.aal2, corps: { p_utilisateur_id: client.id, p_role: "administrateur" } });
verifier("rôle : client authentifié aal2 ne peut pas s'élever", r.statut >= 400, `${r.statut}`);
r = await http(`${REST}/rpc/social_definir_role`, { methode: "POST", jeton: admin.aal2, corps: { p_utilisateur_id: validateur.id, p_role: "validateur" } });
verifier("rôle : administrateur aal2 nomme un Validateur", r.statut === 204 || r.statut === 200, `${r.statut} ${JSON.stringify(r.json)}`);

// ─── service_role : écritures serveur ───
const pubId = randomUUID();
r = await http(`${REST}/social_publications`, { methode: "POST", jeton: SERVICE, corps: { id: pubId, titre: "Recette HTTP", contenu_principal: "Texte", reseaux: ["facebook"], cree_par: admin.email, cree_par_id: admin.id }, entetes: { prefer: "return=minimal" } });
verifier("service_role : crée une publication (brouillon)", r.statut === 201, `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/social_publications?id=eq.${pubId}`, { methode: "PATCH", jeton: SERVICE, corps: { statut: "a_valider", soumis_at: new Date().toISOString() } });
verifier("service_role : soumet à validation", r.statut === 204, `${r.statut}`);
r = await http(`${REST}/social_publications?id=eq.${pubId}`, { methode: "PATCH", jeton: SERVICE, corps: { statut: "valide", approuve_par_id: admin.id, approuve_at: new Date().toISOString(), empreinte_validee: "a".repeat(64) } });
verifier("service_role : ne peut PAS poser une validation", r.statut >= 400 && /personne qui valide/.test(JSON.stringify(r.json)), `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/social_publications`, { methode: "POST", jeton: admin.aal2, corps: { titre: "Direct", cree_par: "x" } });
verifier("authenticated aal2 : aucune écriture directe", r.statut === 401 || r.statut === 403, `${r.statut}`);

// ─── Validation (AAL2 en base) ───
r = await http(`${REST}/rpc/social_valider_publication`, { methode: "POST", jeton: validateur.aal1, corps: { p_publication_id: pubId, p_empreinte: "b".repeat(64), p_commentaire: null } });
verifier("validation : refusée en aal1", r.statut >= 400 && /AAL2/.test(JSON.stringify(r.json)), `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/rpc/social_valider_publication`, { methode: "POST", jeton: SERVICE, corps: { p_publication_id: pubId, p_empreinte: "b".repeat(64), p_commentaire: null } });
verifier("validation : RPC refusée au service_role", r.statut >= 400, `${r.statut}`);
r = await http(`${REST}/rpc/social_valider_publication`, { methode: "POST", jeton: validateur.aal2, corps: { p_publication_id: pubId, p_empreinte: "b".repeat(64), p_commentaire: "Recette" } });
verifier("validation : Validateur aal2 autorisé", r.statut === 204 || r.statut === 200, `${r.statut} ${JSON.stringify(r.json)}`);
r = await http(`${REST}/social_publications?id=eq.${pubId}&select=statut,approuve_par_id,approuve_par`, { jeton: admin.aal2 });
verifier("lecture authentifiée : statut validé, UID et email de la personne qui valide", r.json?.[0]?.statut === "valide" && r.json?.[0]?.approuve_par_id === validateur.id && r.json?.[0]?.approuve_par === validateur.email, JSON.stringify(r.json));
r = await http(`${REST}/social_publications?select=id`, { jeton: client.aal2 });
verifier("client authentifié : RLS ne renvoie aucune publication", Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json));

// ─── Jetons, verrou, quotas, journal ───
r = await http(`${REST}/social_identifiants?select=compte_id`, { jeton: admin.aal2 });
verifier("authenticated : jetons chiffrés inaccessibles", r.statut === 401 || r.statut === 403, `${r.statut}`);
r = await http(`${REST}/social_identifiants?select=compte_id`, { jeton: SERVICE });
verifier("service_role : jetons chiffrés lisibles par le serveur", r.statut === 200, `${r.statut}`);
const cibleId = randomUUID();
await http(`${REST}/social_publication_cibles`, { methode: "POST", jeton: SERVICE, corps: { id: cibleId, publication_id: pubId, reseau: "facebook", cle_idempotence: `recette:${cibleId}` } });
const v1 = await http(`${REST}/rpc/social_verrouiller_cible`, { methode: "POST", jeton: SERVICE, corps: { p_cible_id: cibleId } });
const v2 = await http(`${REST}/rpc/social_verrouiller_cible`, { methode: "POST", jeton: SERVICE, corps: { p_cible_id: cibleId } });
verifier("verrou anti-doublon via PostgREST : true puis false", v1.json === true && v2.json === false, `${JSON.stringify(v1.json)} ${JSON.stringify(v2.json)}`);
r = await http(`${REST}/rpc/social_verrouiller_cible`, { methode: "POST", jeton: admin.aal2, corps: { p_cible_id: cibleId } });
verifier("verrou : non exécutable par un utilisateur", r.statut >= 400, `${r.statut}`);
const q = [];
for (let i = 0; i < 3; i++) q.push((await http(`${REST}/rpc/social_consommer_quota`, { methode: "POST", jeton: SERVICE, corps: { p_cle: `recette:${suffixe}`, p_max: 2, p_fenetre_secondes: 3600 } })).json);
verifier("quota via PostgREST : 2 acceptés, 3e refusé", JSON.stringify(q) === "[true,true,false]", JSON.stringify(q));
r = await http(`${REST}/social_audit?action=eq.publication_validee`, { methode: "PATCH", jeton: SERVICE, corps: { action: "efface" } });
verifier("journal : modification refusée au service_role", r.statut >= 400, `${r.statut}`);
r = await http(`${REST}/social_audit?select=action,acteur_id&order=id`, { jeton: admin.aal2 });
verifier("journal : rôle et validation tracés avec l'UID", (r.json ?? []).some((l) => l.action === "role_modifie" && l.acteur_id === admin.id) && (r.json ?? []).some((l) => l.action === "publication_validee" && l.acteur_id === validateur.id), JSON.stringify(r.json));

// ─── Révocation d'une identité plateforme : accès coupé immédiatement ───
sql(`update public.plateforme_admins set actif = false, statut_identite = 'revoquee', revocation_at = now(), revocation_origine = 'migration_technique' where utilisateur_id = '${validateur.id}';`);
r = await http(`${REST}/social_publications?select=id`, { jeton: validateur.aal2 });
verifier("identité plateforme révoquée : plus aucune ligne, même avec un JWT aal2 encore valide", Array.isArray(r.json) && r.json.length === 0, JSON.stringify(r.json));

const echecs = resultats.filter((x) => !x.ok).length;
console.log(`\n${resultats.length - echecs}/${resultats.length} contrôles réussis`);
process.exit(echecs ? 1 : 0);
