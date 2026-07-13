-- Comptes collaborateurs préparés depuis la fiche employé.
-- Chaque fiche reçoit un numéro d'inscription personnel et un poste applicatif.

alter table public.employes
  add column if not exists numero_inscription text,
  add column if not exists poste_id uuid references public.postes(id) on delete set null,
  add column if not exists utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  add column if not exists compte_active_at timestamptz;

create unique index if not exists employes_numero_inscription_unique
  on public.employes (upper(numero_inscription))
  where numero_inscription is not null;

create unique index if not exists employes_utilisateur_unique
  on public.employes (utilisateur_id)
  where utilisateur_id is not null;

create index if not exists employes_poste_idx
  on public.employes (entreprise_id, poste_id);

create or replace function public.generer_numero_inscription_employe()
returns text
language plpgsql
set search_path = public
as $$
declare
  v_numero text;
  v_alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i integer;
begin
  loop
    v_numero := 'BTP-';
    for i in 1..10 loop
      v_numero := v_numero || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists (
      select 1 from public.employes where upper(numero_inscription) = upper(v_numero)
    );
  end loop;
  return v_numero;
end;
$$;

create or replace function public.trg_numero_inscription_employe()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.poste_id is not null and not exists (
    select 1 from public.postes where id = new.poste_id and entreprise_id = new.entreprise_id
  ) then
    raise exception 'Le poste doit appartenir à la même entreprise que l''employé';
  end if;
  if nullif(btrim(new.numero_inscription), '') is null then
    new.numero_inscription := public.generer_numero_inscription_employe();
  else
    new.numero_inscription := upper(btrim(new.numero_inscription));
  end if;
  return new;
end;
$$;

drop trigger if exists numero_inscription_employe on public.employes;
create trigger numero_inscription_employe
  before insert or update of numero_inscription, poste_id, entreprise_id on public.employes
  for each row execute function public.trg_numero_inscription_employe();

update public.employes
set numero_inscription = public.generer_numero_inscription_employe()
where numero_inscription is null;

alter table public.employes alter column numero_inscription set not null;

-- Récupère les postes déjà saisis en texte lorsqu'un poste applicatif du même nom existe.
update public.employes e
set poste_id = p.id
from public.postes p
where e.poste_id is null
  and p.entreprise_id = e.entreprise_id
  and lower(btrim(p.nom)) = lower(btrim(e.poste));

create or replace function public.activer_compte_employe(p_numero text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(nullif(btrim(coalesce(auth.jwt() ->> 'email', '')), ''));
  v_employe public.employes%rowtype;
  v_entreprise_nom text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  if nullif(btrim(p_numero), '') is null then raise exception 'Numéro d''inscription obligatoire'; end if;

  select * into v_employe
  from public.employes
  where upper(numero_inscription) = upper(btrim(p_numero))
  for update;

  if v_employe.id is null then raise exception 'Numéro d''inscription invalide'; end if;
  if v_employe.utilisateur_id is not null and v_employe.utilisateur_id <> v_uid then
    raise exception 'Ce numéro est déjà associé à un autre compte';
  end if;
  if v_employe.email is null then
    raise exception 'L''administrateur doit renseigner votre email sur la fiche employé';
  end if;
  if v_email is null or lower(btrim(v_employe.email)) <> v_email then
    raise exception 'Utilisez la même adresse email que celle préparée sur votre fiche employé';
  end if;
  if v_employe.poste_id is null then
    raise exception 'L''administrateur doit attribuer un poste et ses autorisations avant l''activation';
  end if;
  if v_employe.statut in ('sorti', 'suspendu') then
    raise exception 'Cette fiche employé n''est pas active';
  end if;
  if not exists (
    select 1 from public.postes
    where id = v_employe.poste_id and entreprise_id = v_employe.entreprise_id
  ) then
    raise exception 'Le poste préparé est invalide';
  end if;

  insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
  values (v_uid, v_employe.entreprise_id, v_employe.poste_id, 'actif')
  on conflict (utilisateur_id, entreprise_id)
  do update set poste_id = excluded.poste_id, statut = 'actif';

  update public.utilisateurs
  set entreprise_active_id = v_employe.entreprise_id
  where id = v_uid;

  update public.employes
  set utilisateur_id = v_uid,
      compte_active_at = coalesce(compte_active_at, now()),
      updated_at = now()
  where id = v_employe.id;

  select nom into v_entreprise_nom from public.entreprises where id = v_employe.entreprise_id;
  return jsonb_build_object(
    'entreprise_id', v_employe.entreprise_id,
    'entreprise_nom', v_entreprise_nom,
    'employe_id', v_employe.id,
    'poste_id', v_employe.poste_id
  );
end;
$$;

-- Toute modification ultérieure de la fiche (poste ou statut) se répercute sur le compte.
create or replace function public.trg_synchroniser_compte_employe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.utilisateur_id is not null then
    update public.utilisateurs_entreprises
    set poste_id = new.poste_id,
        statut = case
          when new.statut in ('sorti', 'suspendu') then 'desactive'
          when new.poste_id is not null then 'actif'
          else statut
        end
    where utilisateur_id = new.utilisateur_id
      and entreprise_id = new.entreprise_id;
  end if;
  return new;
end;
$$;

drop trigger if exists synchroniser_compte_employe on public.employes;
create trigger synchroniser_compte_employe
  after update of poste_id, statut on public.employes
  for each row execute function public.trg_synchroniser_compte_employe();

-- Le changement de poste depuis l'administration des accès reste synchronisé avec la fiche RH.
create or replace function public.modifier_poste_membre(p_entreprise_id uuid, p_utilisateur_id uuid, p_poste_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.postes where id = p_poste_id and entreprise_id = p_entreprise_id) then
    raise exception 'Poste invalide';
  end if;
  update public.utilisateurs_entreprises
  set poste_id = p_poste_id, statut = 'actif'
  where entreprise_id = p_entreprise_id
    and utilisateur_id = p_utilisateur_id
    and statut in ('actif', 'en_attente_validation', 'desactive');
  if not found then raise exception 'Membre introuvable'; end if;

  update public.employes
  set poste_id = p_poste_id, updated_at = now()
  where entreprise_id = p_entreprise_id and utilisateur_id = p_utilisateur_id;
end;
$$;

revoke all on function public.generer_numero_inscription_employe() from public, anon, authenticated;
revoke all on function public.activer_compte_employe(text) from public, anon;
grant execute on function public.activer_compte_employe(text) to authenticated;
grant execute on function public.modifier_poste_membre(uuid, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
