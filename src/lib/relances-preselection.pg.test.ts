import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { evaluerEligibiliteDevis, evaluerEligibiliteFacture } from "./relances-moteur";
import { PARAMETRES_RELANCES_DEFAUT, type ParametresRelances } from "./relances";

// ELSATIA PERFORMANCE HARDENING V9.1 — P1-B : propriété « le pré-filtre SQL n'écarte JAMAIS un
// document que le moteur TypeScript jugerait éligible ». Population aléatoire (graine fixe) écrite
// dans une base locale jetable, puis, pour CHAQUE document ouvert, le vrai moteur
// (evaluerEligibiliteDevis/Facture, chemin de service) est confronté à la sélection SQL
// relances_auto_candidats_service. Aucun mock de règle : seul le transport RPC est remplacé par
// une lecture psql des mêmes fonctions de service.
//
// Actif seulement si HARDENING_PG_DB désigne une base migrée (≥ 20261003001502) jetable :
//   HARDENING_PG_DB=<base> npx vitest run src/lib/relances-preselection.pg.test.ts
const BASE = process.env.HARDENING_PG_DB;
// Entreprise neuve à chaque exécution : la population ne s'accumule pas d'un passage à l'autre.
const ENT = randomUUID();

vi.mock("@/lib/brevo", () => ({ brevoEstConfigure: () => true, envoyerEmailBrevo: vi.fn() }));

function pg(sql: string): string {
  return execFileSync("su", ["postgres", "-c", `psql -X -A -t -q -v ON_ERROR_STOP=1 -d ${BASE}`], { input: sql, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
}

const POPULATION = `
begin;
select setseed(0.31);
insert into entreprises (id, nom, abonnement_statut) values ('${ENT}', 'Préselection', 'actif') on conflict (id) do nothing;
insert into parametres_relances (entreprise_id, devis_auto_actif, factures_auto_actif, envoyer_weekend,
  devis_delai_premiere_relance_jours, devis_delai_entre_relances_jours, devis_nombre_max_relances,
  factures_delai_premiere_relance_jours, factures_delai_entre_relances_jours, factures_nombre_max_relances)
values ('${ENT}', true, true, true, 7, 5, 2, 3, 7, 3)
on conflict (entreprise_id) do update set devis_auto_actif = true, factures_auto_actif = true, envoyer_weekend = true, pause_jusqu_au = null;
create temp table cl as
select gen_random_uuid() id, g,
  (array['ok','ok','ok','sans_email','vide','espaces','exclu'])[1 + (g % 7)] genre
from generate_series(1, 21) g;
insert into clients (id, entreprise_id, type, nom, adresse_facturation, code_postal, ville, email, statut, relance_auto_exclue)
select id, '${ENT}', 'professionnel', 'Pré ' || g, '1 rue', '67000', 'Strasbourg',
  case genre when 'sans_email' then null when 'vide' then '' when 'espaces' then '   ' else 'c' || g || '@pre.invalid' end,
  'actif', genre = 'exclu'
from cl;
-- Factures : statuts, échéances (-120..+10 j), exclusions, paiements, historiques variés.
create temp table fa as
select gen_random_uuid() id, s.g, (select cl.id from cl where cl.g = 1 + (s.g % 21)) client_id,
  current_date - (floor(random() * 131)::int - 10) echeance, random() < 0.1 exclue,
  (array['envoyee','envoyee','payee_partiel','soldee','annulee','brouillon'])[1 + floor(random() * 6)::int] cible
from generate_series(1, 700) s(g);
insert into factures (id, entreprise_id, client_id, type, statut, date_emission, date_echeance, relance_auto_exclue)
select id, '${ENT}', client_id, 'simple', 'brouillon', echeance - 30, echeance, exclue from fa;
insert into lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select id, 'Pré', 'fourniture', 1, 'u', 100, 0, 20, 1 from fa;
update factures f set statut = 'envoyee' from fa where f.id = fa.id and fa.cible <> 'brouillon';
insert into paiements (facture_id, montant, date, mode, reference)
select id, case when cible = 'soldee' then 120 else 50 end, current_date - 1, 'virement', 'PRE' from fa where cible in ('soldee', 'payee_partiel');
update factures f set statut = 'annulee' from fa where f.id = fa.id and fa.cible = 'annulee';
-- Devis : envoyés / acceptés / refusés, émission -60..0 j.
create temp table dv as
select gen_random_uuid() id, s.g, (select cl.id from cl where cl.g = 1 + ((s.g * 5) % 21)) client_id,
  current_date - floor(random() * 61)::int emission, random() < 0.1 exclue,
  (array['envoye','envoye','envoye','accepte','refuse'])[1 + floor(random() * 5)::int] cible
from generate_series(1, 300) s(g);
insert into devis (id, entreprise_id, client_id, statut, date_emission, date_validite, relance_auto_exclue)
select id, '${ENT}', client_id, 'brouillon', emission, emission + 60, exclue from dv;
insert into lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
select id, 'Pré', 'fourniture', 1, 'u', 100, 0, 20, 1 from dv;
update devis d set statut = dv.cible from dv where d.id = dv.id;
-- Historique : 0..5 relances envoyées (dates 0..30 j), parfois un échec fournisseur récent.
insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi, created_at)
select '${ENT}', t, doc, n, 'envoyee', true, now() - (age || ' hours')::interval, now() - (age || ' hours')::interval
from (
  select 'facture' t, id doc, floor(random() * 4)::int nb, floor(random() * 720)::int age from fa
  union all
  select 'devis', id, floor(random() * 3)::int, floor(random() * 720)::int from dv
) h cross join lateral generate_series(1, h.nb) n;
insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, created_at)
select '${ENT}', 'facture', id, 5, 'echec', true, now() - interval '2 hours' from fa where random() < 0.15;
commit;
`;

describe.skipIf(!BASE)("relances — le pré-filtre SQL ne retire jamais un document éligible (moteur réel)", () => {
  it("chaque document jugé éligible par le moteur figure dans la sélection SQL", async () => {
    pg(POPULATION);
    const documents = new Map<string, unknown>(
      Object.entries(JSON.parse(pg(`
        select coalesce(json_object_agg(t || ':' || id, relance_document_service('${ENT}', t, id)), '{}')
        from (select 'facture' t, id from factures where entreprise_id = '${ENT}'
              union all select 'devis', id from devis where entreprise_id = '${ENT}') x;`)) as Record<string, unknown>),
    );
    const admin = {
      rpc: async (nom: string, args: { p_type_document: string; p_document_id: string }) => {
        if (nom !== "relance_document_service") throw new Error(`RPC inattendue ${nom}`);
        return { data: documents.get(`${args.p_type_document}:${args.p_document_id}`) ?? null, error: null };
      },
      from: () => { throw new Error("aucune lecture directe"); },
    } as never;
    const p = JSON.parse(pg(`select row_to_json(p) from parametres_relances p where entreprise_id = '${ENT}'`));
    const config: ParametresRelances = {
      ...PARAMETRES_RELANCES_DEFAUT,
      entrepriseId: ENT,
      devisAutoActif: true,
      facturesAutoActif: true,
      envoyerWeekend: true,
      pauseJusquAu: null,
      devisDelaiPremiereRelanceJours: p.devis_delai_premiere_relance_jours,
      devisDelaiEntreRelancesJours: p.devis_delai_entre_relances_jours,
      devisNombreMaxRelances: p.devis_nombre_max_relances,
      facturesDelaiPremiereRelanceJours: p.factures_delai_premiere_relance_jours,
      facturesDelaiEntreRelancesJours: p.factures_delai_entre_relances_jours,
      facturesNombreMaxRelances: p.factures_nombre_max_relances,
    };
    const aujourdhui = new Date();

    for (const type of ["facture", "devis"] as const) {
      const selection = new Set(pg(`select id from relances_auto_candidats_service('${ENT}', '${type}', 200)`).split("\n").filter(Boolean));
      // La propriété n'est vérifiable que si le plafond n'a pas tronqué la sélection.
      expect(selection.size).toBeLessThan(200);
      const ouverts = pg(`select id from ${type === "facture" ? "factures" : "devis"} where entreprise_id = '${ENT}'`).split("\n").filter(Boolean);
      const eligibles: string[] = [];
      for (const id of ouverts) {
        const r = type === "facture"
          ? await evaluerEligibiliteFacture(admin, ENT, id, config, { pourAuto: true, aujourdhui, service: true })
          : await evaluerEligibiliteDevis(admin, ENT, id, config, { pourAuto: true, aujourdhui, service: true });
        if (r.eligible) eligibles.push(id);
      }
      const manquants = eligibles.filter((id) => !selection.has(id));
      expect(eligibles.length).toBeGreaterThan(10);
      expect(manquants).toEqual([]);
      // Précision : la sélection ne contient (presque) que des éligibles.
      const fauxPositifs = [...selection].filter((id) => !eligibles.includes(id));
      process.stdout.write(`${type}: ${ouverts.length} documents, ${eligibles.length} éligibles (moteur), ${selection.size} sélectionnés (SQL), ${fauxPositifs.length} faux positifs\n`);
      expect(fauxPositifs.length).toBeLessThanOrEqual(Math.ceil(selection.size * 0.1));
    }
  }, 120_000);
});
