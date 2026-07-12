-- Module Devis (cœur financier, partie devis).
-- Factures/paiements/avoirs viendront dans une migration ultérieure.

create table public.devis (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  numero text,
  client_id uuid not null references public.clients(id) on delete restrict,
  chantier_id uuid references public.chantiers(id) on delete set null,
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'annule')),
  date_emission date not null default current_date,
  date_validite date,
  conditions text,
  notes_client text,
  notes_internes text,
  remise_globale numeric not null default 0,
  montant_ht numeric not null default 0,
  montant_tva numeric not null default 0,
  montant_ttc numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, numero)
);

create table public.lignes_devis (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis(id) on delete cascade,
  designation text not null,
  description text,
  type text not null default 'fourniture'
    check (type in ('main_oeuvre', 'fourniture', 'sous_traitance', 'deplacement', 'forfait')),
  quantite numeric not null default 1,
  unite text not null default 'u',
  prix_unitaire_ht numeric not null default 0,
  remise_ligne numeric not null default 0,
  taux_tva numeric not null default 20,
  ordre int not null default 0,
  created_at timestamptz not null default now()
);

-- Numéro de devis généré à l'émission (passage brouillon -> envoyé) plutôt qu'à la création,
-- pour éviter de "brûler" des numéros sur des brouillons jamais envoyés.
create or replace function public.trg_devis_numero()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.numero is null and new.statut <> 'brouillon' then
    new.numero := public.next_reference(new.entreprise_id, 'devis', 'DEV', 3, true);
  end if;
  return new;
end;
$$;

create trigger set_devis_numero
  before insert or update of statut on public.devis
  for each row execute function public.trg_devis_numero();

-- Recalcul des totaux du devis à chaque changement de ses lignes.
create or replace function public.recalc_totaux_devis(p_devis_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ht numeric := 0;
  v_tva numeric := 0;
  v_remise numeric := 0;
begin
  select coalesce(sum(ligne_ht), 0), coalesce(sum(ligne_ht * taux_tva / 100), 0)
  into v_ht, v_tva
  from (
    select (quantite * prix_unitaire_ht) * (1 - remise_ligne / 100) as ligne_ht, taux_tva
    from public.lignes_devis
    where devis_id = p_devis_id
  ) s;

  select remise_globale into v_remise from public.devis where id = p_devis_id;

  -- Remise globale appliquée en pourcentage sur le HT et la TVA.
  v_ht := v_ht * (1 - coalesce(v_remise, 0) / 100);
  v_tva := v_tva * (1 - coalesce(v_remise, 0) / 100);

  update public.devis
  set montant_ht = round(v_ht, 2),
      montant_tva = round(v_tva, 2),
      montant_ttc = round(v_ht + v_tva, 2),
      updated_at = now()
  where id = p_devis_id;
end;
$$;

create or replace function public.trg_recalc_devis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_totaux_devis(coalesce(new.devis_id, old.devis_id));
  return null;
end;
$$;

create trigger recalc_devis_apres_ligne
  after insert or update or delete on public.lignes_devis
  for each row execute function public.trg_recalc_devis();

alter table public.devis enable row level security;
alter table public.lignes_devis enable row level security;

create policy "membres devis" on public.devis
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

create policy "membres lignes_devis" on public.lignes_devis
  for all using (exists (
    select 1 from public.devis d where d.id = lignes_devis.devis_id and public.est_membre_actif(d.entreprise_id)
  )) with check (exists (
    select 1 from public.devis d where d.id = lignes_devis.devis_id and public.est_membre_actif(d.entreprise_id)
  ));
