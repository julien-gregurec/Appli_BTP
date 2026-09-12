-- GP V1 — planning v2 : évènements horodatés, ressources, équipes, conflits, compatibilité affectations
-- Intégré au ledger le 2026-09-12 (GP V1, lot 0) depuis supabase/proposed/gp-v1-metier-planning.sql.proposed, contenu inchangé.
-- Rejouable ; additif ; Fresh + Upgrade prouvés (docs/gp-v1, § 19).

do $$
begin
  if to_regprocedure('public.droit_fin(uuid,text,text)') is null then
    raise exception 'Prérequis absent : appliquer d''abord gp-v1-metier-droits-transformations' using errcode = '55000';
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
-- 1. Évènements
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.planning_evenements
  add column if not exists couleur         text,
  add column if not exists client_id       uuid references public.clients (id) on delete set null,
  add column if not exists journee_entiere boolean not null default false,
  add column if not exists adresse         text,
  add column if not exists lot_id          uuid,
  add column if not exists cree_par        uuid default auth.uid(),
  add column if not exists modifie_le      timestamptz not null default now();

alter table public.planning_evenements drop constraint if exists planning_evenements_type_check;
alter table public.planning_evenements add constraint planning_evenements_type_check
  check (type in ('chantier', 'intervention', 'rendez_vous', 'conge', 'absence', 'formation', 'livraison', 'deplacement', 'autre',
                  'rdv_client', 'controle'));
select pg_temp.ajouter_contrainte('public.planning_evenements', 'planning_evenements_champs_check',
  $c$check ((couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$') and coalesce(length(adresse), 0) <= 300 and coalesce(length(titre), 0) between 1 and 200)$c$);
create index if not exists planning_evenements_entreprise_fin_idx on public.planning_evenements (entreprise_id, fin);
create index if not exists planning_evenements_client_idx on public.planning_evenements (client_id) where client_id is not null;

-- La politique « prototype » anonyme de 2026-07 n'a plus lieu d'être : rien pour anon.
drop policy if exists "prototype acces anonyme" on public.planning_evenements;
revoke all on public.planning_evenements from anon;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Ressources, équipes, disponibilités
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.planning_ressources (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  type          text not null check (type in ('vehicule', 'nacelle', 'machine', 'materiel', 'autre')),
  nom           text not null check (length(btrim(nom)) between 1 and 120),
  vehicule_id   uuid references public.vehicules (id) on delete set null,
  outil_id      uuid references public.outils (id) on delete set null,
  couleur       text check (couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$'),
  actif         boolean not null default true,
  cree_le       timestamptz not null default now(),
  unique (id, entreprise_id)
);
create unique index if not exists planning_ressources_nom_uniq on public.planning_ressources (entreprise_id, public.normaliser_reference(nom));

create table if not exists public.equipes (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  nom           text not null check (length(btrim(nom)) between 1 and 120),
  couleur       text check (couleur is null or couleur ~ '^#[0-9a-fA-F]{6}$'),
  actif         boolean not null default true,
  cree_le       timestamptz not null default now(),
  unique (id, entreprise_id)
);
create unique index if not exists equipes_nom_uniq on public.equipes (entreprise_id, public.normaliser_reference(nom));

create table if not exists public.equipes_membres (
  equipe_id     uuid not null,
  employe_id    uuid not null references public.employes (id) on delete cascade,
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  primary key (equipe_id, employe_id),
  foreign key (equipe_id, entreprise_id) references public.equipes (id, entreprise_id) on delete cascade
);

create table if not exists public.planning_disponibilites (
  id            uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  employe_id    uuid not null references public.employes (id) on delete cascade,
  jour_semaine  smallint not null check (jour_semaine between 0 and 6),
  debut         time not null,
  fin           time not null,
  check (fin > debut)
);
create index if not exists planning_disponibilites_employe_idx on public.planning_disponibilites (employe_id, jour_semaine);

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Affectations d'un évènement
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.planning_affectations (
  id            uuid primary key default gen_random_uuid(),
  evenement_id  uuid not null references public.planning_evenements (id) on delete cascade,
  entreprise_id uuid not null references public.entreprises (id) on delete cascade,
  employe_id    uuid references public.employes (id) on delete cascade,
  equipe_id     uuid references public.equipes (id) on delete cascade,
  ressource_id  uuid references public.planning_ressources (id) on delete cascade,
  check (num_nonnulls(employe_id, equipe_id, ressource_id) = 1)
);
create unique index if not exists planning_affectations_employe_uniq on public.planning_affectations (evenement_id, employe_id) where employe_id is not null;
create unique index if not exists planning_affectations_equipe_uniq on public.planning_affectations (evenement_id, equipe_id) where equipe_id is not null;
create unique index if not exists planning_affectations_ressource_uniq on public.planning_affectations (evenement_id, ressource_id) where ressource_id is not null;
create index if not exists planning_affectations_employe_idx on public.planning_affectations (employe_id);
create index if not exists planning_affectations_ressource_idx on public.planning_affectations (ressource_id);

-- Une ressource matérielle est PHYSIQUE : deux évènements ne peuvent pas la prendre en même temps.
-- Bloquant (contrairement aux conflits de salariés, seulement signalés).
create or replace function public.verifier_ressource_planning(p_evenement_id uuid, p_ressource_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v record;
begin
  select e.titre into v
  from public.planning_affectations a
  join public.planning_evenements e on e.id = a.evenement_id
  join public.planning_evenements moi on moi.id = p_evenement_id
  where a.ressource_id = p_ressource_id and a.evenement_id <> p_evenement_id
    and e.statut <> 'annule' and moi.statut <> 'annule'
    and e.debut < moi.fin and moi.debut < e.fin
  limit 1;
  if found then
    raise exception 'Ressource déjà réservée sur ce créneau par « % ».', v.titre using errcode = 'P0001';
  end if;
end $$;

create or replace function public.trg_affectation_ressource_planning()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ressource_id is not null then perform public.verifier_ressource_planning(new.evenement_id, new.ressource_id); end if;
  return new;
end $$;
drop trigger if exists aa_ressource_planning on public.planning_affectations;
create trigger aa_ressource_planning before insert or update on public.planning_affectations
  for each row execute function public.trg_affectation_ressource_planning();

create or replace function public.trg_evenement_ressources_planning()
returns trigger language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  for r in select ressource_id from public.planning_affectations where evenement_id = new.id and ressource_id is not null loop
    perform public.verifier_ressource_planning(new.id, r);
  end loop;
  return new;
end $$;
drop trigger if exists aa_ressources_evenement on public.planning_evenements;
create trigger aa_ressources_evenement before update of debut, fin, statut on public.planning_evenements
  for each row when (new.statut <> 'annule') execute function public.trg_evenement_ressources_planning();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Compatibilité : `affectations` (jour + heures) maintenue par déclencheur
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Une ligne par salarié (direct ou via une équipe) et par jour couvert ; `notes = 'PLN:<évènement>'`
-- identifie ces lignes, `tache = titre [8 car. de l'identifiant]` les rend uniques. Le pointage, la paie,
-- la visibilité chantier et les notifications continuent de lire `affectations` sans rien savoir du
-- planning v2. Le plafond de 24 h/jour d'`affectations` reste en vigueur : dépassé, l'enregistrement
-- de l'évènement est refusé, ce qui est un vrai conflit.
-- Les lignes `affectations` synchronisées depuis le planning v2 (notes = 'PLN:<id>') ne passent plus par
-- les notifications ligne à ligne du déclencheur historique : une synchronisation réécrit plusieurs lignes
-- dans la même transaction et l'index `notifications_evenement_unique` (utilisateur, type, ressource,
-- created_at) refuserait la seconde. Le planning v2 notifie UNE fois par salarié et par évènement (ci-dessous).
-- Le corps historique est conservé à l'identique pour toutes les autres lignes.
create or replace function public.trg_notifications_affectations()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_chantier_nom text; v_utilisateur_id uuid; v_ancien_utilisateur_id uuid;
begin
  if tg_op = 'DELETE' then
    if old.notes like 'PLN:%' then return old; end if;
    select e.utilisateur_id into v_utilisateur_id from public.employes e where e.id = old.employe_id;
    select c.nom into v_chantier_nom from public.chantiers c where c.id = old.chantier_id;
    if v_utilisateur_id is not null then
      perform public.notifier_utilisateur(old.entreprise_id, v_utilisateur_id, 'planning_modifie',
        'Affectation annul'||chr(233)||'e',
        coalesce(v_chantier_nom,'Chantier')||' - '||to_char(old.date,'DD/MM/YYYY'),
        '/planning','attention','affectation',old.id);
    end if;
    return old;
  end if;
  if new.notes like 'PLN:%' then return new; end if;

  select c.nom into v_chantier_nom from public.chantiers c where c.id = new.chantier_id;
  select e.utilisateur_id into v_utilisateur_id from public.employes e where e.id = new.employe_id;

  if tg_op = 'INSERT' then
    if v_utilisateur_id is not null then
      perform public.notifier_utilisateur(new.entreprise_id, v_utilisateur_id, 'planning_modifie',
        'Nouvelle affectation',
        coalesce(v_chantier_nom,'Chantier')||' - '||to_char(new.date,'DD/MM/YYYY')||' - '||new.heures||'h',
        '/planning','information','affectation',new.id);
    end if;
    return new;
  end if;

  if new.employe_id is distinct from old.employe_id then
    select e.utilisateur_id into v_ancien_utilisateur_id from public.employes e where e.id = old.employe_id;
    if v_ancien_utilisateur_id is not null then
      perform public.notifier_utilisateur(old.entreprise_id, v_ancien_utilisateur_id, 'planning_modifie',
        'Affectation retir'||chr(233)||'e',
        coalesce(v_chantier_nom,'Chantier')||' - '||to_char(old.date,'DD/MM/YYYY'),
        '/planning','attention','affectation',old.id);
    end if;
    if v_utilisateur_id is not null then
      perform public.notifier_utilisateur(new.entreprise_id, v_utilisateur_id, 'planning_modifie',
        'Nouvelle affectation',
        coalesce(v_chantier_nom,'Chantier')||' - '||to_char(new.date,'DD/MM/YYYY')||' - '||new.heures||'h',
        '/planning','information','affectation',new.id);
    end if;
    return new;
  end if;

  if (new.date is distinct from old.date or new.heures is distinct from old.heures or new.chantier_id is distinct from old.chantier_id)
     and v_utilisateur_id is not null then
    perform public.notifier_utilisateur(new.entreprise_id, v_utilisateur_id, 'planning_modifie',
      'Planning modifi'||chr(233),
      coalesce(v_chantier_nom,'Chantier')||' - '||to_char(new.date,'DD/MM/YYYY')||' - '||new.heures||'h',
      '/planning','attention','affectation',new.id);
  end if;
  return new;
end $$;

create or replace function public.synchroniser_affectations_planning(p_evenement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e public.planning_evenements;
  v_type text;
  v_chantier uuid;
  s uuid;
  j date;
  v_debut_jour timestamptz;
  v_fin_jour timestamptz;
  v_heures numeric;
  v_avant uuid[];
  v_apres uuid[];
begin
  select coalesce(array_agg(distinct employe_id), '{}') into v_avant from public.affectations where notes = 'PLN:' || p_evenement_id::text;
  delete from public.affectations where notes = 'PLN:' || p_evenement_id::text;
  select * into e from public.planning_evenements where id = p_evenement_id;
  if not found or e.statut = 'annule' then
    -- Évènement supprimé ou annulé : prévenir les salariés qui y étaient.
    insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message, lien, niveau, ressource_type, ressource_id)
    select em.entreprise_id, em.utilisateur_id, 'planning_modifie', 'Intervention annul'||chr(233)||'e', 'Un '||chr(233)||'v'||chr(232)||'nement du planning a '||chr(233)||'t'||chr(233)||' retir'||chr(233),
           '/planning', 'attention', 'planning_evenement', p_evenement_id
    from public.employes em where em.id = any(v_avant) and em.utilisateur_id is not null
    on conflict do nothing;
    return;
  end if;

  v_chantier := case when e.type in ('chantier', 'intervention', 'livraison', 'controle') then e.chantier_id end;
  v_type := case
    when v_chantier is not null then 'chantier'
    when e.type = 'formation' then 'formation'
    when e.type in ('conge', 'absence') then 'conge'
    else 'autre' end;

  for s in
    select a.employe_id from public.planning_affectations a where a.evenement_id = e.id and a.employe_id is not null
    union
    select m.employe_id from public.planning_affectations a join public.equipes_membres m on m.equipe_id = a.equipe_id
     where a.evenement_id = e.id and a.equipe_id is not null
  loop
    j := (e.debut at time zone 'Europe/Paris')::date;
    while j <= ((e.fin - interval '1 second') at time zone 'Europe/Paris')::date loop
      v_debut_jour := greatest(e.debut, (j::timestamp) at time zone 'Europe/Paris');
      v_fin_jour := least(e.fin, ((j + 1)::timestamp) at time zone 'Europe/Paris');
      v_heures := case when e.journee_entiere then 7
                       else round(extract(epoch from (v_fin_jour - v_debut_jour)) / 3600.0, 2) end;
      v_heures := least(24, greatest(0.25, v_heures));
      insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, notes, type_activite, lieu_activite)
      values (e.entreprise_id, v_chantier, s, j, v_heures, left(e.titre, 180) || ' [' || left(e.id::text, 8) || ']', 'PLN:' || e.id::text,
              v_type, case when v_chantier is null then left(coalesce(e.adresse, ''), 200) end)
      on conflict do nothing;
      j := j + 1;
    end loop;
    v_apres := array_append(v_apres, s);
  end loop;
  -- Une notification par salarié concerné (ajouté, retiré ou dont l'évènement change), jamais deux dans la même transaction.
  insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, message, lien, niveau, ressource_type, ressource_id)
  select e.entreprise_id, em.utilisateur_id, 'planning_modifie',
         case when em.id = any(coalesce(v_apres, '{}')) and not (em.id = any(v_avant)) then 'Nouvelle affectation'
              when not (em.id = any(coalesce(v_apres, '{}'))) then 'Affectation retir'||chr(233)||'e'
              else 'Planning modifi'||chr(233) end,
         left(e.titre, 120) || ' - ' || to_char(e.debut at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI'),
         '/planning?jour=' || to_char(e.debut at time zone 'Europe/Paris', 'YYYY-MM-DD'),
         case when em.id = any(coalesce(v_apres, '{}')) and not (em.id = any(v_avant)) then 'information' else 'attention' end,
         'planning_evenement', e.id
  from public.employes em
  where em.utilisateur_id is not null and (em.id = any(v_avant) or em.id = any(coalesce(v_apres, '{}')))
  on conflict do nothing;
end $$;

create or replace function public.trg_sync_planning_evenement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.synchroniser_affectations_planning(coalesce(new.id, old.id));
  return null;
end $$;
drop trigger if exists zz_sync_affectations on public.planning_evenements;
create trigger zz_sync_affectations after insert or update or delete on public.planning_evenements
  for each row execute function public.trg_sync_planning_evenement();

create or replace function public.trg_sync_planning_affectation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.synchroniser_affectations_planning(coalesce(new.evenement_id, old.evenement_id));
  return null;
end $$;
drop trigger if exists zz_sync_affectations on public.planning_affectations;
create trigger zz_sync_affectations after insert or update or delete on public.planning_affectations
  for each row execute function public.trg_sync_planning_affectation();

create or replace function public.trg_sync_planning_equipe()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  for v in select distinct evenement_id from public.planning_affectations where equipe_id = coalesce(new.equipe_id, old.equipe_id) loop
    perform public.synchroniser_affectations_planning(v);
  end loop;
  return null;
end $$;
drop trigger if exists zz_sync_affectations on public.equipes_membres;
create trigger zz_sync_affectations after insert or update or delete on public.equipes_membres
  for each row execute function public.trg_sync_planning_equipe();

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Conflits, RPC, historique
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- Salariés d'un évènement (directs et via équipes).
create or replace function public.salaries_evenement(p_evenement_id uuid)
returns setof uuid language sql stable security invoker set search_path = public as $$
  select a.employe_id from public.planning_affectations a where a.evenement_id = p_evenement_id and a.employe_id is not null
  union
  select m.employe_id from public.planning_affectations a join public.equipes_membres m on m.equipe_id = a.equipe_id
   where a.evenement_id = p_evenement_id and a.equipe_id is not null
$$;

create or replace function public.conflits_planning(p_entreprise_id uuid, p_debut timestamptz, p_fin timestamptz, p_plafond_heures numeric default 10)
returns table (evenement_id uuid, type_conflit text, sujet_id uuid, detail text)
language sql stable security invoker set search_path = public as $$
  with ev as (
    select e.* from public.planning_evenements e
    where e.entreprise_id = p_entreprise_id and e.statut <> 'annule' and e.debut < p_fin and e.fin > p_debut
  ),
  sal as (select ev.id as evenement_id, s as employe_id, ev.titre, ev.type, ev.debut, ev.fin from ev, lateral public.salaries_evenement(ev.id) s)
  select a.evenement_id, case when a.type = 'conge' or b.type = 'conge' then 'conge' else 'salarie_double' end, a.employe_id,
         'Déjà affecté à « ' || b.titre || ' »'
  from sal a join sal b on b.employe_id = a.employe_id and b.evenement_id <> a.evenement_id and a.debut < b.fin and b.debut < a.fin
  union
  select a.evenement_id, 'ressource_double', a.ressource_id, 'Ressource déjà utilisée par « ' || eb.titre || ' »'
  from public.planning_affectations a join ev ea on ea.id = a.evenement_id
  join public.planning_affectations b on b.ressource_id = a.ressource_id and b.evenement_id <> a.evenement_id
  join public.planning_evenements eb on eb.id = b.evenement_id and eb.statut <> 'annule' and ea.debut < eb.fin and eb.debut < ea.fin
  where a.ressource_id is not null
  union
  select s.evenement_id, 'conge', s.employe_id, 'En congé ce jour-là (' || to_char(af.date, 'DD/MM') || ')'
  from sal s join public.affectations af on af.employe_id = s.employe_id and af.type_activite = 'conge'
       and (af.notes is null or af.notes not like 'PLN:%')
       and af.date between (s.debut at time zone 'Europe/Paris')::date and ((s.fin - interval '1 second') at time zone 'Europe/Paris')::date
  union
  select s.evenement_id, 'hors_disponibilite', s.employe_id, 'Horaire hors des disponibilités déclarées'
  from sal s
  where exists (select 1 from public.planning_disponibilites d where d.employe_id = s.employe_id
                  and d.jour_semaine = ((extract(isodow from (s.debut at time zone 'Europe/Paris')))::int - 1))
    and not exists (select 1 from public.planning_disponibilites d where d.employe_id = s.employe_id
                  and d.jour_semaine = ((extract(isodow from (s.debut at time zone 'Europe/Paris')))::int - 1)
                  and (s.debut at time zone 'Europe/Paris')::time >= d.debut and (s.fin at time zone 'Europe/Paris')::time <= d.fin)
  union
  select s.evenement_id, 'surcharge', s.employe_id, 'Plus de ' || p_plafond_heures || ' h le ' || to_char(af.date, 'DD/MM')
  from sal s join public.affectations af on af.employe_id = s.employe_id and af.notes = 'PLN:' || s.evenement_id::text
  where af.type_activite <> 'conge'
    and (select sum(x.heures) from public.affectations x where x.employe_id = s.employe_id and x.date = af.date and x.type_activite <> 'conge') > p_plafond_heures
$$;
revoke all on function public.conflits_planning(uuid, timestamptz, timestamptz, numeric) from public, anon, service_role;
grant execute on function public.conflits_planning(uuid, timestamptz, timestamptz, numeric) to authenticated;

-- SECURITY DEFINER : l'historique (journaliser_objet) n'est pas appelable par l'utilisateur ; en contrepartie
-- l'entreprise, le droit et l'appartenance de chaque objet cité sont vérifiés explicitement ci-dessous.
create or replace function public.enregistrer_evenement_planning(p_entreprise_id uuid, p_evenement jsonb, p_affectations jsonb default '[]'::jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := nullif(p_evenement ->> 'id', '')::uuid;
  v_debut timestamptz := (p_evenement ->> 'debut')::timestamptz;
  v_fin timestamptz := (p_evenement ->> 'fin')::timestamptz;
  v_type text := coalesce(p_evenement ->> 'type', 'chantier');
  v_statut text := coalesce(p_evenement ->> 'statut', 'planifie');
  v_chantier uuid := nullif(p_evenement ->> 'chantier_id', '')::uuid;
  v_client uuid := nullif(p_evenement ->> 'client_id', '')::uuid;
  v_titre text := btrim(coalesce(p_evenement ->> 'titre', ''));
  v_nouveau boolean := v_id is null;
  v_avant jsonb;
begin
  if not public.est_membre_actif(p_entreprise_id) or not public.a_permission(p_entreprise_id, 'gerer_planning') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if v_titre = '' or v_debut is null or v_fin is null or v_fin <= v_debut then
    raise exception 'Un évènement a un titre, un début et une fin postérieure au début.';
  end if;
  if v_type not in ('chantier', 'intervention', 'rendez_vous', 'conge', 'absence', 'formation', 'livraison', 'deplacement', 'autre') then
    raise exception 'Type d''évènement inconnu.';
  end if;
  if v_statut not in ('planifie', 'confirme', 'en_cours', 'termine', 'annule') then
    raise exception 'Statut inconnu.';
  end if;
  if v_chantier is not null and not exists (select 1 from public.chantiers c where c.id = v_chantier and c.entreprise_id = p_entreprise_id) then
    raise exception 'Chantier introuvable.';
  end if;
  if v_client is not null and not exists (select 1 from public.clients c where c.id = v_client and c.entreprise_id = p_entreprise_id) then
    raise exception 'Client introuvable.';
  end if;
  if jsonb_typeof(coalesce(p_affectations, '[]'::jsonb)) <> 'array' then
    raise exception 'Affectations invalides.';
  end if;
  if exists (select 1 from jsonb_to_recordset(p_affectations) as a(employe_id uuid, equipe_id uuid, ressource_id uuid)
             where (a.employe_id is not null and not exists (select 1 from public.employes e where e.id = a.employe_id and e.entreprise_id = p_entreprise_id))
                or (a.equipe_id is not null and not exists (select 1 from public.equipes q where q.id = a.equipe_id and q.entreprise_id = p_entreprise_id))
                or (a.ressource_id is not null and not exists (select 1 from public.planning_ressources r where r.id = a.ressource_id and r.entreprise_id = p_entreprise_id))) then
    raise exception 'Salarié, équipe ou ressource étranger à l''entreprise.';
  end if;

  if v_nouveau then
    insert into public.planning_evenements (entreprise_id, chantier_id, client_id, titre, type, statut, debut, fin, notes, couleur, journee_entiere, adresse, lot_id)
    values (p_entreprise_id, v_chantier, v_client, v_titre, v_type, v_statut, v_debut, v_fin, nullif(p_evenement ->> 'notes', ''),
            nullif(p_evenement ->> 'couleur', ''), coalesce((p_evenement ->> 'journee_entiere')::boolean, false),
            nullif(btrim(coalesce(p_evenement ->> 'adresse', '')), ''), nullif(p_evenement ->> 'lot_id', '')::uuid)
    returning id into v_id;
  else
    select jsonb_build_object('titre', titre, 'debut', debut, 'fin', fin, 'statut', statut, 'chantier_id', chantier_id) into v_avant
    from public.planning_evenements where id = v_id and entreprise_id = p_entreprise_id for update;
    if v_avant is null then raise exception 'Évènement introuvable.'; end if;
    update public.planning_evenements set
      chantier_id = v_chantier, client_id = v_client, titre = v_titre, type = v_type, statut = v_statut, debut = v_debut, fin = v_fin,
      notes = nullif(p_evenement ->> 'notes', ''), couleur = nullif(p_evenement ->> 'couleur', ''),
      journee_entiere = coalesce((p_evenement ->> 'journee_entiere')::boolean, false),
      adresse = nullif(btrim(coalesce(p_evenement ->> 'adresse', '')), ''), lot_id = nullif(p_evenement ->> 'lot_id', '')::uuid,
      updated_at = now(), modifie_le = now()
    where id = v_id;
  end if;

  -- Affectations : remplacées seulement si elles changent, et avec le droit d'affecter.
  if p_affectations is not null and (
       (select coalesce(jsonb_agg(jsonb_build_object('e', a.employe_id, 'q', a.equipe_id, 'r', a.ressource_id) order by a.employe_id, a.equipe_id, a.ressource_id), '[]'::jsonb)
          from public.planning_affectations a where a.evenement_id = v_id)
       is distinct from
       (select coalesce(jsonb_agg(jsonb_build_object('e', a.employe_id, 'q', a.equipe_id, 'r', a.ressource_id) order by a.employe_id, a.equipe_id, a.ressource_id), '[]'::jsonb)
          from jsonb_to_recordset(p_affectations) as a(employe_id uuid, equipe_id uuid, ressource_id uuid))) then
    if not public.droit_fin(p_entreprise_id, 'affecter_ressources', 'gerer_planning') then
      raise exception 'Accès refusé : affecter des salariés, équipes ou ressources exige le droit « affecter_ressources ».' using errcode = '42501';
    end if;
    delete from public.planning_affectations where evenement_id = v_id;
    insert into public.planning_affectations (evenement_id, entreprise_id, employe_id, equipe_id, ressource_id)
    select v_id, p_entreprise_id, a.employe_id, a.equipe_id, a.ressource_id
    from jsonb_to_recordset(p_affectations) as a(employe_id uuid, equipe_id uuid, ressource_id uuid)
    where num_nonnulls(a.employe_id, a.equipe_id, a.ressource_id) = 1;
    perform public.journaliser_objet(p_entreprise_id, 'planning', v_id, 'affectation_modifiee', 'affectations', null, p_affectations, false);
  end if;

  perform public.journaliser_objet(p_entreprise_id, 'planning', v_id, case when v_nouveau then 'creation' else 'modification' end, null, v_avant,
    jsonb_build_object('titre', v_titre, 'debut', v_debut, 'fin', v_fin, 'statut', v_statut, 'chantier_id', v_chantier), false);
  return v_id;
end $$;
revoke all on function public.enregistrer_evenement_planning(uuid, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.enregistrer_evenement_planning(uuid, jsonb, jsonb) to authenticated;

create or replace function public.supprimer_evenement_planning(p_evenement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare e public.planning_evenements;
begin
  select * into e from public.planning_evenements where id = p_evenement_id;
  -- Introuvable ET « pas membre » se confondent volontairement : rien n'est révélé d'une autre entreprise.
  if not found or not public.est_membre_actif(e.entreprise_id) then raise exception 'Évènement introuvable.'; end if;
  if not public.a_permission(e.entreprise_id, 'gerer_planning') then raise exception 'Accès refusé' using errcode = '42501'; end if;
  perform public.journaliser_objet(e.entreprise_id, 'planning', e.id, 'suppression', null, jsonb_build_object('titre', e.titre, 'debut', e.debut, 'fin', e.fin), null, false);
  delete from public.planning_evenements where id = p_evenement_id;
end $$;
revoke all on function public.supprimer_evenement_planning(uuid) from public, anon, service_role;
grant execute on function public.supprimer_evenement_planning(uuid) to authenticated;
revoke all on function public.synchroniser_affectations_planning(uuid) from public, anon, authenticated, service_role;
revoke all on function public.verifier_ressource_planning(uuid, uuid) from public, anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. RLS et droits
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['planning_ressources', 'equipes', 'equipes_membres', 'planning_disponibilites', 'planning_affectations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists membres_lecture on public.%I', t);
    execute format('create policy membres_lecture on public.%I for select to authenticated using (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id, %L))', t, 'acces_planning');
    execute format('drop policy if exists gestion_insert on public.%I', t);
    execute format('create policy gestion_insert on public.%I for insert to authenticated with check (public.a_permission(entreprise_id, %L))', t, 'gerer_planning');
    execute format('drop policy if exists gestion_update on public.%I', t);
    execute format('create policy gestion_update on public.%I for update to authenticated using (public.a_permission(entreprise_id, %L)) with check (public.a_permission(entreprise_id, %L))', t, 'gerer_planning', 'gerer_planning');
    execute format('drop policy if exists gestion_delete on public.%I', t);
    execute format('create policy gestion_delete on public.%I for delete to authenticated using (public.a_permission(entreprise_id, %L))', t, 'gerer_planning');
    execute format('revoke all on public.%I from public, anon, service_role', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Lecture des évènements : accès au planning exigé (la politique historique ouvrait à tout membre).
drop policy if exists planning_lecture_module on public.planning_evenements;
create policy planning_lecture_module on public.planning_evenements as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_planning'));

notify pgrst, 'reload schema';
