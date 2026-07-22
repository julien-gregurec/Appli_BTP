-- Notification a la personne concernee en cas de changement de planning (nouvelle
-- affectation, modification de date/duree/chantier, reassignation ou retrait).
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme d'encodage.

create or replace function public.notifier_utilisateur(
  p_entreprise_id uuid,p_utilisateur_id uuid,p_type text,p_titre text,p_message text,p_lien text,
  p_niveau text,p_ressource_type text,p_ressource_id uuid
) returns void language sql security definer set search_path=public as $$
  insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
  values(p_entreprise_id,p_utilisateur_id,p_type,p_titre,p_message,p_lien,p_niveau,p_ressource_type,p_ressource_id);
$$;
revoke all on function public.notifier_utilisateur(uuid,uuid,text,text,text,text,text,text,uuid) from public,anon,authenticated;

create or replace function public.trg_notifications_affectations() returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_chantier_nom text; v_utilisateur_id uuid; v_ancien_utilisateur_id uuid;
begin
  if tg_op = 'DELETE' then
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

  -- Reassignation a une autre personne : equivaut a un retrait + une nouvelle affectation.
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
end;
$$;

drop trigger if exists notifications_affectations on public.affectations;
create trigger notifications_affectations
  after insert or update or delete on public.affectations
  for each row execute function public.trg_notifications_affectations();

notify pgrst, 'reload schema';
