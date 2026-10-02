-- Fixture Preview « satellites » du pilote PILOTE-BTP-V1 — habilitations applicatives et état
-- commercial déterministe (ELSATIA_SATELLITES_PREVIEW_READINESS_V2, constats A-01 et A-02).
--
-- POURQUOI UNE FIXTURE DÉDIÉE, ET PAS UNE MODIFICATION DU SEED
--   seed_entreprise_pilote_btp.sql reste NEUTRE : il crée l'entreprise, ses 28 comptes et son
--   historique métier, sans aucun droit applicatif (c'est le geste d'un opérateur plateforme sur
--   une vraie entreprise, pas celui d'un seed) et en essai GP (l'état de toute entreprise neuve).
--   Ce script, joué APRÈS le seed, pose uniquement ce dont la recette Preview des applications
--   satellites (Colors, Tools, Réserves) a besoin. Il ne touche ni le seed, ni le code produit,
--   ni les migrations.
--
-- CE QU'IL POSE (idempotent : rejouable, même état final)
--   1. État commercial GP du pilote : `abonnement_statut='actif'`, échéance FIXE 2099-12-31,
--      aucune suspension programmée. C'est l'effet exact du geste opérateur
--      `plateforme_modifier_abonnement` (facturation pilote manuelle hors Stripe, §9 du pack
--      pilote) — inappelable ici, car gardé par AAL2 (même limite que celle documentée par le
--      seed pour la capacité de personnes).
--      A-02 : le seed crée l'entreprise avec `created_at = now() - 2 mois`, donc un essai de
--      30 jours TOUJOURS échu, quelle que soit la date d'exécution. Options comparées :
--        - essai à échéance très lointaine : impossible sans tricher, la contrainte
--          `entreprises_essai_dates_coherentes` borne l'essai à 30 jours après son début ;
--        - essai recalculé au moment de l'exécution : vert pendant 30 jours puis rouge,
--          donc non déterministe pour une recette rejouée ;
--        - statut « pilote » dédié : nouvelle sémantique produit et migration, refusé ;
--        - RETENU : statut `actif` posé par geste opérateur. `etat_commercial_gestion_pro`
--          ne consulte alors AUCUNE date (seule `suspension_prevue_at`, mise à NULL), donc la
--          décision est identique aujourd'hui, dans un an ou dans dix.
--      Aucun essai n'est prolongé, aucun code produit n'est modifié.
--   2. Droits ENTREPRISE (`acces_applications_entreprises`) : gestion_pro, colors, tools,
--      reserves — `autorise`, `statut_commercial='entitled'`, sans borne temporelle ni essai.
--      Jamais `drone` (statut produit « bientot », aucun rôle n'existe pour lui).
--   3. Habilitations UTILISATEUR (`habilitations_applications_utilisateurs`) pour Karim HADDAD
--      (pilote.karim.haddad@example.test, gérant) uniquement :
--        gestion_pro_admin, colors_admin_organisation, tools_releve_admin,
--        reserves_admin_organisation — sans borne temporelle.
--   4. Témoin négatif : Karim BELAID (pilote.karim.belaid@example.test, ouvrier de la MÊME
--      entreprise) n'a AUCUNE habilitation applicative. Toute habilitation résiduelle est retirée.
--
-- EXÉCUTION
--   Preview uniquement, via le wrapper (référence Preview vérifiée par code) :
--     node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql
--     node scripts/executer-script-production.mjs fixture_preview_satellites_pilote.sql
--     node scripts/executer-script-production.mjs assertions_fixture_preview_satellites_pilote.sql
--   Rejouer le seed remet l'entreprise en essai (comportement du seed, inchangé) : rejouer alors
--   cette fixture. Nettoyage : cleanup_entreprise_pilote_btp.sql (les droits partent en cascade
--   avec l'entreprise).
--   Banc local : scripts/local-postgres-bootstrap/rebuild_db.sh, puis les trois fichiers.
--   Harnais : `npm run verify:seeds -- --only pilote-satellites-preview` (scripts/seeds/registry.mjs).
--
-- Données FICTIVES uniquement (@example.test). Aucun secret.

set statement_timeout='2min';

do $fixture$
declare
  v_entreprise uuid;
  v_karim uuid;
  v_belaid uuid;
  v_app text;
  c_reference constant text := 'PILOTE-BTP-V1 - fixture satellites Preview';
  c_note constant text := '[PILOTE] Facturation pilote manuelle hors Stripe - fixture satellites Preview (abonnement actif pose par geste operateur, echeance fixe)';
begin
  select id into v_entreprise from public.entreprises where reference_interne='PILOTE-BTP-V1';
  if v_entreprise is null then
    raise exception 'PILOTE-BTP-V1 absente : jouer seed_entreprise_pilote_btp.sql avant cette fixture';
  end if;
  select id into v_karim from auth.users where email='pilote.karim.haddad@example.test';
  select id into v_belaid from auth.users where email='pilote.karim.belaid@example.test';
  if v_karim is null or v_belaid is null then
    raise exception 'Comptes pilote absents : jouer seed_entreprise_pilote_btp.sql avant cette fixture';
  end if;
  if not exists(select 1 from public.utilisateurs_entreprises
                 where entreprise_id=v_entreprise and utilisateur_id=v_karim and statut='actif') then
    raise exception 'Karim Haddad n''est pas membre actif de PILOTE-BTP-V1';
  end if;

  -- 1) État commercial GP : effet du geste opérateur plateforme_modifier_abonnement('actif').
  update public.entreprises set
    abonnement_statut='actif',
    abonnement_echeance=date '2099-12-31',
    abonnement_note=c_note,
    impaye_signale_at=null,
    suspension_prevue_at=null,
    impaye_message=null,
    updated_at=now()
  where id=v_entreprise
    and (abonnement_statut is distinct from 'actif'
         or abonnement_echeance is distinct from date '2099-12-31'
         or abonnement_note is distinct from c_note
         or impaye_signale_at is not null or suspension_prevue_at is not null or impaye_message is not null);

  -- 2) Droits entreprise : les quatre applications disponibles du pilote, jamais Drone.
  foreach v_app in array array['gestion_pro','colors','tools','reserves'] loop
    insert into public.acces_applications_entreprises(
      entreprise_id,application_code,autorise,source,reference_externe,valide_du,valide_jusqu_au,
      statut_commercial,essai_fin,metadata
    ) values (
      v_entreprise,v_app,true,'manuel',c_reference,null,null,'entitled',null,
      jsonb_build_object('fixture','pilote-satellites-preview')
    )
    on conflict(entreprise_id,application_code) do update set
      autorise=true,source='manuel',reference_externe=c_reference,valide_du=null,valide_jusqu_au=null,
      statut_commercial='entitled',essai_fin=null,
      metadata=public.acces_applications_entreprises.metadata || jsonb_build_object('fixture','pilote-satellites-preview')
    where (public.acces_applications_entreprises.autorise,public.acces_applications_entreprises.valide_du,
           public.acces_applications_entreprises.valide_jusqu_au,public.acces_applications_entreprises.statut_commercial,
           public.acces_applications_entreprises.essai_fin,public.acces_applications_entreprises.reference_externe)
          is distinct from (true,null::timestamptz,null::timestamptz,'entitled'::text,null::timestamptz,c_reference);
  end loop;
  delete from public.acces_applications_entreprises where entreprise_id=v_entreprise and application_code='drone';

  -- 3) Habilitations de Karim Haddad : un rôle d'administration par application.
  insert into public.habilitations_applications_utilisateurs(
    entreprise_id,utilisateur_id,application_code,role_code,autorise,valide_du,valide_jusqu_au
  )
  select v_entreprise,v_karim,r.app,r.role,true,null,null
  from (values ('gestion_pro','gestion_pro_admin'),('colors','colors_admin_organisation'),
               ('tools','tools_releve_admin'),('reserves','reserves_admin_organisation')) as r(app,role)
  on conflict(entreprise_id,utilisateur_id,application_code) do update set
    role_code=excluded.role_code,autorise=true,valide_du=null,valide_jusqu_au=null
  where (public.habilitations_applications_utilisateurs.role_code,public.habilitations_applications_utilisateurs.autorise,
         public.habilitations_applications_utilisateurs.valide_du,public.habilitations_applications_utilisateurs.valide_jusqu_au)
        is distinct from (excluded.role_code,true,null::timestamptz,null::timestamptz);
  delete from public.habilitations_applications_utilisateurs
   where entreprise_id=v_entreprise and utilisateur_id=v_karim and application_code='drone';

  -- 4) Témoin négatif : même entreprise, aucune habilitation applicative.
  delete from public.habilitations_applications_utilisateurs
   where entreprise_id=v_entreprise and utilisateur_id=v_belaid;
end
$fixture$;

select e.reference_interne, e.abonnement_statut, public.etat_commercial_gestion_pro(e.id) as etat_gp,
       (select string_agg(application_code, ',' order by application_code)
          from public.acces_applications_entreprises where entreprise_id=e.id and autorise) as droits_entreprise,
       (select string_agg(h.application_code||':'||h.role_code, ',' order by h.application_code)
          from public.habilitations_applications_utilisateurs h join auth.users u on u.id=h.utilisateur_id
         where h.entreprise_id=e.id and u.email='pilote.karim.haddad@example.test') as habilitations_karim
from public.entreprises e where e.reference_interne='PILOTE-BTP-V1';
