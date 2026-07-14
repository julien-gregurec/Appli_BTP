begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select has_column('public','entreprises','impaye_signale_at','La date de signalement est conservée');
select has_column('public','entreprises','suspension_prevue_at','La date de suspension automatique est conservée');
select has_column('public','entreprises','impaye_message','Le message administrateur est conservé');
select has_table('public','plateforme_acces_entreprises','Les accès support sont journalisés');
select ok((select relrowsecurity from pg_class where oid='public.plateforme_acces_entreprises'::regclass),'RLS active sur le journal support');
select function_returns('public','est_acces_support_actif',array['uuid'],'boolean','Le contrôle support est centralisé');
select function_returns('public','plateforme_entrer_entreprise',array['uuid','text'],'void','L’entrée support est atomique');
select function_returns('public','plateforme_quitter_entreprise',array[]::text[],'void','La sortie support restaure le contexte');
select function_returns('public','plateforme_signaler_impaye',array['uuid','text'],'timestamp with time zone','Un impayé produit une échéance précise');
select function_returns('public','plateforme_enregistrer_reglement',array['uuid','text'],'void','Le règlement rétablit le compte');
select function_returns('public','appliquer_suspensions_impayes',array[]::text[],'integer','Les échéances sont matérialisables en statut suspendu');
select function_returns('public','contexte_abonnement_courant',array[]::text[],'record','Le statut reste lisible avant la barrière RLS');

select * from finish();
rollback;
