-- Planning hebdomadaire : intégrité multi-entreprise, anti-doublon et plafond journalier.
alter table public.affectations drop constraint if exists affectations_chantier_id_fkey;
alter table public.affectations drop constraint if exists affectations_employe_id_fkey;
alter table public.affectations add constraint affectations_chantier_entreprise_fk
  foreign key(chantier_id,entreprise_id) references public.chantiers(id,entreprise_id) on delete cascade;
alter table public.affectations add constraint affectations_employe_entreprise_fk
  foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete cascade;
create unique index affectations_tache_unique on public.affectations(entreprise_id,chantier_id,employe_id,date,coalesce(tache,''));

create or replace function public.trg_verifier_heures_affectation() returns trigger language plpgsql security definer set search_path=public as $$
declare v_total numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.entreprise_id::text||new.employe_id::text||new.date::text,0));
 select coalesce(sum(heures),0) into v_total from public.affectations
 where entreprise_id=new.entreprise_id and employe_id=new.employe_id and date=new.date and id<>new.id;
 if v_total+new.heures>24 then raise exception 'Un ouvrier ne peut pas dépasser 24 heures planifiées par jour';end if;
 return new;
end;$$;
create trigger verifier_heures_affectation before insert or update of entreprise_id,employe_id,date,heures on public.affectations for each row execute function public.trg_verifier_heures_affectation();
revoke all on function public.trg_verifier_heures_affectation() from public,anon,authenticated;
notify pgrst,'reload schema';
