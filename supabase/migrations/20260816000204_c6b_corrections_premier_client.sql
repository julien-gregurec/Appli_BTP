-- C6-B : corrige les trois blocants du premier parcours client.
-- 1. Les lignes de devis restent protégées par RLS mais deviennent accessibles au rôle SQL.
-- 2. L'essai de 30 jours existe dès la création de l'entreprise, indépendamment de Stripe.
-- 3. Le profil de pointage du fondateur reste une activation volontaire (fonction existante).

-- Les policies RESTRICTIVE `role_gestion_*` imposent déjà `gerer_devis` via le devis
-- parent et la policy SELECT impose `acces_devis`. Sans ces grants, PostgreSQL refuse
-- toutefois l'accès avant même d'évaluer la RLS.
grant select, insert, update, delete on table public.lignes_devis to authenticated;
revoke all on table public.lignes_devis from anon;
-- La transformation devis -> facture copie les lignes sous le rôle de l'utilisateur.
-- Les policies de lignes_factures imposent déjà `gerer_factures` et l'isolation tenant.
grant select, insert, update, delete on table public.lignes_factures to authenticated;
revoke all on table public.lignes_factures from anon;

alter table public.entreprises
  add column if not exists abonnement_essai_debut date;

-- Autorité de l'essai : la base crée une fenêtre immuable de 30 jours calendaires.
-- Stripe reçoit ensuite cette même échéance ; il ne crée jamais une seconde période.
update public.entreprises
set abonnement_essai_debut = coalesce(abonnement_essai_debut, created_at::date),
    abonnement_essai_fin = least(
      coalesce(abonnement_essai_fin, coalesce(abonnement_essai_debut, created_at::date) + 30),
      coalesce(abonnement_essai_debut, created_at::date) + 30
    )
where abonnement_essai_debut is null or abonnement_essai_fin is null;

create or replace function public.initialiser_essai_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.abonnement_essai_debut := coalesce(new.abonnement_essai_debut, new.created_at::date, current_date);
  new.abonnement_essai_fin := coalesce(new.abonnement_essai_fin, new.abonnement_essai_debut + 30);
  return new;
end;
$$;

drop trigger if exists initialiser_essai_entreprise on public.entreprises;
create trigger initialiser_essai_entreprise
  before insert on public.entreprises
  for each row execute function public.initialiser_essai_entreprise();

create or replace function public.proteger_facturation_entreprise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Les webhooks utilisent service_role. Les administrateurs plateforme autorisés
  -- conservent leurs outils de gestion. Un membre tenant ne peut ni prolonger son
  -- essai, ni s'activer lui-même en modifiant directement la ligne entreprise.
  if auth.uid() is not null
     and not public.plateforme_a_permission('gerer_facturation')
     and (
       new.abonnement_statut is distinct from old.abonnement_statut
       or new.abonnement_echeance is distinct from old.abonnement_echeance
       or new.abonnement_essai_debut is distinct from old.abonnement_essai_debut
       or new.abonnement_essai_fin is distinct from old.abonnement_essai_fin
       or new.abonnement_offre is distinct from old.abonnement_offre
       or new.abonnement_periodicite is distinct from old.abonnement_periodicite
       or new.abonnement_annulation_prevue_at is distinct from old.abonnement_annulation_prevue_at
       or new.stripe_customer_id is distinct from old.stripe_customer_id
       or new.stripe_subscription_id is distinct from old.stripe_subscription_id
     ) then
    raise exception 'La période d''essai et l''abonnement sont gérés par ELSATIA et Stripe'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_facturation_entreprise on public.entreprises;
create trigger proteger_facturation_entreprise
  before update on public.entreprises
  for each row execute function public.proteger_facturation_entreprise();

alter table public.entreprises
  drop constraint if exists entreprises_essai_dates_coherentes;
alter table public.entreprises
  add constraint entreprises_essai_dates_coherentes
  check (
    abonnement_essai_debut is not null
    and abonnement_essai_fin is not null
    and abonnement_essai_fin between abonnement_essai_debut and abonnement_essai_debut + 30
  );

revoke all on function public.initialiser_essai_entreprise() from public, anon, authenticated;
revoke all on function public.proteger_facturation_entreprise() from public, anon, authenticated;

-- L'ancien RPC exigeait `saisir_son_pointage`, alors que le clic sur ce RPC était
-- justement l'action destinée à activer ce choix individuel : dépendance circulaire.
-- Un responsable autorisé à gérer le pointage peut désormais activer explicitement
-- son propre compte. Il ne peut créer ni lier la fiche d'un autre utilisateur.
create or replace function public.garantir_fiche_pointage_courante(p_entreprise_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_employe uuid;
  v_poste uuid;
  v_poste_nom text;
  v_nom text;
  v_prenom text;
  v_email text;
begin
  if v_uid is null
     or public.est_acces_support_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id, 'gerer_pointage') then
    raise exception 'Accès refusé';
  end if;

  update public.utilisateurs_entreprises
  set pointage_personnel_actif = true
  where utilisateur_id = v_uid
    and entreprise_id = p_entreprise_id
    and statut = 'actif';
  if not found then raise exception 'Compte administrateur non rattaché à l''entreprise'; end if;

  select id into v_employe
  from public.employes
  where entreprise_id = p_entreprise_id
    and utilisateur_id = v_uid
    and statut not in ('sorti','suspendu')
  limit 1;
  if v_employe is not null then return v_employe; end if;

  select ue.poste_id,p.nom into v_poste,v_poste_nom
  from public.utilisateurs_entreprises ue
  left join public.postes p on p.id = ue.poste_id
  where ue.utilisateur_id = v_uid
    and ue.entreprise_id = p_entreprise_id
    and ue.statut = 'actif';

  select coalesce(nullif(btrim(u.nom),''),'Administrateur'),
         coalesce(nullif(btrim(u.prenom),''),'Compte')
  into v_nom,v_prenom
  from public.utilisateurs u where u.id = v_uid;
  v_email := lower(nullif(btrim(coalesce(auth.jwt()->>'email','')),''));

  select id into v_employe
  from public.employes
  where entreprise_id = p_entreprise_id
    and utilisateur_id is null
    and v_email is not null
    and lower(email) = v_email
  limit 1 for update;

  if v_employe is not null then
    update public.employes
    set utilisateur_id = v_uid,
        poste_id = coalesce(poste_id,v_poste),
        poste = coalesce(poste,v_poste_nom),
        compte_application_statut = 'actif',
        compte_application_ouvert_at = coalesce(compte_application_ouvert_at,now()),
        compte_active_at = coalesce(compte_active_at,now()),
        updated_at = now()
    where id = v_employe;
  else
    insert into public.employes(
      entreprise_id,prenom,nom,email,poste,poste_id,type_contrat,date_entree,statut,utilisateur_id,
      compte_application_statut,compte_application_ouvert_at,compte_active_at,notes
    ) values (
      p_entreprise_id,v_prenom,v_nom,v_email,v_poste_nom,v_poste,'autre',current_date,'actif',v_uid,
      'actif',now(),now(),'Fiche personnelle créée après activation volontaire du pointage'
    ) returning id into v_employe;
  end if;
  perform public.snapshot_compte_facturable(v_employe,'fiche_pointage_administrateur');
  return v_employe;
end;
$$;

revoke all on function public.garantir_fiche_pointage_courante(uuid) from public, anon;
grant execute on function public.garantir_fiche_pointage_courante(uuid) to authenticated;

notify pgrst, 'reload schema';
