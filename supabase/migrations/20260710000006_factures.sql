-- Module Factures : factures, lignes figées, paiements.
-- Contraintes légales : numérotation continue par entreprise, immutabilité après émission.

create table public.factures (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  numero text,
  client_id uuid not null references public.clients(id) on delete restrict,
  chantier_id uuid references public.chantiers(id) on delete set null,
  devis_origine_id uuid references public.devis(id) on delete set null,
  type text not null default 'simple'
    check (type in ('simple', 'acompte', 'situation', 'finale', 'avoir')),
  statut text not null default 'brouillon'
    check (statut in ('brouillon', 'envoyee', 'payee_partiel', 'payee', 'en_retard', 'annulee', 'avoir_emis')),
  date_emission date not null default current_date,
  date_echeance date,
  montant_ht numeric not null default 0,
  montant_tva numeric not null default 0,
  montant_ttc numeric not null default 0,
  montant_paye numeric not null default 0,
  notes_client text,
  notes_internes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, numero)
);

create table public.lignes_factures (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
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

create table public.paiements (
  id uuid primary key default gen_random_uuid(),
  facture_id uuid not null references public.factures(id) on delete cascade,
  montant numeric not null,
  date date not null default current_date,
  mode text not null default 'virement'
    check (mode in ('virement', 'cheque', 'especes', 'cb', 'carte_en_ligne')),
  reference text,
  created_at timestamptz not null default now()
);

-- Numéro attribué à l'émission (brouillon -> émise), séquence distincte des devis.
create or replace function public.trg_facture_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null and new.statut <> 'brouillon' then
    new.numero := public.next_reference(new.entreprise_id, 'facture', 'FAC', 3, true);
  end if;
  return new;
end; $$;

create trigger set_facture_numero
  before insert or update of statut on public.factures
  for each row execute function public.trg_facture_numero();

-- Recalcul des totaux HT/TVA/TTC depuis les lignes.
create or replace function public.recalc_totaux_facture(p_facture_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ht numeric := 0; v_tva numeric := 0;
begin
  select coalesce(sum(ligne_ht), 0), coalesce(sum(ligne_ht * taux_tva / 100), 0)
  into v_ht, v_tva
  from (select (quantite * prix_unitaire_ht) * (1 - remise_ligne / 100) as ligne_ht, taux_tva
        from public.lignes_factures where facture_id = p_facture_id) s;
  update public.factures
  set montant_ht = round(v_ht, 2), montant_tva = round(v_tva, 2),
      montant_ttc = round(v_ht + v_tva, 2), updated_at = now()
  where id = p_facture_id;
end; $$;

create or replace function public.trg_recalc_facture()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_totaux_facture(coalesce(new.facture_id, old.facture_id));
  return null;
end; $$;

create trigger recalc_facture_apres_ligne
  after insert or update or delete on public.lignes_factures
  for each row execute function public.trg_recalc_facture();

-- Recalcul du montant payé + statut auto (payée / partiellement payée) depuis les paiements.
create or replace function public.recalc_paiements_facture(p_facture_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paye numeric := 0; v_ttc numeric := 0; v_statut text;
begin
  select coalesce(sum(montant), 0) into v_paye from public.paiements where facture_id = p_facture_id;
  select montant_ttc, statut into v_ttc, v_statut from public.factures where id = p_facture_id;

  -- On ne touche pas aux statuts terminaux (annulée, avoir émis) ni au brouillon.
  if v_statut not in ('brouillon', 'annulee', 'avoir_emis') then
    if v_paye >= v_ttc and v_ttc > 0 then
      v_statut := 'payee';
    elsif v_paye > 0 then
      v_statut := 'payee_partiel';
    else
      v_statut := 'envoyee';
    end if;
  end if;

  update public.factures
  set montant_paye = round(v_paye, 2), statut = v_statut, updated_at = now()
  where id = p_facture_id;
end; $$;

create or replace function public.trg_recalc_paiements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalc_paiements_facture(coalesce(new.facture_id, old.facture_id));
  return null;
end; $$;

create trigger recalc_paiements_apres_paiement
  after insert or update or delete on public.paiements
  for each row execute function public.trg_recalc_paiements();

-- Création d'une facture à partir d'un devis : copie les lignes en snapshot figé.
create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found then raise exception 'Devis introuvable'; end if;
  if not public.est_membre_actif(v_devis.entreprise_id) then
    raise exception 'Accès refusé';
  end if;

  insert into public.factures (entreprise_id, client_id, chantier_id, devis_origine_id, type, notes_client)
  values (v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id, p_devis_id, p_type, v_devis.notes_client)
  returning id into v_facture_id;

  insert into public.lignes_factures (facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
  select v_facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis where devis_id = p_devis_id order by ordre;

  return v_facture_id;
end; $$;

revoke all on function public.creer_facture_depuis_devis(uuid, text) from public;
grant execute on function public.creer_facture_depuis_devis(uuid, text) to authenticated;

alter table public.factures enable row level security;
alter table public.lignes_factures enable row level security;
alter table public.paiements enable row level security;

create policy "membres factures" on public.factures
  for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));

create policy "membres lignes_factures" on public.lignes_factures
  for all using (exists (select 1 from public.factures f where f.id = lignes_factures.facture_id and public.est_membre_actif(f.entreprise_id)))
  with check (exists (select 1 from public.factures f where f.id = lignes_factures.facture_id and public.est_membre_actif(f.entreprise_id)));

create policy "membres paiements" on public.paiements
  for all using (exists (select 1 from public.factures f where f.id = paiements.facture_id and public.est_membre_actif(f.entreprise_id)))
  with check (exists (select 1 from public.factures f where f.id = paiements.facture_id and public.est_membre_actif(f.entreprise_id)));

notify pgrst, 'reload schema';
