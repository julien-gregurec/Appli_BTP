-- GP V1 — numérotation des documents configurable par entreprise (préfixe FACULTATIF).
--
-- Demande de Julien (validation utilisateur 2026-09-13) : chaque entreprise choisit le format de ses
-- numéros de devis, factures, avoirs et commandes — préfixe facultatif (« DEV-2026-00125 » ou « 00125 »),
-- année et mois facultatifs, séparateur (-, / ou aucun), largeur du compteur, remise à zéro annuelle.
--
-- Garanties conservées :
--   * le numéro est attribué EN BASE, à la première sortie du brouillon (jamais en amont, jamais côté client) ;
--   * un seul compteur par entreprise et par nature (`compteurs_reference`, incrément atomique `on conflict do
--     update` : deux transactions concurrentes obtiennent deux valeurs distinctes) ;
--   * unicité `unique (entreprise_id, numero)` sur `devis`, `factures`, `commandes_fournisseurs` (inchangée) ;
--   * sans réglage, le format reste EXACTEMENT celui d'aujourd'hui (DEV-AAAA-001, FAC-AAAA-001, CMD-AAAA-001,
--     avoirs sur la séquence des factures) : aucune renumérotation, aucun trou.

create table if not exists public.numerotation_documents (
  entreprise_id   uuid not null references public.entreprises (id) on delete cascade,
  type_document   text not null check (type_document in ('devis', 'facture', 'avoir', 'commande')),
  prefixe         text not null default '' check (prefixe ~ '^[A-Z0-9]{0,8}$'),
  avec_annee      boolean not null default true,
  avec_mois       boolean not null default false,
  separateur      text not null default '-' check (separateur in ('-', '/', '')),
  largeur         integer not null default 3 check (largeur between 1 and 8),
  -- Compteur remis à 1 chaque année (exige l'année dans le numéro pour rester unique).
  compteur_annuel boolean not null default false check (not compteur_annuel or avec_annee),
  maj_le          timestamptz not null default now(),
  maj_par         uuid default auth.uid(),
  primary key (entreprise_id, type_document)
);
comment on table public.numerotation_documents is
  'Format des numéros de documents (devis, facture, avoir, commande) par entreprise. Absent = format historique.';

alter table public.numerotation_documents enable row level security;
drop policy if exists numerotation_documents_lecture on public.numerotation_documents;
create policy numerotation_documents_lecture on public.numerotation_documents
  for select to authenticated using (public.est_membre_actif(entreprise_id));
drop policy if exists numerotation_documents_ecriture on public.numerotation_documents;
create policy numerotation_documents_ecriture on public.numerotation_documents
  for all to authenticated
  using (public.a_permission(entreprise_id, 'gerer_parametres'))
  with check (public.a_permission(entreprise_id, 'gerer_parametres'));
grant select, insert, update, delete on public.numerotation_documents to authenticated;
revoke all on public.numerotation_documents from anon;

-- Format par défaut (= comportement historique) ---------------------------------------------------------------
create or replace function public.numerotation_document_defaut(p_type text)
returns table (prefixe text, avec_annee boolean, avec_mois boolean, separateur text, largeur integer, compteur_annuel boolean)
language sql immutable as $$
  select case p_type when 'devis' then 'DEV' when 'facture' then 'FAC' when 'avoir' then 'FAC' when 'commande' then 'CMD' else 'DOC' end,
         true, false, '-', 3,
         p_type = 'commande'  -- les commandes repartaient déjà à 1 chaque année (compteur « commande-AAAA »)
$$;

-- Réglage effectif d'une entreprise (réglage propre, sinon défaut) -----------------------------------------------
create or replace function public.numerotation_document_format(p_entreprise_id uuid, p_type text)
returns table (prefixe text, avec_annee boolean, avec_mois boolean, separateur text, largeur integer, compteur_annuel boolean, configure boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(n.prefixe, d.prefixe), coalesce(n.avec_annee, d.avec_annee), coalesce(n.avec_mois, d.avec_mois),
         coalesce(n.separateur, d.separateur), coalesce(n.largeur, d.largeur), coalesce(n.compteur_annuel, d.compteur_annuel),
         n.entreprise_id is not null
  from public.numerotation_document_defaut(p_type) d
  left join public.numerotation_documents n on n.entreprise_id = p_entreprise_id and n.type_document = p_type
$$;

-- Mise en forme d'un numéro (pure) -------------------------------------------------------------------------------
create or replace function public.formater_numero_document(p_prefixe text, p_avec_annee boolean, p_avec_mois boolean, p_separateur text, p_largeur integer, p_numero integer, p_date date)
returns text language sql immutable as $$
  select array_to_string(array_remove(array[
           nullif(p_prefixe, ''),
           case when p_avec_annee then to_char(p_date, 'YYYY') end,
           case when p_avec_mois then to_char(p_date, 'MM') end,
           lpad(p_numero::text, greatest(p_largeur, 1), '0')
         ], null), p_separateur)
$$;

-- Clé de compteur : nature du document, éventuellement par année ; un avoir non configuré partage la séquence
-- des factures (comportement historique).
create or replace function public.numerotation_document_cle_compteur(p_entreprise_id uuid, p_type text, p_date date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_type text := p_type;
  v_annuel boolean;
begin
  if p_type = 'avoir' and not exists (select 1 from public.numerotation_documents where entreprise_id = p_entreprise_id and type_document = 'avoir') then
    v_type := 'facture';
  end if;
  select f.compteur_annuel into v_annuel from public.numerotation_document_format(p_entreprise_id, v_type) f;
  -- Compatibilité : les commandes utilisaient déjà la clé « commande-AAAA ».
  if v_annuel then return v_type || '-' || to_char(p_date, 'YYYY'); end if;
  return v_type;
end $$;

-- Prochain numéro ATTRIBUÉ (incrément atomique du compteur) : réservé aux déclencheurs ------------------------------
create or replace function public.numero_document_suivant(p_entreprise_id uuid, p_type text, p_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  f record;
  v_type text := case when p_type = 'avoir' and not exists (select 1 from public.numerotation_documents where entreprise_id = p_entreprise_id and type_document = 'avoir') then 'facture' else p_type end;
  v_cle text := public.numerotation_document_cle_compteur(p_entreprise_id, p_type, p_date);
  v_numero integer;
begin
  select * into f from public.numerotation_document_format(p_entreprise_id, v_type);
  insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
  values (p_entreprise_id, v_cle, 1)
  on conflict (entreprise_id, type)
  do update set dernier_numero = public.compteurs_reference.dernier_numero + 1
  returning dernier_numero into v_numero;
  return public.formater_numero_document(f.prefixe, f.avec_annee, f.avec_mois, f.separateur, f.largeur, v_numero, p_date);
end $$;
revoke all on function public.numero_document_suivant(uuid, text, date) from public, anon, authenticated, service_role;

-- Aperçu du prochain numéro (SANS incrément), pour l'écran de réglages : membres de l'entreprise -----------------------
create or replace function public.numero_document_apercu(p_entreprise_id uuid, p_type text, p_date date default current_date)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  f record;
  v_type text := case when p_type = 'avoir' and not exists (select 1 from public.numerotation_documents where entreprise_id = p_entreprise_id and type_document = 'avoir') then 'facture' else p_type end;
  v_cle text := public.numerotation_document_cle_compteur(p_entreprise_id, p_type, p_date);
  v_numero integer;
begin
  if not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé' using errcode = '42501'; end if;
  select * into f from public.numerotation_document_format(p_entreprise_id, v_type);
  select coalesce(c.dernier_numero, 0) + 1 into v_numero from (select 1) x left join public.compteurs_reference c on c.entreprise_id = p_entreprise_id and c.type = v_cle;
  return public.formater_numero_document(f.prefixe, f.avec_annee, f.avec_mois, f.separateur, f.largeur, v_numero, p_date);
end $$;
revoke all on function public.numero_document_apercu(uuid, text, date) from public, anon, service_role;
grant execute on function public.numero_document_apercu(uuid, text, date) to authenticated;
revoke all on function public.numerotation_document_format(uuid, text) from public, anon, service_role;
grant execute on function public.numerotation_document_format(uuid, text) to authenticated;
revoke all on function public.numerotation_document_cle_compteur(uuid, text, date) from public, anon, authenticated, service_role;

-- Déclencheurs : mêmes moments d'attribution qu'avant, format configurable ------------------------------------------
create or replace function public.trg_devis_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null and new.statut <> 'brouillon' then
    new.numero := public.numero_document_suivant(new.entreprise_id, 'devis', coalesce(new.date_emission, current_date));
  end if;
  return new;
end $$;

create or replace function public.trg_facture_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null and new.statut <> 'brouillon' then
    new.numero := public.numero_document_suivant(new.entreprise_id, case when new.type = 'avoir' then 'avoir' else 'facture' end, coalesce(new.date_emission, current_date));
  end if;
  return new;
end $$;

create or replace function public.trg_commande_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null or btrim(new.numero) = '' then
    new.numero := public.numero_document_suivant(new.entreprise_id, 'commande', coalesce(new.date_commande, current_date));
  end if;
  return new;
end $$;

-- Journal : un changement de format est tracé (qui, quand) via maj_le / maj_par ; l'historique des documents
-- (`gp_historique_document`, numéro attribué) reste inchangé.
