-- pgTAP — contrat `decision_acces_application` v1 FIGÉ (D1-D3). PROPOSITION NON NUMÉROTÉE, NON RÉSERVÉE.
-- PRÉREQUIS : la base d'essai a reçu, dans cet ordre,
--   1. supabase/proposed/per_application_status_and_platform_suspension_v1.sql.proposed
--   2. packages/application-access/sql/decision_acces_application.sql.proposed
-- Rejeu (base jetable uniquement) : copier supabase/tests/ + ce fichier dans le conteneur, puis
--   psql -q -X -tA -f decision_acces_application.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(66);

\ir fixtures/isolation_multitenant.inc

-- ── Assistants (session courante uniquement) ─────────────────────────────────────────────────
create function pg_temp.moi(p_uid uuid, p_aal text default 'aal1') returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
  perform set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal)::text end, true);
end $$;
create function pg_temp.d(p_app text, p_ent uuid) returns text language sql as $$
  select public.decision_acces_application(p_app, p_ent)->>'decision' $$;

-- ── Prérequis présents ───────────────────────────────────────────────────────────────────────
select has_function('public', 'decision_acces_application', array['text','uuid'], 'vue client présente');
select has_function('public', 'est_membre_organisation', array['uuid'], 'socle D3 présent (est_membre_organisation)');
select has_table('public', 'suspensions_plateforme', 'socle D3 présent (suspensions_plateforme)');

-- ── Jeu de données : organisation A (4 applications), organisation B (aucun droit) ──────────
-- ouvrier-a  = 10…02 : accès complet gestion_pro / colors / tools ; reserves : droit org SANS habilitation
-- chef-equipe-a = 10…03 : membre actif, aucune habilitation
-- conducteur-a = 10…04 : habilitation colors RETIRÉE (autorise=false)
-- comptable-a = 10…05 : membre DÉSACTIVÉ ; dirigeant-a = 10…06 : INVITÉ ; admin-a = 10…01 : membre actif
-- admin-b = 20…01 : membre actif de B ; ouvrier-b = 20…02 : en attente de validation
-- plateforme = 30…01 : administrateur plateforme actif, rôle total
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source)
select 'a0000000-0000-0000-0000-000000000001', a, true, 'test'
from (values ('gestion_pro'), ('colors'), ('tools'), ('reserves')) v(a);
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','gestion_pro','gestion_pro_utilisateur',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','colors','colors_consultation',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','tools','tools_pro',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','colors','colors_consultation',false),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','colors','colors_consultation',true),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006','colors','colors_consultation',true);
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000005';
update public.utilisateurs_entreprises set statut = 'invite'
 where utilisateur_id = '10000000-0000-0000-0000-000000000006';
update public.utilisateurs_entreprises set statut = 'en_attente_validation'
 where utilisateur_id = '20000000-0000-0000-0000-000000000002';
update public.entreprises set abonnement_statut = 'actif'
 where id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');

set local role authenticated;

-- ═══ Étape 1 : non authentifié ═════════════════════════════════════════════════════════════
select pg_temp.moi(null);
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'non_authentifie', '1. sans jeton : non_authentifie');

-- ═══ Étape 2 : application inconnue / inactive : échec fermé ═══════════════════════════════
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('application_qui_nexiste_pas', 'a0000000-0000-0000-0000-000000000001'), 'erreur_configuration',
  '2. application inconnue : erreur_configuration (échec fermé)');
select is(public.decision_acces_application('application_qui_nexiste_pas', 'a0000000-0000-0000-0000-000000000001')->'entreprise',
  'null'::jsonb, '2. application inconnue : aucun nom d''entreprise');

-- ═══ Situations de la mission ══════════════════════════════════════════════════════════════
-- (a) sans organisation
select is(pg_temp.d('colors', null), 'sans_organisation', '5. sans organisation active : sans_organisation');
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'b0000000-0000-0000-0000-000000000001'), 'sans_organisation',
  '5. organisation dont on n''est pas membre : sans_organisation');
select is(public.decision_acces_application('colors', 'b0000000-0000-0000-0000-000000000001')->'entreprise',
  'null'::jsonb, '5. non-membre : le nom de l''organisation tierce n''est pas exposé');
-- (b) sans entitlement : membre actif, application sans droit d'usage de l'organisation
select is(pg_temp.d('drone', 'a0000000-0000-0000-0000-000000000001'), 'application_non_incluse',
  '11. sans entitlement (droit d''usage absent) : application_non_incluse');
select pg_temp.moi('20000000-0000-0000-0000-000000000001');
select is(pg_temp.d('colors', 'b0000000-0000-0000-0000-000000000001'), 'application_non_incluse',
  '11. organisation B sans aucun droit : application_non_incluse');
-- (c) sans rôle
select pg_temp.moi('10000000-0000-0000-0000-000000000003');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'sans_habilitation',
  '12. droit d''usage sans habilitation : sans_habilitation');
select pg_temp.moi('10000000-0000-0000-0000-000000000004');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'sans_role',
  '13. habilitation retirée (autorise=false) : sans_role');
-- (e) autorisé
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '14. accès complet : autorise');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->>'role_code',
  'colors_consultation', '14. autorise : role_code propre rendu');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')#>>'{entreprise,nom}',
  'Entreprise Isolation A', '14. membre : nom de son organisation rendu');
-- (f) désactivé, (g) invitation en attente, validation en attente
select pg_temp.moi('10000000-0000-0000-0000-000000000005');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'utilisateur_desactive', '8. membre désactivé : utilisateur_desactive');
select pg_temp.moi('10000000-0000-0000-0000-000000000006');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'invitation_en_attente', '6. invitation en attente : invitation_en_attente');
select pg_temp.moi('20000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'b0000000-0000-0000-0000-000000000001'), 'validation_en_attente', '7. validation en attente : validation_en_attente');

-- ═══ Étape 9 : abonnement_suspendu PAR application (D3) ════════════════════════════════════
reset role; select pg_temp.moi(null);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu',
  '9. abonnement GP suspendu : gestion_pro refusé');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise',
  '9/D3. abonnement GP suspendu : Colors reste autorisé');
select is(pg_temp.d('tools', 'a0000000-0000-0000-0000-000000000001'), 'autorise',
  '9/D3. abonnement GP suspendu : Tools reste autorisé');
-- priorité : le membre désactivé d'une organisation suspendue reçoit utilisateur_desactive
select pg_temp.moi('10000000-0000-0000-0000-000000000005');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'utilisateur_desactive',
  'priorité : membre désactivé d''une organisation GP suspendue = utilisateur_desactive (pas abonnement_suspendu)');
select pg_temp.moi('10000000-0000-0000-0000-000000000006');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'invitation_en_attente',
  'priorité : invité d''une organisation GP suspendue = invitation_en_attente');

reset role; select pg_temp.moi(null);
update public.entreprises set abonnement_statut = 'annule' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu',
  '9. abonnement GP annulé : abonnement_suspendu (entreprise_inactive n''existe plus)');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '9/D3. abonnement GP annulé : Colors autorisé');

reset role; select pg_temp.moi(null);
update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = now() - interval '1 day'
 where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu',
  '9. suspension GP prévue échue : gestion_pro refusé');
select is(pg_temp.d('reserves', 'a0000000-0000-0000-0000-000000000001'), 'sans_habilitation',
  '9/D3. suspension GP prévue échue : Réserves jugée sur SES propres critères (sans_habilitation)');
reset role; select pg_temp.moi(null);
update public.entreprises set suspension_prevue_at = null where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;

-- statut commercial propre à une application ≠ gestion_pro
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set statut_commercial = 'suspendu', suspendu_depuis = now()
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu', '9. Colors suspendu : Colors refusé');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '9/D3. Colors suspendu : gestion_pro autorisé');
select is(pg_temp.d('tools', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '9/D3. Colors suspendu : Tools autorisé');
select pg_temp.moi('10000000-0000-0000-0000-000000000005');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'utilisateur_desactive',
  'priorité : membre désactivé d''une application suspendue = utilisateur_desactive');
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set statut_commercial = 'annule'
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'abonnement_suspendu', '9. Colors annulé : Colors refusé');
-- un statut posé sur la ligne gestion_pro est IGNORÉ : le statut GP est l'abonnement de l'entreprise
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set statut_commercial = 'actif', suspendu_depuis = null
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
update public.acces_applications_entreprises set statut_commercial = 'suspendu', suspendu_depuis = now()
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'gestion_pro';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'autorise',
  'le statut_commercial de la ligne gestion_pro est ignoré (source de vérité = entreprises.abonnement_statut)');
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set statut_commercial = 'actif', suspendu_depuis = null
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'gestion_pro';
set local role authenticated;

-- ═══ Étape 10-11 : fenêtre du droit d'usage ═════════════════════════════════════════════════
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises
   set source = 'essai', valide_du = now() - interval '60 days', valide_jusqu_au = now() - interval '1 day'
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'essai_expire', '10. droit issu d''un essai, expiré : essai_expire');
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set source = 'contrat'
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'application_non_incluse', '11. droit expiré hors essai : application_non_incluse');
reset role; select pg_temp.moi(null);
update public.acces_applications_entreprises set source = 'test', valide_du = null, valide_jusqu_au = null
 where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'colors';
set local role authenticated;

-- ═══ Étapes 3-4 : suspension plateforme et bypass administrateur ═══════════════════════════
select pg_temp.moi('30000000-0000-0000-0000-000000000001');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '4. administrateur plateforme actif : bypass autorise');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->>'role_code',
  'administrateur_plateforme_global', '4. bypass : rôle administrateur_plateforme_global');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->'entreprise', 'null'::jsonb,
  '4. bypass administrateur non membre : aucun nom d''entreprise');

reset role; select pg_temp.moi(null);
insert into public.suspensions_plateforme(portee, utilisateur_id, motif)
values ('compte', '30000000-0000-0000-0000-000000000001', 'test suspension du compte administrateur');
set local role authenticated;
select pg_temp.moi('30000000-0000-0000-0000-000000000001');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme',
  '3. suspension_plateforme PRIME sur le bypass administrateur');
select is(pg_temp.d('colors', null), 'suspension_plateforme', '3. suspension du compte : aussi sans organisation');
reset role; select pg_temp.moi(null);
delete from public.suspensions_plateforme;
insert into public.suspensions_plateforme(portee, entreprise_id, motif)
values ('organisation', 'a0000000-0000-0000-0000-000000000001', 'test suspension de l''organisation A');
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('gestion_pro', 'a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '3. organisation suspendue : gestion_pro');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme', '3. organisation suspendue : Colors aussi');
select pg_temp.moi('10000000-0000-0000-0000-000000000006');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme',
  'priorité : suspension_plateforme prime sur invitation_en_attente');
select pg_temp.moi('30000000-0000-0000-0000-000000000001');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'suspension_plateforme',
  '3. suspension d''ORGANISATION : prime aussi sur le bypass administrateur pour cette organisation');
select is(pg_temp.d('colors', 'b0000000-0000-0000-0000-000000000001'), 'autorise',
  '3. suspension d''organisation A : l''administrateur garde son bypass sur l''organisation B');
select pg_temp.moi('20000000-0000-0000-0000-000000000001');
select is(pg_temp.d('colors', 'b0000000-0000-0000-0000-000000000001'), 'application_non_incluse',
  '3. suspension d''organisation A : aucun effet sur les membres de B');
-- expirée, révoquée, programmée : inactives
reset role; select pg_temp.moi(null);
update public.suspensions_plateforme set debut_at = now() - interval '2 days', fin_at = now() - interval '1 day';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '3. suspension échue (fin_at passé) : plus appliquée');
reset role; select pg_temp.moi(null);
update public.suspensions_plateforme set fin_at = null, revoque_at = now(), revoque_motif = 'levée de test';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '3. suspension révoquée : plus appliquée');
reset role; select pg_temp.moi(null);
update public.suspensions_plateforme set revoque_at = null, revoque_motif = null, debut_at = now() + interval '1 day';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'autorise', '3. suspension programmée dans le futur : pas encore appliquée');
reset role; select pg_temp.moi(null);
delete from public.suspensions_plateforme;
set local role authenticated;

-- ═══ Étape 8 (statut inconnu) : `pause` n'est ni actif ni désactivé → échec fermé ═══════════
reset role; select pg_temp.moi(null);
update public.utilisateurs_entreprises set statut = 'pause' where utilisateur_id = '10000000-0000-0000-0000-000000000003';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000003');
select is(pg_temp.d('colors', 'a0000000-0000-0000-0000-000000000001'), 'erreur_configuration', 'statut d''appartenance `pause` : erreur_configuration (échec fermé)');
reset role; select pg_temp.moi(null);
update public.applications_elsatia set actif = false where code = 'tools';
set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is(pg_temp.d('tools', 'a0000000-0000-0000-0000-000000000001'), 'erreur_configuration', 'application désactivée au catalogue : erreur_configuration');
reset role; select pg_temp.moi(null);
update public.applications_elsatia set actif = true where code = 'tools';
set local role authenticated;

-- ═══ Forme du retour v1 ════════════════════════════════════════════════════════════════════
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select is((select array_agg(k order by k) from jsonb_object_keys(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')) k),
  array['application_code','decision','entreprise','role_code','version'], 'forme v1 : exactement 5 clés, aucune fuite de diagnostic');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->'version', '1'::jsonb, 'version = 1');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->>'application_code', 'colors', 'application_code rendu');
select pg_temp.moi('10000000-0000-0000-0000-000000000004');
select is(public.decision_acces_application('colors', 'a0000000-0000-0000-0000-000000000001')->'role_code', 'null'::jsonb,
  'role_code absent quand la décision n''est pas autorise');

-- ═══ Surface : noyau interne, vue client, diagnostic administrateur ════════════════════════
reset role; select pg_temp.moi(null);
select is(has_function_privilege('authenticated', 'public._decision_acces_noyau(uuid,uuid,text)', 'execute'), false, 'noyau non appelable par authenticated');
select is(has_function_privilege('anon', 'public._decision_acces_noyau(uuid,uuid,text)', 'execute'), false, 'noyau non appelable par anon');
select is(has_function_privilege('service_role', 'public._decision_acces_noyau(uuid,uuid,text)', 'execute'), false, 'noyau non appelable par service_role');
select is(has_function_privilege('anon', 'public.decision_acces_application(text,uuid)', 'execute'), false, 'vue client non appelable par anon');
select is(has_function_privilege('authenticated', 'public.decision_acces_application(text,uuid)', 'execute'), true, 'vue client appelable par authenticated');
select is(has_function_privilege('authenticated', 'public._suspension_plateforme_active(uuid,uuid)', 'execute'), false, 'lecture de suspension non appelable par authenticated');

set local role authenticated;
select pg_temp.moi('10000000-0000-0000-0000-000000000002');
select throws_ok($$select public._decision_acces_noyau('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','colors')$$,
  '42501', null, 'authenticated : noyau interdit (permission denied)');
select throws_ok($$select public.diagnostic_acces_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','colors')$$,
  '42501', null, 'diagnostic refusé à un non-administrateur');
select pg_temp.moi('30000000-0000-0000-0000-000000000001');
select is(public.diagnostic_acces_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','colors')->>'decision',
  'autorise', 'diagnostic administrateur : décision complète pour un tiers');
select ok(public.diagnostic_acces_application('10000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','colors')->'diagnostic' ? 'statut_commercial',
  'diagnostic administrateur : expose le statut commercial de l''application');

reset role; select pg_temp.moi(null);
select * from finish();
rollback;
