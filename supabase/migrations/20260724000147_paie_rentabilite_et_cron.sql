-- Relie le module paie à la rentabilité chantier et permet une resynchro automatique (cron).
-- Ne modifie pas 20260723000141_preparation_paie.sql (déjà testée en navigateur) : tout en additif.

-- 1) Agrégat des indemnités de paie par chantier, exposé pour la Rentabilité.
-- La table indemnites_deplacement_paie n'est lisible que par l'employé concerné ou un
-- profil ayant une permission paie (voir 20260723000141) — sans cette RPC, un manager qui
-- n'a que acces_rentabilite obtiendrait silencieusement 0 ligne au lieu d'une erreur,
-- sous-estimant le coût chantier. On expose ici seulement un total agrégé par chantier,
-- jamais le détail (justificatifs, montants par salarié).
create or replace function public.couts_indemnites_paie_par_chantier(p_entreprise_id uuid, p_chantier_id uuid default null)
returns table(chantier_id uuid, total numeric)
language sql security definer stable set search_path = public as $$
  select i.chantier_id, sum(i.montant_total)::numeric
  from public.indemnites_deplacement_paie i
  where i.entreprise_id = p_entreprise_id
    and i.chantier_id is not null
    and (p_chantier_id is null or i.chantier_id = p_chantier_id)
    and public.est_membre_actif(p_entreprise_id)
    and public.a_permission(p_entreprise_id, 'acces_rentabilite')
  group by i.chantier_id;
$$;
revoke all on function public.couts_indemnites_paie_par_chantier(uuid,uuid) from public, anon;
grant execute on function public.couts_indemnites_paie_par_chantier(uuid,uuid) to authenticated;

-- 2) Découpage de synchroniser_periode_paie pour permettre un appel automatique (cron).
-- synchroniser_periode_paie() vérifie peut_gerer_paie() -> a_permission() -> auth.uid(),
-- qui vaut null sous la clé service-role (aucun JWT utilisateur) : un cron ne peut donc pas
-- l'appeler directement, il faut un chemin séparé sans ce contrôle, réservé à service_role.
create or replace function public.synchroniser_periode_paie_interne(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;r record;v_count integer:=0;
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
 for r in select id from public.dossiers_paie_salaries where periode_id=p.id loop perform public.recalculer_dossier_paie(r.id);v_count:=v_count+1;end loop;
 update public.periodes_paie set statut='saisie_en_cours',updated_at=now() where id=p.id and statut='brouillon';
 perform public.controler_periode_paie(p.id);
 insert into public.journal_audit_paie(entreprise_id,periode_id,utilisateur_id,action,ressource_type,ressource_id,nouvelle_valeur) values(p.entreprise_id,p.id,auth.uid(),'synchronisation','periode_paie',p.id,jsonb_build_object('dossiers',v_count));
 return v_count;
end;$$;

-- Chemin utilisateur : garde exactement le même contrôle de droits qu'avant ce découpage.
create or replace function public.synchroniser_periode_paie(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;
begin
 select * into p from public.periodes_paie where id=p_periode_id;
 if not found or not public.peut_gerer_paie(p.entreprise_id) then raise exception 'Période inaccessible';end if;
 return public.synchroniser_periode_paie_interne(p_periode_id);
end;$$;

-- Chemin cron : aucune vérification auth.uid(), exécutable seulement via la clé service-role.
create or replace function public.synchroniser_periode_paie_service(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
begin
 return public.synchroniser_periode_paie_interne(p_periode_id);
end;$$;

revoke all on function public.synchroniser_periode_paie_interne(uuid) from public,anon,authenticated;
revoke all on function public.synchroniser_periode_paie_service(uuid) from public,anon,authenticated;
grant execute on function public.synchroniser_periode_paie_service(uuid) to service_role;

notify pgrst,'reload schema';
