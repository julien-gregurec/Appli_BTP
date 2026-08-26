-- Préautorise tout effet Stripe, cloisonne l'audit plateforme, rend les
-- snapshots mensuels idempotents et interdit les réponses support orphelines.

alter table public.historique_mutations_plateforme
  drop constraint if exists historique_mutations_plateforme_domaine_check;
alter table public.historique_mutations_plateforme
  add constraint historique_mutations_plateforme_domaine_check
  check (domaine in ('support','facturation','tarification','multi_app','administrateur','entreprise','securite'));
alter table public.historique_mutations_plateforme
  drop constraint if exists historique_mutations_plateforme_resultat_check;
alter table public.historique_mutations_plateforme
  add constraint historique_mutations_plateforme_resultat_check
  check (resultat in ('modifie','cree','evenement_periodique','echec_synchronisation'));

drop policy if exists historique_mutations_plateforme_lecture on public.historique_mutations_plateforme;
create policy historique_mutations_plateforme_lecture
on public.historique_mutations_plateforme for select to authenticated
using (
  auth.uid() is not null
  and coalesce(auth.jwt()->>'aal','') = 'aal2'
  and (
    public.plateforme_role_courant() = 'total'
    or (public.plateforme_role_courant() = 'support' and domaine = 'support')
    or (public.plateforme_role_courant() = 'facturation' and domaine in ('facturation','tarification'))
  )
);

-- Cette RPC STABLE ne produit ni mutation ni historique. Elle utilise la session
-- JWT réelle et ne retourne que la cible minimale nécessaire à l'effet externe.
create or replace function public.plateforme_preautoriser_effet_externe(
  p_entreprise_id uuid,
  p_operation text
) returns table(
  entreprise_id uuid,
  entreprise_nom text,
  stripe_subscription_id text,
  remise_stripe_coupon_id text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_operation not in ('remise_appliquer','remise_retirer') then
    raise exception 'Opération externe inconnue';
  end if;
  return query
  select e.id,e.nom,e.stripe_subscription_id,e.remise_stripe_coupon_id
  from public.entreprises e where e.id=p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable'; end if;
end;
$$;

-- Journal de dette de synchronisation : aucune erreur Stripe brute, aucun secret.
create or replace function public.plateforme_journaliser_echec_synchronisation_remise(
  p_entreprise_id uuid,
  p_operation text,
  p_compensation_reussie boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_operation not in ('remise_appliquer','remise_retirer') then
    raise exception 'Opération externe inconnue';
  end if;
  if not exists(select 1 from public.entreprises where id=p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,
    nouveau,nombre_lignes,resultat
  ) values (
    'tarification','echec_synchronisation_remise',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('operation',p_operation,'compensation_reussie',p_compensation_reussie),
    0,'echec_synchronisation'
  );
end;
$$;

-- Audit exhaustif des champs métier réellement modifiés.
create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid,p_statut text,p_echeance date,p_note text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_nouveau public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_statut not in ('essai','actif','suspendu','annule') then raise exception 'Statut invalide'; end if;
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  if v_ancien.abonnement_statut=p_statut
     and v_ancien.abonnement_echeance is not distinct from p_echeance
     and v_ancien.abonnement_note is not distinct from p_note
     and not (p_statut='actif' and (v_ancien.impaye_signale_at is not null
       or v_ancien.suspension_prevue_at is not null or v_ancien.impaye_message is not null)) then
    return false;
  end if;
  update public.entreprises set abonnement_statut=p_statut,abonnement_echeance=p_echeance,
    abonnement_note=p_note,
    impaye_signale_at=case when p_statut='actif' then null else impaye_signale_at end,
    suspension_prevue_at=case when p_statut='actif' then null else suspension_prevue_at end,
    impaye_message=case when p_statut='actif' then null else impaye_message end,updated_at=now()
  where id=p_entreprise_id returning * into v_nouveau;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','abonnement_modifie',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('statut',v_ancien.abonnement_statut,'echeance',v_ancien.abonnement_echeance,
      'note',v_ancien.abonnement_note,'impaye_signale_at',v_ancien.impaye_signale_at,
      'suspension_prevue_at',v_ancien.suspension_prevue_at,'impaye_message',v_ancien.impaye_message),
    jsonb_build_object('statut',v_nouveau.abonnement_statut,'echeance',v_nouveau.abonnement_echeance,
      'note',v_nouveau.abonnement_note,'impaye_signale_at',v_nouveau.impaye_signale_at,
      'suspension_prevue_at',v_nouveau.suspension_prevue_at,'impaye_message',v_nouveau.impaye_message));
  return true;
end;
$$;

create or replace function public.plateforme_signaler_impaye(
  p_entreprise_id uuid,p_message text default null
) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_nouveau public.entreprises%rowtype;
  v_echeance timestamptz:=now()+interval '10 days'; v_message text;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found or v_ancien.abonnement_statut='annule' then raise exception 'Entreprise introuvable ou abonnement annulé'; end if;
  v_message:=coalesce(nullif(btrim(p_message),''),'Règlement non reçu');
  update public.entreprises set impaye_signale_at=now(),suspension_prevue_at=v_echeance,
    impaye_message=v_message,abonnement_note=coalesce(nullif(btrim(p_message),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id returning * into v_nouveau;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','impaye_signale',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('statut',v_ancien.abonnement_statut,'impaye_signale_at',v_ancien.impaye_signale_at,
      'suspension_prevue_at',v_ancien.suspension_prevue_at,'impaye_message',v_ancien.impaye_message,'note',v_ancien.abonnement_note),
    jsonb_build_object('statut',v_nouveau.abonnement_statut,'impaye_signale_at',v_nouveau.impaye_signale_at,
      'suspension_prevue_at',v_nouveau.suspension_prevue_at,'impaye_message',v_nouveau.impaye_message,'note',v_nouveau.abonnement_note));
  return v_echeance;
end;
$$;

create or replace function public.plateforme_enregistrer_reglement(
  p_entreprise_id uuid,p_note text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_nouveau public.entreprises%rowtype; v_reglement_at timestamptz:=now();
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  update public.entreprises set abonnement_statut=case when abonnement_statut='suspendu' then 'actif' else abonnement_statut end,
    impaye_signale_at=null,suspension_prevue_at=null,impaye_message=null,dernier_reglement_at=v_reglement_at,
    abonnement_note=coalesce(nullif(btrim(p_note),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id returning * into v_nouveau;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','reglement_enregistre',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('statut',v_ancien.abonnement_statut,'impaye_signale_at',v_ancien.impaye_signale_at,
      'suspension_prevue_at',v_ancien.suspension_prevue_at,'impaye_message',v_ancien.impaye_message,
      'dernier_reglement_at',v_ancien.dernier_reglement_at,'note',v_ancien.abonnement_note),
    jsonb_build_object('statut',v_nouveau.abonnement_statut,'impaye_signale_at',v_nouveau.impaye_signale_at,
      'suspension_prevue_at',v_nouveau.suspension_prevue_at,'impaye_message',v_nouveau.impaye_message,
      'dernier_reglement_at',v_nouveau.dernier_reglement_at,'note',v_nouveau.abonnement_note));
  return true;
end;
$$;

create or replace function public.plateforme_appliquer_remise(
  p_entreprise_id uuid,p_coupon_id text,p_description text,p_motif_interne text default null,
  p_duree_mois integer default null,p_type text default null,p_valeur numeric default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_nouveau public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation'); perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  if v_ancien.remise_stripe_coupon_id is not distinct from p_coupon_id
    and v_ancien.remise_description is not distinct from p_description
    and v_ancien.remise_motif_interne is not distinct from p_motif_interne
    and v_ancien.remise_duree_mois is not distinct from p_duree_mois
    and v_ancien.remise_type is not distinct from p_type
    and v_ancien.remise_valeur is not distinct from p_valeur then return false; end if;
  update public.entreprises set remise_stripe_coupon_id=p_coupon_id,remise_description=p_description,
    remise_motif_interne=p_motif_interne,remise_duree_mois=p_duree_mois,remise_type=p_type,
    remise_valeur=p_valeur,remise_cree_par=auth.uid(),remise_appliquee_at=now(),updated_at=now()
  where id=p_entreprise_id returning * into v_nouveau;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values(p_entreprise_id,auth.uid(),'remise_appliquee',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
    jsonb_build_object('remise_stripe_coupon_id',p_coupon_id,'remise_description',p_description,'duree_mois',p_duree_mois),null);
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('tarification','remise_appliquee',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('coupon_id',v_ancien.remise_stripe_coupon_id,'description',v_ancien.remise_description,
      'motif_interne',v_ancien.remise_motif_interne,'duree_mois',v_ancien.remise_duree_mois,
      'type',v_ancien.remise_type,'valeur',v_ancien.remise_valeur,'auteur',v_ancien.remise_cree_par,'appliquee_at',v_ancien.remise_appliquee_at),
    jsonb_build_object('coupon_id',v_nouveau.remise_stripe_coupon_id,'description',v_nouveau.remise_description,
      'motif_interne',v_nouveau.remise_motif_interne,'duree_mois',v_nouveau.remise_duree_mois,
      'type',v_nouveau.remise_type,'valeur',v_nouveau.remise_valeur,'auteur',v_nouveau.remise_cree_par,'appliquee_at',v_nouveau.remise_appliquee_at));
  return true;
end;
$$;

create or replace function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation'); perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  if v_ancien.remise_stripe_coupon_id is null and v_ancien.remise_description is null
    and v_ancien.remise_motif_interne is null and v_ancien.remise_duree_mois is null
    and v_ancien.remise_type is null and v_ancien.remise_valeur is null then return false; end if;
  update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
    remise_motif_interne=null,remise_duree_mois=null,remise_type=null,remise_valeur=null,
    remise_cree_par=null,remise_appliquee_at=null,updated_at=now() where id=p_entreprise_id;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values(p_entreprise_id,auth.uid(),'remise_retiree',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),null,null);
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('tarification','remise_retiree',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('coupon_id',v_ancien.remise_stripe_coupon_id,'description',v_ancien.remise_description,
      'motif_interne',v_ancien.remise_motif_interne,'duree_mois',v_ancien.remise_duree_mois,
      'type',v_ancien.remise_type,'valeur',v_ancien.remise_valeur,'auteur',v_ancien.remise_cree_par,'appliquee_at',v_ancien.remise_appliquee_at),
    jsonb_build_object('coupon_id',null,'description',null,'motif_interne',null,'duree_mois',null,
      'type',null,'valeur',null,'auteur',null,'appliquee_at',null));
  return true;
end;
$$;

-- Une réponse est impossible tant qu'un client n'a pas créé le fil. L'audit ne
-- contient pas le corps confidentiel du message.
create or replace function public.plateforme_support_repondre(p_entreprise_id uuid,p_contenu text)
returns void language plpgsql security definer set search_path=public as $$
declare v_message_id uuid;
begin
  perform public.plateforme_exiger_role('total','support'); perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then raise exception 'Session support explicite requise'; end if;
  if not exists(select 1 from public.entreprises where id=p_entreprise_id) then raise exception 'Entreprise introuvable'; end if;
  if not exists(select 1 from public.support_messages where entreprise_id=p_entreprise_id and cote='entreprise') then
    raise exception 'Fil support client introuvable';
  end if;
  if length(trim(coalesce(p_contenu,'')))=0 then raise exception 'Message vide'; end if;
  insert into public.support_messages(entreprise_id,cote,auteur_id,auteur_nom,contenu,lu_par_plateforme)
  values(p_entreprise_id,'plateforme',auth.uid(),coalesce(auth.email(),'Support plateforme'),trim(p_contenu),true)
  returning id into v_message_id;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,nouveau,resultat
  ) values('support','reponse_support',p_entreprise_id,'message_support',v_message_id,auth.uid(),
    jsonb_build_object('cote','plateforme','fil_entreprise_id',p_entreprise_id),'cree');
end;
$$;

-- Clé structurelle entreprise/mois et empreinte de l'état facturé. Un verrou
-- transactionnel sérialise deux premiers appels concurrents de même clé.
create table public.plateforme_snapshots_facturation (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  mois date not null check (mois=date_trunc('month',mois)::date),
  empreinte text not null,
  version integer not null check(version>0),
  nombre_lignes integer not null check(nombre_lignes>=0),
  updated_at timestamptz not null default now(),
  primary key(entreprise_id,mois)
);
alter table public.plateforme_snapshots_facturation enable row level security;
revoke all on table public.plateforme_snapshots_facturation from public,anon,authenticated;

create or replace function public.plateforme_snapshot_facturation(
  p_mois date default date_trunc('month',current_date)::date
) returns integer language plpgsql security definer set search_path=public as $$
declare v_nb integer; v_source record; v_ancien public.plateforme_snapshots_facturation%rowtype; v_version integer;
begin
  perform public.plateforme_exiger_role('total','facturation'); perform public.plateforme_exiger_session_aal2();
  if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour'; end if;
  insert into public.facturation_comptes_mensuelle(
    entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,
    montant_ht,motif,nb_appareils_mois,depassement_appareils_facture,montant_depassement_appareils_ht)
  select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,
    coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel',coalesce(a.nb_appareils,0),coalesce(a.nb_appareils,0)>2,
    case when coalesce(a.nb_appareils,0)>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
  from public.employes e left join public.postes p on p.id=e.poste_id
  left join lateral(select count(*)::integer nb_appareils from public.appareils_comptes ac
    where ac.entreprise_id=e.entreprise_id and ac.utilisateur_id=e.utilisateur_id
      and ac.premiere_activite_at<(p_mois+interval '1 month')
      and(ac.revoque_at is null or ac.revoque_at>=p_mois::timestamptz))a on true
  where e.utilisateur_id is not null and e.compte_application_statut in('actif','pause','ferme')
    and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
    and(e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
  on conflict(entreprise_id,employe_id,mois) do update set
    poste_id=excluded.poste_id,statut_compte=excluded.statut_compte,libelle_poste=excluded.libelle_poste,
    code_offre=excluded.code_offre,montant_ht=excluded.montant_ht,motif=excluded.motif,
    nb_appareils_mois=greatest(public.facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois),
    depassement_appareils_facture=(public.facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture),
    montant_depassement_appareils_ht=greatest(public.facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht)
  where public.facturation_comptes_mensuelle.poste_id is distinct from excluded.poste_id
    or public.facturation_comptes_mensuelle.statut_compte is distinct from excluded.statut_compte
    or public.facturation_comptes_mensuelle.libelle_poste is distinct from excluded.libelle_poste
    or public.facturation_comptes_mensuelle.code_offre is distinct from excluded.code_offre
    or public.facturation_comptes_mensuelle.montant_ht is distinct from excluded.montant_ht
    or public.facturation_comptes_mensuelle.motif is distinct from excluded.motif
    or public.facturation_comptes_mensuelle.nb_appareils_mois is distinct from greatest(public.facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois)
    or public.facturation_comptes_mensuelle.depassement_appareils_facture is distinct from(public.facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture)
    or public.facturation_comptes_mensuelle.montant_depassement_appareils_ht is distinct from greatest(public.facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht);
  get diagnostics v_nb=row_count;
  for v_source in
    select f.entreprise_id,count(*)::integer nombre_lignes,
      md5(string_agg(concat_ws('|',f.employe_id::text,coalesce(f.poste_id::text,''),f.statut_compte,
        coalesce(f.libelle_poste,''),coalesce(f.code_offre,''),f.montant_ht::text,coalesce(f.motif,''),
        f.nb_appareils_mois::text,f.depassement_appareils_facture::text,f.montant_depassement_appareils_ht::text),'||' order by f.employe_id)) empreinte
    from public.facturation_comptes_mensuelle f where f.mois=p_mois group by f.entreprise_id
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_source.entreprise_id::text||':'||p_mois::text,0));
    select * into v_ancien from public.plateforme_snapshots_facturation
      where entreprise_id=v_source.entreprise_id and mois=p_mois for update;
    if found and v_ancien.empreinte=v_source.empreinte then continue; end if;
    v_version:=case when found then v_ancien.version+1 else 1 end;
    insert into public.plateforme_snapshots_facturation(entreprise_id,mois,empreinte,version,nombre_lignes)
      values(v_source.entreprise_id,p_mois,v_source.empreinte,v_version,v_source.nombre_lignes)
      on conflict(entreprise_id,mois) do update set empreinte=excluded.empreinte,version=excluded.version,
        nombre_lignes=excluded.nombre_lignes,updated_at=now();
    insert into public.historique_mutations_plateforme(
      domaine,action,entreprise_id,objet_type,auteur_utilisateur_id,ancien,nouveau,nombre_lignes,resultat)
    values('facturation','snapshot_mensuel',v_source.entreprise_id,'mois_facturation',auth.uid(),
      case when v_ancien.entreprise_id is null then null else jsonb_build_object('mois',p_mois,'version',v_ancien.version,'nombre_lignes',v_ancien.nombre_lignes) end,
      jsonb_build_object('mois',p_mois,'version',v_version,'nombre_lignes',v_source.nombre_lignes),
      v_source.nombre_lignes,case when v_version=1 then 'cree' else 'modifie' end);
  end loop;
  return v_nb;
end;
$$;

-- Préflight strictement STABLE et sans appel externe.
create or replace function public.plateforme_preflight_integrite()
returns table(controle text, anomalies bigint, bloquant boolean)
language sql security definer stable set search_path=public as $$
  select 'applications_historique_inconnues',count(*),true from public.historique_acces_applications h
    left join public.applications_elsatia a on a.code=h.application_code where a.code is null
  union all select 'administrateurs_etat_incoherent',count(*),true from public.plateforme_admins where not(
    (statut_identite='en_attente' and utilisateur_id is null and not actif and activation_at is null and revocation_at is null)
    or(statut_identite='rattachee_non_confirmee' and utilisateur_id is not null and not actif and activation_at is null and revocation_at is null)
    or(statut_identite='active' and utilisateur_id is not null and actif and activation_at is not null and revocation_at is null)
    or(statut_identite='revoquee' and not actif and revocation_at is not null))
  union all select 'administrateurs_actifs_sans_uid',count(*),true from public.plateforme_admins where actif and utilisateur_id is null
  union all select 'uid_administrateurs_dupliques',count(*),true from(select utilisateur_id from public.plateforme_admins where utilisateur_id is not null group by utilisateur_id having count(*)>1)d
  union all select 'sessions_support_ouvertes_sans_admin_actif',count(*),true from public.plateforme_acces_entreprises s
    left join public.plateforme_admins pa on pa.utilisateur_id=s.plateforme_user_id and pa.actif and pa.statut_identite='active'
    where s.termine_at is null and pa.utilisateur_id is null
  union all select 'historique_support_utilisateur_absent',count(*),true from public.plateforme_acces_entreprises s left join public.utilisateurs u on u.id=s.plateforme_user_id where u.id is null
  union all select 'administrateur_total_actif_absent',case when exists(select 1 from public.plateforme_admins where role='total' and actif and statut_identite='active')then 0 else 1 end,true
  union all select 'historique_domaine_inconnu',count(*),true from public.historique_mutations_plateforme where domaine not in('support','facturation','tarification','multi_app','administrateur','entreprise','securite')
  union all select 'snapshots_cle_dupliquee',count(*),true from(select entreprise_id,mois from public.plateforme_snapshots_facturation group by entreprise_id,mois having count(*)>1)d
  union all select 'remises_locales_incoherentes',count(*),true from public.entreprises where(remise_stripe_coupon_id is null)<>(remise_description is null)
    or remise_stripe_coupon_id is null and(remise_type is not null or remise_valeur is not null or remise_appliquee_at is not null)
  union all select 'reponses_support_orphelines',count(*),true from public.support_messages p where p.cote='plateforme'
    and not exists(select 1 from public.support_messages c where c.entreprise_id=p.entreprise_id and c.cote='entreprise' and c.created_at<=p.created_at)
  union all select 'audit_abonnement_definition_incomplete',case when pg_get_functiondef('public.plateforme_modifier_abonnement(uuid,text,date,text)'::regprocedure)
    ilike all(array['%impaye_signale_at%','%suspension_prevue_at%','%impaye_message%']) then 0 else 1 end,true;
$$;

revoke all on function public.plateforme_preautoriser_effet_externe(uuid,text) from public,anon,authenticated;
grant execute on function public.plateforme_preautoriser_effet_externe(uuid,text) to authenticated;
revoke all on function public.plateforme_journaliser_echec_synchronisation_remise(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.plateforme_journaliser_echec_synchronisation_remise(uuid,text,boolean) to authenticated;
revoke all on function public.plateforme_support_repondre(uuid,text) from public,anon;
grant execute on function public.plateforme_support_repondre(uuid,text) to authenticated;
revoke all on function public.plateforme_preflight_integrite() from public,anon,authenticated;
grant execute on function public.plateforme_preflight_integrite() to service_role;

notify pgrst,'reload schema';
