-- ELSATIA-RESERVES-V3 — PARCOURS DE BOUT EN BOUT
--
-- Rejoue, dans l'ordre et sans raccourci, le scénario complet de la V3 :
--
--   A invite B par e-mail → B rejoint → A crée une réserve sur la PAGE 2 d'un plan PDF
--   → B est notifiée → B accepte → B demande la levée → A valide → A exporte le PDF de B
--   → A révoque B → l'historique reste intact.
--
-- Chaque étape est jouée SOUS L'IDENTITÉ RÉELLE de son acteur : ce test ne vérifie pas
-- seulement que la séquence aboutit, mais qu'aucun acteur ne peut franchir une étape qui
-- ne lui revient pas. C'est la différence entre « le parcours marche » et « le parcours
-- est le seul chemin possible ».

begin;
create extension if not exists pgtap with schema extensions;
select plan(41);

\ir fixtures/isolation_multitenant.inc

-- ── Décor : l'organisation hôte A, l'entreprise intervenante B ───────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000','f0000000-0000-0000-0000-0000000000a1',
  'authenticated','authenticated','gerant-b@invalid.local',
  crypt('test', gen_salt('bf')), now(), now(), now()
) on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom)
values ('f0000000-0000-0000-0000-0000000000a1','Gérant','B') on conflict (id) do nothing;

insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion)
values ('f0000000-0000-0000-0000-000000000001','Étanchéité B','ETANCHEITE B SARL',
        '55555555500055','Colmar','ISOF0001') on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom)
values ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Gérant')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001','actif') on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'f0000000-0000-0000-0000-000000000001'
where id = 'f0000000-0000-0000-0000-0000000000a1';

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test');

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville)
values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'TEST_A_Groupe scolaire','GS-2026','Colmar');

insert into public.reserves_plans (id, entreprise_id, chantier_id, nom, mime_type, nb_pages)
values ('e3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001','Plan de masse','application/pdf', 6);

insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, corps_etat, raison_sociale, siret, contact_nom
) values (
  'e2000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001','Étanchéité B','Étanchéité',
  'ETANCHEITE B SARL','55555555500055','Bernard É.'
);

-- ── 1. A invite B par e-mail ─────────────────────────────────────────────────
select set_config('elsatia.jeton', encode(extensions.digest('parcours-e2e', 'sha256'), 'hex'), true);

select lives_ok(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-00000000000b',
      current_setting('elsatia.jeton'),
      'gerant-b@invalid.local', 'Bernard É.')$$,
  '1. A émet une invitation à l''adresse du contact de B');

select is(
  (select etat from public.reserves_invitations_chantier('e0000000-0000-0000-0000-000000000001')),
  'a_envoyer',
  'l''invitation attend son envoi : « créée » et « partie » sont deux états distincts');

select lives_ok(
  $$select public.reserves_invitation_marquer_envoyee(
      (select id from public.reserves_invitations_chantier('e0000000-0000-0000-0000-000000000001')))$$,
  'la couche applicative confirme la remise au transporteur e-mail');
select is(
  (select etat from public.reserves_invitations_chantier('e0000000-0000-0000-0000-000000000001')),
  'en_attente', 'l''invitation est désormais en attente de réponse');

-- Le contenu du lien, tel que B le verra sans être connecté.
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select chantier from public.reserves_invitation_consulter(current_setting('elsatia.jeton'))),
  'TEST_A_Groupe scolaire', 'B découvre le chantier concerné sans avoir de compte ouvert');
select is(
  (select organisation_hote from public.reserves_invitation_consulter(current_setting('elsatia.jeton'))),
  'Entreprise Isolation A', 'et l''organisation qui l''invite');

-- ── 2. B rejoint ─────────────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'gerant-b@invalid.local', true);

select lives_ok(
  $$select public.reserves_invitation_accepter(
      current_setting('elsatia.jeton'), 'f0000000-0000-0000-0000-000000000001')$$,
  '2. B rejoint l''intervention par son lien, sans qu''aucun identifiant technique n''ait circulé');
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-00000000000b'),
  'active', 'l''intervention de B est active');
select ok(
  public.a_acces_application('f0000000-0000-0000-0000-000000000001', 'reserves'),
  'B dispose de l''accès applicatif gratuit');
select is(
  (select count(*) from public.reserves_invitation_consulter(current_setting('elsatia.jeton')))::integer,
  0, 'et le lien est consommé : il ne resservira pas');

-- ── 3. A crée une réserve sur la page 2 du plan PDF ─────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select set_config('elsatia.reserve', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Relevé d''étanchéité insuffisant',
  'Le relevé ne monte pas à 15 cm au-dessus du niveau fini.',
  'haute','e2000000-0000-0000-0000-00000000000b','e3000000-0000-0000-0000-000000000001',
  0.61250, 0.32000, false, current_date + 10, null, 2)::text), true);

select is(
  (select plan_page from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  2, '3. la réserve mémorise la page 2 du plan PDF, pas seulement x et y');
select is(
  (select position_x from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  0.61250::numeric, 'la coordonnée est une fraction de page');
select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 2))::integer,
  1, 'la pastille apparaît sur la page 2');
select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 1))::integer,
  0, 'et pas sur la page 1');

-- ── 4. B est notifiée ────────────────────────────────────────────────────────
reset role;
select is(
  (select count(*) from public.reserves_evenements_notifications
   where reserve_id = current_setting('elsatia.reserve')::uuid
     and type = 'reserve_assignee'
     and destinataire_entreprise_id = 'f0000000-0000-0000-0000-000000000001')::integer,
  1, '4. l''attribution produit un événement adressé à B');

select ok(
  public.reserves_notifications_preparer(200) > 0,
  'le distributeur prépare les envois');
select is(
  (select count(*) from public.reserves_notifications_envois en
   where en.destinataire_email = 'gerant-b@invalid.local' and en.statut = 'a_envoyer')::integer,
  1, 'un e-mail, un seul, est prêt pour le gérant de B');
select is(
  (select public.reserves_notifications_preparer(200))::integer,
  0, 'et un second passage n''en prépare aucun autre : l''idempotence tient');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'gerant-b@invalid.local', true);
select ok(
  public.reserves_notifications_compteur() > 0,
  'B voit la notification dans l''application, indépendamment de l''e-mail');

-- ── 5. B accepte la responsabilité ──────────────────────────────────────────
select lives_ok(
  $$select public.reserves_repondre_responsabilite(
      current_setting('elsatia.reserve')::uuid, true)$$,
  '5. B accepte la responsabilité');
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'acceptee', 'la réserve passe à « acceptée »');
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.reserve')::uuid, true)$$,
  '%non autorisée%',
  'B ne peut pas valider sa propre levée : la matrice réserve ce geste à l''hôte');

-- ── 6. B demande la levée ────────────────────────────────────────────────────
select lives_ok(
  $$select public.reserves_demander_levee(
      current_setting('elsatia.reserve')::uuid, 'Relevé repris sur 18 cm.')$$,
  '6. B demande la levée');
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'levee_demandee', 'la réserve attend la décision de A');

-- ── 7. A valide la levée ─────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$select public.reserves_statuer_levee(current_setting('elsatia.reserve')::uuid, true)$$,
  '7. A valide la levée');
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'levee', 'la réserve est levée');
select ok(
  (select levee_at is not null from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'et la date de levée est horodatée');

-- ── 8. A exporte le PDF de B ─────────────────────────────────────────────────
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b'))::integer,
  1, '8. l''export restreint à B contient sa réserve');
select is(
  (select plan_page from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b')),
  2, 'avec la page du plan, pour que le repère soit retrouvable sur le document');
select is(
  (select intervenant from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b')),
  'Étanchéité B', 'et l''entreprise nommément désignée');
-- La chronologie complète du dossier, dans l'ordre : constat, acceptation, demande,
-- validation. C'est ce que le PDF « avec historique » imprime.
select is(
  (select array_agg(action order by created_at)
   from public.reserves_export_historique(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b')),
  array['creation','acceptation','demande_levee','levee_validee'],
  'l''export « avec historique » dispose de toute la chronologie du dossier');
select is(
  (select organisation from public.reserves_export_entete('e0000000-0000-0000-0000-000000000001')),
  'Entreprise Isolation A', 'l''entête porte l''organisation émettrice, exigée sur tout export');

-- ── 9. A révoque B ───────────────────────────────────────────────────────────
select set_config('elsatia.historique_avant',
  (select count(*)::text from public.reserves_historique), true);
select set_config('elsatia.photos_avant',
  (select count(*)::text from public.reserves_photos), true);

select is(
  (select reserves_ouvertes from public.reserves_revoquer_intervenant(
     'e2000000-0000-0000-0000-00000000000b','Fin de mission')),
  0, '9. A révoque B — aucune réserve ne reste ouverte sur elle');
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-00000000000b'),
  'revoquee', 'l''intervention est révoquée');

-- ── 10. L'historique est intact ──────────────────────────────────────────────
select is(
  (select count(*)::text from public.reserves_historique),
  current_setting('elsatia.historique_avant'),
  '10. aucune ligne d''historique n''a disparu');
select is(
  (select count(*)::text from public.reserves_photos),
  current_setting('elsatia.photos_avant'),
  'aucune photo n''a été supprimée');
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'levee', 'la réserve levée le reste : révoquer n''annule pas le travail fait');
select is(
  (select count(*) from public.reserves_export_historique(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b'))::integer,
  4, 'et l''hôte exporte toujours le dossier complet de l''entreprise révoquée');
select is(
  (select intervenant from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-00000000000b')),
  'Étanchéité B', 'le nom de l''entreprise reste au dossier, révoquée ou non');

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'gerant-b@invalid.local', true);
select is(
  (select count(*) from public.reserves)::integer,
  0, 'côté B, l''accès est bien coupé : elle ne voit plus aucune réserve du chantier');
select is(
  (select count(*) from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'ni ne peut plus exporter quoi que ce soit');

reset role;
select * from finish();
rollback;
