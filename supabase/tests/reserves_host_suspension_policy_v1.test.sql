-- ELSATIA-RESERVES-HOST-SUSPENSION-POLICY-V1
--
-- Décision D-01 : quand l'organisation HÔTE est suspendue, l'entreprise intervenante
-- invitée passe en LECTURE SEULE. Migration : 20260928000301_reserves_hote_suspendu_
-- lecture_seule_v1.sql. Rapport : docs/qualification/ELSATIA_RESERVES_HOST_SUSPENSION_
-- POLICY_V1.md.
--
--   §1 état de référence (hôte actif)        §6 hôtes : règles commerciales inchangées
--   §2 lecture conservée, session ouverte    §7 autres formes de fermeture de l'hôte
--   §3 chaque écriture refusée (API)         §8 garde centrale : tous chemins, tiers seuls
--   §4 aucun faux historique                 §9 restauration sans nouvelle invitation
--   §5 file hors-ligne préparée avant        §10 non-oracle, R-04 préservé
--
-- Toutes les assertions de §2 à §5 utilisent la MÊME session JWT de l'intervenant,
-- ouverte avant la suspension : aucune reconnexion.
--
-- Décor : A = hôte (fixture multitenant) ; C, D = entreprises intervenantes (comptes
-- gratuits) ; B = tenant témoin sans lien.

begin;
create extension if not exists pgtap with schema extensions;
select plan(97);  -- 96 (branche d'origine) + 8.06b (train V5 : reserves_contacts)

\ir fixtures/isolation_multitenant.inc

create function pg_temp.en_session(p uuid, s uuid) returns text language sql as $$
  select set_config('role','authenticated',true)
      || set_config('request.jwt.claim.sub',p::text,true)
      || set_config('request.jwt.claims', json_build_object('sub',p,'role','authenticated','session_id',s)::text, true)
$$;
create function pg_temp.en_tant_que(p uuid) returns text language sql as $$
  select pg_temp.en_session(p, gen_random_uuid())
$$;
-- Session UNIQUE et persistante de l'intervenant C : toujours le même session_id.
create function pg_temp.session_c() returns text language sql as $$
  select pg_temp.en_session('c0000000-0000-0000-0000-0000000000a1', '5c000000-0000-0000-0000-00000000000c')
$$;
create function pg_temp.en_service() returns text language sql as $$
  select set_config('role','postgres',true)
      || set_config('request.jwt.claim.sub','',true)
      || set_config('request.jwt.claims','',true)
$$;
create function pg_temp.deposer(p_reserve uuid, p_usage text) returns uuid language plpgsql as $$
declare v_id uuid; v_chemin text;
begin
  select photo_id, storage_path into v_id, v_chemin from public.reserves_ajouter_photo(p_reserve, p_usage);
  insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', v_chemin, '{"mimetype":"image/jpeg"}');
  perform public.reserves_confirmer_photo(v_id);
  return v_id;
end $$;
-- Indice (HINT) d'une erreur : c'est ce que PostgREST transmet au client dans `hint`.
create function pg_temp.capturer_indice(p_sql text) returns text language plpgsql as $$
declare v_indice text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_indice = pg_exception_hint;
  return v_indice;
end $$;
-- Tout ce que C LIT, sous sa propre session (RLS et RPC de lecture, dont celles du PDF).
create function pg_temp.vue_c() returns text language sql as $$
  select concat_ws('|',
    (select string_agg(id::text, ',' order by id) from public.reserves),
    (select count(*) from public.reserves_historique),
    (select count(*) from public.reserves_photos_visibles(current_setting('q.r1')::uuid)),
    (select count(*) from public.reserves_photos_visibles(current_setting('q.r2')::uuid)),
    (select count(*) from storage.objects where bucket_id in ('reserves-photos', 'reserves-plans')),
    (select count(*) from public.reserves_plans),
    (select count(*) from public.reserves_reperes_plan('e8100000-0000-0000-0000-000000000001', 1)),
    (select count(*) from public.reserves_messages),
    (select count(*) from public.reserves_conversations),
    (select count(*) from public.reserves_chantiers),
    (select count(*) from public.reserves_intervenants),
    (select count(*) from public.reserves_export_entete('e8000000-0000-0000-0000-000000000001')),
    (select count(*) from public.reserves_export_chantier('e8000000-0000-0000-0000-000000000001')),
    (select count(*) from public.reserves_export_historique('e8000000-0000-0000-0000-000000000001')),
    (select count(*) from public.reserves_export_photos('e8000000-0000-0000-0000-000000000001')),
    (select count(*) from public.reserves_export_intervenants('e8000000-0000-0000-0000-000000000001')),
    (select total from public.reserves_tableau_de_bord()))
$$;
create function pg_temp.r(n text) returns uuid language sql as $$ select current_setting('q.' || n)::uuid $$;
-- Empreinte de TOUT ce qu'une écriture de l'intervenant pourrait laisser chez l'hôte.
create function pg_temp.empreinte() returns text language sql security definer as $$
  select concat_ws('|',
    (select count(*) from public.reserves_historique where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from public.reserves_messages where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from public.reserves_conversations where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from public.reserves_photos where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from public.reserves_photos where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and disponible_at is not null),
    (select count(*) from public.reserves_photos where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and supprimee_at is not null),
    (select count(*) from public.reserves_mutations_appliquees where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from public.reserves_evenements_notifications where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select count(*) from storage.objects where bucket_id = 'reserves-photos' and name like 'a0000000%'),
    (select string_agg(numero || ':' || statut || ':' || titre, ',' order by numero) from public.reserves
      where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select string_agg(id || ':' || statut || ':' || coalesce(entreprise_intervenante_id::text, '-'), ',' order by id)
      from public.reserves_intervenants where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
    (select string_agg(id || ':' || coalesce(nb_pages, 0), ',' order by id) from public.reserves_plans
      where entreprise_id = 'a0000000-0000-0000-0000-000000000001'))
$$;

-- ── Décor ────────────────────────────────────────────────────────────────────
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-d@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values
  ('c0000000-0000-0000-0000-0000000000a1','Peintre','C'), ('d0000000-0000-0000-0000-0000000000a1','Plaquiste','D')
on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','Entreprise Peinture C','SUSC0001'),
  ('d0000000-0000-0000-0000-000000000001','Entreprise Plâtrerie D','SUSD0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C'),
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Gérant D')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif'),
  ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
insert into public.reserves_chantiers (id, entreprise_id, nom) values
  ('e8000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','SUSP_A_Résidence');
insert into public.reserves_plans (id, entreprise_id, chantier_id, nom, niveau, zone) values
  ('e8100000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','RDC','R0','Hall');
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat) values
  ('e8200000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','Peinture C','Peinture'),
  ('e8200000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-000000000001','e8000000-0000-0000-0000-000000000001','Plâtrerie D','Plâtrerie');
select public.reserves_designer_entreprise_intervenante('e8200000-0000-0000-0000-00000000000c','c0000000-0000-0000-0000-000000000001');
-- D est désigné mais N'A PAS ENCORE REJOINT : son invitation reste en attente.
select public.reserves_designer_entreprise_intervenante('e8200000-0000-0000-0000-00000000000d','d0000000-0000-0000-0000-000000000001');
select pg_temp.session_c();
select public.reserves_rejoindre_intervention('e8200000-0000-0000-0000-00000000000c');

select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.r1', public.reserves_creer('e8000000-0000-0000-0000-000000000001', 'Fissure enduit hall',
  'Reprise enduit', 'haute', 'e8200000-0000-0000-0000-00000000000c', 'e8100000-0000-0000-0000-000000000001', 0.4, 0.6)::text, true);
select set_config('q.r2', public.reserves_creer('e8000000-0000-0000-0000-000000000001', 'Retouche plinthe',
  null, 'normale', 'e8200000-0000-0000-0000-00000000000c')::text, true);
select set_config('q.r3', public.reserves_creer('e8000000-0000-0000-0000-000000000001', 'Joint placo',
  null, 'normale', 'e8200000-0000-0000-0000-00000000000d')::text, true);
select set_config('q.ph_hote', pg_temp.deposer(pg_temp.r('r1'), 'constat')::text, true);
select public.reserves_commenter(pg_temp.r('r1'), 'Merci d''intervenir avant la réception');

-- C agit normalement AVANT la suspension, dans sa session : accepte R2, commente,
-- dépose une photo, et réserve un emplacement de photo qu'il n'a pas encore rempli
-- (téléversement interrompu, qui reprendra plus tard).
select pg_temp.session_c();
select public.reserves_repondre_responsabilite(pg_temp.r('r2'), true);
select public.reserves_commenter(pg_temp.r('r1'), 'Intervention prévue jeudi');
select set_config('q.ph_c', pg_temp.deposer(pg_temp.r('r2'), 'travaux')::text, true);
select set_config('q.ph_attente_id', ph.photo_id::text, true), set_config('q.ph_attente_chemin', ph.storage_path, true)
from public.reserves_ajouter_photo(pg_temp.r('r2'), 'levee', null, 'image/jpeg', 1000, 'levee.jpg',
  'f0f0f0f0-0000-4000-8000-000000000001') ph;
-- Une conversation existe : sa lecture sera marquée plus bas.
select set_config('q.conv', (select id from public.reserves_conversations where reserve_id = pg_temp.r('r1'))::text, true);

-- ═════════════════════════════════════════════════════════════════════════════
-- §1 ÉTAT DE RÉFÉRENCE — hôte actif
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.session_c();
select is((select count(*)::int from public.reserves), 2, '1.01 C voit ses 2 réserves');
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), false, '1.02 hôte actif : pas de lecture seule');
select is(public.reserves_chantier_lecture_seule_hote('e8000000-0000-0000-0000-000000000001'), false,
  '1.03 hôte actif : chantier non gelé');
select set_config('q.vue_c_avant', pg_temp.vue_c(), true);
select pg_temp.en_service();
select set_config('q.empreinte_avant', pg_temp.empreinte(), true);
select set_config('q.nb_historique_r1', (select count(*) from public.reserves_historique where reserve_id = pg_temp.r('r1'))::text, true);

-- ── Suspension commerciale de l'hôte (hors de la session de C) ────────────────
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';

-- ═════════════════════════════════════════════════════════════════════════════
-- §2 LECTURE CONSERVÉE — même session, aucune reconnexion
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.session_c();
select set_eq($$select id from public.reserves$$, $$values (pg_temp.r('r1')), (pg_temp.r('r2'))$$,
  '2.01 réserves assignées toujours visibles (et seulement elles)');
select ok((select titre = 'Fissure enduit hall' and description = 'Reprise enduit' and plan_id is not null
  from public.reserves where id = pg_temp.r('r1')), '2.02 détail de la réserve lisible');
select is((select count(*)::int from public.reserves_historique where reserve_id = pg_temp.r('r1')),
  current_setting('q.nb_historique_r1')::int, '2.03 historique complet lisible');
select is((select count(*)::int from public.reserves_photos_visibles(pg_temp.r('r1'))), 1, '2.04 photo de constat de l''hôte visible');
select is((select count(*)::int from public.reserves_photos_visibles(pg_temp.r('r2'))), 1, '2.05 sa propre photo de travaux visible');
select is((select count(*)::int from storage.objects where bucket_id = 'reserves-photos'), 2,
  '2.06 objets Storage lisibles (URL signée possible)');
select is((select count(*)::int from public.reserves_plans), 1, '2.07 plan portant sa réserve visible');
select is((select count(*)::int from public.reserves_reperes_plan('e8100000-0000-0000-0000-000000000001', 1)), 1,
  '2.08 repère sur le plan visible');
select is((select count(*)::int from public.reserves_messages m join public.reserves_conversations c on c.id = m.conversation_id
  where c.reserve_id = pg_temp.r('r1')), 2, '2.09 échanges lisibles');
select is((select count(*)::int from public.reserves_chantiers), 1, '2.10 chantier visible');
select is((select total::int from public.reserves_tableau_de_bord()), 2, '2.11 tableau de bord conservé');
-- Périmètre du document PDF (mêmes RPC que la route /api/documents/chantier/[id]/pdf).
select is((select count(*)::int from public.reserves_export_entete('e8000000-0000-0000-0000-000000000001')), 1, '2.12 PDF : en-tête');
select is((select count(*)::int from public.reserves_export_chantier('e8000000-0000-0000-0000-000000000001')), 2, '2.13 PDF : réserves');
select ok((select count(*) from public.reserves_export_historique('e8000000-0000-0000-0000-000000000001')) > 0, '2.14 PDF : historique');
select is((select count(*)::int from public.reserves_export_photos('e8000000-0000-0000-0000-000000000001')), 2, '2.15 PDF : photos');
select is(pg_temp.vue_c(), current_setting('q.vue_c_avant'),
  '2.16 vue complète de C (réserves, historique, photos, objets, plans, repères, échanges, exports PDF) identique à l''avant-suspension');
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), true, '2.17 l''écran est informé : lecture seule');
select is(public.reserves_chantier_lecture_seule_hote('e8000000-0000-0000-0000-000000000001'), true, '2.18 chantier en lecture seule');
-- Consultation : marquer comme lu reste possible (curseur personnel, pas une action).
select lives_ok($$select public.reserves_conversation_marquer_lue(pg_temp.r('conv'))$$, '2.19 marquer une conversation comme lue reste possible');
select lives_ok($$select public.reserves_notifications_marquer_lues(null::uuid[])$$, '2.20 marquer ses notifications comme lues reste possible');

-- ═════════════════════════════════════════════════════════════════════════════
-- §3 ÉCRITURES REFUSÉES PAR LA BASE (RPC exposées à authenticated)
-- ═════════════════════════════════════════════════════════════════════════════
select throws_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r1'), true)$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.01 acceptation refusée');
select throws_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r1'), false, 'Pas notre lot')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.02 refus de responsabilité refusé');
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'Pendant la suspension')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.03 commentaire refusé');
select throws_ok($$select * from public.reserves_ajouter_photo(pg_temp.r('r2'), 'travaux')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.04 upload refusé (réservation de l''emplacement)');
select throws_ok($$insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', current_setting('q.ph_attente_chemin'), '{"mimetype":"image/jpeg"}')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.',
  '3.05 upload refusé (écriture Storage d''un emplacement réservé AVANT la suspension)');
select throws_ok($$select public.reserves_confirmer_photo(pg_temp.r('ph_attente_id'))$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.06 confirmation de photo refusée');
select throws_ok($$select public.reserves_supprimer_photo(pg_temp.r('ph_c'), 'erreur')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.07 retrait de photo refusé');
select throws_ok($$select public.reserves_demander_levee(pg_temp.r('r2'), 'Travaux terminés')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.08 demande de levée refusée');
select throws_ok($$select * from public.reserves_transition_differee(pg_temp.r('r2'), 'levee_demandee', 'différée')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.09 transition différée refusée');
select throws_ok($$select * from public.reserves_transition_differee(pg_temp.r('r1'), 'acceptee')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.', '3.10 acceptation différée refusée');
with x as (update public.reserves set titre = 'modifié', description = 'modifié' where id = pg_temp.r('r2') returning 1)
  select is((select count(*)::int from x), 0, '3.11 modification directe (PATCH) sans effet');
select throws_ok($$insert into public.reserves_historique (entreprise_id, reserve_id, action, auteur_id)
  values ('a0000000-0000-0000-0000-000000000001', pg_temp.r('r2'), 'commentaire', auth.uid())$$,
  '42501', null, '3.12 historique forgé refusé');
select throws_ok($$select public.reserves_enregistrer_pagination('e8100000-0000-0000-0000-000000000001', 7)$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.',
  '3.13 réécriture de la pagination du plan refusée (écriture hors reserves_acteur_courant)');
select ok((select statut = 'assignee' from public.reserves where id = pg_temp.r('r1'))
  and (select statut = 'acceptee' from public.reserves where id = pg_temp.r('r2')), '3.14 aucun statut n''a bougé');
select is(pg_temp.capturer_indice($$select public.reserves_commenter(pg_temp.r('r1'), 'x')$$), 'RESERVES_HOTE_SUSPENDU',
  '3.15 le refus porte un code stable pour l''application (indice RESERVES_HOTE_SUSPENDU)');

-- ═════════════════════════════════════════════════════════════════════════════
-- §4 AUDIT — aucune tentative bloquée ne laisse de trace
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
select is(pg_temp.empreinte(), current_setting('q.empreinte_avant'),
  '4.01 empreinte complète inchangée (historique, messages, conversations, photos, objets, registre, notifications, statuts, intervenants, plans)');
select is((select count(*)::int from public.reserves_historique where reserve_id = pg_temp.r('r1')),
  current_setting('q.nb_historique_r1')::int, '4.02 aucune ligne d''historique ajoutée');
select is((select count(*)::int from public.reserves_mutations_appliquees), 0, '4.03 registre d''idempotence vide : aucune mutation marquée appliquée');
select is((select count(*)::int from public.reserves_messages m join public.reserves_conversations c on c.id = m.conversation_id
  where c.reserve_id = pg_temp.r('r1')), 2, '4.04 aucun message ajouté au fil');
select ok((select disponible_at is null and supprimee_at is null from public.reserves_photos where id = pg_temp.r('ph_attente_id')),
  '4.05 l''emplacement réservé avant la suspension reste en attente, non publié');

-- ═════════════════════════════════════════════════════════════════════════════
-- §5 FILE HORS-LIGNE — mutations préparées AVANT, rejouées APRÈS la suspension
-- ═════════════════════════════════════════════════════════════════════════════
-- Les clés sont celles que la file a tirées avant la suspension ; aucune n'a atteint le
-- serveur. Le rejeu passe par les mêmes RPC que /api/offline/mutations et /photo.
select pg_temp.session_c();
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'Saisi hors ligne', null,
  'f1f1f1f1-0000-4000-8000-000000000001')$$, '42501', null, '5.01 commentaire préparé hors ligne : rejeu refusé');
select throws_ok($$select * from public.reserves_transition_differee(pg_temp.r('r2'), 'levee_demandee', 'hors ligne', null,
  'f1f1f1f1-0000-4000-8000-000000000002')$$, '42501', null, '5.02 demande de levée préparée hors ligne : rejeu refusé');
select throws_ok($$select * from public.reserves_transition_differee(pg_temp.r('r1'), 'acceptee', null, null,
  'f1f1f1f1-0000-4000-8000-000000000003')$$, '42501', null, '5.03 acceptation préparée hors ligne : rejeu refusé');
select throws_ok($$select * from public.reserves_ajouter_photo(pg_temp.r('r2'), 'levee', null, 'image/jpeg', 1000, 'levee.jpg',
  'f0f0f0f0-0000-4000-8000-000000000001')$$, '42501', null,
  '5.04 photo préparée hors ligne (emplacement déjà réservé) : rejeu refusé, pas de retour idempotent silencieux');
select throws_ok($$select * from public.reserves_ajouter_photo(pg_temp.r('r2'), 'levee', null, 'image/jpeg', 1000, 'levee2.jpg',
  'f1f1f1f1-0000-4000-8000-000000000004')$$, '42501', null, '5.05 nouvelle photo hors ligne : rejeu refusé');
select throws_ok($$select public.reserves_creer('e8000000-0000-0000-0000-000000000001', 'Création hors ligne', null, 'normale',
  null, null, null, null, false, null, 'f1f1f1f1-0000-4000-8000-000000000005')$$, 'P0001', 'Création de réserve non autorisée',
  '5.06 création hors ligne : refusée (règle existante : jamais permise à l''intervenant)');
select pg_temp.en_service();
select is((select count(*)::int from public.reserves_messages where origine_client_id = 'f1f1f1f1-0000-4000-8000-000000000001'), 0,
  '5.07 aucun message rejoué');
select is(pg_temp.empreinte(), current_setting('q.empreinte_avant'), '5.08 empreinte inchangée après le rejeu de la file');

-- ═════════════════════════════════════════════════════════════════════════════
-- §6 UTILISATEURS DE L'HÔTE — règles commerciales existantes, inchangées
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.reserves), 0, '6.01 admin de l''hôte suspendu : 0 réserve (règle existante)');
select throws_like($$select public.reserves_commenter(pg_temp.r('r1'), 'hôte suspendu')$$, '%non autorisé%',
  '6.02 admin de l''hôte suspendu : écriture refusée par la règle existante (pas par la nouvelle)');
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), null::boolean, '6.03 admin de l''hôte suspendu : pas d''information (il ne lit pas)');
select throws_ok($$update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, '6.04 l''hôte suspendu ne lève pas sa propre suspension');
select pg_temp.en_service();
select is((select abonnement_statut from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'), 'suspendu',
  '6.05 état commercial inchangé par le lot (Billing non modifié)');

-- ═════════════════════════════════════════════════════════════════════════════
-- §8 GARDE CENTRALE — tous chemins, tiers seulement
-- ═════════════════════════════════════════════════════════════════════════════
-- D n'a pas rejoint avant la suspension : il ne peut pas s'engager sur un hôte suspendu.
select pg_temp.en_tant_que('d0000000-0000-0000-0000-0000000000a1');
select throws_ok($$select public.reserves_rejoindre_intervention('e8200000-0000-0000-0000-00000000000d')$$,
  '42501', 'Organisation hôte suspendue : cette réserve est en lecture seule.',
  '8.01 rejoindre une intervention d''un hôte suspendu : refusé (garde centrale)');
select pg_temp.en_service();
select is((select statut from public.reserves_intervenants where id = 'e8200000-0000-0000-0000-00000000000d'), 'invitee',
  '8.02 l''invitation de D reste intacte, en attente');
select is((select count(*)::int from public.habilitations_applications_utilisateurs
  where utilisateur_id = 'd0000000-0000-0000-0000-0000000000a1' and application_code = 'reserves'), 0,
  '8.03 aucune habilitation partielle laissée (rollback complet)');
-- La clé serveur (cron, purge, support) n'est pas concernée.
select lives_ok($$update public.reserves_plans set nb_pages = 2 where id = 'e8100000-0000-0000-0000-000000000001'$$,
  '8.04 clé serveur : écriture possible (cron, maintenance)');
update public.reserves_plans set nb_pages = null where id = 'e8100000-0000-0000-0000-000000000001';
select ok(exists (select 1 from pg_trigger where tgname = 'reserves_garde_hote_suspendu'
  and tgrelid = 'public.reserves_historique'::regclass), '8.05 garde posée sur le journal');
select is((select count(distinct tgrelid)::int from pg_trigger where tgname = 'reserves_garde_hote_suspendu'), 11,
  '8.06 garde posée sur les 11 tables de l''hôte (10 + reserves_contacts, train V5)');
select ok(exists (select 1 from pg_trigger where tgname = 'reserves_garde_hote_suspendu'
  and tgrelid = 'public.reserves_contacts'::regclass), '8.06b garde posée sur reserves_contacts (GP ↔ Réserves)');
select ok(not has_function_privilege('authenticated', 'public.reserves_hote_ecriture_ouverte(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.reserves_hote_ecriture_ouverte(uuid)', 'execute'),
  '8.07 le prédicat commercial n''est pas exposé aux clients');
select ok(not has_function_privilege('anon', 'public.reserves_lecture_seule_hote(uuid)', 'execute'),
  '8.08 anon n''interroge pas l''état de lecture seule');

-- ═════════════════════════════════════════════════════════════════════════════
-- §9 RESTAURATION — l'écriture revient, sans reconnexion ni nouvelle invitation
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
select set_config('q.intervenant_c_avant', (select row(id, statut, entreprise_intervenante_id, rejoint_at)::text
  from public.reserves_intervenants where id = 'e8200000-0000-0000-0000-00000000000c'), true);
select set_config('q.historique_r2', (select string_agg(action, ',' order by created_at, ctid)
  from public.reserves_historique where reserve_id = pg_temp.r('r2')), true);
select set_config('q.nb_invitations', (select count(*) from public.reserves_invitations)::text, true);
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';

select pg_temp.session_c();  -- même session qu'avant la suspension
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), false, '9.01 lecture seule levée');
select lives_ok($$select public.reserves_repondre_responsabilite(pg_temp.r('r1'), true)$$, '9.02 acceptation à nouveau possible');
select lives_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'Saisi hors ligne', null,
  'f1f1f1f1-0000-4000-8000-000000000001')$$, '9.03 la mutation refusée pendant la suspension passe après restauration');
select lives_ok($$insert into storage.objects (bucket_id, name, metadata)
  values ('reserves-photos', current_setting('q.ph_attente_chemin'), '{"mimetype":"image/jpeg"}')$$,
  '9.04 le téléversement interrompu reprend');
select lives_ok($$select public.reserves_confirmer_photo(pg_temp.r('ph_attente_id'))$$, '9.05 et se confirme');
select is((select issue from public.reserves_transition_differee(pg_temp.r('r2'), 'levee_demandee', 'hors ligne', null,
  'f1f1f1f1-0000-4000-8000-000000000002')), 'appliquee', '9.06 demande de levée différée appliquée');
select is((select issue from public.reserves_transition_differee(pg_temp.r('r2'), 'levee_demandee', 'hors ligne', null,
  'f1f1f1f1-0000-4000-8000-000000000002')), 'rejeu', '9.07 son rejeu reste idempotent');
select is((select statut from public.reserves where id = pg_temp.r('r2')), 'levee_demandee', '9.08 statut appliqué');
select pg_temp.en_service();
select is((select row(id, statut, entreprise_intervenante_id, rejoint_at)::text
  from public.reserves_intervenants where id = 'e8200000-0000-0000-0000-00000000000c'), current_setting('q.intervenant_c_avant'),
  '9.09 l''intervenant C n''a pas été recréé ni modifié');
select is((select count(*)::int from public.reserves_invitations), current_setting('q.nb_invitations')::int,
  '9.10 aucune nouvelle invitation');
select is((select string_agg(action, ',' order by created_at, ctid) from public.reserves_historique
  where reserve_id = pg_temp.r('r2')), current_setting('q.historique_r2') || ',photo_ajoutee,demande_levee',
  '9.11 l''historique ne contient que les actions réellement appliquées');
select is((select count(*)::int from public.reserves_messages where origine_client_id = 'f1f1f1f1-0000-4000-8000-000000000001'), 1,
  '9.12 un seul message pour la clé hors ligne');
select pg_temp.en_tant_que('d0000000-0000-0000-0000-0000000000a1');
select lives_ok($$select public.reserves_rejoindre_intervention('e8200000-0000-0000-0000-00000000000d')$$,
  '9.13 D rejoint avec son invitation d''origine');
select is((select count(*)::int from public.reserves), 1, '9.14 D voit sa réserve');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select ok((select count(*) from public.reserves) = 3, '9.15 l''hôte retrouve ses réserves (règles existantes)');

-- ═════════════════════════════════════════════════════════════════════════════
-- §7 AUTRES FORMES DE FERMETURE DE L'HÔTE
-- ═════════════════════════════════════════════════════════════════════════════
-- Suspension programmée échue.
select pg_temp.en_service();
update public.entreprises set suspension_prevue_at = now() - interval '1 minute' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.session_c();
select is((select count(*)::int from public.reserves), 2, '7.01 suspension programmée échue : lecture conservée');
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'x')$$, '42501', null, '7.02 suspension programmée échue : écriture refusée');
select pg_temp.en_service();
update public.entreprises set suspension_prevue_at = now() + interval '7 days' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.session_c();
select lives_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'suspension à venir')$$, '7.03 suspension programmée à venir : écriture possible');
-- Entitlement Réserves retiré, organisation par ailleurs active.
select pg_temp.en_service();
update public.entreprises set suspension_prevue_at = null where id = 'a0000000-0000-0000-0000-000000000001';
update public.acces_applications_entreprises set autorise = false
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.session_c();
select is((select count(*)::int from public.reserves), 2, '7.04 entitlement retiré : lecture conservée');
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'x')$$, '42501', null, '7.05 entitlement retiré : écriture refusée');
-- Entitlement échu.
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = true, valide_jusqu_au = now() - interval '1 second'
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.session_c();
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'x')$$, '42501', null, '7.06 entitlement échu : écriture refusée');
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), true, '7.07 entitlement échu : écran en lecture seule');
-- Abonnement annulé.
select pg_temp.en_service();
update public.acces_applications_entreprises set valide_jusqu_au = null
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
update public.entreprises set abonnement_statut = 'annule' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.session_c();
select is((select count(*)::int from public.reserves), 2, '7.08 abonnement annulé : lecture conservée');
select throws_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'x')$$, '42501', null, '7.09 abonnement annulé : écriture refusée');
-- Retour à l'état normal.
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.session_c();
select lives_ok($$select public.reserves_commenter(pg_temp.r('r1'), 'rétabli')$$, '7.10 hôte rétabli : écriture possible');

-- ═════════════════════════════════════════════════════════════════════════════
-- §10 NON-ORACLE ET PRÉSERVATION DE R-04
-- ═════════════════════════════════════════════════════════════════════════════
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
select pg_temp.en_tant_que('20000000-0000-0000-0000-000000000001');
select is(public.reserves_lecture_seule_hote(pg_temp.r('r1')), null::boolean, '10.01 B : aucune information sur la réserve de A');
select is(public.reserves_chantier_lecture_seule_hote('e8000000-0000-0000-0000-000000000001'), null::boolean,
  '10.02 B : aucune information sur le chantier de A');
select pg_temp.session_c();
select is(public.reserves_lecture_seule_hote(pg_temp.r('r3')), null::boolean, '10.03 C : aucune information sur la réserve de D');
select throws_ok($$select public.reserves_commenter(pg_temp.r('r3'), 'x')$$, 'P0001', 'Commentaire non autorisé',
  '10.04 C sur la réserve de D : refus existant, sans révéler l''état de l''hôte');
-- Le tenant de l'intervenant n'est pas affecté sur ses propres données.
select lives_ok($$select public.reserves_preferences_definir('c0000000-0000-0000-0000-000000000001', 'message', false)$$,
  '10.05 C règle ses préférences de notification (son propre tenant)');
-- R-04 : un membre de l'hôte qui n'a plus le module Réserves supprime un chantier GP lié ;
-- le détachement côté Réserves n'est pas bloqué (la garde ne vise que les tiers).
select pg_temp.en_service();
update public.entreprises set abonnement_statut = 'actif' where id = 'a0000000-0000-0000-0000-000000000001';
insert into public.chantiers (id, entreprise_id, client_id, nom, statut) values
  ('a4000000-0000-0000-0000-0000000000f8', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'SUSP_GP', 'en_cours');
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select set_config('q.gp', public.reserves_importer_chantier_gp('a4000000-0000-0000-0000-0000000000f8')::text, true);
select pg_temp.en_service();
update public.acces_applications_entreprises set autorise = false
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves';
select pg_temp.en_tant_que('10000000-0000-0000-0000-000000000001');
select lives_ok($$delete from public.chantiers where id = 'a4000000-0000-0000-0000-0000000000f8'$$,
  '10.06 (R-04) membre de l''hôte sans module Réserves : suppression du chantier GP possible');
select pg_temp.en_service();
select ok((select source = 'reserves' and chantier_gp_id is null from public.reserves_chantiers where id = pg_temp.r('gp')),
  '10.07 (R-04) le chantier Réserves est détaché, pas bloqué par la garde');

select * from finish();
rollback;
