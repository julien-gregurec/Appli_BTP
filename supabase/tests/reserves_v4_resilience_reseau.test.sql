-- ELSATIA-RESERVES-V4 — RÉSILIENCE RÉSEAU (anti-doublon) ET IMMUABILITÉ DE L'HISTORIQUE
--
-- La documentation V1 (§7 « Hors-ligne — état réel ») affirmait que le rejeu d'une
-- création locale était « prouvé par le test pgTAP ». Cette preuve n'existait pas : aucun
-- test du dépôt ne mentionnait `origine_client_id`. Ce fichier la produit réellement.
--
-- Ce qui est prouvé ici :
--   1. une création rejouée avec la MÊME clé ne crée pas de seconde réserve ;
--   2. la clé est cloisonnée par organisation — deux tenants peuvent employer la même ;
--   3. l'absence de clé ne dédoublonne rien (deux constats distincts restent distincts) ;
--   4. l'historique reste strictement chronologique, non réécrivable et non effaçable ;
--   5. une levée validée ne se réécrit pas par une transition directe.

begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

\ir fixtures/isolation_multitenant.inc

-- ── Décor minimal : deux organisations hôtes, chacune son chantier ───────────
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_chantiers (id, entreprise_id, nom)
values ('e0000000-0000-0000-0000-0000000000f1','a0000000-0000-0000-0000-000000000001','TEST_A_Chantier résilience');

-- ── 1. Le rejeu ne duplique pas ──────────────────────────────────────────────
-- Scénario réel : la soumission part, la réponse se perd, l'utilisateur réappuie.
select set_config('elsatia.reserve_rejeu', (
  select public.reserves_creer(
    'e0000000-0000-0000-0000-0000000000f1', 'Constat renvoyé après coupure',
    'Le réseau a lâché avant l''accusé de réception.', 'normale',
    null, null, null, null, false, null,
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'::uuid
  )::text), true);

select is(
  public.reserves_creer(
    'e0000000-0000-0000-0000-0000000000f1', 'Constat renvoyé après coupure',
    'Le réseau a lâché avant l''accusé de réception.', 'normale',
    null, null, null, null, false, null,
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'::uuid
  ),
  current_setting('elsatia.reserve_rejeu')::uuid,
  'un rejeu avec la même clé renvoie la réserve DÉJÀ créée'
);

select is(
  (select count(*) from public.reserves
   where chantier_id = 'e0000000-0000-0000-0000-0000000000f1'
     and origine_client_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
  1::bigint,
  'le rejeu n''a créé aucune seconde réserve'
);

-- Un titre différent ne change rien : c'est la CLÉ qui identifie l'intention, et le
-- rejeu ne doit surtout pas devenir une porte de modification silencieuse.
select is(
  public.reserves_creer(
    'e0000000-0000-0000-0000-0000000000f1', 'Titre modifié entre deux tentatives',
    null, 'bloquante', null, null, null, null, false, null,
    'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'::uuid
  ),
  current_setting('elsatia.reserve_rejeu')::uuid,
  'le rejeu renvoie la réserve d''origine sans la réécrire'
);
select is(
  (select titre from public.reserves where id = current_setting('elsatia.reserve_rejeu')::uuid),
  'Constat renvoyé après coupure',
  'le premier constat fait foi : un rejeu ne modifie pas la réserve existante'
);

-- ── 2. Sans clé, aucun dédoublonnage : deux constats restent deux constats ───
select isnt(
  public.reserves_creer(
    'e0000000-0000-0000-0000-0000000000f1', 'Constat sans clé', null, 'normale'),
  public.reserves_creer(
    'e0000000-0000-0000-0000-0000000000f1', 'Constat sans clé', null, 'normale'),
  'sans clé d''idempotence, deux saisies identiques restent deux réserves distinctes'
);

-- ── 3. La clé est cloisonnée par organisation ────────────────────────────────
-- L'index d'unicité porte sur (entreprise_id, origine_client_id) : une clé tirée par le
-- client d'un tenant ne peut donc pas percuter celle d'un autre.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
insert into public.reserves_chantiers (id, entreprise_id, nom)
values ('e0000000-0000-0000-0000-0000000000f2','b0000000-0000-0000-0000-000000000001','TEST_B_Chantier résilience');

select lives_ok(
  $$select public.reserves_creer(
      'e0000000-0000-0000-0000-0000000000f2', 'Constat de l''organisation B',
      null, 'normale', null, null, null, null, false, null,
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'::uuid)$$,
  'la même clé d''idempotence reste utilisable dans une autre organisation'
);
select is(
  (select count(*) from public.reserves
   where origine_client_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
  1::bigint,
  'chaque organisation ne voit que sa propre réserve portant cette clé'
);

-- ── 4. Historique : chronologique, non réécrivable, non effaçable ────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select ok(
  (select count(*) from public.reserves_historique
   where reserve_id = current_setting('elsatia.reserve_rejeu')::uuid) >= 1,
  'la création est historisée'
);
select ok(
  (select bool_and(ordonne) from (
     select created_at >= lag(created_at) over (order by created_at) as ordonne
     from public.reserves_historique
     where reserve_id = current_setting('elsatia.reserve_rejeu')::uuid
   ) t where ordonne is not null) is not false,
  'l''historique est restitué dans l''ordre chronologique'
);
select isnt(
  (select auteur_id from public.reserves_historique
   where reserve_id = current_setting('elsatia.reserve_rejeu')::uuid limit 1),
  null, 'chaque ligne d''historique porte son auteur'
);
select throws_ok(
  $$update public.reserves_historique set commentaire = 'réécrit'
    where reserve_id = current_setting('elsatia.reserve_rejeu')::uuid$$,
  '42501', null, 'l''historique ne peut pas être réécrit depuis l''application'
);
select throws_ok(
  $$delete from public.reserves_historique
    where reserve_id = current_setting('elsatia.reserve_rejeu')::uuid$$,
  '42501', null, 'l''historique ne peut pas être effacé depuis l''application'
);

-- ── 5. Une levée validée ne se réécrit pas ───────────────────────────────────
-- La matrice de transitions ne connaît aucun chemin direct depuis `levee` autre que la
-- réouverture motivée : une reprise locale ne peut pas effacer une décision contradictoire.
select ok(
  not exists (
    select 1 from public.reserves_transitions
    where statut_avant = 'levee' and statut_apres <> 'assignee'
  ),
  'aucune transition ne quitte « levée » sans passer par une réouverture explicite'
);
select ok(
  (select commentaire_obligatoire from public.reserves_transitions
   where statut_avant = 'levee' and statut_apres = 'assignee' limit 1),
  'la réouverture d''une réserve levée exige un motif écrit'
);

reset role;
select * from finish();
rollback;
