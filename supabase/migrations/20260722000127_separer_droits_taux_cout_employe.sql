-- Sépare la visibilité du taux facturé et du coût interne sur la fiche employé :
-- jusqu'ici les deux étaient derrière le même droit voir_indicateurs_financiers.
-- Un poste peut désormais voir l'un sans l'autre (ex. chef de chantier autorisé
-- à voir le taux facturé client, mais pas le coût interne/marge).

insert into public.permissions_disponibles(cle,module,description) values
  ('voir_taux_facture_employe','Employés','Voir le taux facturé (prix client) sur la fiche employé'),
  ('voir_cout_interne_employe','Employés','Voir le coût interne (salaire/charges) sur la fiche employé')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

-- Reprend exactement les mêmes attributions que voir_indicateurs_financiers
-- aujourd'hui, pour ne rien changer à l'existant tant que l'administrateur
-- n'ajuste pas les deux droits séparément dans Paramètres > Accès.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,cle,pp.autorise
from public.permissions_poste pp
cross join (values('voir_taux_facture_employe'),('voir_cout_interne_employe')) as c(cle)
where pp.cle_permission='voir_indicateurs_financiers'
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;

notify pgrst, 'reload schema';
