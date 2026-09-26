#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : smoke Storage Supabase.
 *
 * Lecture seule par défaut :
 *   1. liste des buckets (clé de service, GET /storage/v1/bucket) : les 18 buckets attendus,
 *      drapeau `public` exact (seul entreprise-assets est public), limite de taille posée ;
 *   2. anonyme (clé publishable) : la liste des buckets ne doit rien révéler ;
 *   3. anonyme : lecture d'un objet d'un bucket privé via l'URL publique → refus (400/401/403/404).
 * Avec --write (safe-run, opt-in) : dépose UN PNG 1×1 `preview-smoke/<horodatage>.png` dans le
 * bucket privé `pointage-preuves` (image/png admis), vérifie que l'URL publique est refusée, qu'une
 * URL signée 60 s rend les mêmes octets, puis SUPPRIME l'objet (suppression vérifiée).
 *
 * Usage :
 *   node scripts/preview/storage-smoke.mjs --env-file ~/elsatia-preview/gp.env [--preview-ref <ref>] [--write]
 * Aucune clé affichée. Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import {
  REF_PREVIEW_AUTORISEE, Refus, SORTIE, chargerFichierEnv, estDefinie, estPointEntree, exigerRefPreview,
  ligne, lireOptions, refDepuisUrlApi, refuserProduction,
} from "./lib/preview-guard.mjs";

/** Les 18 buckets créés par supabase/migrations (même liste que scripts/preflight-preview.mjs, test d'égalité). */
export const EXPECTED_BUCKETS = [
  "entreprise-assets", "chantier-documents", "pointage-preuves", "factures-fournisseurs",
  "documents-employes", "notes-frais", "notes-frais-exports", "bulletins-paie",
  "fiches-techniques", "documents-paie", "messagerie-medias", "devis-medias",
  "colors-seaux", "reserves-photos", "reserves-plans", "communications-elsatia",
  "studio-originals", "studio-renders",
];
export const BUCKETS_PUBLICS = ["entreprise-assets"];
export const BUCKET_SMOKE = "pointage-preuves";
// PNG 1×1 transparent (67 octets) : type admis par pointage-preuves (png, jpeg, webp).
export const OBJET_SMOKE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** Pure : compare la liste réelle aux attentes. */
export function evaluerBuckets(buckets) {
  const out = [];
  const parId = new Map(buckets.map((b) => [b.id ?? b.name, b]));
  for (const id of EXPECTED_BUCKETS) {
    const b = parId.get(id);
    if (!b) { out.push({ ok: false, code: "STORAGE-BUCKET-MISSING", sujet: id, message: "absent (migrations non rejouées ?)" }); continue; }
    const attenduPublic = BUCKETS_PUBLICS.includes(id);
    if (Boolean(b.public) !== attenduPublic) out.push({ ok: false, code: "STORAGE-BUCKET-PUBLIC", sujet: id, message: `public=${Boolean(b.public)}, attendu ${attenduPublic}` });
    else if (!b.file_size_limit) out.push({ ok: false, code: "STORAGE-BUCKET-LIMIT", sujet: id, message: "aucune limite de taille" });
    else out.push({ ok: true, code: "STORAGE-BUCKET", sujet: id, message: attenduPublic ? "public (attendu)" : "privé" });
  }
  const inconnus = [...parId.keys()].filter((id) => !EXPECTED_BUCKETS.includes(id));
  if (inconnus.length) out.push({ ok: true, code: "STORAGE-BUCKET-EXTRA", sujet: "buckets", message: `${inconnus.length} bucket(s) hors migrations (à expliquer)` });
  return out;
}

export async function executer({ env, refAttendue = REF_PREVIEW_AUTORISEE, ecrire = false }, { fetchImpl = fetch, log = console.log, maintenant = Date.now() } = {}) {
  refuserProduction(env);
  const base = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  exigerRefPreview(refDepuisUrlApi(base), refAttendue);
  const service = env.SUPABASE_SERVICE_ROLE_KEY;
  const publique = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!estDefinie(service)) throw new Refus("SUPABASE_SERVICE_ROLE_KEY absente");
  if (!estDefinie(publique)) throw new Refus("clé publique Supabase absente");
  const svc = { apikey: service, Authorization: `Bearer ${service}` };
  const req = (chemin, init = {}) => fetchImpl(`${base}${chemin}`, { ...init, signal: AbortSignal.timeout(10000) });
  const constats = [];

  // 1. Buckets (service).
  const r = await req("/storage/v1/bucket", { headers: svc });
  if (!r.ok) constats.push({ ok: false, code: "STORAGE-LIST", sujet: "service", message: `HTTP ${r.status}` });
  else constats.push(...evaluerBuckets(await r.json()));

  // 2. Anonyme : aucune liste.
  const a = await req("/storage/v1/bucket", { headers: { apikey: publique, Authorization: `Bearer ${publique}` } });
  const corpsAnon = a.ok ? await a.json().catch(() => null) : null;
  const revele = Array.isArray(corpsAnon) && corpsAnon.length > 0;
  constats.push(revele
    ? { ok: false, code: "STORAGE-ANON-LIST", sujet: "anon", message: `${corpsAnon.length} bucket(s) listé(s) sans session` }
    : { ok: true, code: "STORAGE-ANON-LIST", sujet: "anon", message: a.ok ? "liste vide" : `refus HTTP ${a.status}` });

  // 3. Anonyme : objet d'un bucket privé via l'URL publique.
  const p = await req(`/storage/v1/object/public/${BUCKET_SMOKE}/preview-smoke/inexistant.png`);
  constats.push([400, 401, 403, 404].includes(p.status)
    ? { ok: true, code: "STORAGE-PRIVATE-PUBLIC-URL", sujet: BUCKET_SMOKE, message: `refus HTTP ${p.status}` }
    : { ok: false, code: "STORAGE-PRIVATE-PUBLIC-URL", sujet: BUCKET_SMOKE, message: `HTTP ${p.status} sur l'URL publique d'un bucket privé` });

  // 4. Safe-run optionnel : dépôt → lecture signée → suppression.
  if (ecrire) {
    const cle = `preview-smoke/${maintenant}.png`;
    const up = await req(`/storage/v1/object/${BUCKET_SMOKE}/${cle}`, { method: "POST", headers: { ...svc, "content-type": "image/png", "x-upsert": "false" }, body: OBJET_SMOKE });
    if (!up.ok) constats.push({ ok: false, code: "STORAGE-WRITE", sujet: BUCKET_SMOKE, message: `dépôt HTTP ${up.status}` });
    else {
      try {
        const pub = await req(`/storage/v1/object/public/${BUCKET_SMOKE}/${cle}`);
        constats.push(pub.ok ? { ok: false, code: "STORAGE-WRITE-PUBLIC", sujet: cle, message: "objet privé lisible par URL publique" } : { ok: true, code: "STORAGE-WRITE-PUBLIC", sujet: cle, message: `URL publique refusée (HTTP ${pub.status})` });
        const s = await req(`/storage/v1/object/sign/${BUCKET_SMOKE}/${cle}`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }) });
        const signe = s.ok ? (await s.json()).signedURL : null;
        if (!signe) constats.push({ ok: false, code: "STORAGE-SIGN", sujet: cle, message: `signature HTTP ${s.status}` });
        else {
          const g = await req(`/storage/v1${signe.startsWith("/") ? "" : "/"}${signe}`);
          const octets = g.ok ? Buffer.from(await g.arrayBuffer()) : null;
          constats.push(octets && octets.equals(OBJET_SMOKE) ? { ok: true, code: "STORAGE-SIGNED-READ", sujet: cle, message: "URL signée : octets identiques" } : { ok: false, code: "STORAGE-SIGNED-READ", sujet: cle, message: `HTTP ${g.status}` });
        }
      } finally {
        const d = await req(`/storage/v1/object/${BUCKET_SMOKE}`, { method: "DELETE", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ prefixes: [cle] }) });
        const l = await req(`/storage/v1/object/list/${BUCKET_SMOKE}`, { method: "POST", headers: { ...svc, "content-type": "application/json" }, body: JSON.stringify({ prefix: "preview-smoke/", limit: 1000 }) });
        const liste = l.ok ? await l.json().catch(() => null) : null;
        const encore = Array.isArray(liste) && liste.some((x) => `preview-smoke/${x.name}` === cle);
        constats.push(d.ok && Array.isArray(liste) && !encore ? { ok: true, code: "STORAGE-CLEANUP", sujet: cle, message: "objet supprimé (absent de la liste)" } : { ok: false, code: "STORAGE-CLEANUP", sujet: cle, message: `suppression à vérifier à la main (HTTP ${d.status}/${l.status})` });
      }
    }
  }

  log(`ELSATIA — smoke Storage Preview (${ecrire ? "safe-run : 1 objet déposé puis supprimé" : "lecture seule"}, aucune clé affichée)\n`);
  let erreurs = 0;
  for (const c of constats) { if (!c.ok) erreurs += 1; log(ligne(c.ok ? "ok" : "ko", c.code, c.sujet, c.message)); }
  log(erreurs ? `\nNO-GO : ${erreurs} erreur(s).` : "\nGO : Storage conforme.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    if (typeof o["env-file"] !== "string") throw new Refus("--env-file <gp.env Preview> est obligatoire");
    process.exitCode = await executer({ env: chargerFichierEnv(o["env-file"]), refAttendue: typeof o["preview-ref"] === "string" ? o["preview-ref"] : REF_PREVIEW_AUTORISEE, ecrire: Boolean(o.write) });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; }
    else { console.error(`ÉCHEC : ${error instanceof Error ? error.message : String(error)}`); process.exitCode = SORTIE.NO_GO; }
  }
}
