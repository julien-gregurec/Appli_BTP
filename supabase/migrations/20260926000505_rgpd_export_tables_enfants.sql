-- RGPD — export complet des données d'une entreprise : tables enfants sans entreprise_id.
-- Train canonique V3. Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE.md (§4).
--
-- Constat (rapport ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1 §12, vérifié sur le train V3) :
-- `exporter_donnees_entreprise` (20260922000310) ne parcourt que les tables qui portent une
-- colonne `entreprise_id`. Les tables enfants rattachées au tenant par leur parent sont donc
-- ABSENTES de l'export (droit d'accès art. 15, portabilité art. 20, restitution CGV 10.1) :
--   - lignes_avenants          (→ avenants)           : le contenu même d'un avenant accepté ;
--   - contacts_clients         (→ clients)            : nom, fonction, e-mail, téléphone ;
--   - paiements                (→ factures)           : encaissements ;
--   - taches                   (→ chantiers, devis)   : planification ;
--   - chantier_transferts      (→ chantiers)          : historique client d'un chantier ;
--   - boutique_lignes_commande (→ boutique_commandes) : lignes des commandes Boutique.
-- Correctif : même fonction, même contrôle de droit (gerer_parametres), même filtrage des
-- colonnes sensibles, même clé par table ; ajout d'une liste explicite de tables enfants.
-- Corps identique à 20260922000310 hors du bloc « V3 ».

create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_predicat text;
  v_sensibles text[];
  v_rows jsonb;
  v_donnees jsonb := '{}'::jsonb;
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
    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

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
  values (p_entreprise_id, auth.uid(), 'export_rgpd', 'entreprise', 'Export RGPD des données');

  return jsonb_build_object(
    'genere_le', now(),
    'entreprise_id', p_entreprise_id,
    'donnees', v_donnees,
    'manifeste_fichiers', jsonb_build_object(
      'politique_inclusion', 'Fichiers métier stockés pour cette entreprise ou ses salariés (devis, chantiers, notes de frais, bulletins de paie, cartes BTP). Exclut : exports déjà dérivés, preuves de pointage biométriques/GPS, assets plateforme, catalogues partagés.',
      'fichiers', public.manifeste_fichiers_entreprise(p_entreprise_id)
    )
  );
end; $$;
revoke all on function public.exporter_donnees_entreprise(uuid) from public, anon;
grant execute on function public.exporter_donnees_entreprise(uuid) to authenticated;

notify pgrst, 'reload schema';
