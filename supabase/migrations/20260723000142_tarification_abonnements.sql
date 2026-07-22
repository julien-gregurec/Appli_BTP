-- Grille tarifaire versionnee et quotas IA mensuels.
-- Les contrats existants sont figes au prix historique afin qu'une nouvelle
-- grille ne modifie jamais silencieusement une facture client.

alter table public.entreprises drop constraint if exists entreprises_abonnement_offre_check;
alter table public.entreprises
  add constraint entreprises_abonnement_offre_check
  check (abonnement_offre is null or abonnement_offre in (
    'essentiel','premium','mini','pro','business','entreprise','sur_mesure'
  ));

alter table public.entreprises
  add column if not exists abonnement_version_tarif integer,
  add column if not exists abonnement_prix_contractuel_ht numeric(12,2),
  add column if not exists abonnement_devise text not null default 'EUR',
  add column if not exists abonnement_changement_offre text,
  add column if not exists abonnement_changement_prevu_at timestamptz,
  add column if not exists ia_active boolean not null default true,
  add column if not exists ia_politique_quota text not null default 'blocage'
    check (ia_politique_quota in ('blocage','depassement_facture','achat_pack')),
  add column if not exists ia_credits_achetes integer not null default 0
    check (ia_credits_achetes >= 0),
  add column if not exists ia_plafond_cout_mensuel_ht numeric(12,2)
    check (ia_plafond_cout_mensuel_ht is null or ia_plafond_cout_mensuel_ht >= 0),
  add column if not exists ia_afficher_cout_interne boolean not null default false,
  add column if not exists abonnement_alerte_quota_ia integer not null default 70
    check (abonnement_alerte_quota_ia between 1 and 100);

create table if not exists public.plans_abonnement (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null,
  nom text not null,
  prix_mensuel_ht numeric(12,2) not null check (prix_mensuel_ht >= 0),
  prix_annuel_ht numeric(12,2) not null check (prix_annuel_ht >= 0),
  devise text not null default 'EUR',
  utilisateurs_inclus integer not null check (utilisateurs_inclus >= 0),
  administrateurs_inclus integer check (administrateurs_inclus is null or administrateurs_inclus >= 0),
  operations_ia_incluses integer not null default 0 check (operations_ia_incluses >= 0),
  stockage_go_inclus numeric(12,2) not null default 0 check (stockage_go_inclus >= 0),
  fonctionnalites jsonb not null default '[]'::jsonb,
  actif boolean not null default true,
  devis_obligatoire boolean not null default false,
  valide_du date not null default current_date,
  valide_au date,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(code, version),
  check (valide_au is null or valide_au >= valide_du)
);

create unique index if not exists plans_abonnement_un_actif_par_code
  on public.plans_abonnement(code) where actif;

create table if not exists public.catalogue_options_abonnement (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  version integer not null default 1,
  nom text not null,
  prix_mensuel_ht numeric(12,2) not null check (prix_mensuel_ht >= 0),
  unite text not null default 'option',
  quantite_incluse numeric(12,2) not null default 0,
  actif boolean not null default true,
  configuration jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(code, version)
);

create unique index if not exists catalogue_options_un_actif_par_code
  on public.catalogue_options_abonnement(code) where actif;

create table if not exists public.catalogue_services_mise_en_service (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nom text not null,
  prix_min_ht numeric(12,2) not null check (prix_min_ht >= 0),
  prix_max_ht numeric(12,2) not null check (prix_max_ht >= prix_min_ht),
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.abonnements_entreprises (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null unique references public.entreprises(id) on delete cascade,
  plan_id uuid references public.plans_abonnement(id),
  code_offre text not null,
  version_tarif integer not null,
  periodicite text not null default 'mensuel' check (periodicite in ('mensuel','annuel')),
  prix_contractuel_ht numeric(12,2) not null check (prix_contractuel_ht >= 0),
  devise text not null default 'EUR',
  statut text not null default 'essai' check (statut in ('essai','actif','impaye','suspendu','annule')),
  debut_periode timestamptz,
  fin_periode timestamptz,
  plan_suivant_id uuid references public.plans_abonnement(id),
  changement_prevu_at timestamptz,
  stripe_subscription_id text,
  stripe_customer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.options_abonnement_entreprises (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  option_id uuid not null references public.catalogue_options_abonnement(id),
  quantite numeric(12,2) not null default 1 check (quantite >= 0),
  prix_unitaire_contractuel_ht numeric(12,2) not null check (prix_unitaire_contractuel_ht >= 0),
  active boolean not null default true,
  debut_at timestamptz not null default now(),
  fin_at timestamptz,
  created_at timestamptz not null default now(),
  unique(entreprise_id, option_id, debut_at)
);

create table if not exists public.factures_abonnement (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  stripe_invoice_id text unique,
  numero text,
  periode_debut timestamptz,
  periode_fin timestamptz,
  montant_ht numeric(12,2) not null default 0,
  montant_tva numeric(12,2) not null default 0,
  montant_ttc numeric(12,2) not null default 0,
  devise text not null default 'EUR',
  statut text not null default 'brouillon',
  url_facture text,
  url_pdf text,
  payee_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.historique_tarification (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete cascade,
  utilisateur_id uuid references auth.users(id),
  action text not null,
  ancien jsonb,
  nouveau jsonb,
  motif text,
  created_at timestamptz not null default now()
);

alter table public.journal_ia
  add column if not exists fournisseur text,
  add column if not exists modele text,
  add column if not exists jetons_entree integer not null default 0 check (jetons_entree >= 0),
  add column if not exists jetons_sortie integer not null default 0 check (jetons_sortie >= 0),
  add column if not exists jetons_total integer not null default 0 check (jetons_total >= 0),
  add column if not exists cout_estime_ht numeric(12,6) not null default 0 check (cout_estime_ht >= 0),
  add column if not exists operation_id text,
  add column if not exists mois_facturation date generated always as (date_trunc('month', created_at at time zone 'UTC')::date) stored,
  add column if not exists operations_decomptees integer not null default 1 check (operations_decomptees >= 0),
  add column if not exists annule_at timestamptz;

create unique index if not exists journal_ia_operation_unique
  on public.journal_ia(entreprise_id, operation_id) where operation_id is not null;
create index if not exists journal_ia_quota_mensuel_idx
  on public.journal_ia(entreprise_id, mois_facturation, statut) where annule_at is null;

insert into public.plans_abonnement(
  code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
  administrateurs_inclus,operations_ia_incluses,stockage_go_inclus,fonctionnalites,actif,devis_obligatoire
) values
  ('mini',1,'Mini',79,948,3,1,100,10,
   '["acces_dashboard","acces_messagerie","acces_clients","acces_chantiers","acces_devis","acces_factures","acces_facturation_avancee","acces_planning","acces_ia"]',true,false),
  ('pro',2,'Pro',249,2988,15,3,500,50,
   '["acces_dashboard","acces_messagerie","acces_clients","acces_chantiers","acces_devis","acces_factures","acces_facturation_avancee","acces_planning","acces_ia","acces_pointage","saisir_son_pointage","acces_employes","demander_ses_conges","saisir_ses_notes_frais","acces_achats","acces_interventions","acces_crm","voir_devis_chantier_sans_prix"]',true,false),
  ('business',1,'Business',449,5388,30,6,1500,150,
   '["acces_dashboard","acces_messagerie","acces_clients","acces_chantiers","acces_devis","acces_factures","acces_facturation_avancee","acces_planning","acces_ia","acces_pointage","saisir_son_pointage","acces_employes","demander_ses_conges","saisir_ses_notes_frais","acces_achats","acces_interventions","acces_crm","voir_devis_chantier_sans_prix","acces_stock","utiliser_borne_stock","acces_outillage","acces_flotte","acces_ouvrages","acces_rentabilite","acces_exports","consulter_sa_paie","saisir_variables_paie","controler_variables_paie"]',true,false),
  ('entreprise',1,'Entreprise',599,6468,50,10,3000,300,
   '["acces_dashboard","acces_messagerie","acces_clients","acces_chantiers","acces_devis","acces_factures","acces_facturation_avancee","acces_planning","acces_ia","acces_pointage","saisir_son_pointage","acces_employes","demander_ses_conges","saisir_ses_notes_frais","acces_achats","acces_interventions","acces_crm","voir_devis_chantier_sans_prix","acces_stock","utiliser_borne_stock","acces_outillage","acces_flotte","acces_ouvrages","acces_rentabilite","acces_exports","consulter_sa_paie","saisir_variables_paie","controler_variables_paie","acces_connecteurs","acces_appels_offres","acces_sous_traitants","acces_paiements_bancaires","gerer_paie","exporter_paie","parametrer_paie"]',true,false),
  ('sur_mesure',1,'Sur mesure',699,8388,50,null,3000,500,
   '["acces_dashboard","acces_messagerie","acces_clients","acces_chantiers","acces_devis","acces_factures","acces_facturation_avancee","acces_planning","acces_ia","acces_pointage","saisir_son_pointage","acces_employes","demander_ses_conges","saisir_ses_notes_frais","acces_achats","acces_interventions","acces_crm","voir_devis_chantier_sans_prix","acces_stock","utiliser_borne_stock","acces_outillage","acces_flotte","acces_ouvrages","acces_rentabilite","acces_exports","consulter_sa_paie","saisir_variables_paie","controler_variables_paie","acces_connecteurs","acces_appels_offres","acces_sous_traitants","acces_paiements_bancaires","gerer_paie","exporter_paie","parametrer_paie"]',true,true),
  ('essentiel',0,'Essentiel historique',59,566.40,2,1,0,5,'[]',false,false),
  ('pro',1,'Pro historique',129,1238.40,5,2,0,25,'[]',false,false),
  ('premium',0,'Premium historique',249,2390.40,10,3,0,100,'[]',false,false)
on conflict (code,version) do nothing;

insert into public.catalogue_services_mise_en_service(code,nom,prix_min_ht,prix_max_ht)
values
  ('forfait_standard','Forfait de mise en service standard',1990,1990),
  ('installation_simple','Installation simple',490,490),
  ('import_donnees','Import employes, clients et fournisseurs',690,690),
  ('configuration_40','Configuration complete jusqu''a 40 employes',1500,2500),
  ('formation_distance','Formation a distance - demi-journee',490,490),
  ('formation_site','Formation sur site - journee, hors frais de deplacement',900,1200)
on conflict (code) do nothing;

insert into public.catalogue_options_abonnement(code,version,nom,prix_mensuel_ht,unite,configuration)
values
  ('compte_terrain',1,'Compte terrain supplementaire',5,'compte','{}'),
  ('compte_chef_equipe',1,'Compte chef equipe supplementaire',9,'compte','{}'),
  ('compte_administratif',1,'Compte administratif supplementaire',15,'compte','{}'),
  ('expert_comptable',1,'Acces expert-comptable',0,'compte','{}'),
  ('stockage',1,'Stockage supplementaire',19,'palier','{"a_partir_de_go":1}'),
  ('synchronisation_bancaire',1,'Synchronisation bancaire',29,'connexion','{"maximum_ht":59}'),
  ('credits_ia',1,'Pack de credits IA',29,'pack','{"operations":500}'),
  ('ia_intensive',1,'IA intensive',79,'option','{"operations":2500}')
on conflict (code,version) do nothing;

insert into public.abonnements_entreprises(
  entreprise_id,plan_id,code_offre,version_tarif,periodicite,prix_contractuel_ht,
  statut,stripe_subscription_id,stripe_customer_id
)
select e.id,p.id,coalesce(e.abonnement_offre,'essentiel'),p.version,
       coalesce(e.abonnement_periodicite,'mensuel'),
       case coalesce(e.abonnement_offre,'essentiel')
         when 'premium' then 249 when 'pro' then 129 when 'essentiel' then 59
         when 'mini' then 79 when 'business' then 449 when 'entreprise' then 599
         when 'sur_mesure' then 699 else 59 end,
       case when e.abonnement_statut='actif' then 'actif'
            when e.abonnement_statut='suspendu' then 'suspendu'
            when e.abonnement_statut='annule' then 'annule' else 'essai' end,
       e.stripe_subscription_id,e.stripe_customer_id
from public.entreprises e
join lateral (
  select p.* from public.plans_abonnement p
  where p.code=coalesce(e.abonnement_offre,'essentiel')
  order by case
    when coalesce(e.abonnement_offre,'essentiel')='pro' and e.abonnement_prix_contractuel_ht is null then (p.version=1)::integer
    else p.actif::integer
  end desc, p.version desc
  limit 1
) p on true
on conflict (entreprise_id) do nothing;

alter table public.plans_abonnement enable row level security;
alter table public.catalogue_options_abonnement enable row level security;
alter table public.catalogue_services_mise_en_service enable row level security;
alter table public.abonnements_entreprises enable row level security;
alter table public.options_abonnement_entreprises enable row level security;
alter table public.factures_abonnement enable row level security;
alter table public.historique_tarification enable row level security;

drop policy if exists "plans lecture publique" on public.plans_abonnement;
create policy "plans lecture publique" on public.plans_abonnement for select using (actif or public.est_plateforme_admin());
drop policy if exists "options lecture publique" on public.catalogue_options_abonnement;
create policy "options lecture publique" on public.catalogue_options_abonnement for select using (actif or public.est_plateforme_admin());
drop policy if exists "services lecture publique" on public.catalogue_services_mise_en_service;
create policy "services lecture publique" on public.catalogue_services_mise_en_service for select using (actif or public.est_plateforme_admin());

drop policy if exists "abonnement entreprise lecture gestion" on public.abonnements_entreprises;
create policy "abonnement entreprise lecture gestion" on public.abonnements_entreprises for select
using (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres') or public.est_plateforme_admin());
drop policy if exists "options entreprise lecture gestion" on public.options_abonnement_entreprises;
create policy "options entreprise lecture gestion" on public.options_abonnement_entreprises for select
using (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres') or public.est_plateforme_admin());
drop policy if exists "factures abonnement lecture gestion" on public.factures_abonnement;
create policy "factures abonnement lecture gestion" on public.factures_abonnement for select
using (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres') or public.est_plateforme_admin());
drop policy if exists "historique tarif lecture plateforme" on public.historique_tarification;
create policy "historique tarif lecture plateforme" on public.historique_tarification for select using (
  public.est_plateforme_admin() or
  (entreprise_id is not null and public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres'))
);

drop policy if exists "journal_ia_select" on public.journal_ia;
drop policy if exists "journal_ia_insert" on public.journal_ia;
drop policy if exists "journal_ia_update" on public.journal_ia;
drop policy if exists "journal_ia_delete" on public.journal_ia;
drop policy if exists journal_ia_membres on public.journal_ia;
create policy "journal_ia_select" on public.journal_ia for select using (
  utilisateur_id=auth.uid() or
  (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres')) or
  public.est_plateforme_admin()
);
create policy "journal_ia_insert" on public.journal_ia for insert with check (
  utilisateur_id=auth.uid() and public.est_membre_actif(entreprise_id)
);

grant select on public.plans_abonnement, public.catalogue_options_abonnement,
  public.catalogue_services_mise_en_service to anon, authenticated;
grant select on public.abonnements_entreprises, public.options_abonnement_entreprises,
  public.factures_abonnement, public.historique_tarification to authenticated;

create or replace function public.plateforme_creer_version_tarif(
  p_code text,
  p_nom text,
  p_prix_mensuel_ht numeric,
  p_prix_annuel_ht numeric,
  p_utilisateurs_inclus integer,
  p_administrateurs_inclus integer,
  p_operations_ia_incluses integer,
  p_stockage_go_inclus numeric,
  p_valide_du date,
  p_motif text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare
  v_precedent plans_abonnement%rowtype;
  v_id uuid;
  v_version integer;
begin
  if not public.est_plateforme_admin() then raise exception 'Acces reserve a la plateforme'; end if;
  if p_code not in ('mini','pro','business','entreprise','sur_mesure') then raise exception 'Code offre invalide'; end if;
  if p_prix_mensuel_ht < 0 or p_prix_annuel_ht < 0 then raise exception 'Prix invalide'; end if;
  select * into v_precedent from plans_abonnement where code=p_code and actif order by version desc limit 1 for update;
  select coalesce(max(version),0)+1 into v_version from plans_abonnement where code=p_code;
  update plans_abonnement set actif=false,valide_au=p_valide_du-1 where code=p_code and actif;
  insert into plans_abonnement(
    code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
    administrateurs_inclus,operations_ia_incluses,stockage_go_inclus,
    fonctionnalites,actif,devis_obligatoire,valide_du,created_by
  ) values (
    p_code,v_version,p_nom,p_prix_mensuel_ht,p_prix_annuel_ht,p_utilisateurs_inclus,
    p_administrateurs_inclus,p_operations_ia_incluses,p_stockage_go_inclus,
    coalesce(v_precedent.fonctionnalites,'[]'::jsonb),true,p_code='sur_mesure',p_valide_du,auth.uid()
  ) returning id into v_id;
  insert into historique_tarification(utilisateur_id,action,ancien,nouveau,motif)
  values(auth.uid(),'nouvelle_version_tarifaire',to_jsonb(v_precedent),jsonb_build_object('plan_id',v_id,'code',p_code,'version',v_version),p_motif);
  return v_id;
end; $$;

grant execute on function public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text) to authenticated;

notify pgrst, 'reload schema';
