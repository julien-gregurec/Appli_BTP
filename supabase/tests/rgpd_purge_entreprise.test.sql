begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

-- ── Structure ────────────────────────────────────────────────
select has_column('public','entreprises','suppression_statut','L''état-machine de suppression est tracée');
select has_column('public','entreprises','retention_debutee_at','Le début de rétention est daté pour ancrer les échéances');
select has_table('public','politiques_retention_rgpd','Les régimes de rétention sont configurables');
select has_table('public','retention_entreprise_echeances','Les échéances par entreprise sont matérialisées');
select has_table('public','legal_holds_entreprise','Les réserves légales génériques existent');
select has_table('public','journal_purge_entreprise','Le journal de purge existe');
select has_table('public','entreprises_purgees','Le tombstone de purge existe');
select ok((select relrowsecurity from pg_class where oid='public.entreprises_purgees'::regclass),'RLS active sur le tombstone');
select ok((select relrowsecurity from pg_class where oid='public.legal_holds_entreprise'::regclass),'RLS active sur les legal holds');

select function_returns('public','confirmer_purge_entreprise',array['uuid','text'],'text','La confirmation de purge est atomique et journalisée');
select function_returns('public','verifier_purge_prete',array['uuid'],'boolean','L''état de préparation est lisible avant purge');
select function_returns('public','avancer_purges_dues',array[]::text[],'integer','Le cron peut faire avancer requested vers review');
select function_returns('public','avancer_purges_pretes',array[]::text[],'uuid[]','Le cron peut faire avancer retention vers purge_ready');
select function_returns('public','executer_purge_legale_entreprise',array['uuid'],'jsonb','La purge légale anonymise sans supprimer les lignes');
select function_returns('public','marquer_purge_terminee_entreprise',array['uuid','jsonb','text'],'void','La clôture écrit le tombstone');
select function_returns('public','bloquer_purge_entreprise',array['uuid','text'],'void','Un circuit-breaker manuel existe');
select function_returns('public','debloquer_purge_entreprise',array['uuid','text'],'void','Le circuit-breaker est réversible');
select function_returns('public','poser_legal_hold_entreprise',array['uuid','text','text'],'uuid','Une réserve légale peut être posée');
select function_returns('public','lever_legal_hold_entreprise',array['uuid'],'void','Une réserve légale peut être levée');
select function_returns('public','valider_regime_retention_rgpd',array['text','integer'],'void','La validation humaine d''une durée légale est un point de contrôle unique');
select function_returns('public','exporter_donnees_utilisateur',array['uuid'],'jsonb','L''export personnel est séparé de l''export entreprise');
select function_returns('public','manifeste_storage_entreprise',array['uuid'],'setof record','Le manifeste Storage référence les chemins par table/colonne');

-- ── Garde-fous : aucun régime comptable/social/audit n'a de durée
-- inventée. Toute durée doit passer par valider_regime_retention_rgpd.
select ok(
  (select bool_and(legal_review_required and duree_conservation_mois is null)
     from public.politiques_retention_rgpd where cle <> 'operationnel'),
  'Aucune durée légale n''est pré-remplie pour les régimes protégés (LEGAL_REVIEW_REQUIRED par défaut)'
);
select ok(
  (select not legal_review_required and duree_conservation_mois = 0 from public.politiques_retention_rgpd where cle = 'operationnel'),
  'Le régime opérationnel est purgé sans réserve légale, sans durée inventée'
);

select * from finish();
rollback;
