-- Code d'entreprise (adhésion) : chaque entreprise a un code unique partageable.
-- Un employé saisit ce code pour rejoindre l'entreprise ; il arrive au statut
-- "en_attente_validation" jusqu'à ce que l'admin lui affecte un poste (ce qui l'active).
-- Le code identifie durablement l'entreprise (base pour une facturation par entreprise).

alter table public.entreprises add column if not exists code_adhesion text unique;

-- Génère un code lisible de 8 caractères (sans caractères ambigus 0/O/1/I/L).
create or replace function public.generer_code_adhesion()
returns text language plpgsql set search_path = public as $$
declare v_code text; v_alpha text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; i int;
begin
  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from public.entreprises where code_adhesion = v_code);
  end loop;
  return v_code;
end; $$;

create or replace function public.trg_entreprise_code_adhesion()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.code_adhesion is null then new.code_adhesion := public.generer_code_adhesion(); end if;
  return new;
end; $$;
drop trigger if exists entreprise_code_adhesion on public.entreprises;
create trigger entreprise_code_adhesion before insert on public.entreprises
  for each row execute function public.trg_entreprise_code_adhesion();

-- Attribue un code aux entreprises existantes qui n'en ont pas.
update public.entreprises set code_adhesion = public.generer_code_adhesion() where code_adhesion is null;

-- Rejoindre une entreprise via son code. SECURITY DEFINER car un futur membre
-- ne peut pas s'insérer lui-même dans une entreprise qui a déjà des membres (RLS).
create or replace function public.rejoindre_entreprise_par_code(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ent uuid; v_nom text; v_uid uuid := auth.uid(); v_statut text;
begin
  if v_uid is null then raise exception 'Non authentifié'; end if;
  select id, nom into v_ent, v_nom from public.entreprises
    where upper(code_adhesion) = upper(btrim(p_code));
  if v_ent is null then raise exception 'Code entreprise invalide'; end if;

  select statut into v_statut from public.utilisateurs_entreprises
    where utilisateur_id = v_uid and entreprise_id = v_ent;
  if v_statut is null then
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
    values (v_uid, v_ent, null, 'en_attente_validation');
    v_statut := 'en_attente_validation';
  end if;
  update public.utilisateurs set entreprise_active_id = v_ent where id = v_uid;
  return jsonb_build_object('entreprise_id', v_ent, 'nom', v_nom, 'statut', v_statut);
end; $$;

-- Affecter un poste : active aussi un membre "en attente" (statut -> actif).
create or replace function public.modifier_poste_membre(p_entreprise_id uuid, p_utilisateur_id uuid, p_poste_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.postes where id = p_poste_id and entreprise_id = p_entreprise_id) then
    raise exception 'Poste invalide';
  end if;
  update public.utilisateurs_entreprises
    set poste_id = p_poste_id, statut = 'actif'
    where entreprise_id = p_entreprise_id and utilisateur_id = p_utilisateur_id
      and statut in ('actif', 'en_attente_validation');
  if not found then raise exception 'Membre introuvable'; end if;
end; $$;

grant execute on function public.rejoindre_entreprise_par_code(text) to anon, authenticated;
grant execute on function public.modifier_poste_membre(uuid, uuid, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
