-- GP-EXTERNAL-PILOT-CLOSURE-V1 — ajoute un manifeste de fichiers à l'export
-- RGPD (art. 15 & 20 : droit d'accès et de portabilité, mission §11).
--
-- `exporter_donnees_entreprise` boucle déjà dynamiquement sur toute table
-- portant `entreprise_id`, donc les LIGNES (métadonnées) des tables porteuses
-- de fichiers (pieces_jointes_devis, documents_chantier, notes_frais,
-- bulletins_paie, employes.carte_btp_*/signature_*...) sont déjà présentes
-- dans l'export brut. Ce qui manque : un résumé dédié, lisible, qui répond
-- explicitement à « quels fichiers appartiennent à mon entreprise, où sont-ils
-- stockés, sous quel nom, avec quelle taille ». Pas un ZIP (hors périmètre de
-- cette nuit, cf. mission §11) : un inventaire — table, bucket, chemin de
-- stockage, nom, taille, date, et politique d'inclusion explicite.
--
-- Politique d'inclusion : les buckets couverts (devis-medias, chantier-
-- documents, notes-frais, bulletins-paie, documents-employes) contiennent des
-- fichiers métier appartenant à l'entreprise exportée ou à ses salariés ; ils
-- sont inclus. Sont explicitement EXCLUS de ce manifeste (cohérent avec les
-- exclusions déjà en place pour les colonnes) : les exports de notes de frais
-- déjà générés (bucket notes-frais-exports, dérivé, pas une donnée source),
-- les preuves de pointage biométriques/GPS (pointage-preuves, hors périmètre
-- du droit à la portabilité au sens strict, à confirmer en LEGAL REVIEW), les
-- assets plateforme (entreprise-assets, logos par défaut), et tout bucket ne
-- portant pas nommément l'entreprise (fiches-techniques catalogue partagé).
create or replace function public.manifeste_fichiers_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_fichiers jsonb;
begin
  select coalesce(jsonb_agg(f order by f ->> 'table', f ->> 'created_at'), '[]'::jsonb)
    into v_fichiers
  from (
    select jsonb_build_object(
      'table', 'pieces_jointes_devis', 'bucket', 'devis-medias', 'id', p.id,
      'storage_path', p.storage_path, 'nom_fichier', p.nom_original,
      'mime_type', p.mime_type, 'taille_octets', p.taille_octets,
      'proprietaire', jsonb_build_object('type', 'devis', 'id', p.devis_id),
      'created_at', p.created_at
    ) as f
    from public.pieces_jointes_devis p where p.entreprise_id = p_entreprise_id
    union all
    select jsonb_build_object(
      'table', 'documents_chantier', 'bucket', 'chantier-documents', 'id', d.id,
      'storage_path', d.storage_path, 'nom_fichier', d.nom,
      'mime_type', d.mime_type, 'taille_octets', d.taille_octets,
      'proprietaire', jsonb_build_object('type', 'chantier', 'id', d.chantier_id),
      'created_at', d.created_at
    )
    from public.documents_chantier d where d.entreprise_id = p_entreprise_id
    union all
    select jsonb_build_object(
      'table', 'notes_frais', 'bucket', 'notes-frais', 'id', n.id,
      'storage_path', n.justificatif_storage_path, 'nom_fichier', n.justificatif_nom,
      'mime_type', n.justificatif_mime_type, 'taille_octets', null,
      'proprietaire', jsonb_build_object('type', 'employe', 'id', n.employe_id),
      'created_at', n.created_at
    )
    from public.notes_frais n
    where n.entreprise_id = p_entreprise_id and n.justificatif_storage_path is not null
    union all
    select jsonb_build_object(
      'table', 'bulletins_paie', 'bucket', 'bulletins-paie', 'id', b.id,
      'storage_path', b.storage_path, 'nom_fichier', b.nom_fichier_original,
      'mime_type', b.type_mime, 'taille_octets', b.taille_octets,
      'proprietaire', jsonb_build_object('type', 'employe', 'id', b.employe_id),
      'created_at', b.importe_at
    )
    from public.bulletins_paie b where b.entreprise_id = p_entreprise_id
    union all
    select jsonb_build_object(
      'table', 'employes.carte_btp', 'bucket', 'documents-employes', 'id', e.id,
      'storage_path', e.carte_btp_storage_path, 'nom_fichier', e.carte_btp_nom,
      'mime_type', e.carte_btp_mime_type, 'taille_octets', e.carte_btp_taille_octets,
      'proprietaire', jsonb_build_object('type', 'employe', 'id', e.id),
      'created_at', e.created_at
    )
    from public.employes e
    where e.entreprise_id = p_entreprise_id and e.carte_btp_storage_path is not null
    union all
    select jsonb_build_object(
      'table', 'employes.signature', 'bucket', 'documents-employes', 'id', e.id,
      'storage_path', e.signature_storage_path, 'nom_fichier', null,
      'mime_type', null, 'taille_octets', null,
      'proprietaire', jsonb_build_object('type', 'employe', 'id', e.id),
      'created_at', e.created_at
    )
    from public.employes e
    where e.entreprise_id = p_entreprise_id and e.signature_storage_path is not null
  ) x;
  return v_fichiers;
exception
  -- Robuste aux évolutions de schéma (colonne renommée/retirée sur une
  -- installation plus ancienne ou plus récente) : un manifeste partiel ou vide
  -- ne doit jamais faire échouer l'export des DONNÉES, qui reste l'essentiel
  -- du droit à la portabilité.
  when undefined_column or undefined_table then
    return '[]'::jsonb;
end;
$$;

revoke all on function public.manifeste_fichiers_entreprise(uuid) from public, anon, authenticated;

create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
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

notify pgrst, 'reload schema';
