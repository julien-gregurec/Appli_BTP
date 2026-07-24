-- Correctif : controler_periode_paie_interne() utilisait min(t.id) où t.id est un uuid.
-- Postgres n'a pas d'agrégat min()/max() natif pour le type uuid ("function min(uuid)
-- does not exist") — la fonction échouait dès qu'une période contenait une anomalie
-- "plus de 24h cumulées sur une journée" (bug préexistant dans la migration paie
-- d'origine, révélé par un vrai jeu de données lors du test de la resynchro cron).
-- Cast text (ordre lexicographique stable) pour choisir un id représentatif, sans impact
-- fonctionnel : cette valeur ne sert qu'à rattacher l'anomalie à une ligne de temps.

create or replace function public.controler_periode_paie_interne(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;r record;v_count integer;
begin
 select * into p from public.periodes_paie where id=p_periode_id;
 if not found then raise exception 'Période introuvable';end if;
 delete from public.anomalies_paie where periode_id=p.id and automatique and corrigee_at is null;
 for r in select d.*,e.date_entree,e.date_sortie,e.type_contrat,pp.numero_securite_sociale,pp.fin_periode_essai,pp.titre_sejour_expiration
          from public.dossiers_paie_salaries d join public.employes e on e.id=d.employe_id left join public.profils_paie_employes pp on pp.employe_id=e.id where d.periode_id=p.id loop
  if r.heures_normales+r.heures_sup_25+r.heures_sup_50=0 then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','aucune_heure','Aucune heure validée pour ce salarié actif') on conflict do nothing;end if;
  if r.type_contrat is null then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','contrat_manquant','Nouveau salarié sans type de contrat') on conflict do nothing;end if;
  if r.numero_securite_sociale is null then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','nir_manquant','Numéro de Sécurité sociale manquant') on conflict do nothing;end if;
  if not exists(select 1 from public.coordonnees_bancaires cb where cb.entreprise_id=p.entreprise_id and cb.employe_id=r.employe_id and cb.actif) then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','rib_manquant','Coordonnées bancaires manquantes') on conflict do nothing;end if;
  if r.date_sortie is not null and r.date_sortie<p.date_debut then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','salarie_sorti','Salarié sorti avant la période mais encore présent') on conflict do nothing;end if;
  if r.titre_sejour_expiration is not null and r.titre_sejour_expiration<=p.date_fin then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','titre_sejour_expire','Titre de séjour expiré ou arrivant à échéance') on conflict do nothing;end if;
  if r.fin_periode_essai is not null and r.fin_periode_essai between p.date_debut and p.date_fin then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'information','fin_periode_essai','Période d’essai arrivant à échéance') on conflict do nothing;end if;
 end loop;
 insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description,ressource_type,ressource_id)
 select p.entreprise_id,p.id,t.dossier_id,'bloquant','jour_plus_24h','Plus de 24 heures cumulées sur une journée','temps_travail',min(t.id::text)::uuid
 from public.temps_travail_paie t join public.dossiers_paie_salaries d on d.id=t.dossier_id where d.periode_id=p.id and t.date is not null group by t.dossier_id,t.date having sum(t.quantite_heures)>24 on conflict do nothing;
 insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description,ressource_type,ressource_id)
 select p.entreprise_id,p.id,i.dossier_id,'bloquant','grand_deplacement_sans_chantier','Grand déplacement sans chantier','indemnite',i.id from public.indemnites_deplacement_paie i join public.dossiers_paie_salaries d on d.id=i.dossier_id where d.periode_id=p.id and i.type_indemnite='grand_deplacement' and i.chantier_id is null on conflict do nothing;
 select count(*) into v_count from public.anomalies_paie where periode_id=p.id and corrigee_at is null;
 return v_count;
end;$$;

notify pgrst,'reload schema';
