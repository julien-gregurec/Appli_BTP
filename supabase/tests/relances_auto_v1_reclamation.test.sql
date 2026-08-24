-- RELANCES-AUTO-V1 : relance_reclamer()/relance_finaliser() — permission (manuel), isolation
-- cross-tenant, verrou anti-doublon (§21/§22), libération après échec (§46/§47), et le
-- chemin automatique (aucune session utilisateur, cf. auth.uid() null sous service_role).
--
-- NOTE : à exécuter contre la base Preview liée (voir méthode déjà établie cette session,
-- stack Docker locale instable indépendamment de ce schéma) — logique identique.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

insert into public.devis (id, entreprise_id, client_id, statut, montant_ht, numero) values
  ('d1000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'envoye', 1000, 'DEV-A-RELANCE'),
  ('d1000000-0000-0000-0000-00000000000b', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'envoye', 2000, 'DEV-B-RELANCE');

set local role authenticated;

-- 1. Ouvrier A (sans gerer_devis) refusé pour une relance manuelle
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',1,'client@example.com','Sujet',false,'10000000-0000-0000-0000-000000000002')$$,
  'Accès refusé',
  '1. Ouvrier A (sans gerer_devis) ne peut pas réclamer une relance manuelle'
);

-- 2. Admin A peut réclamer une relance manuelle sur son propre devis
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select isnt(
  (select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',1,'client@example.com','Sujet',false,'10000000-0000-0000-0000-000000000001')),
  null,
  '2. Admin A réclame avec succès une relance niveau 1 sur son devis'
);

-- 3. Un second appel pour le MÊME (type, document, niveau) échoue : verrou déjà posé (planifiee)
select is(
  (select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',1,'client@example.com','Sujet',false,'10000000-0000-0000-0000-000000000001')),
  null,
  '3. Double réclamation du même niveau échoue (verrou anti-doublon) — double cron/double clic'
);

-- 4. Admin A ne peut pas réclamer une relance sur le devis de l'entreprise B (cross-tenant)
select throws_like(
  $$select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000b',1,'client@example.com','Sujet',false,'10000000-0000-0000-0000-000000000001')$$,
  'Document introuvable%',
  '4. Admin A ne peut pas réclamer une relance ciblant un devis de l''entreprise B'
);

-- 5. Un déclencheur différent de l'utilisateur JWT courant est refusé
select throws_like(
  $$select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',2,'client@example.com','Sujet',false,'10000000-0000-0000-0000-000000000002')$$,
  'Déclencheur invalide',
  '5. p_declenche_par différent de auth.uid() est refusé'
);

-- 6. Une relance automatique portant un déclencheur humain est refusée (garde-fou de cohérence)
select throws_like(
  $$select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',2,'client@example.com','Sujet',true,'10000000-0000-0000-0000-000000000001')$$,
  'Une relance automatique ne doit jamais porter de déclencheur humain',
  '6. p_automatique=true avec p_declenche_par non-null est refusé'
);

reset role;

-- 7. Chemin automatique (aucune session utilisateur, comme le cron avec service_role) :
-- auth.uid() est null ici — la réclamation automatique doit réussir malgré tout (elle ne
-- dépend jamais de est_membre_actif()/a_permission()).
select isnt(
  (select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',2,'client@example.com','Sujet',true,null)),
  null,
  '7. Réclamation automatique réussit sans session utilisateur (contexte cron/service_role)'
);

-- 8. Finalisation en 'echec' libère le verrou : une nouvelle réclamation du même niveau redevient possible
select public.relance_finaliser(
  (select id from public.relances_documents where type_document='devis' and document_id='d1000000-0000-0000-0000-00000000000a' and niveau=2 and statut='planifiee'),
  'echec', null, 'Erreur simulée', null
);
select isnt(
  (select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',2,'client@example.com','Sujet',true,null)),
  null,
  '8. Après un échec, le niveau redevient réclamable (retry, §47)'
);

-- 9. Finalisation en 'envoyee' : une nouvelle réclamation du même niveau reste bloquée (jamais renvoyer le même niveau)
select public.relance_finaliser(
  (select id from public.relances_documents where type_document='devis' and document_id='d1000000-0000-0000-0000-00000000000a' and niveau=2 and statut='planifiee'),
  'envoyee', 'msg-123', null, null
);
select is(
  (select public.relance_reclamer('a0000000-0000-0000-0000-000000000001','devis','d1000000-0000-0000-0000-00000000000a',2,'client@example.com','Sujet',true,null)),
  null,
  '9. Une fois envoyée, le même niveau ne peut plus jamais être réclamé à nouveau'
);

-- 10. Vérification directe de l'unicité en base : une seule ligne 'envoyee' pour ce (type, document, niveau)
select is(
  (select count(*)::int from public.relances_documents where type_document='devis' and document_id='d1000000-0000-0000-0000-00000000000a' and niveau=2 and statut='envoyee'),
  1,
  '10. Exactement une ligne envoyee en base pour ce niveau, malgré les tentatives multiples'
);

select * from finish();
rollback;
