-- ELSATIA-RESERVES-V1-FOUNDATION-AND-WORKFLOW-V1
-- Prouve le socle Réserves : machine à états vérifiée côté base, photo obligatoire par
-- réserve, historique immuable, entreprise invitée strictement limitée à ce qui lui est
-- attribué, isolation multi-tenant intacte et accès automatique du propriétaire global.

begin;
create extension if not exists pgtap with schema extensions;
select plan(98);

\ir fixtures/isolation_multitenant.inc

-- ── Décor ────────────────────────────────────────────────────────────────────
-- Entreprise C : le sous-traitant extérieur. C'est un tenant à part entière, sans aucune
-- appartenance à l'entreprise A : tout ce qu'il verra viendra de l'attribution nominative.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','intervenant-d@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom) values
  ('c0000000-0000-0000-0000-0000000000a1','Peintre','C'),
  ('d0000000-0000-0000-0000-0000000000a1','Plaquiste','D')
on conflict (id) do nothing;

insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','Entreprise Peinture C','ISOC0001'),
  ('d0000000-0000-0000-0000-000000000001','Entreprise Plâtrerie D','ISOD0001')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C'),
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Gérant D')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif'),
  ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'c0000000-0000-0000-0000-0000000000a1';
update public.utilisateurs set entreprise_active_id = 'd0000000-0000-0000-0000-000000000001'
where id = 'd0000000-0000-0000-0000-0000000000a1';

-- Droits Réserves : A est l'organisation hôte, B un tenant témoin qui ne doit jamais
-- rien voir de A.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','reserves','reserves_consultation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

-- ── 1. Catalogue et machine à états ──────────────────────────────────────────
select is(
  (select statut_produit from public.applications_elsatia where code = 'reserves'), 'interne',
  'Réserves est inscrite au catalogue sans être annoncée comme commercialisée'
);
select ok(
  (select actif from public.applications_elsatia where code = 'reserves'),
  'Réserves est une application active du catalogue'
);
select is(
  (select count(*) from public.roles_applications_elsatia where application_code = 'reserves'),
  5::bigint, 'les cinq rôles applicatifs Réserves sont déclarés'
);
select is(
  (select count(*) from public.reserves_transitions), 14::bigint,
  'la matrice des transitions compte quatorze arêtes'
);
select ok(
  not exists (select 1 from public.reserves_transitions where statut_avant = 'emise' and statut_apres = 'levee'),
  'aucune transition ne mène directement d''une réserve émise à une réserve levée'
);
select ok(
  not exists (select 1 from public.reserves_transitions where acteur = 'hote' and action = 'acceptation'),
  'l''organisation hôte ne peut pas accepter la responsabilité à la place de son intervenant'
);
select ok(
  not exists (select 1 from public.reserves_transitions where acteur = 'intervenant' and action = 'levee_validee'),
  'une entreprise intervenante ne peut pas valider sa propre levée'
);

-- ── 2. Chantier, plan et intervenants, côté hôte ─────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select lives_ok(
  $$insert into public.reserves_chantiers (id, entreprise_id, nom)
    values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','TEST_A_Résidence Les Tilleuls')$$,
  'l''administrateur Réserves crée un chantier propre à l''application, sans Gestion Pro'
);
select is(
  (select source from public.reserves_chantiers where id = 'e0000000-0000-0000-0000-000000000001'), 'reserves',
  'un chantier créé dans Réserves n''est rattaché à aucun chantier Gestion Pro'
);
select lives_ok(
  $$insert into public.reserves_plans (id, entreprise_id, chantier_id, nom, niveau, zone)
    values ('e1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001','Plan de masse','R+1','Aile Est')$$,
  'un plan est rattaché au chantier avec son niveau et sa zone'
);
select lives_ok(
  $$insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat)
    values ('e2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001','Entreprise Peinture C','Peinture'),
           ('e2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
            'e0000000-0000-0000-0000-000000000001','Entreprise Plâtrerie D','Plâtrerie')$$,
  'deux entreprises intervenantes sont nommées au chantier avant tout compte ELSATIA'
);
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-000000000001'), 'invitee',
  'une entreprise nommée reste « invitée » tant qu''elle n''a pas rejoint'
);

-- Un chantier d'une autre organisation reste inaccessible en écriture.
select throws_ok(
  $$insert into public.reserves_chantiers (entreprise_id, nom)
    values ('b0000000-0000-0000-0000-000000000001','TEST_A_Chantier volé')$$,
  '42501', null, 'un hôte ne peut pas créer un chantier dans une autre organisation'
);

-- ── 3. Invitation de l'entreprise extérieure ─────────────────────────────────
select lives_ok(
  $$select public.reserves_designer_entreprise_intervenante(
      'e2000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001')$$,
  'l''hôte désigne le compte ELSATIA de l''entreprise intervenante'
);
select lives_ok(
  $$select public.reserves_designer_entreprise_intervenante(
      'e2000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001')$$,
  'un second corps d''état est désigné sur le même chantier'
);
-- Contrôlé hors session : la ligne d'accès appartient au tenant invité, et l'hôte ne
-- doit justement PAS pouvoir la relire — c'est ce que vérifie l'assertion suivante.
reset role;
select is(
  (select source from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'reserves_invitation_gratuite',
  'l''invitation ouvre à l''entreprise extérieure un accès Réserves gratuit et tracé'
);
set local role authenticated;
select is(
  (select count(*) from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'l''hôte ne relit pas pour autant les droits applicatifs du tenant qu''il a invité'
);
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-000000000001'), 'invitee',
  'la désignation seule n''active pas l''intervenant : il doit encore rejoindre'
);
-- La désignation n'écrit aucune habilitation dans le tenant du tiers.
select is(
  (select count(*) from public.habilitations_applications_utilisateurs
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'), 0::bigint,
  'l''hôte n''écrit aucune habilitation utilisateur dans l''entreprise invitée'
);

-- L'entreprise invitée rejoint elle-même, en connaissance de cause.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);
select lives_ok(
  $$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-000000000001')$$,
  'un membre de l''entreprise invitée rejoint l''intervention et obtient le rôle gratuit'
);
select is(
  (select role_code from public.habilitations_applications_utilisateurs
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
     and utilisateur_id = 'c0000000-0000-0000-0000-0000000000a1' and application_code = 'reserves'),
  'reserves_intervenant', 'le compte invité est limité au rôle intervenant'
);
select throws_like(
  $$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-000000000002')$$,
  '%pas membre actif%',
  'un membre de C ne peut pas rejoindre l''intervention attribuée à D'
);

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-d@invalid.local', true);
select lives_ok(
  $$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-000000000002')$$,
  'le second corps d''état rejoint à son tour'
);

-- ── 4. Création de réserves ──────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select set_config('elsatia.test_reserve_1', (
  select public.reserves_creer(
    'e0000000-0000-0000-0000-000000000001', 'Peinture écaillée cage d''escalier',
    'Reprise complète de la sous-couche', 'haute', 'e2000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001', 0.42500, 0.61000, true, current_date - 1
  )::text), true);
select set_config('elsatia.test_reserve_2', (
  select public.reserves_creer(
    'e0000000-0000-0000-0000-000000000001', 'Joint de cloison ouvert',
    null, 'normale', 'e2000000-0000-0000-0000-000000000002'
  )::text), true);
select set_config('elsatia.test_reserve_3', (
  select public.reserves_creer(
    'e0000000-0000-0000-0000-000000000001', 'Réserve non encore attribuée'
  )::text), true);

select is(
  (select numero from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  1, 'la numérotation des réserves est propre au chantier et commence à 1'
);
select is(
  (select numero from public.reserves where id = current_setting('elsatia.test_reserve_3')::uuid),
  3, 'les réserves suivantes sont numérotées séquentiellement'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'assignee', 'une réserve créée avec une entreprise est directement assignée'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_3')::uuid),
  'emise', 'une réserve créée sans entreprise reste émise'
);
select is(
  (select position_x from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  0.42500::numeric, 'la position sur le plan est persistée telle qu''elle a été pointée'
);
select ok(
  (select photo_obligatoire_levee from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'l''exigence de photo est portée par la réserve elle-même, pas par un réglage global'
);
select ok(
  not (select photo_obligatoire_levee from public.reserves where id = current_setting('elsatia.test_reserve_2')::uuid),
  'une autre réserve du même chantier peut ne rien exiger : la décision est par réserve'
);

-- Idempotence hors-ligne : rejouer la même création locale ne duplique rien.
select is(
  public.reserves_creer('e0000000-0000-0000-0000-000000000001','Fissure linteau', null, 'normale',
    null, null, null, null, false, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  public.reserves_creer('e0000000-0000-0000-0000-000000000001','Fissure linteau', null, 'normale',
    null, null, null, null, false, null, 'aaaaaaaa-0000-0000-0000-000000000001'),
  'une création hors-ligne rejouée retombe sur la même réserve'
);

-- Cohérence référentielle : le plan pointé doit appartenir au chantier de la réserve.
insert into public.reserves_chantiers (id, entreprise_id, nom)
  values ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','TEST_A_Autre chantier');
insert into public.reserves_plans (id, entreprise_id, chantier_id, nom)
  values ('e1000000-0000-0000-0000-0000000000ff','a0000000-0000-0000-0000-000000000001',
          'e0000000-0000-0000-0000-000000000002','Plan d''un autre chantier');
select throws_like(
  $$select public.reserves_creer('e0000000-0000-0000-0000-000000000001','Repère hors chantier',
      null,'normale',null,'e1000000-0000-0000-0000-0000000000ff',0.5,0.5)$$,
  '%Plan invalide%', 'une réserve ne peut pas être pointée sur le plan d''un autre chantier'
);
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom)
  values ('e2000000-0000-0000-0000-0000000000ff','a0000000-0000-0000-0000-000000000001',
          'e0000000-0000-0000-0000-000000000002','Entreprise d''un autre chantier');
select throws_like(
  $$select public.reserves_creer('e0000000-0000-0000-0000-000000000001','Intervenant hors chantier',
      null,'normale','e2000000-0000-0000-0000-0000000000ff')$$,
  '%Intervenant invalide%',
  'une réserve ne peut pas être attribuée à une entreprise absente de son chantier'
);

-- ── 5. Ce que l'entreprise invitée voit, et ne voit pas ──────────────────────
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);

select is(
  (select count(*) from public.reserves), 1::bigint,
  'l''entreprise invitée ne voit que la réserve qui lui est nominativement attribuée'
);
select is(
  (select id from public.reserves), current_setting('elsatia.test_reserve_1')::uuid,
  'et c''est bien la sienne, pas celle d''un autre corps d''état'
);
select is(
  (select count(*) from public.reserves_intervenants), 1::bigint,
  'elle ne voit pas les autres entreprises intervenantes du chantier'
);
select is(
  (select count(*) from public.reserves_chantiers), 1::bigint,
  'elle voit l''identité du chantier où elle intervient, et rien d''autre'
);
select is(
  (select count(*) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, 'elle n''accède à aucune donnée client de l''organisation hôte'
);
select is(
  (select count(*) from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint, 'elle n''accède à aucun chantier Gestion Pro de l''organisation hôte'
);
select ok(
  not public.reserves_action_autorisee('a0000000-0000-0000-0000-000000000001','voir'),
  'elle n''obtient aucun droit d''organisation sur le tenant hôte'
);
select ok(
  not public.reserves_action_autorisee('c0000000-0000-0000-0000-000000000001','creer_reserve'),
  'le compte gratuit intervenant ne peut pas émettre de réserve, même chez lui'
);

-- Ses compteurs doivent refléter ce qu'elle voit. Filtrer sur « son » entreprise lui
-- renverrait zéro, puisque les réserves appartiennent au tenant de l'organisation hôte.
select is(
  (select total from public.reserves_tableau_de_bord()), 1::bigint,
  'le tableau de bord d''une entreprise invitée compte ses réserves attribuées'
);
select is(
  (select total from public.reserves_tableau_de_bord('c0000000-0000-0000-0000-000000000001')),
  0::bigint,
  'et ne compte rien sous son propre tenant, qui ne porte aucune réserve'
);

-- ── 6. Acceptation, refus, demande de levée ──────────────────────────────────
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_1')::uuid, true)$$,
  '%non autorisée%', 'l''entreprise intervenante ne peut pas valider sa propre levée'
);
select throws_like(
  $$select public.reserves_demander_levee(current_setting('elsatia.test_reserve_1')::uuid)$$,
  '%impossible%', 'une réserve seulement assignée ne peut pas sauter à la demande de levée'
);
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.test_reserve_1')::uuid, true)$$,
  'l''entreprise accepte la responsabilité de la réserve'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'acceptee', 'la réserve passe à l''état acceptée'
);
select throws_like(
  $$select public.reserves_demander_levee(current_setting('elsatia.test_reserve_1')::uuid)$$,
  '%Photo obligatoire%',
  'la demande de levée est refusée tant que la preuve photographique exigée manque'
);
-- V2 : une photo n'est plus un chemin annoncé mais un fichier. La base réserve
-- l'emplacement, le client dépose, puis la présence du fichier est confirmée.
select set_config('elsatia.photo_r1', (
  select photo_id::text from public.reserves_ajouter_photo(
    current_setting('elsatia.test_reserve_1')::uuid, 'travaux', 'Reprise terminée',
    'image/jpeg', 120000, 'travaux.jpg')), true);
insert into storage.objects (id, bucket_id, name, metadata)
select '99000000-0000-0000-0000-000000000001','reserves-photos', ph.storage_path, '{"mimetype":"image/jpeg"}'
from public.reserves_photos ph where ph.id = current_setting('elsatia.photo_r1')::uuid;
select lives_ok(
  $$select public.reserves_confirmer_photo(current_setting('elsatia.photo_r1')::uuid)$$,
  'l''entreprise joint la photo des travaux réalisés'
);
select lives_ok(
  $$select public.reserves_demander_levee(current_setting('elsatia.test_reserve_1')::uuid,
      'Reprise conforme au descriptif')$$,
  'la demande de levée aboutit une fois la preuve fournie'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'levee_demandee', 'la réserve attend la décision du responsable'
);

-- Refus de responsabilité par le second corps d'état : le motif est obligatoire.
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-d@invalid.local', true);
select throws_like(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.test_reserve_2')::uuid, false)$$,
  '%motif est obligatoire%', 'un refus de responsabilité sans motif est rejeté'
);
-- La preuve du refus est déposée avant la réponse, comme n'importe quelle photo.
select set_config('elsatia.photo_r2', (
  select photo_id::text from public.reserves_ajouter_photo(
    current_setting('elsatia.test_reserve_2')::uuid, 'preuve_refus', 'Ouvrage d''un tiers',
    'image/jpeg', 90000, 'preuve.jpg')), true);
insert into storage.objects (id, bucket_id, name, metadata)
select '99000000-0000-0000-0000-000000000002','reserves-photos', ph.storage_path, '{"mimetype":"image/jpeg"}'
from public.reserves_photos ph where ph.id = current_setting('elsatia.photo_r2')::uuid;
select lives_ok($$select public.reserves_confirmer_photo(current_setting('elsatia.photo_r2')::uuid)$$,
  'la preuve du refus est déposée');
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.test_reserve_2')::uuid, false,
      'Ouvrage non exécuté par nos équipes')$$,
  'le refus motivé, preuve jointe, est enregistré'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_2')::uuid),
  'refusee_responsabilite', 'la réserve repasse à la charge de l''organisation hôte'
);
select is(
  (select usage from public.reserves_photos where reserve_id = current_setting('elsatia.test_reserve_2')::uuid),
  'preuve_refus', 'la preuve du refus est rattachée à la réserve'
);

-- ── 7. Décision du responsable ───────────────────────────────────────────────
-- L'émetteur constate et attribue, mais ne prononce jamais la levée : c'est la
-- séparation des responsabilités du lot.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_1')::uuid, true)$$,
  '%non autorisée%', 'un émetteur ne peut pas valider une levée'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_1')::uuid, false)$$,
  '%motif est obligatoire%', 'un refus de levée sans commentaire est rejeté'
);
select lives_ok(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_1')::uuid, false,
      'Reprise incomplète sur la première volée')$$,
  'le responsable refuse la levée en motivant sa décision'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'levee_refusee', 'la réserve revient à l''entreprise avec le motif du refus'
);

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);
select lives_ok(
  $$select public.reserves_demander_levee(current_setting('elsatia.test_reserve_1')::uuid, 'Reprise complétée')$$,
  'l''entreprise redemande la levée après correction'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select lives_ok(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_1')::uuid, true)$$,
  'le responsable valide la levée'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'levee', 'la réserve est levée'
);
select ok(
  (select levee_at is not null and cloturee_at is not null from public.reserves
   where id = current_setting('elsatia.test_reserve_1')::uuid),
  'la date de levée et la clôture sont horodatées'
);

-- Réattribution après refus de responsabilité, puis réouverture d'une réserve levée.
select lives_ok(
  $$select public.reserves_assigner(current_setting('elsatia.test_reserve_2')::uuid,
      'e2000000-0000-0000-0000-000000000001', 'Reprise confiée au peintre')$$,
  'l''hôte réattribue la réserve refusée à une autre entreprise'
);
select lives_ok(
  $$select public.reserves_rouvrir(current_setting('elsatia.test_reserve_1')::uuid,
      'Défaut réapparu à la réception')$$,
  'une réserve levée peut être rouverte, motif à l''appui'
);
select ok(
  (select statut = 'assignee' and levee_at is null and cloturee_at is null
   from public.reserves where id = current_setting('elsatia.test_reserve_1')::uuid),
  'la réouverture remet la réserve en charge et efface la clôture'
);

-- ── 8. La machine à états n'est pas contournable ─────────────────────────────
select throws_like(
  $$update public.reserves set statut = 'levee'
    where id = current_setting('elsatia.test_reserve_1')::uuid$$,
  '%Transition de réserve interdite%',
  'un update direct du statut est refusé même pour un administrateur de l''organisation'
);
select throws_like(
  $$update public.reserves set intervenant_id = 'e2000000-0000-0000-0000-000000000002'
    where id = current_setting('elsatia.test_reserve_1')::uuid$$,
  '%Transition de réserve interdite%',
  'un update direct de l''attribution est refusé'
);
select lives_ok(
  $$update public.reserves set description = 'Description précisée après visite'
    where id = current_setting('elsatia.test_reserve_1')::uuid$$,
  'les champs descriptifs restent modifiables sans passer par une transition'
);

-- ── 9. Historique ────────────────────────────────────────────────────────────
select ok(
  (select count(*) from public.reserves_historique
   where reserve_id = current_setting('elsatia.test_reserve_1')::uuid) >= 8,
  'chaque étape du cycle de vie a laissé une trace'
);
select is(
  (select string_agg(action, ',' order by created_at)
   from public.reserves_historique where reserve_id = current_setting('elsatia.test_reserve_1')::uuid),
  'creation,acceptation,photo_ajoutee,demande_levee,levee_refusee,demande_levee,levee_validee,reouverture',
  'l''historique restitue la séquence exacte des actions'
);
select is(
  (select commentaire from public.reserves_historique
   where reserve_id = current_setting('elsatia.test_reserve_1')::uuid and action = 'levee_refusee'),
  'Reprise incomplète sur la première volée', 'le motif du refus de levée est conservé'
);
select is(
  (select statut_avant || '→' || statut_apres from public.reserves_historique
   where reserve_id = current_setting('elsatia.test_reserve_1')::uuid and action = 'reouverture'),
  'levee→assignee', 'l''historique conserve l''avant et l''après de chaque transition'
);
select throws_ok(
  $$update public.reserves_historique set commentaire = 'réécrit'
    where reserve_id = current_setting('elsatia.test_reserve_1')::uuid$$,
  '42501', null, 'l''historique ne peut pas être réécrit depuis l''application'
);
select throws_ok(
  $$delete from public.reserves_historique
    where reserve_id = current_setting('elsatia.test_reserve_1')::uuid$$,
  '42501', null, 'l''historique ne peut pas être effacé depuis l''application'
);

-- ── 10. Messagerie et notifications ──────────────────────────────────────────
select lives_ok(
  $$select public.reserves_commenter(current_setting('elsatia.test_reserve_1')::uuid,
      'Merci de repasser avant vendredi')$$,
  'un commentaire est déposé sur la réserve'
);
select is(
  (select intervenant_id from public.reserves_conversations
   where reserve_id = current_setting('elsatia.test_reserve_1')::uuid),
  'e2000000-0000-0000-0000-000000000001'::uuid,
  'la conversation de réserve est partagée avec l''entreprise porteuse'
);
select ok(
  (select count(*) from public.reserves_evenements_notifications) > 0,
  'les événements de notification sont écrits par les actions métier'
);
select is(
  (select count(*) from public.reserves_evenements_notifications where distribue_at is not null),
  0::bigint, 'aucun événement n''est distribué : V1 ne branche aucun canal externe'
);

-- ── 11. Tableau de bord ──────────────────────────────────────────────────────
select is(
  (select total from public.reserves_tableau_de_bord('a0000000-0000-0000-0000-000000000001')),
  4::bigint, 'le tableau de bord de l''hôte compte toutes ses réserves'
);
select is(
  (select en_retard from public.reserves_tableau_de_bord('a0000000-0000-0000-0000-000000000001')),
  1::bigint, 'la réserve dont l''échéance est dépassée est comptée en retard'
);
select is(
  (select total from public.reserves_tableau_de_bord(
     'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001',
     'e2000000-0000-0000-0000-000000000002')),
  0::bigint, 'le filtre par entreprise intervenante restreint bien le décompte'
);
select is(
  (select count(*) from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001')),
  4::bigint, 'l''export du chantier liste les réserves de ce chantier'
);

-- ── 12. Isolation multi-tenant ───────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is((select count(*) from public.reserves), 0::bigint,
  'entreprise B ne voit aucune réserve de l''entreprise A');
select is((select count(*) from public.reserves_chantiers), 0::bigint,
  'entreprise B ne voit aucun chantier Réserves de l''entreprise A');
select is((select count(*) from public.reserves_intervenants), 0::bigint,
  'entreprise B ne voit aucune entreprise intervenante de l''entreprise A');
select is((select count(*) from public.reserves_historique), 0::bigint,
  'entreprise B ne voit aucun historique de l''entreprise A');
select is((select count(*) from public.reserves_photos), 0::bigint,
  'entreprise B ne voit aucune photo de l''entreprise A');
select is((select count(*) from public.reserves_messages), 0::bigint,
  'entreprise B ne voit aucun message de l''entreprise A');
select is(
  (select total from public.reserves_tableau_de_bord('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'le tableau de bord ne fuit pas les compteurs d''une autre organisation'
);
select throws_like(
  $$select public.reserves_creer('e0000000-0000-0000-0000-000000000001','Réserve injectée')$$,
  '%non autorisée%', 'entreprise B ne peut pas créer de réserve sur le chantier de A'
);
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.test_reserve_2')::uuid, true)$$,
  '%non autorisée%', 'entreprise B ne peut pas statuer sur une réserve de A'
);

-- ── 13. Propriétaire global ──────────────────────────────────────────────────
-- Le catalogue lui est ouvert par 00266 sans habilitation Réserves ; les données d'un
-- client restent fermées, exactement comme pour Colors et Gestion Pro.
reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-00000000000f',
       'authenticated','authenticated', pa.email, crypt('test', gen_salt('bf')), now(), now(), now()
from public.plateforme_admins pa where pa.proprietaire
on conflict do nothing;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('30000000-0000-0000-0000-0000000000fb','30000000-0000-0000-0000-00000000000f',
        'test-owner-totp','totp','verified', now(), now(), 'secret');
insert into public.utilisateurs (id, prenom, nom)
values ('30000000-0000-0000-0000-00000000000f','Propriétaire','ELSATIA') on conflict (id) do nothing;

-- L'identité propriétaire s'active par le chemin canonique de 00266 (AAL2 + facteur MFA
-- vérifié), jamais par une écriture directe : la machine à états de `plateforme_admins`
-- refuse un passage « en attente → active » qui ne passerait pas par la revendication.
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000f', true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select lives_ok(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  'le propriétaire global revendique son identité par le chemin canonique'
);

select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','reserves'),
  'le propriétaire global accède à Réserves sans habilitation manuelle');
select is(
  (select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
   where application_code = 'reserves'), 1::bigint,
  'Réserves apparaît dans son sélecteur d''applications'
);
select is((select count(*) from public.reserves), 0::bigint,
  'accès total au catalogue ne veut pas dire accès aux réserves d''un client');
select ok(
  not public.reserves_action_autorisee('a0000000-0000-0000-0000-000000000001','creer_reserve'),
  'le propriétaire global n''obtient aucun droit d''écriture métier sur un tenant'
);

reset role;
select * from finish();
rollback;
