-- Défense en profondeur : les droits « Gérer » sont imposés directement par Postgres.
-- Les policies restrictives ne concernent que authenticated ; le prototype anon reste inchangé.

create or replace function public.a_permission(p_entreprise_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.permissions_poste pp
      on pp.entreprise_id = ue.entreprise_id
     and pp.poste_id = ue.poste_id
     and pp.cle_permission = p_permission
     and pp.autorise
    where ue.utilisateur_id = auth.uid()
      and ue.entreprise_id = p_entreprise_id
      and ue.statut = 'actif'
  );
$$;

revoke all on function public.a_permission(uuid,text) from public, anon;
grant execute on function public.a_permission(uuid,text) to authenticated;

-- Tables portant directement entreprise_id (entreprises utilise id).
do $$
declare r record; v_expr text;
begin
  for r in select * from (values
    ('entreprises','id','gerer_parametres'),
    ('types_chantier','entreprise_id','gerer_chantiers'),
    ('clients','entreprise_id','gerer_clients'),
    ('chantiers','entreprise_id','gerer_chantiers'),
    ('documents_chantier','entreprise_id','gerer_chantiers'),
    ('devis','entreprise_id','gerer_devis'),
    ('prestations_catalogue','entreprise_id','gerer_devis'),
    ('factures','entreprise_id','gerer_factures'),
    ('fournisseurs','entreprise_id','gerer_achats'),
    ('commandes_fournisseurs','entreprise_id','gerer_achats'),
    ('lignes_commande','entreprise_id','gerer_achats'),
    ('depenses_fournisseurs','entreprise_id','gerer_achats'),
    ('reglements_fournisseurs','entreprise_id','gerer_achats'),
    ('charges_recurrentes','entreprise_id','gerer_achats'),
    ('planning_evenements','entreprise_id','gerer_planning'),
    ('affectations','entreprise_id','gerer_planning'),
    ('employes','entreprise_id','gerer_employes'),
    ('pointages','entreprise_id','gerer_pointage'),
    ('sessions_pointage','entreprise_id','gerer_pointage'),
    ('articles_stock','entreprise_id','gerer_stock'),
    ('mouvements_stock','entreprise_id','gerer_stock'),
    ('article_teintes','entreprise_id','gerer_stock'),
    ('zones_depot','entreprise_id','gerer_stock'),
    ('inventaires','entreprise_id','gerer_stock'),
    ('lignes_inventaire','entreprise_id','gerer_stock'),
    ('vehicules','entreprise_id','gerer_flotte'),
    ('releves_kilometrage','entreprise_id','gerer_flotte'),
    ('affectations_vehicules','entreprise_id','gerer_flotte'),
    ('outils','entreprise_id','gerer_outillage'),
    ('mouvements_outillage','entreprise_id','gerer_outillage'),
    ('postes','entreprise_id','gerer_utilisateurs'),
    ('utilisateurs_entreprises','entreprise_id','gerer_utilisateurs'),
    ('permissions_poste','entreprise_id','gerer_utilisateurs'),
    ('codes_acces','entreprise_id','gerer_parametres'),
    ('cles_api','entreprise_id','gerer_parametres')
  ) as x(table_name, entreprise_column, permission_key)
  loop
    if to_regclass('public.' || r.table_name) is null then continue; end if;
    v_expr := format('public.a_permission(%I, %L)', r.entreprise_column, r.permission_key);
    execute format('drop policy if exists role_gestion_insert on public.%I', r.table_name);
    execute format('drop policy if exists role_gestion_update on public.%I', r.table_name);
    execute format('drop policy if exists role_gestion_delete on public.%I', r.table_name);
    execute format('create policy role_gestion_insert on public.%I as restrictive for insert to authenticated with check (%s)', r.table_name, v_expr);
    execute format('create policy role_gestion_update on public.%I as restrictive for update to authenticated using (%s) with check (%s)', r.table_name, v_expr, v_expr);
    execute format('create policy role_gestion_delete on public.%I as restrictive for delete to authenticated using (%s)', r.table_name, v_expr);
  end loop;
end $$;

-- Tables enfants sans entreprise_id : le droit est résolu par leur parent.
drop policy if exists role_gestion_insert on public.contacts_clients;
drop policy if exists role_gestion_update on public.contacts_clients;
drop policy if exists role_gestion_delete on public.contacts_clients;
create policy role_gestion_insert on public.contacts_clients as restrictive for insert to authenticated
  with check (exists(select 1 from public.clients p where p.id=client_id and public.a_permission(p.entreprise_id,'gerer_clients')));
create policy role_gestion_update on public.contacts_clients as restrictive for update to authenticated
  using (exists(select 1 from public.clients p where p.id=client_id and public.a_permission(p.entreprise_id,'gerer_clients')))
  with check (exists(select 1 from public.clients p where p.id=client_id and public.a_permission(p.entreprise_id,'gerer_clients')));
create policy role_gestion_delete on public.contacts_clients as restrictive for delete to authenticated
  using (exists(select 1 from public.clients p where p.id=client_id and public.a_permission(p.entreprise_id,'gerer_clients')));

drop policy if exists role_gestion_insert on public.taches;
drop policy if exists role_gestion_update on public.taches;
drop policy if exists role_gestion_delete on public.taches;
create policy role_gestion_insert on public.taches as restrictive for insert to authenticated
  with check (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));
create policy role_gestion_update on public.taches as restrictive for update to authenticated
  using (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')))
  with check (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));
create policy role_gestion_delete on public.taches as restrictive for delete to authenticated
  using (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));

drop policy if exists role_gestion_insert on public.chantier_transferts;
drop policy if exists role_gestion_update on public.chantier_transferts;
drop policy if exists role_gestion_delete on public.chantier_transferts;
create policy role_gestion_insert on public.chantier_transferts as restrictive for insert to authenticated
  with check (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));
create policy role_gestion_update on public.chantier_transferts as restrictive for update to authenticated
  using (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')))
  with check (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));
create policy role_gestion_delete on public.chantier_transferts as restrictive for delete to authenticated
  using (exists(select 1 from public.chantiers p where p.id=chantier_id and public.a_permission(p.entreprise_id,'gerer_chantiers')));

drop policy if exists role_gestion_insert on public.lignes_devis;
drop policy if exists role_gestion_update on public.lignes_devis;
drop policy if exists role_gestion_delete on public.lignes_devis;
create policy role_gestion_insert on public.lignes_devis as restrictive for insert to authenticated
  with check (exists(select 1 from public.devis p where p.id=devis_id and public.a_permission(p.entreprise_id,'gerer_devis')));
create policy role_gestion_update on public.lignes_devis as restrictive for update to authenticated
  using (exists(select 1 from public.devis p where p.id=devis_id and public.a_permission(p.entreprise_id,'gerer_devis')))
  with check (exists(select 1 from public.devis p where p.id=devis_id and public.a_permission(p.entreprise_id,'gerer_devis')));
create policy role_gestion_delete on public.lignes_devis as restrictive for delete to authenticated
  using (exists(select 1 from public.devis p where p.id=devis_id and public.a_permission(p.entreprise_id,'gerer_devis')));

drop policy if exists role_gestion_insert on public.lignes_factures;
drop policy if exists role_gestion_update on public.lignes_factures;
drop policy if exists role_gestion_delete on public.lignes_factures;
create policy role_gestion_insert on public.lignes_factures as restrictive for insert to authenticated
  with check (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));
create policy role_gestion_update on public.lignes_factures as restrictive for update to authenticated
  using (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')))
  with check (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));
create policy role_gestion_delete on public.lignes_factures as restrictive for delete to authenticated
  using (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));

drop policy if exists role_gestion_insert on public.paiements;
drop policy if exists role_gestion_update on public.paiements;
drop policy if exists role_gestion_delete on public.paiements;
create policy role_gestion_insert on public.paiements as restrictive for insert to authenticated
  with check (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));
create policy role_gestion_update on public.paiements as restrictive for update to authenticated
  using (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')))
  with check (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));
create policy role_gestion_delete on public.paiements as restrictive for delete to authenticated
  using (exists(select 1 from public.factures p where p.id=facture_id and public.a_permission(p.entreprise_id,'gerer_factures')));

-- Les fichiers suivent le droit de gestion de leur module.
drop policy if exists role_gestion_fichiers_insert on storage.objects;
drop policy if exists role_gestion_fichiers_update on storage.objects;
drop policy if exists role_gestion_fichiers_delete on storage.objects;
create policy role_gestion_fichiers_insert on storage.objects as restrictive for insert to authenticated with check (
  case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end
);
create policy role_gestion_fichiers_update on storage.objects as restrictive for update to authenticated
  using (case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end)
  with check (case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end);
create policy role_gestion_fichiers_delete on storage.objects as restrictive for delete to authenticated
  using (case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end);

-- Fonctions SECURITY DEFINER métier : l'ancienne logique devient privée et le wrapper
-- public vérifie le droit de gestion avant de l'appeler.
alter function public.creer_commande_fournisseur(uuid,jsonb,jsonb) rename to creer_commande_fournisseur_interne;
revoke all on function public.creer_commande_fournisseur_interne(uuid,jsonb,jsonb) from public,anon,authenticated;
create function public.creer_commande_fournisseur(p_entreprise_id uuid,p_commande jsonb,p_lignes jsonb)
returns uuid language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.creer_commande_fournisseur_interne(p_entreprise_id,p_commande,p_lignes);
end;$$;

alter function public.changer_statut_commande(uuid,uuid,text) rename to changer_statut_commande_interne;
revoke all on function public.changer_statut_commande_interne(uuid,uuid,text) from public,anon,authenticated;
create function public.changer_statut_commande(p_entreprise_id uuid,p_commande_id uuid,p_statut text)
returns void language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  perform public.changer_statut_commande_interne(p_entreprise_id,p_commande_id,p_statut);
end;$$;

alter function public.enregistrer_reception_commande(uuid,uuid,jsonb) rename to enregistrer_reception_commande_interne;
revoke all on function public.enregistrer_reception_commande_interne(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.enregistrer_reception_commande(p_entreprise_id uuid,p_commande_id uuid,p_lignes jsonb)
returns text language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.enregistrer_reception_commande_interne(p_entreprise_id,p_commande_id,p_lignes);
end;$$;

alter function public.enregistrer_mouvement_outillage(uuid,uuid,text,uuid,uuid,text,text) rename to enregistrer_mouvement_outillage_interne;
revoke all on function public.enregistrer_mouvement_outillage_interne(uuid,uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
create function public.enregistrer_mouvement_outillage(p_entreprise_id uuid,p_outil_id uuid,p_type text,p_employe_id uuid,p_chantier_id uuid,p_etat text,p_note text)
returns void language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_outillage') then raise exception 'Accès refusé';end if;
  perform public.enregistrer_mouvement_outillage_interne(p_entreprise_id,p_outil_id,p_type,p_employe_id,p_chantier_id,p_etat,p_note);
end;$$;

alter function public.creer_inventaire_stock(uuid,uuid,text) rename to creer_inventaire_stock_interne;
revoke all on function public.creer_inventaire_stock_interne(uuid,uuid,text) from public,anon,authenticated;
create function public.creer_inventaire_stock(p_entreprise_id uuid,p_zone_id uuid default null,p_commentaire text default null)
returns uuid language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  return public.creer_inventaire_stock_interne(p_entreprise_id,p_zone_id,p_commentaire);
end;$$;

alter function public.enregistrer_comptage_inventaire(uuid,uuid,jsonb,boolean) rename to enregistrer_comptage_inventaire_interne;
revoke all on function public.enregistrer_comptage_inventaire_interne(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
create function public.enregistrer_comptage_inventaire(p_entreprise_id uuid,p_inventaire_id uuid,p_comptages jsonb,p_valider boolean default false)
returns void language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  perform public.enregistrer_comptage_inventaire_interne(p_entreprise_id,p_inventaire_id,p_comptages,p_valider);
end;$$;

alter function public.materialiser_charge_recurrente(uuid,uuid,text,date) rename to materialiser_charge_recurrente_interne;
revoke all on function public.materialiser_charge_recurrente_interne(uuid,uuid,text,date) from public,anon,authenticated;
create function public.materialiser_charge_recurrente(p_entreprise_id uuid,p_charge_id uuid,p_numero_piece text,p_date_piece date default current_date)
returns uuid language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.materialiser_charge_recurrente_interne(p_entreprise_id,p_charge_id,p_numero_piece,p_date_piece);
end;$$;

alter function public.importer_articles_stock(uuid,text,jsonb) rename to importer_articles_stock_interne;
revoke all on function public.importer_articles_stock_interne(uuid,text,jsonb) from public,anon,authenticated;
create function public.importer_articles_stock(p_entreprise_id uuid,p_type text,p_lignes jsonb)
returns int language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  return public.importer_articles_stock_interne(p_entreprise_id,p_type,p_lignes);
end;$$;

alter function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) rename to cloturer_session_pointage_interne;
revoke all on function public.cloturer_session_pointage_interne(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public,anon,authenticated;
create function public.cloturer_session_pointage(p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null)
returns uuid language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_pointage') then raise exception 'Accès refusé';end if;
  return public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path);
end;$$;

alter function public.affecter_vehicule(uuid,uuid,uuid,text) rename to affecter_vehicule_interne;
revoke all on function public.affecter_vehicule_interne(uuid,uuid,uuid,text) from public,anon,authenticated;
create function public.affecter_vehicule(p_entreprise_id uuid,p_vehicule_id uuid,p_employe_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_flotte') then raise exception 'Accès refusé';end if;
  perform public.affecter_vehicule_interne(p_entreprise_id,p_vehicule_id,p_employe_id,p_note);
end;$$;

alter function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) rename to lier_justificatif_depense_interne;
revoke all on function public.lier_justificatif_depense_interne(uuid,uuid,text,text,text,bigint) from public,anon,authenticated;
create function public.lier_justificatif_depense(p_entreprise_id uuid,p_depense_id uuid,p_path text,p_nom text,p_mime text,p_taille bigint)
returns text language plpgsql security definer set search_path=public as $$begin
  if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.lier_justificatif_depense_interne(p_entreprise_id,p_depense_id,p_path,p_nom,p_mime,p_taille);
end;$$;

revoke all on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) from public;
revoke all on function public.changer_statut_commande(uuid,uuid,text) from public;
revoke all on function public.enregistrer_reception_commande(uuid,uuid,jsonb) from public;
revoke all on function public.enregistrer_mouvement_outillage(uuid,uuid,text,uuid,uuid,text,text) from public;
revoke all on function public.creer_inventaire_stock(uuid,uuid,text) from public;
revoke all on function public.enregistrer_comptage_inventaire(uuid,uuid,jsonb,boolean) from public;
revoke all on function public.materialiser_charge_recurrente(uuid,uuid,text,date) from public;
revoke all on function public.importer_articles_stock(uuid,text,jsonb) from public;
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public;
revoke all on function public.affecter_vehicule(uuid,uuid,uuid,text) from public;
revoke all on function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) from public;

grant execute on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) to anon,authenticated;
grant execute on function public.changer_statut_commande(uuid,uuid,text) to anon,authenticated;
grant execute on function public.enregistrer_reception_commande(uuid,uuid,jsonb) to anon,authenticated;
grant execute on function public.enregistrer_mouvement_outillage(uuid,uuid,text,uuid,uuid,text,text) to anon,authenticated;
grant execute on function public.creer_inventaire_stock(uuid,uuid,text) to anon,authenticated;
grant execute on function public.enregistrer_comptage_inventaire(uuid,uuid,jsonb,boolean) to anon,authenticated;
grant execute on function public.materialiser_charge_recurrente(uuid,uuid,text,date) to anon,authenticated;
grant execute on function public.importer_articles_stock(uuid,text,jsonb) to anon,authenticated;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to anon,authenticated;
grant execute on function public.affecter_vehicule(uuid,uuid,uuid,text) to anon,authenticated;
grant execute on function public.lier_justificatif_depense(uuid,uuid,text,text,text,bigint) to anon,authenticated;

notify pgrst,'reload schema';
