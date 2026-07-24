-- Frais de route (petit déplacement) automatiques par zone : jusqu'ici, le barème de
-- zones (zones_deplacement_paie, /paie/parametres) n'était jamais appliqué automatiquement
-- — seuls les grands déplacements et les notes de frais alimentaient la paie tout seuls.
-- Ajoute un choix admin (comme mode_grand_deplacement) et une distance par chantier
-- (saisie manuelle, pas de géocodage) pour générer panier/trajet/transport à chaque
-- pointage validé, avec le même mécanisme d'upsert idempotent que le reste de la synchro.

alter table public.chantiers add column if not exists distance_siege_km numeric(10,2)
  check (distance_siege_km is null or distance_siege_km >= 0);

alter table public.entreprises add column if not exists petit_deplacement_automatique boolean not null default false;

create or replace function public.zone_petit_deplacement_pour_distance(p_entreprise_id uuid, p_distance_km numeric, p_date date)
returns table(indemnite_trajet numeric, indemnite_transport numeric, panier numeric)
language sql stable security definer set search_path=public as $$
  select z.indemnite_trajet, z.indemnite_transport, z.panier
  from public.zones_deplacement_paie z
  where z.entreprise_id=p_entreprise_id and z.actif
    and p_distance_km >= z.distance_min_km and (z.distance_max_km is null or p_distance_km <= z.distance_max_km)
    and z.valide_du <= p_date and (z.valide_au is null or z.valide_au >= p_date)
  order by z.valide_du desc limit 1;
$$;
revoke all on function public.zone_petit_deplacement_pour_distance(uuid,numeric,date) from public,anon,authenticated;

-- Redéfinition de synchroniser_periode_paie_interne (20260724000147/148) : ajoute le bloc
-- frais-de-route automatiques juste avant la boucle recalculer_dossier_paie. Reste du corps
-- inchangé (copié à l'identique depuis 20260724000148).
create or replace function public.synchroniser_periode_paie_interne(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;r record;v_count integer:=0;v_auto boolean;
begin
 select * into p from public.periodes_paie where id=p_periode_id for update;
 if not found then raise exception 'Période introuvable';end if;
 if p.statut in ('validee','transmise_comptable','verrouillee') then raise exception 'Période non modifiable';end if;
 insert into public.dossiers_paie_salaries(entreprise_id,periode_id,employe_id,statut)
 select p.entreprise_id,p.id,e.id,'saisie_en_cours' from public.employes e where e.entreprise_id=p.entreprise_id and e.statut<>'suspendu' and coalesce(e.date_entree,p.date_fin)<=p.date_fin and (e.date_sortie is null or e.date_sortie>=p.date_debut)
 on conflict(periode_id,employe_id) do nothing;
 insert into public.primes_paie(entreprise_id,dossier_id,type_prime,libelle,montant,quantite,taux,recurrent,cotisations,source_type,source_id,commentaire)
 select p.entreprise_id,d_courant.id,pr.type_prime,pr.libelle,pr.montant,pr.quantite,pr.taux,true,pr.cotisations,'recurrence',pr.id,pr.commentaire
 from public.primes_paie pr
 join public.dossiers_paie_salaries d_precedent on d_precedent.id=pr.dossier_id
 join public.periodes_paie p_precedente on p_precedente.id=d_precedent.periode_id
 join public.dossiers_paie_salaries d_courant on d_courant.periode_id=p.id and d_courant.employe_id=d_precedent.employe_id
 where pr.recurrent and p_precedente.entreprise_id=p.entreprise_id and p_precedente.mois=(p.mois-interval '1 month')::date
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set montant=excluded.montant,quantite=excluded.quantite,taux=excluded.taux,libelle=excluded.libelle,commentaire=excluded.commentaire,updated_at=now();
 insert into public.deductions_paie(entreprise_id,dossier_id,type_deduction,libelle,montant,confidentiel,recurrent,source_type,source_id,commentaire)
 select p.entreprise_id,d_courant.id,de.type_deduction,de.libelle,de.montant,de.confidentiel,true,'recurrence',de.id,de.commentaire
 from public.deductions_paie de
 join public.dossiers_paie_salaries d_precedent on d_precedent.id=de.dossier_id
 join public.periodes_paie p_precedente on p_precedente.id=d_precedent.periode_id
 join public.dossiers_paie_salaries d_courant on d_courant.periode_id=p.id and d_courant.employe_id=d_precedent.employe_id
 where de.recurrent and p_precedente.entreprise_id=p.entreprise_id and p_precedente.mois=(p.mois-interval '1 month')::date
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set montant=excluded.montant,libelle=excluded.libelle,confidentiel=excluded.confidentiel,commentaire=excluded.commentaire,updated_at=now();
 insert into public.temps_travail_paie(entreprise_id,dossier_id,date,chantier_id,categorie,quantite_heures,majoration,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,pt.date,pt.chantier_id,'normales',pt.heures_normales,0,'pointage',pt.id,pt.tache from public.pointages pt join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=pt.employe_id where pt.entreprise_id=p.entreprise_id and pt.date between p.date_debut and p.date_fin and pt.verification_statut='valide' and pt.heures_normales>0
 on conflict(dossier_id,source_type,source_id,categorie) where source_id is not null do update set quantite_heures=excluded.quantite_heures,chantier_id=excluded.chantier_id,commentaire=excluded.commentaire,updated_at=now();
 insert into public.temps_travail_paie(entreprise_id,dossier_id,date,chantier_id,categorie,quantite_heures,majoration,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,pt.date,pt.chantier_id,'sup_25',pt.heures_supplementaires,25,'pointage',pt.id,pt.tache from public.pointages pt join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=pt.employe_id where pt.entreprise_id=p.entreprise_id and pt.date between p.date_debut and p.date_fin and pt.verification_statut='valide' and pt.heures_supplementaires>0
 on conflict(dossier_id,source_type,source_id,categorie) where source_id is not null do update set quantite_heures=excluded.quantite_heures,chantier_id=excluded.chantier_id,commentaire=excluded.commentaire,updated_at=now();
 insert into public.absences_paie(entreprise_id,dossier_id,type_absence,date_debut,date_fin,duree_jours,duree_heures,motif,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,c.type_conge,c.date_debut,c.date_fin,greatest(0,(least(c.date_fin,p.date_fin)-greatest(c.date_debut,p.date_debut))+1),greatest(0,(least(c.date_fin,p.date_fin)-greatest(c.date_debut,p.date_debut))+1)*7,c.commentaire,'conge',c.id,c.motif_decision
 from public.demandes_conges c join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=c.employe_id where c.entreprise_id=p.entreprise_id and c.statut='approuvee' and c.date_debut<=p.date_fin and c.date_fin>=p.date_debut
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set date_debut=excluded.date_debut,date_fin=excluded.date_fin,duree_jours=excluded.duree_jours,duree_heures=excluded.duree_heures,updated_at=now();
 insert into public.indemnites_deplacement_paie(entreprise_id,dossier_id,date,chantier_id,type_indemnite,quantite,tarif_unitaire,montant_total,justificatif_storage_path,traitement,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,n.date_frais,n.chantier_id,'note_frais',1,n.montant_ttc,n.montant_ttc,n.justificatif_storage_path,'remboursable','note_frais',n.id,n.description from public.notes_frais n join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=n.employe_id where n.entreprise_id=p.entreprise_id and n.date_frais between p.date_debut and p.date_fin and n.statut in ('valide','validee','remboursee','exporte_comptabilite','verrouille')
 on conflict(dossier_id,source_type,source_id,type_indemnite) where source_id is not null do update set montant_total=excluded.montant_total,justificatif_storage_path=excluded.justificatif_storage_path,updated_at=now();
 insert into public.indemnites_deplacement_paie(entreprise_id,dossier_id,date,chantier_id,type_indemnite,quantite,tarif_unitaire,montant_total,traitement,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,g.date_debut,g.chantier_id,'grand_deplacement',1,g.montant_calcule,g.montant_calcule,'integre_paie','grand_deplacement',g.id,g.commentaire from public.grands_deplacements g join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=g.employe_id where g.entreprise_id=p.entreprise_id and g.statut='valide' and g.date_debut<=p.date_fin and g.date_fin>=p.date_debut
 on conflict(dossier_id,source_type,source_id,type_indemnite) where source_id is not null do update set montant_total=excluded.montant_total,chantier_id=excluded.chantier_id,updated_at=now();

 select petit_deplacement_automatique into v_auto from public.entreprises where id=p.entreprise_id;
 if v_auto then
   insert into public.indemnites_deplacement_paie(entreprise_id,dossier_id,date,chantier_id,type_indemnite,quantite,tarif_unitaire,montant_total,traitement,source_type,source_id,commentaire)
   select p.entreprise_id,d.id,pt.date,pt.chantier_id,v.type_indemnite,1,v.montant,v.montant,'integre_paie','petit_deplacement',pt.id,null
   from public.pointages pt
   join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=pt.employe_id
   join public.chantiers c on c.id=pt.chantier_id and c.entreprise_id=p.entreprise_id and c.distance_siege_km is not null
   cross join lateral public.zone_petit_deplacement_pour_distance(p.entreprise_id,c.distance_siege_km,pt.date) z
   cross join lateral (values ('panier_repas',z.panier),('indemnite_trajet',z.indemnite_trajet),('indemnite_transport',z.indemnite_transport)) as v(type_indemnite,montant)
   where pt.entreprise_id=p.entreprise_id and pt.date between p.date_debut and p.date_fin and pt.verification_statut='valide' and pt.heures_normales>0 and v.montant>0
   on conflict(dossier_id,source_type,source_id,type_indemnite) where source_id is not null do update set montant_total=excluded.montant_total,tarif_unitaire=excluded.tarif_unitaire,chantier_id=excluded.chantier_id,updated_at=now();
 end if;

 for r in select id from public.dossiers_paie_salaries where periode_id=p.id loop perform public.recalculer_dossier_paie(r.id);v_count:=v_count+1;end loop;
 update public.periodes_paie set statut='saisie_en_cours',updated_at=now() where id=p.id and statut='brouillon';
 perform public.controler_periode_paie_interne(p.id);
 insert into public.journal_audit_paie(entreprise_id,periode_id,utilisateur_id,action,ressource_type,ressource_id,nouvelle_valeur) values(p.entreprise_id,p.id,auth.uid(),'synchronisation','periode_paie',p.id,jsonb_build_object('dossiers',v_count));
 return v_count;
end;$$;

notify pgrst,'reload schema';
