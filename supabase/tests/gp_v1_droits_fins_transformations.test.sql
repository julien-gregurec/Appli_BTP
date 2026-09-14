-- =====================================================================================================
-- PREUVE pgTAP (intégrée au ledger le 2026-09-12, GP V1 lot 0) — ELSATIA-GP-V1-METIER, lot D « droits fins, transformations, documents issus »
-- =====================================================================================================
-- Acteurs : A dirigeant …-0006 (tous droits) ; A conducteur …-0004 (gerer_devis → reçoit les clés fines,
-- puis on lui en retire pour prouver les refus) ; A ouvrier …-0002 ; A comptable …-0005 (gerer_factures).
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.droit(p_poste uuid, p_cle text, p_val boolean) returns void language sql as $$
  insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
  values ('a0000000-0000-0000-0000-000000000001', p_poste, p_cle, p_val)
  on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = excluded.autorise
$$;
create or replace function pg_temp.entete() returns jsonb language sql as $$
  select '{"client_id":"a3000000-0000-0000-0000-000000000001","conditions":"PGTAP-DROITS","remise_globale":0}'::jsonb
$$;
create or replace function pg_temp.lignes(p_prix numeric, p_remise numeric default 0) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('cle_ligne','l1','ordre',1000,'type_ligne','libre','designation','Pose','type','main_oeuvre',
    'quantite',2,'unite','h','prix_unitaire_ht',p_prix,'remise_ligne',p_remise,'taux_tva',20))
$$;

-- Droit fin : hérité de gerer_devis quand il n'est pas configuré (poste créé après le rattrapage), fermé
-- s'il est configuré à faux, jamais ouvert pour un poste sans gerer_devis.
select is((select count(*)::int from public.permissions_poste where poste_id = 'a1000000-0000-0000-0000-000000000004'
            and cle_permission in ('modifier_prix_vente','modifier_remise','supprimer_devis','transformer_devis','envoyer_devis')), 0,
  'fixture : le conducteur n''a aucune clé fine configurée (créé après le rattrapage)');
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select ok(public.droit_fin('a0000000-0000-0000-0000-000000000001', 'modifier_prix_vente', 'gerer_devis'), 'droit fin : hérité de gerer_devis — aucune perte de droit');
select pg_temp.jwt('10000000-0000-0000-0000-000000000002');
select ok(not public.droit_fin('a0000000-0000-0000-0000-000000000001', 'modifier_prix_vente', 'gerer_devis'), 'droit fin : fermé pour l''ouvrier (pas de gerer_devis)');
reset role;
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'supprimer_devis', false);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select ok(not public.droit_fin('a0000000-0000-0000-0000-000000000001', 'supprimer_devis', 'gerer_devis'), 'droit fin : configuré à faux → fermé malgré gerer_devis');
reset role;
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'supprimer_devis', true);
select is((select count(*)::int from public.modeles_roles_predefinis where cle in ('commercial','poseur')), 2, 'modèles : Commercial et Poseur');
select ok((select 'modifier_prix_vente' = any(permissions) and not ('voir_couts_devis' = any(permissions)) from public.modeles_roles_predefinis where cle = 'commercial'),
  'modèle Commercial : prix de vente oui, coûts non');
select ok((select 'modifier_prix_vente' = any(permissions) from public.modeles_roles_predefinis where cle = 'conducteur_travaux'), 'modèles existants : clés ajoutées à qui gère les devis');

set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');

-- Conducteur : crée un devis avec un prix libre (il a modifier_prix_vente).
create temp table t_d as select ((public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', null, pg_temp.entete(), '[]'::jsonb, pg_temp.lignes(50))) ->> 'id')::uuid as id;
select ok((select id is not null from t_d), 'avec modifier_prix_vente : ligne libre à 50 € acceptée');

-- On lui retire le prix de vente et la remise.
reset role;
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'modifier_prix_vente', false);
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'modifier_remise', false);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');

select throws_ok(format($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', %L, pg_temp.entete(), '[]'::jsonb, pg_temp.lignes(60), '[]'::jsonb, 1)$$, (select id from t_d)),
  '42501', null, 'sans modifier_prix_vente : changer le prix d''une ligne existante est refusé');
select lives_ok(format($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', %L, pg_temp.entete(), '[]'::jsonb, pg_temp.lignes(50), '[]'::jsonb, 1)$$, (select id from t_d)),
  'sans modifier_prix_vente : réenregistrer au même prix passe');
select throws_ok($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', null, pg_temp.entete(), '[]'::jsonb, pg_temp.lignes(10))$$,
  '42501', null, 'sans modifier_prix_vente : une nouvelle ligne libre chiffrée est refusée');
select throws_ok($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', null, pg_temp.entete(), '[]'::jsonb,
  '[{"cle_ligne":"c1","ordre":1000,"type_ligne":"article","designation":"Cat","type":"fourniture","quantite":1,"unite":"u","prix_unitaire_ht":99,"remise_ligne":0,"taux_tva":20,"source_catalogue":"prestation","source_id":"e1000000-0000-0000-0000-000000000009"}]'::jsonb)$$,
  '42501', null, 'sans modifier_prix_vente : un article inséré à un autre prix que le catalogue est refusé');
reset role;
insert into public.prestations_catalogue (id, entreprise_id, designation, type, unite, prix_unitaire_ht, taux_tva)
  values ('e1000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'PGTAP Cat', 'fourniture', 'u', 99, 20);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select lives_ok($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', null, pg_temp.entete(), '[]'::jsonb,
  '[{"cle_ligne":"c1","ordre":1000,"type_ligne":"article","designation":"Cat","type":"fourniture","quantite":1,"unite":"u","prix_unitaire_ht":99,"remise_ligne":0,"taux_tva":20,"source_catalogue":"prestation","source_id":"e1000000-0000-0000-0000-000000000009"}]'::jsonb)$$,
  'sans modifier_prix_vente : un article inséré AU prix du catalogue passe');
select throws_ok(format($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', %L, pg_temp.entete(), '[]'::jsonb, pg_temp.lignes(50, 10), '[]'::jsonb, 2)$$, (select id from t_d)),
  '42501', null, 'sans modifier_remise : une remise de ligne est refusée');
select throws_ok(format($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', %L, pg_temp.entete() || '{"remise_globale":5}', '[]'::jsonb, pg_temp.lignes(50), '[]'::jsonb, 2)$$, (select id from t_d)),
  '42501', null, 'sans modifier_remise : la remise globale est refusée');
select throws_ok(format($$select public.enregistrer_devis_brouillon_v2('a0000000-0000-0000-0000-000000000001', %L, pg_temp.entete(), '[]'::jsonb,
  pg_temp.lignes(50) || '[{"cle_ligne":"r1","ordre":2000,"type_ligne":"remise","designation":"Remise","type":"forfait","quantite":1,"unite":"u","prix_unitaire_ht":-5,"remise_ligne":0,"taux_tva":20}]'::jsonb, '[]'::jsonb, 2)$$, (select id from t_d)),
  '42501', null, 'sans modifier_remise : une ligne de remise est refusée');

-- Suppression et envoi.
reset role;
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'supprimer_devis', false);
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'envoyer_devis', false);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
delete from public.devis where id = (select id from t_d);
select is((select count(*)::int from public.devis where id = (select id from t_d)), 1, 'sans supprimer_devis : la suppression est sans effet (RLS)');
select throws_ok(format($$update public.devis set statut = 'envoye' where id = %L$$, (select id from t_d)), '42501', null,
  'sans envoyer_devis : le passage à « envoyé » est refusé');
reset role;
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'envoyer_devis', true);
select pg_temp.droit('a1000000-0000-0000-0000-000000000004', 'supprimer_devis', true);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select lives_ok(format($$update public.devis set statut = 'envoye' where id = %L$$, (select id from t_d)), 'avec envoyer_devis : envoi accepté');
select is((select apres #>> '{}' from public.historique_objets where ressource = 'devis' and ressource_id = (select id from t_d) and action = 'statut_modifie' order by id desc limit 1),
  'envoye', 'historique : changement de statut journalisé');
select ok(exists (select 1 from public.historique_objets where ressource = 'devis' and ressource_id = (select id from t_d) and action = 'creation'), 'historique : création journalisée');

-- Transformation.
reset role;
update public.devis set statut = 'accepte' where id = (select id from t_d);
select pg_temp.droit('a1000000-0000-0000-0000-000000000005', 'transformer_devis', false);
set local role authenticated;
select pg_temp.jwt('10000000-0000-0000-0000-000000000005');
select throws_ok(format($$select public.creer_facture_depuis_devis(%L)$$, (select id from t_d)), '42501', null,
  'comptable avec gerer_factures mais sans transformer_devis : conversion refusée');
select pg_temp.jwt('10000000-0000-0000-0000-000000000006');
create temp table t_f as select public.creer_facture_depuis_devis((select id from t_d)) as id;
select ok((select id is not null from t_f), 'dirigeant : conversion acceptée');
select is((select jsonb_array_length(public.documents_issus_devis((select id from t_d)) -> 'factures')), 1, 'documents issus : la facture apparaît');
select pg_temp.jwt('10000000-0000-0000-0000-000000000004');
select is((select jsonb_array_length(public.documents_issus_devis((select id from t_d)) -> 'factures')), 0, 'documents issus : le conducteur sans accès factures ne la voit pas (RLS)');
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is((select public.documents_issus_devis((select id from t_d)) -> 'factures'), '[]'::jsonb, 'documents issus : cloisonnés par entreprise');

select * from finish();
rollback;
