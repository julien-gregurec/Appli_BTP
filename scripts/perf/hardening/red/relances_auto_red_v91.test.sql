-- ELSATIA SOAK V1 — Domaine G : sélection des candidats de relance automatique.
-- Tests ROUGES/VERTS hors suite CI. Base : soak (migrations + fixture).
--   su postgres -c "pg_prove -d soak scripts/perf/soak/tests/relances_auto_red.test.sql"
-- relances_auto_candidats_service(p_entreprise_id, type, 200) : LIMIT 200 sans ORDER BY ni
-- filtre d'éligibilité ; l'éligibilité (délais, nombre max, week-end) est évaluée ensuite
-- document par document côté TypeScript (src/lib/relances-moteur.ts).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(7);

\set entb '\'b0000000-0000-4000-b000-000000000001\''
-- Neutralise les factures ouvertes existantes du tenant B pour un état maîtrisé.
update factures set relance_auto_exclue = true where entreprise_id = :entb;

create temp table g_fac (rang int, id uuid);
create function pg_temp.creer_factures(p_n int, p_prefixe text, p_echeance date) returns void language plpgsql as $$
declare i int; v uuid;
begin
  for i in 1..p_n loop
    insert into factures (entreprise_id, client_id, type, statut, date_emission, date_echeance)
    values ('b0000000-0000-4000-b000-000000000001',
            (select id from clients where entreprise_id = 'b0000000-0000-4000-b000-000000000001' order by id limit 1),
            'simple', 'brouillon', p_echeance - 30, p_echeance)
    returning id into v;
    insert into g_fac values ((select count(*) from g_fac) + 1, v);
    update factures set statut = 'envoyee' where id = v;
  end loop;
end $$;

-- G1/G2 Famine : 200 factures déjà relancées au maximum (5 niveaux « envoyee », donc
-- inéligibles à jamais) insérées AVANT 1 facture saine en retard.
select pg_temp.creer_factures(200, 'max', current_date - 90);
insert into relances_documents (entreprise_id, type_document, document_id, niveau, statut, automatique, date_envoi)
select :entb, 'facture', g.id, n, 'envoyee', true, now() - (n || ' days')::interval from g_fac g cross join generate_series(1, 5) n;
select pg_temp.creer_factures(1, 'saine', current_date - 20);
select is((select count(*)::int from relances_auto_candidats_service(:entb, 'facture', 200)), 200,
  'G1 le plafond de 200 candidats est atteint (contrôle)');
select ok(
  (select g.id from g_fac g where g.rang = 201) in (select id from relances_auto_candidats_service(:entb, 'facture', 200)),
  'G2 une facture éligible n''est jamais évincée durablement par 200 factures inéligibles (relances max atteintes)');

-- G3 la RPC trie explicitement (sélection déterministe / équitable entre runs).
select ok(
  pg_get_functiondef('public.relances_auto_candidats_service(uuid,text,integer)'::regprocedure) ~* 'order\s+by',
  'G3 relances_auto_candidats_service trie explicitement');

-- G4 Cloisonnement : aucun candidat d'un autre tenant.
select is((select count(*)::int from relances_auto_candidats_service(:entb, 'facture', 200) c
           join factures f on f.id = c.id where f.entreprise_id <> :entb), 0,
  'G4 aucun candidat hors tenant');

-- G5 Prévention des doublons : 2 réclamations du même niveau → une seule réussit.
select isnt(relance_reclamer(:entb, 'facture', (select id from g_fac where rang = 201), 1, 'x@soak.invalid', 's', true, null), null,
  'G5a première réclamation du niveau 1 : verrou obtenu');
select is(relance_reclamer(:entb, 'facture', (select id from g_fac where rang = 201), 1, 'x@soak.invalid', 's', true, null), null,
  'G5b seconde réclamation du même niveau : refusée (pas de double relance)');

-- G6 Reprise après échec fournisseur : un niveau « echec » peut être retenté.
select relance_finaliser((select id from relances_documents where document_id = (select id from g_fac where rang = 201) and niveau = 1 and statut = 'planifiee'), 'echec', null, 'Brevo indisponible', 'service_indisponible');
select isnt(relance_reclamer(:entb, 'facture', (select id from g_fac where rang = 201), 1, 'x@soak.invalid', 's', true, null), null,
  'G6 après un échec (service indisponible), le même niveau est réclamable à nouveau');

select * from finish();
rollback;
