-- ELSATIA — Train canonique V9 : convergence Export RGPD (V6) × Employés (V8).
--
-- Conflit sémantique révélé par la qualification V9 (pgTAP employes_donnees_personnelles_acces_v1,
-- tests 50-54 et 56 : 6 échecs ; sans conflit textuel, la fusion git ne pouvait pas le voir) :
-- la migration RGPD data export V1 (20261002001201, lot basé sur le train V6) redéfinit
-- public.exporter_donnees_entreprise à partir du corps V3 (20260926000505). Elle ÉCRASAIT la
-- redéfinition V8 du lot Employés (20260928000806) : l'export JSON d'un administrateur sans
-- droit RH réexposait les profils de paie (NIR), les coordonnées bancaires, le coût interne,
-- les notes RH et les numéros d'inscription, et ne déclarait plus les sections retirées.
--
-- Résolution (aucune règle assouplie) : corps V8 (0806) repris À L'IDENTIQUE, plus l'unique
-- apport du lot RGPD sur cette fonction : refus d'une session d'assistance plateforme
-- (est_acces_support_actif). Signature, propriétaire, SECURITY DEFINER, search_path et
-- droits (EXECUTE : authenticated) inchangés. Aucune autre fonction du lot RGPD n'est
-- concernée (contrôle : seule fonction redéfinie aussi par V7 / V8 / V9).

create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- RGPD DATA EXPORT V1 (20261002001201) : a_permission accepte une session d'assistance
  -- plateforme ; une telle session ne télécharge jamais l'intégralité des données d'un client.
  if public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Accès refusé' using errcode = '42501';
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

revoke all on function public.exporter_donnees_entreprise(uuid) from public, anon;
grant execute on function public.exporter_donnees_entreprise(uuid) to authenticated;
