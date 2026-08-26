begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\ir fixtures/isolation_multitenant.inc

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','ee990000-0000-4000-8000-000000000001','authenticated','authenticated','support-239@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','ee990000-0000-4000-8000-000000000002','authenticated','authenticated','facturation-239@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','ee990000-0000-4000-8000-000000000003','authenticated','authenticated','lecture-239@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('ee990000-0000-4000-8000-000000000001','Support','239'),
('ee990000-0000-4000-8000-000000000002','Facturation','239'),
('ee990000-0000-4000-8000-000000000003','Lecture','239') on conflict(id) do nothing;
insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at) values
('support-239@invalid.local','support','ee990000-0000-4000-8000-000000000001',true,'active',now()),
('facturation-239@invalid.local','facturation','ee990000-0000-4000-8000-000000000002',true,'active',now()),
('lecture-239@invalid.local','lecture','ee990000-0000-4000-8000-000000000003',true,'active',now());

insert into public.entreprises(id,nom,code_adhesion,stripe_subscription_id,abonnement_statut) values
('ee991000-0000-4000-8000-000000000001','Sans fil 239','T2390001','sub_239','suspendu')
on conflict(id) do update set stripe_subscription_id=excluded.stripe_subscription_id,abonnement_statut=excluded.abonnement_statut;

-- Préautorisation : rôle exact, UID actif, AAL2 canonique, cible et opération fermée.
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_like($$select * from public.plateforme_preautoriser_effet_externe('a0000000-0000-0000-0000-000000000001','remise_appliquer')$$,'%réservée aux rôles total, facturation%','support AAL2 refusé avant effet externe');
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select throws_like($$select * from public.plateforme_preautoriser_effet_externe('a0000000-0000-0000-0000-000000000001','remise_appliquer')$$,'%réservée aux rôles total, facturation%','lecture AAL2 refusée avant effet externe');
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
select throws_like($$select * from public.plateforme_preautoriser_effet_externe('a0000000-0000-0000-0000-000000000001','remise_appliquer')$$,'%AAL2%','facturation AAL1 refusée');
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select * from public.plateforme_preautoriser_effet_externe('a0000000-0000-0000-0000-000000000001','remise_appliquer')$$,'facturation AAL2 préautorisée');
select throws_like($$select * from public.plateforme_preautoriser_effet_externe('ffffffff-ffff-4fff-8fff-ffffffffffff','remise_appliquer')$$,'%Entreprise introuvable%','cible inexistante refusée');
select throws_like($$select * from public.plateforme_preautoriser_effet_externe('a0000000-0000-0000-0000-000000000001','operation_libre')$$,'%Opération externe inconnue%','opération hors liste refusée');
reset role;
select ok(pg_get_functiondef('public.plateforme_preautoriser_effet_externe(uuid,text)'::regprocedure) !~* '\m(insert|update|delete)\M','préautorisation sans effet métier');
select ok(not has_function_privilege('anon','public.plateforme_preautoriser_effet_externe(uuid,text)','EXECUTE'),'préautorisation non exécutable par anon');

-- Audit complet : suspendu -> actif rend explicites les champs effacés.
update public.entreprises set impaye_signale_at=now()-interval '2 days',suspension_prevue_at=now()+interval '8 days',impaye_message='Retard 239',abonnement_note='Avant 239'
where id='ee991000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select ok(public.plateforme_modifier_abonnement('ee991000-0000-4000-8000-000000000001','actif',current_date,'Après 239'),'abonnement suspendu réactivé');
reset role;
select ok(exists(select 1 from public.historique_mutations_plateforme where entreprise_id='ee991000-0000-4000-8000-000000000001' and action='abonnement_modifie'
  and ancien->>'impaye_message'='Retard 239' and nouveau ? 'impaye_message' and nouveau->'impaye_message'='null'::jsonb
  and nouveau->'impaye_signale_at'='null'::jsonb and nouveau->'suspension_prevue_at'='null'::jsonb),'audit réactivation exhaustif avec NULL explicites');

set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_signaler_impaye('ee991000-0000-4000-8000-000000000001','Nouveau retard 239')$$,'signalement impayé');
select ok(public.plateforme_enregistrer_reglement('ee991000-0000-4000-8000-000000000001','Réglé 239'),'règlement enregistré');
select ok(public.plateforme_appliquer_remise('ee991000-0000-4000-8000-000000000001','coupon_239','10 % une fois','Geste 239',null,'pourcentage',10),'remise locale appliquée après effet externe simulé');
select ok(public.plateforme_retirer_remise('ee991000-0000-4000-8000-000000000001'),'remise locale retirée');
reset role;
select ok(exists(select 1 from public.historique_mutations_plateforme where action='impaye_signale' and nouveau->>'impaye_message'='Nouveau retard 239' and nouveau ? 'note'),'signalement exhaustif audité');
select ok(exists(select 1 from public.historique_mutations_plateforme where action='reglement_enregistre' and ancien->>'impaye_message'='Nouveau retard 239' and nouveau->'impaye_message'='null'::jsonb and nouveau ? 'dernier_reglement_at'),'règlement exhaustif audité');
select is((select count(*) from public.historique_mutations_plateforme where entreprise_id='ee991000-0000-4000-8000-000000000001' and domaine='tarification' and action in('remise_appliquee','remise_retiree')),2::bigint,'application et retrait ont chacun un audit plateforme');
select ok(exists(select 1 from public.historique_mutations_plateforme where action='remise_appliquee' and nouveau->>'type'='pourcentage' and nouveau->>'valeur'='10' and nouveau->>'motif_interne'='Geste 239'),'audit remise exhaustif');
select ok(exists(select 1 from public.historique_mutations_plateforme where action='remise_retiree' and nouveau->'coupon_id'='null'::jsonb and ancien->>'type'='pourcentage'),'audit retrait explicite');

-- Matrice RLS globale : support ne voit jamais facturation/tarification, lecture rien.
insert into public.historique_mutations_plateforme(domaine,action,entreprise_id,objet_type,auteur_utilisateur_id,nouveau) values
('support','test_support_239','a0000000-0000-0000-0000-000000000001','test','30000000-0000-0000-0000-000000000001','{}'),
('multi_app','test_multi_239','a0000000-0000-0000-0000-000000000001','test','30000000-0000-0000-0000-000000000001','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select is((select count(*) from public.historique_mutations_plateforme),0::bigint,'support AAL1 ne voit aucun audit, notamment facturation ancien/nouveau');
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select ok((select count(*) from public.historique_mutations_plateforme)>0 and not exists(select 1 from public.historique_mutations_plateforme where domaine<>'support'),'support AAL2 voit support uniquement');
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select ok((select count(*) from public.historique_mutations_plateforme)>0 and not exists(select 1 from public.historique_mutations_plateforme where domaine not in('facturation','tarification')),'facturation AAL2 voit facturation/tarification uniquement');
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal2"}',true);
select is((select count(*) from public.historique_mutations_plateforme),0::bigint,'lecture ne voit aucun audit sensible');
select throws_like($$insert into public.historique_mutations_plateforme(domaine,action,objet_type,auteur_utilisateur_id) values('support','direct','test','ee990000-0000-4000-8000-000000000003')$$,'%permission denied%','INSERT direct audit refusé');
select throws_like($$update public.historique_mutations_plateforme set action='direct'$$,'%permission denied%','UPDATE direct audit refusé');
select throws_like($$delete from public.historique_mutations_plateforme$$,'%permission denied%','DELETE direct audit refusé');
reset role;

-- Support : aucun fil implicite, réponse seulement après un message client et audit sans contenu.
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_entrer_entreprise('ee991000-0000-4000-8000-000000000001','Support test 239')$$,'session support ciblée ouverte');
select throws_like($$select public.plateforme_support_repondre('ee991000-0000-4000-8000-000000000001','Réponse orpheline')$$,'%Fil support client introuvable%','réponse sans fil client refusée');
reset role;
select is((select count(*) from public.support_messages where entreprise_id='ee991000-0000-4000-8000-000000000001'),0::bigint,'refus sans message ni faux fil');
insert into public.support_messages(entreprise_id,cote,auteur_nom,contenu) values('ee991000-0000-4000-8000-000000000001','entreprise','Client 239','Demande 239');
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_support_repondre('ee991000-0000-4000-8000-000000000001','Réponse autorisée 239')$$,'réponse avec fil client autorisée');
reset role;
select ok(exists(select 1 from public.historique_mutations_plateforme where action='reponse_support' and nouveau->>'cote'='plateforme' and nouveau::text not like '%Réponse autorisée%'),'réponse support auditée sans contenu confidentiel');

-- Snapshot : clé structurelle, aucun audit identique, nouvelle version après changement source.
update public.employes set poste_id='a1000000-0000-0000-0000-000000000001',
  compte_application_statut='actif',compte_application_ouvert_at='2025-01-01'
where id='a2000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_snapshot_facturation(date '2026-08-01')$$,'premier snapshot');
select lives_ok($$select public.plateforme_snapshot_facturation(date '2026-08-01')$$,'second snapshot identique');
reset role;
select ok(not exists(select 1 from public.historique_mutations_plateforme where action='snapshot_mensuel' group by entreprise_id,nouveau->>'version' having count(*)>1),'appel identique sans audit dupliqué');
select throws_like($$insert into public.plateforme_snapshots_facturation(entreprise_id,mois,empreinte,version,nombre_lignes) select entreprise_id,mois,'doublon',2,nombre_lignes from public.plateforme_snapshots_facturation limit 1$$,'%duplicate key%','unicité entreprise/mois protège la concurrence');
update public.postes set tarif_compte_mensuel=coalesce(tarif_compte_mensuel,0)+1
where id='a1000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.sub','ee990000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"ee990000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.plateforme_snapshot_facturation(date '2026-08-01')$$,'snapshot après changement source');
reset role;
select ok(exists(select 1 from public.plateforme_snapshots_facturation where mois='2026-08-01' and version=2),'changement source crée une version contrôlée');

select is((select anomalies from public.plateforme_preflight_integrite() where controle='historique_domaine_inconnu'),0::bigint,'préflight : domaines connus');
select is((select anomalies from public.plateforme_preflight_integrite() where controle='snapshots_cle_dupliquee'),0::bigint,'préflight : snapshots uniques');
select ok(pg_get_functiondef('public.plateforme_preflight_integrite()'::regprocedure) !~* '\m(insert|update|delete)\M','préflight reste strictement en lecture seule');

select * from finish();
rollback;
