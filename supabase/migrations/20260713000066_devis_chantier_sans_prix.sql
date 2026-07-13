-- Vue terrain des travaux prévus, toujours sans prix ni totaux.
insert into public.permissions_disponibles(cle,module,description) values
 ('voir_devis_chantier_sans_prix','Terrain','Voir les prestations sans prix des devis liés à ses chantiers')
on conflict(cle) do update set module=excluded.module,description=excluded.description;
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'voir_devis_chantier_sans_prix',lower(p.nom) in ('ouvrier','salarié','salarie','chef d''équipe','chef d equipe','chef de chantier','conducteur de travaux')
from public.postes p on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create or replace function public.mes_devis_chantiers_sans_prix(p_entreprise_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public as $$
declare v_employe uuid;v_resultat jsonb;
begin
 if not public.a_permission(p_entreprise_id,'voir_devis_chantier_sans_prix') then raise exception 'Accès refusé';end if;
 select id into v_employe from public.employes where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut not in ('sorti','suspendu') limit 1;
 if v_employe is null then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(x order by x->>'chantier',x->>'numero'),'[]'::jsonb) into v_resultat from (
  select jsonb_build_object('id',d.id,'numero',d.numero,'statut',d.statut,'date_emission',d.date_emission,'chantier_id',c.id,'chantier',c.nom,'notes',d.notes_client,
   'lignes',(select coalesce(jsonb_agg(jsonb_build_object('designation',l.designation,'description',l.description,'quantite',l.quantite,'unite',l.unite) order by l.ordre),'[]'::jsonb) from public.lignes_devis l where l.devis_id=d.id)) x
  from public.devis d join public.chantiers c on c.id=d.chantier_id and c.entreprise_id=d.entreprise_id
  where d.entreprise_id=p_entreprise_id and d.statut in ('envoye','accepte')
    and exists(select 1 from public.affectations a where a.entreprise_id=d.entreprise_id and a.chantier_id=d.chantier_id and a.employe_id=v_employe)
 ) q;
 return v_resultat;
end;$$;
revoke all on function public.mes_devis_chantiers_sans_prix(uuid) from public,anon;
grant execute on function public.mes_devis_chantiers_sans_prix(uuid) to authenticated;
notify pgrst,'reload schema';
