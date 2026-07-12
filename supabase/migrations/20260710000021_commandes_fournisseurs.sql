-- Commandes fournisseurs : création et réception atomiques, isolation stricte par entreprise.

create unique index if not exists chantiers_id_entreprise_unique
  on public.chantiers(id, entreprise_id);

create table public.fournisseurs (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  reference text not null,
  nom text not null check (btrim(nom) <> ''),
  contact_nom text,
  email text,
  telephone text,
  adresse text,
  code_postal text,
  ville text,
  siret text,
  notes text,
  actif boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, reference),
  unique (id, entreprise_id)
);

create or replace function public.trg_fournisseur_reference()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reference is null or btrim(new.reference) = '' then
    new.reference := public.next_reference(new.entreprise_id, 'fournisseur', 'FRN', 4, false);
  end if;
  return new;
end; $$;
create trigger fournisseur_reference before insert on public.fournisseurs
  for each row execute function public.trg_fournisseur_reference();

create table public.commandes_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  numero text not null,
  fournisseur_id uuid not null,
  chantier_id uuid,
  statut text not null default 'brouillon'
    check (statut in ('brouillon','envoyee','confirmee','recue_partiel','recue','annulee')),
  date_commande date not null default current_date,
  date_livraison_prevue date,
  montant_ht numeric(12,2) not null default 0 check (montant_ht >= 0),
  montant_tva numeric(12,2) not null default 0 check (montant_tva >= 0),
  montant_ttc numeric(12,2) not null default 0 check (montant_ttc >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entreprise_id, numero),
  unique (id, entreprise_id),
  check (date_livraison_prevue is null or date_livraison_prevue >= date_commande),
  foreign key (fournisseur_id, entreprise_id)
    references public.fournisseurs(id, entreprise_id) on delete restrict,
  foreign key (chantier_id, entreprise_id)
    references public.chantiers(id, entreprise_id) on delete set null (chantier_id)
);

create table public.lignes_commande (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  commande_id uuid not null,
  designation text not null check (btrim(designation) <> ''),
  description text,
  quantite numeric(12,2) not null default 1 check (quantite > 0),
  unite text not null default 'u' check (btrim(unite) <> ''),
  prix_unitaire_ht numeric(12,2) not null default 0 check (prix_unitaire_ht >= 0),
  taux_tva numeric(5,2) not null default 20 check (taux_tva between 0 and 100),
  quantite_recue numeric(12,2) not null default 0 check (quantite_recue between 0 and quantite),
  ordre int not null default 0 check (ordre >= 0),
  created_at timestamptz not null default now(),
  foreign key (commande_id, entreprise_id)
    references public.commandes_fournisseurs(id, entreprise_id) on delete cascade
);
create index lignes_commande_commande_idx on public.lignes_commande(commande_id, ordre);

create or replace function public.trg_commande_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.next_reference(
      new.entreprise_id,
      'commande-' || to_char(new.date_commande, 'YYYY'),
      'CMD', 3, true
    );
  end if;
  return new;
end; $$;
create trigger commande_numero before insert on public.commandes_fournisseurs
  for each row execute function public.trg_commande_numero();

create or replace function public.recalc_totaux_commande(p_commande_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_ht numeric(12,2) := 0; v_tva numeric(12,2) := 0;
begin
  select round(coalesce(sum(quantite * prix_unitaire_ht), 0), 2),
         round(coalesce(sum(round(quantite * prix_unitaire_ht * taux_tva / 100, 2)), 0), 2)
  into v_ht, v_tva
  from public.lignes_commande where commande_id = p_commande_id;

  update public.commandes_fournisseurs
  set montant_ht = v_ht, montant_tva = v_tva,
      montant_ttc = v_ht + v_tva, updated_at = now()
  where id = p_commande_id
    and (montant_ht, montant_tva, montant_ttc)
      is distinct from (v_ht, v_tva, v_ht + v_tva);
end; $$;

create or replace function public.trg_recalc_commande()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.commande_id is distinct from new.commande_id then
    perform public.recalc_totaux_commande(old.commande_id);
  end if;
  perform public.recalc_totaux_commande(coalesce(new.commande_id, old.commande_id));
  return null;
end; $$;
create trigger recalc_commande_apres_ligne
  after insert or update or delete on public.lignes_commande
  for each row execute function public.trg_recalc_commande();

create or replace function public.creer_commande_fournisseur(
  p_entreprise_id uuid,
  p_commande jsonb,
  p_lignes jsonb
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nb int;
begin
  if not exists (
    select 1 from public.fournisseurs
    where id = (p_commande->>'fournisseur_id')::uuid
      and entreprise_id = p_entreprise_id and actif
  ) then raise exception 'Fournisseur introuvable ou inactif'; end if;

  if nullif(p_commande->>'chantier_id', '') is not null and not exists (
    select 1 from public.chantiers
    where id = (p_commande->>'chantier_id')::uuid and entreprise_id = p_entreprise_id
  ) then raise exception 'Chantier introuvable'; end if;

  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Ajoutez au moins une ligne';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_lignes) as l(
      designation text, quantite numeric, unite text,
      prix_unitaire_ht numeric, taux_tva numeric, ordre int
    )
    where nullif(btrim(l.designation), '') is null or l.quantite <= 0
      or l.prix_unitaire_ht < 0 or l.taux_tva not between 0 and 100
  ) then raise exception 'Une ligne de commande est invalide'; end if;

  insert into public.commandes_fournisseurs(
    entreprise_id, fournisseur_id, chantier_id,
    date_commande, date_livraison_prevue, notes
  ) values (
    p_entreprise_id,
    (p_commande->>'fournisseur_id')::uuid,
    nullif(p_commande->>'chantier_id', '')::uuid,
    coalesce(nullif(p_commande->>'date_commande', '')::date, current_date),
    nullif(p_commande->>'date_livraison_prevue', '')::date,
    nullif(p_commande->>'notes', '')
  ) returning id into v_id;

  insert into public.lignes_commande(
    entreprise_id, commande_id, designation, description,
    quantite, unite, prix_unitaire_ht, taux_tva, ordre
  )
  select p_entreprise_id, v_id, btrim(l.designation), nullif(btrim(l.description), ''),
    l.quantite, l.unite, l.prix_unitaire_ht, l.taux_tva, l.ordre
  from jsonb_to_recordset(p_lignes) as l(
    designation text, description text, quantite numeric, unite text,
    prix_unitaire_ht numeric, taux_tva numeric, ordre int
  );
  get diagnostics v_nb = row_count;
  if v_nb <> jsonb_array_length(p_lignes) then raise exception 'Lignes de commande incomplètes'; end if;

  perform public.recalc_totaux_commande(v_id);
  return v_id;
end; $$;

create or replace function public.changer_statut_commande(
  p_entreprise_id uuid, p_commande_id uuid, p_statut text
)
returns void language plpgsql security definer set search_path = public as $$
declare v_actuel text; v_autorise boolean := false;
begin
  select statut into v_actuel from public.commandes_fournisseurs
  where id = p_commande_id and entreprise_id = p_entreprise_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if p_statut = v_actuel then return; end if;

  v_autorise := case v_actuel
    when 'brouillon' then p_statut in ('envoyee','annulee')
    when 'envoyee' then p_statut in ('confirmee','recue','annulee')
    when 'confirmee' then p_statut in ('recue','annulee')
    when 'recue_partiel' then p_statut in ('recue','annulee')
    else false end;
  if not v_autorise then raise exception 'Transition de statut non autorisée'; end if;

  if p_statut = 'recue' then
    update public.lignes_commande set quantite_recue = quantite
    where commande_id = p_commande_id and entreprise_id = p_entreprise_id;
  end if;
  update public.commandes_fournisseurs set statut = p_statut, updated_at = now()
  where id = p_commande_id and entreprise_id = p_entreprise_id;
end; $$;

create or replace function public.enregistrer_reception_commande(
  p_entreprise_id uuid, p_commande_id uuid, p_receptions jsonb
)
returns text language plpgsql security definer set search_path = public as $$
declare v_statut text; v_attendu int; v_trouve int; v_nouveau text;
begin
  select statut into v_statut from public.commandes_fournisseurs
  where id = p_commande_id and entreprise_id = p_entreprise_id for update;
  if not found then raise exception 'Commande introuvable'; end if;
  if v_statut not in ('envoyee','confirmee','recue_partiel') then
    raise exception 'Cette commande ne peut pas être réceptionnée';
  end if;
  if jsonb_typeof(p_receptions) <> 'array' or jsonb_array_length(p_receptions) = 0 then
    raise exception 'Aucune quantité reçue';
  end if;

  v_attendu := jsonb_array_length(p_receptions);
  select count(*) into v_trouve
  from jsonb_to_recordset(p_receptions) as r(ligne_id uuid, quantite_recue numeric)
  join public.lignes_commande l on l.id = r.ligne_id
    and l.commande_id = p_commande_id and l.entreprise_id = p_entreprise_id
  where r.quantite_recue between 0 and l.quantite;
  if v_trouve <> v_attendu then raise exception 'Réception invalide ou ligne étrangère'; end if;

  update public.lignes_commande l set quantite_recue = r.quantite_recue
  from jsonb_to_recordset(p_receptions) as r(ligne_id uuid, quantite_recue numeric)
  where l.id = r.ligne_id and l.commande_id = p_commande_id
    and l.entreprise_id = p_entreprise_id;

  select case
    when bool_and(quantite_recue = quantite) then 'recue'
    when bool_or(quantite_recue > 0) then 'recue_partiel'
    else 'confirmee' end
  into v_nouveau from public.lignes_commande where commande_id = p_commande_id;
  update public.commandes_fournisseurs set statut = v_nouveau, updated_at = now()
  where id = p_commande_id and entreprise_id = p_entreprise_id;
  return v_nouveau;
end; $$;

alter table public.fournisseurs enable row level security;
alter table public.commandes_fournisseurs enable row level security;
alter table public.lignes_commande enable row level security;
create policy "membres fournisseurs" on public.fournisseurs for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "membres commandes" on public.commandes_fournisseurs for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "membres lignes commande" on public.lignes_commande for all using (public.est_membre_actif(entreprise_id)) with check (public.est_membre_actif(entreprise_id));
create policy "prototype fournisseurs" on public.fournisseurs for all to anon using (true) with check (true);
create policy "prototype commandes" on public.commandes_fournisseurs for all to anon using (true) with check (true);
create policy "prototype lignes commande" on public.lignes_commande for all to anon using (true) with check (true);

grant select, insert, update, delete on public.fournisseurs to anon, authenticated;
grant select, insert, delete on public.commandes_fournisseurs to anon, authenticated;
grant select, insert on public.lignes_commande to anon, authenticated;
grant execute on function public.creer_commande_fournisseur(uuid,jsonb,jsonb) to anon, authenticated;
grant execute on function public.changer_statut_commande(uuid,uuid,text) to anon, authenticated;
grant execute on function public.enregistrer_reception_commande(uuid,uuid,jsonb) to anon, authenticated;
revoke all on function public.recalc_totaux_commande(uuid) from public, anon, authenticated;
revoke all on function public.trg_recalc_commande() from public, anon, authenticated;
revoke all on function public.trg_fournisseur_reference() from public, anon, authenticated;
revoke all on function public.trg_commande_numero() from public, anon, authenticated;

notify pgrst, 'reload schema';
