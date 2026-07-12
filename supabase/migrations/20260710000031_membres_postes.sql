-- Administration des comptes existants : visibilité des collègues et affectation à un poste.
create or replace function public.partage_entreprise_avec(p_utilisateur_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from public.utilisateurs_entreprises moi join public.utilisateurs_entreprises collegue on collegue.entreprise_id=moi.entreprise_id where moi.utilisateur_id=auth.uid() and moi.statut='actif' and collegue.utilisateur_id=p_utilisateur_id and collegue.statut='actif');
$$;
drop policy if exists "membres voient leurs collègues" on public.utilisateurs;
create policy "membres voient leurs collègues" on public.utilisateurs for select to authenticated using(public.partage_entreprise_avec(id));

create or replace function public.modifier_poste_membre(p_entreprise_id uuid,p_utilisateur_id uuid,p_poste_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
 update public.utilisateurs_entreprises set poste_id=p_poste_id where entreprise_id=p_entreprise_id and utilisateur_id=p_utilisateur_id and statut='actif';
 if not found then raise exception 'Membre actif introuvable';end if;
end;$$;

create or replace function public.supprimer_poste_vide(p_entreprise_id uuid,p_poste_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if exists(select 1 from public.utilisateurs_entreprises where entreprise_id=p_entreprise_id and poste_id=p_poste_id) then raise exception 'Affectez d’abord les membres de ce poste à un autre rôle';end if;
 delete from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Poste introuvable';end if;
end;$$;

revoke all on function public.partage_entreprise_avec(uuid) from public;
revoke all on function public.modifier_poste_membre(uuid,uuid,uuid) from public;
revoke all on function public.supprimer_poste_vide(uuid,uuid) from public;
grant execute on function public.partage_entreprise_avec(uuid) to authenticated;
grant execute on function public.modifier_poste_membre(uuid,uuid,uuid) to anon,authenticated;
grant execute on function public.supprimer_poste_vide(uuid,uuid) to anon,authenticated;
notify pgrst,'reload schema';
