-- ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1
--
-- Clôt le point laissé OUVERT par 20260922000312_gp_pilot_employes_annuaire_vue_restreinte.sql :
-- « restreindre la lecture de `employes` elle-même sur les colonnes sensibles ».
--
-- Constat (V6, 9102ec80, reproduit par supabase/tests/employes_donnees_personnelles_acces_v1.test.sql) :
--   * GRANT SELECT de table + policy "membres accedent aux employes" (est_membre_actif) : tout
--     membre actif (ouvrier compris) lit email, téléphone, notes libres, numéro d'inscription
--     (secret d'activation), hash bcrypt du code stock, carte BTP, chemin de signature de TOUS
--     ses collègues — par REST direct, embed PostgREST ou `select=*` ;
--   * habilitations_employe, employes_cout_horaire, employes_taux_facture : écriture ouverte à
--     tout membre (l'UI exige gerer_employes, pas la base) ;
--   * exporter_donnees_entreprise (gerer_parametres seul) livre paie (NIR), RIB, coût interne et
--     notes RH à un poste qui ne peut pas les lire à l'écran (ex. rôle « Administration »).
--
-- Principe retenu (aucun nouveau système de droits : uniquement le RBAC existant) :
--   * la RLS ne sait pas masquer une colonne : on utilise les privilèges de COLONNE de
--     PostgreSQL. `authenticated` garde SELECT sur les colonnes d'annuaire/opérationnelles
--     (tous les embeds `employe:employes(id,prenom,nom,…)` continuent de marcher) et perd
--     SELECT sur les colonnes sensibles. UPDATE/INSERT restent accordés (écriture toujours
--     gardée par les policies role_gestion_* → gerer_employes) ;
--   * lecture détaillée via la vue `employes_fiche`, filtrée ligne par ligne et masquée
--     colonne par colonne selon les permissions existantes :
--       - ligne visible : membre actif ET (acces_employes OU gerer_employes OU sa propre fiche) ;
--       - notes (note managériale) : gerer_employes uniquement ;
--       - numéro d'inscription, fichiers carte BTP, signature : gerer_employes OU soi-même ;
--       - code_stock_hash : jamais exposé ;
--   * écritures habilitations / coût / taux : gerer_employes exigé en base (policies RESTRICTIVE,
--     même mécanisme que 20260713000043_permissions_rls_gestion.sql) ;
--   * export RGPD : une section n'est exportée que si l'appelant peut la lire par ailleurs ;
--     les sections retirées sont listées dans `sections_restreintes`.

-- ---------------------------------------------------------------------------
-- 1. Privilèges de colonne sur public.employes
-- ---------------------------------------------------------------------------
revoke select on public.employes from anon, authenticated;

grant select (
  id, entreprise_id, reference_interne, prenom, nom, poste, poste_id,
  type_contrat, date_entree, date_sortie, statut, created_at, updated_at,
  utilisateur_id, compte_active_at, invitation_envoyee_at, invitation_canal,
  application_installee_at, premiere_connexion_at, derniere_connexion_at,
  compte_application_statut, compte_application_ouvert_at, compte_application_ferme_at,
  code_stock_active, code_stock_modifie_at,
  photo_storage_path, photo_url, photo_nom, photo_mime_type, photo_taille_octets,
  signature_at, anonymise_at
) on public.employes to authenticated;

-- Colonnes désormais NON lisibles directement par `authenticated` :
--   email, telephone, notes, numero_inscription, identifiant_interne, code_stock_hash,
--   carte_btp_storage_path, carte_btp_nom, carte_btp_mime_type, carte_btp_taille_octets,
--   carte_btp_numero, carte_btp_expiration, signature_storage_path.
-- Toute nouvelle colonne ajoutée plus tard à `employes` est fermée par défaut (pas de grant
-- de table) : elle doit être classée explicitement avant d'être ouverte.

comment on column public.employes.notes is
  'MANAGER_NOTE — note libre managériale/RH. Non lisible directement par authenticated ; lecture via employes_fiche réservée à gerer_employes (20260928000701).';

-- ---------------------------------------------------------------------------
-- 2. Vue de lecture détaillée, filtrée et masquée
-- ---------------------------------------------------------------------------
-- security_invoker = false (défaut) : la vue lit la table avec les droits de son
-- propriétaire, c'est donc ELLE qui porte le filtre d'entreprise et de permission.
-- security_barrier : aucun prédicat de l'appelant n'est évalué avant ce filtre.
create or replace view public.employes_fiche
with (security_barrier = true) as
select
  e.id, e.entreprise_id, e.reference_interne, e.prenom, e.nom, e.poste, e.poste_id,
  e.type_contrat, e.date_entree, e.date_sortie, e.statut, e.created_at, e.updated_at,
  e.utilisateur_id, e.anonymise_at,
  -- coordonnées professionnelles (module Employés ou soi-même)
  e.email, e.telephone,
  e.identifiant_interne,
  e.carte_btp_numero, e.carte_btp_expiration,
  -- photo : déjà lisible par tout membre (storage peut_lire_document_employe_sensible)
  e.photo_storage_path, e.photo_url, e.photo_nom, e.photo_mime_type, e.photo_taille_octets,
  -- suivi du compte applicatif
  e.compte_active_at, e.invitation_envoyee_at, e.invitation_canal, e.application_installee_at,
  e.premiere_connexion_at, e.derniere_connexion_at, e.compte_application_statut,
  e.compte_application_ouvert_at, e.compte_application_ferme_at,
  e.code_stock_active, e.code_stock_modifie_at, e.signature_at,
  -- secrets et fichiers : gestionnaire ou soi-même
  case when g.gere or g.soi then e.numero_inscription end as numero_inscription,
  case when g.gere or g.soi then e.carte_btp_storage_path end as carte_btp_storage_path,
  case when g.gere or g.soi then e.carte_btp_nom end as carte_btp_nom,
  case when g.gere or g.soi then e.carte_btp_mime_type end as carte_btp_mime_type,
  case when g.gere or g.soi then e.carte_btp_taille_octets end as carte_btp_taille_octets,
  case when g.gere or g.soi then e.signature_storage_path end as signature_storage_path,
  -- note managériale : gestionnaire uniquement (pas même le salarié concerné, qui y accède
  -- par la procédure de droit d'accès RGPD, pas par l'écran)
  case when g.gere then e.notes end as notes
from public.employes e
cross join lateral (
  select public.a_permission(e.entreprise_id, 'gerer_employes') as gere,
         public.a_permission(e.entreprise_id, 'acces_employes') as consulte,
         (e.utilisateur_id is not null and e.utilisateur_id = auth.uid()) as soi
) g
where public.est_membre_actif(e.entreprise_id)
  and (g.gere or g.consulte or g.soi);

comment on view public.employes_fiche is
  'Fiche salarié détaillée (20260928000701). Ligne : membre actif ET (acces_employes, gerer_employes ou sa propre fiche). Notes : gerer_employes. Numéro d''inscription, fichiers carte BTP/signature : gerer_employes ou soi-même. code_stock_hash jamais exposé. Écriture : toujours sur public.employes (policies role_gestion_*).';

revoke all on public.employes_fiche from public, anon, authenticated;
grant select on public.employes_fiche to authenticated;

-- employes_annuaire (20260922000312) reste la projection minimale d'annuaire ; ses colonnes
-- sont toutes accordées ci-dessus, elle fonctionne donc sans changement.
comment on view public.employes_annuaire is
  'Annuaire employés à colonnes réduites (identité + poste + statut). security_invoker : la RLS et les privilèges de colonne de public.employes s''appliquent. Pour la fiche détaillée : employes_fiche (20260928000701).';

-- ---------------------------------------------------------------------------
-- 3. Écritures réservées à gerer_employes (alignées sur les Server Actions)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['habilitations_employe', 'employes_cout_horaire', 'employes_taux_facture'] loop
    execute format('drop policy if exists role_gestion_insert on public.%I', t);
    execute format('drop policy if exists role_gestion_update on public.%I', t);
    execute format('drop policy if exists role_gestion_delete on public.%I', t);
    execute format('create policy role_gestion_insert on public.%I as restrictive for insert to authenticated with check (public.a_permission(entreprise_id, %L))', t, 'gerer_employes');
    execute format('create policy role_gestion_update on public.%I as restrictive for update to authenticated using (public.a_permission(entreprise_id, %L)) with check (public.a_permission(entreprise_id, %L))', t, 'gerer_employes', 'gerer_employes');
    execute format('create policy role_gestion_delete on public.%I as restrictive for delete to authenticated using (public.a_permission(entreprise_id, %L))', t, 'gerer_employes');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Export RGPD d'entreprise : pas de contournement des restrictions d'écran
-- ---------------------------------------------------------------------------
-- Section → condition de lecture (miroir des policies SELECT des tables concernées).
create or replace function public.export_rgpd_section_autorisee(p_entreprise_id uuid, p_table text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_table in ('profils_paie_employes', 'pieces_jointes_paie') then
      public.a_permission(p_entreprise_id, 'voir_paie_confidentielle') or public.a_permission(p_entreprise_id, 'gerer_paie')
    when p_table in ('bulletins_paie') then
      public.a_permission(p_entreprise_id, 'gerer_paie')
    when p_table in ('dossiers_paie_salaries', 'absences_paie', 'anomalies_paie', 'deductions_paie',
                     'indemnites_deplacement_paie', 'primes_paie', 'regularisations_paie',
                     'temps_travail_paie', 'validations_paie', 'journal_audit_paie', 'periodes_paie') then
      public.peut_gerer_paie(p_entreprise_id) or public.a_permission(p_entreprise_id, 'exporter_paie')
    when p_table in ('coordonnees_bancaires') then
      public.a_permission(p_entreprise_id, 'gerer_coordonnees_bancaires') or public.a_permission(p_entreprise_id, 'valider_virements')
    when p_table in ('ordres_virements', 'lots_virements', 'journal_paiements_bancaires', 'connexions_bancaires') then
      public.a_permission(p_entreprise_id, 'acces_paiements_bancaires')
    when p_table in ('employes_cout_horaire') then
      public.a_permission(p_entreprise_id, 'voir_cout_interne_employe') or public.a_permission(p_entreprise_id, 'acces_rentabilite')
    when p_table in ('employes_taux_facture') then
      public.a_permission(p_entreprise_id, 'voir_taux_facture_employe')
    else true
  end;
$$;
revoke all on function public.export_rgpd_section_autorisee(uuid, text) from public, anon, authenticated;

create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_table text;
  v_predicat text;
  v_sensibles text[];
  v_rows jsonb;
  v_donnees jsonb := '{}'::jsonb;
  v_restreintes text[] := '{}';
  -- Colonnes de la fiche salarié retirées de l'export si l'appelant n'a pas gerer_employes
  -- (mêmes colonnes que celles fermées à la lecture directe par 20260928000701).
  v_employes_prives constant text[] := array[
    'email', 'telephone', 'notes', 'numero_inscription', 'identifiant_interne',
    'carte_btp_storage_path', 'carte_btp_nom', 'carte_btp_mime_type', 'carte_btp_taille_octets',
    'carte_btp_numero', 'carte_btp_expiration', 'signature_storage_path'];
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;

  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'entreprise_id'
      and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    if not public.export_rgpd_section_autorisee(p_entreprise_id, v_table) then
      v_restreintes := v_restreintes || v_table;
      continue;
    end if;

    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

    if v_table = 'employes' and not public.a_permission(p_entreprise_id, 'gerer_employes') then
      v_sensibles := v_sensibles || v_employes_prives;
      v_restreintes := v_restreintes || 'employes.donnees_personnelles'::text;
    end if;

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from public.%I x where x.entreprise_id = $1',
      v_table
    ) into v_rows using p_entreprise_id, v_sensibles;

    if jsonb_array_length(v_rows) > 0 then
      v_donnees := v_donnees || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;

  -- V3 (20260926000505) : tables enfants SANS colonne entreprise_id, rattachées au tenant
  -- par leur parent. Liste EXPLICITE (pas de découverte automatique par clé étrangère :
  -- elle entraînerait des tables d'autres domaines, p. ex. Réserves, ou plateforme).
  -- Une table enfant qui recevrait plus tard sa propre colonne entreprise_id est déjà
  -- couverte par la boucle générique ci-dessus : elle est alors ignorée ici.
  for v_table, v_predicat in
    select e.enfant,
           string_agg(format('x.%I in (select p.id from public.%I p where p.entreprise_id = $1)', e.fk, e.parent), ' or '
                      order by e.fk)
      from (values
              ('lignes_avenants',          'avenant_id',  'avenants'),
              ('contacts_clients',         'client_id',   'clients'),
              ('paiements',                'facture_id',  'factures'),
              ('taches',                   'chantier_id', 'chantiers'),
              ('taches',                   'devis_id',    'devis'),
              ('chantier_transferts',      'chantier_id', 'chantiers'),
              ('boutique_lignes_commande', 'commande_id', 'boutique_commandes')
           ) as e(enfant, fk, parent)
     where to_regclass(format('public.%I', e.enfant)) is not null
       and to_regclass(format('public.%I', e.parent)) is not null
       and not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = e.enfant and c.column_name = 'entreprise_id')
     group by e.enfant
     order by e.enfant
  loop
    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2 order by x.id), ''[]''::jsonb) from public.%I x where %s',
      v_table, v_predicat
    ) into v_rows using p_entreprise_id, v_sensibles;

    if jsonb_array_length(v_rows) > 0 then
      v_donnees := v_donnees || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;

  select coalesce(array_agg(column_name), '{}') into v_sensibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'entreprises'
     and column_name ~* 'mot_de_passe|password|secret|token|hash';
  execute 'select coalesce(jsonb_agg(to_jsonb(e) - $2), ''[]''::jsonb) from public.entreprises e where e.id = $1'
    into v_rows using p_entreprise_id, v_sensibles;
  v_donnees := v_donnees || jsonb_build_object('entreprise', v_rows);

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'export_rgpd', 'entreprise',
          case when cardinality(v_restreintes) = 0 then 'Export RGPD des données'
               else 'Export RGPD des données (sections restreintes : ' || array_to_string(v_restreintes, ', ') || ')' end);

  return jsonb_build_object(
    'genere_le', now(),
    'entreprise_id', p_entreprise_id,
    'donnees', v_donnees,
    'sections_restreintes', to_jsonb(v_restreintes),
    'manifeste_fichiers', jsonb_build_object(
      'politique_inclusion', 'Fichiers métier stockés pour cette entreprise ou ses salariés (devis, chantiers, notes de frais, bulletins de paie, cartes BTP). Exclut : exports déjà dérivés, preuves de pointage biométriques/GPS, assets plateforme, catalogues partagés.',
      -- Même règle pour le manifeste : pas de bulletin de paie ni de fichier de carte BTP
      -- listé à un appelant qui ne peut pas lire la section correspondante.
      'fichiers', (
        select coalesce(jsonb_agg(f), '[]'::jsonb)
          from jsonb_array_elements(public.manifeste_fichiers_entreprise(p_entreprise_id)) f
         where public.export_rgpd_section_autorisee(p_entreprise_id, split_part(f ->> 'table', '.', 1))
           and (f ->> 'table' not like 'employes.%' or public.a_permission(p_entreprise_id, 'gerer_employes'))
      )
    )
  );
end; $function$;

notify pgrst, 'reload schema';
