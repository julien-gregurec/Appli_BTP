-- GP-PILOT — Réception commande fournisseur → stock, moteur transactionnel unique.
--
-- Défaut corrigé : la réception depuis /commandes/[id] (enregistrer_reception_commande)
-- ne créait jamais de mouvement dans public.mouvements_stock — seules
-- lignes_commande.quantite_recue et commandes_fournisseurs.statut étaient mis à jour.
-- Le stock réel n'était donc crédité que par un second parcours indépendant
-- (/stock/reception → enregistrer_reception_lot[_borne]), lui-même sans mécanisme
-- d'idempotence : un rejeu (double clic, retry réseau) pouvait créditer deux fois.
-- changer_statut_commande_interne('recue') présentait le même défaut par une troisième
-- voie (bascule manuelle de statut sans aucun mouvement de stock).
--
-- Cette migration introduit UN SEUL moteur : public.appliquer_reception_ligne_commande,
-- appelé par les trois entrées existantes (réception commande, scan dépôt/borne,
-- bascule manuelle « reçue »), et un mécanisme d'idempotence explicite partagé
-- (public.receptions_idempotence) pour les appels par lot. Aucune migration
-- historique n'est modifiée : uniquement des colonnes additives et des
-- CREATE OR REPLACE FUNCTION.

-- ─────────────────────────────────────────────────────────────
-- 1) Modèle canonique : une ligne de commande peut être reliée à un article de
--    stock. Nullable (une ligne de sous-traitance ou de service n'a pas
--    vocation à toucher le stock). La FK composite (article_id, entreprise_id)
--    garantit au niveau base qu'une ligne ne peut jamais référencer un article
--    d'une autre entreprise.
-- ─────────────────────────────────────────────────────────────
create unique index if not exists lignes_commande_id_entreprise_unique
  on public.lignes_commande(id, entreprise_id);

alter table public.lignes_commande
  add column if not exists article_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lignes_commande_article_entreprise_fk') then
    alter table public.lignes_commande add constraint lignes_commande_article_entreprise_fk
      foreign key (article_id, entreprise_id) references public.articles_stock(id, entreprise_id)
      on delete restrict;
  end if;
end $$;

create index if not exists lignes_commande_article_idx
  on public.lignes_commande(article_id) where article_id is not null;

-- Traçabilité : un mouvement de stock peut pointer vers la ligne de commande
-- qui l'a généré (composite FK, même garantie d'isolation tenant).
alter table public.mouvements_stock
  add column if not exists ligne_commande_id uuid;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'mouvements_stock_ligne_commande_entreprise_fk') then
    alter table public.mouvements_stock add constraint mouvements_stock_ligne_commande_entreprise_fk
      foreign key (ligne_commande_id, entreprise_id) references public.lignes_commande(id, entreprise_id)
      on delete set null;
  end if;
end $$;

create index if not exists mouvements_stock_ligne_commande_idx
  on public.mouvements_stock(ligne_commande_id) where ligne_commande_id is not null;

-- ─────────────────────────────────────────────────────────────
-- 2) Idempotence explicite pour les appels par lot (scan dépôt/borne, et
--    réception commande si un appelant fournit une clé). Une même clé, pour
--    une même entreprise, ne produit jamais deux fois les écritures : le
--    second appel reçoit le résultat déjà mémorisé sans aucune nouvelle
--    écriture. Le verrou de ligne (insert … on conflict … do update …
--    returning) fait attendre un appel concurrent identique jusqu'à la fin du
--    premier plutôt que de le laisser retraiter en parallèle.
-- ─────────────────────────────────────────────────────────────
create table public.receptions_idempotence (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  idempotency_key uuid not null,
  resultat jsonb,
  created_at timestamptz not null default now(),
  traite_at timestamptz,
  unique (entreprise_id, idempotency_key)
);
alter table public.receptions_idempotence enable row level security;
create policy "membres receptions idempotence" on public.receptions_idempotence
  for select using (public.est_membre_actif(entreprise_id));
grant select on public.receptions_idempotence to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) Moteur canonique unique : réceptionner UNE ligne de commande vers une
--    quantité reçue CUMULÉE cible (pas un delta). C'est ce contrat qui rend
--    le rejeu exact idempotent par construction : sous verrou de ligne, un
--    second appel portant la même cible calcule un delta nul et n'écrit
--    aucun second mouvement — sans avoir besoin d'une clé d'idempotence pour
--    ce cas précis. Ordre de verrouillage volontairement fixe et identique
--    pour tous les appelants (commande, puis ligne) afin qu'aucune paire
--    d'appels concurrents ne puisse se verrouiller en sens inverse
--    (interblocage) : voir docs/qualification pour le détail du raisonnement.
--    Fonction interne : jamais accordée à anon/authenticated, appelée
--    uniquement par les fonctions publiques ci-dessous.
-- ─────────────────────────────────────────────────────────────
create or replace function public.appliquer_reception_ligne_commande(
  p_entreprise_id uuid,
  p_ligne_commande_id uuid,
  p_quantite_recue_cible numeric,
  p_article_id_scan uuid default null,
  p_employe_id uuid default null,
  p_saisi_via_borne boolean default false,
  p_source text default 'commande'
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_commande_id uuid;
  v_commande public.commandes_fournisseurs;
  v_ligne public.lignes_commande;
  v_article_id uuid;
  v_ancienne numeric;
  v_delta numeric;
  v_mouvement_id uuid;
  v_mouvement_type text;
  v_suffixe text;
begin
  if p_quantite_recue_cible is null or p_quantite_recue_cible < 0 then
    raise exception 'Quantité reçue invalide';
  end if;

  -- Lecture non verrouillée : commande_id est immuable après création de la
  -- ligne, aucune course possible sur cette seule valeur.
  select l.commande_id into v_commande_id
  from public.lignes_commande l
  where l.id = p_ligne_commande_id and l.entreprise_id = p_entreprise_id;
  if not found then raise exception 'Ligne de commande introuvable'; end if;

  -- Ordre de verrouillage fixe : commande d'abord, puis ligne. Voir
  -- commentaire ci-dessus.
  select c.* into v_commande
  from public.commandes_fournisseurs c
  where c.id = v_commande_id and c.entreprise_id = p_entreprise_id
  for update;
  if not found then raise exception 'Commande introuvable'; end if;

  select l.* into v_ligne
  from public.lignes_commande l
  where l.id = p_ligne_commande_id and l.entreprise_id = p_entreprise_id
  for update;
  if not found then raise exception 'Ligne de commande introuvable'; end if;

  if p_quantite_recue_cible > v_ligne.quantite then
    raise exception 'La quantité reçue (%) dépasse la quantité commandée (%)',
      p_quantite_recue_cible, v_ligne.quantite;
  end if;

  -- Rejeu exact (double clic, retry réseau, appel concurrent identique ayant
  -- attendu ce verrou) : calculé AVANT le garde de statut de la commande,
  -- pour qu'un appel qui ne change rien reste un no-op idempotent même une
  -- fois la commande passée à « reçue » (sinon un simple double clic sur un
  -- appel déjà appliqué échouerait avec « commande non réceptionnable »
  -- au lieu de renvoyer silencieusement l'état déjà atteint).
  v_ancienne := v_ligne.quantite_recue;
  v_delta := p_quantite_recue_cible - v_ancienne;
  if v_delta = 0 then
    return jsonb_build_object(
      'ligne_commande_id', v_ligne.id, 'quantite_recue', v_ancienne,
      'delta', 0, 'mouvement_id', null, 'rejeu', true
    );
  end if;

  if v_commande.statut not in ('envoyee', 'confirmee', 'recue_partiel') then
    raise exception 'Cette commande ne peut pas être réceptionnée';
  end if;

  -- Réconciliation article ↔ ligne de commande : premier appel avec un
  -- article scanné relie la ligne, un appel suivant doit être cohérent.
  v_article_id := v_ligne.article_id;
  if p_article_id_scan is not null then
    if v_article_id is not null and v_article_id <> p_article_id_scan then
      raise exception 'Cette ligne de commande est déjà reliée à un autre article de stock';
    end if;
    if not exists (
      select 1 from public.articles_stock
      where id = p_article_id_scan and entreprise_id = p_entreprise_id
    ) then raise exception 'Article de stock introuvable dans cette entreprise'; end if;
    if v_article_id is null then
      update public.lignes_commande set article_id = p_article_id_scan where id = v_ligne.id;
      v_article_id := p_article_id_scan;
    end if;
  end if;

  update public.lignes_commande
  set quantite_recue = p_quantite_recue_cible
  where id = v_ligne.id;

  if v_article_id is not null then
    v_mouvement_type := case when v_delta > 0 then 'entree' else 'sortie' end;
    v_suffixe := case p_source when 'scan' then ' (scan dépôt)' when 'scan_borne' then ' (scan borne)'
                   when 'statut_manuel' then ' (bascule manuelle du statut)' else '' end;
    insert into public.mouvements_stock (
      entreprise_id, article_id, chantier_id, ligne_commande_id, type, quantite, motif,
      employe_id, cree_par_utilisateur_id, saisi_via_borne
    ) values (
      p_entreprise_id, v_article_id, v_commande.chantier_id, v_ligne.id, v_mouvement_type, abs(v_delta),
      (case when v_delta > 0 then 'Réception commande ' else 'Correction réception commande ' end)
        || v_commande.numero || ' — ' || v_ligne.designation || v_suffixe,
      p_employe_id, auth.uid(), p_saisi_via_borne
    ) returning id into v_mouvement_id;
  end if;

  return jsonb_build_object(
    'ligne_commande_id', v_ligne.id, 'quantite_recue', p_quantite_recue_cible,
    'delta', v_delta, 'mouvement_id', v_mouvement_id, 'rejeu', false
  );
end;
$$;
revoke all on function public.appliquer_reception_ligne_commande(uuid,uuid,numeric,uuid,uuid,boolean,text)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4) Parcours commande : /commandes/[id] → Réceptionner. Remplace le corps
--    historique (simple UPDATE de quantite_recue) par une boucle sur le
--    moteur canonique, dans la même transaction. p_idempotency_key est
--    optionnel : le contrat « cible cumulée » rend déjà le rejeu exact
--    idempotent par construction (voir moteur ci-dessus) ; la clé, quand elle
--    est fournie, ajoute une garantie supplémentaire testable au niveau du
--    lot entier et évite de retraiter les lignes une à une sur un rejeu.
-- ─────────────────────────────────────────────────────────────
-- CREATE OR REPLACE ne remplace jamais une fonction d'arité différente : sans
-- ce DROP explicite, l'ancienne version à 3 arguments (le défaut corrigé ici)
-- resterait présente en base, appelable en parallèle de la nouvelle.
drop function if exists public.enregistrer_reception_commande_interne(uuid, uuid, jsonb);

create or replace function public.enregistrer_reception_commande_interne(
  p_entreprise_id uuid, p_commande_id uuid, p_lignes jsonb, p_idempotency_key uuid default null
) returns text language plpgsql security definer set search_path to 'public' as $$
declare
  v_resultat_existant jsonb;
  v_statut text;
  v_ligne record;
  v_attendu int;
  v_trouve int;
begin
  if p_idempotency_key is not null then
    insert into public.receptions_idempotence(entreprise_id, idempotency_key)
    values (p_entreprise_id, p_idempotency_key)
    on conflict (entreprise_id, idempotency_key)
      do update set idempotency_key = excluded.idempotency_key
    returning resultat into v_resultat_existant;
    if v_resultat_existant is not null then
      return v_resultat_existant->>'statut';
    end if;
  end if;

  if not exists (
    select 1 from public.commandes_fournisseurs
    where id = p_commande_id and entreprise_id = p_entreprise_id
  ) then raise exception 'Commande introuvable'; end if;

  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Aucune quantité reçue';
  end if;

  v_attendu := jsonb_array_length(p_lignes);
  select count(*) into v_trouve
  from jsonb_to_recordset(p_lignes) as r(ligne_id uuid, quantite_recue numeric)
  join public.lignes_commande l on l.id = r.ligne_id
    and l.commande_id = p_commande_id and l.entreprise_id = p_entreprise_id
  where r.quantite_recue between 0 and l.quantite;
  if v_trouve <> v_attendu then raise exception 'Réception invalide ou ligne étrangère'; end if;

  for v_ligne in
    select r.ligne_id, r.quantite_recue
    from jsonb_to_recordset(p_lignes) as r(ligne_id uuid, quantite_recue numeric)
    order by r.ligne_id
  loop
    perform public.appliquer_reception_ligne_commande(
      p_entreprise_id, v_ligne.ligne_id, v_ligne.quantite_recue,
      p_source => 'commande'
    );
  end loop;

  v_statut := public.recomputer_statut_commande(p_commande_id);

  if p_idempotency_key is not null then
    update public.receptions_idempotence
    set resultat = jsonb_build_object('statut', v_statut), traite_at = now()
    where entreprise_id = p_entreprise_id and idempotency_key = p_idempotency_key;
  end if;

  return v_statut;
end; $$;
revoke all on function public.enregistrer_reception_commande_interne(uuid,uuid,jsonb,uuid)
  from public, anon, authenticated;

drop function if exists public.enregistrer_reception_commande(uuid, uuid, jsonb);

create or replace function public.enregistrer_reception_commande(
  p_entreprise_id uuid, p_commande_id uuid, p_lignes jsonb, p_idempotency_key uuid default null
) returns text language plpgsql security definer set search_path to 'public' as $$begin
  if not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé'; end if;
  return public.enregistrer_reception_commande_interne(p_entreprise_id, p_commande_id, p_lignes, p_idempotency_key);
end;$$;
revoke all on function public.enregistrer_reception_commande(uuid,uuid,jsonb,uuid) from public, anon;
grant execute on function public.enregistrer_reception_commande(uuid,uuid,jsonb,uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5) Bascule manuelle de statut → 'recue' : même défaut (UPDATE direct de
--    quantite_recue sans mouvement). Route désormais chaque ligne encore
--    incomplète par le même moteur canonique avant de changer le statut.
-- ─────────────────────────────────────────────────────────────
create or replace function public.changer_statut_commande_interne(
  p_entreprise_id uuid, p_commande_id uuid, p_statut text
) returns void language plpgsql security definer set search_path to 'public' as $$
declare v_actuel text; v_autorise boolean := false; v_ligne record;
begin
  select statut into v_actuel from public.commandes_fournisseurs
  where id = p_commande_id and entreprise_id = p_entreprise_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if p_statut = v_actuel then return; end if;

  v_autorise := case v_actuel
    when 'brouillon' then p_statut in ('envoyee','annulee')
    when 'envoyee' then p_statut in ('confirmee','recue','annulee')
    when 'confirmee' then p_statut in ('recue','annulee')
    when 'recue_partiel' then p_statut in ('recue','annulee')
    else false end;
  if not v_autorise then raise exception 'Transition de statut non autorisée'; end if;

  if p_statut = 'recue' then
    for v_ligne in
      select id, quantite from public.lignes_commande
      where commande_id = p_commande_id and entreprise_id = p_entreprise_id
        and quantite_recue < quantite
      order by id
    loop
      perform public.appliquer_reception_ligne_commande(
        p_entreprise_id, v_ligne.id, v_ligne.quantite, p_source => 'statut_manuel'
      );
    end loop;
  end if;
  update public.commandes_fournisseurs set statut = p_statut, updated_at = now()
  where id = p_commande_id and entreprise_id = p_entreprise_id;
end; $$;
revoke all on function public.changer_statut_commande_interne(uuid,uuid,text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) Parcours scan (/stock/reception) : converge vers le même moteur pour la
--    part rattachée à une commande fournisseur. Les entrées non rattachées à
--    une commande (réception dépôt libre) restent des mouvements directs —
--    ce n'est pas le flux « commande → stock » visé par ce correctif. Ajoute
--    p_idempotency_key (nouveau paramètre, place finale, valeur par défaut :
--    compatible avec tout appelant existant).
-- ─────────────────────────────────────────────────────────────
drop function if exists public.enregistrer_reception_lot(uuid, jsonb, jsonb, text);

create or replace function public.enregistrer_reception_lot(
  p_entreprise_id uuid, p_lignes jsonb, p_attributions jsonb default '[]'::jsonb,
  p_motif text default null, p_idempotency_key uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_resultat_existant jsonb;
  v_ligne jsonb; v_article uuid; v_quantite numeric;
  v_entrees integer := 0; v_commandes uuid[] := '{}'; v_cmd uuid; v_statuts jsonb := '[]'::jsonb;
  v_attr record; v_cible numeric; v_resultat jsonb;
begin
  if not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'effectuer_entree_stock') then
    raise exception 'Accès refusé';
  end if;

  if p_idempotency_key is not null then
    insert into public.receptions_idempotence(entreprise_id, idempotency_key)
    values (p_entreprise_id, p_idempotency_key)
    on conflict (entreprise_id, idempotency_key)
      do update set idempotency_key = excluded.idempotency_key
    returning resultat into v_resultat_existant;
    if v_resultat_existant is not null then return v_resultat_existant; end if;
  end if;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_article := (v_ligne->>'article_id')::uuid;
    v_quantite := (v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite <= 0 then continue; end if;
    if not exists (select 1 from public.articles_stock
                   where id = v_article and entreprise_id = p_entreprise_id) then
      raise exception 'Article inconnu dans cette entreprise';
    end if;
    insert into public.mouvements_stock (entreprise_id, article_id, type, quantite, motif, cree_par_utilisateur_id)
    values (p_entreprise_id, v_article, 'entree', v_quantite,
            coalesce(nullif(btrim(p_motif), ''), 'Réception au dépôt'), auth.uid());
    v_entrees := v_entrees + 1;
  end loop;

  for v_attr in
    select (x->>'ligne_commande_id')::uuid as ligne_commande_id,
           (x->>'quantite')::numeric as quantite,
           nullif(x->>'article_id', '')::uuid as article_id
    from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb)) as x
    order by (x->>'ligne_commande_id')::uuid
  loop
    if v_attr.ligne_commande_id is null or v_attr.quantite is null or v_attr.quantite <= 0 then continue; end if;

    select least(l.quantite, coalesce(l.quantite_recue, 0) + v_attr.quantite), l.commande_id
      into v_cible, v_cmd
    from public.lignes_commande l
    where l.id = v_attr.ligne_commande_id and l.entreprise_id = p_entreprise_id;
    if not found then raise exception 'Ligne de commande introuvable'; end if;

    perform public.appliquer_reception_ligne_commande(
      p_entreprise_id, v_attr.ligne_commande_id, v_cible,
      p_article_id_scan => v_attr.article_id, p_source => 'scan'
    );

    if not (v_cmd = any(v_commandes)) then v_commandes := array_append(v_commandes, v_cmd); end if;
  end loop;

  foreach v_cmd in array v_commandes loop
    v_statuts := v_statuts || jsonb_build_object('commande_id', v_cmd,
                   'statut', public.recomputer_statut_commande(v_cmd));
  end loop;

  v_resultat := jsonb_build_object('entrees', v_entrees, 'commandes', v_statuts);

  if p_idempotency_key is not null then
    update public.receptions_idempotence
    set resultat = v_resultat, traite_at = now()
    where entreprise_id = p_entreprise_id and idempotency_key = p_idempotency_key;
  end if;

  return v_resultat;
end;
$$;
revoke all on function public.enregistrer_reception_lot(uuid, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.enregistrer_reception_lot(uuid, jsonb, jsonb, text, uuid) to authenticated;

drop function if exists public.enregistrer_reception_lot_borne(uuid, text, text, jsonb, jsonb, text);

create or replace function public.enregistrer_reception_lot_borne(
  p_entreprise_id uuid, p_identifiant_employe text, p_mot_de_passe text,
  p_lignes jsonb, p_attributions jsonb default '[]'::jsonb, p_motif text default null,
  p_idempotency_key uuid default null
) returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $$
declare
  v_employe uuid; v_uid uuid := auth.uid();
  v_resultat_existant jsonb;
  v_ligne jsonb; v_article uuid; v_quantite numeric;
  v_entrees integer := 0; v_commandes uuid[] := '{}'; v_cmd uuid; v_statuts jsonb := '[]'::jsonb;
  v_attr record; v_cible numeric; v_resultat jsonb;
begin
  v_employe := public.employe_borne_autorise(p_entreprise_id, p_identifiant_employe, p_mot_de_passe, 'effectuer_entree_stock');

  if p_idempotency_key is not null then
    insert into public.receptions_idempotence(entreprise_id, idempotency_key)
    values (p_entreprise_id, p_idempotency_key)
    on conflict (entreprise_id, idempotency_key)
      do update set idempotency_key = excluded.idempotency_key
    returning resultat into v_resultat_existant;
    if v_resultat_existant is not null then return v_resultat_existant; end if;
  end if;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb)) loop
    v_article := (v_ligne->>'article_id')::uuid; v_quantite := (v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite <= 0 then continue; end if;
    if not exists (select 1 from public.articles_stock where id = v_article and entreprise_id = p_entreprise_id and actif)
      then raise exception 'Article inconnu ou inactif dans cette entreprise'; end if;
    insert into public.mouvements_stock (
      entreprise_id, article_id, type, quantite, motif, employe_id, cree_par_utilisateur_id, saisi_via_borne
    ) values (
      p_entreprise_id, v_article, 'entree', v_quantite,
      coalesce(nullif(btrim(p_motif), ''), 'Réception groupée au dépôt'), v_employe, v_uid, true
    );
    v_entrees := v_entrees + 1;
  end loop;

  for v_attr in
    select (x->>'ligne_commande_id')::uuid as ligne_commande_id,
           (x->>'quantite')::numeric as quantite,
           nullif(x->>'article_id', '')::uuid as article_id
    from jsonb_array_elements(coalesce(p_attributions, '[]'::jsonb)) as x
    order by (x->>'ligne_commande_id')::uuid
  loop
    if v_attr.ligne_commande_id is null or v_attr.quantite is null or v_attr.quantite <= 0 then continue; end if;

    select least(l.quantite, coalesce(l.quantite_recue, 0) + v_attr.quantite), l.commande_id
      into v_cible, v_cmd
    from public.lignes_commande l
    where l.id = v_attr.ligne_commande_id and l.entreprise_id = p_entreprise_id;
    if not found then raise exception 'Ligne de commande introuvable'; end if;

    perform public.appliquer_reception_ligne_commande(
      p_entreprise_id, v_attr.ligne_commande_id, v_cible,
      p_article_id_scan => v_attr.article_id, p_employe_id => v_employe,
      p_saisi_via_borne => true, p_source => 'scan_borne'
    );

    if not (v_cmd = any(v_commandes)) then v_commandes := array_append(v_commandes, v_cmd); end if;
  end loop;

  foreach v_cmd in array v_commandes loop
    v_statuts := v_statuts || jsonb_build_object('commande_id', v_cmd,
                   'statut', public.recomputer_statut_commande(v_cmd));
  end loop;

  insert into public.tentatives_borne_stock(entreprise_id, utilisateur_id, reussie, motif)
  values (p_entreprise_id, v_uid, true, 'reception_stock_lot');

  v_resultat := jsonb_build_object('entrees', v_entrees, 'commandes', v_statuts);

  if p_idempotency_key is not null then
    update public.receptions_idempotence
    set resultat = v_resultat, traite_at = now()
    where entreprise_id = p_entreprise_id and idempotency_key = p_idempotency_key;
  end if;

  return v_resultat;
end;
$$;
revoke all on function public.enregistrer_reception_lot_borne(uuid, text, text, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.enregistrer_reception_lot_borne(uuid, text, text, jsonb, jsonb, text, uuid)
  to authenticated;

notify pgrst, 'reload schema';
