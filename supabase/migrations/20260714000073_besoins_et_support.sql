-- (A) Questionnaire de besoins à l'inscription → recommandation d'offre.
-- (B) Support : fil de discussion entre chaque entreprise et l'équipe plateforme.

-- ─────────────────────────────────────────────────────────────
-- (A) Besoins déclarés par l'entreprise à l'inscription
-- ─────────────────────────────────────────────────────────────
create table if not exists public.entreprise_besoins (
  entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
  nb_employes integer,
  besoins text[] not null default '{}',
  attentes text[] not null default '{}',
  commentaire text,
  offre_recommandee text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entreprise_besoins enable row level security;
drop policy if exists entreprise_besoins_select on public.entreprise_besoins;
drop policy if exists entreprise_besoins_upsert on public.entreprise_besoins;
drop policy if exists entreprise_besoins_update on public.entreprise_besoins;
create policy entreprise_besoins_select on public.entreprise_besoins for select to authenticated
  using (public.est_membre_actif(entreprise_id));
create policy entreprise_besoins_upsert on public.entreprise_besoins for insert to authenticated
  with check (public.est_membre_actif(entreprise_id));
create policy entreprise_besoins_update on public.entreprise_besoins for update to authenticated
  using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

-- Vue plateforme : besoins de toutes les entreprises.
create or replace function public.plateforme_besoins()
returns table (entreprise_id uuid, nb_employes integer, besoins text[], attentes text[], commentaire text, offre_recommandee text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select entreprise_id, nb_employes, besoins, attentes, commentaire, offre_recommandee, created_at
  from public.entreprise_besoins
  where public.est_plateforme_admin();
$$;
revoke all on function public.plateforme_besoins() from public, anon;
grant execute on function public.plateforme_besoins() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- (B) Support : messages entreprise ↔ plateforme
-- ─────────────────────────────────────────────────────────────
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  cote text not null check (cote in ('entreprise', 'plateforme')),
  auteur_id uuid,
  auteur_nom text,
  contenu text not null check (length(trim(contenu)) > 0),
  lu_par_plateforme boolean not null default false,
  lu_par_entreprise boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_support_messages_entreprise on public.support_messages(entreprise_id, created_at);

alter table public.support_messages enable row level security;
drop policy if exists support_msg_select on public.support_messages;
drop policy if exists support_msg_insert on public.support_messages;
-- Côté entreprise : les membres actifs lisent leur fil et écrivent (uniquement côté 'entreprise').
create policy support_msg_select on public.support_messages for select to authenticated
  using (public.est_membre_actif(entreprise_id));
create policy support_msg_insert on public.support_messages for insert to authenticated
  with check (public.est_membre_actif(entreprise_id) and cote = 'entreprise');

-- Marquer les messages plateforme comme lus (côté entreprise).
create or replace function public.support_marquer_lus_entreprise(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé'; end if;
  update public.support_messages set lu_par_entreprise = true
  where entreprise_id = p_entreprise_id and cote = 'plateforme' and lu_par_entreprise = false;
end;
$$;
revoke all on function public.support_marquer_lus_entreprise(uuid) from public, anon;
grant execute on function public.support_marquer_lus_entreprise(uuid) to authenticated;

-- Vue plateforme : liste des fils avec dernier message et non-lus.
create or replace function public.plateforme_support_fils()
returns table (entreprise_id uuid, entreprise_nom text, dernier_contenu text, dernier_cote text, dernier_at timestamptz, non_lus integer, total integer)
language sql security definer stable set search_path = public as $$
  select e.id, e.nom,
    (select m.contenu from public.support_messages m where m.entreprise_id = e.id order by m.created_at desc limit 1),
    (select m.cote from public.support_messages m where m.entreprise_id = e.id order by m.created_at desc limit 1),
    (select max(m.created_at) from public.support_messages m where m.entreprise_id = e.id),
    (select count(*)::int from public.support_messages m where m.entreprise_id = e.id and m.cote = 'entreprise' and not m.lu_par_plateforme),
    (select count(*)::int from public.support_messages m where m.entreprise_id = e.id)
  from public.entreprises e
  where public.est_plateforme_admin()
    and exists (select 1 from public.support_messages m where m.entreprise_id = e.id)
  order by (select max(m.created_at) from public.support_messages m where m.entreprise_id = e.id) desc;
$$;
revoke all on function public.plateforme_support_fils() from public, anon;
grant execute on function public.plateforme_support_fils() to authenticated;

-- Vue plateforme : messages d'un fil (+ marque les messages entreprise comme lus).
create or replace function public.plateforme_support_messages(p_entreprise_id uuid)
returns table (id uuid, cote text, auteur_nom text, contenu text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.support_messages set lu_par_plateforme = true
  where entreprise_id = p_entreprise_id and cote = 'entreprise' and lu_par_plateforme = false;
  return query
    select m.id, m.cote, m.auteur_nom, m.contenu, m.created_at
    from public.support_messages m where m.entreprise_id = p_entreprise_id order by m.created_at;
end;
$$;
revoke all on function public.plateforme_support_messages(uuid) from public, anon;
grant execute on function public.plateforme_support_messages(uuid) to authenticated;

-- Vue plateforme : répondre à une entreprise.
create or replace function public.plateforme_support_repondre(p_entreprise_id uuid, p_contenu text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  if length(trim(coalesce(p_contenu,''))) = 0 then raise exception 'Message vide'; end if;
  insert into public.support_messages (entreprise_id, cote, auteur_id, auteur_nom, contenu, lu_par_plateforme)
  values (p_entreprise_id, 'plateforme', auth.uid(), coalesce(auth.email(), 'Support plateforme'), trim(p_contenu), true);
end;
$$;
revoke all on function public.plateforme_support_repondre(uuid, text) from public, anon;
grant execute on function public.plateforme_support_repondre(uuid, text) to authenticated;
