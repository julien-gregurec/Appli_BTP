-- Droits fins : pointages personnels/equipe, chantiers affectes et confidentialite des prix stock.

insert into public.permissions_disponibles(cle,module,description) values
  ('voir_pointages_equipe','Pointage','Consulter les pointages des autres employés'),
  ('voir_chantiers_assignes','Chantiers','Consulter uniquement les chantiers auxquels le salarié est affecté'),
  ('voir_prix_stock','Stock','Consulter les prix d’achat, les prix de revente et la valorisation du stock'),
  ('gerer_prix_stock','Stock','Saisir, modifier et importer les prix du stock')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,false
from public.postes p
cross join (values
  ('voir_pointages_equipe'),('voir_chantiers_assignes'),('voir_prix_stock'),('gerer_prix_stock')
) d(cle)
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

-- Les roles terrain ne voient que leurs chantiers. Les responsables gardent les
-- droits d'equipe adaptes a leur fonction. L'administrateur peut tout ajuster ensuite.
update public.permissions_poste pp set autorise=true
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='voir_chantiers_assignes'
  and lower(btrim(p.nom)) in ('ouvrier','chef d’équipe','chef d''équipe');

update public.permissions_poste pp set autorise=false
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='acces_chantiers'
  and lower(btrim(p.nom)) in ('ouvrier','chef d’équipe','chef d''équipe');

update public.permissions_poste pp set autorise=true
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='voir_pointages_equipe'
  and lower(btrim(p.nom)) in (
    'chef d’équipe','chef d''équipe','chef de chantier','conducteur de travaux',
    'directeur travaux','administration','rh','gérant','gerant','administrateur','admin'
  );

update public.permissions_poste pp set autorise=true
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='voir_prix_stock'
  and lower(btrim(p.nom)) in (
    'conducteur de travaux','directeur travaux','administration','comptable',
    'gérant','gerant','administrateur','admin'
  );

update public.permissions_poste pp set autorise=true
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission='gerer_prix_stock'
  and lower(btrim(p.nom)) in ('directeur travaux','administration','gérant','gerant','administrateur','admin');

-- Un chef d'équipe organise l'exécution du chantier mais ne consulte pas les
-- opportunités commerciales. Ce droit reste réactivable manuellement par l'admin.
update public.permissions_poste pp set autorise=false
from public.postes p
where p.id=pp.poste_id and p.entreprise_id=pp.entreprise_id
  and pp.cle_permission in ('acces_appels_offres','gerer_appels_offres')
  and lower(btrim(p.nom)) in ('chef d’équipe','chef d''équipe');

-- Met les futurs roles installes/reinitialises au meme niveau.
update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(array_remove(permissions,'acces_chantiers') || array['voir_chantiers_assignes']) x
) where cle in ('ouvrier','chef_equipe');

update public.modeles_roles_predefinis set permissions=
  array_remove(array_remove(permissions,'acces_appels_offres'),'gerer_appels_offres')
where cle='chef_equipe';

update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(permissions || array['voir_pointages_equipe']) x
) where cle in ('chef_equipe','chef_chantier','conducteur_travaux','directeur_travaux','administration','rh');

update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(permissions || array['voir_prix_stock']) x
) where cle in ('conducteur_travaux','directeur_travaux','administration','comptable');

update public.modeles_roles_predefinis set permissions=array(
  select distinct x from unnest(permissions || array['gerer_prix_stock']) x
) where cle in ('directeur_travaux','administration');

-- Un salarié lit toujours ses propres pointages. La lecture de l'equipe et
-- l'intervention/validation sont trois décisions administratives distinctes.
create or replace function public.peut_consulter_pointage_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select auth.role()='anon'
    or public.a_permission(p_entreprise_id,'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id,'gerer_pointage')
    or public.a_permission(p_entreprise_id,'valider_pointages')
    or exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    );
$$;
revoke all on function public.peut_consulter_pointage_employe(uuid,uuid) from public,anon;
grant execute on function public.peut_consulter_pointage_employe(uuid,uuid) to authenticated;

-- Fonction centralisee, utilisable par les politiques et resistante aux RLS des
-- tables d'affectation. Sans acces global, le droit affecte doit etre explicite.
create or replace function public.peut_consulter_chantier(p_entreprise_id uuid,p_chantier_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select auth.role()='anon'
    or (
      public.est_membre_actif(p_entreprise_id)
      and (
        public.a_permission(p_entreprise_id,'acces_chantiers')
        or public.a_permission(p_entreprise_id,'gerer_chantiers')
        or (
          public.a_permission(p_entreprise_id,'voir_chantiers_assignes')
          and exists(
            select 1 from public.employes e
            where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid()
              and e.statut not in ('sorti','suspendu')
              and (
                exists(
                  select 1 from public.equipes_chantiers ec
                  where ec.entreprise_id=p_entreprise_id and ec.chantier_id=p_chantier_id
                    and ec.employe_id=e.id and ec.date_debut<=current_date
                    and (ec.date_fin is null or ec.date_fin>=current_date)
                )
                or exists(
                  select 1 from public.affectations a
                  where a.entreprise_id=p_entreprise_id and a.chantier_id=p_chantier_id
                    and a.employe_id=e.id
                )
              )
          )
        )
      )
    );
$$;
revoke all on function public.peut_consulter_chantier(uuid,uuid) from public,anon;
grant execute on function public.peut_consulter_chantier(uuid,uuid) to authenticated;

-- Le sélecteur du pointage suit le même périmètre. Les salariés voient leur
-- chantier du jour et leurs autres affectations ; seuls les droits globaux
-- ouvrent la recherche sur tous les chantiers actifs.
create or replace function public.chantiers_pointage_disponibles(p_entreprise_id uuid)
returns table(id uuid,nom text,priorite integer) language sql security definer stable set search_path=public as $$
 with employe_courant as (
  select e.id from public.employes e
  where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid() and e.statut='actif'
  limit 1
 ), accessibles as (
  select c.id,c.nom,
   case
    when exists(select 1 from public.affectations a,employe_courant e where a.entreprise_id=p_entreprise_id and a.employe_id=e.id and a.chantier_id=c.id and a.date=current_date) then 0
    when exists(select 1 from public.equipes_chantiers ec,employe_courant e where ec.entreprise_id=p_entreprise_id and ec.employe_id=e.id and ec.chantier_id=c.id and ec.date_debut<=current_date and (ec.date_fin is null or ec.date_fin>=current_date)) then 1
    else 2 end as priorite
  from public.chantiers c
  where c.entreprise_id=p_entreprise_id and c.statut not in('archive','annule')
 )
 select a.id,a.nom,a.priorite from accessibles a
 where public.est_membre_actif(p_entreprise_id)
   and public.a_permission(p_entreprise_id,'saisir_son_pointage')
   and (
     a.priorite<2
     or public.a_permission(p_entreprise_id,'acces_chantiers')
     or public.a_permission(p_entreprise_id,'gerer_chantiers')
   )
 order by a.priorite,a.nom;
$$;
revoke all on function public.chantiers_pointage_disponibles(uuid) from public,anon;
grant execute on function public.chantiers_pointage_disponibles(uuid) to authenticated;

drop policy if exists chantiers_lecture_selon_droits on public.chantiers;
create policy chantiers_lecture_selon_droits on public.chantiers
  for select to authenticated using(public.peut_consulter_chantier(entreprise_id,id));

drop policy if exists equipes_chantiers_lecture on public.equipes_chantiers;
create policy equipes_chantiers_lecture on public.equipes_chantiers
  for select to authenticated using(
    public.est_membre_actif(entreprise_id)
    and (
      public.a_permission(entreprise_id,'acces_chantiers')
      or public.a_permission(entreprise_id,'gerer_chantiers')
      or (
        public.a_permission(entreprise_id,'voir_chantiers_assignes')
        and exists(
          select 1 from public.employes e
          where e.id=equipes_chantiers.employe_id
            and e.entreprise_id=equipes_chantiers.entreprise_id
            and e.utilisateur_id=auth.uid()
        )
      )
    )
  );

-- Les colonnes de prix ne sont plus lisibles directement par un membre standard.
-- Une RPC contrôlée restitue l'article complet aux seuls postes autorisés.
create or replace function public.articles_stock_avec_prix(p_entreprise_id uuid)
returns setof public.articles_stock language plpgsql security definer stable set search_path=public as $$
begin
  if auth.role()<>'anon'
     and not public.a_permission(p_entreprise_id,'voir_prix_stock')
     and not public.a_permission(p_entreprise_id,'gerer_prix_stock') then
    raise exception 'Accès aux prix du stock refusé';
  end if;
  return query select a.* from public.articles_stock a
    where a.entreprise_id=p_entreprise_id and a.actif order by a.designation;
end;$$;
revoke all on function public.articles_stock_avec_prix(uuid) from public;
grant execute on function public.articles_stock_avec_prix(uuid) to anon,authenticated;

revoke select on public.articles_stock from authenticated;
grant select(
  id,entreprise_id,reference,designation,unite,quantite_stock,seuil_alerte,
  emplacement,actif,created_at,updated_at,marque,code_barres,zone_id
) on public.articles_stock to authenticated;

-- Le prix d'achat figé dans un inventaire reste lui aussi confidentiel.
create or replace function public.lignes_inventaire_avec_prix(
  p_entreprise_id uuid,
  p_inventaire_id uuid
)
returns table(
  id uuid,
  quantite_theorique numeric,
  quantite_comptee numeric,
  prix_achat_ht_snapshot numeric,
  reference text,
  designation text,
  unite text,
  created_at timestamptz
) language plpgsql security definer stable set search_path=public as $$
begin
  if auth.role()<>'anon'
     and not public.a_permission(p_entreprise_id,'voir_prix_stock')
     and not public.a_permission(p_entreprise_id,'gerer_prix_stock') then
    raise exception 'Accès à la valorisation du stock refusé';
  end if;
  return query
    select l.id,l.quantite_theorique,l.quantite_comptee,l.prix_achat_ht_snapshot,
           a.reference,a.designation,a.unite,l.created_at
    from public.lignes_inventaire l
    join public.articles_stock a on a.id=l.article_id and a.entreprise_id=l.entreprise_id
    where l.entreprise_id=p_entreprise_id and l.inventaire_id=p_inventaire_id
    order by l.created_at;
end;$$;
revoke all on function public.lignes_inventaire_avec_prix(uuid,uuid) from public;
grant execute on function public.lignes_inventaire_avec_prix(uuid,uuid) to anon,authenticated;

revoke select on public.lignes_inventaire from authenticated;
grant select(
  id,entreprise_id,inventaire_id,article_id,quantite_theorique,
  quantite_comptee,created_at
) on public.lignes_inventaire to authenticated;

-- Même une écriture directe ou un ancien écran ne peut changer un prix sans le droit.
create or replace function public.verifier_droit_prix_stock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='authenticated' and not public.a_permission(new.entreprise_id,'gerer_prix_stock') then
    if tg_op='INSERT' and (coalesce(new.prix_achat_ht,0)<>0 or coalesce(new.prix_vente_ht,0)<>0) then
      raise exception 'Modification des prix du stock non autorisée';
    end if;
    if tg_op='UPDATE' and (
      new.prix_achat_ht is distinct from old.prix_achat_ht
      or new.prix_vente_ht is distinct from old.prix_vente_ht
    ) then
      raise exception 'Modification des prix du stock non autorisée';
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists verifier_droit_prix_stock on public.articles_stock;
create trigger verifier_droit_prix_stock before insert or update on public.articles_stock
  for each row execute function public.verifier_droit_prix_stock();
revoke all on function public.verifier_droit_prix_stock() from public,anon,authenticated;

notify pgrst,'reload schema';
