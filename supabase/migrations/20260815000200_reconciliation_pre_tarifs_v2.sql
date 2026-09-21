-- Préparation append-only de TARIFS-V2 (201) pour les bases où le catalogue
-- initial a été créé après la date historique du 16 août 2026.
--
-- La migration 201 reste strictement inchangée. Cette préparation mémorise les
-- lignes concernées, neutralise seulement les violations qui empêcheraient la
-- contrainte publique d'être créée et suspend temporairement la contrainte de
-- chronologie. La migration 254 restaure ensuite une chronologie valide et
-- journalise chaque ajustement. Sur Preview, où 201 est déjà appliquée, cette
-- migration est un no-op métier.

create table if not exists public.migration_tarifs_v2_reconciliation_v2 (
  plan_id uuid primary key,
  code text not null,
  version integer not null,
  original_actif boolean not null,
  original_valide_du date not null,
  original_valide_au date,
  original_prix_mensuel_ht numeric,
  original_prix_annuel_ht numeric,
  original_devis_obligatoire boolean not null,
  captured_at timestamptz not null default now()
);

revoke all on table public.migration_tarifs_v2_reconciliation_v2
  from public, anon, authenticated, service_role;

insert into public.migration_tarifs_v2_reconciliation_v2 (
  plan_id, code, version, original_actif, original_valide_du,
  original_valide_au, original_prix_mensuel_ht, original_prix_annuel_ht,
  original_devis_obligatoire
)
select
  p.id, p.code, p.version, p.actif, p.valide_du, p.valide_au,
  p.prix_mensuel_ht, p.prix_annuel_ht, p.devis_obligatoire
from public.plans_abonnement p
where p.actif
  and not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.plans_abonnement'::regclass
      and conname = 'plans_abonnement_tarif_public_coherent'
  )
  and p.code in ('mini', 'pro', 'business', 'entreprise', 'sur_mesure')
  and (
    p.valide_du > date '2026-08-15'
    or not (
      (p.devis_obligatoire and p.prix_mensuel_ht is null and p.prix_annuel_ht is null)
      or (
        not p.devis_obligatoire
        and p.prix_mensuel_ht is not null
        and p.prix_annuel_ht is not null
        and p.prix_mensuel_ht >= 0
        and p.prix_annuel_ht >= 0
      )
    )
  )
on conflict (plan_id) do nothing;

do $$
begin
  if exists (select 1 from public.migration_tarifs_v2_reconciliation_v2) then
    update public.plans_abonnement p
    set actif = false
    from public.migration_tarifs_v2_reconciliation_v2 m
    where p.id = m.plan_id
      and not (
        (p.devis_obligatoire and p.prix_mensuel_ht is null and p.prix_annuel_ht is null)
        or (
          not p.devis_obligatoire
          and p.prix_mensuel_ht is not null
          and p.prix_annuel_ht is not null
          and p.prix_mensuel_ht >= 0
          and p.prix_annuel_ht >= 0
        )
      );

    alter table public.plans_abonnement
      drop constraint if exists plans_abonnement_check;
  end if;
end $$;
