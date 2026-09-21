-- ELSATIA Colors V1.4 — traçabilité produit : activité récente, modifications
-- champ par champ, tri par date d'ajout.
--
-- Migration strictement ADDITIVE et limitée au périmètre métier Colors
-- (`colors_*`). Aucune table, fonction, politique ou droit du socle
-- multi-applications n'est touché ; aucune migration antérieure n'est modifiée.
--
-- Constat d'audit à l'origine du lot (branche Colors au ledger 00249) :
--   * `colors_seaux` porte `created_at`, `updated_at`, `created_by`,
--     `archived_at` et `etat_avant_archivage`, mais AUCUN `updated_by` :
--     « qui a modifié en dernier » était structurellement indisponible ;
--   * `colors_mouvements` journalise déjà les flux quantité / emplacement /
--     état (création, sortie, déplacement, archivage, restauration…) mais
--     `colors_modifier_seau` et `colors_definir_photo` ne laissaient AUCUNE
--     trace : une erreur de saisie (marque, produit, teinte, HEX, notes) était
--     irretrouvable ;
--   * aucun index ne servait un tri chronologique global de l'activité à
--     l'échelle de l'organisation, ni un tri par date d'ajout des produits ;
--   * la suppression physique est déjà fermée (DELETE révoqué pour tous les
--     rôles API depuis V1.3) : la « corbeille » est l'état `archive`, et la
--     restauration existe déjà via `colors_archiver_seau(..., false)`. Rien
--     n'est donc converti ici en suppression logique : le modèle l'est déjà.

-- 1. Auteur de la dernière modification ---------------------------------------
alter table public.colors_seaux
  add column if not exists updated_by uuid references public.utilisateurs(id) on delete restrict;

comment on column public.colors_seaux.updated_by is
  'Dernier auteur d''une mutation métier du seau. Renseigné exclusivement par le trigger colors_valider_seau (aucune écriture directe possible).';

-- 2. Journal : nouveaux types d'événement et diff champ par champ -------------
--    Élargissement du domaine `type` (aucune valeur existante invalidée).
--    Le nom de la contrainte d'origine est généré par PostgreSQL (contrainte de
--    colonne posée en 00246) : on la retrouve par sa définition plutôt que par
--    un nom supposé, afin que la migration s'applique aussi bien sur le ledger
--    Colors que sur le socle canonique.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'colors_mouvements' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%restauration%'
      and pg_get_constraintdef(c.oid) like '%passage_vide%'
  loop
    execute format('alter table public.colors_mouvements drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.colors_mouvements add constraint colors_mouvements_type_check
  check (type in (
    'entree','sortie','consommation','retour_chantier','deplacement','ajustement',
    'ouverture','fermeture','passage_vide','archivage','restauration',
    'modification','photo'
  ));

alter table public.colors_mouvements
  add column if not exists champs_modifies jsonb;

comment on column public.colors_mouvements.champs_modifies is
  'Diff descriptif [{champ,avant,apres}] des événements « modification » et « photo ». Valeurs texte tronquées ; aucun binaire, aucune photo, aucun chemin Storage complet.';

-- Forme structurelle vérifiable par contrainte (fonctions immuables uniquement).
-- La taille et le domaine des champs sont vérifiés par le trigger d'écriture,
-- seul point d'entrée possible du journal.
alter table public.colors_mouvements drop constraint if exists colors_mouvements_champs_modifies_forme_v14;
alter table public.colors_mouvements
  add constraint colors_mouvements_champs_modifies_forme_v14 check (
    champs_modifies is null
    or (
      jsonb_typeof(champs_modifies) = 'array'
      and jsonb_array_length(champs_modifies) between 1 and 12
    )
  );

alter table public.colors_mouvements drop constraint if exists colors_mouvements_champs_modifies_type_v14;
alter table public.colors_mouvements
  add constraint colors_mouvements_champs_modifies_type_v14 check (
    champs_modifies is null or type in ('modification','photo')
  );

-- 3. Index de service de l'activité et des tris produit ----------------------
create index if not exists colors_mouvements_activite_idx
  on public.colors_mouvements (entreprise_id, created_at desc, id desc);
create index if not exists colors_mouvements_activite_type_idx
  on public.colors_mouvements (entreprise_id, type, created_at desc);
create index if not exists colors_mouvements_activite_auteur_idx
  on public.colors_mouvements (entreprise_id, auteur_id, created_at desc);
create index if not exists colors_seaux_ajout_idx
  on public.colors_seaux (entreprise_id, created_at desc, id desc);
create index if not exists colors_seaux_nom_idx
  on public.colors_seaux (entreprise_id, marque, produit);

-- 4. Utilitaires de diff ------------------------------------------------------
create or replace function public.colors_extrait_valeur(p_valeur text, p_max integer default 200)
returns text language sql immutable set search_path = public as $$
  select case
    when p_valeur is null then null
    when length(p_valeur) <= greatest(coalesce(p_max, 200), 1) then p_valeur
    else left(p_valeur, greatest(coalesce(p_max, 200), 1)) || '…'
  end;
$$;

comment on function public.colors_extrait_valeur(text,integer) is
  'Tronque une valeur texte destinée au journal Colors : le journal reste un journal, jamais un stockage de contenu.';

create or replace function public.colors_diff_seau(avant public.colors_seaux, apres public.colors_seaux)
returns jsonb language sql immutable set search_path = public as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'champ', c.champ,
        'avant', public.colors_extrait_valeur(c.valeur_avant),
        'apres', public.colors_extrait_valeur(c.valeur_apres)
      ) order by c.rang
    ),
    '[]'::jsonb
  )
  from (values
    (1, 'marque',            avant.marque,            apres.marque),
    (2, 'produit',           avant.produit,           apres.produit),
    (3, 'reference_produit', avant.reference_produit, apres.reference_produit),
    (4, 'teinte_nom',        avant.teinte_nom,        apres.teinte_nom),
    (5, 'teinte_reference',  avant.teinte_reference,  apres.teinte_reference),
    (6, 'couleur_hex',       avant.couleur_hex,       apres.couleur_hex),
    (7, 'notes',             avant.notes,             apres.notes)
  ) as c(rang, champ, valeur_avant, valeur_apres)
  where c.valeur_avant is distinct from c.valeur_apres;
$$;

comment on function public.colors_diff_seau(public.colors_seaux,public.colors_seaux) is
  'Diff des champs descriptifs d''un seau Colors. Ne couvre jamais la photo, les quantités ni l''état : ces flux ont leurs propres types de mouvement.';

-- 5. Garde d'écriture du journal : forme et bornes du diff --------------------
--    Remplace la version V1.1 en conservant sa règle centrale (écriture
--    réservée au propriétaire `postgres`, donc aux seules RPC SECURITY DEFINER)
--    et en y ajoutant la validation du nouveau champ `champs_modifies`.
create or replace function public.colors_valider_mouvement()
returns trigger language plpgsql security invoker set search_path = public as $$
declare v_entree jsonb; v_champ text;
begin
  if current_user <> 'postgres' then raise exception 'Le journal Colors est réservé aux actions métier'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if tg_op = 'INSERT' and auth.uid() is not null then new.auteur_id := auth.uid(); end if;
  if new.champs_modifies is not null then
    if octet_length(new.champs_modifies::text) > 8192 then
      raise exception 'Diff Colors trop volumineux pour le journal';
    end if;
    for v_entree in select value from jsonb_array_elements(new.champs_modifies) loop
      if jsonb_typeof(v_entree) <> 'object' then raise exception 'Diff Colors invalide'; end if;
      v_champ := v_entree ->> 'champ';
      if v_champ is null or v_champ not in (
        'marque','produit','reference_produit','teinte_nom','teinte_reference',
        'couleur_hex','notes','photo'
      ) then
        raise exception 'Champ Colors non journalisable';
      end if;
      if (v_entree -> 'avant') is null or (v_entree -> 'apres') is null then
        raise exception 'Diff Colors incomplet';
      end if;
    end loop;
  end if;
  return new;
end; $$;

-- 6. Modification descriptive : journalisée, ancienne → nouvelle valeur -------
create or replace function public.colors_modifier_seau(
  p_seau_id uuid,p_marque text,p_produit text,p_reference_produit text,p_teinte_nom text,
  p_teinte_reference text,p_couleur_hex text,p_notes text
) returns public.colors_seaux language plpgsql security definer set search_path = public as $$
declare avant public.colors_seaux; v public.colors_seaux; v_diff jsonb;
begin
  select * into avant from public.colors_seaux where id=p_seau_id for update;
  if avant.id is null or not public.colors_action_autorisee(avant.entreprise_id,'modifier_seau') then raise exception 'Accès Colors refusé'; end if;
  if btrim(coalesce(p_marque,''))='' or btrim(coalesce(p_produit,''))='' then raise exception 'Marque et produit requis'; end if;
  update public.colors_seaux set marque=left(btrim(p_marque),120),produit=left(btrim(p_produit),180),
    reference_produit=nullif(left(btrim(p_reference_produit),120),''),teinte_nom=nullif(left(btrim(p_teinte_nom),180),''),
    teinte_reference=nullif(left(btrim(p_teinte_reference),120),''),couleur_hex=nullif(upper(left(btrim(p_couleur_hex),7)),''),
    notes=nullif(left(btrim(p_notes),4000),'') where id=avant.id returning * into v;
  v_diff := public.colors_diff_seau(avant, v);
  if jsonb_array_length(v_diff) > 0 then
    insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif,champs_modifies)
    values(v.entreprise_id,v.id,'modification',v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,v.etat,v.etat,auth.uid(),null,v_diff);
  end if;
  return v;
end; $$;

-- 7. Photo principale : journalisée elle aussi (nom de fichier seulement) -----
create or replace function public.colors_definir_photo(p_seau_id uuid,p_photo_path text)
returns public.colors_seaux language plpgsql security definer set search_path = public, storage as $$
declare v public.colors_seaux; v_avant text; v_diff jsonb;
begin
  select * into v from public.colors_seaux where id=p_seau_id for update;
  if v.id is null or not public.colors_action_autorisee(v.entreprise_id,'ocr') then raise exception 'Accès Colors refusé'; end if;
  if p_photo_path is not null and not public.colors_photo_stockage_valide(v.entreprise_id,v.id,p_photo_path) then
    raise exception 'Photo Colors invalide';
  end if;
  v_avant := v.photo_principale_path;
  if v_avant is not distinct from p_photo_path then return v; end if;
  update public.colors_seaux set photo_principale_path=p_photo_path where id=v.id returning * into v;
  -- Seul le nom terminal du fichier est journalisé : ni le chemin Storage
  -- complet (qui porte l'identifiant d'organisation), ni le binaire.
  v_diff := jsonb_build_array(jsonb_build_object(
    'champ','photo',
    'avant', public.colors_extrait_valeur(regexp_replace(coalesce(v_avant,''), '^.*/', ''), 120),
    'apres', public.colors_extrait_valeur(regexp_replace(coalesce(p_photo_path,''), '^.*/', ''), 120)
  ));
  insert into public.colors_mouvements(entreprise_id,seau_id,type,quantite_avant,quantite_apres,pourcentage_avant,pourcentage_apres,unite,emplacement_avant_id,emplacement_apres_id,etat_avant,etat_apres,auteur_id,motif,champs_modifies)
  values(v.entreprise_id,v.id,'photo',v.quantite_restante,v.quantite_restante,v.pourcentage_restant,v.pourcentage_restant,v.unite,v.emplacement_id,v.emplacement_id,v.etat,v.etat,auth.uid(),null,v_diff);
  return v;
end; $$;

-- 8. `updated_by` sur toutes les voies métier ---------------------------------
--    Reprise fidèle de la garde V1.1 (toute mutation directe reste refusée),
--    complétée par la seule affectation de `updated_by`. Un trigger plutôt
--    qu'une réécriture des six RPC : aucune voie d'écriture ne peut l'oublier.
create or replace function public.colors_valider_seau()
returns trigger language plpgsql set search_path = public as $$
declare v_emplacement_entreprise uuid;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null and current_user <> 'postgres' then raise exception 'Utilisateur Colors requis'; end if;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  elsif new.created_by is distinct from old.created_by or new.entreprise_id is distinct from old.entreprise_id then
    raise exception 'Auteur et entreprise immuables';
  end if;
  if new.couleur_hex is not null then new.couleur_hex := upper(new.couleur_hex); end if;
  if new.emplacement_id is not null then
    select entreprise_id into v_emplacement_entreprise from public.colors_emplacements where id = new.emplacement_id and actif;
    if v_emplacement_entreprise is distinct from new.entreprise_id then raise exception 'Emplacement Colors invalide'; end if;
  end if;
  if new.etat = 'ouvert' and new.date_ouverture is null then new.date_ouverture := current_date; end if;
  if new.etat = 'archive' and new.archived_at is null then new.archived_at := now(); end if;
  if new.etat <> 'archive' then new.archived_at := null; end if;
  if tg_op = 'UPDATE' then
    new.updated_by := coalesce(auth.uid(), old.updated_by);
    if current_user <> 'postgres' then
      raise exception 'Utilisez une action métier Colors pour cette modification';
    end if;
  end if;
  return new;
end;
$$;

-- 9. Lecture de l'activité ----------------------------------------------------
--    RPC unique servant l'écran « Activité récente » ET l'historique de fiche.
--    SECURITY DEFINER obligatoire : elle joint `public.utilisateurs` pour
--    afficher l'auteur, table à laquelle un rôle Colors n'a pas accès. Le
--    cloisonnement est intégralement décidé côté serveur :
--      * habilitation vérifiée par `colors_action_autorisee(...,'voir')`
--        (UID + tenant + rôle Colors, et pour l'administrateur plateforme
--        uniquement pendant un accès support actif) ;
--      * `entreprise_id` figé sur le paramètre : aucun événement d'une autre
--        organisation ne peut apparaître, y compris via `p_seau_id` ;
--      * l'identité de l'auteur n'est exposée que s'il est effectivement
--        rattaché à l'organisation demandée.
create or replace function public.colors_activite_recente(
  p_entreprise_id uuid,
  p_seau_id uuid default null,
  p_depuis timestamptz default null,
  p_types text[] default null,
  p_auteur_id uuid default null,
  p_emplacement_id uuid default null,
  p_limite integer default 50,
  p_avant_created_at timestamptz default null,
  p_avant_id uuid default null
) returns table(
  id uuid, seau_id uuid, type text, created_at timestamptz,
  motif text, champs_modifies jsonb,
  quantite_avant numeric, quantite_apres numeric,
  pourcentage_avant numeric, pourcentage_apres numeric, unite text,
  etat_avant text, etat_apres text,
  emplacement_avant text, emplacement_apres text,
  auteur_id uuid, auteur_nom text,
  seau_marque text, seau_produit text, seau_teinte text, seau_couleur_hex text, seau_etat text
) language plpgsql security definer stable set search_path = public as $$
declare v_limite integer := least(greatest(coalesce(p_limite, 50), 1), 100);
begin
  if not public.colors_action_autorisee(p_entreprise_id, 'voir') then raise exception 'Accès Colors refusé'; end if;
  return query
    select m.id, m.seau_id, m.type, m.created_at, m.motif, m.champs_modifies,
      m.quantite_avant, m.quantite_apres, m.pourcentage_avant, m.pourcentage_apres, m.unite,
      m.etat_avant, m.etat_apres, ea.nom, ep.nom,
      m.auteur_id, nullif(btrim(coalesce(u.prenom,'') || ' ' || coalesce(u.nom,'')), ''),
      s.marque, s.produit, coalesce(s.teinte_nom, s.teinte_reference), s.couleur_hex, s.etat
    from public.colors_mouvements m
    join public.colors_seaux s on s.id = m.seau_id and s.entreprise_id = p_entreprise_id
    left join public.colors_emplacements ea on ea.id = m.emplacement_avant_id and ea.entreprise_id = p_entreprise_id
    left join public.colors_emplacements ep on ep.id = m.emplacement_apres_id and ep.entreprise_id = p_entreprise_id
    left join public.utilisateurs u on u.id = m.auteur_id and exists (
      select 1 from public.utilisateurs_entreprises ue
      where ue.utilisateur_id = u.id and ue.entreprise_id = p_entreprise_id
    )
    where m.entreprise_id = p_entreprise_id
      and (p_seau_id is null or m.seau_id = p_seau_id)
      and (p_depuis is null or m.created_at >= p_depuis)
      and (p_types is null or m.type = any(p_types))
      and (p_auteur_id is null or m.auteur_id = p_auteur_id)
      and (p_emplacement_id is null or p_emplacement_id in (s.emplacement_id, m.emplacement_avant_id, m.emplacement_apres_id))
      and (
        p_avant_created_at is null
        or (m.created_at, m.id) < (p_avant_created_at, coalesce(p_avant_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by m.created_at desc, m.id desc
    limit v_limite;
end; $$;

comment on function public.colors_activite_recente(uuid,uuid,timestamptz,text[],uuid,uuid,integer,timestamptz,uuid) is
  'Activité produit Colors, paginée par curseur (created_at,id) côté serveur. Ne retourne jamais l''activité d''une autre organisation.';

-- 10. Acteurs présents dans le journal (filtre « utilisateur ») ---------------
create or replace function public.colors_acteurs_activite(p_entreprise_id uuid)
returns table(auteur_id uuid, auteur_nom text)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.colors_action_autorisee(p_entreprise_id, 'voir') then raise exception 'Accès Colors refusé'; end if;
  return query
    select distinct m.auteur_id,
      coalesce(nullif(btrim(coalesce(u.prenom,'') || ' ' || coalesce(u.nom,'')), ''), 'Utilisateur Colors')
    from public.colors_mouvements m
    join public.utilisateurs u on u.id = m.auteur_id
    where m.entreprise_id = p_entreprise_id
      and exists (
        select 1 from public.utilisateurs_entreprises ue
        where ue.utilisateur_id = u.id and ue.entreprise_id = p_entreprise_id
      )
    order by 2;
end; $$;

-- 11. Droits : même discipline que V1.3 --------------------------------------
revoke all on function public.colors_extrait_valeur(text,integer) from public, anon, authenticated, service_role;
revoke all on function public.colors_diff_seau(public.colors_seaux,public.colors_seaux) from public, anon, authenticated, service_role;
revoke all on function public.colors_valider_mouvement() from public, anon, authenticated, service_role;
revoke all on function public.colors_valider_seau() from public, anon, authenticated, service_role;
revoke all on function public.colors_activite_recente(uuid,uuid,timestamptz,text[],uuid,uuid,integer,timestamptz,uuid) from public, anon, service_role;
revoke all on function public.colors_acteurs_activite(uuid) from public, anon, service_role;
revoke all on function public.colors_modifier_seau(uuid,text,text,text,text,text,text,text) from public, anon, service_role;
revoke all on function public.colors_definir_photo(uuid,text) from public, anon, service_role;
grant execute on function public.colors_activite_recente(uuid,uuid,timestamptz,text[],uuid,uuid,integer,timestamptz,uuid) to authenticated;
grant execute on function public.colors_acteurs_activite(uuid) to authenticated;
grant execute on function public.colors_modifier_seau(uuid,text,text,text,text,text,text,text) to authenticated;
grant execute on function public.colors_definir_photo(uuid,text) to authenticated;

-- Le journal reste strictement append-only pour tous les rôles API.
revoke insert, update, delete, truncate on table public.colors_mouvements from public, anon, authenticated, service_role;

notify pgrst,'reload schema';
