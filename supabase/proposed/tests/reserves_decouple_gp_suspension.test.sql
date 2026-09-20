-- pgTAP — D3 : les 11 objets Réserves qui appelaient encore `est_membre_actif` ne dépendent plus de l'abonnement Gestion Pro.
-- PROPOSITION NON NUMÉROTÉE, NON RÉSERVÉE.
-- PRÉREQUIS : la base d'essai a reçu, dans cet ordre,
--   1. supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
--   2. packages/application-access/sql/decision_acces_application.sql.proposed
--   3. supabase/proposed/reserves_decouple_gp_suspension_v1.sql.proposed
-- Rejeu (base jetable uniquement) : copier supabase/tests/ + ce fichier dans le conteneur, puis
--   psql -q -X -tA -f reserves_decouple_gp_suspension.test.sql
--
-- MÉTHODE. Une « sonde » interroge les 11 objets pour UNE personne et UNE organisation, puis rend une ligne de texte
-- (valeurs lues + résultat des gestes d'écriture). La même sonde est rejouée dans plusieurs « mondes » sur un décor
-- reconstruit à l'identique avant chaque passage. Prouver « GP suspendu = GP actif » = comparer deux lignes.
-- Les cas négatifs comparent la ligne à une valeur attendue écrite en dur (refus / vide), jamais à elle-même.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

\ir fixtures/isolation_multitenant.inc

-- ── Assistants (session courante uniquement) ─────────────────────────────────────────────────
-- SECURITY DEFINER : lit auth.users (adresse du jeton) même quand la session est déjà `authenticated`.
create function pg_temp.moi(p_uid uuid) returns void language plpgsql security definer as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claim.email', coalesce((select email from auth.users where id = p_uid), ''), true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal1',
      'email', (select email from auth.users where id = p_uid))::text end, true);
end $$;

-- Exécute un geste d'écriture et rend 'ok:<n>' (n = valeur rendue) ou le début du message d'erreur.
create function pg_temp.essayer(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return 'ok:' || coalesce(v, '');
exception when others then
  return 'refus:' || left(sqlerrm, 40);
end $$;

-- La sonde. p_uid = la personne, p_ent = l'organisation dont elle veut lire/régler les notifications.
-- Lectures d'abord (avant tout effet), écritures ensuite. Doit être appelée sous `set local role authenticated`.
create function pg_temp.sonder(p_uid uuid, p_ent uuid) returns text language plpgsql as $$
declare v text;
begin
  perform pg_temp.moi(p_uid);
  v := 'compteur=' || public.reserves_notifications_compteur()
    || ';in_app=' || (select count(*) from public.reserves_notifications_in_app(50))
    || ';prefs=' || (select count(*) from public.reserves_preferences_lire(p_ent))
    || ';notif_rls=' || (select count(*) from public.reserves_evenements_notifications)
    || ';annuaire_rls=' || (select count(*) from public.reserves_annuaire_publication)
    || ';interv_rls=' || (select count(*) from public.reserves_intervenants)
    || ';courant=' || public.reserves_intervenant_courant('e2000000-0000-0000-0000-0000000000d1')
    || ';en_attente=' || (select count(*) from public.reserves_invitations_en_attente());
  v := v
    || ';definir=' || pg_temp.essayer(format('select null::text from public.reserves_preferences_definir(%L, ''message'', false)', p_ent))
    || ';lues=' || pg_temp.essayer('select public.reserves_notifications_marquer_lues()::text')
    || ';rejoindre=' || pg_temp.essayer('select null::text from public.reserves_rejoindre_intervention(''e2000000-0000-0000-0000-0000000000d2'')')
    || ';accepter=' || pg_temp.essayer(format('select public.reserves_invitation_accepter(%L, %L)::text',
         encode(extensions.digest('jeton-d3-residu', 'sha256'), 'hex'), p_ent));
  return v;
end $$;

-- Prérequis présents, puis contrôle STRUCTUREL : plus aucun des 11 objets ne référence est_membre_actif.
select has_function('public', 'est_membre_organisation', array['uuid'], 'prérequis : est_membre_organisation présente');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('reserves_notifications_compteur','reserves_notifications_in_app',
    'reserves_notifications_marquer_lues','reserves_intervenant_courant','reserves_preferences_lire',
    'reserves_preferences_definir','reserves_invitation_accepter','reserves_invitations_en_attente',
    'reserves_rejoindre_intervention')), 9, 'les 9 fonctions du résidu existent, une seule signature chacune');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'reserves\_%' and p.prosrc ~ 'est_membre_actif'), 0,
  'AUCUNE fonction reserves_* ne référence plus est_membre_actif (les 9 découplées)');
select is((select count(*)::int from pg_policies where tablename like 'reserves\_%' and qual ~ 'est_membre_actif'), 0,
  'AUCUNE policy reserves_* ne référence plus est_membre_actif (les 2 découplées)');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('reserves_notifications_compteur','reserves_notifications_in_app',
    'reserves_notifications_marquer_lues','reserves_intervenant_courant','reserves_preferences_lire',
    'reserves_preferences_definir') and p.prosrc ~ 'a_acces_application\(.*''reserves''\)'), 6,
  'les 6 fonctions de lecture/réglage portent la garde applicative Réserves');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('reserves_notifications_compteur','reserves_notifications_in_app',
    'reserves_notifications_marquer_lues','reserves_intervenant_courant','reserves_preferences_lire',
    'reserves_preferences_definir','reserves_invitation_accepter','reserves_invitations_en_attente',
    'reserves_rejoindre_intervention')
    and p.prosecdef and p.proconfig = array['search_path=public']
    and p.proacl::text = '{postgres=X/postgres,authenticated=X/postgres}'), 9,
  'les 9 fonctions restent SECURITY DEFINER, search_path=public et ACL {postgres, authenticated} — anon et PUBLIC sans EXECUTE');
select is((select array_agg(policyname || ':' || cmd || ':' || roles::text order by policyname) from pg_policies
  where policyname in ('reserves_annuaire_select','reserves_notifications_select')),
  array['reserves_annuaire_select:SELECT:{authenticated}','reserves_notifications_select:SELECT:{authenticated}'],
  'les 2 policies gardent leur commande (SELECT) et leur rôle (authenticated)');

-- ── Décor commun ─────────────────────────────────────────────────────────────────────────────
-- Organisation A (client Réserves) : ouvrier-a habilité Réserves ; chef-equipe-a membre SANS habilitation ;
-- comptable-a désactivé mais habilité (sonde de l'exclusion) ; admin-b membre de B seulement.
-- B est l'hôte : ses chantiers invitent A comme intervenante.
update public.utilisateurs_entreprises set statut = 'desactive' where utilisateur_id = '10000000-0000-0000-0000-000000000005';
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise)
values ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_consultation',true),
       ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','reserves','reserves_consultation',true);
insert into public.reserves_chantiers(id, entreprise_id, nom, created_by)
values ('e0000000-0000-0000-0000-0000000000d9','b0000000-0000-0000-0000-000000000001','Chantier hôte B1','20000000-0000-0000-0000-000000000001'),
       ('e0000000-0000-0000-0000-0000000000da','b0000000-0000-0000-0000-000000000001','Chantier hôte B2','20000000-0000-0000-0000-000000000001'),
       ('e0000000-0000-0000-0000-0000000000db','b0000000-0000-0000-0000-000000000001','Chantier hôte B3','20000000-0000-0000-0000-000000000001');

-- Reconstruit l'état complet du monde demandé (exécuté en tant que postgres, avant chaque sonde).
--   p_gp       : 'actif' | 'suspendu'  (abonnement Gestion Pro de A)
--   p_reserves : 'actif' | 'desactive' (droit d'usage autorise=false) | 'suspendu' (statut_commercial)
--   p_plateforme : null | 'compte' (suspension globale de ouvrier-a) | 'organisation' (suspension globale de A)
create function pg_temp.decor(p_gp text, p_reserves text, p_plateforme text default null) returns void language plpgsql as $$
begin
  -- Le décor s'écrit hors de toute identité : les triggers de facturation regardent auth.uid().
  perform pg_temp.moi(null);
  delete from public.suspensions_plateforme;
  delete from public.reserves_notifications_lectures;
  delete from public.reserves_preferences_notifications;
  delete from public.reserves_evenements_notifications;
  delete from public.reserves_annuaire_publication;
  delete from public.reserves_intervenants;      -- emporte les invitations (FK cascade)
  delete from public.acces_applications_entreprises where application_code = 'reserves';
  -- Les gestes rejoindre/accepter créent des habilitations « reserves_intervenant » : à purger entre deux mondes.
  delete from public.habilitations_applications_utilisateurs where application_code = 'reserves' and role_code = 'reserves_intervenant';

  update public.entreprises set abonnement_statut = case p_gp when 'suspendu' then 'suspendu' else 'actif' end
   where id in ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001');
  insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source, statut_commercial, suspendu_depuis)
  values ('a0000000-0000-0000-0000-000000000001','reserves', p_reserves <> 'desactive', 'test',
          case p_reserves when 'suspendu' then 'suspendu' else 'actif' end,
          case p_reserves when 'suspendu' then now() else null end);
  if p_plateforme = 'compte' then
    insert into public.suspensions_plateforme(portee, utilisateur_id, motif)
    values ('compte','10000000-0000-0000-0000-000000000002','décor de test D3');
  elsif p_plateforme = 'organisation' then
    insert into public.suspensions_plateforme(portee, entreprise_id, motif)
    values ('organisation','a0000000-0000-0000-0000-000000000001','décor de test D3');
  end if;

  -- Deux événements destinés à A (dont un sur A comme organisation destinataire) et un destiné à B.
  insert into public.reserves_evenements_notifications(entreprise_id, type, destinataire_entreprise_id)
  values ('b0000000-0000-0000-0000-000000000001','reserve_assignee','a0000000-0000-0000-0000-000000000001'),
         ('b0000000-0000-0000-0000-000000000001','responsabilite_acceptee','a0000000-0000-0000-0000-000000000001'),
         ('a0000000-0000-0000-0000-000000000001','reserve_assignee','b0000000-0000-0000-0000-000000000001');
  -- Fiche d'annuaire de A et de B.
  insert into public.reserves_annuaire_publication(entreprise_id, publiee, publiee_at, corps_etat)
  values ('a0000000-0000-0000-0000-000000000001', true, now(), 'Peinture'), ('b0000000-0000-0000-0000-000000000001', true, now(), 'Gros oeuvre');
  -- Intervenants de l'hôte B : d1 = A déjà active ; d2 = A invitée (à rejoindre) ; d3 = lien encore sans organisation.
  insert into public.reserves_intervenants(id, entreprise_id, chantier_id, nom, entreprise_intervenante_id, statut, rejoint_at, created_by)
  values ('e2000000-0000-0000-0000-0000000000d1','b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000d9',
          'D3 active','a0000000-0000-0000-0000-000000000001','active', now(),'20000000-0000-0000-0000-000000000001'),
         ('e2000000-0000-0000-0000-0000000000d2','b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000da',
          'D3 invitée','a0000000-0000-0000-0000-000000000001','invitee', null,'20000000-0000-0000-0000-000000000001'),
         ('e2000000-0000-0000-0000-0000000000d3','b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000db',
          'D3 lien libre',null,'invitee', null,'20000000-0000-0000-0000-000000000001');
  insert into public.reserves_invitations(entreprise_id, chantier_id, intervenant_id, token_hash, email, expire_at, created_by)
  values ('b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000db','e2000000-0000-0000-0000-0000000000d3',
          encode(extensions.digest('jeton-d3-residu','sha256'),'hex'),'lien@invalid.local', now() + interval '7 days','20000000-0000-0000-0000-000000000001');
end $$;

create temp table res(cle text primary key, val text);
grant all on res to authenticated;

-- ═══ 1. OUVRIER HABILITÉ RÉSERVES : GP suspendu ≡ GP actif ═══════════════════════════════════════
select pg_temp.decor('actif', 'actif');
set local role authenticated;
insert into res select 'actif', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.decor('suspendu', 'actif');
set local role authenticated;
insert into res select 'suspendu', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;

select is((select val from res where cle = 'actif'),
  'compteur=2;in_app=2;prefs=6;notif_rls=2;annuaire_rls=1;interv_rls=1;courant=true;en_attente=1;definir=ok:;lues=ok:2;rejoindre=ok:;accepter=ok:e2000000-0000-0000-0000-0000000000d3',
  '1. référence (GP actif) : les 11 objets rendent ce que l''utilisateur habilité attend (2 notifications, 6 catégories, sa fiche, l''intervention, les gestes réussissent)');
select is((select val from res where cle = 'suspendu'), (select val from res where cle = 'actif'),
  '1. D3 : avec GP suspendu et Réserves actif, la sonde des 11 objets est IDENTIQUE à celle d''une organisation GP active');
select is((select statut from public.reserves_intervenants where id = 'e2000000-0000-0000-0000-0000000000d3'), 'active',
  '1. D3 : GP suspendu, l''acceptation du lien a bien rattaché l''organisation (effet équivalent, pas seulement une absence d''erreur)');
select is((select count(*)::int from public.reserves_notifications_lectures where utilisateur_id = '10000000-0000-0000-0000-000000000002'), 2,
  '1. D3 : GP suspendu, les 2 notifications sont bien marquées lues pour la personne (effet équivalent)');
select is((select email from public.reserves_preferences_notifications
  where utilisateur_id = '10000000-0000-0000-0000-000000000002' and categorie = 'message'), false,
  '1. D3 : GP suspendu, la préférence e-mail est bien enregistrée (effet équivalent)');
select is((select role_code from public.habilitations_applications_utilisateurs
  where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and utilisateur_id = '10000000-0000-0000-0000-000000000002' and application_code = 'reserves'),
  'reserves_consultation', '1. « do nothing » : le rôle Réserves déjà détenu n''est pas réécrit par l''invitation, GP suspendu ou non');

-- ═══ 2. Le flux d'invitation sert quelqu'un qui n'a PAS ENCORE d'accès Réserves (raison de l'écart à l'annexe §4) ═══
-- Nouvelle organisation C : membre actif, GP suspendu, AUCUN entitlement ni habilitation Réserves.
reset role;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000000','c0000000-0000-4000-8000-0000000000c1','authenticated','authenticated','nouveau-c@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now());
insert into public.utilisateurs(id, prenom, nom) values ('c0000000-0000-4000-8000-0000000000c1','Nouveau','C')
on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;
insert into public.entreprises(id, nom, code_adhesion, abonnement_statut) values ('c0000000-0000-4000-8000-000000000001','Entreprise D3 C','ISOC0D31','suspendu');
insert into public.postes(id, entreprise_id, nom) values ('c1000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','Gérant C');
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id, statut)
values ('c0000000-0000-4000-8000-0000000000c1','c0000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001','actif');
insert into public.reserves_intervenants(id, entreprise_id, chantier_id, nom, entreprise_intervenante_id, statut, created_by)
values ('e2000000-0000-0000-0000-0000000000c2','b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000d9',
        'D3 nouvelle organisation','c0000000-0000-4000-8000-000000000001','invitee','20000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.moi('c0000000-0000-4000-8000-0000000000c1');
select is((select count(*)::int from public.reserves_invitations_en_attente()), 1,
  '2. GP suspendu, sans aucun accès Réserves : la personne VOIT l''invitation qui l''attend (une garde applicative la lui cacherait)');
select is(public.a_acces_application('c0000000-0000-4000-8000-000000000001','reserves'), false,
  '2. et elle n''a effectivement pas encore d''accès Réserves (a_acces_application = faux)');
select lives_ok($$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-0000000000c2')$$,
  '2. GP suspendu, sans accès préalable : elle peut REJOINDRE l''intervention (le geste crée son habilitation limitée)');
select is(public.a_acces_application('c0000000-0000-4000-8000-000000000001','reserves'), false,
  '2. rejoindre ne crée qu''une habilitation : sans entitlement d''organisation Réserves, toujours aucun accès à Réserves');
reset role;
insert into public.reserves_intervenants(id, entreprise_id, chantier_id, nom, entreprise_intervenante_id, statut, created_by)
values ('e2000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000da','D3 lien C',null,'invitee','20000000-0000-0000-0000-000000000001');
insert into public.reserves_invitations(entreprise_id, chantier_id, intervenant_id, token_hash, email, expire_at, created_by)
values ('b0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-0000000000da','e2000000-0000-0000-0000-0000000000c3',
        encode(extensions.digest('jeton-d3-c','sha256'),'hex'),'c@invalid.local', now() + interval '7 days','20000000-0000-0000-0000-000000000001');
set local role authenticated;
select pg_temp.moi('c0000000-0000-4000-8000-0000000000c1');
select lives_ok($$select public.reserves_invitation_accepter(encode(extensions.digest('jeton-d3-c','sha256'),'hex'),'c0000000-0000-4000-8000-000000000001')$$,
  '2. GP suspendu, sans accès préalable : elle peut ACCEPTER le lien (le geste crée entitlement gratuit + rôle limité)');
select is(public.a_acces_application('c0000000-0000-4000-8000-000000000001','reserves'), true,
  '2. après acceptation, Réserves est accessible à l''organisation C malgré son GP suspendu (D3)');
reset role;
select pg_temp.moi(null);

-- ═══ 3. PAS D'ÉLARGISSEMENT : GP suspendu + la personne n'a PAS le droit d'usage Réserves ═══════════
-- Refus attendu identiquement pour les 8 objets gardés ; les 3 flux d'invitation restent ouverts à tout membre actif
-- comme AVANT la proposition (ils ne donnent aucun accès : voir 3.g).
-- (a) membre de A sans habilitation Réserves
select pg_temp.decor('suspendu', 'actif');
set local role authenticated;
insert into res select 'sans_habilitation', pg_temp.sonder('10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'sans_habilitation'),
  'compteur=0;in_app=0;prefs=0;notif_rls=0;annuaire_rls=0;interv_rls=0;courant=false;en_attente=1;definir=refus:Accès à Réserves non autorisé pour cette;lues=ok:0;rejoindre=ok:;accepter=ok:e2000000-0000-0000-0000-0000000000d3',
  '3.a GP suspendu, membre SANS habilitation Réserves : tout est vide/refusé pour les 8 objets gardés (flux d''invitation : voir 3.g)');

-- (b) membre dont l'appartenance est désactivée (même habilité)
select pg_temp.decor('suspendu', 'actif');
set local role authenticated;
insert into res select 'desactive', pg_temp.sonder('10000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'desactive'),
  'compteur=0;in_app=0;prefs=0;notif_rls=0;annuaire_rls=0;interv_rls=0;courant=false;en_attente=0;definir=refus:Vous n''êtes pas membre actif de cette or;lues=ok:0;rejoindre=refus:Vous n''êtes pas membre actif de l''entrep;accepter=refus:Vous n''êtes pas membre actif de cette or',
  '3.b GP suspendu, compte DÉSACTIVÉ (même habilité) : rien, et les 3 flux d''invitation refusent aussi');

-- (c) membre d'une AUTRE organisation (B) qui vise A
select pg_temp.decor('suspendu', 'actif');
set local role authenticated;
insert into res select 'autre_organisation', pg_temp.sonder('20000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'autre_organisation'),
  'compteur=0;in_app=0;prefs=0;notif_rls=0;annuaire_rls=0;interv_rls=0;courant=false;en_attente=0;definir=refus:Vous n''êtes pas membre actif de cette or;lues=ok:0;rejoindre=refus:Vous n''êtes pas membre actif de l''entrep;accepter=refus:Vous n''êtes pas membre actif de cette or',
  '3.c membre d''une AUTRE organisation : ne voit ni ne règle rien de A ; interv_rls=0 alors que l''hôte B est SON organisation (Réserves non habilité)');

-- (d) droit d'usage Réserves DÉSACTIVÉ (autorise=false) sur A, GP suspendu, ouvrier pourtant habilité
select pg_temp.decor('suspendu', 'desactive');
set local role authenticated;
insert into res select 'reserves_desactive', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'reserves_desactive'),
  'compteur=0;in_app=0;prefs=0;notif_rls=0;annuaire_rls=0;interv_rls=0;courant=false;en_attente=1;definir=refus:Accès à Réserves non autorisé pour cette;lues=ok:0;rejoindre=ok:;accepter=ok:e2000000-0000-0000-0000-0000000000d3',
  '3.d droit d''usage Réserves désactivé (GP suspendu) : les 8 objets gardés restent vides/refusés (découpler GP n''a rien rouvert)');

-- (e) Réserves suspendu commercialement (statut propre de l'application), GP aussi
select pg_temp.decor('suspendu', 'suspendu');
set local role authenticated;
insert into res select 'reserves_suspendu', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'reserves_suspendu'), (select val from res where cle = 'reserves_desactive'),
  '3.e Réserves suspendu commercialement (statut propre, GP suspendu aussi) : mêmes refus que droit désactivé — la suspension de Réserves, elle, coupe bien Réserves');

-- (f) suspension plateforme globale : du compte, puis de l'organisation
select pg_temp.decor('suspendu', 'actif', 'compte');
set local role authenticated;
insert into res select 'plateforme_compte', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'plateforme_compte'),
  'compteur=0;in_app=0;prefs=0;notif_rls=0;annuaire_rls=0;interv_rls=0;courant=false;en_attente=1;definir=refus:Accès à Réserves non autorisé pour cette;lues=ok:0;rejoindre=ok:;accepter=ok:e2000000-0000-0000-0000-0000000000d3',
  '3.f suspension plateforme du COMPTE : les 8 objets gardés coupent (via a_acces_application) ; NOTE les 3 flux d''invitation ne lisent pas la suspension plateforme, comme avant la proposition (DECISION_REQUIRED n°2)');
select pg_temp.decor('suspendu', 'actif', 'organisation');
set local role authenticated;
insert into res select 'plateforme_organisation', pg_temp.sonder('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'plateforme_organisation'), (select val from res where cle = 'plateforme_compte'),
  '3.f suspension plateforme de l''ORGANISATION : même résultat que celle du compte');

-- (g) les 3 flux d'invitation n'ouvrent AUCUNE lecture de données : après accepter/rejoindre par un membre sans droit, rien n'est lisible
select pg_temp.decor('suspendu', 'desactive');
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000003');
select is(left(pg_temp.essayer('select public.reserves_invitation_accepter(''' || encode(extensions.digest('jeton-d3-residu','sha256'),'hex') || ''', ''a0000000-0000-0000-0000-000000000001'')'), 3), 'ok:',
  '3.g (préalable) un membre de A sans droit d''usage Réserves peut accepter un lien pour A, comme avant la proposition');
select is((select count(*)::int from public.reserves_chantiers), 0,
  '3.g accepter/rejoindre par un membre sans droit d''usage Réserves (désactivé) n''ouvre aucun chantier Réserves à la lecture');
select is(public.a_acces_application('a0000000-0000-0000-0000-000000000001','reserves'), false,
  '3.g et l''accès Réserves de A reste refusé (« do nothing » : l''entitlement désactivé n''est pas réécrit)');
reset role;

-- ═══ 4. Non-régression du chemin le plus courant : GP actif, tout Réserves actif, personne non habilitée ═══
-- Rappel : sans habilitation Réserves, un membre lisait auparavant les préférences de son organisation (aucune garde).
-- Ce comportement est volontairement RESTREINT (garde ajoutée) ; les 3 flux d'invitation, eux, sont inchangés.
select pg_temp.decor('actif', 'actif');
set local role authenticated;
insert into res select 'gp_actif_sans_habilitation', pg_temp.sonder('10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001');
reset role;
select is((select val from res where cle = 'gp_actif_sans_habilitation'), (select val from res where cle = 'sans_habilitation'),
  '4. la personne sans habilitation Réserves obtient le même résultat, GP actif ou suspendu : le couplage GP a bien disparu des deux côtés');

select * from finish();
rollback;
