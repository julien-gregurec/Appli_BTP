-- Correctifs terrain : encodage, prix stock, horaires, alertes, QR borne et documents chantier.

-- Prix de revente distinct du coût d'achat.
alter table public.articles_stock
  add column if not exists prix_vente_ht numeric(12,2) not null default 0 check(prix_vente_ht >= 0);

-- Horaires contractuels configurables par jour ISO (1=lundi, 7=dimanche).
alter table public.entreprises
  add column if not exists horaires_journaliers jsonb not null default '{"1":8,"2":8,"3":8,"4":8,"5":7,"6":0,"7":0}'::jsonb,
  add column if not exists seuil_ecart_pointage numeric(5,2) not null default 0.25 check(seuil_ecart_pointage between 0 and 8);

alter table public.pointages
  add column if not exists heures_attendues numeric(5,2),
  add column if not exists anomalie_niveau text check(anomalie_niveau in ('information','verification','critique')),
  add column if not exists anomalie_motif text,
  add column if not exists origine_pointage text not null default 'gps_complet'
    check(origine_pointage in ('gps_complet','arrivee_oubliee','depart_oublie','regularisation_responsable'));

-- Centre de notifications personnel et multi-entreprises.
create table if not exists public.notifications_utilisateurs(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  titre text not null,
  message text,
  lien text,
  niveau text not null default 'information' check(niveau in ('information','attention','critique')),
  ressource_type text,
  ressource_id uuid,
  lue_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_utilisateur_idx on public.notifications_utilisateurs(utilisateur_id,lue_at,created_at desc);
create unique index if not exists notifications_evenement_unique on public.notifications_utilisateurs(utilisateur_id,type,ressource_id,created_at)
  where ressource_id is not null;
alter table public.notifications_utilisateurs enable row level security;
drop policy if exists notifications_personnelles on public.notifications_utilisateurs;
create policy notifications_personnelles on public.notifications_utilisateurs for select to authenticated
  using(utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id));
drop policy if exists notifications_marquer_lue on public.notifications_utilisateurs;
create policy notifications_marquer_lue on public.notifications_utilisateurs for update to authenticated
  using(utilisateur_id=auth.uid()) with check(utilisateur_id=auth.uid());
grant select,update on public.notifications_utilisateurs to authenticated;

create or replace function public.notifier_permission(
  p_entreprise_id uuid,p_permission text,p_type text,p_titre text,p_message text,p_lien text,
  p_niveau text,p_ressource_type text,p_ressource_id uuid
) returns void language sql security definer set search_path=public as $$
  insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
  select distinct ue.entreprise_id,ue.utilisateur_id,p_type,p_titre,p_message,p_lien,p_niveau,p_ressource_type,p_ressource_id
  from public.utilisateurs_entreprises ue
  join public.permissions_poste pp on pp.entreprise_id=ue.entreprise_id and pp.poste_id=ue.poste_id
  where ue.entreprise_id=p_entreprise_id and ue.statut='actif' and pp.cle_permission=p_permission and pp.autorise;
$$;
revoke all on function public.notifier_permission(uuid,text,text,text,text,text,text,text,uuid) from public,anon,authenticated;

-- Calcul des heures attendues et alerte des responsables après clôture GPS.
create or replace function public.cloturer_session_pointage(
 p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_pointage uuid;v_affectation uuid;v_total numeric;v_attendu numeric;v_seuil numeric;v_niveau text;v_motif text;
begin
 select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Session de pointage introuvable';end if;
 if not public.peut_pointer_pour_employe(p_entreprise_id,v_session.employe_id) then raise exception 'Accès refusé';end if;
 v_pointage:=public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path);
 select a.id into v_affectation from public.affectations a where a.entreprise_id=p_entreprise_id and a.employe_id=v_session.employe_id and a.chantier_id=v_session.chantier_id and a.date=(v_session.arrivee_at at time zone 'Europe/Paris')::date and a.type_activite='chantier' order by a.created_at limit 1;
 select coalesce((e.horaires_journaliers->>extract(isodow from (v_session.arrivee_at at time zone 'Europe/Paris'))::integer::text)::numeric,0),e.seuil_ecart_pointage
   into v_attendu,v_seuil from public.entreprises e where e.id=p_entreprise_id;
 select heures_normales+heures_supplementaires into v_total from public.pointages where id=v_pointage;
 if v_total>=15 then v_niveau:='critique';v_motif:='Durée supérieure ou égale à 15 heures';
 elsif v_total>12 then v_niveau:='verification';v_motif:='Durée supérieure à 12 heures';
 elsif abs(v_total-v_attendu)>coalesce(v_seuil,0.25) then v_niveau:='verification';v_motif:=case when v_total>v_attendu then 'Heures supérieures à l’horaire attendu' else 'Heures inférieures à l’horaire attendu' end;
 end if;
 update public.pointages set affectation_id=v_affectation,heures_attendues=v_attendu,
   heures_normales=least(v_total,v_attendu),heures_supplementaires=greatest(v_total-v_attendu,0),
   anomalie_niveau=v_niveau,anomalie_motif=v_motif,verification_statut='a_verifier' where id=v_pointage;
 if v_niveau is not null then
   perform public.notifier_permission(p_entreprise_id,'valider_pointages','pointage_a_verifier','Pointage à vérifier',v_motif||' · '||v_total||' h pour '||v_attendu||' h attendues','/pointage',case when v_niveau='critique' then 'critique' else 'attention' end,'pointage',v_pointage);
 end if;
 return v_pointage;
end;$$;
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to authenticated;

create or replace function public.declarer_pointage_oublie(
 p_entreprise_id uuid,p_chantier_id uuid,p_date date,p_arrivee time,p_depart time,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_commentaire text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_employe uuid;v_debut timestamptz;v_fin timestamptz;v_total numeric;v_attendu numeric;v_id uuid;
begin
 if not public.a_permission(p_entreprise_id,'saisir_son_pointage') then raise exception 'Accès refusé';end if;
 select id into v_employe from public.employes where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut='actif' limit 1;
 if v_employe is null then raise exception 'Compte salarié introuvable';end if;
 if p_date>current_date or p_date<current_date-interval '31 days' then raise exception 'La régularisation est limitée aux 31 derniers jours';end if;
 if not exists(select 1 from public.chantiers where id=p_chantier_id and entreprise_id=p_entreprise_id and statut not in('archive','annule')) then raise exception 'Chantier invalide';end if;
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Position GPS invalide';end if;
 v_debut:=(p_date+p_arrivee) at time zone 'Europe/Paris';v_fin:=(p_date+p_depart) at time zone 'Europe/Paris';
 if v_fin<=v_debut then v_fin:=v_fin+interval '1 day';end if;
 v_total:=round(extract(epoch from(v_fin-v_debut))/3600.0-coalesce(p_pause_minutes,0)/60.0,2);
 if v_total<0.25 or v_total>24 then raise exception 'Durée travaillée invalide';end if;
 select coalesce((horaires_journaliers->>extract(isodow from p_date)::integer::text)::numeric,0) into v_attendu from public.entreprises where id=p_entreprise_id;
 insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,commentaire,latitude,longitude,precision_metres,verification_statut,heures_attendues,anomalie_niveau,anomalie_motif,origine_pointage)
 values(p_entreprise_id,v_employe,p_chantier_id,p_date,least(v_total,v_attendu),greatest(v_total-v_attendu,0),coalesce(p_pause_minutes,0),nullif(btrim(p_commentaire),''),p_latitude,p_longitude,p_precision,'a_verifier',v_attendu,case when v_total>=15 then 'critique' else 'verification' end,'Arrivée ou départ oublié · régularisation déclarée par le salarié','depart_oublie') returning id into v_id;
 perform public.notifier_permission(p_entreprise_id,'valider_pointages','pointage_oublie','Pointage oublié à contrôler',p_date||' · '||v_total||' h déclarées','/pointage',case when v_total>=15 then 'critique' else 'attention' end,'pointage',v_id);
 return v_id;
end;$$;
revoke all on function public.declarer_pointage_oublie(uuid,uuid,date,time,time,integer,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.declarer_pointage_oublie(uuid,uuid,date,time,time,integer,numeric,numeric,numeric,text) to authenticated;

-- Un salarié ne lit que ses chantiers actifs. La liste élargie nécessaire au
-- pointage exceptionnel est exposée sans données client, financières ou devis.
drop policy if exists "membres accèdent aux chantiers" on public.chantiers;
drop policy if exists chantiers_lecture_selon_droits on public.chantiers;
create policy chantiers_lecture_selon_droits on public.chantiers for select to authenticated using(
 public.est_membre_actif(entreprise_id) and (
  public.a_permission(entreprise_id,'gerer_chantiers') or public.a_permission(entreprise_id,'voir_heures_chantiers') or
  (statut not in('archive','annule') and exists(
   select 1 from public.employes e join public.equipes_chantiers ec on ec.employe_id=e.id and ec.entreprise_id=e.entreprise_id
   where e.utilisateur_id=auth.uid() and e.entreprise_id=chantiers.entreprise_id and ec.chantier_id=chantiers.id
    and ec.date_debut<=current_date and (ec.date_fin is null or ec.date_fin>=current_date)
  ))
 )
);

create or replace function public.chantiers_pointage_disponibles(p_entreprise_id uuid)
returns table(id uuid,nom text,priorite integer) language sql security definer stable set search_path=public as $$
 with employe_courant as (
  select e.id from public.employes e where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid() and e.statut='actif' limit 1
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
 where public.est_membre_actif(p_entreprise_id) and public.a_permission(p_entreprise_id,'saisir_son_pointage')
 order by a.priorite,a.nom;
$$;
revoke all on function public.chantiers_pointage_disponibles(uuid) from public,anon;
grant execute on function public.chantiers_pointage_disponibles(uuid) to authenticated;

-- Une demande de congé soumise alerte les responsables ; la décision revient au salarié.
create or replace function public.trg_notifications_conges() returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
 if new.statut is not distinct from old.statut then return new;end if;
 if new.statut='soumise' then
   perform public.notifier_permission(new.entreprise_id,'gerer_conges','conge_a_traiter','Nouvelle demande de congé',new.date_debut||' au '||new.date_fin,'/conges','attention','demande_conge',new.id);
 elsif new.statut in ('approuvee','refusee') then
   select utilisateur_id into v_user from public.employes where id=new.employe_id and entreprise_id=new.entreprise_id;
   if v_user is not null then insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
     values(new.entreprise_id,v_user,'decision_conge',case when new.statut='approuvee' then 'Congé approuvé' else 'Congé refusé' end,new.motif_decision,'/conges',case when new.statut='approuvee' then 'information' else 'attention' end,'demande_conge',new.id);end if;
 end if;return new;
end;$$;
drop trigger if exists notifications_conges on public.demandes_conges;
create trigger notifications_conges after update of statut on public.demandes_conges for each row execute function public.trg_notifications_conges();

-- Le demandeur d'une note de frais reçoit chaque décision du responsable.
create or replace function public.trg_notifications_notes_frais() returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
 if new.statut is not distinct from old.statut then return new;end if;
 if new.statut in ('soumis','soumise') then
   perform public.notifier_permission(new.entreprise_id,'verifier_notes_frais','note_frais_a_verifier','Note de frais à vérifier',coalesce(new.reference,'Dépense'),'/'||'notes-frais/'||new.id,'attention','note_frais',new.id);
 elsif new.statut in ('correction_demandee','valide','refuse','exporte_comptabilite','verrouille') then
   select utilisateur_id into v_user from public.employes where id=new.employe_id and entreprise_id=new.entreprise_id;
   if v_user is not null then insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
     values(new.entreprise_id,v_user,'decision_note_frais','Note de frais : '||replace(new.statut,'_',' '),new.motif_decision,'/notes-frais/'||new.id,case when new.statut in ('refuse','correction_demandee') then 'attention' else 'information' end,'note_frais',new.id);end if;
 end if;return new;
end;$$;
drop trigger if exists notifications_notes_frais on public.notes_frais;
create trigger notifications_notes_frais after update of statut on public.notes_frais for each row execute function public.trg_notifications_notes_frais();

-- Visibilité explicite des pièces jointes chantier.
alter table public.documents_chantier add column if not exists audience text not null default 'gestionnaires'
  check(audience in ('tous_affectes','encadrement','gestionnaires'));
create or replace function public.peut_voir_document_chantier(p_document_id uuid) returns boolean
language sql security definer stable set search_path=public as $$
 select exists(select 1 from public.documents_chantier d where d.id=p_document_id and public.est_membre_actif(d.entreprise_id) and (
   public.a_permission(d.entreprise_id,'gerer_chantiers') or exists(
    select 1 from public.employes e join public.equipes_chantiers ec on ec.employe_id=e.id and ec.entreprise_id=e.entreprise_id
    where e.utilisateur_id=auth.uid() and ec.chantier_id=d.chantier_id and (ec.date_fin is null or ec.date_fin>=current_date)
      and (d.audience='tous_affectes' or (d.audience='encadrement' and ec.role_chantier in ('chef_equipe','chef_chantier','conducteur_travaux')))
   )
 ));
$$;
drop policy if exists documents_chantier_membres on public.documents_chantier;
drop policy if exists documents_chantier_lecture on public.documents_chantier;
create policy documents_chantier_lecture on public.documents_chantier for select to authenticated using(public.peut_voir_document_chantier(id));
drop policy if exists chantier_documents_lecture_membres on storage.objects;
create policy chantier_documents_lecture_membres on storage.objects for select to authenticated using(
 bucket_id='chantier-documents' and exists(select 1 from public.documents_chantier d where d.storage_path=name and public.peut_voir_document_chantier(d.id))
);

-- Le QR salarié peut remplacer la saisie de l'identifiant, jamais le mot de passe.
create or replace function public.resoudre_employe_borne(p_entreprise_id uuid,p_identifiant text,p_mot_de_passe text)
returns public.employes language sql security definer stable set search_path=public,extensions as $$
 select e from public.employes e left join public.codes_identification c on c.entreprise_id=e.entreprise_id and c.type_ressource='employe' and c.ressource_id=e.id and c.actif
 where e.entreprise_id=p_entreprise_id and upper(btrim(coalesce(p_identifiant,''))) in (upper(e.identifiant_interne),upper(e.reference_interne),upper(e.numero_inscription),upper(c.code))
   and e.code_stock_active and e.code_stock_hash is not null and crypt(coalesce(p_mot_de_passe,''),e.code_stock_hash)=e.code_stock_hash and e.statut not in ('sorti','suspendu') limit 1;
$$;
revoke all on function public.resoudre_employe_borne(uuid,text,text) from public,anon,authenticated;
create or replace function public.identifiant_employe_depuis_qr_borne(p_entreprise_id uuid,p_code text) returns text
language plpgsql security definer stable set search_path=public as $$declare v_identifiant text;begin
 if not public.est_membre_actif(p_entreprise_id) or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then raise exception 'Accès refusé';end if;
 select coalesce(e.identifiant_interne,e.reference_interne,e.numero_inscription) into v_identifiant
 from public.codes_identification c join public.employes e on e.id=c.ressource_id and e.entreprise_id=c.entreprise_id
 where c.entreprise_id=p_entreprise_id and c.type_ressource='employe' and c.actif and upper(c.code)=upper(btrim(p_code));
 return v_identifiant;
end;$$;
revoke all on function public.identifiant_employe_depuis_qr_borne(uuid,text) from public,anon;
grant execute on function public.identifiant_employe_depuis_qr_borne(uuid,text) to authenticated;

-- Chaque ligne d'un devis accepté devient une tâche terrain visible par
-- l'équipe affectée. Le lien à la ligne source évite toute duplication.
alter table public.taches
 add column if not exists devis_id uuid references public.devis(id) on delete cascade,
 add column if not exists ligne_devis_id uuid references public.lignes_devis(id) on delete cascade;
create unique index if not exists taches_ligne_devis_unique on public.taches(ligne_devis_id) where ligne_devis_id is not null;
create index if not exists taches_devis_idx on public.taches(devis_id) where devis_id is not null;

create or replace function public.synchroniser_taches_devis_accepte(p_devis_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_devis public.devis;
begin
 select * into v_devis from public.devis where id=p_devis_id;
 if not found then return;end if;
 if v_devis.statut<>'accepte' or v_devis.chantier_id is null then return;end if;
 insert into public.taches(chantier_id,libelle,description,statut,priorite,devis_id,ligne_devis_id)
 select v_devis.chantier_id,
  l.designation||case when coalesce(l.quantite,0)<>0 then ' · '||trim(to_char(l.quantite,'FM999999990D99'))||' '||l.unite else '' end,
  nullif(btrim(l.description),''),'a_faire','normale',v_devis.id,l.id
 from public.lignes_devis l where l.devis_id=v_devis.id
 on conflict(ligne_devis_id) where ligne_devis_id is not null do update set
  chantier_id=excluded.chantier_id,
  libelle=case when public.taches.statut='fait' then public.taches.libelle else excluded.libelle end,
  description=case when public.taches.statut='fait' then public.taches.description else excluded.description end,
  devis_id=excluded.devis_id;
 delete from public.taches t where t.devis_id=v_devis.id and t.ligne_devis_id is not null
  and not exists(select 1 from public.lignes_devis l where l.id=t.ligne_devis_id and l.devis_id=v_devis.id);
end;$$;
revoke all on function public.synchroniser_taches_devis_accepte(uuid) from public,anon,authenticated;

create or replace function public.trg_synchroniser_taches_devis() returns trigger
language plpgsql security definer set search_path=public as $$begin
 perform public.synchroniser_taches_devis_accepte(coalesce(new.id,old.id));return null;
end;$$;
drop trigger if exists synchroniser_taches_devis on public.devis;
create trigger synchroniser_taches_devis after insert or update of statut,chantier_id on public.devis
 for each row execute function public.trg_synchroniser_taches_devis();

create or replace function public.trg_synchroniser_taches_ligne_devis() returns trigger
language plpgsql security definer set search_path=public as $$begin
 perform public.synchroniser_taches_devis_accepte(coalesce(new.devis_id,old.devis_id));return null;
end;$$;
drop trigger if exists synchroniser_taches_ligne_devis on public.lignes_devis;
create trigger synchroniser_taches_ligne_devis after insert or update or delete on public.lignes_devis
 for each row execute function public.trg_synchroniser_taches_ligne_devis();

do $$declare r record;begin
 for r in select id from public.devis where statut='accepte' and chantier_id is not null loop
  perform public.synchroniser_taches_devis_accepte(r.id);
 end loop;
end$$;

-- Réparation prudente des séquences d'encodage déjà stockées.
create or replace function public.corriger_mojibake(p_texte text) returns text language sql immutable as $$
 select replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(p_texte,
 '√©','é'),'√®','è'),'√™','ê'),'√¥','ô'),'√†','à'),'√ß','ç'),'Ã©','é'),'Ã¨','è'),'Ãª','ê'),'Ã´','ô'),'Ã ','à'),'‚Äô','’');
$$;
do $$declare r record;begin
 for r in select * from (values
  ('categories_notes_frais','libelle'),('chantiers','nom'),('chantiers','description'),('clients','nom'),('clients','prenom'),('clients','societe'),
  ('fournisseurs','nom'),('articles_stock','designation'),('prestations_catalogue','designation'),('prestations_catalogue','description'),
  ('commandes_fournisseurs','notes'),('devis','objet'),('employes','nom'),('employes','prenom')
 ) x(table_name,column_name) loop
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.table_name and column_name=r.column_name) then
   execute format('update public.%I set %I=public.corriger_mojibake(%I) where %I is distinct from public.corriger_mojibake(%I)',r.table_name,r.column_name,r.column_name,r.column_name,r.column_name);
  end if;
 end loop;
end$$;

notify pgrst,'reload schema';
