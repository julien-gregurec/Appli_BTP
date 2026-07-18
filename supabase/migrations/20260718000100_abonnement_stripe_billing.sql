-- Abonnements SaaS Liria -> entreprises clientes via Stripe Billing.
-- Ce flux est strictement séparé de Stripe Connect (entreprise -> ses clients).

alter table public.entreprises
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists abonnement_offre text,
  add column if not exists abonnement_periodicite text,
  add column if not exists abonnement_essai_fin date,
  add column if not exists abonnement_annulation_prevue_at timestamptz,
  add column if not exists derniere_facture_stripe_id text,
  add column if not exists derniere_facture_url text,
  add column if not exists derniere_facture_pdf text,
  add column if not exists derniere_facture_statut text,
  add column if not exists derniere_facture_at timestamptz;

create unique index if not exists entreprises_stripe_customer_unique
  on public.entreprises(stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists entreprises_stripe_subscription_unique
  on public.entreprises(stripe_subscription_id) where stripe_subscription_id is not null;

alter table public.entreprises drop constraint if exists entreprises_abonnement_offre_check;
alter table public.entreprises add constraint entreprises_abonnement_offre_check
  check(abonnement_offre is null or abonnement_offre in ('essentiel','pro','premium'));
alter table public.entreprises drop constraint if exists entreprises_abonnement_periodicite_check;
alter table public.entreprises add constraint entreprises_abonnement_periodicite_check
  check(abonnement_periodicite is null or abonnement_periodicite in ('mensuel','annuel'));

create table if not exists public.abonnement_evenements(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid references public.entreprises(id) on delete set null,
  stripe_event_id text not null unique,
  type text not null,
  statut_resultant text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists abonnement_evenements_entreprise_date_idx
  on public.abonnement_evenements(entreprise_id,created_at desc);
alter table public.abonnement_evenements enable row level security;
drop policy if exists abonnement_evenements_admin_select on public.abonnement_evenements;
create policy abonnement_evenements_admin_select on public.abonnement_evenements
  for select to authenticated using(public.est_plateforme_admin());
revoke all on public.abonnement_evenements from public,anon,authenticated;
grant select on public.abonnement_evenements to authenticated;

-- Le contexte courant expose aussi les dates Stripe pour bloquer un essai expiré
-- même si un webhook temporairement indisponible n'a pas encore changé le statut.
drop function if exists public.contexte_abonnement_courant();
create function public.contexte_abonnement_courant()
returns table(
  entreprise_id uuid,
  nom text,
  reference_interne text,
  logo_url text,
  abonnement_statut text,
  abonnement_echeance date,
  abonnement_essai_fin date,
  suspension_prevue_at timestamptz,
  impaye_message text,
  acces_support boolean
)
language sql security definer stable set search_path=public as $$
  select e.id,e.nom,e.reference_interne,e.logo_url,e.abonnement_statut,
         e.abonnement_echeance,e.abonnement_essai_fin,e.suspension_prevue_at,
         e.impaye_message,public.est_acces_support_actif(e.id)
  from public.utilisateurs u
  join public.entreprises e on e.id=u.entreprise_active_id
  where u.id=auth.uid();
$$;

-- Vue propriétaire enrichie avec la souscription et la dernière facture Stripe.
drop function if exists public.plateforme_entreprises();
create function public.plateforme_entreprises()
returns table(
  id uuid,nom text,code_adhesion text,reference_interne text,
  abonnement_statut text,abonnement_echeance date,abonnement_note text,
  impaye_signale_at timestamptz,suspension_prevue_at timestamptz,
  impaye_message text,dernier_reglement_at timestamptz,
  abonnement_offre text,abonnement_periodicite text,abonnement_essai_fin date,
  abonnement_annulation_prevue_at timestamptz,stripe_customer_id text,
  stripe_subscription_id text,derniere_facture_url text,
  derniere_facture_pdf text,derniere_facture_statut text,
  nb_membres bigint,nb_membres_actifs bigint,created_at timestamptz
)
language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  perform public.appliquer_suspensions_impayes();
  return query
  select e.id,e.nom,e.code_adhesion,e.reference_interne,
         e.abonnement_statut,e.abonnement_echeance,e.abonnement_note,
         e.impaye_signale_at,e.suspension_prevue_at,e.impaye_message,e.dernier_reglement_at,
         e.abonnement_offre,e.abonnement_periodicite,e.abonnement_essai_fin,
         e.abonnement_annulation_prevue_at,e.stripe_customer_id,e.stripe_subscription_id,
         e.derniere_facture_url,e.derniere_facture_pdf,e.derniere_facture_statut,
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;

revoke all on function public.contexte_abonnement_courant() from public,anon,authenticated;
revoke all on function public.plateforme_entreprises() from public,anon,authenticated;
grant execute on function public.contexte_abonnement_courant() to authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

notify pgrst,'reload schema';
