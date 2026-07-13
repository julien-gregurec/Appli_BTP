-- Consultation historique des comptes facturés, réservée au propriétaire de la plateforme.
create or replace function public.plateforme_releve_facturation(p_mois date)
returns table(
  entreprise_id uuid,entreprise_nom text,mois date,nombre_comptes bigint,montant_ht numeric,detail jsonb
) language plpgsql security definer set search_path=public as $$
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
 return query
 select e.id,e.nom,p_mois,count(f.id),coalesce(sum(f.montant_ht),0),
   coalesce(jsonb_agg(jsonb_build_object(
     'employe_id',f.employe_id,'employe',concat_ws(' ',em.prenom,em.nom),'poste',f.libelle_poste,
     'offre',f.code_offre,'statut',f.statut_compte,'montant_ht',f.montant_ht,'motif',f.motif
   ) order by em.nom,em.prenom) filter(where f.id is not null),'[]'::jsonb)
 from public.entreprises e
 left join public.facturation_comptes_mensuelle f on f.entreprise_id=e.id and f.mois=p_mois
 left join public.employes em on em.id=f.employe_id
 group by e.id,e.nom
 order by e.nom;
end;$$;
revoke all on function public.plateforme_releve_facturation(date) from public,anon;
grant execute on function public.plateforme_releve_facturation(date) to authenticated;
notify pgrst,'reload schema';
