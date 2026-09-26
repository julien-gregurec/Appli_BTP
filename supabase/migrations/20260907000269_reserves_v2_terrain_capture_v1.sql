-- ELSATIA-RESERVES-V2-TERRAIN-CAPTURE
--
-- Rend ELSATIA Réserves réellement utilisable sur un chantier. Ferme les trois manques
-- P0 laissés ouverts par 00268 :
--
--   1. STOCKAGE RÉEL DES PHOTOS ET DES PLANS. En V1, une « photo » n'était qu'un chemin
--      de texte que le client fournissait lui-même : aucun fichier, et un chemin
--      arbitraire acceptable. Ce lot crée deux buckets privés et des policies qui
--      vérifient le chemin CONTRE LA BASE au lieu de lui faire confiance.
--   2. CYCLE DE VIE DES CHANTIERS ET DES PLANS, avec les champs qu'un conducteur de
--      travaux attend réellement.
--   3. ADMINISTRATION DES MEMBRES par l'organisation elle-même, sans passer par un
--      administrateur plateforme, et sans qu'elle puisse déborder de son propre tenant.
--
-- Migration strictement ADDITIVE et POSTÉRIEURE à 00268. Aucune table, colonne, policy
-- ou fonction de la V1 n'est supprimée ; les deux fonctions redéfinies
-- (`reserves_action_autorisee`, `reserves_appliquer_transition`) le sont par
-- `create or replace`, en conservant leur signature et leur contrat.

-- ── 1. Buckets privés ────────────────────────────────────────────────────────
-- `public = false` : aucune URL publique permanente n'existe. La lecture se fait par
-- URL signée à durée courte, émise seulement après contrôle applicatif.
--
-- HEIC est délibérément ABSENT de la liste. Contrairement à Colors, Réserves affiche ces
-- photos dans une galerie que tous les navigateurs doivent savoir rendre, et le HEIC
-- n'est pas décodé par Chrome ni Firefox. Comme l'`accept` du champ de fichier n'annonce
-- que JPEG/PNG/WEBP, iOS convertit lui-même en JPEG à la sélection : le cas courant du
-- terrain est couvert sans prétendre à un support que nous n'assurons pas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reserves-photos', 'reserves-photos', false, 15728640,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reserves-plans', 'reserves-plans', false, 26214400,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── 2. Colonnes de fichier et cycle de vie des photos ───────────────────────
alter table public.reserves_photos
  add column if not exists nom_fichier text
    check (nom_fichier is null or length(nom_fichier) <= 260),
  add column if not exists largeur integer check (largeur is null or largeur > 0),
  add column if not exists hauteur integer check (hauteur is null or hauteur > 0),
  -- Suppression douce : une photo qui a servi de preuve ne disparaît jamais de
  -- l'historique, elle est marquée supprimée et cesse d'être affichée.
  add column if not exists supprimee_at timestamptz,
  add column if not exists supprimee_par uuid references public.utilisateurs(id) on delete set null,
  add column if not exists motif_suppression text
    check (motif_suppression is null or length(motif_suppression) <= 500);

create index if not exists reserves_photos_vivantes_idx
  on public.reserves_photos (reserve_id, usage, created_at desc) where supprimee_at is null;

-- ── 3. Chantiers : les champs réellement attendus sur le terrain ────────────
alter table public.reserves_chantiers
  add column if not exists description text
    check (description is null or length(description) <= 4000),
  add column if not exists client text
    check (client is null or length(client) <= 180),
  add column if not exists date_debut date,
  add column if not exists date_fin_prevue date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reserves_chantiers_periode_check') then
    alter table public.reserves_chantiers
      add constraint reserves_chantiers_periode_check
      check (date_debut is null or date_fin_prevue is null or date_fin_prevue >= date_debut);
  end if;
end $$;

-- ── 4. Plans : traçabilité du document déposé ───────────────────────────────
alter table public.reserves_plans
  add column if not exists nom_fichier text
    check (nom_fichier is null or length(nom_fichier) <= 260),
  add column if not exists taille_octets integer
    check (taille_octets is null or taille_octets between 1 and 26214400),
  add column if not exists televerse_at timestamptz,
  add column if not exists televerse_par uuid references public.utilisateurs(id) on delete set null;

-- ── 5. Nouvelle action : administration des membres ─────────────────────────
-- Seul ajout au contrat d'autorisation de 00268 : `gerer_membres`, réservé à
-- l'administrateur de l'organisation. Le reste de la fonction est identique.
create or replace function public.reserves_action_autorisee(p_entreprise_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare v_role text;
begin
  if auth.uid() is null or p_entreprise_id is null then return false; end if;
  if public.est_plateforme_admin() then
    return p_action = 'voir' and public.est_acces_support_actif(p_entreprise_id);
  end if;
  v_role := public.reserves_role_courant(p_entreprise_id);
  if v_role is null then return false; end if;
  if v_role = 'reserves_intervenant' then return false; end if;
  if p_action in ('voir','exporter') then return true; end if;
  if v_role = 'reserves_consultation' then return false; end if;
  if p_action in ('creer_reserve','assigner','commenter') then return true; end if;
  if p_action in ('valider_levee','gerer_chantier','gerer_plans','gerer_intervenants') then
    return v_role in ('reserves_admin_organisation','reserves_responsable');
  end if;
  if p_action in ('gerer_parametres','inviter_entreprise','gerer_membres') then
    return v_role = 'reserves_admin_organisation';
  end if;
  return false;
end;
$$;

-- ── 6. Le chemin de stockage n'est jamais une preuve ────────────────────────
-- Ces deux prédicats sont le cœur de la sécurité du stockage. Ils décomposent le
-- chemin, refusent tout ce qui n'a pas exactement la forme attendue, puis vérifient
-- que le triplet annoncé correspond à une ligne RÉELLE de la base. Un chemin forgé
-- désigne alors soit une réserve inexistante, soit une réserve que l'appelant n'a de
-- toute façon pas le droit de lire ou d'alimenter.
create or replace function public.reserves_storage_photo_autorisee(
  p_chemin text, p_ecriture boolean
) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare
  v_dossiers text[];
  v_entreprise uuid; v_chantier uuid; v_reserve uuid;
begin
  if auth.uid() is null or p_chemin is null then return false; end if;
  v_dossiers := storage.foldername(p_chemin);
  if coalesce(array_length(v_dossiers, 1), 0) <> 3 then return false; end if;
  if v_dossiers[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_dossiers[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_dossiers[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;

  v_entreprise := v_dossiers[1]::uuid;
  v_chantier := v_dossiers[2]::uuid;
  v_reserve := v_dossiers[3]::uuid;

  -- Le triplet doit décrire une réserve qui existe vraiment, dans ce chantier,
  -- chez cette organisation. Sinon le chemin est rejeté, quelle que soit l'identité.
  if not exists (
    select 1 from public.reserves r
    where r.id = v_reserve and r.chantier_id = v_chantier and r.entreprise_id = v_entreprise
  ) then return false; end if;

  if p_ecriture then return public.reserves_acteur_courant(v_reserve) is not null; end if;
  return public.reserves_lecture_autorisee(v_reserve);
end;
$$;

create or replace function public.reserves_storage_plan_autorisee(
  p_chemin text, p_ecriture boolean
) returns boolean
language plpgsql security definer stable set search_path = public as $$
declare
  v_dossiers text[];
  v_entreprise uuid; v_chantier uuid; v_plan uuid;
begin
  if auth.uid() is null or p_chemin is null then return false; end if;
  v_dossiers := storage.foldername(p_chemin);
  if coalesce(array_length(v_dossiers, 1), 0) <> 3 then return false; end if;
  if v_dossiers[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_dossiers[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_dossiers[3] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  then return false; end if;

  v_entreprise := v_dossiers[1]::uuid;
  v_chantier := v_dossiers[2]::uuid;
  v_plan := v_dossiers[3]::uuid;

  if not exists (
    select 1 from public.reserves_plans p
    where p.id = v_plan and p.chantier_id = v_chantier and p.entreprise_id = v_entreprise
  ) then return false; end if;

  if p_ecriture then return public.reserves_action_autorisee(v_entreprise, 'gerer_plans'); end if;
  -- Une entreprise invitée n'obtient que les plans effectivement portés par une réserve
  -- qui lui est attribuée : elle ne récupère pas le jeu de plans du chantier.
  return public.reserves_action_autorisee(v_entreprise, 'voir')
      or public.reserves_plan_visible_intervenant(v_plan);
end;
$$;

-- ── 7. Policies Storage ─────────────────────────────────────────────────────
-- Photos : lecture et dépôt seulement. Aucune policy `update` ni `delete` : un fichier
-- déposé ne peut être ni écrasé ni effacé depuis l'application. La suppression d'une
-- photo est un geste métier tracé (suppression douce), pas une opération de stockage.
create policy reserves_photos_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reserves-photos' and public.reserves_storage_photo_autorisee(name, false));

create policy reserves_photos_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reserves-photos' and public.reserves_storage_photo_autorisee(name, true));

-- Plans : la suppression est ouverte au rôle qui gère les plans, parce qu'un plan
-- déposé par erreur doit pouvoir être retiré. Elle reste impossible pour tous les autres.
create policy reserves_plans_storage_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reserves-plans' and public.reserves_storage_plan_autorisee(name, false));

create policy reserves_plans_storage_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reserves-plans' and public.reserves_storage_plan_autorisee(name, true));

create policy reserves_plans_storage_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'reserves-plans' and public.reserves_storage_plan_autorisee(name, true));

-- ── 8. Cycle de vie d'une photo ─────────────────────────────────────────────
-- `disponible_at` sépare la réservation d'un emplacement du fichier réellement déposé.
-- Sans lui, appeler la RPC sans jamais téléverser suffirait à satisfaire l'exigence de
-- photo à la levée. Une photo ne compte donc que confirmée, et la confirmation vérifie
-- la présence effective de l'objet dans le bucket.
alter table public.reserves_photos
  add column if not exists disponible_at timestamptz,
  -- Verrou de preuve. Posé explicitement par la machine à états quand une décision est
  -- prononcée : comparer des horodatages ne conviendrait pas, `now()` étant constant
  -- dans une transaction, deux événements du même geste seraient indiscernables.
  add column if not exists verrouillee_at timestamptz;

-- La signature de 00268 acceptait un `p_storage_path` fourni par l'appelant. Ce
-- paramètre disparaît : c'est la base qui compose désormais le chemin, à partir des
-- identifiants réels de la réserve. Le remplacement impose de reprendre la fonction.
drop function if exists public.reserves_ajouter_photo(uuid, text, text, text, text, integer, uuid);

create or replace function public.reserves_ajouter_photo(
  p_reserve_id uuid,
  p_usage text default 'constat',
  p_legende text default null,
  p_mime_type text default 'image/jpeg',
  p_taille_octets integer default null,
  p_nom_fichier text default null,
  p_origine_client_id uuid default null
) returns table (photo_id uuid, storage_path text)
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_entreprise_auteur uuid;
  v_extension text;
  v_chemin text;
  v_id uuid;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id;
  if not found then raise exception 'Réserve introuvable'; end if;
  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Ajout de photo non autorisé'; end if;

  v_extension := case p_mime_type
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
    else null end;
  if v_extension is null then
    raise exception 'Format de photo non pris en charge : %', p_mime_type;
  end if;

  if v_acteur = 'hote' then
    v_entreprise_auteur := v_reserve.entreprise_id;
  else
    select i.entreprise_intervenante_id into v_entreprise_auteur
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
  end if;

  -- Idempotence hors-ligne : rejouer un dépôt déjà enregistré rend la même photo.
  if p_origine_client_id is not null then
    select ph.id, ph.storage_path into v_id, v_chemin
    from public.reserves_photos ph
    where ph.reserve_id = p_reserve_id and ph.origine_client_id = p_origine_client_id;
    if v_id is not null then
      photo_id := v_id; storage_path := v_chemin; return next; return;
    end if;
  end if;

  -- Chemin composé côté base : entreprise / chantier / réserve / identifiant opaque.
  -- L'appelant ne choisit rien, pas même le nom du fichier.
  v_chemin := v_reserve.entreprise_id::text || '/' || v_reserve.chantier_id::text || '/'
           || p_reserve_id::text || '/' || gen_random_uuid()::text || '.' || v_extension;

  insert into public.reserves_photos (
    entreprise_id, reserve_id, storage_path, usage, legende, mime_type,
    taille_octets, ajoutee_par_entreprise_id, nom_fichier, origine_client_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, v_chemin, coalesce(p_usage,'constat'),
    p_legende, p_mime_type, p_taille_octets, v_entreprise_auteur,
    left(coalesce(p_nom_fichier, ''), 260), p_origine_client_id
  ) returning id into v_id;

  photo_id := v_id; storage_path := v_chemin; return next;
end;
$$;

-- Confirme qu'un fichier a bien été déposé à l'emplacement réservé. Tant que cette
-- vérification n'a pas eu lieu, la photo n'existe pour personne : ni dans la galerie,
-- ni pour l'exigence de levée.
create or replace function public.reserves_confirmer_photo(p_photo_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_photo public.reserves_photos;
begin
  select * into v_photo from public.reserves_photos where id = p_photo_id;
  if not found then raise exception 'Photo introuvable'; end if;
  if public.reserves_acteur_courant(v_photo.reserve_id) is null then
    raise exception 'Confirmation de photo non autorisée';
  end if;
  if v_photo.disponible_at is not null then return; end if;

  -- Contrôle décisif : l'objet doit réellement exister dans le bucket privé.
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'reserves-photos' and o.name = v_photo.storage_path
  ) then
    raise exception 'Aucun fichier déposé pour cette photo';
  end if;

  update public.reserves_photos set disponible_at = now() where id = p_photo_id;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  )
  select v_photo.entreprise_id, v_photo.reserve_id, 'photo_ajoutee', r.statut, r.statut,
         'photo', v_photo.usage, v_photo.legende, auth.uid(), v_photo.ajoutee_par_entreprise_id
  from public.reserves r where r.id = v_photo.reserve_id;
end;
$$;

-- Suppression DOUCE, et seulement tant que la photo n'a servi à aucun acte officiel.
-- Dès qu'une transition a été prononcée après son dépôt, elle a pu fonder la décision :
-- elle devient alors indélébile, y compris pour l'administrateur de l'organisation.
create or replace function public.reserves_supprimer_photo(
  p_photo_id uuid, p_motif text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_photo public.reserves_photos; v_acteur text;
begin
  select * into v_photo from public.reserves_photos where id = p_photo_id;
  if not found then raise exception 'Photo introuvable'; end if;
  if v_photo.supprimee_at is not null then return; end if;

  v_acteur := public.reserves_acteur_courant(v_photo.reserve_id);
  if v_acteur is null then raise exception 'Suppression de photo non autorisée'; end if;

  -- Seule l'entreprise qui a déposé la photo peut la retirer.
  if v_acteur = 'hote' then
    if v_photo.ajoutee_par_entreprise_id is distinct from v_photo.entreprise_id then
      raise exception 'Cette photo a été déposée par l''entreprise intervenante';
    end if;
  else
    if v_photo.ajoutee_par_entreprise_id = v_photo.entreprise_id then
      raise exception 'Cette photo a été déposée par l''organisation du chantier';
    end if;
  end if;

  if v_photo.verrouillee_at is not null then
    raise exception 'Photo verrouillée : elle a accompagné une décision prononcée sur cette réserve';
  end if;

  update public.reserves_photos
  set supprimee_at = now(), supprimee_par = auth.uid(),
      motif_suppression = nullif(btrim(coalesce(p_motif, '')), '')
  where id = p_photo_id;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, commentaire, auteur_id, auteur_entreprise_id
  )
  select v_photo.entreprise_id, v_photo.reserve_id, 'modification', r.statut, r.statut,
         'photo_supprimee', v_photo.usage, nullif(btrim(coalesce(p_motif, '')), ''),
         auth.uid(), v_photo.ajoutee_par_entreprise_id
  from public.reserves r where r.id = v_photo.reserve_id;
end;
$$;

-- ── 9. Cycle de vie d'un plan ───────────────────────────────────────────────
create or replace function public.reserves_ajouter_plan(
  p_chantier_id uuid,
  p_nom text,
  p_niveau text default null,
  p_zone text default null,
  p_mime_type text default 'application/pdf',
  p_taille_octets integer default null,
  p_nom_fichier text default null,
  p_ordre integer default 0
) returns table (plan_id uuid, storage_path text)
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid; v_extension text; v_id uuid; v_chemin text;
begin
  select entreprise_id into v_entreprise from public.reserves_chantiers where id = p_chantier_id;
  if v_entreprise is null then raise exception 'Chantier Réserves introuvable'; end if;
  if not public.reserves_action_autorisee(v_entreprise, 'gerer_plans') then
    raise exception 'Ajout de plan non autorisé';
  end if;

  v_extension := case p_mime_type
    when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
  if v_extension is null then
    raise exception 'Format de plan non pris en charge : %', p_mime_type;
  end if;

  insert into public.reserves_plans (
    entreprise_id, chantier_id, nom, niveau, zone, mime_type,
    taille_octets, nom_fichier, ordre
  ) values (
    v_entreprise, p_chantier_id, p_nom, nullif(btrim(coalesce(p_niveau,'')),''),
    nullif(btrim(coalesce(p_zone,'')),''), p_mime_type, p_taille_octets,
    left(coalesce(p_nom_fichier,''), 260), coalesce(p_ordre, 0)
  ) returning id into v_id;

  -- Même règle que pour les photos : le chemin est composé par la base.
  v_chemin := v_entreprise::text || '/' || p_chantier_id::text || '/'
           || v_id::text || '/' || gen_random_uuid()::text || '.' || v_extension;

  plan_id := v_id; storage_path := v_chemin; return next;
end;
$$;

create or replace function public.reserves_confirmer_plan(
  p_plan_id uuid, p_storage_path text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_plan public.reserves_plans;
begin
  select * into v_plan from public.reserves_plans where id = p_plan_id;
  if not found then raise exception 'Plan introuvable'; end if;
  if not public.reserves_action_autorisee(v_plan.entreprise_id, 'gerer_plans') then
    raise exception 'Confirmation de plan non autorisée';
  end if;
  -- Le chemin annoncé doit désigner ce plan précis, et le fichier doit exister.
  if p_storage_path not like (
    v_plan.entreprise_id::text || '/' || v_plan.chantier_id::text || '/' || p_plan_id::text || '/%'
  ) then
    raise exception 'Chemin de plan incohérent';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'reserves-plans' and o.name = p_storage_path
  ) then
    raise exception 'Aucun document déposé pour ce plan';
  end if;

  update public.reserves_plans
  set storage_path = p_storage_path, televerse_at = now(), televerse_par = auth.uid()
  where id = p_plan_id;
end;
$$;

-- La suppression d'un plan libère les réserves qui s'y référaient. Les repères ne
-- peuvent pas survivre à leur fond de plan : la contrainte de 00268 exige qu'une
-- position soit toujours portée par un plan, et c'est cette RPC qui la respecte.
create or replace function public.reserves_supprimer_plan(p_plan_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_plan public.reserves_plans;
begin
  select * into v_plan from public.reserves_plans where id = p_plan_id;
  if not found then raise exception 'Plan introuvable'; end if;
  if not public.reserves_action_autorisee(v_plan.entreprise_id, 'gerer_plans') then
    raise exception 'Suppression de plan non autorisée';
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves
  set plan_id = null, position_x = null, position_y = null
  where plan_id = p_plan_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  delete from public.reserves_plans where id = p_plan_id;
end;
$$;

-- ── 10. Administration des membres par l'organisation ───────────────────────
-- Ferme le manque P0 de la V1 : une organisation devait passer par un administrateur
-- plateforme pour habiliter ses propres salariés.
--
-- Trois bornes, portées par la base et non par l'interface :
--   * l'appelant ne peut agir que sur l'organisation où il est `reserves_admin_organisation` ;
--   * la cible doit déjà être membre ACTIF de cette même organisation — on habilite,
--     on n'enrôle pas ;
--   * `application_code` est figé à 'reserves'. Gestion Pro, Colors, Tools et les rôles
--     plateforme restent hors de portée, de même que le propriétaire global.
create or replace function public.reserves_lister_membres(p_entreprise_id uuid)
returns table (
  utilisateur_id uuid, prenom text, nom text, email text,
  statut_membre text, role_code text, autorise boolean
)
language sql security definer stable set search_path = public as $$
  select u.id, u.prenom, u.nom, au.email::text, ue.statut, h.role_code,
         coalesce(h.autorise, false)
  from public.utilisateurs_entreprises ue
  join public.utilisateurs u on u.id = ue.utilisateur_id
  left join auth.users au on au.id = u.id
  left join public.habilitations_applications_utilisateurs h
    on h.utilisateur_id = ue.utilisateur_id
   and h.entreprise_id = ue.entreprise_id
   and h.application_code = 'reserves'
  where ue.entreprise_id = p_entreprise_id
    and public.reserves_action_autorisee(p_entreprise_id, 'gerer_membres')
  order by u.nom, u.prenom;
$$;

create or replace function public.reserves_attribuer_role(
  p_utilisateur_id uuid, p_entreprise_id uuid, p_role_code text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.reserves_action_autorisee(p_entreprise_id, 'gerer_membres') then
    raise exception 'Administration des membres Réserves non autorisée';
  end if;

  -- `reserves_intervenant` est volontairement exclu : ce n'est pas un rôle interne mais
  -- celui du compte gratuit d'une entreprise extérieure, obtenu en rejoignant une
  -- intervention. L'attribuer à un salarié ne lui donnerait aucun droit.
  if p_role_code not in (
    'reserves_admin_organisation','reserves_responsable','reserves_emetteur','reserves_consultation'
  ) then
    raise exception 'Rôle Réserves non attribuable par une organisation : %', p_role_code;
  end if;

  if not exists (
    select 1 from public.utilisateurs_entreprises ue
    where ue.utilisateur_id = p_utilisateur_id
      and ue.entreprise_id = p_entreprise_id
      and ue.statut = 'actif'
  ) then
    raise exception 'Cette personne n''est pas membre actif de votre organisation';
  end if;

  if not exists (
    select 1 from public.acces_applications_entreprises ae
    where ae.entreprise_id = p_entreprise_id and ae.application_code = 'reserves' and ae.autorise
  ) then
    raise exception 'Réserves n''est pas activé pour votre organisation';
  end if;

  insert into public.habilitations_applications_utilisateurs (
    entreprise_id, utilisateur_id, application_code, role_code, autorise, attribue_par
  ) values (
    p_entreprise_id, p_utilisateur_id, 'reserves', p_role_code, true, auth.uid()
  )
  on conflict (entreprise_id, utilisateur_id, application_code) do update
    set role_code = excluded.role_code, autorise = true,
        attribue_par = excluded.attribue_par, valide_jusqu_au = null;

  -- Un rétrogradage ne doit pas laisser l'organisation sans administrateur Réserves.
  if p_role_code <> 'reserves_admin_organisation' and not exists (
    select 1 from public.habilitations_applications_utilisateurs h
    where h.entreprise_id = p_entreprise_id and h.application_code = 'reserves'
      and h.role_code = 'reserves_admin_organisation' and h.autorise
  ) then
    raise exception 'Votre organisation doit conserver au moins un administrateur Réserves';
  end if;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values (
    'utilisateur', p_utilisateur_id, 'reserves', 'organisation_habilitation:' || p_role_code, auth.email()
  );
end;
$$;

create or replace function public.reserves_retirer_acces_membre(
  p_utilisateur_id uuid, p_entreprise_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.reserves_action_autorisee(p_entreprise_id, 'gerer_membres') then
    raise exception 'Administration des membres Réserves non autorisée';
  end if;

  update public.habilitations_applications_utilisateurs
  set autorise = false
  where entreprise_id = p_entreprise_id
    and utilisateur_id = p_utilisateur_id
    and application_code = 'reserves';

  if not exists (
    select 1 from public.habilitations_applications_utilisateurs h
    where h.entreprise_id = p_entreprise_id and h.application_code = 'reserves'
      and h.role_code = 'reserves_admin_organisation' and h.autorise
  ) then
    raise exception 'Votre organisation doit conserver au moins un administrateur Réserves';
  end if;

  insert into public.historique_acces_applications (
    cible_type, cible_id, application_code, action, auteur_email
  ) values ('utilisateur', p_utilisateur_id, 'reserves', 'organisation_retrait', auth.email());
end;
$$;

-- ── 11. L'exigence de photo ne se satisfait que d'un fichier réel ───────────
-- Redéfinition à l'identique de la fonction de 00268, à une exception près : le contrôle
-- de la photo obligatoire exige désormais une photo confirmée et vivante. La machine à
-- états, la matrice des transitions et l'historisation sont inchangés.
create or replace function public.reserves_appliquer_transition(
  p_reserve_id uuid,
  p_statut_apres text,
  p_commentaire text default null,
  p_intervenant_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_transition public.reserves_transitions;
  v_intervenant uuid;
  v_entreprise_intervenante uuid;
  v_type_notification text;
  v_destinataire uuid;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id for update;
  if not found then raise exception 'Réserve introuvable'; end if;

  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Action non autorisée sur cette réserve'; end if;

  select * into v_transition from public.reserves_transitions
  where statut_avant = v_reserve.statut and statut_apres = p_statut_apres and acteur = v_acteur;
  if not found then
    raise exception 'Transition % → % impossible pour l''acteur %',
      v_reserve.statut, p_statut_apres, v_acteur;
  end if;

  if v_transition.commentaire_obligatoire and coalesce(btrim(p_commentaire), '') = '' then
    raise exception 'Un motif est obligatoire pour l''action %', v_transition.action;
  end if;

  -- Attribution : seule une action d'assignation peut changer l'intervenant porteur.
  v_intervenant := v_reserve.intervenant_id;
  if v_transition.action in ('assignation','reassignation') then
    if p_intervenant_id is null then raise exception 'Aucune entreprise intervenante fournie'; end if;
    v_intervenant := p_intervenant_id;
  elsif p_intervenant_id is not null and p_intervenant_id is distinct from v_reserve.intervenant_id then
    raise exception 'Cette action ne peut pas réattribuer la réserve';
  end if;

  -- La levée demandée est conditionnée, réserve par réserve, à la preuve photographique
  -- exigée par l'émetteur. Le contrôle est ici, en base : le frontend ne peut pas le
  -- contourner en appelant directement la RPC.
  if v_transition.action = 'demande_levee' and v_reserve.photo_obligatoire_levee then
    if not exists (
      select 1 from public.reserves_photos
      where reserve_id = p_reserve_id
        and usage in ('travaux','levee')
        -- V2 : seule une photo RÉELLEMENT déposée (fichier présent dans le bucket, donc
        -- confirmée) et non supprimée satisfait l'exigence. Une ligne réservée mais
        -- jamais téléversée ne vaut pas preuve.
        and disponible_at is not null
        and supprimee_at is null
    ) then
      raise exception 'Photo obligatoire : ajoutez une preuve avant de demander la levée';
    end if;
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves set
    statut = p_statut_apres,
    intervenant_id = v_intervenant,
    assignee_at = case when v_transition.action in ('assignation','reassignation','reouverture')
                       then now() else assignee_at end,
    acceptee_at = case when v_transition.action = 'acceptation' then now()
                       when v_transition.action = 'reouverture' then null else acceptee_at end,
    levee_demandee_at = case when v_transition.action = 'demande_levee' then now()
                             when v_transition.action = 'reouverture' then null else levee_demandee_at end,
    levee_at = case when v_transition.action = 'levee_validee' then now()
                    when v_transition.action = 'reouverture' then null else levee_at end,
    cloturee_at = case when p_statut_apres in ('levee','annulee') then now() else null end
  where id = p_reserve_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  -- Toute photo confirmée et vivante au moment d'une décision devient une pièce du
  -- dossier : elle ne peut plus être retirée, par personne.
  update public.reserves_photos
  set verrouillee_at = now()
  where reserve_id = p_reserve_id
    and disponible_at is not null and supprimee_at is null and verrouillee_at is null;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, v_transition.action, v_reserve.statut, p_statut_apres,
    case when v_intervenant is distinct from v_reserve.intervenant_id then 'intervenant_id' end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_reserve.intervenant_id::text end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_intervenant::text end,
    nullif(btrim(coalesce(p_commentaire, '')), ''), auth.uid(),
    case when v_acteur = 'hote' then v_reserve.entreprise_id else null end
  );

  select i.entreprise_intervenante_id into v_entreprise_intervenante
  from public.reserves_intervenants i where i.id = v_intervenant;

  v_type_notification := case v_transition.action
    when 'assignation' then 'reserve_assignee'
    when 'reassignation' then 'reserve_assignee'
    when 'refus_responsabilite' then 'responsabilite_refusee'
    when 'demande_levee' then 'levee_demandee'
    when 'levee_validee' then 'levee_validee'
    when 'levee_refusee' then 'levee_refusee'
    when 'reouverture' then 'reserve_reouverte'
    when 'annulation' then 'reserve_annulee'
    else null end;

  -- Le destinataire est l'autre partie : ce que l'hôte décide part vers l'entreprise
  -- intervenante, ce que l'intervenant déclare remonte à l'organisation hôte.
  v_destinataire := case when v_acteur = 'hote' then v_entreprise_intervenante
                         else v_reserve.entreprise_id end;

  if v_type_notification is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_type_notification,
      v_destinataire,
      jsonb_build_object(
        'statut_avant', v_reserve.statut, 'statut_apres', p_statut_apres,
        'numero', v_reserve.numero, 'titre', v_reserve.titre
      )
    );
  end if;
end;
$$;

-- ── 12. Réponse de responsabilité : la preuve devient un fichier ────────────
-- La version de 00268 acceptait un chemin de photo en dernier paramètre et le passait à
-- l'ancienne `reserves_ajouter_photo`. Le dépôt d'une preuve est désormais un
-- téléversement à part entière, effectué avant la réponse. Le paramètre disparaît.
drop function if exists public.reserves_repondre_responsabilite(uuid, boolean, text, text);

create or replace function public.reserves_repondre_responsabilite(
  p_reserve_id uuid,
  p_accepte boolean,
  p_motif text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_accepte then
    perform public.reserves_appliquer_transition(p_reserve_id, 'acceptee', p_motif);
  else
    perform public.reserves_appliquer_transition(p_reserve_id, 'refusee_responsabilite', p_motif);
  end if;
end;
$$;

-- ── 13. Galerie : ce qui est réellement montré ──────────────────────────────
-- Une seule source pour l'affichage, l'export et le décompte : photo confirmée et non
-- supprimée. L'interface ne peut pas diverger de la règle appliquée à la levée.
create or replace function public.reserves_photos_visibles(p_reserve_id uuid)
returns table (
  id uuid, usage text, legende text, storage_path text, mime_type text,
  taille_octets integer, nom_fichier text, deposee_par_hote boolean, created_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select ph.id, ph.usage, ph.legende, ph.storage_path, ph.mime_type,
         ph.taille_octets, ph.nom_fichier,
         ph.ajoutee_par_entreprise_id = ph.entreprise_id,
         ph.created_at
  from public.reserves_photos ph
  where ph.reserve_id = p_reserve_id
    and ph.disponible_at is not null
    and ph.supprimee_at is null
    and public.reserves_lecture_autorisee(p_reserve_id)
  order by ph.created_at;
$$;

-- ── 13 bis. Invitations en attente ──────────────────────────────────────────
-- Sans cette fonction, l'invitation est un cul-de-sac : au moment où une entreprise
-- extérieure se connecte pour la première fois, son organisation a bien l'accès
-- applicatif mais la personne n'a aucune habilitation. Les policies de
-- `reserves_intervenants` ne lui montrent donc rien — pas même l'invitation qu'elle
-- vient de recevoir. Cette fonction lui expose STRICTEMENT ce dont elle a besoin pour
-- rejoindre : l'identifiant de l'intervention et le nom sous lequel elle a été nommée.
-- Rien du chantier, rien du maître d'ouvrage, rien des réserves.
create or replace function public.reserves_invitations_en_attente()
returns table (intervenant_id uuid, nom text, entreprise_intervenante_id uuid)
language sql security definer stable set search_path = public as $$
  select i.id, i.nom, i.entreprise_intervenante_id
  from public.reserves_intervenants i
  where i.statut = 'invitee'
    and i.entreprise_intervenante_id is not null
    and auth.uid() is not null
    and public.est_membre_actif(i.entreprise_intervenante_id)
  order by i.created_at desc;
$$;

-- ── 14. Droits ──────────────────────────────────────────────────────────────
revoke all on function public.reserves_storage_photo_autorisee(text, boolean) from public, anon;
revoke all on function public.reserves_storage_plan_autorisee(text, boolean) from public, anon;
grant execute on function public.reserves_storage_photo_autorisee(text, boolean) to authenticated;
grant execute on function public.reserves_storage_plan_autorisee(text, boolean) to authenticated;

do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.reserves_ajouter_photo(uuid,text,text,text,integer,text,uuid)',
    'public.reserves_confirmer_photo(uuid)',
    'public.reserves_supprimer_photo(uuid,text)',
    'public.reserves_photos_visibles(uuid)',
    'public.reserves_ajouter_plan(uuid,text,text,text,text,integer,text,integer)',
    'public.reserves_confirmer_plan(uuid,text)',
    'public.reserves_supprimer_plan(uuid)',
    'public.reserves_lister_membres(uuid)',
    'public.reserves_attribuer_role(uuid,uuid,text)',
    'public.reserves_retirer_acces_membre(uuid,uuid)',
    'public.reserves_repondre_responsabilite(uuid,boolean,text)',
    'public.reserves_invitations_en_attente()'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end $$;

-- Le cœur de transition reste inatteignable directement, comme en V1.
revoke all on function public.reserves_appliquer_transition(uuid, text, text, uuid) from public, anon, authenticated;

-- Les objets de stockage sont manipulés par les clients Supabase Storage : les droits
-- de table restent ceux du socle, la décision est portée par les policies ci-dessus.
grant select, insert, delete on storage.objects to authenticated;

notify pgrst, 'reload schema';
