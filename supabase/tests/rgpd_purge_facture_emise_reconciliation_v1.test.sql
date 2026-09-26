-- RGPD × immutabilité des factures émises — réconciliation V1
-- (migration 20260926000401, ex-20260923000347, rapport
-- docs/qualification/ELSATIA_RGPD_INVOICE_IMMUTABILITY_RECONCILIATION_V1.md).
--
--   1. Sécurité : l'exception de purge est inatteignable pour authenticated,
--      l'administrateur du tenant, service_role hors fonction de purge, et ne vaut que
--      pour son tenant, sa table, et le seul délien d'une référence supprimée.
--   2. Tenant réaliste A (fixtures/rgpd_tenant_facture_emise.inc) : les factures ne
--      bloquent plus la purge ; seuls les verrous des contrats acceptés (devis,
--      avenants) la bloquent encore (DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE,
--      politique non décidée par défaut, 20260926000402) — et aucune facture n'a bougé.
--   3. Tenant C (factures émises, pas de contrat accepté) : garde-fou comptable, purge
--      complète, intégrité comptable de chaque facture conservée, immutabilité après
--      purge, rejeu idempotent.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

\ir fixtures/isolation_multitenant.inc
\ir fixtures/rgpd_tenant_facture_emise.inc

select set_config('t.a', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('t.b', 'b0000000-0000-0000-0000-000000000001', true);
select set_config('t.c', 'cc000000-0000-0000-0000-000000000001', true);
select set_config('t.chantier', 'c2000000-0000-0000-0000-000000000001', true);
select set_config('t.devis', 'c3000000-0000-0000-0000-000000000001', true);

-- Tenant C : facture d'acompte émise sur un devis envoyé (pas encore accepté), payée en
-- partie, puis créditée par un avoir ; document de chantier dans Storage.
insert into public.entreprises (id, nom, raison_sociale, siret, adresse, code_postal, ville, code_adhesion)
values ('cc000000-0000-0000-0000-000000000001', 'Entreprise C', 'C Rénovation EURL', '98765432100019',
        '5 quai des Bateliers', '67000', 'Strasbourg', 'ISOC0001');
insert into public.clients (id, entreprise_id, type, nom, prenom, adresse_facturation, code_postal, ville, telephone, email, statut)
values ('cc100000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'particulier',
        'Weber', 'Anne', '12 rue des Vosges', '67200', 'Strasbourg', '0622334455', 'anne.weber@example.test', 'actif');
insert into public.chantiers (id, entreprise_id, client_id, nom, adresse, code_postal, ville, statut)
values ('cc200000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
        'Salle de bain Weber', '12 rue des Vosges', '67200', 'Strasbourg', 'en_cours');
insert into public.devis (id, entreprise_id, client_id, chantier_id, statut)
values ('cc300000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
        'cc200000-0000-0000-0000-000000000001', 'brouillon');
insert into public.lignes_devis (devis_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
values ('cc300000-0000-0000-0000-000000000001', 'Carrelage', 'fourniture', 10, 'm2', 50, 10, 1);
update public.devis set statut = 'envoye' where id = 'cc300000-0000-0000-0000-000000000001';

insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, type, statut)
values ('cc400000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
        'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000001', 'acompte', 'brouillon');
insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre) values
  ('cc400000-0000-0000-0000-000000000001', 'Acompte carrelage', 'fourniture', 1, 'forfait', 200, 10, 1),
  ('cc400000-0000-0000-0000-000000000001', 'Acompte main d''œuvre', 'main_oeuvre', 1, 'forfait', 100, 20, 2);
update public.factures set statut = 'envoyee' where id = 'cc400000-0000-0000-0000-000000000001';
insert into public.paiements (facture_id, montant, date, mode, reference)
values ('cc400000-0000-0000-0000-000000000001', 100, current_date - 3, 'virement', 'VIR-C-1');

insert into public.factures (id, entreprise_id, client_id, chantier_id, devis_origine_id, facture_origine_id, type, statut)
values ('cc400000-0000-0000-0000-000000000002', 'cc000000-0000-0000-0000-000000000001', 'cc100000-0000-0000-0000-000000000001',
        'cc200000-0000-0000-0000-000000000001', 'cc300000-0000-0000-0000-000000000001', 'cc400000-0000-0000-0000-000000000001', 'avoir', 'brouillon');
insert into public.lignes_factures (facture_id, designation, type, quantite, unite, prix_unitaire_ht, taux_tva, ordre)
values ('cc400000-0000-0000-0000-000000000002', 'Avoir remise carrelage', 'fourniture', -1, 'forfait', 20, 10, 1);
update public.factures set statut = 'envoyee' where id = 'cc400000-0000-0000-0000-000000000002';

insert into public.documents_chantier (id, entreprise_id, chantier_id, nom, storage_path, mime_type, taille_octets, audience)
values ('cc500000-0000-0000-0000-000000000001', 'cc000000-0000-0000-0000-000000000001', 'cc200000-0000-0000-0000-000000000001',
        'Plan salle de bain', 'cc000000-0000-0000-0000-000000000001/cc200000-0000-0000-0000-000000000001/plan.pdf', 'application/pdf', 10, 'gestionnaires');
insert into storage.objects (id, bucket_id, name, metadata)
values ('cc800000-0000-0000-0000-000000000001', 'chantier-documents', 'cc000000-0000-0000-0000-000000000001/cc200000-0000-0000-0000-000000000001/plan.pdf', '{"mimetype":"application/pdf"}');

-- Photographie avant purge : contenu comptable de chaque facture des tenants A, B, C.
create temporary table _avant on commit drop as
select f.id, f.entreprise_id, f.numero, f.type, f.statut, f.date_emission, f.date_echeance,
       f.montant_ht, f.montant_tva, f.montant_ttc, f.montant_paye, f.facture_origine_id,
       f.chantier_id, f.devis_origine_id, f.client_snapshot, f.entreprise_snapshot,
       public.empreinte_comptable_facture(f.id) as empreinte,
       (select jsonb_agg(jsonb_build_object('d', l.designation, 'q', l.quantite, 'pu', l.prix_unitaire_ht, 'tva', l.taux_tva) order by l.ordre, l.id)
          from public.lignes_factures l where l.facture_id = f.id) as lignes,
       (select jsonb_agg(jsonb_build_object('m', p.montant, 'd', p.date, 'r', p.reference) order by p.date, p.id)
          from public.paiements p where p.facture_id = f.id) as paiements
from public.factures f
where f.entreprise_id in (current_setting('t.a')::uuid, current_setting('t.b')::uuid, current_setting('t.c')::uuid);

select is(
  (select count(*)::integer from public.factures
    where id in (current_setting('rgpd.fx_acompte')::uuid, current_setting('rgpd.fx_finale')::uuid,
                 current_setting('rgpd.fx_avoir')::uuid, 'cc400000-0000-0000-0000-000000000001', 'cc400000-0000-0000-0000-000000000002')
      and entreprise_snapshot ->> 'raison_sociale' is not null),
  5,
  'R4 : l''identité émettrice est figée en base à l''émission, quel que soit le chemin d''émission'
);

-- ─────────────────────────────────────────────────────────────
-- 1. Sécurité
-- ─────────────────────────────────────────────────────────────
select is(has_function_privilege('anon', 'public.purger_table_entreprise(uuid,text,uuid)', 'EXECUTE'), false,
  'anon ne peut pas exécuter la purge');
select is(has_function_privilege('authenticated', 'public.purger_table_entreprise(uuid,text,uuid)', 'EXECUTE'), false,
  'authenticated ne peut pas exécuter la purge');
select is(has_function_privilege('authenticated', 'public.empreinte_comptable_factures_entreprise(uuid)', 'EXECUTE'), false,
  'authenticated ne peut pas appeler les fonctions d''empreinte');
select is(has_schema_privilege('authenticated', 'platform', 'USAGE'), false,
  'authenticated n''a aucun accès au schéma platform (autorisations de purge)');
select is(has_table_privilege('service_role', 'platform.purge_autorisations_facture', 'INSERT'), false,
  'service_role ne peut pas déposer lui-même une autorisation de purge');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok(
  format('select * from public.purger_table_entreprise(%L, %L)', current_setting('t.a'), 'chantiers'),
  '42501', null,
  'administrateur du tenant : appel direct de la purge refusé'
);
select throws_like(
  format('update public.factures set chantier_id = null where id = %L', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'administrateur du tenant : délier une facture émise de son chantier est refusé'
);
select throws_like(
  format('update public.factures set devis_origine_id = null, purge_snapshot = %L::jsonb where id = %L',
         jsonb_build_object('devis_origine_id', jsonb_build_object('id', current_setting('t.devis'))), current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'administrateur du tenant : délier du devis en forgeant un purge_snapshot est refusé'
);
select throws_like(
  format('select set_config(%L, %L, true); update public.factures set chantier_id = null where id = %L',
         'elsatia.purge_en_cours', 'on', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'administrateur du tenant : un drapeau de session (GUC) n''ouvre aucune exception'
);
select throws_ok(
  format('insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee) values (txid_current(), %L, %L)',
         current_setting('t.a'), 'chantiers'),
  '42501', null,
  'administrateur du tenant : impossible de forger une autorisation de purge'
);
select throws_like(
  format('update public.factures set montant_ht = 1 where id = %L', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'administrateur du tenant : modification ordinaire d''une facture émise refusée'
);
delete from public.chantiers where id = 'cc200000-0000-0000-0000-000000000001';
reset role;
select is(
  (select count(*)::integer from public.chantiers where id = 'cc200000-0000-0000-0000-000000000001'),
  1,
  'administrateur d''un autre tenant : ne voit ni ne supprime le chantier facturé de C (RLS)'
);

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format('update public.factures set chantier_id = null where id = %L', current_setting('rgpd.fx_finale')),
  '42501', null,
  'service_role : écriture directe sur factures refusée (ACL 20260902000255)'
);
select throws_like(
  'truncate public.factures cascade',
  '%TRUNCATE interdit%',
  'R8 : service_role ne peut pas vider factures par TRUNCATE'
);
select is(
  (select ok from public.purger_table_entreprise(current_setting('t.c')::uuid, 'chantiers')),
  false,
  'service_role : purge refusée tant que l''échéance de suppression n''est pas passée'
);
reset role;

-- Autorisation posée par un superutilisateur : elle ne vaut que pour SON tenant, SA
-- table, et seulement pour délier une référence déjà supprimée et consignée.
insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee)
values (txid_current(), current_setting('t.a')::uuid, 'chantiers');
select throws_like(
  format('update public.factures set chantier_id = null where entreprise_id = %L and statut <> %L', current_setting('t.b'), 'brouillon'),
  '%déjà été émise%',
  'mauvais tenant : une autorisation pour A n''ouvre rien sur les factures de B'
);
select throws_like(
  format('update public.factures set montant_ttc = 0 where id = %L', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'contexte de purge : modifier un montant reste refusé'
);
select throws_like(
  format('update public.factures set chantier_id = null where id = %L', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'contexte de purge : délier un chantier qui existe encore reste refusé'
);
select throws_like(
  format('update public.factures set devis_origine_id = null where id = %L', current_setting('rgpd.fx_finale')),
  '%déjà été émise%',
  'contexte de purge : l''autorisation « chantiers » n''ouvre pas devis_origine_id'
);
select throws_like(
  format('delete from public.factures where id = %L', current_setting('rgpd.fx_finale')),
  '%ne peut plus être supprimée%',
  'contexte de purge : supprimer une facture émise reste refusé'
);
delete from platform.purge_autorisations_facture where txid = txid_current();

-- ─────────────────────────────────────────────────────────────
-- 2. Tenant réaliste A : seuls les contrats acceptés bloquent encore la purge
-- ─────────────────────────────────────────────────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.a')::uuid;
select set_config('rgpd.entreprise_cible', current_setting('t.a'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-00000000000a', true);
\ir fixtures/rgpd_purge_driver.inc

select ok(current_setting('rgpd.resultat') like 'incomplete:%',
  'tenant A : la purge reste incomplète tant que la décision sur les contrats acceptés n''est pas prise');
select is(
  (select count(*)::integer from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-00000000000a' and not ok and erreur like '%facture%'),
  0,
  'tenant A : aucune étape n''échoue plus à cause d''une facture émise'
);
select is(
  -- Depuis 20260926000402 (politique non décidée par défaut), le blocage est un refus
  -- explicite avant écriture, et non plus l'erreur des verrous.
  (select array_agg(distinct table_nom order by table_nom) from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-00000000000a' and not ok
      and erreur not like 'DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE%'),
  null::text[],
  'tenant A : les seuls blocages restants sont les contrats acceptés (DECISION_REQUIRED)'
);
select is(
  (select count(*)::integer from _avant a where a.entreprise_id = current_setting('t.a')::uuid
      and a.empreinte is distinct from public.empreinte_comptable_facture(a.id)),
  0,
  'tenant A : purge partielle, aucune facture modifiée'
);
select is((select purgee_at from public.entreprises where id = current_setting('t.a')::uuid), null,
  'tenant A : entreprise non marquée purgée (purge incomplète, échec sûr)');

-- ─────────────────────────────────────────────────────────────
-- 3. Tenant C : garde-fou comptable, puis purge complète
-- ─────────────────────────────────────────────────────────────
update public.entreprises set suppression_prevue_at = now() - interval '1 second' where id = current_setting('t.c')::uuid;
select set_config('rgpd.entreprise_cible', current_setting('t.c'), true);
select set_config('rgpd.run_id', 'c9000000-0000-0000-0000-00000000000c', true);

-- R3 : un effet de bord qui modifierait une facture sur un champ laissé libre par le
-- verrou (montant payé) pendant une étape de purge annule cette étape.
create function pg_temp.effet_de_bord_facture() returns trigger language plpgsql as $$
begin
  update public.factures set montant_paye = montant_paye + 1 where entreprise_id = old.entreprise_id and statut <> 'brouillon';
  return old;
end $$;
create trigger effet_de_bord_facture after delete on public.documents_chantier for each row execute function pg_temp.effet_de_bord_facture();
\ir fixtures/rgpd_purge_driver.inc
select ok(current_setting('rgpd.resultat') like 'incomplete:%documents_chantier%',
  'R3 : la purge s''arrête sur l''étape qui modifierait une facture conservée');
select ok(
  exists (select 1 from platform.purge_audit
           where run_id = 'c9000000-0000-0000-0000-00000000000c' and table_nom = 'documents_chantier'
             and not ok and erreur like 'Garde-fou comptable%'),
  'R3 : l''échec est consigné dans l''audit avec sa cause'
);
select is(
  (select count(*)::integer from _avant a where a.entreprise_id = current_setting('t.c')::uuid
      and a.empreinte is distinct from public.empreinte_comptable_facture(a.id)),
  0,
  'R3 : aucune facture n''a été modifiée'
);
drop trigger effet_de_bord_facture on public.documents_chantier;

-- Reprise du même run, sans l'effet de bord.
\ir fixtures/rgpd_purge_driver.inc
select is(current_setting('rgpd.resultat'), 'complete', 'tenant C : la purge complète aboutit malgré des factures émises');
select is(
  (select count(*)::integer from public.chantiers where entreprise_id = current_setting('t.c')::uuid)
  + (select count(*)::integer from public.devis where entreprise_id = current_setting('t.c')::uuid),
  0,
  'tenant C : chantier et devis supprimés'
);
select is(
  (select count(*)::integer from public.factures where entreprise_id = current_setting('t.c')::uuid),
  2,
  'tenant C : facture et avoir conservés'
);
select is(
  (select count(*)::integer from _avant a where a.entreprise_id = current_setting('t.c')::uuid
      and a.empreinte is distinct from public.empreinte_comptable_facture(a.id)),
  0,
  'tenant C : empreinte comptable identique pour chaque facture conservée'
);
select is(
  (select count(*)::integer from _avant a join public.factures f on f.id = a.id
    where a.entreprise_id = current_setting('t.c')::uuid
      and ((f.numero, f.type, f.statut, f.date_emission, f.date_echeance, f.montant_ht, f.montant_tva, f.montant_ttc, f.montant_paye, f.facture_origine_id)
           is distinct from
           (a.numero, a.type, a.statut, a.date_emission, a.date_echeance, a.montant_ht, a.montant_tva, a.montant_ttc, a.montant_paye, a.facture_origine_id)
        or a.lignes is distinct from (select jsonb_agg(jsonb_build_object('d', l.designation, 'q', l.quantite, 'pu', l.prix_unitaire_ht, 'tva', l.taux_tva) order by l.ordre, l.id)
                                      from public.lignes_factures l where l.facture_id = a.id)
        or a.paiements is distinct from (select jsonb_agg(jsonb_build_object('m', p.montant, 'd', p.date, 'r', p.reference) order by p.date, p.id)
                                         from public.paiements p where p.facture_id = a.id))),
  0,
  'tenant C : numéro, dates, totaux, TVA par ligne, paiements et lien d''avoir inchangés'
);
select is(
  (select row(montant_ht, montant_tva, montant_ttc, montant_paye) from public.factures where id = 'cc400000-0000-0000-0000-000000000001'),
  row(300::numeric, 40::numeric, 340::numeric, 100::numeric),
  'tenant C : totaux attendus (300 HT, TVA 10 % + 20 % = 40, 340 TTC, 100 réglés)'
);
select is(
  (select row(client_snapshot ->> 'nom_affiche', client_snapshot ->> 'adresse_facturation', entreprise_snapshot ->> 'siret')
     from public.factures where id = 'cc400000-0000-0000-0000-000000000001'),
  row('Anne Weber'::text, '12 rue des Vosges'::text, '98765432100019'::text),
  'tenant C : identités figées du destinataire et de l''émetteur intactes'
);
select is(
  (select row(c.nom, c.email, e.nom, e.siret) from public.clients c join public.entreprises e on e.id = c.entreprise_id
    where c.id = 'cc100000-0000-0000-0000-000000000001'),
  row('Anonymise RGPD'::text, null::text, 'Entreprise supprimee'::text, null::text),
  'tenant C : fiches vivantes client et entreprise anonymisées'
);
select is(
  (select count(*)::integer from public.factures f
    where f.entreprise_id = current_setting('t.c')::uuid and (f.chantier_id is not null or f.devis_origine_id is not null)),
  0,
  'tenant C : aucune référence cassée'
);
select is(
  (select row(purge_snapshot -> 'chantier_id' ->> 'id', purge_snapshot -> 'chantier_id' ->> 'libelle',
              purge_snapshot -> 'devis_origine_id' ->> 'id')
     from public.factures where id = 'cc400000-0000-0000-0000-000000000002'),
  row('cc200000-0000-0000-0000-000000000001'::text, 'Salle de bain Weber'::text, 'cc300000-0000-0000-0000-000000000001'::text),
  'tenant C : références chantier et devis consignées avant délien'
);
select is(
  (select count(*)::integer from platform.purge_audit
    where run_id = 'c9000000-0000-0000-0000-00000000000c' and etape = 'purge_table' and ok
      and table_nom in ('chantiers', 'devis') and detail ->> 'controle_factures' = 'empreinte_inchangee'),
  2,
  'audit : les étapes chantiers et devis consignent le contrôle d''empreinte'
);
select is((select count(*)::integer from platform.purge_autorisations_facture), 0,
  'aucune autorisation de purge ne subsiste');
select is(
  (select count(*)::integer from storage.objects where name like 'cc000000-0000-0000-0000-000000000001/%'),
  0,
  'Storage : le document de chantier (orphelin) est supprimé'
);
select is(
  (select count(*)::integer from _avant a where a.entreprise_id = current_setting('t.b')::uuid
      and (a.empreinte is distinct from public.empreinte_comptable_facture(a.id)
           or a.chantier_id is distinct from (select chantier_id from public.factures where id = a.id))),
  0,
  'isolation : les factures de B sont intactes'
);

-- ─────────────────────────────────────────────────────────────
-- 4. Immutabilité après purge, rejeu
-- ─────────────────────────────────────────────────────────────
select throws_like(
  'update public.factures set notes_client = ''modifiée'' where id = ''cc400000-0000-0000-0000-000000000001''',
  '%déjà été émise%',
  'après purge : la facture conservée reste non modifiable'
);
select throws_like(
  'update public.factures set purge_snapshot = ''{}'' where id = ''cc400000-0000-0000-0000-000000000001''',
  '%déjà été émise%',
  'après purge : la trace de purge ne peut pas être effacée'
);
select throws_like(
  'delete from public.factures where id = ''cc400000-0000-0000-0000-000000000001''',
  '%ne peut plus être supprimée%',
  'après purge : la facture conservée reste non supprimable'
);
set local role service_role;
select is(
  (select row(ok, lignes_supprimees) from public.purger_table_entreprise(current_setting('t.c')::uuid, 'chantiers', 'c9000000-0000-0000-0000-00000000000c')),
  row(true, 0),
  'rejeu : purger à nouveau chantiers est idempotent (ok, 0 ligne)'
);
reset role;
select is(
  (select count(*)::integer from _avant a where a.entreprise_id = current_setting('t.c')::uuid
      and a.empreinte is distinct from public.empreinte_comptable_facture(a.id)),
  0,
  'rejeu : empreintes toujours identiques'
);

select * from finish();
rollback;
