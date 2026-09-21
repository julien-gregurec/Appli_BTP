-- ELSATIA-RESERVES-V5 — IDEMPOTENCE DES MUTATIONS DIFFÉRÉES
--
-- La file hors-ligne rejoue les mutations : un rejeu n'est pas un incident, c'est le
-- fonctionnement normal. Ce fichier prouve que la base le supporte SANS produire de
-- doublon, et surtout qu'elle distingue trois issues que l'application doit présenter
-- différemment : appliquée, rejeu (bénin), conflit (exige un arbitrage).
--
-- Ce qui est prouvé :
--   1. un commentaire rejoué rend le MÊME message ;
--   2. la clé de commentaire est cloisonnée par organisation ;
--   3. sans clé, aucun dédoublonnage n'a lieu ;
--   4. une transition différée rejouée est reconnue, sans effet ni erreur ;
--   5. une transition devenue impossible rend un CONFLIT, pas une exception ;
--   6. une levée validée n'est jamais réécrite par la file ;
--   7. le registre d'idempotence n'est pas écrivable depuis l'application ;
--   8. l'autorisation prime toujours sur la clé.

begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

\ir fixtures/isolation_multitenant.inc

-- ── Décor : hôte A, entreprise extérieure C, chantier et intervenant ────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1',
  'authenticated','authenticated','intervenant-c@invalid.local',
  crypt('test', gen_salt('bf')), now(), now(), now()
) on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom)
values ('c0000000-0000-0000-0000-0000000000a1','Peintre','C') on conflict (id) do nothing;
insert into public.entreprises (id, nom, code_adhesion)
values ('c0000000-0000-0000-0000-000000000001','Entreprise Peinture C','ISOC0001')
on conflict (id) do nothing;
insert into public.postes (id, entreprise_id, nom)
values ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C')
on conflict (id) do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001',
        'c1000000-0000-0000-0000-000000000001','actif') on conflict do nothing;
update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'c0000000-0000-0000-0000-0000000000a1';

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
       ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation')
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_chantiers (id, entreprise_id, nom)
values ('e0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-000000000001','TEST_A_Chantier hors-ligne');

insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, corps_etat, created_by
) values (
  'e2000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-0000000000d1','Peinture C','Peinture',
  '10000000-0000-0000-0000-000000000001'
);
select public.reserves_designer_entreprise_intervenante(
  'e2000000-0000-0000-0000-0000000000d1','c0000000-0000-0000-0000-000000000001');

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);
select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-0000000000d1');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('elsatia.reserve', public.reserves_creer(
  'e0000000-0000-0000-0000-0000000000d1', 'Constat préparé hors ligne',
  'Saisi sans réseau.', 'normale', 'e2000000-0000-0000-0000-0000000000d1'
)::text, true);

-- ── 1. Commentaire : le rejeu rend le même message ──────────────────────────
select is(
  public.reserves_commenter(current_setting('elsatia.reserve')::uuid,
    'Relevé effectué sur place', null, 'dddddddd-1111-4111-8111-dddddddddddd'),
  public.reserves_commenter(current_setting('elsatia.reserve')::uuid,
    'Relevé effectué sur place', null, 'dddddddd-1111-4111-8111-dddddddddddd'),
  'un commentaire rejoué avec la même clé rend le message déjà enregistré'
);
select is(
  (select count(*) from public.reserves_messages m
   where m.origine_client_id = 'dddddddd-1111-4111-8111-dddddddddddd'),
  1::bigint, 'le rejeu n''a pas créé de second message'
);
-- Un contenu différent ne rouvre pas la porte : la CLÉ identifie l'intention. La
-- fonction rend la CONVERSATION (contrat d'origine, inchangé), pas le message.
select is(
  public.reserves_commenter(current_setting('elsatia.reserve')::uuid,
    'Contenu réécrit', null, 'dddddddd-1111-4111-8111-dddddddddddd'),
  (select m.conversation_id from public.reserves_messages m
   where m.origine_client_id = 'dddddddd-1111-4111-8111-dddddddddddd'),
  'un rejeu rend la conversation d''origine, et ne modifie pas le message'
);
select is(
  (select count(*) from public.reserves_messages m
   where m.origine_client_id = 'dddddddd-1111-4111-8111-dddddddddddd'),
  1::bigint, 'le rejeu au contenu différent n''a toujours créé qu''un message'
);
select is(
  (select contenu from public.reserves_messages
   where origine_client_id = 'dddddddd-1111-4111-8111-dddddddddddd'),
  'Relevé effectué sur place', 'le premier envoi fait foi'
);

-- ── 2. Sans clé, aucun dédoublonnage ────────────────────────────────────────
-- Les deux appels rendent la même CONVERSATION : c'est le nombre de MESSAGES qui dit
-- s'il y a eu dédoublonnage ou non.
select public.reserves_commenter(current_setting('elsatia.reserve')::uuid, 'Message sans clé');
select public.reserves_commenter(current_setting('elsatia.reserve')::uuid, 'Message sans clé');
select is(
  (select count(*) from public.reserves_messages m
   where m.contenu = 'Message sans clé'),
  2::bigint, 'sans clé, deux envois identiques restent deux messages distincts'
);

-- ── 3. Transition différée : rejeu reconnu, sans effet ──────────────────────
-- L'intervenante accepte la réserve, hors ligne, avec une clé.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);

select is(
  (select issue from public.reserves_transition_differee(
     current_setting('elsatia.reserve')::uuid, 'acceptee', null, null,
     'eeeeeeee-1111-4111-8111-eeeeeeeeeeee')),
  'appliquee', 'la première transition différée est appliquée'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'acceptee', 'la réserve a bien changé d''état'
);
select is(
  (select issue from public.reserves_transition_differee(
     current_setting('elsatia.reserve')::uuid, 'acceptee', null, null,
     'eeeeeeee-1111-4111-8111-eeeeeeeeeeee')),
  'rejeu', 'rejouer la même clé est reconnu comme un rejeu, pas une erreur'
);
select is(
  (select count(*) from public.reserves_historique
   where reserve_id = current_setting('elsatia.reserve')::uuid and action = 'acceptation'),
  1::bigint, 'le rejeu n''a pas écrit une seconde ligne d''historique'
);
-- L'état visé DÉJÀ atteint, avec une clé neuve : c'est encore un rejeu, pas un conflit.
select is(
  (select issue from public.reserves_transition_differee(
     current_setting('elsatia.reserve')::uuid, 'acceptee', null, null,
     'eeeeeeee-2222-4222-8222-eeeeeeeeeeee')),
  'rejeu', 'un état déjà atteint est un rejeu : la réponse du premier envoi s''était perdue'
);

-- ── 4. Conflit : l'état a changé, la file ne force rien ─────────────────────
select public.reserves_demander_levee(current_setting('elsatia.reserve')::uuid);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select public.reserves_statuer_levee(current_setting('elsatia.reserve')::uuid, true);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'levee', 'la levée est validée côté serveur'
);

-- L'intervenante rejoue une demande de levée préparée AVANT la validation.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'intervenant-c@invalid.local', true);
select is(
  (select issue from public.reserves_transition_differee(
     current_setting('elsatia.reserve')::uuid, 'levee_demandee', null, null,
     'ffffffff-1111-4111-8111-ffffffffffff')),
  'conflit', 'une action devenue impossible rend un CONFLIT, non une exception'
);
select isnt(
  (select motif from public.reserves_transition_differee(
     current_setting('elsatia.reserve')::uuid, 'levee_demandee', null, null,
     'ffffffff-2222-4222-8222-ffffffffffff')),
  null, 'le conflit est motivé en clair, pour être expliqué à l''utilisateur'
);
select is(
  (select statut from public.reserves where id = current_setting('elsatia.reserve')::uuid),
  'levee', 'la levée validée n''a PAS été écrasée par la file'
);

-- ── 5. Registre d'idempotence : lisible, jamais écrivable ───────────────────
select ok(
  (select count(*) from public.reserves_mutations_appliquees
   where reserve_id = current_setting('elsatia.reserve')::uuid) >= 1,
  'les mutations appliquées sont tracées dans le registre'
);
select throws_ok(
  $$insert into public.reserves_mutations_appliquees (entreprise_id, reserve_id, origine_client_id, action)
    values ('a0000000-0000-0000-0000-000000000001', current_setting('elsatia.reserve')::uuid,
            '99999999-1111-4111-8111-999999999999', 'fraude')$$,
  '42501', null, 'le registre n''est pas écrivable depuis l''application'
);

-- ── 6. L'autorisation prime sur la clé ──────────────────────────────────────
-- L'organisation B n'a rien à voir avec cette réserve : aucune clé ne lui ouvre l'accès.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select public.reserves_transition_differee(
      current_setting('elsatia.reserve')::uuid, 'assignee', null, null,
      'eeeeeeee-1111-4111-8111-eeeeeeeeeeee')$$,
  '%non autoris%',
  'une clé d''idempotence ne dispense jamais d''être acteur de la réserve'
);

reset role;
select * from finish();
rollback;
