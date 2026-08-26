-- Isole strictement le contenu support, sépare les consultations des mutations
-- et journalise uniquement les changements plateforme réellement appliqués.

create table if not exists public.historique_mutations_plateforme (
  id uuid primary key default gen_random_uuid(),
  domaine text not null check (domaine in ('support','multi_app','facturation','entreprise')),
  action text not null check (btrim(action) <> ''),
  entreprise_id uuid references public.entreprises(id) on delete restrict,
  objet_type text not null check (btrim(objet_type) <> ''),
  objet_id uuid,
  auteur_utilisateur_id uuid not null references auth.users(id) on delete restrict,
  ancien jsonb,
  nouveau jsonb,
  nombre_lignes integer not null default 1 check (nombre_lignes >= 0),
  resultat text not null default 'modifie' check (resultat in ('modifie','cree','evenement_periodique')),
  created_at timestamptz not null default now()
);

create index if not exists historique_mutations_plateforme_entreprise_idx
  on public.historique_mutations_plateforme(entreprise_id, created_at desc);
create index if not exists historique_mutations_plateforme_auteur_idx
  on public.historique_mutations_plateforme(auteur_utilisateur_id, created_at desc);

alter table public.historique_mutations_plateforme enable row level security;
drop policy if exists historique_mutations_plateforme_lecture on public.historique_mutations_plateforme;
create policy historique_mutations_plateforme_lecture
on public.historique_mutations_plateforme for select to authenticated
using (public.est_plateforme_admin());

revoke all on table public.historique_mutations_plateforme from public, anon, authenticated;
grant select on table public.historique_mutations_plateforme to authenticated;

-- L'historique multi-app existant reçoit les états avant/après sans réécrire
-- les événements historiques déjà conservés.
alter table public.historique_acces_applications
  add column if not exists ancien jsonb,
  add column if not exists nouveau jsonb,
  add column if not exists resultat text not null default 'modifie'
    check (resultat in ('modifie','cree'));

-- La liste globale des fils ne contient que des métadonnées minimales. Dans le
-- modèle courant, un fil support est identifié canoniquement par entreprise_id.
drop function if exists public.plateforme_support_fils();
create function public.plateforme_support_fils()
returns table(
  entreprise_id uuid,
  entreprise_nom text,
  dernier_at timestamptz,
  non_lus integer,
  total integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  return query
  select e.id,e.nom,max(m.created_at),
    count(*) filter(where m.cote='entreprise' and not m.lu_par_plateforme)::integer,
    count(*)::integer
  from public.entreprises e
  join public.support_messages m on m.entreprise_id=e.id
  group by e.id,e.nom
  order by max(m.created_at) desc;
end;
$$;

-- Une lecture de contenu est pure : elle ne marque rien comme lu et n'altère
-- ni la session, ni l'entreprise active, ni un historique.
create or replace function public.plateforme_support_messages(p_entreprise_id uuid)
returns table(id uuid,cote text,auteur_nom text,contenu text,created_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;
  if not exists(select 1 from public.support_messages where entreprise_id=p_entreprise_id) then
    raise exception 'Fil support introuvable';
  end if;
  return query
  select m.id,m.cote,m.auteur_nom,m.contenu,m.created_at
  from public.support_messages m
  where m.entreprise_id=p_entreprise_id
  order by m.created_at;
end;
$$;

-- L'acquittement est une mutation explicite. L'identifiant du fil est
-- entreprise_id tant qu'un seul fil support existe par entreprise.
create or replace function public.plateforme_support_marquer_messages_lus(p_entreprise_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre integer;
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;
  if not exists(select 1 from public.support_messages where entreprise_id=p_entreprise_id) then
    raise exception 'Fil support introuvable';
  end if;

  update public.support_messages
  set lu_par_plateforme=true
  where entreprise_id=p_entreprise_id
    and cote='entreprise'
    and not lu_par_plateforme;
  get diagnostics v_nombre = row_count;

  if v_nombre > 0 then
    insert into public.historique_mutations_plateforme(
      domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,
      ancien,nouveau,nombre_lignes,resultat
    ) values (
      'support','messages_marques_lus',p_entreprise_id,'fil_support',p_entreprise_id,
      auth.uid(),jsonb_build_object('non_lus',v_nombre),
      jsonb_build_object('non_lus',0),v_nombre,'modifie'
    );
  end if;
  return v_nombre;
end;
$$;

-- Les mutations multi-app deviennent idempotentes et retournent vrai uniquement
-- lorsqu'un état métier a effectivement changé.
drop function if exists public.plateforme_activer_application_entreprise(uuid,text,timestamptz,timestamptz,text,text);
create function public.plateforme_activer_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null,
  p_source text default null,
  p_reference_externe text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien public.acces_applications_entreprises%rowtype;
  v_resultat text;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if not exists(select 1 from public.entreprises where id=p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;
  if not exists(select 1 from public.applications_elsatia where code=p_application_code) then
    raise exception 'Application introuvable';
  end if;

  select * into v_ancien from public.acces_applications_entreprises
  where entreprise_id=p_entreprise_id and application_code=p_application_code
  for update;

  if found and v_ancien.autorise
     and v_ancien.source is not distinct from p_source
     and v_ancien.reference_externe is not distinct from p_reference_externe
     and v_ancien.valide_du is not distinct from p_valide_du
     and v_ancien.valide_jusqu_au is not distinct from p_valide_jusqu_au then
    return false;
  end if;

  if v_ancien.id is null then
    insert into public.acces_applications_entreprises(
      entreprise_id,application_code,autorise,source,reference_externe,valide_du,valide_jusqu_au
    ) values (
      p_entreprise_id,p_application_code,true,p_source,p_reference_externe,p_valide_du,p_valide_jusqu_au
    );
    v_resultat := 'cree';
  else
    update public.acces_applications_entreprises
    set autorise=true,source=p_source,reference_externe=p_reference_externe,
        valide_du=p_valide_du,valide_jusqu_au=p_valide_jusqu_au
    where id=v_ancien.id;
    v_resultat := 'modifie';
  end if;

  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id,
    ancien,nouveau,resultat
  ) values (
    'entreprise',p_entreprise_id,p_application_code,'activation',auth.email(),auth.uid(),
    case when v_ancien.id is null then null else jsonb_build_object(
      'autorise',v_ancien.autorise,'source',v_ancien.source,
      'reference_externe',v_ancien.reference_externe,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au) end,
    jsonb_build_object('autorise',true,'source',p_source,'reference_externe',p_reference_externe,
      'valide_du',p_valide_du,'valide_jusqu_au',p_valide_jusqu_au),v_resultat
  );
  return true;
end;
$$;

drop function if exists public.plateforme_desactiver_application_entreprise(uuid,text);
create function public.plateforme_desactiver_application_entreprise(
  p_entreprise_id uuid,p_application_code text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.acces_applications_entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.acces_applications_entreprises
  where entreprise_id=p_entreprise_id and application_code=p_application_code for update;
  if not found or not v_ancien.autorise then return false; end if;
  update public.acces_applications_entreprises set autorise=false where id=v_ancien.id;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id,
    ancien,nouveau,resultat
  ) values (
    'entreprise',p_entreprise_id,p_application_code,'desactivation',auth.email(),auth.uid(),
    jsonb_build_object(
      'autorise',v_ancien.autorise,'source',v_ancien.source,
      'reference_externe',v_ancien.reference_externe,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au),
    jsonb_build_object(
      'autorise',false,'source',v_ancien.source,
      'reference_externe',v_ancien.reference_externe,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au),
    'modifie'
  );
  return true;
end;
$$;

drop function if exists public.plateforme_habiliter_utilisateur_application(uuid,uuid,text,text,timestamptz,timestamptz);
create function public.plateforme_habiliter_utilisateur_application(
  p_utilisateur_id uuid,p_entreprise_id uuid,p_application_code text,p_role_code text,
  p_valide_du timestamptz default null,p_valide_jusqu_au timestamptz default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare
  v_ancien public.habilitations_applications_utilisateurs%rowtype;
  v_resultat text;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if not exists(select 1 from public.utilisateurs_entreprises
                where utilisateur_id=p_utilisateur_id and entreprise_id=p_entreprise_id and statut='actif') then
    raise exception 'Utilisateur non membre actif de cette entreprise';
  end if;
  if not exists(select 1 from public.roles_applications_elsatia
                where application_code=p_application_code and code=p_role_code and actif) then
    raise exception 'Rôle applicatif introuvable ou inactif';
  end if;
  select * into v_ancien from public.habilitations_applications_utilisateurs
  where entreprise_id=p_entreprise_id and utilisateur_id=p_utilisateur_id
    and application_code=p_application_code for update;
  if found and v_ancien.autorise and v_ancien.role_code=p_role_code
     and v_ancien.valide_du is not distinct from p_valide_du
     and v_ancien.valide_jusqu_au is not distinct from p_valide_jusqu_au then
    return false;
  end if;
  if v_ancien.id is null then
    insert into public.habilitations_applications_utilisateurs(
      entreprise_id,utilisateur_id,application_code,role_code,autorise,valide_du,valide_jusqu_au,attribue_par
    ) values (
      p_entreprise_id,p_utilisateur_id,p_application_code,p_role_code,true,
      p_valide_du,p_valide_jusqu_au,auth.uid()
    );
    v_resultat := 'cree';
  else
    update public.habilitations_applications_utilisateurs
    set role_code=p_role_code,autorise=true,valide_du=p_valide_du,
        valide_jusqu_au=p_valide_jusqu_au,attribue_par=auth.uid()
    where id=v_ancien.id;
    v_resultat := 'modifie';
  end if;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id,
    ancien,nouveau,resultat
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,'habilitation:'||p_role_code,
    auth.email(),auth.uid(),
    case when v_ancien.id is null then null else jsonb_build_object(
      'autorise',v_ancien.autorise,'role_code',v_ancien.role_code,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au) end,
    jsonb_build_object('autorise',true,'role_code',p_role_code,
      'valide_du',p_valide_du,'valide_jusqu_au',p_valide_jusqu_au),v_resultat
  );
  return true;
end;
$$;

drop function if exists public.plateforme_retirer_habilitation_application(uuid,uuid,text);
create function public.plateforme_retirer_habilitation_application(
  p_utilisateur_id uuid,p_entreprise_id uuid,p_application_code text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.habilitations_applications_utilisateurs%rowtype;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.habilitations_applications_utilisateurs
  where entreprise_id=p_entreprise_id and utilisateur_id=p_utilisateur_id
    and application_code=p_application_code for update;
  if not found or not v_ancien.autorise then return false; end if;
  update public.habilitations_applications_utilisateurs set autorise=false where id=v_ancien.id;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id,
    ancien,nouveau,resultat
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,'retrait_habilitation',
    auth.email(),auth.uid(),
    jsonb_build_object(
      'autorise',v_ancien.autorise,'role_code',v_ancien.role_code,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au),
    jsonb_build_object(
      'autorise',false,'role_code',v_ancien.role_code,
      'valide_du',v_ancien.valide_du,'valide_jusqu_au',v_ancien.valide_jusqu_au),
    'modifie'
  );
  return true;
end;
$$;

-- Facturation : contrôle explicite des cibles, idempotence quand elle a un sens
-- métier, et audit UID commun aux mutations qui n'en possédaient pas.
drop function if exists public.plateforme_modifier_abonnement(uuid,text,date,text);
create function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid,p_statut text,p_echeance date,p_note text
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype;
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
  where id=p_entreprise_id;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','abonnement_modifie',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('statut',v_ancien.abonnement_statut,'echeance',v_ancien.abonnement_echeance,'note',v_ancien.abonnement_note),
    jsonb_build_object('statut',p_statut,'echeance',p_echeance,'note',p_note));
  return true;
end;
$$;

drop function if exists public.plateforme_modifier_tarif_poste(uuid,text,numeric);
create function public.plateforme_modifier_tarif_poste(
  p_poste_id uuid,p_code_offre text,p_tarif numeric
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.postes%rowtype; v_code text; v_tarif numeric;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_tarif is null or p_tarif<0 then raise exception 'Tarif invalide'; end if;
  v_code := coalesce(nullif(btrim(p_code_offre),''),'standard');
  v_tarif := round(p_tarif,2);
  select * into v_ancien from public.postes where id=p_poste_id for update;
  if not found then raise exception 'Poste introuvable'; end if;
  if v_ancien.code_offre=v_code and v_ancien.tarif_compte_mensuel=v_tarif then return false; end if;
  update public.postes set code_offre=v_code,tarif_compte_mensuel=v_tarif where id=p_poste_id;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','tarif_poste_modifie',v_ancien.entreprise_id,'poste',p_poste_id,auth.uid(),
    jsonb_build_object('code_offre',v_ancien.code_offre,'tarif',v_ancien.tarif_compte_mensuel),
    jsonb_build_object('code_offre',v_code,'tarif',v_tarif));
  return true;
end;
$$;

create or replace function public.plateforme_signaler_impaye(
  p_entreprise_id uuid,p_message text default null
) returns timestamptz
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_echeance timestamptz:=now()+interval '10 days'; v_message text;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found or v_ancien.abonnement_statut='annule' then
    raise exception 'Entreprise introuvable ou abonnement annulé';
  end if;
  v_message:=coalesce(nullif(btrim(p_message),''),'Règlement non reçu');
  update public.entreprises set impaye_signale_at=now(),suspension_prevue_at=v_echeance,
    impaye_message=v_message,abonnement_note=coalesce(nullif(btrim(p_message),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','impaye_signale',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('impaye_signale_at',v_ancien.impaye_signale_at,'suspension_prevue_at',v_ancien.suspension_prevue_at,'message',v_ancien.impaye_message),
    jsonb_build_object('suspension_prevue_at',v_echeance,'message',v_message));
  return v_echeance;
end;
$$;

drop function if exists public.plateforme_enregistrer_reglement(uuid,text);
create function public.plateforme_enregistrer_reglement(
  p_entreprise_id uuid,p_note text default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype; v_reglement_at timestamptz:=now();
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  update public.entreprises set abonnement_statut=case when abonnement_statut='suspendu' then 'actif' else abonnement_statut end,
    impaye_signale_at=null,suspension_prevue_at=null,impaye_message=null,dernier_reglement_at=v_reglement_at,
    abonnement_note=coalesce(nullif(btrim(p_note),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,ancien,nouveau
  ) values ('facturation','reglement_enregistre',p_entreprise_id,'entreprise',p_entreprise_id,auth.uid(),
    jsonb_build_object('statut',v_ancien.abonnement_statut,'dernier_reglement_at',v_ancien.dernier_reglement_at),
    jsonb_build_object('statut',case when v_ancien.abonnement_statut='suspendu' then 'actif' else v_ancien.abonnement_statut end,
      'dernier_reglement_at',v_reglement_at));
  return true;
end;
$$;

drop function if exists public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric);
create function public.plateforme_appliquer_remise(
  p_entreprise_id uuid,p_coupon_id text,p_description text,p_motif_interne text default null,
  p_duree_mois integer default null,p_type text default null,p_valeur numeric default null
) returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
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
  where id=p_entreprise_id;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values (p_entreprise_id,auth.uid(),'remise_appliquee',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
    jsonb_build_object('remise_stripe_coupon_id',p_coupon_id,'remise_description',p_description,'duree_mois',p_duree_mois),p_motif_interne);
  return true;
end;
$$;

drop function if exists public.plateforme_retirer_remise(uuid);
create function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns boolean
language plpgsql security definer set search_path=public as $$
declare v_ancien public.entreprises%rowtype;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_ancien from public.entreprises where id=p_entreprise_id for update;
  if not found then raise exception 'Entreprise introuvable'; end if;
  if v_ancien.remise_stripe_coupon_id is null and v_ancien.remise_description is null
     and v_ancien.remise_motif_interne is null and v_ancien.remise_duree_mois is null
     and v_ancien.remise_type is null and v_ancien.remise_valeur is null then return false; end if;
  update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
    remise_motif_interne=null,remise_duree_mois=null,remise_type=null,remise_valeur=null,
    remise_cree_par=null,remise_appliquee_at=null,updated_at=now() where id=p_entreprise_id;
  insert into public.historique_tarification(entreprise_id,utilisateur_id,action,ancien,nouveau,motif)
  values (p_entreprise_id,auth.uid(),'remise_retiree',
    jsonb_build_object('remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,'remise_description',v_ancien.remise_description),
    null,null);
  return true;
end;
$$;

-- Le snapshot est un événement périodique explicite. Son audit est global car
-- une exécution couvre potentiellement plusieurs entreprises ; les lignes de
-- facturation conservent individuellement leur entreprise et leur employé.
create or replace function public.plateforme_snapshot_facturation(
  p_mois date default date_trunc('month',current_date)::date
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_nb integer;
begin
  perform public.plateforme_exiger_role('total','facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour'; end if;
  insert into public.facturation_comptes_mensuelle(
    entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,
    montant_ht,motif,nb_appareils_mois,depassement_appareils_facture,montant_depassement_appareils_ht
  )
  select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,
    coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel',coalesce(a.nb_appareils,0),
    coalesce(a.nb_appareils,0)>2,
    case when coalesce(a.nb_appareils,0)>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
  from public.employes e
  left join public.postes p on p.id=e.poste_id
  left join lateral (
    select count(*)::integer nb_appareils from public.appareils_comptes ac
    where ac.entreprise_id=e.entreprise_id and ac.utilisateur_id=e.utilisateur_id
      and ac.premiere_activite_at<(p_mois+interval '1 month')
      and (ac.revoque_at is null or ac.revoque_at>=p_mois::timestamptz)
  ) a on true
  where e.utilisateur_id is not null and e.compte_application_statut in ('actif','pause','ferme')
    and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
    and (e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
  on conflict(entreprise_id,employe_id,mois) do update
  set nb_appareils_mois=greatest(public.facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois),
      depassement_appareils_facture=(public.facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture),
      montant_depassement_appareils_ht=greatest(public.facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht)
  where public.facturation_comptes_mensuelle.nb_appareils_mois is distinct from greatest(public.facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois)
     or public.facturation_comptes_mensuelle.depassement_appareils_facture is distinct from (public.facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture)
     or public.facturation_comptes_mensuelle.montant_depassement_appareils_ht is distinct from greatest(public.facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht);
  get diagnostics v_nb=row_count;
  insert into public.historique_mutations_plateforme(
    domaine,action,objet_type,auteur_utilisateur_id,nouveau,nombre_lignes,resultat
  ) values ('facturation','snapshot_mensuel_execute','mois_facturation',auth.uid(),
    jsonb_build_object('mois',p_mois,'lignes_modifiees',v_nb),v_nb,'evenement_periodique');
  return v_nb;
end;
$$;

create or replace function public.plateforme_creer_entreprise(
  p_nom text,p_siret text default null,p_ville text default null
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_modele record;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if nullif(btrim(p_nom),'') is null then raise exception 'Nom obligatoire'; end if;
  insert into public.entreprises(nom,raison_sociale,siret,ville,abonnement_statut,abonnement_note)
  values (btrim(p_nom),btrim(p_nom),nullif(btrim(p_siret),''),nullif(btrim(p_ville),''),'essai','Créée par la plateforme')
  returning id into v_id;
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    perform public.appliquer_modele_role_predefini_interne(v_id,v_modele.cle,true);
  end loop;
  insert into public.historique_mutations_plateforme(
    domaine,action,entreprise_id,objet_type,objet_id,auteur_utilisateur_id,nouveau,resultat
  ) values ('entreprise','entreprise_creee',v_id,'entreprise',v_id,auth.uid(),
    jsonb_build_object('nom',btrim(p_nom),'siret',nullif(btrim(p_siret),''),'ville',nullif(btrim(p_ville),'')),'cree');
  return v_id;
end;
$$;

-- Surface d'exécution finale : aucune table d'audit n'est directement modifiable
-- par les rôles API et toutes les RPC mutatives restent explicitement nommées.
revoke all on function public.plateforme_support_fils() from public,anon;
revoke all on function public.plateforme_support_messages(uuid) from public,anon;
revoke all on function public.plateforme_support_marquer_messages_lus(uuid) from public,anon;
revoke all on function public.plateforme_activer_application_entreprise(uuid,text,timestamptz,timestamptz,text,text) from public,anon;
revoke all on function public.plateforme_desactiver_application_entreprise(uuid,text) from public,anon;
revoke all on function public.plateforme_habiliter_utilisateur_application(uuid,uuid,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.plateforme_retirer_habilitation_application(uuid,uuid,text) from public,anon;
revoke all on function public.plateforme_modifier_abonnement(uuid,text,date,text) from public,anon;
revoke all on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) from public,anon;
revoke all on function public.plateforme_signaler_impaye(uuid,text) from public,anon;
revoke all on function public.plateforme_enregistrer_reglement(uuid,text) from public,anon;
revoke all on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) from public,anon;
revoke all on function public.plateforme_retirer_remise(uuid) from public,anon;
revoke all on function public.plateforme_snapshot_facturation(date) from public,anon;
revoke all on function public.plateforme_creer_entreprise(text,text,text) from public,anon;

grant execute on function public.plateforme_support_fils() to authenticated;
grant execute on function public.plateforme_support_messages(uuid) to authenticated;
grant execute on function public.plateforme_support_marquer_messages_lus(uuid) to authenticated;
grant execute on function public.plateforme_activer_application_entreprise(uuid,text,timestamptz,timestamptz,text,text) to authenticated;
grant execute on function public.plateforme_desactiver_application_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_habiliter_utilisateur_application(uuid,uuid,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.plateforme_retirer_habilitation_application(uuid,uuid,text) to authenticated;
grant execute on function public.plateforme_modifier_abonnement(uuid,text,date,text) to authenticated;
grant execute on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) to authenticated;
grant execute on function public.plateforme_signaler_impaye(uuid,text) to authenticated;
grant execute on function public.plateforme_enregistrer_reglement(uuid,text) to authenticated;
grant execute on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) to authenticated;
grant execute on function public.plateforme_retirer_remise(uuid) to authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
grant execute on function public.plateforme_creer_entreprise(text,text,text) to authenticated;

notify pgrst,'reload schema';
