-- ELSATIA-RESERVES-V3-COLLABORATION-ET-LIVRABLES
-- Prouve l'annuaire opt-in et sa non-énumérabilité, le cycle complet du lien
-- d'invitation (émission, expiration, usage unique, révocation, nominativité), la
-- distribution réelle des notifications avec sa clé d'idempotence, le producteur
-- d'échéances, les coordonnées de plan PDF page par page, la révocation d'une entreprise
-- avec transfert de responsabilité et historique intact, et l'isolation multi-tenant de
-- tous les exports.

begin;
create extension if not exists pgtap with schema extensions;
select plan(148);

\ir fixtures/isolation_multitenant.inc

-- ── Décor ────────────────────────────────────────────────────────────────────
-- C et D sont deux entreprises intervenantes disposant d'un compte ELSATIA.
-- E est une organisation qui possède un compte mais ne s'est PAS publiée à l'annuaire :
-- elle sert à prouver que la recherche par nom ne la trouve pas et que son SIRET, lui,
-- la désigne.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','peintre-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','platrier-d@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','e0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','menuisier-e@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom) values
  ('c0000000-0000-0000-0000-0000000000a1','Peintre','C'),
  ('d0000000-0000-0000-0000-0000000000a1','Plaquiste','D'),
  ('e0000000-0000-0000-0000-0000000000a1','Menuisier','E')
on conflict (id) do nothing;

insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','Peinture C','PEINTURE C SARL','11111111100011','Colmar','ISOC0001'),
  ('d0000000-0000-0000-0000-000000000001','Plâtrerie D','PLATRERIE D SAS','22222222200022','Mulhouse','ISOD0001'),
  ('e0000000-0000-0000-0000-000000000001','Menuiserie E','MENUISERIE E EURL','33333333300033','Sélestat','ISOE0001')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C'),
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Gérant D'),
  ('e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Gérant E')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif'),
  ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','actif'),
  ('e0000000-0000-0000-0000-0000000000a1','e0000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'c0000000-0000-0000-0000-0000000000a1';
update public.utilisateurs set entreprise_active_id = 'd0000000-0000-0000-0000-000000000001'
where id = 'd0000000-0000-0000-0000-0000000000a1';
update public.utilisateurs set entreprise_active_id = 'e0000000-0000-0000-0000-000000000001'
where id = 'e0000000-0000-0000-0000-0000000000a1';

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('d0000000-0000-0000-0000-000000000001','reserves', true, 'test');

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','reserves','reserves_consultation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-0000000000a1','reserves','reserves_admin_organisation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_chantiers (id, entreprise_id, nom, client)
values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'TEST_A_Résidence','SCI Tilleuls');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ANNUAIRE : OPT-IN, SIRET EXACT, ET RIEN D'AUTRE
-- ═══════════════════════════════════════════════════════════════════════════
select is(public.reserves_siret_normalise('123 456 789 00012'), '12345678900012',
  'un SIRET saisi avec des espaces est normalisé');
select is(public.reserves_siret_normalise('   '), null,
  'une saisie vide ne produit pas un SIRET vide');

select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','Peinture'))::integer,
  0, 'une organisation non publiée reste introuvable par son nom');

select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','11111111100011'))::integer,
  1, 'mais son SIRET exact la désigne : c''est une donnée publique, pas une énumération');

select is(
  (select nom from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','11111111100011')),
  'PEINTURE C SARL', 'la recherche rend la raison sociale, pas un identifiant technique');

select is(
  (select origine from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','111 111 111 00011')),
  'siret', 'le SIRET est reconnu quelle que soit sa mise en forme');

select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','1111111110001'))::integer,
  0, 'un SIRET tronqué ne cherche rien : un préfixe serait une énumération déguisée');

select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','Pe'))::integer,
  0, 'un terme de moins de trois caractères ne balaie pas l''annuaire');

-- Publication volontaire de C, faite par C elle-même.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select throws_like(
  $$select public.reserves_annuaire_publier('c0000000-0000-0000-0000-000000000001', true, 'Peinture')$$,
  '%non autorisée%',
  'une organisation sans accès Réserves ne se publie pas à l''annuaire');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select lives_ok(
  $$select public.reserves_annuaire_publier(
      'd0000000-0000-0000-0000-000000000001', true, 'Plâtrerie', 'Haut-Rhin')$$,
  'une organisation cliente publie sa propre fiche');
select throws_like(
  $$select public.reserves_annuaire_publier('a0000000-0000-0000-0000-000000000001', true)$$,
  '%non autorisée%',
  'et ne peut pas publier la fiche d''une autre organisation');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','Plât'))::integer,
  1, 'une organisation publiée devient trouvable par son nom');
select ok(
  (select deja_utilisatrice from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','Plât')),
  'et l''annuaire signale qu''elle utilise déjà Réserves');
select is(
  (select count(*) from public.reserves_annuaire_rechercher(
     'a0000000-0000-0000-0000-000000000001','TEST_A'))::integer,
  0, 'l''organisation qui cherche ne se trouve jamais elle-même');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.email', 'comptable-a@invalid.local', true);
select throws_like(
  $$select * from public.reserves_annuaire_rechercher('a0000000-0000-0000-0000-000000000001','Plât')$$,
  '%non autorisée%',
  'un rôle de consultation n''interroge pas l''annuaire : chercher, c''est préparer une invitation');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.reserves_annuaire_publication)::integer,
  0, 'la table de publication n''est jamais lisible transversalement : l''opt-in serait sinon vain');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. INVITATION PAR LIEN SÉCURISÉ
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, raison_sociale, siret, contact_nom
) values
  ('e2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001','Peinture C','PEINTURE C SARL','11111111100011','Claire P.'),
  ('e2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001','Plâtrerie D','PLATRERIE D SAS','22222222200022','David M.'),
  ('e2000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001',
   'e0000000-0000-0000-0000-000000000001','Carrelage Z','CARRELAGE Z','44444444400044','Zoé T.');

select is(
  (select onboarding_statut from public.reserves_intervenants
   where id = 'e2000000-0000-0000-0000-000000000003'),
  'inconnu', 'une entreprise extérieure existe sans qu''aucun tenant ne lui soit créé');

select throws_like(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-000000000001','pas-un-hash','peintre-c@invalid.local')$$,
  '%Jeton d''invitation invalide%',
  'un jeton qui n''est pas une empreinte SHA-256 est refusé');

select set_config('elsatia.inv_c', (select public.reserves_inviter_intervenant(
  'e2000000-0000-0000-0000-000000000001',
  encode(extensions.digest('jeton-c-1', 'sha256'), 'hex'),
  'peintre-c@invalid.local', 'Claire P.', 'c0000000-0000-0000-0000-000000000001')::text), true);

select ok(current_setting('elsatia.inv_c') <> '', 'l''hôte émet un lien d''invitation nominatif');
select is(
  (select count(*) from public.reserves_invitations
   where token_hash = encode(extensions.digest('jeton-c-1','sha256'),'hex'))::integer,
  1, 'seule l''empreinte du jeton est persistée');
select is(
  (select count(*) from public.reserves_invitations
   where token_hash = 'jeton-c-1')::integer,
  0, 'le jeton en clair n''existe nulle part en base');
select is(
  (select onboarding_statut from public.reserves_intervenants
   where id = 'e2000000-0000-0000-0000-000000000001'),
  'rattachee', 'l''intervention passe au suivi d''onboarding « rattachée » quand la cible est désignée');

-- Ré-émission : le lien précédent tombe.
select set_config('elsatia.inv_c2', (select public.reserves_inviter_intervenant(
  'e2000000-0000-0000-0000-000000000001',
  encode(extensions.digest('jeton-c-2', 'sha256'), 'hex'),
  'peintre-c@invalid.local')::text), true);
select is(
  (select count(*) from public.reserves_invitations
   where intervenant_id = 'e2000000-0000-0000-0000-000000000001'
     and consomme_at is null and revoque_at is null)::integer,
  1, 'une seule invitation reste vivante par intervention');
select ok(
  (select revoque_at is not null from public.reserves_invitations
   where id = current_setting('elsatia.inv_c')::uuid),
  'réémettre un lien révoque explicitement le précédent');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-000000000002',
      encode(extensions.digest('jeton-pirate','sha256'),'hex'), 'pirate@invalid.local')$$,
  '%non autorisée%',
  'une autre organisation ne peut pas inviter sur le chantier d''un tiers');
select is(
  (select count(*) from public.reserves_invitations)::integer,
  0, 'et ne voit aucune invitation du chantier hôte');

-- Consultation du lien : ce que voit celui qui le reçoit.
select set_config('request.jwt.claim.sub', '', true);
select is(
  (select organisation_hote from public.reserves_invitation_consulter(
     encode(extensions.digest('jeton-c-2','sha256'),'hex'))),
  'Entreprise Isolation A', 'le lien révèle l''organisation qui invite');
select is(
  (select chantier from public.reserves_invitation_consulter(
     encode(extensions.digest('jeton-c-2','sha256'),'hex'))),
  'TEST_A_Résidence', 'et le chantier concerné');
select is(
  (select count(*) from public.reserves_invitation_consulter('0000'))::integer,
  0, 'un jeton inconnu ne renvoie rien, sans distinguer les cas');
select is(
  (select count(*) from public.reserves_invitation_consulter(
     encode(extensions.digest('jeton-c-1','sha256'),'hex')))::integer,
  0, 'un lien révoqué est muet');
select ok(
  has_function_privilege('anon', 'public.reserves_invitation_consulter(text)', 'execute'),
  'la consultation est ouverte à un visiteur sans compte : c''est le sens même du lien');
select ok(
  not has_function_privilege('anon', 'public.reserves_invitation_accepter(text,uuid)', 'execute'),
  'mais accepter exige une session authentifiée');

-- Expiration.
reset role;
insert into public.reserves_invitations (
  entreprise_id, chantier_id, intervenant_id, token_hash, email, expire_at, created_by
) values (
  'a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000003',
  encode(extensions.digest('jeton-perime','sha256'),'hex'),
  'zoe@invalid.local', now() - interval '1 day', '10000000-0000-0000-0000-000000000001'
);
set local role authenticated;
select is(
  (select count(*) from public.reserves_invitation_consulter(
     encode(extensions.digest('jeton-perime','sha256'),'hex')))::integer,
  0, 'un lien expiré est mort, même s''il n''a jamais servi');

-- Acceptation par la bonne organisation.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select throws_like(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-perime','sha256'),'hex'),
      'c0000000-0000-0000-0000-000000000001')$$,
  '%n''est plus valide%', 'un lien expiré ne rattache personne');

select lives_ok(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-c-2','sha256'),'hex'),
      'c0000000-0000-0000-0000-000000000001')$$,
  'l''entreprise invitée rejoint le chantier par son lien, sans jamais saisir d''identifiant d''organisation');

select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-000000000001'),
  'active', 'l''intervention devient active');
select ok(
  (select autorise from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'l''organisation invitée reçoit l''accès applicatif gratuit');
select is(
  (select source from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'reserves_invitation_gratuite', 'et cet accès porte sa source, qui le rend révocable sans ambiguïté');
select is(
  (select role_code from public.habilitations_applications_utilisateurs
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
     and utilisateur_id = 'c0000000-0000-0000-0000-0000000000a1'
     and application_code = 'reserves'),
  'reserves_intervenant', 'la personne obtient le rôle limité, jamais davantage');

select throws_like(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-c-2','sha256'),'hex'),
      'c0000000-0000-0000-0000-000000000001')$$,
  '%n''est plus valide%', 'le lien est à usage unique : il ne se rejoue pas');

-- Nominativité : un lien émis pour une organisation ne rattache pas une autre.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-000000000002',
      encode(extensions.digest('jeton-d-1','sha256'),'hex'),
      'platrier-d@invalid.local', 'David M.', 'd0000000-0000-0000-0000-000000000001')$$,
  'l''hôte invite le second corps d''état, désigné depuis l''annuaire');

select set_config('request.jwt.claim.sub', 'e0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'menuisier-e@invalid.local', true);
select throws_like(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-d-1','sha256'),'hex'),
      'e0000000-0000-0000-0000-000000000001')$$,
  '%émis pour une autre organisation%',
  'un lien nominatif intercepté ne rattache pas l''organisation du lecteur');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select throws_like(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-d-1','sha256'),'hex'),
      'a0000000-0000-0000-0000-000000000001')$$,
  '%pas membre actif%',
  'et personne ne rattache une organisation dont il n''est pas membre');
select lives_ok(
  $$select public.reserves_invitation_accepter(
      encode(extensions.digest('jeton-d-1','sha256'),'hex'),
      'd0000000-0000-0000-0000-000000000001')$$,
  'la bonne organisation, elle, rejoint');
select is(
  (select source from public.acces_applications_entreprises
   where entreprise_id = 'd0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'test', 'un client qui payait déjà Réserves conserve son propre accès, non réécrit par l''invitation');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. PLANS PDF : LA PAGE EST UNE COORDONNÉE
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_plans (id, entreprise_id, chantier_id, nom, mime_type, nb_pages)
values ('e3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'e0000000-0000-0000-0000-000000000001','Plan PDF R+1','application/pdf', 4);

select set_config('elsatia.r_p2', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Fissure plafond', null, 'haute',
  'e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',
  0.25, 0.40, false, current_date + 3, null, 2)::text), true);

select is(
  (select plan_page from public.reserves where id = current_setting('elsatia.r_p2')::uuid),
  2, 'une réserve pointée sur un PDF mémorise sa page');
select is(
  (select position_x from public.reserves where id = current_setting('elsatia.r_p2')::uuid),
  0.25000::numeric, 'x reste une fraction de page dans [0,1]');

select set_config('elsatia.r_p1', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Seuil non conforme', null, 'normale',
  'e2000000-0000-0000-0000-000000000002','e3000000-0000-0000-0000-000000000001',
  0.90, 0.10)::text), true);
select is(
  (select plan_page from public.reserves where id = current_setting('elsatia.r_p1')::uuid),
  1, 'une réserve pointée sans page explicite est sur la première');

select set_config('elsatia.r_sans_plan', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Sans repérage', null, 'basse',
  'e2000000-0000-0000-0000-000000000002')::text), true);
-- Une réserve constatée mais pas encore attribuée : elle rend les filtres d'export
-- discriminants au lieu de porter sur un ensemble homogène.
select set_config('elsatia.r_emise', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Constat sans attribution', null, 'normale')::text), true);
select is(
  (select plan_page from public.reserves where id = current_setting('elsatia.r_sans_plan')::uuid),
  null, 'une réserve non pointée ne porte aucune page');

select throws_like(
  $$select public.reserves_creer(
      'e0000000-0000-0000-0000-000000000001','Hors document', null, 'normale',
      'e2000000-0000-0000-0000-000000000001','e3000000-0000-0000-0000-000000000001',
      0.5, 0.5, false, null, null, 9)$$,
  '%page n''existe pas%',
  'on ne pointe pas une page que le document ne contient pas');

select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 2))::integer,
  1, 'les pastilles sont rendues page par page');
select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 1))::integer,
  1, 'et la page 1 ne montre pas les repères de la page 2');
select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 3))::integer,
  0, 'une page sans repère en rend zéro, pas ceux d''ailleurs');

-- Zoom et déplacement : la coordonnée est une fraction de page, donc rien ne la touche.
select set_config('elsatia.x_avant',
  (select position_x::text from public.reserves where id = current_setting('elsatia.r_p2')::uuid), true);
select lives_ok(
  $$select public.reserves_enregistrer_pagination('e3000000-0000-0000-0000-000000000001', 4)$$,
  'le client enregistre la pagination réelle constatée au rendu');
select is(
  (select position_x::text from public.reserves where id = current_setting('elsatia.r_p2')::uuid),
  current_setting('elsatia.x_avant'),
  'aucun rendu, aucun zoom, aucune pagination ne modifie une coordonnée enregistrée');

select lives_ok(
  $$select public.reserves_repositionner(
      current_setting('elsatia.r_p2')::uuid, 'e3000000-0000-0000-0000-000000000001', 3, 0.6, 0.7)$$,
  'une réserve se repositionne sur une autre page');
select is(
  (select plan_page from public.reserves where id = current_setting('elsatia.r_p2')::uuid),
  3, 'et la nouvelle page est enregistrée');
select throws_like(
  $$select public.reserves_repositionner(
      current_setting('elsatia.r_p2')::uuid, 'e3000000-0000-0000-0000-000000000001', 2, 1.4, 0.2)$$,
  '%Position invalide%', 'une coordonnée hors [0,1] est refusée');
select is(
  (select count(*) from public.reserves_historique
   where reserve_id = current_setting('elsatia.r_p2')::uuid and champ = 'position')::integer,
  1, 'un repositionnement est tracé à l''historique');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.reserves_reperes_plan('e3000000-0000-0000-0000-000000000001', 2))::integer,
  0, 'une autre organisation ne lit aucune pastille du plan d''un tiers');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. NOTIFICATIONS RÉELLES
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*) from public.reserves_notifications_types)::integer,
  14, 'quatorze types de notification sont déclarés au référentiel');
select is(
  (select count(*) from public.reserves_evenements_notifications ev
   left join public.reserves_notifications_types t on t.type = ev.type
   where t.type is null)::integer,
  0, 'aucun événement ne porte un type absent du référentiel');
select ok(
  (select critique from public.reserves_notifications_types where type = 'reserve_assignee'),
  'une attribution est critique : elle reste toujours visible in-app');

-- L'acceptation de responsabilité, muette jusqu'ici, produit désormais un événement.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.r_p2')::uuid, true)$$,
  'l''entreprise intervenante accepte la responsabilité');
reset role;
select is(
  (select count(*) from public.reserves_evenements_notifications
   where reserve_id = current_setting('elsatia.r_p2')::uuid
     and type = 'responsabilite_acceptee'
     and destinataire_entreprise_id = 'a0000000-0000-0000-0000-000000000001')::integer,
  1, 'et l''organisation hôte en est informée — le manque le plus visible de la V1');
set local role authenticated;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$select public.reserves_transferer_responsabilite(
      current_setting('elsatia.r_p2')::uuid, 'e2000000-0000-0000-0000-000000000002',
      'Entreprise défaillante')$$,
  'une réserve déjà acceptée peut être transférée, avec motif obligatoire');
reset role;
select is(
  (select count(*) from public.reserves_evenements_notifications
   where reserve_id = current_setting('elsatia.r_p2')::uuid
     and type = 'reserve_transferee'
     and destinataire_entreprise_id = 'c0000000-0000-0000-0000-000000000001')::integer,
  1, 'l''entreprise dessaisie est prévenue : sinon elle continue de travailler pour rien');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.reserves_transferer_responsabilite(
      current_setting('elsatia.r_p1')::uuid, 'e2000000-0000-0000-0000-000000000001', '')$$,
  '%motif est obligatoire%', 'un transfert sans motif est refusé');
select is(
  (select count(*) from public.reserves_historique
   where reserve_id = current_setting('elsatia.r_p2')::uuid
     and action = 'reassignation'
     and valeur_avant = 'e2000000-0000-0000-0000-000000000001')::integer,
  1, 'l''historique conserve nommément l''entreprise précédente');

-- Distribution et idempotence.
reset role;
select set_config('elsatia.prepares1',
  (select public.reserves_notifications_preparer(500)::text), true);
select ok(current_setting('elsatia.prepares1')::integer > 0,
  'le distributeur vide la file d''événements');
select is(
  (select count(*) from public.reserves_evenements_notifications where distribue_at is null)::integer,
  0, 'plus aucun événement ne reste en attente, même ceux sans destinataire');
select set_config('elsatia.envois1',
  (select count(*)::text from public.reserves_notifications_envois), true);
select ok(current_setting('elsatia.envois1')::integer > 0,
  'des envois e-mail sont préparés, avec leur clé d''idempotence');
select is(
  (select public.reserves_notifications_preparer(500))::integer,
  0, 'un second passage ne repasse pas sur les mêmes événements');
select is(
  (select count(*)::text from public.reserves_notifications_envois),
  current_setting('elsatia.envois1'),
  'et ne produit aucun envoi supplémentaire : une action métier, un seul e-mail');
select is(
  (select count(*) from (
     select evenement_id, canal, destinataire_utilisateur_id
     from public.reserves_notifications_envois
     group by 1,2,3 having count(*) > 1) doublons)::integer,
  0, 'aucun couple (événement, canal, destinataire) n''est dupliqué');
select is(
  (select count(*) from public.reserves_notifications_a_expedier(500)
   where email is null or email = '')::integer,
  0, 'la file d''expédition ne contient jamais un destinataire sans adresse');

-- Préférences : couper l'e-mail n'aveugle pas l'application.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select is(
  (select count(*) from public.reserves_preferences_lire('d0000000-0000-0000-0000-000000000001'))::integer,
  6, 'six catégories de notification sont réglables');
select ok(
  (select email from public.reserves_preferences_lire('d0000000-0000-0000-0000-000000000001')
   where categorie = 'message'),
  'et l''e-mail est actif par défaut');
select lives_ok(
  $$select public.reserves_preferences_definir(
      'd0000000-0000-0000-0000-000000000001', 'message', false)$$,
  'une personne coupe l''e-mail d''une catégorie');
select ok(
  not (select email from public.reserves_preferences_lire('d0000000-0000-0000-0000-000000000001')
       where categorie = 'message'),
  'le réglage est pris en compte');
select throws_like(
  $$select public.reserves_preferences_definir(
      'a0000000-0000-0000-0000-000000000001', 'message', false)$$,
  '%pas membre actif%',
  'personne ne règle les notifications d''une organisation dont il n''est pas membre');
select throws_like(
  $$select public.reserves_preferences_definir(
      'd0000000-0000-0000-0000-000000000001', 'inventee', false)$$,
  '%inconnue%', 'une catégorie inventée est refusée');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select ok(
  (select count(*) from public.reserves_notifications_in_app(50)) > 0,
  'l''organisation hôte voit ses notifications in-app');
select is(
  (select count(*) from public.reserves_notifications_in_app(50) where lu)::integer,
  0, 'aucune n''est lue tant qu''on ne l''a pas marquée');
select ok(
  public.reserves_notifications_compteur() > 0,
  'le compteur de non-lues est renseigné');
select ok(
  public.reserves_notifications_marquer_lues() > 0,
  'la personne marque ses notifications comme lues');
select is(
  public.reserves_notifications_compteur(), 0,
  'le compteur retombe à zéro');
select is(
  (select count(*) from public.reserves_notifications_in_app(50) where not lu)::integer,
  0, 'et plus rien n''apparaît comme non lu');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);
select ok(
  public.reserves_notifications_compteur() > 0,
  'la lecture est propre à chaque personne : un collègue a toujours ses non-lues');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.reserves_notifications_in_app(200))::integer,
  0, 'une organisation tierce ne voit aucune notification du chantier');
select ok(
  not has_function_privilege('authenticated', 'public.reserves_notifications_a_expedier(integer)', 'execute'),
  'la file d''expédition, qui traverse les organisations, est fermée aux comptes utilisateurs');
select ok(
  not has_function_privilege('authenticated', 'public.reserves_notification_destinataires(uuid)', 'execute'),
  'la résolution des destinataires aussi : elle rendrait les adresses du parc');
select ok(
  has_function_privilege('service_role', 'public.reserves_notifications_preparer(integer)', 'execute'),
  'seul le rôle de service distribue');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. ÉCHÉANCES
-- ═══════════════════════════════════════════════════════════════════════════
reset role;
select is(
  (select public.reserves_produire_echeances(array[3]))::integer,
  1, 'le producteur émet une alerte pour la réserve à J-3');
select is(
  (select public.reserves_produire_echeances(array[3]))::integer,
  0, 'et ne la réémet jamais : la clé d''événement porte la réserve et le palier');
select is(
  (select count(*) from public.reserves_evenements_notifications
   where type = 'echeance_proche')::integer,
  1, 'une seule alerte existe pour ce palier');
select is(
  (select payload->>'jours_restants' from public.reserves_evenements_notifications
   where type = 'echeance_proche'),
  '3', 'le palier atteint est transporté dans la charge utile');
select is(
  (select public.reserves_produire_echeances(array[7,1]))::integer,
  0, 'aucun palier non atteint ne déclenche quoi que ce soit');
select is(
  (select destinataire_entreprise_id from public.reserves_evenements_notifications
   where type = 'echeance_proche'),
  'd0000000-0000-0000-0000-000000000001'::uuid,
  'l''alerte part à l''entreprise porteuse, celle qui doit agir');
select ok(
  not has_function_privilege('authenticated', 'public.reserves_produire_echeances(integer[])', 'execute'),
  'le producteur d''échéances n''est pas déclenchable par un compte utilisateur');

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. MESSAGERIE
-- ═══════════════════════════════════════════════════════════════════════════
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('elsatia.conv',
  (select public.reserves_commenter(current_setting('elsatia.r_p1')::uuid,
    'Merci de reprendre le seuil avant vendredi.')::text), true);
select ok(current_setting('elsatia.conv') <> '', 'un commentaire ouvre la conversation de la réserve');
select is(
  public.reserves_messages_non_lus(), 0,
  'l''auteur n''a pas de non-lu sur son propre message');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select is(
  public.reserves_messages_non_lus(), 1,
  'l''entreprise destinataire compte un message non lu');
select is(
  (select non_lus from public.reserves_conversations_visibles()
   where id = current_setting('elsatia.conv')::uuid),
  1, 'le non-lu est visible conversation par conversation');
select is(
  (select reserve_numero from public.reserves_conversations_visibles()
   where id = current_setting('elsatia.conv')::uuid) is not null,
  true, 'chaque conversation porte le lien direct vers sa réserve');
select lives_ok(
  $$select public.reserves_conversation_marquer_lue(current_setting('elsatia.conv')::uuid)$$,
  'elle marque la conversation comme lue');
select is(
  public.reserves_messages_non_lus(), 0, 'et son compteur retombe à zéro');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.reserves_conversations_visibles())::integer,
  0, 'une organisation tierce ne voit aucune conversation');
select throws_like(
  $$select public.reserves_conversation_marquer_lue(current_setting('elsatia.conv')::uuid)$$,
  '%non accessible%', 'et ne peut pas marquer lue une conversation qu''elle ne voit pas');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. RÉVOCATION ET CONSÉQUENCES
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select set_config('elsatia.hist_avant',
  (select count(*)::text from public.reserves_historique), true);

select is(
  (select reserves_ouvertes from public.reserves_revoquer_intervenant(
     'e2000000-0000-0000-0000-000000000001', 'Défaillance répétée')),
  0, 'la révocation annonce combien de réserves restaient ouvertes chez l''entreprise');
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-000000000001'),
  'revoquee', 'l''intervention passe à « révoquée »');
reset role;
select is(
  (select count(*) from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
     and application_code = 'reserves')::integer,
  0, 'l''accès gratuit né de l''invitation est retiré');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*)::text from public.reserves_historique),
  current_setting('elsatia.hist_avant'),
  'aucune ligne d''historique n''est perdue : la révocation n''efface rien');

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select ok(
  not public.reserves_intervenant_courant('e2000000-0000-0000-0000-000000000001'),
  'l''entreprise révoquée n''est plus un acteur reconnu');
select is(
  (select count(*) from public.reserves)::integer,
  0, 'elle ne voit plus aucune réserve du chantier');
select is(
  (select count(*) from public.reserves_chantiers)::integer,
  0, 'ni le chantier lui-même');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*) from public.reserves_historique h
   join public.reserves r on r.id = h.reserve_id
   where h.valeur_avant = 'e2000000-0000-0000-0000-000000000001')::integer,
  1, 'côté hôte, le passage de l''entreprise révoquée reste nommément au dossier');
select throws_like(
  $$select public.reserves_transferer_responsabilite(
      current_setting('elsatia.r_p1')::uuid, 'e2000000-0000-0000-0000-000000000001', 'Retour arrière')$$,
  '%entreprise révoquée%', 'on ne transfère pas une réserve vers une entreprise révoquée');
select throws_like(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-000000000001',
      encode(extensions.digest('jeton-c-3','sha256'),'hex'), 'peintre-c@invalid.local')$$,
  '%révoquée%', 'et on ne la réinvite pas sans l''avoir d''abord réactivée');
select lives_ok(
  $$select public.reserves_reactiver_intervenant('e2000000-0000-0000-0000-000000000001')$$,
  'une révocation par erreur se répare');
select is(
  (select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-000000000001'),
  'active', 'l''intervention redevient active');
reset role;
select is(
  (select count(*) from public.acces_applications_entreprises
   where entreprise_id = 'c0000000-0000-0000-0000-000000000001'
     and application_code = 'reserves')::integer,
  1, 'et l''accès gratuit est rétabli');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select * from public.reserves_revoquer_intervenant('e2000000-0000-0000-0000-000000000002')$$,
  '%non autorisée%', 'une organisation tierce ne révoque pas l''intervenant d''un autre chantier');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. EXPORTS
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select is(
  (select chantier from public.reserves_export_entete('e0000000-0000-0000-0000-000000000001')),
  'TEST_A_Résidence', 'l''entête d''export porte le chantier');
select is(
  (select organisation from public.reserves_export_entete('e0000000-0000-0000-0000-000000000001')),
  'Entreprise Isolation A', 'et l''organisation émettrice');
select is(
  (select count(*) from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001'))::integer,
  4, 'l''export chantier rend toutes les réserves visibles');
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000002'))::integer,
  3, 'l''export par entreprise ne rend que les réserves de cette entreprise');
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001','e2000000-0000-0000-0000-000000000001'))::integer,
  0, 'et l''entreprise dessaisie par le transfert n''y figure plus');
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001', null, 'emise'))::integer,
  1, 'le filtre par statut est appliqué en base, pas à l''affichage');
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001', null, null, 'haute'))::integer,
  1, 'le filtre par priorité aussi');
select is(
  (select count(*) from public.reserves_export_chantier(
     'e0000000-0000-0000-0000-000000000001', null, null, null, current_date + 5))::integer,
  1, 'et le filtre par échéance');
select is(
  (select plan_page from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001')
   where numero = (select numero from public.reserves where id = current_setting('elsatia.r_p2')::uuid)),
  3, 'la page du plan figure dans l''export : le repère est retrouvable sur le document');
select ok(
  (select count(*) from public.reserves_export_historique('e0000000-0000-0000-0000-000000000001')) > 0,
  'l''export « avec historique » dispose du détail complet');
select is(
  (select count(*) from public.reserves_export_intervenants('e0000000-0000-0000-0000-000000000001'))::integer,
  3, 'le sélecteur d''export liste les entreprises du chantier');
select is(
  (select count(*) from public.reserves_export_photos('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'aucune photo fantôme n''entre dans un export');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is(
  (select count(*) from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'une organisation tierce n''exporte rien du chantier d''un autre');
select is(
  (select count(*) from public.reserves_export_entete('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'pas même son entête');
select is(
  (select count(*) from public.reserves_export_historique('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'ni la moindre ligne de son historique');

select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select is(
  (select count(*) from public.reserves_export_chantier('e0000000-0000-0000-0000-000000000001'))::integer,
  3, 'une entreprise intervenante n''exporte que ce qu''elle porte');
select is(
  (select count(*) from public.reserves_export_intervenants('e0000000-0000-0000-0000-000000000001'))::integer,
  0, 'et n''obtient pas la liste des autres corps d''état du chantier');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. TABLEAU DE BORD
-- ═══════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select lives_ok(
  $$select public.reserves_inviter_intervenant(
      'e2000000-0000-0000-0000-000000000003',
      encode(extensions.digest('jeton-z-1','sha256'),'hex'), 'zoe@invalid.local', 'Zoé T.')$$,
  'l''hôte relance l''entreprise extérieure dont le lien avait expiré');
select ok(
  (select a_traiter from public.reserves_tableau_de_bord(
     'a0000000-0000-0000-0000-000000000001')) > 0,
  'le tableau de bord dit ce qu''il reste à traiter');
select is(
  (select echeance_proche from public.reserves_tableau_de_bord(
     'a0000000-0000-0000-0000-000000000001')),
  1::bigint, 'et compte les échéances des sept prochains jours');
select is(
  (select invitations_a_suivre from public.reserves_tableau_de_bord(
     'a0000000-0000-0000-0000-000000000001')),
  1::bigint, 'les invitations encore en attente y figurent');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. PROPRIÉTAIRE GLOBAL
-- ═══════════════════════════════════════════════════════════════════════════
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

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000f', true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select lives_ok($$select public.plateforme_proprietaire_revendiquer()$$,
  'le propriétaire global revendique son identité');
select is(
  (select count(*) from public.reserves_invitations)::integer,
  0, 'il ne lit aucune invitation d''un client : le jeton reste hors de sa portée');
select is(
  (select count(*) from public.reserves_annuaire_publication)::integer,
  0, 'ni la fiche d''annuaire d''une organisation');
select throws_like(
  $$select * from public.reserves_annuaire_rechercher('a0000000-0000-0000-0000-000000000001','Plât')$$,
  '%non autorisée%', 'et il n''interroge pas l''annuaire au nom d''un client');

reset role;
select * from finish();
rollback;
