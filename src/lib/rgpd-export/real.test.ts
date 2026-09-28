// Qualification RÉELLE de l'export RGPD V1 (ignorée sans pile) : worker de production (adaptateurs
// supabase-js) contre un vrai PostgREST v12.2.3 + PostgreSQL 16 aux migrations réelles + mock
// Storage (métadonnées et RLS réelles, octets sur disque), et un SECOND projet (Studio dédié) avec
// son propre PostgREST, son propre secret JWT et sa propre base.
//   scripts/qualification/rgpd-export-stack.sh start <gp_db> <studio_db>
//   source /var/tmp/rgpd-export-stack/env.sh && npx vitest run src/lib/rgpd-export/real.test.ts
// Rapport : docs/qualification/ELSATIA_RGPD_DATA_EXPORT_PORTABILITY_V1.md (§15, §16).
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream, mkdirSync, mkdtempSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createIdentityIssuer,
  createIdentityVerifier,
  generateSigningKey,
  parseSigningKeys,
  staticJwks,
  STUDIO_AUDIENCE,
  subjectFor,
} from "@elsatia/identity";
import { servirExport } from "../../../apps/studio/src/lib/rgpd-export";
import { executerUnExport, type OptionsRunner, type StudioPort } from "./runner";
import { supabaseExportDb, supabaseStockage } from "./supabase-ports";
import { studioExportClient } from "./studio-client";

const env = process.env;
const actif = Boolean(env.RGPD_STACK_GP_URL && env.RGPD_STACK_STUDIO_URL);
const A = "a0000000-0000-0000-0000-000000000001";
const B = "b0000000-0000-0000-0000-000000000001";
const ADMIN_A = "10000000-0000-0000-0000-000000000001";
const OUVRIER_A = "10000000-0000-0000-0000-000000000002";
const ADMIN_B = "20000000-0000-0000-0000-000000000001";
const EMP_OUVRIER_A = "a2000000-0000-0000-0000-000000000002";
const ISS = "https://gp.elsatia.local/identity";
const mesures: Record<string, unknown> = {};
const dossier = mkdtempSync(join(tmpdir(), "rgpd-real-"));

function psql(db: string, sql: string): string {
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -At -v ON_ERROR_STOP=1 -d ${db}`], { input: sql, encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr}`);
  return r.stdout.trim();
}
function jwt(secret: string, claims: Record<string, unknown>) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...claims })).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
const client = (url: string, key: string) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const gpService = () => client(env.RGPD_STACK_GP_URL!, jwt(env.RGPD_STACK_GP_SECRET!, { role: "service_role" }));
const gpUser = (sub: string) => client(env.RGPD_STACK_GP_URL!, jwt(env.RGPD_STACK_GP_SECRET!, { role: "authenticated", sub, aud: "authenticated" }));
const studioService = () => client(env.RGPD_STACK_STUDIO_URL!, jwt(env.RGPD_STACK_STUDIO_SECRET!, { role: "service_role" }));
/** Dépose des octets comme le ferait le Storage : métadonnées en base, fichier sur le disque du mock. */
function deposerOctets(racine: string, bucket: string, nom: string, octets: Buffer | number) {
  const cible = join(racine, bucket, createHash("sha256").update(`${bucket}/${nom}`).digest("hex"));
  mkdirSync(join(racine, bucket), { recursive: true });
  if (typeof octets === "number") {
    // Gros fichier écrit par blocs (jamais en mémoire d'un coup).
    const bloc = randomBytes(1 << 20);
    const fd = createWriteStream(cible);
    for (let i = 0; i < octets / bloc.length; i++) fd.write(bloc);
    fd.end();
    return new Promise<void>((ok) => fd.on("finish", () => ok()));
  }
  writeFileSync(cible, octets);
  return Promise.resolve();
}
function python(archive: string, code: string): string {
  return execFileSync("python3", ["-c", code, archive], { maxBuffer: 1 << 26 }).toString().trim();
}
async function demander(c: SupabaseClient, type: "ENTREPRISE" | "UTILISATEUR", ent: string | null) {
  const { data, error } = await c.rpc("rgpd_export_demander", { p_type: type, p_entreprise_id: ent, p_cle_idempotence: `real-${randomUUID()}` });
  if (error) throw new Error(error.message);
  return data as { statut: string; code?: string; job_id?: string };
}
async function telecharger(c: SupabaseClient, job: string, cible: string) {
  const { data } = await c.rpc("rgpd_export_autoriser_telechargement", { p_job: job });
  const r = data as { statut: string; code?: string; bucket: string; chemin: string; sha256: string; url_secondes: number };
  if (r.statut !== "AUTORISE") return r;
  const { data: s, error } = await gpService().storage.from(r.bucket).createSignedUrl(r.chemin, r.url_secondes);
  if (error || !s) throw new Error("signature");
  const rep = await fetch(s.signedUrl);
  await pipeline(Readable.fromWeb(rep.body as never), createWriteStream(cible));
  return r;
}
function sha256Fichier(chemin: string) {
  return execFileSync("sha256sum", [chemin]).toString().split(" ")[0];
}

describe.skipIf(!actif)("export RGPD — pile réelle (PostgREST + PostgreSQL 16, deux projets)", () => {
  let admin: SupabaseClient;
  const ring = parseSigningKeys(JSON.stringify({ current: generateSigningKey().privateJwk }));
  const issuer = createIdentityIssuer({ issuer: ISS, keys: ring });
  let serveurStudio: Server;
  let urlStudio = "";
  let studioEnPanne = false;

  beforeAll(async () => {
    admin = gpService();
    const gp = env.RGPD_STACK_GP_DB!;
    psql(gp, `begin;\nset local search_path = public, extensions;\n\\i /var/tmp/exp/tests/fixtures/isolation_multitenant.inc\ncommit;`);
    const debut = Date.now();
    execFileSync("su", ["postgres", "-c", `psql -X -q -v ON_ERROR_STOP=1 -v ent=${A} -v emp=${EMP_OUVRIER_A} -v n=${Number(env.RGPD_STACK_SEED_N ?? 1)} -d ${gp} -f /var/tmp/exp/large-seed.sql`]);
    mesures.seed_ms = Date.now() - debut;
    // Octets réels : 300 photos de 4 Kio + les fichiers du jeu d'isolation + un fichier de 64 Mio.
    const racine = env.RGPD_STACK_GP_STORAGE!;
    for (const nom of psql(gp, `select storage_path from documents_chantier where entreprise_id = '${A}' and nom like 'Photo %'`).split("\n"))
      await deposerOctets(racine, "chantier-documents", nom, randomBytes(4096));
    await deposerOctets(racine, "chantier-documents", `${A}/a4000000-0000-0000-0000-000000000001/plan.pdf`, Buffer.from("plan A"));
    await deposerOctets(racine, "chantier-documents", `${A}/a4000000-0000-0000-0000-000000000002/secret.pdf`, Buffer.from("secret A"));
    await deposerOctets(racine, "messagerie-medias", `${A}/af000000-0000-0000-0000-000000000001/test-a.jpg`, Buffer.from("media A"));
    // Gros fichiers : 4 × 15 Mio (plafond réel du bucket chantier-documents), soit 60 Mio en flux.
    for (let i = 1; i <= 4; i++) {
      const gros = `${A}/a4000000-0000-0000-0000-000000000001/gros-plan-${i}.pdf`;
      psql(gp, `insert into documents_chantier (entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience)
                values ('${A}', 'a4000000-0000-0000-0000-000000000001', 'Gros plan ${i}', '${gros}', 'application/pdf', ${15 << 20}, 'gestionnaires');
                insert into storage.objects (bucket_id, name, metadata) values ('chantier-documents', '${gros}', '{"size": ${15 << 20}}');`);
      await deposerOctets(racine, "chantier-documents", gros, 15 << 20);
    }
    mesures.lignes_metier_A = Number(psql(gp, `select (select count(*) from clients where entreprise_id='${A}') + (select count(*) from chantiers where entreprise_id='${A}')
      + (select count(*) from devis where entreprise_id='${A}') + (select count(*) from lignes_devis where entreprise_id='${A}')
      + (select count(*) from pointages where entreprise_id='${A}') + (select count(*) from documents_chantier where entreprise_id='${A}')`));

    // Projet Studio dédié : une application Studio minimale qui expose la VRAIE logique de la route
    // (servirExport) sur la vraie base Studio via son propre PostgREST et sa propre clé.
    const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });
    const studio = studioService();
    serveurStudio = createServer(async (req, res) => {
      if (studioEnPanne) { res.writeHead(503).end(); return; }
      let corps = "";
      for await (const c of req) corps += c;
      const r = await servirExport(JSON.parse(corps || "null"), {
        verifier: (t) => verifier.verifyExportRequest(t),
        consommer: async (jti, job, exp) => {
          const { data, error } = await studio.rpc("studio_export_consume", { p_jti: jti, p_job: job, p_expires_at: exp });
          if (error) throw new Error(error.message);
          return data === true;
        },
        lireSujet: async (s, job) => {
          const { data, error } = await studio.rpc("studio_export_subject", { p_subject: s, p_job: job });
          if (error) throw new Error(error.message);
          return data;
        },
        signer: async (b, k, sec) => (await studio.storage.from(b).createSignedUrl(k, sec)).data?.signedUrl ?? null,
      });
      res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.body));
    });
    await new Promise<void>((ok) => serveurStudio.listen(0, "127.0.0.1", () => ok()));
    urlStudio = `http://127.0.0.1:${(serveurStudio.address() as { port: number }).port}/api/elsatia/export`;
  }, 600_000);

  afterAll(async () => {
    serveurStudio?.close();
    writeFileSync(`/var/tmp/rgpd-export-stack/mesures-n${env.RGPD_STACK_SEED_N ?? 1}.json`, JSON.stringify(mesures, null, 2));
    rmSync(dossier, { recursive: true, force: true });
  });

  const options = (studio: StudioPort | null = null): OptionsRunner => ({
    db: supabaseExportDb(admin), stockage: supabaseStockage(admin), studio, dossierTemporaire: dossier,
  });

  it("isolation des deux projets : chaque clé service est refusée par l'autre PostgREST", async () => {
    const croiseGp = await client(env.RGPD_STACK_STUDIO_URL!, jwt(env.RGPD_STACK_GP_SECRET!, { role: "service_role" })).rpc("studio_export_subject", { p_subject: "a".repeat(43), p_job: randomUUID() });
    const croiseStudio = await client(env.RGPD_STACK_GP_URL!, jwt(env.RGPD_STACK_STUDIO_SECRET!, { role: "service_role" })).rpc("rgpd_export_reclamer");
    expect(croiseGp.error).not.toBeNull();
    expect(croiseStudio.error).not.toBeNull();
    // Témoin : aucune table Studio dans le projet partagé n'est lue par l'export (catalogue EXCLU).
    expect(psql(env.RGPD_STACK_GP_DB!, "select count(*) from platform.rgpd_export_catalogue where table_nom like 'studio\\_%' and categorie <> 'EXCLU'")).toBe("0");
  });

  it("sécurité HTTP : org spoof, IDOR, clé service, anonyme", async () => {
    expect(await demander(gpUser(ADMIN_B), "ENTREPRISE", A)).toMatchObject({ statut: "REFUSE", code: "NON_AUTORISE" });
    expect(await demander(gpUser(OUVRIER_A), "UTILISATEUR", B)).toMatchObject({ statut: "REFUSE", code: "ENTREPRISE_INTERDITE_EXPORT_UTILISATEUR" });
    const svc = await admin.rpc("rgpd_export_demander", { p_type: "ENTREPRISE", p_entreprise_id: A, p_cle_idempotence: "service-role-x1" });
    expect(svc.error?.code).toBe("42501");
    const anon = await client(env.RGPD_STACK_GP_URL!, jwt(env.RGPD_STACK_GP_SECRET!, { role: "anon" })).rpc("rgpd_export_demander", { p_type: "UTILISATEUR" });
    expect(anon.error).not.toBeNull();
    const usurpe = await gpUser(ADMIN_B).rpc("rgpd_export_reclamer");
    expect(usurpe.error?.code).toBe("42501");
    // Les tables du schéma platform ne sont pas exposées par PostgREST.
    const direct = await gpUser(ADMIN_B).schema("platform" as never).from("rgpd_export_jobs").select("*");
    expect(direct.error).not.toBeNull();
  });

  it("gros volume : export entreprise 15 000+ lignes métier et 60 Mio de fichiers, en flux (temps, RAM, taille)", async () => {
    const d = await demander(gpUser(ADMIN_A), "ENTREPRISE", A);
    expect(d.statut).toBe("PENDING");
    // IDOR sur un job réel : B ne peut pas le télécharger.
    let rssMax = 0;
    let tasMax = 0;
    const base = process.memoryUsage().rss;
    const tasBase = process.memoryUsage().heapUsed;
    const sonde = setInterval(() => {
      const m = process.memoryUsage();
      rssMax = Math.max(rssMax, m.rss);
      tasMax = Math.max(tasMax, m.heapUsed);
    }, 25);
    const t0 = Date.now();
    const r = await executerUnExport({ ...options(), tailleePage: 1000 });
    const duree = Date.now() - t0;
    clearInterval(sonde);
    expect(r.etat).toBe("ready");
    expect(r.job_id).toBe(d.job_id);
    Object.assign(mesures, {
      gros_volume: { lignes_metier_A: mesures.lignes_metier_A, lignes_exportees: r.lignes, entrees_zip: r.entrees, archive_octets: r.octets,
        duree_ms: duree, rss_base_mo: Math.round(base / 1048576), rss_max_mo: Math.round(rssMax / 1048576),
        rss_delta_mo: Math.round((rssMax - base) / 1048576), tas_base_mo: Math.round(tasBase / 1048576), tas_max_mo: Math.round(tasMax / 1048576), fichiers: r.fichiers, complet: r.complet, phases: r.phases,
        facteur: Number(env.RGPD_STACK_SEED_N ?? 1) },
    });
    expect(Number(mesures.lignes_metier_A)).toBeGreaterThan(10_000);
    // Les chemins empoisonnés de l'isolation n'existent pas ici : complet si tous les fichiers sont là.
    expect(r.complet).toBe(true);
    expect(await telecharger(gpUser(ADMIN_B), d.job_id!, join(dossier, "vol.zip"))).toMatchObject({ statut: "REFUSE", code: "INTROUVABLE" });
    const zip = join(dossier, "vol.zip");
    const t = await telecharger(gpUser(ADMIN_A), d.job_id!, zip);
    expect(t.statut).toBe("AUTORISE");
    expect(sha256Fichier(zip)).toBe((t as { sha256: string }).sha256);
    expect(statSync(zip).size).toBe(r.octets);
    const verif = python(zip, `
import zipfile, json, sys, hashlib
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
m = json.loads(z.read("export.json")); f = json.loads(z.read("fichiers/manifeste.json"))
clients = json.loads(z.read("donnees/${A}/gestion_pro/clients.json"))
big = sum(z.getinfo("fichiers/chantier-documents/${A}/a4000000-0000-0000-0000-000000000001/gros-plan-%d.pdf" % i).file_size for i in range(1, 5))
print(len(clients), m["complet"], len([x for x in f if x["statut"] == "INCLUS"]), big, "TEST_B_" in z.read("donnees/${A}/gestion_pro/clients.json").decode())
`).split(" ");
    const n = Number(env.RGPD_STACK_SEED_N ?? 1);
    const nClients = psql(env.RGPD_STACK_GP_DB!, `select count(*) from clients where entreprise_id = '${A}'`);
    expect(verif).toEqual([nClients, "True", String(300 * n + 2 + 1 + 4), String(60 << 20), "False"]);
    // Journal : génération et téléchargement audités, sans contenu.
    const actions = psql(env.RGPD_STACK_GP_DB!, `select string_agg(distinct action, ',' order by action) from platform.rgpd_export_evenements where job_id = '${d.job_id}'`);
    expect(actions.split(",")).toEqual(expect.arrayContaining(["requested", "started", "materialized", "ready", "download_authorized"]));
    expect(psql(env.RGPD_STACK_GP_DB!, `select count(*) from platform.rgpd_export_evenements where detail::text like '%Client volumineux%' or detail::text like '%@exemple%'`)).toBe("0");
  }, 600_000);

  it("fichier absent (métadonnée sans objet) et Storage manquant (octets perdus) : archive READY mais jamais complète", async () => {
    const gp = env.RGPD_STACK_GP_DB!;
    psql(gp, `insert into documents_chantier (entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience) values
      ('${A}', 'a4000000-0000-0000-0000-000000000001', 'Sans objet', '${A}/a4000000-0000-0000-0000-000000000001/inexistant.pdf', 'application/pdf', 5, 'gestionnaires')`);
    // Octets perdus côté Storage alors que la métadonnée existe.
    const perdu = psql(gp, `select storage_path from documents_chantier where entreprise_id='${A}' and nom = 'Photo 1.jpg'`);
    unlinkSync(join(env.RGPD_STACK_GP_STORAGE!, "chantier-documents", createHash("sha256").update(`chantier-documents/${perdu}`).digest("hex")));
    const d = await demander(gpUser(ADMIN_A), "ENTREPRISE", A);
    const r = await executerUnExport(options());
    expect(r).toMatchObject({ etat: "ready", job_id: d.job_id, complet: false });
    expect(r.fichiers).toMatchObject({ ABSENT: 1, ILLISIBLE: 1 });
    expect(psql(gp, `select complet from platform.rgpd_export_jobs where id = '${d.job_id}'`)).toBe("f");
    // Remise en état pour la suite.
    await deposerOctets(env.RGPD_STACK_GP_STORAGE!, "chantier-documents", perdu, randomBytes(4096));
    psql(gp, `delete from documents_chantier where nom = 'Sans objet'`);
  }, 600_000);

  it("job interrompu : reprise après expiration du bail, archive complète, aucune duplication ; rejeu de la fin sans effet", async () => {
    const gp = env.RGPD_STACK_GP_DB!;
    const d = await demander(gpUser(ADMIN_A), "ENTREPRISE", A);
    const coupe = await executerUnExport({ ...options(), interrompreApresSections: 20 });
    expect(coupe.etat).toBe("bail_perdu");
    expect(psql(gp, `select statut from platform.rgpd_export_jobs where id = '${d.job_id}'`)).toBe("RUNNING");
    // Aucun autre worker ne peut le reprendre tant que le bail court.
    expect((await executerUnExport(options())).etat).toBe("aucun_job");
    psql(gp, `update platform.rgpd_export_jobs set bail_expire_at = now() - interval '1 second' where id = '${d.job_id}'`);
    const r = await executerUnExport(options());
    expect(r).toMatchObject({ etat: "ready", job_id: d.job_id, complet: true });
    expect(psql(gp, `select tentatives || '|' || archive_chemin from platform.rgpd_export_jobs where id = '${d.job_id}'`)).toBe(`2|${d.job_id}/2.zip`);
    expect(psql(gp, `select count(*) from platform.rgpd_export_evenements where job_id = '${d.job_id}' and action = 'resumed_after_interruption'`)).toBe("1");
    expect(psql(gp, `select count(*) from storage.objects where bucket_id = 'rgpd-exports' and name like '${d.job_id}/%'`)).toBe("1");
    const j = psql(gp, `select archive_sha256 || '|' || archive_octets from platform.rgpd_export_jobs where id = '${d.job_id}'`).split("|");
    const rejeu = await admin.rpc("rgpd_export_terminer", { p_job: d.job_id, p_bail: randomUUID(), p_archive_chemin: `${d.job_id}/2.zip`,
      p_sha256: j[0], p_octets: Number(j[1]), p_complet_worker: true, p_resume_worker: {} });
    expect(rejeu.data).toMatchObject({ statut: "READY", rejoue: true });
  }, 600_000);

  it("Studio (projet dédié) : indisponible → réessai sans archive ; disponible → données + fichier OWN_DATA via contrat signé", async () => {
    const gp = env.RGPD_STACK_GP_DB!;
    const st = env.RGPD_STACK_STUDIO_DB!;
    const sujet = subjectFor(ISS, STUDIO_AUDIENCE, OUVRIER_A);
    psql(gp, `insert into elsatia_identity_subjects (user_id, audience, subject) values ('${OUVRIER_A}', 'studio', '${sujet}') on conflict do nothing`);
    const userStudio = randomUUID();
    const w = randomUUID();
    const a = randomUUID();
    const p = randomUUID();
    const cle = `studio/${w}/${p}/${a}/original.jpg`;
    psql(st, `begin;
      delete from studio_identity.links where subject = '${sujet}';
      insert into auth.users (id, email) values ('${userStudio}', 'ouvrier-a-${userStudio}@invalid.local');
      insert into studio_identity.subject_state (subject, account, state_seq, granted) values ('${sujet}', 'active', 1, true) on conflict do nothing;
      insert into studio_identity.links (subject, user_id, email) values ('${sujet}', '${userStudio}', 'ouvrier-a@invalid.local');
      update studio_guard.control set allow_unlinked_writes = true, mode = 'read_write';
      insert into public.studio_workspaces (id, name, workspace_type, owner_user_id) values ('${w}', 'Perso', 'personal', '${userStudio}');
      insert into public.studio_workspace_members (workspace_id, user_id, role) values ('${w}', '${userStudio}', 'owner');
      insert into public.studio_projects (id, workspace_id, name, project_type, created_by) values ('${p}', '${w}', 'Chantier filmé', 'free', '${userStudio}');
      insert into public.studio_media_assets (id, workspace_id, project_id, uploaded_by, request_id, storage_key, original_filename, mime_type, media_type, file_size_bytes, upload_status)
        values ('${a}', '${w}', '${p}', '${userStudio}', gen_random_uuid(), '${cle}', 'chantier.jpg', 'image/jpeg', 'image', 11, 'ready');
      set studio.write_path = 'storage_maintenance';
      insert into storage.objects (bucket_id, name, metadata) values ('studio-originals', '${cle}', '{"size": 11}');
      commit;`);
    await deposerOctets(env.RGPD_STACK_STUDIO_STORAGE!, "studio-originals", cle, Buffer.from("video-perso"));
    const studioPort = studioExportClient({ issuer, url: urlStudio, originesFichiers: [env.RGPD_STACK_STUDIO_URL!] });

    const d = await demander(gpUser(OUVRIER_A), "UTILISATEUR", null);
    studioEnPanne = true;
    const panne = await executerUnExport(options(studioPort));
    expect(panne).toMatchObject({ etat: "retry", code: "EXPORT_STUDIO_INDISPONIBLE" });
    expect(psql(gp, `select statut || '|' || coalesce(archive_chemin, '-') from platform.rgpd_export_jobs where id = '${d.job_id}'`)).toBe("PENDING|-");
    studioEnPanne = false;
    psql(gp, `update platform.rgpd_export_jobs set prochaine_tentative_at = now() where id = '${d.job_id}'`);
    const r = await executerUnExport(options(studioPort));
    expect(r).toMatchObject({ etat: "ready", job_id: d.job_id, complet: true });
    const zip = join(dossier, "usr.zip");
    expect((await telecharger(gpUser(OUVRIER_A), d.job_id!, zip)).statut).toBe("AUTORISE");
    const v = python(zip, `
import zipfile, json, sys
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
m = json.loads(z.read("export.json")); s = json.loads(z.read("studio/donnees.json")); n = z.namelist()
pt = json.loads(z.read("donnees/${A}/gestion_pro/pointages.json"))
print(m["studio"]["statut"], m["complet"], len(s["medias"]), z.read("studio/fichiers/studio-originals/${cle}").decode(),
  all(p["employe_id"] == "${EMP_OUVRIER_A}" for p in pt), any("/clients.json" in x for x in n), len(pt) > 2000)
`);
    expect(v).toBe("INCLUS True 1 video-perso True False True");
    // Studio : demande consommée une seule fois, journal sans contenu.
    expect(psql(st, `select count(*) from studio_identity.export_events where action = 'served' and job = '${d.job_id}'`)).toBe("1");
  }, 600_000);

  it("expiration : archive supprimée du Storage, plus aucun téléchargement", async () => {
    const gp = env.RGPD_STACK_GP_DB!;
    psql(gp, `update platform.rgpd_export_jobs set expire_at = now() - interval '1 second' where statut = 'READY'`);
    const { expirerArchives } = await import("./service");
    const e = await expirerArchives(admin);
    expect(e.erreurs).toBe(0);
    expect(psql(gp, "select count(*) from storage.objects where bucket_id = 'rgpd-exports'")).toBe("0");
    expect(psql(gp, "select count(*) from platform.rgpd_export_jobs where statut = 'READY'")).toBe("0");
    const job = psql(gp, `select id from platform.rgpd_export_jobs where demandeur_id = '${ADMIN_A}' and statut = 'EXPIRED' limit 1`);
    expect(await telecharger(gpUser(ADMIN_A), job, join(dossier, "x.zip"))).toMatchObject({ statut: "REFUSE", code: "EXPIRE" });
  }, 120_000);
});
