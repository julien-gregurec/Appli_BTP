-- ALERTES-DELEGATION-V1 : déléguer une alerte opérationnelle du dashboard à
-- un employé de l'entreprise, sans dupliquer les alertes elles-mêmes (elles
-- restent calculées à la volée) ni contourner les permissions métier.
--
-- Modèle retenu : une table dédiée à clé métier (`alerte_cle`, identique à
-- l'id calculé côté application, ex. 'facture-<uuid>'), sur le même principe
-- que `alertes_operationnelles_ignorees` déjà en place. Une seule délégation
-- active par alerte (contrainte unique + upsert = réassignation contrôlée).

create table if not exists public.alertes_operationnelles_delegations (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  alerte_cle text not null,
  alerte_domaine text not null,
  alerte_titre text not null,
  alerte_href text not null,
  alerte_niveau text not null check (alerte_niveau in ('critique', 'attention')),
  employe_id uuid not null references public.employes(id) on delete cascade,
  delegue_par_user_id uuid not null references public.utilisateurs(id) on delete cascade,
  delegue_at timestamptz not null default now(),
  commentaire text,
  check (char_length(alerte_cle) between 1 and 120),
  check (char_length(alerte_titre) <= 250),
  check (commentaire is null or char_length(commentaire) <= 500),
  unique (entreprise_id, alerte_cle)
);

create index if not exists alertes_delegations_employe_idx
  on public.alertes_operationnelles_delegations (employe_id);
create index if not exists alertes_delegations_delegue_par_idx
  on public.alertes_operationnelles_delegations (delegue_par_user_id);

alter table public.alertes_operationnelles_delegations enable row level security;

drop policy if exists alertes_delegations_lecture on public.alertes_operationnelles_delegations;
create policy alertes_delegations_lecture on public.alertes_operationnelles_delegations
  for select to authenticated
  using (public.est_membre_actif(entreprise_id));

-- Aucune politique insert/update/delete : toute écriture passe exclusivement
-- par la fonction security definer ci-dessous, qui revalide tout côté
-- serveur (permission du délégateur, permission du destinataire, tenant).
grant select on public.alertes_operationnelles_delegations to authenticated;

comment on table public.alertes_operationnelles_delegations is
  'Assignation d''une alerte opérationnelle (calculée à la volée, jamais persistée telle quelle) à un employé. Une ligne = la délégation active pour cette alerte ; une nouvelle délégation remplace la précédente (réassignation).';

-- Liste des employés délégables d'une entreprise, avec leurs permissions de
-- gestion par domaine (utilisées côté client pour filtrer la liste proposée
-- par alerte, et revalidées indépendamment par deleguer_alerte_operationnelle).
-- Lecture seule, réservée aux membres actifs de l'entreprise.
create or replace function public.employes_delegables_alertes(p_entreprise_id uuid)
returns table (employe_id uuid, prenom text, nom text, permissions text[])
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.prenom, e.nom,
    coalesce(array_agg(pp.cle_permission) filter (where pp.autorise), '{}')
  from public.employes e
  join public.utilisateurs_entreprises ue
    on ue.utilisateur_id = e.utilisateur_id and ue.entreprise_id = e.entreprise_id
  left join public.permissions_poste pp
    on pp.entreprise_id = ue.entreprise_id and pp.poste_id = ue.poste_id
  where public.est_membre_actif(p_entreprise_id)
    and e.entreprise_id = p_entreprise_id
    and e.statut = 'actif'
    and e.utilisateur_id is not null
    and ue.statut = 'actif'
  group by e.id, e.prenom, e.nom
  order by e.prenom, e.nom;
$$;

-- Déléguer (ou réassigner) une alerte opérationnelle. Toute la validation se
-- fait ici, côté serveur : le masquage du bouton côté UI n'est qu'un confort
-- d'affichage, jamais le contrôle d'accès réel.
create or replace function public.deleguer_alerte_operationnelle(
  p_entreprise_id uuid,
  p_alerte_cle text,
  p_alerte_domaine text,
  p_alerte_titre text,
  p_alerte_href text,
  p_alerte_niveau text,
  p_employe_id uuid,
  p_commentaire text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_permission text;
  v_employe record;
  v_commentaire text;
begin
  if not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Accès refusé';
  end if;

  if p_alerte_cle !~ '^[a-z0-9-]{1,120}$' then
    raise exception 'Alerte invalide';
  end if;
  if p_alerte_niveau not in ('critique', 'attention') then
    raise exception 'Alerte invalide';
  end if;
  if p_alerte_titre is null or char_length(p_alerte_titre) = 0 or char_length(p_alerte_titre) > 250 then
    raise exception 'Alerte invalide';
  end if;
  if p_alerte_href is null or char_length(p_alerte_href) = 0 or char_length(p_alerte_href) > 250 then
    raise exception 'Alerte invalide';
  end if;

  -- Seuls les domaines connus et associés à un droit de gestion peuvent être
  -- délégués. Un domaine inconnu (nouvel écran non encore relié ici) est
  -- refusé par défaut plutôt qu'autorisé par erreur.
  v_permission := case p_alerte_domaine
    when 'Facturation' then 'gerer_factures'
    when 'Commercial' then 'gerer_devis'
    when 'Stock' then 'gerer_stock'
    when 'Flotte' then 'gerer_flotte'
    when 'Outillage' then 'gerer_outillage'
    when 'Achats' then 'gerer_achats'
    else null
  end;
  if v_permission is null then
    raise exception 'Cette alerte ne peut pas être déléguée.';
  end if;

  if not public.a_permission(p_entreprise_id, v_permission) then
    raise exception 'Accès refusé';
  end if;

  select e.id, e.utilisateur_id, e.prenom, e.nom
  into v_employe
  from public.employes e
  where e.id = p_employe_id
    and e.entreprise_id = p_entreprise_id
    and e.statut = 'actif';
  if not found then
    raise exception 'Employé invalide.';
  end if;
  if v_employe.utilisateur_id is null then
    raise exception 'Cet employé n''a pas encore de compte applicatif.';
  end if;

  if not exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.permissions_poste pp
      on pp.entreprise_id = ue.entreprise_id and pp.poste_id = ue.poste_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = v_employe.utilisateur_id
      and ue.statut = 'actif'
      and pp.cle_permission = v_permission
      and pp.autorise
  ) then
    raise exception 'Cet employé n''a pas les droits nécessaires pour cette alerte.';
  end if;

  v_commentaire := nullif(trim(both from coalesce(p_commentaire, '')), '');
  if v_commentaire is not null and char_length(v_commentaire) > 500 then
    v_commentaire := left(v_commentaire, 500);
  end if;

  insert into public.alertes_operationnelles_delegations (
    entreprise_id, alerte_cle, alerte_domaine, alerte_titre, alerte_href,
    alerte_niveau, employe_id, delegue_par_user_id, delegue_at, commentaire
  ) values (
    p_entreprise_id, p_alerte_cle, p_alerte_domaine, p_alerte_titre, p_alerte_href,
    p_alerte_niveau, p_employe_id, auth.uid(), now(), v_commentaire
  )
  on conflict (entreprise_id, alerte_cle) do update set
    alerte_domaine = excluded.alerte_domaine,
    alerte_titre = excluded.alerte_titre,
    alerte_href = excluded.alerte_href,
    alerte_niveau = excluded.alerte_niveau,
    employe_id = excluded.employe_id,
    delegue_par_user_id = excluded.delegue_par_user_id,
    delegue_at = excluded.delegue_at,
    commentaire = excluded.commentaire;

  -- Réutilise le centre de notifications existant plutôt que d'en créer un
  -- nouveau (aucun envoi Brevo/push spécifique à ce lot).
  insert into public.notifications_utilisateurs (
    entreprise_id, utilisateur_id, type, titre, message, lien, niveau
  ) values (
    p_entreprise_id, v_employe.utilisateur_id, 'alerte_deleguee',
    'Alerte déléguée : ' || p_alerte_titre, v_commentaire, p_alerte_href, p_alerte_niveau
  );
end;
$$;

revoke all on function public.employes_delegables_alertes(uuid) from public;
grant execute on function public.employes_delegables_alertes(uuid) to authenticated;
revoke all on function public.deleguer_alerte_operationnelle(uuid, text, text, text, text, text, uuid, text) from public;
grant execute on function public.deleguer_alerte_operationnelle(uuid, text, text, text, text, text, uuid, text) to authenticated;
