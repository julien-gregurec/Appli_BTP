-- Correctif : synchroniser_periode_paie_interne() (20260724000147) appelle
-- controler_periode_paie(), qui a sa propre vérification auth.uid()-based
-- (peut_gerer_paie) indépendante de l'appelant — elle échoue donc aussi sous la clé
-- service-role du cron, avec le même message trompeur "Période inaccessible" que le
-- bug déjà corrigé pour la synchro elle-même. Même découpage interne/public ici.
-- transition_periode_paie() fait déjà sa propre vérification de droits avant d'appeler
-- controler_periode_paie() : la double vérification y était redondante (et latente pour
-- un profil n'ayant que exporter_paie) — met aussi à jour cet appel vers la version interne.

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
 select p.entreprise_id,p.id,t.dossier_id,'bloquant','jour_plus_24h','Plus de 24 heures cumulées sur une journée','temps_travail',min(t.id)
 from public.temps_travail_paie t join public.dossiers_paie_salaries d on d.id=t.dossier_id where d.periode_id=p.id and t.date is not null group by t.dossier_id,t.date having sum(t.quantite_heures)>24 on conflict do nothing;
 insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description,ressource_type,ressource_id)
 select p.entreprise_id,p.id,i.dossier_id,'bloquant','grand_deplacement_sans_chantier','Grand déplacement sans chantier','indemnite',i.id from public.indemnites_deplacement_paie i join public.dossiers_paie_salaries d on d.id=i.dossier_id where d.periode_id=p.id and i.type_indemnite='grand_deplacement' and i.chantier_id is null on conflict do nothing;
 select count(*) into v_count from public.anomalies_paie where periode_id=p.id and corrigee_at is null;
 return v_count;
end;$$;

create or replace function public.controler_periode_paie(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;
begin
 select * into p from public.periodes_paie where id=p_periode_id;
 if not found or not public.peut_gerer_paie(p.entreprise_id) then raise exception 'Période inaccessible';end if;
 return public.controler_periode_paie_interne(p_periode_id);
end;$$;

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
 perform public.controler_periode_paie_interne(p.id);
 insert into public.journal_audit_paie(entreprise_id,periode_id,utilisateur_id,action,ressource_type,ressource_id,nouvelle_valeur) values(p.entreprise_id,p.id,auth.uid(),'synchronisation','periode_paie',p.id,jsonb_build_object('dossiers',v_count));
 return v_count;
end;$$;

create or replace function public.transition_periode_paie(p_periode_id uuid,p_nouveau_statut text,p_commentaire text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;v_blocants integer;v_autorise boolean;
begin
 select * into p from public.periodes_paie where id=p_periode_id for update;
 if not found then raise exception 'Période introuvable';end if;
 v_autorise:=public.a_permission(p.entreprise_id,'gerer_paie') or (p_nouveau_statut='a_controler' and public.a_permission(p.entreprise_id,'controler_variables_paie')) or (p_nouveau_statut='transmise_comptable' and public.a_permission(p.entreprise_id,'exporter_paie'));
 if not v_autorise then raise exception 'Action non autorisée';end if;
 if p.statut='verrouillee' and p_nouveau_statut<>'validee' then raise exception 'Seule une réouverture administrative est possible';end if;
 if p_nouveau_statut in ('validee','transmise_comptable','verrouillee') then perform public.controler_periode_paie_interne(p.id);select count(*) into v_blocants from public.anomalies_paie where periode_id=p.id and niveau='bloquant' and corrigee_at is null and justification is null;if v_blocants>0 then raise exception 'La période contient % anomalie(s) bloquante(s)',v_blocants;end if;end if;
 update public.periodes_paie set statut=p_nouveau_statut,date_validation=case when p_nouveau_statut='validee' then now() else date_validation end,date_export=case when p_nouveau_statut='transmise_comptable' then now() else date_export end,verrouillee_at=case when p_nouveau_statut='verrouillee' then now() else null end,verrouillee_par=case when p_nouveau_statut='verrouillee' then auth.uid() else null end,updated_at=now() where id=p.id;
 insert into public.validations_paie(entreprise_id,periode_id,etape,action,commentaire,ancien_statut,nouveau_statut,utilisateur_id) values(p.entreprise_id,p.id,'periode','transition',nullif(btrim(p_commentaire),''),p.statut,p_nouveau_statut,auth.uid());
end;$$;

revoke all on function public.controler_periode_paie_interne(uuid) from public,anon,authenticated;

notify pgrst,'reload schema';
