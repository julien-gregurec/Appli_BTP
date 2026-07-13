-- Profils terrain prudents pour les postes usuels.
-- Aucun accès commercial, financier, administratif ou aux paramètres n'est accordé.

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,true
from public.postes p
cross join lateral (
  select unnest(array['acces_chantiers','acces_planning','acces_pointage','saisir_son_pointage']) as cle
) d
where lower(p.nom) in ('ouvrier','salarié','salarie')
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,true
from public.postes p
cross join lateral (
  select unnest(array[
    'acces_chantiers','acces_planning','acces_pointage','acces_stock','acces_flotte','acces_outillage',
    'saisir_son_pointage','gerer_planning','gerer_pointage','valider_pointages'
  ]) as cle
) d
where lower(p.nom) in ('chef d''équipe','chef d equipe','chef de chantier')
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

notify pgrst,'reload schema';
