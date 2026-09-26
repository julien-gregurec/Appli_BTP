-- PE-07 : révoquer l'appareil d'un salarié invalide la session de cet appareil
-- (20260923000353 : sessions_revoquees, est_membre_actif / a_permission /
-- contexte_acces_proxy / enregistrer_appareil_courant / revoquer_appareil_compte).
--
-- Avant ce correctif (reproduit sur la base à 318 migrations) : après
-- révocation, la même session lisait toujours ses données et le prochain
-- enregistrement de présence remettait revoque_at à null.
--
-- Matrice : session de l'appareil révoqué fermée immédiatement (RLS, droits,
-- proxy) sur un JWT encore valide ; autre appareil du même salarié intact ;
-- la session révoquée ne peut pas se dé-révoquer ; une NOUVELLE connexion le
-- peut ; cross-tenant ; salarié non gestionnaire ; jeton sans session_id.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Deux appareils de l'ouvrier A, chacun avec sa propre session GoTrue.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select public.enregistrer_appareil_courant('a0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Téléphone ouvrier','telephone',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000002"}', true);
select public.enregistrer_appareil_courant('a0000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','Tablette ouvrier','tablette',false);
reset role;

select is((select session_id::text from public.appareils_comptes where identifiant_appareil='d1000000-0000-0000-0000-000000000001'),
  '5e550000-0000-0000-0000-000000000001', '1. l''appareil mémorise la session qui l''a enregistré');

-- Témoin positif avant révocation.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select is((select count(*)::int from public.pointages), 1, '2. positive witness : avant révocation, la session du téléphone lit ses pointages');

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Contrôles d'accès de la révocation.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.revoquer_appareil_compte('a0000000-0000-0000-0000-000000000001',(select id from public.appareils_comptes where identifiant_appareil='d1000000-0000-0000-0000-000000000001'))$$,
  'P0001', 'Appareil inaccessible', '3. cross-tenant : dirigeant B ne peut pas révoquer un appareil de A');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select throws_ok($$select public.revoquer_appareil_compte('a0000000-0000-0000-0000-000000000001',(select id from public.appareils_comptes where identifiant_appareil='d1000000-0000-0000-0000-000000000001'))$$,
  'P0001', 'Appareil inaccessible', '4. un collègue sans gerer_employes/gerer_utilisateurs ne peut pas révoquer');
select throws_ok($$select * from public.sessions_revoquees$$, '42501', null, '5. sessions_revoquees illisible pour authenticated');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Révocation par le dirigeant (gerer_employes).
-- ───────────────────────────────────────────────────────────────────────────
reset role;
select set_config('request.jwt.claims', '', true);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select lives_ok($$select public.revoquer_appareil_compte('a0000000-0000-0000-0000-000000000001',(select id from public.appareils_comptes where identifiant_appareil='d1000000-0000-0000-0000-000000000001'))$$,
  '6. le dirigeant révoque le téléphone (auth.sessions absente ici : best effort sans erreur)');
reset role;
select is((select count(*)::int from public.sessions_revoquees where session_id='5e550000-0000-0000-0000-000000000001'), 1, '7. la session du téléphone est inscrite comme révoquée');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Effet immédiat sur le JWT encore valide du téléphone.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select ok(not public.est_membre_actif('a0000000-0000-0000-0000-000000000001'), '8. est_membre_actif = false pour la session révoquée');
select ok(not public.a_permission('a0000000-0000-0000-0000-000000000001','saisir_ses_notes_frais'), '9. a_permission = false pour la session révoquée');
select is((select count(*)::int from public.pointages), 0, '10. RLS : la session révoquée ne lit plus rien (1 -> 0)');
select is((select count(*)::int from public.chantiers), 0, '11. RLS : idem sur les chantiers');
select is(public.contexte_acces_proxy('{acces_chantiers}','{}') ->> 'session_revoquee', 'true', '12. le proxy est informé (session_revoquee = true) pour déconnecter');
select throws_ok($$select public.enregistrer_appareil_courant('a0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Téléphone ouvrier','telephone',true)$$,
  'P0001', 'Accès refusé', '13. la session révoquée ne peut pas se ré-enregistrer (plus de dé-révocation)');
reset role;
select ok((select revoque_at is not null from public.appareils_comptes where identifiant_appareil='d1000000-0000-0000-0000-000000000001'), '14. l''appareil reste révoqué');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Ciblage : l'autre appareil du même salarié continue de fonctionner.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000002"}', true);
select is((select count(*)::int from public.pointages), 1, '15. la tablette (autre session) lit toujours ses pointages');
select is(public.contexte_acces_proxy('{}','{}') ->> 'session_revoquee', 'false', '16. le proxy ne la déconnecte pas');

-- Nouvelle connexion (nouvelle session) sur le téléphone : réactivation légitime.
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000003"}', true);
select lives_ok($$select public.enregistrer_appareil_courant('a0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','Téléphone ouvrier','telephone',true)$$,
  '17. une nouvelle connexion (mot de passe ressaisi) réenregistre l''appareil');
select is((select count(*)::int from public.pointages), 1, '18. la nouvelle session a accès');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-000000000001"}', true);
select is((select count(*)::int from public.pointages), 0, '19. l''ancienne session révoquée reste fermée');

-- Jeton sans claim session_id (clé de service, jeton historique) : non affecté.
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.pointages), 1, '20. un JWT sans session_id n''est pas assimilé à une session révoquée');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"pas-un-uuid"}', true);
select is((select count(*)::int from public.pointages), 1, '21. claim session_id mal formé : ignoré, pas d''erreur');

-- Cross-tenant : la révocation chez A ne touche pas B.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated","session_id":"5e550000-0000-0000-0000-0000000000b1"}', true);
select is((select count(*)::int from public.pointages), 1, '22. cross-tenant : l''ouvrier B n''est pas affecté');
reset role;

select * from finish();
rollback;
