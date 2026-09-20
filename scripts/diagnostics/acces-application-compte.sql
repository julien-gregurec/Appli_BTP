-- ELSATIA — diagnostic LECTURE SEULE de la chaîne d'accès d'un compte à une application.
--
-- À coller dans le SQL Editor Supabase (Preview OU Production) après avoir remplacé
-- l'adresse et le code d'application dans la première ligne de `params`.
-- Aucune écriture, aucune fonction appelée qui écrive, aucun secret lu : uniquement des
-- SELECT sur auth.users et sur les tables du socle multi-application.
--
-- Il rejoue, sans auth.uid(), la décision de `public.a_acces_application` pour un
-- utilisateur ordinaire (voie « membre actif + organisation autorisée + habilitation »)
-- et nomme la PREMIÈRE étape qui échoue. Chaque ligne = une étape de la chaîne :
--
--   statut  OK   l'étape est satisfaite
--           KO   l'étape échoue : c'est là qu'il faut agir (voir `action`)
--           INFO renseignement, ne décide rien
--
-- Le verdict final (ligne « 99 VERDICT ») est la synthèse. Il ne remplace pas le vrai
-- test de connexion : il dit seulement si les DONNÉES permettent l'accès.
--
-- Prérequis de schéma : ledger >= 234 (tables multi-application) ; l'étape 08 exige
-- en plus 235/236 (plateforme_admins.utilisateur_id / actif). Sur un ledger plus ancien
-- (Production au ledger 210), la requête échoue dès la première table absente —
-- ce qui est déjà un diagnostic : les tables multi-application n'existent pas.

with params as (
  select lower(btrim('julien@elsatia.fr')) as email,
         'colors'::text                    as app
),
comptes as (
  select u.*
  from auth.users u, params p
  where lower(btrim(u.email)) = p.email
),
compte as (select * from comptes order by created_at limit 1),
profil as (
  select up.id, up.prenom, up.entreprise_active_id
  from public.utilisateurs up
  join compte c on c.id = up.id
),
ent_active as (
  select e.id, e.nom, e.abonnement_statut, e.suspension_prevue_at
  from public.entreprises e
  join profil pr on pr.entreprise_active_id = e.id
),
membre as (
  select ue.entreprise_id, ue.statut
  from public.utilisateurs_entreprises ue
  join compte c on c.id = ue.utilisateur_id
),
membre_actif_active as (
  -- Réplique de public.est_membre_actif(entreprise_active) sans auth.uid().
  select 1
  from membre m
  join ent_active ea on ea.id = m.entreprise_id
  where m.statut = 'actif'
    and ea.abonnement_statut not in ('suspendu', 'annule')
    and (ea.suspension_prevue_at is null or ea.suspension_prevue_at > now())
),
appli as (
  select a.code, a.nom, a.actif, a.statut_produit, a.url_production, a.url_preview
  from public.applications_elsatia a, params p
  where a.code = p.app
),
droit_org as (
  select ae.autorise, ae.valide_du, ae.valide_jusqu_au, ae.source
  from public.acces_applications_entreprises ae
  join ent_active ea on ea.id = ae.entreprise_id, params p
  where ae.application_code = p.app
),
droit_org_valide as (
  select 1 from droit_org d
  where d.autorise
    and (d.valide_du is null or d.valide_du <= now())
    and (d.valide_jusqu_au is null or d.valide_jusqu_au > now())
),
habil as (
  select hu.role_code, hu.autorise, hu.valide_du, hu.valide_jusqu_au, r.actif as role_actif
  from public.habilitations_applications_utilisateurs hu
  join compte c on c.id = hu.utilisateur_id
  join ent_active ea on ea.id = hu.entreprise_id
  left join public.roles_applications_elsatia r
    on r.application_code = hu.application_code and r.code = hu.role_code, params p
  where hu.application_code = p.app
),
habil_valide as (
  select 1 from habil h
  where h.autorise and coalesce(h.role_actif, false)
    and (h.valide_du is null or h.valide_du <= now())
    and (h.valide_jusqu_au is null or h.valide_jusqu_au > now())
),
etapes as (
  select 1 as n, '01 compte Auth' as etape,
         case (select count(*) from comptes) when 1 then 'OK' when 0 then 'KO' else 'KO' end as statut,
         case (select count(*) from comptes)
           when 1 then 'un compte Auth pour cette adresse (id ' || (select id::text from compte) || ')'
           when 0 then 'AUCUN compte Auth pour cette adresse'
           else (select count(*) from comptes)::text || ' comptes Auth pour la même adresse (casse/espaces) : doublon à arbitrer' end as detail,
         'Absent : inviter par le parcours normal Gestion Pro. Ne jamais créer le compte à sa place.' as action
  union all
  select 2, '02 e-mail confirmé, non banni',
         case when (select email_confirmed_at is not null
                         and (banned_until is null or banned_until < now()) from compte) then 'OK' else 'KO' end,
         coalesce((select 'confirmé=' || (email_confirmed_at is not null)::text
                 || ' ; banni_jusqu_a=' || coalesce(banned_until::text, 'non')
                 || ' ; dernier_login=' || coalesce(last_sign_in_at::text, 'jamais')
                 || ' ; fournisseurs=' || coalesce(raw_app_meta_data ->> 'providers', '?') from compte),
                 'aucun compte Auth (étape 01)'),
         'E-mail non confirmé : renvoyer la confirmation. Banni : lever le bannissement côté Auth.'
  union all
  select 3, '03 profil public.utilisateurs',
         case when exists (select 1 from profil) then 'OK' else 'KO' end,
         coalesce((select 'prénom=' || coalesce(prenom, '(vide)')
                          || ' ; entreprise_active_id=' || coalesce(entreprise_active_id::text, 'NULL') from profil),
                  'aucune ligne : le déclencheur de création n''a pas joué'),
         'Profil absent : à réparer par le circuit d''onboarding Gestion Pro, pas par insert manuel.'
  union all
  select 4, '04 entreprise active renseignée et existante',
         case when exists (select 1 from ent_active) then 'OK' else 'KO' end,
         coalesce((select nom || ' (' || id::text || ') ; abonnement=' || abonnement_statut
                          || ' ; suspension_prevue_at=' || coalesce(suspension_prevue_at::text, 'aucune') from ent_active),
                  'entreprise_active_id NULL ou pointant nulle part : contexte_application_courant() ne renvoie AUCUNE ligne'),
         'Faire basculer l''entreprise active depuis Gestion Pro.'
  union all
  select 5, '05 appartenances',
         case when exists (select 1 from membre) then 'INFO' else 'KO' end,
         coalesce((select string_agg(e.nom || ' [' || m.statut || ']', ' ; ' order by e.nom)
                   from membre m join public.entreprises e on e.id = m.entreprise_id),
                  'aucune appartenance'),
         'Aucune appartenance : le compte existe mais n''appartient à aucune organisation.'
  union all
  select 6, '06 membre ACTIF de l''entreprise active, abonnement non suspendu/annulé',
         case when exists (select 1 from membre_actif_active) then 'OK' else 'KO' end,
         coalesce((select 'statut_appartenance=' || coalesce(string_agg(m.statut, ','), 'aucune')
                          || ' ; abonnement=' || max(ea.abonnement_statut)
                          || ' (réplique de est_membre_actif : actif ET abonnement hors suspendu/annule ET pas de suspension échue)'
                   from ent_active ea left join membre m on m.entreprise_id = ea.id),
                  'pas d''entreprise active (étape 04)'),
         'Statut ≠ actif : réactiver le membre. Abonnement suspendu/annulé : l''organisation est bloquée pour TOUTES les applications, Colors compris.'
  union all
  select 7, '07 application au catalogue et active',
         case when exists (select 1 from appli where actif) then 'OK' else 'KO' end,
         coalesce((select code || ' actif=' || actif::text || ' ; statut_produit=' || statut_produit
                          || ' ; prod=' || coalesce(url_production, '—') || ' ; preview=' || coalesce(url_preview, '—') from appli),
                  'code d''application absent du catalogue'),
         'Le catalogue est posé par la migration 234 : ledger insuffisant ou ligne retirée.'
  union all
  select 8, '08 organisation autorisée pour l''application',
         case when exists (select 1 from droit_org_valide) then 'OK' else 'KO' end,
         coalesce((select 'autorise=' || autorise::text || ' ; du=' || coalesce(valide_du::text, '—')
                          || ' ; jusqu_au=' || coalesce(valide_jusqu_au::text, '—') || ' ; source=' || coalesce(source, '—') from droit_org),
                  'aucune ligne acces_applications_entreprises pour ce couple'),
         'Activer l''application pour l''organisation par /plateforme/entreprises/<id>/applications (admin plateforme AAL2).'
  union all
  select 9, '09 habilitation individuelle valide (rôle actif)',
         case when exists (select 1 from habil_valide) then 'OK' else 'KO' end,
         coalesce((select string_agg('rôle=' || role_code || ' autorise=' || autorise::text
                                     || ' rôle_actif=' || coalesce(role_actif::text, 'ABSENT')
                                     || ' du=' || coalesce(valide_du::text, '—')
                                     || ' jusqu_au=' || coalesce(valide_jusqu_au::text, '—'), ' ; ') from habil),
                  'aucune habilitation pour ce couple utilisateur/entreprise/application'),
         'Habiliter l''utilisateur (rôle colors_admin_organisation) par le même écran.'
  union all
  select 10, '10 statut administrateur plateforme (information : n''ouvre rien ici)',
         'INFO',
         coalesce((select 'actif=' || pa.actif::text || ' ; statut_identite=' || coalesce(pa.statut_identite, '—')
                          || ' ; role=' || coalesce(pa.role, '—')
                   from public.plateforme_admins pa join compte c on c.id = pa.utilisateur_id),
                  'non administrateur plateforme (attendu pour un compte de travail)'),
         'Ne PAS activer par contournement : l''activation exige un autre admin « total » en AAL2.'
),
verdict as (
  select 99 as n, '99 VERDICT' as etape,
         case when (select count(*) from etapes where statut = 'KO') = 0 then 'OK' else 'KO' end as statut,
         coalesce('première étape en échec : ' || (select etape from etapes where statut = 'KO' order by n limit 1),
                  'les données autorisent l''accès (voie utilisateur ordinaire)') as detail,
         coalesce((select action from etapes where statut = 'KO' order by n limit 1), '—') as action
)
select etape, statut, detail, action from etapes
union all
select etape, statut, detail, action from verdict
order by 1;
