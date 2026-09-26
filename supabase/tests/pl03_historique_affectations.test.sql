-- PL-03 : historique des modifications d'affectations planning
-- (affectations_historique + trg_historiser_affectation, 20260923000351).
--
-- Matrice : modification réelle -> 1 ligne avant/après/champs/auteur ; UPDATE
-- sans changement -> rien ; suppression directe -> 1 ligne ; suppression en
-- cascade (employé supprimé) -> rien ; append-only pour `authenticated` ;
-- lecture = mêmes personnes que l'affectation (PL-05), cross-tenant fermé,
-- utilisateur désactivé et entreprise suspendue fermés, changement de rôle
-- pris en compte immédiatement.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- notifications_affectations a une clé unique (utilisateur, type, ressource,
-- created_at) et created_at est figé dans une transaction pgTAP : on la
-- neutralise pour pouvoir modifier plusieurs fois la même affectation ici.
-- Le trigger testé (trg_historiser_affectation) reste actif.
alter table public.affectations disable trigger notifications_affectations;

insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures, tache) values
  ('a3030000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002', current_date + 1, 7, 'Coffrage'),
  ('a3030000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004', current_date + 1, 7, 'Suivi'),
  ('b3030000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002', current_date + 1, 7, 'B');

select has_table('public', 'affectations_historique', '1. table affectations_historique présente');
select is((select count(*)::int from public.affectations_historique), 0, '2. une création n''écrit pas d''historique (seules modification/suppression)');

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Modification réelle par le conducteur (gerer_planning), sous RLS.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
update public.affectations set heures = 4, tache = 'Coffrage niveau 1' where id = 'a3030000-0000-0000-0000-000000000001';
reset role;

select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), 1,
  '3. positive witness : une modification -> une ligne d''historique');
select is((select operation from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), 'modification', '4. opération = modification');
select is((select champs_modifies from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), array['heures','tache'], '5. champs modifiés exacts (heures, tache)');
select is((select (avant->>'heures')::numeric || '→' || (apres->>'heures')::numeric from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), '7.00→4.00', '6. ancienne et nouvelle valeur conservées');
select is((select auteur_id::text from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), '10000000-0000-0000-0000-000000000004', '7. auteur = utilisateur de la session');
select is((select heures from public.affectations where id='a3030000-0000-0000-0000-000000000001'), 4.00::numeric, '8. la modification elle-même est appliquée');

-- UPDATE sans changement de valeur : aucune ligne.
update public.affectations set heures = heures where id = 'a3030000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), 1, '9. negative witness : UPDATE sans changement -> pas de ligne');

-- Deuxième modification : l'historique s'accumule.
update public.affectations set date = current_date + 2 where id = 'a3030000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), 2, '10. deuxième modification -> deuxième ligne (historique cumulatif)');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Suppression directe / en cascade.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
delete from public.affectations where id = 'a3030000-0000-0000-0000-000000000002';
reset role;
select is((select operation || '|' || (apres is null)::text || '|' || (avant->>'tache') from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000002'),
  'suppression|true|Suivi', '11. suppression directe -> ligne suppression avec l''état avant');

-- Gestes de fixture en superutilisateur : sans identité JWT résiduelle.
select set_config('request.jwt.claims', '', true);
insert into public.employes (id, entreprise_id, prenom, nom, numero_inscription, identifiant_interne)
values ('a2000000-0000-0000-0000-000000000309','a0000000-0000-0000-0000-000000000001','Temp','PL03','ISO-A-0309','A0309');
insert into public.affectations (id, entreprise_id, chantier_id, employe_id, date, heures)
values ('a3030000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000309', current_date + 3, 7);
delete from public.employes where id = 'a2000000-0000-0000-0000-000000000309';
select is((select count(*)::int from public.affectations where id='a3030000-0000-0000-0000-000000000009'), 0, '12. précondition : l''affectation a bien été supprimée en cascade');
select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000009'), 0, '13. suppression en cascade (purge employé) non historisée');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Append-only pour `authenticated`, même dirigeant.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$insert into public.affectations_historique (entreprise_id, affectation_id, employe_id, operation, avant) values ('a0000000-0000-0000-0000-000000000001', gen_random_uuid(), 'a2000000-0000-0000-0000-000000000002', 'suppression', '{}')$$,
  '42501', null, '14. insertion directe refusée (seul le trigger écrit)');
select throws_ok($$update public.affectations_historique set avant = '{}'$$, '42501', null, '15. réécriture de l''historique refusée');
select throws_ok($$delete from public.affectations_historique$$, '42501', null, '16. effacement de l''historique refusé');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Lecture : cloisonnement identique à l'affectation (PL-05).
-- ───────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from public.affectations_historique), 3, '17. dirigeant A (vue globale) lit tout l''historique de A');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.affectations_historique), 2, '18. ouvrier A lit l''historique de SES affectations (2 lignes)');
select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000002'), 0, '19. ouvrier A ne lit pas l''historique d''un collègue');

select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.affectations_historique where entreprise_id='a0000000-0000-0000-0000-000000000001'), 0, '20. cross-tenant : dirigeant B ne lit rien de A');
update public.affectations set heures = 6 where id = 'a3030000-0000-0000-0000-000000000001';
reset role;
select is((select count(*)::int from public.affectations_historique where affectation_id='a3030000-0000-0000-0000-000000000001'), 2, '21. cross-tenant : dirigeant B ne peut pas modifier (donc pas historiser) une affectation de A');

select set_config('request.jwt.claims', '', true);
-- Changement de rôle en session : l'ouvrier passe conducteur -> vue globale immédiate.
update public.utilisateurs_entreprises set poste_id = 'a1000000-0000-0000-0000-000000000004'
 where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.affectations_historique), 3, '22. changement de rôle (ouvrier -> conducteur) : vue globale sans reconnexion');
reset role;

select set_config('request.jwt.claims', '', true);
-- Utilisateur désactivé : plus rien.
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.affectations_historique), 0, '23. utilisateur désactivé : plus aucune ligne d''historique');
reset role;

select set_config('request.jwt.claims', '', true);
-- Entreprise suspendue : plus rien, même pour le dirigeant.
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select is((select count(*)::int from public.affectations_historique), 0, '24. entreprise suspendue : historique fermé, même au dirigeant');
reset role;

select * from finish();
rollback;
