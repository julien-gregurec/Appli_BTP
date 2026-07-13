begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select has_function('public','peut_pointer_pour_employe',array['uuid','uuid'],'Le contrôle de pointage personnel existe');
select has_function('public','peut_consulter_pointage_employe',array['uuid','uuid'],'La lecture d’équipe est séparée');
select has_column('public','commandes_fournisseurs','cree_par_utilisateur_id','Les commandes tracent le compte auteur');
select has_column('public','commandes_fournisseurs','cree_par_employe_id','Les commandes tracent la fiche employé auteur');
select has_column('public','notes_frais','cree_par_utilisateur_id','Les notes tracent le compte auteur');
select has_column('public','mouvements_stock','employe_id','Les mouvements de stock tracent l’employé auteur');

select * from finish();
rollback;
