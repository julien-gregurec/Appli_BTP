-- GP V1 — bibliothèque d'articles et d'ouvrages (familles, favoris, codes distributeurs, images)
-- Intégré au ledger le 2026-09-12 (GP V1, lot 0) depuis supabase/proposed/gp-v1-metier-bibliotheque.sql.proposed, contenu inchangé.
-- Rejouable ; additif ; Fresh + Upgrade prouvés (docs/gp-v1, § 19).

do $$
begin
  if to_regclass('public.historique_objets') is null or to_regclass('public.catalogue_codes_fournisseurs') is null then
    raise exception 'Prérequis absent : appliquer d''abord gp-v1-metier-references-internes' using errcode = '55000';
  end if;
end $$;

create or replace function pg_temp.ajouter_contrainte(p_table regclass, p_nom text, p_definition text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = p_table and conname = p_nom) then
    execute format('alter table %s add constraint %I %s', p_table, p_nom, p_definition);
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Familles et sous-familles
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.catalogue_familles (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  parent_id     uuid,
  nom           text not null check (length(btrim(nom)) between 1 and 120),
  ordre         integer not null default 0,
  actif         boolean not null default true,
  cree_le       timestamptz not null default now(),
  unique (id, entreprise_id),
  foreign key (parent_id, entreprise_id) references public.catalogue_familles (id, entreprise_id) on delete restrict
);

-- Nom unique sous un même parent, sur la forme normalisée (« Plâtrerie » = « platrerie »).
create unique index if not exists catalogue_familles_nom_uniq
  on public.catalogue_familles (entreprise_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
                                public.normaliser_reference(nom));
create index if not exists catalogue_familles_arbre_idx on public.catalogue_familles (entreprise_id, parent_id, ordre, nom);

create or replace function public.trg_familles_deux_niveaux()
returns trigger language plpgsql set search_path = public as $$
begin
  new.nom := btrim(new.nom);
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Une famille ne peut pas être sa propre sous-famille.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.catalogue_familles p where p.id = new.parent_id and p.parent_id is not null) then
      raise exception 'Deux niveaux au plus : une famille, puis ses sous-familles.' using errcode = 'P0001';
    end if;
    if tg_op = 'UPDATE' and exists (select 1 from public.catalogue_familles e where e.parent_id = new.id) then
      raise exception 'Cette famille a des sous-familles : elle ne peut pas devenir elle-même une sous-famille.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists catalogue_familles_deux_niveaux on public.catalogue_familles;
create trigger catalogue_familles_deux_niveaux
  before insert or update of parent_id, nom on public.catalogue_familles
  for each row execute function public.trg_familles_deux_niveaux();

-- Libellé affiché et recherché : « Famille » ou « Famille › Sous-famille ».
create or replace function public.libelle_famille(p_famille_id uuid)
returns text language sql stable set search_path = public as $$
  select case when p.id is null then f.nom else p.nom || ' › ' || f.nom end
  from public.catalogue_familles f
  left join public.catalogue_familles p on p.id = f.parent_id
  where f.id = p_famille_id
$$;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Colonnes : famille, notes internes, image
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.prestations_catalogue
  add column if not exists famille_id     uuid,
  add column if not exists notes_internes text,
  add column if not exists image_chemin   text;
alter table public.articles_stock add column if not exists famille_id uuid;
alter table public.ouvrages add column if not exists famille_id uuid;

select pg_temp.ajouter_contrainte('public.prestations_catalogue', 'prestations_catalogue_famille_fkey',
  'foreign key (famille_id, entreprise_id) references public.catalogue_familles (id, entreprise_id) on delete restrict');
select pg_temp.ajouter_contrainte('public.articles_stock', 'articles_stock_famille_fkey',
  'foreign key (famille_id, entreprise_id) references public.catalogue_familles (id, entreprise_id) on delete restrict');
select pg_temp.ajouter_contrainte('public.ouvrages', 'ouvrages_famille_fkey',
  'foreign key (famille_id, entreprise_id) references public.catalogue_familles (id, entreprise_id) on delete restrict');

-- Notes : internes, jamais imprimées. Image : chemin dans le bucket privé, rangé sous le dossier de
-- l'entreprise (un chemin d'une autre entreprise est refusé par la base, pas seulement par l'écran).
select pg_temp.ajouter_contrainte('public.prestations_catalogue', 'prestations_catalogue_notes_image_check',
  'check (coalesce(length(notes_internes), 0) <= 2000
          and (image_chemin is null or (length(image_chemin) <= 500 and split_part(image_chemin, ''/'', 1) = entreprise_id::text)))');

create index if not exists prestations_catalogue_famille_idx on public.prestations_catalogue (famille_id) where famille_id is not null;
create index if not exists articles_stock_famille_idx on public.articles_stock (famille_id) where famille_id is not null;
create index if not exists ouvrages_famille_idx on public.ouvrages (famille_id) where famille_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Catégorie texte = libellé dérivé de la famille
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- La famille fait foi. La colonne texte `categorie` (catalogue, ouvrages) est conservée : la recherche
-- d'ouvrages et l'import historique la lisent ou l'écrivent. Règles :
--   - famille posée → `categorie` = son libellé (une saisie divergente est remplacée) ;
--   - famille retirée → `categorie` vidée ;
--   - catégorie texte seule (import) → rattachée à la famille ACTIVE de même libellé si elle existe ;
--     sinon elle reste un texte libre, sans famille : aucune famille n'est créée en silence.
create or replace function public.trg_categorie_famille()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_famille uuid;
begin
  if new.famille_id is not null then
    if tg_op = 'INSERT' or new.famille_id is distinct from old.famille_id or new.categorie is distinct from old.categorie then
      new.categorie := public.libelle_famille(new.famille_id);
    end if;
  elsif tg_op = 'UPDATE' and old.famille_id is not null and new.categorie is not distinct from old.categorie then
    new.categorie := null;
  elsif public.normaliser_reference(new.categorie) <> ''
        and (tg_op = 'INSERT' or new.categorie is distinct from old.categorie) then
    select f.id into v_famille
      from public.catalogue_familles f
      left join public.catalogue_familles p on p.id = f.parent_id
     where f.entreprise_id = new.entreprise_id and f.actif
       and public.normaliser_reference(case when p.id is null then f.nom else p.nom || ' › ' || f.nom end)
           = public.normaliser_reference(new.categorie)
     order by f.parent_id nulls first
     limit 1;
    if v_famille is not null then
      new.famille_id := v_famille;
      new.categorie := public.libelle_famille(v_famille);
    end if;
  end if;
  return new;
end $$;

-- Renommer ou déplacer une famille met à jour le libellé des objets rangés dessous.
create or replace function public.trg_familles_renommage()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.prestations_catalogue c set categorie = public.libelle_famille(c.famille_id)
   where c.entreprise_id = new.entreprise_id
     and c.famille_id in (select id from public.catalogue_familles where id = new.id or parent_id = new.id);
  update public.ouvrages o set categorie = public.libelle_famille(o.famille_id)
   where o.entreprise_id = new.entreprise_id
     and o.famille_id in (select id from public.catalogue_familles where id = new.id or parent_id = new.id);
  return null;
end $$;

drop trigger if exists catalogue_familles_renommage on public.catalogue_familles;
create trigger catalogue_familles_renommage
  after update of nom, parent_id on public.catalogue_familles
  for each row execute function public.trg_familles_renommage();


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Reprise : les catégories existantes deviennent des familles (premier niveau)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Une famille par libellé normalisé et par entreprise. Graphie retenue : la plus fréquente ; à égalité,
-- celle qui n'est pas tout en minuscules (« Plâtrerie » plutôt que « platrerie »), puis l'ordre
-- alphabétique. Les déclencheurs de libellé et d'historique sont posés APRÈS : la reprise ne réécrit
-- aucune catégorie et n'écrit rien au journal.
insert into public.catalogue_familles (entreprise_id, nom)
select distinct on (g.entreprise_id, public.normaliser_reference(g.nom)) g.entreprise_id, g.nom
from (
  select s.entreprise_id, s.nom, count(*) as occurrences
  from (
    select entreprise_id, btrim(categorie) as nom from public.prestations_catalogue
    union all
    select entreprise_id, btrim(categorie) from public.ouvrages
  ) s
  where public.normaliser_reference(s.nom) <> '' and length(s.nom) <= 120
  group by s.entreprise_id, s.nom
) g
order by g.entreprise_id, public.normaliser_reference(g.nom), g.occurrences desc, (g.nom = lower(g.nom)), g.nom
on conflict do nothing;

update public.prestations_catalogue c set famille_id = f.id
  from public.catalogue_familles f
 where c.famille_id is null and f.entreprise_id = c.entreprise_id and f.parent_id is null
   and public.normaliser_reference(c.categorie) <> ''
   and public.normaliser_reference(f.nom) = public.normaliser_reference(c.categorie);

update public.ouvrages o set famille_id = f.id
  from public.catalogue_familles f
 where o.famille_id is null and f.entreprise_id = o.entreprise_id and f.parent_id is null
   and public.normaliser_reference(o.categorie) <> ''
   and public.normaliser_reference(f.nom) = public.normaliser_reference(o.categorie);

drop trigger if exists gp_categorie_famille on public.prestations_catalogue;
create trigger gp_categorie_famille
  before insert or update of famille_id, categorie on public.prestations_catalogue
  for each row execute function public.trg_categorie_famille();
drop trigger if exists gp_categorie_famille on public.ouvrages;
create trigger gp_categorie_famille
  before insert or update of famille_id, categorie on public.ouvrages
  for each row execute function public.trg_categorie_famille();


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Favoris (par utilisateur, jamais partagés)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.catalogue_favoris (
  id             uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entreprise_id  uuid not null references public.entreprises (id) on delete cascade,
  prestation_id  uuid,
  ouvrage_id     uuid,
  cree_le        timestamptz not null default now(),
  check (num_nonnulls(prestation_id, ouvrage_id) = 1),
  foreign key (prestation_id, entreprise_id) references public.prestations_catalogue (id, entreprise_id) on delete cascade,
  foreign key (ouvrage_id, entreprise_id) references public.ouvrages (id, entreprise_id) on delete cascade
);
create unique index if not exists catalogue_favoris_prestation_uniq
  on public.catalogue_favoris (utilisateur_id, prestation_id) where prestation_id is not null;
create unique index if not exists catalogue_favoris_ouvrage_uniq
  on public.catalogue_favoris (utilisateur_id, ouvrage_id) where ouvrage_id is not null;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Coefficient et mode de prix — avec le prix d'achat, sous permission
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Le coefficient révèle le prix d'achat à qui connaît le prix de vente : il vit dans la table des coûts
-- (RLS voir_couts_devis / gerer_couts_devis), jamais sur la fiche. `calcule` : le prix de vente est
-- proposé = prix d'achat × coefficient, arrondi au centime (calcul fait par l'écran, enregistré par
-- l'action serveur avec le droit de modifier l'article) ; `saisi` : le prix de vente est libre.
alter table public.prestations_catalogue_couts
  add column if not exists coefficient numeric(8, 4),
  add column if not exists mode_prix   text not null default 'saisi';

select pg_temp.ajouter_contrainte('public.prestations_catalogue_couts', 'prestations_catalogue_couts_coefficient_check',
  'check ((coefficient is null or (coefficient > 0 and coefficient <= 1000))
          and mode_prix in (''saisi'', ''calcule'')
          and (mode_prix = ''saisi'' or coefficient is not null))');


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. Images d'articles : bucket privé, jamais supprimées
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Chemin : <entreprise_id>/<prestation_id>/<fichier>. Aucune politique de suppression : une image peut
-- figurer dans un document déjà émis (même règle que le logo d'entreprise) ; remplacer l'image d'un
-- article en ajoute une nouvelle, l'ancienne reste.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogue-images', 'catalogue-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- Premier dossier du chemin en UUID, ou NULL : le CASE garantit qu'aucun chemin d'un autre bucket
-- (dossiers non UUID) ne provoque d'erreur de conversion en évaluant la politique.
create or replace function public.dossier_entreprise(p_nom text)
returns uuid language sql immutable parallel safe as $$
  select case when split_part(p_nom, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(p_nom, '/', 1)::uuid end
$$;

drop policy if exists catalogue_images_ajout on storage.objects;
create policy catalogue_images_ajout on storage.objects for insert to authenticated with check (
  bucket_id = 'catalogue-images'
  and public.est_membre_actif(public.dossier_entreprise(name))
  and public.a_permission(public.dossier_entreprise(name), 'gerer_devis'));

drop policy if exists catalogue_images_lecture on storage.objects;
create policy catalogue_images_lecture on storage.objects for select to authenticated using (
  bucket_id = 'catalogue-images'
  and public.est_membre_actif(public.dossier_entreprise(name))
  and (public.a_permission(public.dossier_entreprise(name), 'acces_devis')
       or public.a_permission(public.dossier_entreprise(name), 'acces_ouvrages')));


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Recherche d'articles : codes distributeurs, famille, favoris
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Redéfinition de la proposition devis v2 (drop préalable : colonnes rendues ajoutées). Classement :
--   1 réf. interne exacte · 2 réf. fabricant OU code distributeur exact · 3 début de réf. interne ·
--   4 début de réf. fabricant ou de code distributeur · 5 code-barres exact ·
--   6 partie d'une référence, d'un code ou du code-barres · 7 désignation, fabricant, fournisseur, famille.
-- À rang égal : favoris de l'utilisateur, puis actifs, puis ordre alphabétique.
drop function if exists public.rechercher_articles_devis(uuid, text, integer);
create or replace function public.rechercher_articles_devis(p_entreprise_id uuid, p_recherche text, p_limite integer default 50)
returns table (
  source text, id uuid, reference_interne text, origine_reference_interne text, reference_fabricant text,
  code_barres text, designation text, description text, fabricant text, fournisseur text, unite text,
  prix_achat_ht numeric, prix_vente_ht numeric, taux_tva numeric, stock_disponible numeric, actif boolean,
  type_ligne text, rang integer, code_fournisseur text, famille text, favori boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := public.normaliser_reference(p_recherche);
  v_couts boolean;
  v_prix_stock boolean;
  v_stock boolean;
begin
  if not public.est_membre_actif(p_entreprise_id) or not public.a_permission(p_entreprise_id, 'acces_devis') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v_q = '' then
    return;
  end if;
  v_couts := public.a_permission(p_entreprise_id, 'voir_couts_devis');
  v_prix_stock := public.a_permission(p_entreprise_id, 'voir_prix_stock') or public.a_permission(p_entreprise_id, 'gerer_prix_stock');
  v_stock := public.a_permission(p_entreprise_id, 'acces_stock');

  return query
  with candidats as (
    select 'prestation'::text as source, p.id, p.reference_interne,
           case when p.reference_interne is not null then 'reference_interne' end as origine_reference_interne,
           p.reference_fabricant, p.code_barres, p.designation, p.description, p.fabricant, f.nom as fournisseur,
           p.unite, case when v_couts then c.prix_achat_ht end as prix_achat_ht, p.prix_unitaire_ht as prix_vente_ht,
           p.taux_tva, null::numeric as stock_disponible, p.actif, p.type as type_ligne,
           (select cf.code_article from public.catalogue_codes_fournisseurs cf
             where cf.prestation_id = p.id order by cf.principal desc, cf.cree_le limit 1) as code_fournisseur,
           array(select public.normaliser_reference(cf.code_article) from public.catalogue_codes_fournisseurs cf
                  where cf.prestation_id = p.id) as codes,
           p.categorie as famille,
           exists (select 1 from public.catalogue_favoris fv
                    where fv.prestation_id = p.id and fv.utilisateur_id = auth.uid()) as favori
    from public.prestations_catalogue p
    left join public.fournisseurs f on f.id = p.fournisseur_id and f.entreprise_id = p.entreprise_id
    left join public.prestations_catalogue_couts c on c.prestation_id = p.id and c.entreprise_id = p.entreprise_id
    where p.entreprise_id = p_entreprise_id
    union all
    select 'article'::text, a.id, coalesce(a.reference_interne, a.reference),
           case when a.reference_interne is not null then 'reference_interne' else 'reference_stock' end,
           a.reference_fabricant, a.code_barres, a.designation, null::text, a.marque, null::text, a.unite,
           case when v_prix_stock then a.prix_achat_ht end, a.prix_vente_ht, null::numeric,
           case when v_stock then a.quantite_stock end, a.actif, 'fourniture'::text,
           (select cf.code_article from public.catalogue_codes_fournisseurs cf
             where cf.article_stock_id = a.id order by cf.principal desc, cf.cree_le limit 1),
           array(select public.normaliser_reference(cf.code_article) from public.catalogue_codes_fournisseurs cf
                  where cf.article_stock_id = a.id),
           public.libelle_famille(a.famille_id),
           false
    from public.articles_stock a
    where a.entreprise_id = p_entreprise_id
  ),
  normalises as (
    select c.*,
           public.normaliser_reference(c.reference_interne) as ri,
           public.normaliser_reference(c.reference_fabricant) as rf,
           public.normaliser_reference(c.code_barres) as cb
    from candidats c
  ),
  classes as (
    select n.*,
      case
        when n.ri <> '' and n.ri = v_q then 1
        when (n.rf <> '' and n.rf = v_q) or v_q = any (n.codes) then 2
        when n.ri <> '' and starts_with(n.ri, v_q) then 3
        when (n.rf <> '' and starts_with(n.rf, v_q)) or exists (select 1 from unnest(n.codes) k where starts_with(k, v_q)) then 4
        when n.cb <> '' and n.cb = v_q then 5
        when strpos(n.ri, v_q) > 0 or strpos(n.rf, v_q) > 0 or strpos(n.cb, v_q) > 0
          or exists (select 1 from unnest(n.codes) k where strpos(k, v_q) > 0) then 6
        when strpos(public.normaliser_reference(n.designation), v_q) > 0
          or strpos(public.normaliser_reference(n.fabricant), v_q) > 0
          or strpos(public.normaliser_reference(n.fournisseur), v_q) > 0
          or strpos(public.normaliser_reference(n.famille), v_q) > 0 then 7
      end as rang
    from normalises n
  )
  select k.source, k.id, k.reference_interne, k.origine_reference_interne, k.reference_fabricant, k.code_barres,
         k.designation, k.description, k.fabricant, k.fournisseur, k.unite, k.prix_achat_ht, k.prix_vente_ht,
         k.taux_tva, k.stock_disponible, k.actif, k.type_ligne, k.rang, k.code_fournisseur, k.famille, k.favori
  from classes k
  where k.rang is not null
  order by k.rang, k.favori desc, k.actif desc, k.designation
  limit greatest(1, least(coalesce(p_limite, 50), 200));
end $$;

revoke all on function public.rechercher_articles_devis(uuid, text, integer) from public, anon, service_role;
grant execute on function public.rechercher_articles_devis(uuid, text, integer) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 9. Duplication d'un article du catalogue
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Copie : désignation « … (copie) » (unicité historique sur la désignation), nouvelle référence interne
-- (générée si la numérotation automatique est active), famille, notes, image, fabricant et fournisseur.
-- NON copiés : code-barres et codes distributeurs (ils désignent UN produit précis). Le prix d'achat et
-- le coefficient ne sont copiés qu'avec `gerer_couts_devis`. La duplication est journalisée avec sa source.
create or replace function public.dupliquer_prestation(p_prestation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src public.prestations_catalogue;
  v_nom text;
  v_n   integer := 1;
  v_id  uuid;
begin
  select * into v_src from public.prestations_catalogue where id = p_prestation_id;
  if not found or not public.est_membre_actif(v_src.entreprise_id)
     or not public.a_permission(v_src.entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  v_nom := left(v_src.designation, 180) || ' (copie)';
  while exists (select 1 from public.prestations_catalogue
                 where entreprise_id = v_src.entreprise_id and designation = v_nom) loop
    v_n := v_n + 1;
    v_nom := left(v_src.designation, 180) || ' (copie ' || v_n || ')';
  end loop;

  insert into public.prestations_catalogue (
    entreprise_id, designation, description, type, unite, prix_unitaire_ht, taux_tva, actif,
    reference_fabricant, fabricant, fournisseur_id, famille_id, categorie, notes_internes, image_chemin)
  values (
    v_src.entreprise_id, v_nom, v_src.description, v_src.type, v_src.unite, v_src.prix_unitaire_ht, v_src.taux_tva, true,
    v_src.reference_fabricant, v_src.fabricant, v_src.fournisseur_id, v_src.famille_id, v_src.categorie,
    v_src.notes_internes, v_src.image_chemin)
  returning id into v_id;

  if public.a_permission(v_src.entreprise_id, 'gerer_couts_devis') then
    insert into public.prestations_catalogue_couts (prestation_id, entreprise_id, prix_achat_ht, fournisseur_id, coefficient, mode_prix)
    select v_id, c.entreprise_id, c.prix_achat_ht, c.fournisseur_id, c.coefficient, c.mode_prix
      from public.prestations_catalogue_couts c where c.prestation_id = p_prestation_id;
  end if;

  perform public.journaliser_objet(v_src.entreprise_id, 'article', v_id, 'duplication', null, null,
    jsonb_build_object('source_id', p_prestation_id, 'source_reference', v_src.reference_interne), false);
  return v_id;
end $$;

revoke all on function public.dupliquer_prestation(uuid) from public, anon, service_role;
grant execute on function public.dupliquer_prestation(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 10. Historique du catalogue et des ouvrages
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Arguments : ressource, puis colonnes suivies. Création = une entrée ; chaque colonne suivie qui change
-- = une entrée (avant/après). `actif` → archivage / réactivation ; `statut` → statut_modifie.
create or replace function public.trg_historique_catalogue()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_col text;
  v_nouveau jsonb := to_jsonb(new);
  v_ancien  jsonb;
begin
  if tg_op = 'INSERT' then
    perform public.journaliser_objet(new.entreprise_id, tg_argv[0], new.id, 'creation', null, null,
      jsonb_build_object('libelle', coalesce(v_nouveau ->> 'designation', v_nouveau ->> 'nom'),
                         'reference_interne', v_nouveau ->> 'reference_interne'), false);
    return null;
  end if;
  v_ancien := to_jsonb(old);
  for i in 1 .. tg_nargs - 1 loop
    v_col := tg_argv[i];
    if (v_ancien -> v_col) is distinct from (v_nouveau -> v_col) then
      perform public.journaliser_objet(new.entreprise_id, tg_argv[0], new.id,
        case v_col
          when 'actif' then case when (v_nouveau ->> 'actif')::boolean then 'reactivation' else 'archivage' end
          when 'statut' then 'statut_modifie'
          else 'modification' end,
        v_col, v_ancien -> v_col, v_nouveau -> v_col, false);
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists gp_historique_catalogue on public.prestations_catalogue;
create trigger gp_historique_catalogue
  after insert or update of designation, prix_unitaire_ht, taux_tva, unite, type, actif, famille_id on public.prestations_catalogue
  for each row execute function public.trg_historique_catalogue('article', 'designation', 'prix_unitaire_ht', 'taux_tva', 'unite', 'type', 'actif', 'famille_id');
drop trigger if exists gp_historique_catalogue on public.ouvrages;
create trigger gp_historique_catalogue
  after insert or update of nom, statut, famille_id, version_courante on public.ouvrages
  for each row execute function public.trg_historique_catalogue('ouvrage', 'nom', 'statut', 'famille_id', 'version_courante');
drop trigger if exists gp_historique_catalogue on public.articles_stock;
create trigger gp_historique_catalogue
  after insert or update of designation, prix_vente_ht, actif, famille_id on public.articles_stock
  for each row execute function public.trg_historique_catalogue('article_stock', 'designation', 'prix_vente_ht', 'actif', 'famille_id');

-- Coûts : entrées SENSIBLES (lisibles seulement avec voir_couts_devis).
create or replace function public.trg_historique_couts_catalogue()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.prix_achat_ht is distinct from new.prix_achat_ht then
    perform public.journaliser_objet(new.entreprise_id, 'article', new.prestation_id, 'prix_achat_modifie', 'prix_achat_ht',
      case when tg_op = 'UPDATE' then to_jsonb(old.prix_achat_ht) end, to_jsonb(new.prix_achat_ht), true);
  end if;
  if (tg_op = 'INSERT' and new.coefficient is not null)
     or (tg_op = 'UPDATE' and (old.coefficient is distinct from new.coefficient or old.mode_prix is distinct from new.mode_prix)) then
    perform public.journaliser_objet(new.entreprise_id, 'article', new.prestation_id, 'coefficient_modifie', 'coefficient',
      case when tg_op = 'UPDATE' then jsonb_build_object('coefficient', old.coefficient, 'mode_prix', old.mode_prix) end,
      jsonb_build_object('coefficient', new.coefficient, 'mode_prix', new.mode_prix), true);
  end if;
  return null;
end $$;

drop trigger if exists gp_historique_couts on public.prestations_catalogue_couts;
create trigger gp_historique_couts
  after insert or update on public.prestations_catalogue_couts
  for each row execute function public.trg_historique_couts_catalogue();


-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 11. RLS et droits
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.catalogue_familles enable row level security;
drop policy if exists lecture_selon_module on public.catalogue_familles;
create policy lecture_selon_module on public.catalogue_familles for select to authenticated using (
  public.est_membre_actif(entreprise_id)
  and (public.a_permission(entreprise_id, 'acces_devis') or public.a_permission(entreprise_id, 'acces_ouvrages')
       or public.a_permission(entreprise_id, 'acces_stock')));
drop policy if exists gestion_insert on public.catalogue_familles;
create policy gestion_insert on public.catalogue_familles for insert to authenticated with check (
  public.est_membre_actif(entreprise_id)
  and (public.a_permission(entreprise_id, 'gerer_devis') or public.a_permission(entreprise_id, 'gerer_ouvrages')
       or public.a_permission(entreprise_id, 'gerer_stock')));
drop policy if exists gestion_update on public.catalogue_familles;
create policy gestion_update on public.catalogue_familles for update to authenticated
  using (public.a_permission(entreprise_id, 'gerer_devis') or public.a_permission(entreprise_id, 'gerer_ouvrages')
         or public.a_permission(entreprise_id, 'gerer_stock'))
  with check (public.a_permission(entreprise_id, 'gerer_devis') or public.a_permission(entreprise_id, 'gerer_ouvrages')
              or public.a_permission(entreprise_id, 'gerer_stock'));
drop policy if exists gestion_delete on public.catalogue_familles;
create policy gestion_delete on public.catalogue_familles for delete to authenticated
  using (public.a_permission(entreprise_id, 'gerer_devis') or public.a_permission(entreprise_id, 'gerer_ouvrages')
         or public.a_permission(entreprise_id, 'gerer_stock'));
revoke all on public.catalogue_familles from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.catalogue_familles to authenticated;

alter table public.catalogue_favoris enable row level security;
drop policy if exists favoris_personnels on public.catalogue_favoris;
create policy favoris_personnels on public.catalogue_favoris for all to authenticated
  using (utilisateur_id = auth.uid() and public.est_membre_actif(entreprise_id))
  with check (utilisateur_id = auth.uid() and public.est_membre_actif(entreprise_id)
              and (public.a_permission(entreprise_id, 'acces_devis') or public.a_permission(entreprise_id, 'acces_ouvrages')));
revoke all on public.catalogue_favoris from public, anon, authenticated, service_role;
grant select, insert, delete on public.catalogue_favoris to authenticated;

revoke all on function public.libelle_famille(uuid) from public, anon, authenticated, service_role;
revoke all on function public.dossier_entreprise(text) from public, anon, service_role;
grant execute on function public.dossier_entreprise(text) to authenticated;

notify pgrst, 'reload schema';
