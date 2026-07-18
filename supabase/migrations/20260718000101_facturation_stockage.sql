-- Mesure et refacturation du stockage Supabase par entreprise.
-- 1 Go commercial = 1 000 000 000 octets.

create table if not exists public.abonnement_stockage_releves (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  stripe_invoice_id text not null unique,
  stripe_invoice_item_id text,
  offre text not null check (offre in ('essentiel','pro','premium')),
  periodicite text not null check (periodicite in ('mensuel','annuel')),
  octets_utilises bigint not null check (octets_utilises >= 0),
  fichiers bigint not null default 0 check (fichiers >= 0),
  quota_go numeric(12,2) not null check (quota_go >= 0),
  depassement_go numeric(12,2) not null default 0 check (depassement_go >= 0),
  tarif_go_ht numeric(12,2) not null default 0.50 check (tarif_go_ht >= 0),
  nombre_mois integer not null default 1 check (nombre_mois in (1,12)),
  montant_ht numeric(12,2) not null default 0 check (montant_ht >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abonnement_stockage_releves_entreprise_date_idx
  on public.abonnement_stockage_releves(entreprise_id, created_at desc);

alter table public.abonnement_stockage_releves enable row level security;
drop policy if exists abonnement_stockage_releves_lecture on public.abonnement_stockage_releves;
create policy abonnement_stockage_releves_lecture on public.abonnement_stockage_releves
  for select to authenticated
  using (public.est_membre_actif(entreprise_id) or public.est_plateforme_admin());

revoke all on public.abonnement_stockage_releves from public, anon, authenticated;
grant select on public.abonnement_stockage_releves to authenticated;

create or replace function public.utilisation_stockage_entreprise(p_entreprise_id uuid)
returns table(octets_utilises bigint, fichiers bigint)
language plpgsql
security definer
stable
set search_path = public, storage
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and not public.est_membre_actif(p_entreprise_id)
     and not public.est_plateforme_admin() then
    raise exception 'Accès refusé au relevé de stockage';
  end if;

  return query
  select
    coalesce(sum(
      case
        when o.metadata ->> 'size' ~ '^[0-9]+$' then (o.metadata ->> 'size')::bigint
        else 0
      end
    ), 0)::bigint,
    count(*)::bigint
  from storage.objects o
  where o.bucket_id = any(array[
    'chantier-documents',
    'entreprise-assets',
    'documents-employes',
    'notes-frais',
    'factures-fournisseurs',
    'fiches-techniques',
    'bulletins-paie',
    'pointage-preuves',
    'notes-frais-exports'
  ]::text[])
    and split_part(o.name, '/', 1) = p_entreprise_id::text;
end;
$$;

revoke all on function public.utilisation_stockage_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.utilisation_stockage_entreprise(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
