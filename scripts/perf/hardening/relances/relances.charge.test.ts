import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

// ELSATIA PERFORMANCE HARDENING V9.1 — P1-B : charge du cron de relances RÉEL
// (traiterRelancesAutomatiques, chemin de service, PostgREST + JWT service_role signé), Brevo simulé.
// 5 tenants × 2 000 factures = 10 000 : 60 % au maximum de relances, 20 % relancées la veille
// (délai non écoulé), 20 % dues jamais relancées. Trois passages du cron le même jour.
// Mesure : factures dues atteintes, durée, aucune relance au-delà du maximum, aucun doublon.
//
// Variables : CHARGE_URL (PostgREST), CHARGE_DB (base locale jetable), CHARGE_SECRET (jwt-secret),
// CHARGE_SORTIE (fichier JSON de résultat, facultatif).
const URL_PGRST = process.env.CHARGE_URL;
const BASE = process.env.CHARGE_DB;
const SECRET = process.env.CHARGE_SECRET ?? "elsatia-local-perf-jwt-secret-0123456789abcdef";
const TENANTS = Number(process.env.CHARGE_TENANTS ?? 5);
const PAR_TENANT = Number(process.env.CHARGE_PAR_TENANT ?? 2000);

const envois = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: () => true,
  envoyerEmailBrevo: async () => ({ messageId: `charge-${++envois.n}` }),
}));

function pg(sql: string): string {
  return execFileSync("su", ["postgres", "-c", `psql -X -A -t -q -v ON_ERROR_STOP=1 -d ${BASE}`], { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim();
}
function jwtService(): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const corps = `${b({ alg: "HS256", typ: "JWT" })}.${b({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 7200 })}`;
  return `${corps}.${createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
}

describe.skipIf(!URL_PGRST || !BASE)("relances automatiques — 10 000 factures, cron réel", () => {
  it("atteint les factures dues malgré les inéligibles, sans doublon ni dépassement du maximum", async () => {
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    const tenants = Array.from({ length: TENANTS }, () => randomUUID());
    // Seules nos entreprises ont les relances automatiques actives pendant la mesure.
    pg(`update parametres_relances set devis_auto_actif = false, factures_auto_actif = false;`);
    for (const [i, ent] of tenants.entries()) {
      pg(`
        insert into entreprises (id, nom, abonnement_statut) values ('${ent}', 'Charge relances ${i}', 'actif');
        insert into parametres_relances (entreprise_id, devis_auto_actif, factures_auto_actif, envoyer_weekend,
          factures_delai_premiere_relance_jours, factures_delai_entre_relances_jours, factures_nombre_max_relances)
          values ('${ent}', false, true, true, 3, 7, 3);
        insert into clients (id, entreprise_id, type, nom, email, statut)
          values (md5('${ent}' || 'cli')::uuid, '${ent}', 'professionnel', 'Client charge', 'charge-${i}@relances.invalid', 'actif');
        insert into factures (id, entreprise_id, numero, client_id, type, statut, date_emission, date_echeance, montant_ht, montant_tva, montant_ttc)
          select md5('${ent}' || g)::uuid, '${ent}', 'CHG-${i}-' || g, md5('${ent}' || 'cli')::uuid, 'simple', 'envoyee',
                 current_date - 120, current_date - 90 + (g % 60), 100, 20, 120
          from generate_series(1, ${PAR_TENANT}) g;
        -- 60 % au maximum (3 envoyées il y a 30 j), 20 % relancées hier, 20 % jamais relancées.
        insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi)
          select '${ent}', 'facture', md5('${ent}' || g)::uuid, n, 'envoyee', true, now() - interval '30 days'
          from generate_series(1, ${PAR_TENANT}) g cross join generate_series(1, 3) n where g % 5 < 3;
        insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi)
          select '${ent}', 'facture', md5('${ent}' || g)::uuid, 1, 'envoyee', true, now() - interval '1 day'
          from generate_series(1, ${PAR_TENANT}) g where g % 5 = 3;
      `);
    }
    pg(`analyze factures; analyze relances_documents;`);
    const liste = tenants.map((t) => `'${t}'`).join(",");
    const dues = Number(pg(`select count(*) from factures f where f.entreprise_id in (${liste})
      and not exists (select 1 from relances_documents r where r.document_id = f.id)`));

    const admin = createClient(URL_PGRST!, jwtService(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { traiterRelancesAutomatiques } = await import("@/lib/relances-cron");
    const passages: Array<{ passage: number; secondes: number; envoyees: number; ignorees: number; echecs: number; dues_atteintes_cumul: number }> = [];
    for (let p = 1; p <= 3; p++) {
      const debut = Date.now();
      const r = await traiterRelancesAutomatiques(admin);
      expect(r.erreur).toBeUndefined();
      const nos = r.details.filter((d) => tenants.includes(d.entrepriseId));
      passages.push({
        passage: p,
        secondes: (Date.now() - debut) / 1000,
        envoyees: nos.filter((d) => d.statut === "envoyee").length,
        ignorees: nos.filter((d) => d.statut === "ignoree").length,
        echecs: nos.filter((d) => d.statut === "echec").length,
        dues_atteintes_cumul: Number(pg(`select count(distinct r.document_id) from relances_documents r join factures f on f.id = r.document_id
          where f.entreprise_id in (${liste}) and r.niveau = 1 and r.statut = 'envoyee' and r.date_envoi > now() - interval '1 hour'`)),
      });
    }
    const auDela = Number(pg(`select count(*) from (select document_id from relances_documents r join factures f on f.id = r.document_id
      where f.entreprise_id in (${liste}) and r.statut = 'envoyee' group by document_id having count(*) > 3) x`));
    const doublonsJour = Number(pg(`select count(*) from (select document_id from relances_documents r join factures f on f.id = r.document_id
      where f.entreprise_id in (${liste}) and r.statut = 'envoyee' and r.date_envoi > now() - interval '1 hour' group by document_id having count(*) > 1) x`));
    const resultat = { factures: TENANTS * PAR_TENANT, tenants: TENANTS, dues_jamais_relancees: dues, passages,
      dues_non_atteintes: dues - passages[passages.length - 1].dues_atteintes_cumul, relances_au_dela_du_maximum: auDela, doublons_meme_jour: doublonsJour };
    process.stdout.write(`${JSON.stringify(resultat)}\n`);
    if (process.env.CHARGE_SORTIE) writeFileSync(process.env.CHARGE_SORTIE, JSON.stringify(resultat, null, 2));
    expect(auDela).toBe(0);
    expect(doublonsJour).toBe(0);
    expect(resultat.dues_non_atteintes).toBe(0);
  });
});
