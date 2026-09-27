-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 4 — CAPTURE TERRAIN PHOTO & MÉDIAS V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md
--
-- Strictement ADDITIF par rapport à 601–604 (aucune ligne existante invalidée, aucune donnée migrée) :
--   1. `tools_releves_medias.metadata` : métadonnées de preuve d'une photo (date, heure, orientation,
--      dimensions, source, compression, empreinte SHA-256, lignée de remplacement). Liste de clés
--      FERMÉE : aucune géolocalisation ne peut être stockée. Défaut '{}' (lignes antérieures valides).
--      L'auteur n'est pas déclaratif : c'est `created_by`, imposé par le trigger d'écriture.
--   2. Immuabilité d'un média déposé (catégorie, chemin, type, taille, métadonnées) : seule la
--      suppression douce (et le nom affiché) peut évoluer. La preuve ne se réécrit pas.
--   3. Validateur d'éléments (604) complété : `photo_anchor.ordre`, `photo_anchor.reperes` (repères
--      x/y normalisés, objet lié, libellé, ordre), ancre `plan` (point du plan futur, x/y ∈ [0, 1]),
--      géométrie d'annotation sur photo (`espace = 'photo'` : texte, flèche, cercle).
--   4. RPC SECURITY INVOKER (donc sous RLS) `tools_releve_retirer_photo` et
--      `tools_releve_remplacer_photo` : retrait / remplacement atomiques (média + ancres + annotations).
--   5. Policy Storage DELETE : en plus de `delete` sur le relevé, l'auteur d'un dépôt (`owner`) peut
--      supprimer SON fichier tant qu'il peut écrire dans le relevé.
--   6. RGPD : `manifeste_fichiers_entreprise` inclut le bucket `tools-releves` (reste à faire du Lot 2, D5).
-- Miroir TypeScript : packages/releve-domain/src/{media,photo,validation,media-service}.ts (parité testée).

-- ── 1. Métadonnées de photo ─────────────────────────────────────────────────
-- Entier JSON facultatif borné (absent ou null admis).
create or replace function public.tools_releve_entier_facultatif_valide(p_valeur jsonb, p_min numeric, p_max numeric)
returns boolean language sql immutable set search_path = public as $$
  select p_valeur is null or jsonb_typeof(p_valeur) = 'null'
    or (jsonb_typeof(p_valeur) = 'number' and (p_valeur #>> '{}')::numeric = trunc((p_valeur #>> '{}')::numeric)
        and (p_valeur #>> '{}')::numeric between p_min and p_max);
$$;

create or replace function public.tools_releve_media_metadata_valide(p_metadata jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p_metadata) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(p_metadata) k
      where k not in ('source','priseLe','priseLeSource','orientation','orientationExif','largeurPx','hauteurPx',
                      'largeurOriginePx','hauteurOriginePx','tailleOrigineOctets','compressionQualite','compressionCoteMaxPx',
                      'empreinteSha256','gpsRetire','remplaceMediaId')
    )
    and (p_metadata = '{}'::jsonb or (
      p_metadata->>'source' in ('camera_web','camera_appareil','import')
      and (coalesce(jsonb_typeof(p_metadata->'priseLe'), 'null') = 'null'
           or (jsonb_typeof(p_metadata->'priseLe') = 'string' and char_length(p_metadata->>'priseLe') <= 40
               and p_metadata->>'priseLe' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}'))
      and (coalesce(jsonb_typeof(p_metadata->'priseLeSource'), 'null') = 'null' or p_metadata->>'priseLeSource' in ('exif','capture','fichier'))
      and p_metadata->>'orientation' in ('portrait','paysage','carre')
      and jsonb_typeof(p_metadata->'largeurPx') = 'number' and jsonb_typeof(p_metadata->'hauteurPx') = 'number'
      and public.tools_releve_entier_facultatif_valide(p_metadata->'orientationExif', 1, 8)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'largeurPx', 1, 20000)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'hauteurPx', 1, 20000)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'largeurOriginePx', 1, 100000)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'hauteurOriginePx', 1, 100000)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'tailleOrigineOctets', 1, 524288000)
      and public.tools_releve_entier_facultatif_valide(p_metadata->'compressionCoteMaxPx', 256, 20000)
      and (coalesce(jsonb_typeof(p_metadata->'compressionQualite'), 'null') = 'null'
           or (jsonb_typeof(p_metadata->'compressionQualite') = 'number' and (p_metadata->>'compressionQualite')::numeric between 0.3 and 1))
      and coalesce(p_metadata->>'empreinteSha256', '') ~ '^[0-9a-f]{64}$'
      and (p_metadata->'gpsRetire' is null or jsonb_typeof(p_metadata->'gpsRetire') = 'boolean')
      and public.tools_releve_uuid_facultatif_valide(p_metadata->'remplaceMediaId')
    )), false);
$$;

alter table public.tools_releves_medias
  add column metadata jsonb not null default '{}'::jsonb;
alter table public.tools_releves_medias
  add constraint tools_releves_medias_metadata_valide check (
    public.tools_releve_media_metadata_valide(metadata) and char_length(metadata::text) <= 4000
  );
comment on column public.tools_releves_medias.metadata is
  'Lot 4 : métadonnées de preuve (date, heure, orientation, dimensions, source, compression, SHA-256, lignée). Jamais de géolocalisation. Immuable.';

-- ── 2. Immuabilité d'un média déposé ────────────────────────────────────────
create or replace function public.tools_releve_media_immuable()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.categorie is distinct from old.categorie or new.storage_path is distinct from old.storage_path
     or new.mime_type is distinct from old.mime_type or new.taille_octets is distinct from old.taille_octets
     or new.metadata is distinct from old.metadata then
    raise exception 'Un média déposé est immuable : déposez un nouveau fichier (remplacement)' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.tools_releve_media_immuable() from public, anon, authenticated;
create trigger tools_releves_medias_immuable before update on public.tools_releves_medias
  for each row execute function public.tools_releve_media_immuable();

-- ── 3. Validateur d'éléments : repères, ancre plan, annotations sur photo ────
create or replace function public.tools_releve_nombre_unitaire(p_valeur jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p_valeur) = 'number' and (p_valeur #>> '{}')::numeric between 0 and 1, false);
$$;

-- Ancre : les formes antérieures (point, entite, objet libre) restent admises telles quelles ;
-- la forme `plan` (Lot 4) est contrôlée.
create or replace function public.tools_releve_ancre_valide(p_ancre jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce(jsonb_typeof(p_ancre) = 'object' and (
    p_ancre->>'kind' is distinct from 'plan'
    or (coalesce(p_ancre->>'etageId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.tools_releve_nombre_unitaire(p_ancre->'x') and public.tools_releve_nombre_unitaire(p_ancre->'y'))
  ), false);
$$;

create or replace function public.tools_releve_reperes_valides(p_reperes jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_reperes is null or coalesce(jsonb_typeof(p_reperes) = 'array' and jsonb_array_length(p_reperes) <= 50
    and not exists (
      select 1 from jsonb_array_elements(p_reperes) r
      where not coalesce(
        jsonb_typeof(r) = 'object'
        and coalesce(r->>'id', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and public.tools_releve_nombre_unitaire(r->'x') and public.tools_releve_nombre_unitaire(r->'y')
        and jsonb_typeof(r->'label') = 'string' and btrim(r->>'label') <> '' and char_length(r->>'label') <= 120
        and public.tools_releve_entier_facultatif_valide(r->'ordre', 0, 10000) and jsonb_typeof(r->'ordre') = 'number'
        and (coalesce(jsonb_typeof(r->'cible'), 'null') = 'null' or jsonb_typeof(r->'cible') = 'object'), false)
    )
    and (select count(distinct r->>'id') = count(*) from jsonb_array_elements(p_reperes) r), false);
$$;

-- Géométrie d'annotation dessinée sur une photo (`espace = 'photo'`) ; les autres géométries
-- (plan, contrat ouvert de 604) sont inchangées.
create or replace function public.tools_releve_geometrie_photo_valide(p_forme text, p_geometrie jsonb)
returns boolean language sql immutable set search_path = public as $$
  select p_geometrie is null or jsonb_typeof(p_geometrie) <> 'object' or p_geometrie->>'espace' is distinct from 'photo'
    or coalesce(
      (p_geometrie->'couleur' is null or p_geometrie->>'couleur' in ('rouge','jaune','bleu','blanc'))
      and case coalesce(p_forme, 'texte')
        when 'texte' then public.tools_releve_nombre_unitaire(p_geometrie->'x') and public.tools_releve_nombre_unitaire(p_geometrie->'y')
        when 'fleche' then public.tools_releve_nombre_unitaire(p_geometrie->'x1') and public.tools_releve_nombre_unitaire(p_geometrie->'y1')
          and public.tools_releve_nombre_unitaire(p_geometrie->'x2') and public.tools_releve_nombre_unitaire(p_geometrie->'y2')
        when 'cercle' then public.tools_releve_nombre_unitaire(p_geometrie->'cx') and public.tools_releve_nombre_unitaire(p_geometrie->'cy')
          and public.tools_releve_nombre_unitaire(p_geometrie->'r') and (p_geometrie->>'r')::numeric > 0
        else false end, false);
$$;

create or replace function public.tools_releve_element_donnees_valides(p_type text, p_donnees jsonb)
returns boolean language sql immutable set search_path = public as $$
  -- `coalesce(…, false)` : une clé absente rend l'expression NULL, qu'un CHECK accepterait.
  select coalesce(jsonb_typeof(p_donnees) = 'object' and case p_type
    when 'mur' then jsonb_typeof(p_donnees->'a') = 'object' and jsonb_typeof(p_donnees->'b') = 'object'
      and jsonb_typeof(p_donnees->'a'->'x') = 'number' and jsonb_typeof(p_donnees->'a'->'y') = 'number'
      and jsonb_typeof(p_donnees->'b'->'x') = 'number' and jsonb_typeof(p_donnees->'b'->'y') = 'number'
      and jsonb_typeof(p_donnees->'epaisseurMm') = 'number' and (p_donnees->>'epaisseurMm')::numeric > 0
      and p_donnees->>'typeMur' in ('exterieur','porteur','cloison','doublage')
      and public.tools_releve_liste_uuid_valide(p_donnees->'piecesAdjacentesIds', 50)
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'materiauId')
    when 'ouverture' then jsonb_typeof(p_donnees->'decalageMm') = 'number' and (p_donnees->>'decalageMm')::numeric >= 0
      and jsonb_typeof(p_donnees->'largeurMm') = 'number' and (p_donnees->>'largeurMm')::numeric > 0
      and jsonb_typeof(p_donnees->'hauteurMm') = 'number' and (p_donnees->>'hauteurMm')::numeric > 0
      and p_donnees->>'typeOuverture' in ('porte','fenetre','porte_fenetre','baie','tremie','passage')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'metadata')
    when 'equipement' then p_donnees->>'categorie' in ('mobilier','electricite','plomberie','cvc','eclairage','autre')
      and jsonb_typeof(p_donnees->'position') = 'object' and coalesce(btrim(p_donnees->>'libelle'), '') <> ''
    when 'mesure' then jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'typeMesure' in ('longueur','largeur','hauteur','diagonale','distance','angle','surface','volume')
      and p_donnees->>'unite' in ('mm','rad','mm2','mm3')
      and p_donnees->>'source' in ('manuel','calcule','laser','photo','ar','lidar')
      and jsonb_typeof(p_donnees->'cible') = 'object'
    when 'photo_anchor' then coalesce(p_donnees->>'mediaId', '') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_donnees->'ancre') = 'object'
      -- Lot 4
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_entier_facultatif_valide(p_donnees->'ordre', 0, 10000)
      and public.tools_releve_reperes_valides(p_donnees->'reperes')
    when 'annotation' then jsonb_typeof(p_donnees->'ancre') = 'object'
      and (p_donnees->'forme' is null or jsonb_typeof(p_donnees->'forme') = 'null'
           or p_donnees->>'forme' in ('texte','fleche','cercle','zone','cote','symbole','commentaire'))
      and jsonb_typeof(p_donnees->'texte') = 'string' and char_length(p_donnees->>'texte') <= 2000
      and (coalesce(p_donnees->>'forme', 'texte') not in ('texte','commentaire') or btrim(p_donnees->>'texte') <> '')
      and public.tools_releve_objet_facultatif_valide(p_donnees->'geometrie')
      -- Lot 4
      and public.tools_releve_ancre_valide(p_donnees->'ancre')
      and public.tools_releve_geometrie_photo_valide(p_donnees->>'forme', p_donnees->'geometrie')
    when 'materiau' then coalesce(btrim(p_donnees->>'libelle'), '') <> ''
      and p_donnees->>'categorie' in ('sol','mur','plafond','plinthe','menuiserie','autre')
      and p_donnees->>'unite' in ('m2','ml','m3','u')
      and (p_donnees->'revetement' is null or jsonb_typeof(p_donnees->'revetement') = 'null'
           or p_donnees->>'revetement' in ('peinture','carrelage','faience','parquet','stratifie','moquette','pvc','panneau_decoratif','papier_peint','enduit','beton','autre'))
    when 'quantite' then coalesce(btrim(p_donnees->>'cle'), '') <> '' and coalesce(btrim(p_donnees->>'formule'), '') <> ''
      and jsonb_typeof(p_donnees->'valeur') = 'number' and (p_donnees->>'valeur')::numeric >= 0
      and p_donnees->>'unite' in ('m2','ml','m3','u') and p_donnees->>'qualite' in ('exacte','estimee')
      and (p_donnees->'sources' is null or (jsonb_typeof(p_donnees->'sources') = 'array'
           and jsonb_array_length(p_donnees->'sources') <= 50
           and not exists (select 1 from jsonb_array_elements(p_donnees->'sources') s where jsonb_typeof(s) <> 'object')))
      and public.tools_releve_uuid_facultatif_valide(p_donnees->'gpOuvrageRef')
    else false
  end, false);
$$;

-- ── 4. Retrait et remplacement atomiques (SECURITY INVOKER : la RLS s'applique) ──
-- Retire une photo : le média, les PhotoAnchor qui la portent et les annotations dessinées
-- dessus. Renvoie le chemin du fichier, que le client supprime s'il en a le droit (policy 5).
create or replace function public.tools_releve_retirer_photo(p_media_id uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare v_releve uuid; v_chemin text; v_ancres uuid[];
begin
  update public.tools_releves_medias set deleted_at = now()
   where id = p_media_id and categorie = 'photos' and deleted_at is null
  returning releve_id, storage_path into v_releve, v_chemin;
  if v_releve is null then raise exception 'Photo introuvable ou non modifiable' using errcode = 'P0002'; end if;
  with retirees as (
    update public.tools_releves_elements set deleted_at = now()
     where releve_id = v_releve and type = 'photo_anchor' and deleted_at is null and donnees->>'mediaId' = p_media_id::text
    returning id
  ) select coalesce(array_agg(id), '{}') into v_ancres from retirees;
  update public.tools_releves_elements set deleted_at = now()
   where releve_id = v_releve and type = 'annotation' and deleted_at is null
     and donnees->'geometrie'->>'espace' = 'photo' and donnees->'ancre'->'ref'->>'kind' = 'element'
     and (donnees->'ancre'->'ref'->>'id')::uuid = any(v_ancres);
  return v_chemin;
end;
$$;

-- Remplace une photo par une autre DÉJÀ déposée dans le même relevé : les ancres pointent sur la
-- nouvelle (repères remis à zéro), les annotations de l'ancienne image sont retirées, l'ancienne
-- photo est retirée. Renvoie le chemin de l'ancien fichier.
create or replace function public.tools_releve_remplacer_photo(p_ancien uuid, p_nouveau uuid)
returns text language plpgsql security invoker set search_path = public as $$
declare v_releve uuid; v_chemin text; v_ancres uuid[];
begin
  if p_ancien = p_nouveau then raise exception 'Une photo ne se remplace pas par elle-même' using errcode = '22023'; end if;
  select a.releve_id, a.storage_path into v_releve, v_chemin
    from public.tools_releves_medias a join public.tools_releves_medias n on n.releve_id = a.releve_id
   where a.id = p_ancien and n.id = p_nouveau and a.categorie = 'photos' and n.categorie = 'photos'
     and a.deleted_at is null and n.deleted_at is null;
  if v_releve is null then raise exception 'Photos introuvables dans un même relevé' using errcode = 'P0002'; end if;
  with deplacees as (
    update public.tools_releves_elements
       set donnees = jsonb_set(donnees, '{mediaId}', to_jsonb(p_nouveau::text)) || '{"reperes": []}'::jsonb
     where releve_id = v_releve and type = 'photo_anchor' and deleted_at is null and donnees->>'mediaId' = p_ancien::text
    returning id
  ) select coalesce(array_agg(id), '{}') into v_ancres from deplacees;
  update public.tools_releves_elements set deleted_at = now()
   where releve_id = v_releve and type = 'annotation' and deleted_at is null
     and donnees->'geometrie'->>'espace' = 'photo' and donnees->'ancre'->'ref'->>'kind' = 'element'
     and (donnees->'ancre'->'ref'->>'id')::uuid = any(v_ancres);
  update public.tools_releves_medias set deleted_at = now() where id = p_ancien;
  return v_chemin;
end;
$$;

-- ── 5. Storage : l'auteur d'un dépôt peut supprimer son propre fichier ─────────
drop policy if exists tools_releves_storage_delete on storage.objects;
create policy tools_releves_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tools-releves' and (
    public.tools_releve_storage_autorise(name, 'suppression')
    or (owner = auth.uid() and public.tools_releve_storage_autorise(name, 'ecriture'))
  ));

-- ── 6. RGPD : manifeste de fichiers étendu au bucket `tools-releves` ──────────
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
    union all
    -- Lot 4 Relevé & Métré : photos et fichiers du bucket privé `tools-releves`, y compris
    -- ceux d'un média retiré (suppression douce) dont le fichier n'est pas encore purgé.
    select jsonb_build_object(
      'table', 'tools_releves_medias', 'bucket', 'tools-releves', 'id', m.id,
      'storage_path', m.storage_path, 'nom_fichier', m.nom_fichier,
      'mime_type', m.mime_type, 'taille_octets', m.taille_octets,
      'proprietaire', jsonb_build_object('type', 'releve', 'id', m.releve_id),
      'created_at', m.created_at
    )
    from public.tools_releves_medias m where m.entreprise_id = p_entreprise_id
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

-- ── Droits ──────────────────────────────────────────────────────────────────
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.tools_releve_media_metadata_valide(jsonb)',
    'public.tools_releve_entier_facultatif_valide(jsonb,numeric,numeric)',
    'public.tools_releve_nombre_unitaire(jsonb)',
    'public.tools_releve_ancre_valide(jsonb)',
    'public.tools_releve_reperes_valides(jsonb)',
    'public.tools_releve_geometrie_photo_valide(text,jsonb)',
    'public.tools_releve_retirer_photo(uuid)',
    'public.tools_releve_remplacer_photo(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
