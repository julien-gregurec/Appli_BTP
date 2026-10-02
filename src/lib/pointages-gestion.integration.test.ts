import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { writeFileSync } from "node:fs";
import { PostgrestClient } from "@supabase/postgrest-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  bornesMois,
  chargerAnciennesSaisiesPage,
  chargerCompteurs,
  chargerControlesZone,
  chargerSessionsPage,
  chargerTotauxParEmploye,
  TAILLE_PAGE_ANCIENNES_SAISIES,
  TAILLE_PAGE_SESSIONS,
} from "./pointages-gestion";

// ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — preuve à l'échelle contre un VRAI
// PostgREST (max_rows = 1 000, comme supabase/config.toml) et une vraie base
// PostgreSQL rejouée avec toutes les migrations. Ignoré sans pile locale :
//
//   GP_POINTAGES_REST_URL=http://localhost:3001 GP_POINTAGES_JWT_SECRET=... \
//   GP_POINTAGES_DB=gp_fix GP_POINTAGES_ENTREPRISE=<uuid> GP_POINTAGES_SUB=<uuid> \
//   [GP_POINTAGES_ECHELLES=500,1000,1462,5000,20000] [GP_POINTAGES_RESULTATS=out.json] \
//   npx vitest run src/lib/pointages-gestion.integration.test.ts
//
// Pour chaque volume : jeu scripts/perf/pointages_mois_charge.sql, vérité DB
// (superutilisateur), requête HISTORIQUE de la page (lecture du mois entier +
// somme côté Next) et nouveau chargement (RPC + pages), comparés au centième.

const env = process.env;
const actif = Boolean(env.GP_POINTAGES_REST_URL && env.GP_POINTAGES_JWT_SECRET && env.GP_POINTAGES_DB && env.GP_POINTAGES_ENTREPRISE && env.GP_POINTAGES_SUB);
const echelles = (env.GP_POINTAGES_ECHELLES ?? "500,1000,1462,5000,20000").split(",").map(Number);
const mois = env.GP_POINTAGES_MOIS ?? "2026-08";
const legacyAttenduFaux = env.GP_POINTAGES_LEGACY !== "0";

function jwt(sub: string, secret: string): string {
  const b64 = (valeur: object) => Buffer.from(JSON.stringify(valeur)).toString("base64url");
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${corps}.${createHmac("sha256", secret).update(corps).digest("base64url")}`;
}

function psql(args: string[]): string {
  return execFileSync("su", ["postgres", "-c", ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", env.GP_POINTAGES_DB!, ...args].map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(" ")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

type Mesure = { octets: number; requetes: number };
function client(mesure: Mesure): SupabaseClient {
  const fetchCompte: typeof fetch = async (entree, init) => {
    const reponse = await fetch(entree, init);
    const corps = await reponse.arrayBuffer();
    mesure.octets += corps.byteLength;
    mesure.requetes += 1;
    return new Response(corps, { status: reponse.status, statusText: reponse.statusText, headers: reponse.headers });
  };
  return new PostgrestClient(env.GP_POINTAGES_REST_URL!, { headers: { Authorization: `Bearer ${jwt(env.GP_POINTAGES_SUB!, env.GP_POINTAGES_JWT_SECRET!)}` }, fetch: fetchCompte }) as unknown as SupabaseClient;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

describe.skipIf(!actif)("pointages gestion — vérité DB à l'échelle, vrai PostgREST", () => {
  const resultats: Record<string, unknown>[] = [];

  for (const n of echelles) {
    it(`${n} pointages dans le mois`, { timeout: 600_000 }, async () => {
      const entreprise = env.GP_POINTAGES_ENTREPRISE!;
      const bornes = bornesMois(mois);
      psql(["-v", `entreprise=${entreprise}`, "-v", `mois=${mois}`, "-v", `n=${n}`, "-f", `${process.cwd()}/scripts/perf/pointages_mois_charge.sql`]);

      // Vérité DB (superutilisateur) : le dirigeant voit tous les pointages de l'entreprise.
      const verite = new Map<string, number>();
      for (const ligne of psql(["-c", `select employe_id, sum(heures_normales + heures_supplementaires) from public.pointages where entreprise_id = '${entreprise}' and date between '${bornes.debut}' and '${bornes.fin}' group by employe_id`]).trim().split("\n").filter(Boolean)) {
        const [id, heures] = ligne.split("|");
        verite.set(id, Number(heures));
      }
      const [nbPointagesDb, nbSessionsDb, nbAnciennesDb, nbControlesDb] = psql(["-c", `select (select count(*) from public.pointages where entreprise_id = '${entreprise}' and date between '${bornes.debut}' and '${bornes.fin}'), (select count(*) from public.sessions_pointage where entreprise_id = '${entreprise}' and arrivee_at between '${bornes.debutIso}' and '${bornes.finIso}'), (select count(*) from public.pointages p where entreprise_id = '${entreprise}' and date between '${bornes.debut}' and '${bornes.fin}' and not exists (select 1 from public.sessions_pointage s where s.pointage_id = p.id)), (select count(*) from public.verifications_zone_pointage where entreprise_id = '${entreprise}' and created_at between '${bornes.debutIso}' and '${bornes.finIso}')`]).trim().split("|").map(Number);
      const totalVerite = arrondi([...verite.values()].reduce((a, b) => a + b, 0));

      // AVANT : requête historique de /pointage/gestion, à l'identique, puis somme côté Next.
      const mesureAvant: Mesure = { octets: 0, requetes: 0 };
      const t0 = performance.now();
      const { data: historique } = await client(mesureAvant).from("pointages").select("id,date,heures_normales,heures_supplementaires,latitude,longitude,verification_statut,origine_pointage,commentaire,employe:employes(id,prenom,nom),chantier:chantiers(id,nom)").eq("entreprise_id", entreprise).gte("date", bornes.debut).lte("date", bornes.fin).order("date", { ascending: false });
      const dureeAvant = performance.now() - t0;
      const parEmployeAvant = new Map<string, number>();
      // Même boucle que l'ancienne page (relation « un » : objet ou tableau).
      for (const p of (historique ?? []) as unknown as { heures_normales: number; heures_supplementaires: number; employe: { id: string } | { id: string }[] | null }[]) {
        const e = Array.isArray(p.employe) ? p.employe[0] ?? null : p.employe;
        if (e) parEmployeAvant.set(e.id, (parEmployeAvant.get(e.id) ?? 0) + Number(p.heures_normales) + Number(p.heures_supplementaires));
      }
      const totalAvant = arrondi([...parEmployeAvant.values()].reduce((a, b) => a + b, 0));
      const ecartsAvant = [...verite.entries()].filter(([id, h]) => arrondi(parEmployeAvant.get(id) ?? 0) !== arrondi(h)).length;

      // APRÈS : chargement réel de la page (totaux en base + première page de chaque liste).
      const mesureApres: Mesure = { octets: 0, requetes: 0 };
      const supabase = client(mesureApres);
      const t1 = performance.now();
      const [{ totaux, erreur }, { compteurs, erreur: erreurCompteurs }, sessions, anciennes] = await Promise.all([
        chargerTotauxParEmploye(supabase, entreprise, bornes),
        chargerCompteurs(supabase, entreprise, bornes),
        chargerSessionsPage(supabase, entreprise, bornes, 1),
        chargerAnciennesSaisiesPage(supabase, entreprise, bornes, 1),
      ]);
      const controles = await chargerControlesZone(supabase, entreprise, sessions.map((s) => s.id));
      const dureeApres = performance.now() - t1;
      const totalApres = arrondi(totaux.reduce((a, t) => a + t.heures, 0));
      const ecartsApres = [...verite.entries()].filter(([id, h]) => arrondi(totaux.find((t) => t.employeId === id)?.heures ?? -1) !== arrondi(h)).length;
      const controlesAttendus = Number(psql(["-c", `select count(*) from public.verifications_zone_pointage where session_id = any(array[${sessions.map((s) => `'${s.id}'`).join(",") || "null"}]::uuid[])`]).trim());

      const resultat = {
        n, nbPointagesDb, salaries: verite.size, totalVerite,
        avant: { lignesRecues: historique?.length ?? 0, total: totalAvant, salariesFaux: ecartsAvant, ms: Math.round(dureeAvant), octets: mesureAvant.octets },
        apres: { erreur, totalPointagesCompte: totaux.reduce((a, t) => a + t.nbPointages, 0), total: totalApres, salariesFaux: ecartsApres, ms: Math.round(dureeApres), octets: mesureApres.octets, requetes: mesureApres.requetes,
          erreurCompteurs, sessionsPage: sessions.length, sessionsTotal: compteurs.sessions, sessionsDb: nbSessionsDb,
          anciennesPage: anciennes.length, anciennesTotal: compteurs.anciennesSaisies, anciennesDb: nbAnciennesDb,
          controlesMois: compteurs.controles, controlesDb: nbControlesDb, controlesPage: controles.length, controlesPageDb: controlesAttendus },
      };
      resultats.push(resultat);
      console.log(JSON.stringify(resultat));
      if (env.GP_POINTAGES_RESULTATS) writeFileSync(env.GP_POINTAGES_RESULTATS, JSON.stringify(resultats, null, 2));

      expect(nbPointagesDb).toBe(n);
      // Le chemin historique est faux dès que le mois dépasse max_rows.
      if (legacyAttenduFaux && n > 1000) {
        expect(historique?.length).toBe(1000);
        expect(totalAvant).toBeLessThan(totalVerite);
      }
      // Le nouveau chemin est strictement égal à la vérité DB, à toute échelle.
      expect(erreur).toBeNull();
      expect(totaux.reduce((a, t) => a + t.nbPointages, 0)).toBe(n);
      expect(totaux.length).toBe(verite.size);
      expect(ecartsApres).toBe(0);
      expect(totalApres).toBe(totalVerite);
      expect(erreurCompteurs).toBeNull();
      expect(compteurs.sessions).toBe(nbSessionsDb);
      expect(sessions.length).toBe(Math.min(TAILLE_PAGE_SESSIONS, nbSessionsDb));
      expect(compteurs.anciennesSaisies).toBe(nbAnciennesDb);
      expect(anciennes.length).toBe(Math.min(TAILLE_PAGE_ANCIENNES_SAISIES, nbAnciennesDb));
      expect(compteurs.controles).toBe(nbControlesDb);
      expect(controles.length).toBe(controlesAttendus);
    });
  }
});
