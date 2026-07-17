-- Deux appareils sont inclus par compte applicatif.
-- Dès qu'un compte dépasse cette limite pendant le mois, il est facturé
-- comme un compte salarié supplémentaire, au tarif mensuel de son poste.

alter table public.facturation_comptes_mensuelle
  add column if not exists nb_appareils_mois integer not null default 0
    check (nb_appareils_mois >= 0),
  add column if not exists depassement_appareils_facture boolean not null default false,
  add column if not exists montant_depassement_appareils_ht numeric(10,2) not null default 0
    check (montant_depassement_appareils_ht >= 0);

create or replace function public.snapshot_compte_facturable(
  p_employe_id uuid,
  p_motif text default 'compte_ouvert'
) returns void language plpgsql security definer set search_path=public as $$
declare
  e public.employes;
  p public.postes;
  v_mois date:=date_trunc('month',current_date)::date;
  v_nb_appareils integer:=0;
begin
  select * into e from public.employes where id=p_employe_id;
  if not found or e.utilisateur_id is null or e.compte_application_statut not in ('actif','pause','ferme') then return;end if;
  select * into p from public.postes where id=e.poste_id and entreprise_id=e.entreprise_id;
  select count(*)::integer into v_nb_appareils
  from public.appareils_comptes a
  where a.entreprise_id=e.entreprise_id and a.utilisateur_id=e.utilisateur_id
    and a.premiere_activite_at<(v_mois+interval '1 month')
    and (a.revoque_at is null or a.revoque_at>=v_mois::timestamptz);

  insert into public.facturation_comptes_mensuelle(
    entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,
    montant_ht,motif,nb_appareils_mois,depassement_appareils_facture,montant_depassement_appareils_ht
  ) values(
    e.entreprise_id,e.id,e.poste_id,v_mois,e.compte_application_statut,p.nom,p.code_offre,
    coalesce(p.tarif_compte_mensuel,0),p_motif,v_nb_appareils,v_nb_appareils>2,
    case when v_nb_appareils>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
  ) on conflict(entreprise_id,employe_id,mois) do update set
    nb_appareils_mois=greatest(facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois),
    depassement_appareils_facture=facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture,
    montant_depassement_appareils_ht=greatest(facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht);
end;$$;

create or replace function public.plateforme_snapshot_facturation(
  p_mois date default date_trunc('month',current_date)::date
) returns integer language plpgsql security definer set search_path=public as $$
declare v_nb integer;
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
 insert into public.facturation_comptes_mensuelle(
   entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif,
   nb_appareils_mois,depassement_appareils_facture,montant_depassement_appareils_ht
 )
 select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,
   coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel',coalesce(a.nb_appareils,0),coalesce(a.nb_appareils,0)>2,
   case when coalesce(a.nb_appareils,0)>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
 from public.employes e
 left join public.postes p on p.id=e.poste_id
 left join lateral (
   select count(*)::integer nb_appareils from public.appareils_comptes ac
   where ac.entreprise_id=e.entreprise_id and ac.utilisateur_id=e.utilisateur_id
     and ac.premiere_activite_at<(p_mois+interval '1 month')
     and (ac.revoque_at is null or ac.revoque_at>=p_mois::timestamptz)
 ) a on true
 where e.utilisateur_id is not null and e.compte_application_statut in ('actif','pause','ferme')
   and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
   and (e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
 on conflict(entreprise_id,employe_id,mois) do update set
   nb_appareils_mois=greatest(facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois),
   depassement_appareils_facture=facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture,
   montant_depassement_appareils_ht=greatest(facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht);
 get diagnostics v_nb=row_count;
 return v_nb;
end;$$;

drop function if exists public.plateforme_usage_appareils();
create function public.plateforme_usage_appareils()
returns table(
  entreprise_id uuid,
  nb_appareils_actifs bigint,
  nb_comptes_plus_de_deux bigint,
  maximum_appareils_compte bigint,
  montant_depassements_ht numeric
) language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  return query
  with par_compte as (
    select a.entreprise_id,a.utilisateur_id,count(*)::bigint nombre,
      coalesce(max(p.tarif_compte_mensuel),0)::numeric tarif
    from public.appareils_comptes a
    left join public.employes em on em.entreprise_id=a.entreprise_id and em.utilisateur_id=a.utilisateur_id
      and em.compte_application_statut in ('actif','pause')
    left join public.postes p on p.id=em.poste_id
    where a.revoque_at is null
    group by a.entreprise_id,a.utilisateur_id
  )
  select e.id,
    coalesce((select sum(pc.nombre) from par_compte pc where pc.entreprise_id=e.id),0)::bigint,
    coalesce((select count(*) from par_compte pc where pc.entreprise_id=e.id and pc.nombre>2),0)::bigint,
    coalesce((select max(pc.nombre) from par_compte pc where pc.entreprise_id=e.id),0)::bigint,
    coalesce((select sum(pc.tarif) from par_compte pc where pc.entreprise_id=e.id and pc.nombre>2),0)::numeric
  from public.entreprises e;
end;$$;

create or replace function public.plateforme_releve_facturation(p_mois date)
returns table(
  entreprise_id uuid,entreprise_nom text,mois date,nombre_comptes bigint,montant_ht numeric,detail jsonb
) language plpgsql security definer set search_path=public as $$
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
 return query
 select e.id,e.nom,p_mois,
   coalesce(sum(case when f.id is null then 0 else 1+case when f.depassement_appareils_facture then 1 else 0 end end),0)::bigint,
   coalesce(sum(f.montant_ht+f.montant_depassement_appareils_ht),0),
   coalesce(jsonb_agg(jsonb_build_object(
     'employe_id',f.employe_id,'employe',concat_ws(' ',em.prenom,em.nom),'poste',f.libelle_poste,
     'offre',f.code_offre,'statut',f.statut_compte,'montant_compte_ht',f.montant_ht,
     'nb_appareils',f.nb_appareils_mois,'depassement_appareils',f.depassement_appareils_facture,
     'montant_depassement_ht',f.montant_depassement_appareils_ht,
     'montant_ht',f.montant_ht+f.montant_depassement_appareils_ht,'motif',f.motif
   ) order by em.nom,em.prenom) filter(where f.id is not null),'[]'::jsonb)
 from public.entreprises e
 left join public.facturation_comptes_mensuelle f on f.entreprise_id=e.id and f.mois=p_mois
 left join public.employes em on em.id=f.employe_id
 group by e.id,e.nom
 order by e.nom;
end;$$;

create or replace function public.actualiser_facturation_depassement_appareils()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_employe_id uuid;
begin
  select e.id into v_employe_id
  from public.employes e
  where e.entreprise_id=new.entreprise_id and e.utilisateur_id=new.utilisateur_id
    and e.compte_application_statut in ('actif','pause','ferme')
  order by e.updated_at desc limit 1;
  if v_employe_id is not null then
    perform public.snapshot_compte_facturable(v_employe_id,'actualisation_appareils');
  end if;
  return new;
end;$$;

drop trigger if exists appareils_facturation_apres_insertion on public.appareils_comptes;
create trigger appareils_facturation_apres_insertion
after insert on public.appareils_comptes for each row
execute function public.actualiser_facturation_depassement_appareils();

drop trigger if exists appareils_facturation_apres_reactivation on public.appareils_comptes;
create trigger appareils_facturation_apres_reactivation
after update of revoque_at on public.appareils_comptes for each row
when (old.revoque_at is distinct from new.revoque_at)
execute function public.actualiser_facturation_depassement_appareils();

revoke all on function public.snapshot_compte_facturable(uuid,text) from public,anon,authenticated;
revoke all on function public.plateforme_snapshot_facturation(date) from public,anon;
revoke all on function public.plateforme_usage_appareils() from public,anon;
revoke all on function public.plateforme_releve_facturation(date) from public,anon;
revoke all on function public.actualiser_facturation_depassement_appareils() from public,anon,authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
grant execute on function public.plateforme_usage_appareils() to authenticated;
grant execute on function public.plateforme_releve_facturation(date) to authenticated;

notify pgrst,'reload schema';
