-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 4 — CAPTURE TERRAIN PHOTO & MÉDIAS V1
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md
--
-- Posée APRÈS le Lot 3 (20260927000701). Reprise du travail Lot 4 commencé sur le Lot 2 (ex-605,
-- jamais appliquée ailleurs) puis adaptée à la hiérarchie terrain du Lot 3 (§7 à §10).
--
-- Strictement ADDITIF par rapport à 601–701 (aucune ligne existante invalidée, aucune donnée migrée) :
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
--   7. Colonnes Lot 4 sur la hiérarchie Lot 3 : commentaire de photo (distinct des annotations),
--      état documenté (initial / corrige / projete / as_built), version de référence au dépôt
--      (imposée par le serveur), miniature ; une photo identique (même SHA-256) n'est déposée
--      qu'une fois par relevé.
--   8. Intégrité des rattachements : un PhotoAnchor désigne une cible ACTIVE du même relevé
--      (relevé, chantier, bâtiment, étage, zone, pièce, mur, équipement, point du plan) et ses
--      colonnes etage_id / piece_id sont exactement celles de la cible ; une annotation sur photo
--      est portée par un PhotoAnchor actif. Aucun rattachement générique ambigu.
--   9. Cascade : la suppression douce (et la restauration) d'un chantier, bâtiment, zone, mur,
--      équipement ou PhotoAnchor emporte les rattachements / annotations qui en dépendent
--      (étage et pièce : cascade existante par etage_id / piece_id).
--  10. Versions : un fichier photo référencé par une version figée ne peut plus être supprimé
--      physiquement par un utilisateur (seule la purge RGPD service_role le supprime).
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
     or new.metadata is distinct from old.metadata
     or to_jsonb(new)->'version_reference_id' is distinct from to_jsonb(old)->'version_reference_id'
     or to_jsonb(new)->'miniature_storage_path' is distinct from to_jsonb(old)->'miniature_storage_path' then
    raise exception 'Un média déposé est immuable : déposez un nouveau fichier (remplacement)' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.tools_releve_media_immuable() from public, anon, authenticated;
create trigger tools_releves_medias_immuable before update on public.tools_releves_medias
  for each row execute function public.tools_releve_media_immuable();

-- ── 2 bis. Colonnes Lot 4 sur la hiérarchie du Lot 3 (§7) ─────────────────────
-- commentaire     : note libre sur la photo (≠ annotation graphique), modifiable, journalisée
--                   (nom du champ seulement, jamais le contenu) ;
-- etat_documente  : état du bâtiment que la photo documente (existant = 'initial', corrigé,
--                   projeté, tel que construit) — base de la future comparaison de versions ;
-- version_reference_id : dernière version figée au moment du dépôt (la photo appartient à
--                   l'état qui la suit), IMPOSÉE par le serveur, immuable ;
-- miniature_storage_path  : miniature JPEG (galerie), même dossier `photos`, immuable.
alter table public.tools_releves_medias
  add column commentaire text
    check (commentaire is null or (btrim(commentaire) <> '' and char_length(commentaire) <= 2000)),
  add column etat_documente text not null default 'initial'
    check (etat_documente in ('initial','corrige','projete','as_built')),
  add column version_reference_id uuid,
  add column miniature_storage_path text check (miniature_storage_path is null or char_length(miniature_storage_path) <= 300);
alter table public.tools_releves_medias
  add constraint tools_releves_medias_version_reference_fkey foreign key (version_reference_id, releve_id)
    references public.tools_releves_versions(id, releve_id) on delete set null (version_reference_id),
  add constraint tools_releves_medias_miniature_canonique check (
    miniature_storage_path is null or (categorie = 'photos' and miniature_storage_path <> storage_path
      and miniature_storage_path ~ ('^' || entreprise_id::text || '/' || releve_id::text
                            || '/photos/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$')));
create unique index tools_releves_medias_miniature_unique on public.tools_releves_medias (miniature_storage_path)
  where miniature_storage_path is not null;
-- Doublon : une même photo (mêmes octets déposés) n'est active qu'une fois par relevé.
create unique index tools_releves_medias_empreinte_unique
  on public.tools_releves_medias (releve_id, (metadata->>'empreinteSha256'))
  where deleted_at is null and categorie = 'photos' and metadata ? 'empreinteSha256';
create index tools_releves_medias_version_reference_idx on public.tools_releves_medias (version_reference_id)
  where version_reference_id is not null;
comment on column public.tools_releves_medias.commentaire is 'Lot 4 : commentaire de la photo (distinct des annotations graphiques).';
comment on column public.tools_releves_medias.etat_documente is 'Lot 4 : état documenté par la photo (initial, corrige, projete, as_built).';
comment on column public.tools_releves_medias.version_reference_id is 'Lot 4 : dernière version figée au dépôt (imposée par le serveur).';

create or replace function public.tools_releve_media_avant_insertion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Version de référence : jamais déclarative.
  new.version_reference_id := (select v.id from public.tools_releves_versions v
                                where v.releve_id = new.releve_id order by v.numero desc limit 1);
  -- Une miniature ne désigne jamais le fichier d'un autre média.
  if new.miniature_storage_path is not null and exists (
    select 1 from public.tools_releves_medias m
    where m.storage_path = new.miniature_storage_path or m.miniature_storage_path = new.miniature_storage_path
  ) then
    raise exception 'Miniature déjà utilisée' using errcode = '23505';
  end if;
  if exists (select 1 from public.tools_releves_medias m where m.miniature_storage_path = new.storage_path) then
    raise exception 'Chemin déjà utilisé' using errcode = '23505';
  end if;
  return new;
end;
$$;
revoke all on function public.tools_releve_media_avant_insertion() from public, anon, authenticated;
create trigger tools_releves_medias_avant_insertion before insert on public.tools_releves_medias
  for each row execute function public.tools_releve_media_avant_insertion();

-- ── 2 ter. Fichiers figés par une version (§10) ───────────────────────────────
-- Une version est un instantané immuable qui liste les médias actifs : leurs fichiers ne
-- doivent plus disparaître, sinon la version « casse ». Le retrait d'une telle photo reste
-- possible (suppression douce), mais le fichier est conservé ; seule la purge RGPD de
-- l'entreprise (service_role, hors RLS) le supprime.
create or replace function public.tools_releve_media_fige(p_media_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tools_releves_medias m
    join public.tools_releves_versions v on v.releve_id = m.releve_id
    where m.id = p_media_id and v.contenu->'medias' @> jsonb_build_array(jsonb_build_object('id', m.id))
  );
$$;

create or replace function public.tools_releve_fichier_fige(p_chemin text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tools_releves_medias m
    join public.tools_releves_versions v on v.releve_id = m.releve_id
    where (m.storage_path = p_chemin or m.miniature_storage_path = p_chemin)
      and v.contenu->'medias' @> jsonb_build_array(jsonb_build_object('id', m.id))
  );
$$;

-- ── 2 quater. Intégrité des rattachements sur la hiérarchie Lot 3 (§8) ────────
-- Cible d'un PhotoAnchor : active, du même relevé ; etage_id / piece_id = ceux de la cible.
-- Annotation dessinée sur une photo : portée par un PhotoAnchor actif, mêmes colonnes.
create or replace function public.tools_releve_rattachement_photo_garde()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ancre jsonb := new.donnees->'ancre';
  v_kind text; v_id uuid; v_etage uuid; v_piece uuid; v_trouve boolean := false; v_media record;
  v_support record;
begin
  if tg_op = 'UPDATE' and new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and new.donnees is not distinct from old.donnees and new.etage_id is not distinct from old.etage_id
     and new.piece_id is not distinct from old.piece_id and old.deleted_at is null then
    return new;
  end if;

  if new.type = 'photo_anchor' then
    select m.releve_id, m.categorie, m.deleted_at into v_media
      from public.tools_releves_medias m where m.id = (new.donnees->>'mediaId')::uuid;
    if not found or v_media.releve_id <> new.releve_id or v_media.categorie <> 'photos' then
      raise exception 'Photo introuvable dans ce relevé' using errcode = '23514';
    end if;
    if v_media.deleted_at is not null and (tg_op = 'INSERT' or old.deleted_at is null) then
      raise exception 'Photo retirée : restaurez-la d''abord' using errcode = '23514';
    end if;
    v_kind := coalesce(v_ancre->>'kind', '');
    if v_kind = 'plan' or v_kind = 'point' then
      v_id := (v_ancre->>'etageId')::uuid;
      select true, e.id, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves_etages e
       where e.id = v_id and e.releve_id = new.releve_id and e.deleted_at is null;
    elsif v_kind = 'entite' then
      v_kind := v_ancre->'ref'->>'kind';
      v_id := (v_ancre->'ref'->>'id')::uuid;
      case v_kind
        when 'releve' then
          select true, null::uuid, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves r
           where r.id = v_id and r.id = new.releve_id and r.deleted_at is null;
        when 'chantier' then
          select true, null::uuid, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves_chantiers c
           where c.id = v_id and c.releve_id = new.releve_id and c.deleted_at is null;
        when 'batiment' then
          select true, null::uuid, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves_batiments b
           where b.id = v_id and b.releve_id = new.releve_id and b.deleted_at is null;
        when 'etage' then
          select true, e.id, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves_etages e
           where e.id = v_id and e.releve_id = new.releve_id and e.deleted_at is null;
        when 'zone' then
          select true, z.etage_id, null::uuid into v_trouve, v_etage, v_piece from public.tools_releves_zones z
           where z.id = v_id and z.releve_id = new.releve_id and z.deleted_at is null;
        when 'piece' then
          select true, p.etage_id, p.id into v_trouve, v_etage, v_piece from public.tools_releves_pieces p
           where p.id = v_id and p.releve_id = new.releve_id and p.deleted_at is null;
        when 'element' then
          select true, x.etage_id, x.piece_id into v_trouve, v_etage, v_piece from public.tools_releves_elements x
           where x.id = v_id and x.releve_id = new.releve_id and x.deleted_at is null and x.type in ('mur','equipement');
        else v_trouve := false;
      end case;
    end if;
    if not coalesce(v_trouve, false) then
      raise exception 'Cible de la photo introuvable, retirée ou d''un autre relevé' using errcode = '23514';
    end if;
    if new.etage_id is distinct from v_etage or new.piece_id is distinct from v_piece then
      raise exception 'Rattachement incohérent : étage / pièce différents de ceux de la cible' using errcode = '23514';
    end if;
  elsif new.type = 'annotation' and new.donnees->'geometrie'->>'espace' = 'photo' then
    if v_ancre->>'kind' is distinct from 'entite' or v_ancre->'ref'->>'kind' is distinct from 'element' then
      raise exception 'Une annotation sur photo est portée par un rattachement photo' using errcode = '23514';
    end if;
    select x.etage_id, x.piece_id into v_support from public.tools_releves_elements x
     where x.id = (v_ancre->'ref'->>'id')::uuid and x.releve_id = new.releve_id and x.type = 'photo_anchor' and x.deleted_at is null;
    if not found then
      raise exception 'Rattachement photo introuvable ou retiré' using errcode = '23514';
    end if;
    if new.etage_id is distinct from v_support.etage_id or new.piece_id is distinct from v_support.piece_id then
      raise exception 'Annotation incohérente avec la photo annotée' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tools_releve_rattachement_photo_garde() from public, anon, authenticated;
create trigger tools_releves_elements_rattachement_photo before insert or update on public.tools_releves_elements
  for each row when (new.type in ('photo_anchor','annotation'))
  execute function public.tools_releve_rattachement_photo_garde();

-- ── 2 quinquies. Cascade des rattachements photo (§9) ─────────────────────────
-- Étage et pièce : cascade existante (etage_id / piece_id). Ici : chantier, bâtiment, zone,
-- mur / équipement → PhotoAnchor qui les désignent ; PhotoAnchor → annotations dessinées dessus.
-- Même règle que `tools_releve_cascade_suppression` : restauration des seuls descendants
-- supprimés par la même cascade (même horodatage).
create or replace function public.tools_releve_cascade_photos()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_supprime boolean := new.deleted_at is not null;
  -- Accès par jsonb : PL/pgSQL ne résout `new.type` que pour la table qui la possède.
  v_type text := to_jsonb(new)->>'type';
  v_kind text := case tg_table_name when 'tools_releves_chantiers' then 'chantier' when 'tools_releves_batiments' then 'batiment'
                                    when 'tools_releves_zones' then 'zone' else 'element' end;
begin
  if new.deleted_at is not distinct from old.deleted_at then return null; end if;
  if v_type = 'photo_anchor' then
    update public.tools_releves_elements set deleted_at = new.deleted_at
     where releve_id = new.releve_id and type = 'annotation' and donnees->'geometrie'->>'espace' = 'photo'
       and donnees->'ancre'->'ref'->>'kind' = 'element' and donnees->'ancre'->'ref'->>'id' = new.id::text
       and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
    return null;
  end if;
  if tg_table_name = 'tools_releves_elements' and v_type not in ('mur','equipement') then return null; end if;
  update public.tools_releves_elements set deleted_at = new.deleted_at
   where releve_id = new.releve_id and type = 'photo_anchor' and donnees->'ancre'->>'kind' = 'entite'
     and donnees->'ancre'->'ref'->>'kind' = v_kind and donnees->'ancre'->'ref'->>'id' = new.id::text
     and (case when v_supprime then deleted_at is null else deleted_at = old.deleted_at end);
  return null;
end;
$$;
revoke all on function public.tools_releve_cascade_photos() from public, anon, authenticated;
do $$
declare v_table text;
begin
  foreach v_table in array array['tools_releves_chantiers','tools_releves_batiments','tools_releves_zones','tools_releves_elements'] loop
    execute format('create trigger %I after update of deleted_at on public.%I for each row execute function public.tools_releve_cascade_photos()',
                   v_table || '_cascade_photos', v_table);
  end loop;
end $$;
create index tools_releves_elements_photo_media_idx on public.tools_releves_elements (releve_id, (donnees->>'mediaId'))
  where type = 'photo_anchor';

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
-- dessus (cascade §9). Renvoie les chemins du fichier et de sa miniature, et `fige` : vrai si
-- une version figée référence la photo (le fichier doit alors être conservé, §10).
create or replace function public.tools_releve_retirer_photo(p_media_id uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_releve uuid; v_chemin text; v_miniature text;
begin
  update public.tools_releves_medias set deleted_at = now()
   where id = p_media_id and categorie = 'photos' and deleted_at is null
  returning releve_id, storage_path, miniature_storage_path into v_releve, v_chemin, v_miniature;
  if v_releve is null then raise exception 'Photo introuvable ou non modifiable' using errcode = 'P0002'; end if;
  -- Les annotations suivent leur PhotoAnchor (trigger de cascade §9).
  update public.tools_releves_elements set deleted_at = now()
   where releve_id = v_releve and type = 'photo_anchor' and deleted_at is null and donnees->>'mediaId' = p_media_id::text;
  return jsonb_build_object('chemin', v_chemin, 'miniature', v_miniature, 'fige', public.tools_releve_media_fige(p_media_id));
end;
$$;

-- Remplace une photo par une autre DÉJÀ déposée dans le même relevé : les ancres pointent sur la
-- nouvelle (repères remis à zéro), les annotations de l'ancienne image sont retirées, l'ancienne
-- photo est retirée. Le commentaire est repris s'il n'y en a pas sur la nouvelle.
create or replace function public.tools_releve_remplacer_photo(p_ancien uuid, p_nouveau uuid)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare v_releve uuid; v_chemin text; v_miniature text; v_commentaire text; v_ancres uuid[];
begin
  if p_ancien = p_nouveau then raise exception 'Une photo ne se remplace pas par elle-même' using errcode = '22023'; end if;
  select a.releve_id, a.storage_path, a.miniature_storage_path, a.commentaire into v_releve, v_chemin, v_miniature, v_commentaire
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
  update public.tools_releves_medias set commentaire = coalesce(commentaire, v_commentaire) where id = p_nouveau and v_commentaire is not null;
  update public.tools_releves_medias set deleted_at = now() where id = p_ancien;
  return jsonb_build_object('chemin', v_chemin, 'miniature', v_miniature, 'fige', public.tools_releve_media_fige(p_ancien));
end;
$$;

-- ── 5. Storage : l'auteur d'un dépôt peut supprimer son propre fichier ─────────
-- (jamais un fichier figé par une version : §10, fonctions définies plus haut)
drop policy if exists tools_releves_storage_delete on storage.objects;
create policy tools_releves_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'tools-releves' and not public.tools_releve_fichier_fige(name) and (
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
    union all
    -- Miniatures des photos (même bucket, même propriétaire).
    select jsonb_build_object(
      'table', 'tools_releves_medias.miniature', 'bucket', 'tools-releves', 'id', m.id,
      'storage_path', m.miniature_storage_path, 'nom_fichier', null,
      'mime_type', 'image/jpeg', 'taille_octets', null,
      'proprietaire', jsonb_build_object('type', 'releve', 'id', m.releve_id),
      'created_at', m.created_at
    )
    from public.tools_releves_medias m where m.entreprise_id = p_entreprise_id and m.miniature_storage_path is not null
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
    'public.tools_releve_media_fige(uuid)',
    'public.tools_releve_fichier_fige(text)',
    'public.tools_releve_remplacer_photo(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';
