-- Train canonique V9 FINAL : numéro d'origine 20260930000813, renuméroté 20261002001112
-- (après 20261002000813 hotfix, 20261002000901 Legal Consent et 20261002001001-1003 Security / Stripe :
--  postérieure au ledger de la Preview hébergée). Corps inchangé.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ELSATIA — CHIFFREMENT BANCAIRE : VERSIONNEMENT ET ROTATION DES CLÉS (V1)
--
-- Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md.
--
-- Les IBAN / BIC restent chiffrés CÔTÉ APPLICATION (AES-256-GCM, src/lib/banking-keyring.ts).
-- Cette migration n'introduit AUCUNE clé en base : seulement
--   1. un registre des clés (identifiant, statut, empreinte de contrôle HMAC publiable) ;
--   2. un journal d'audit append-only des opérations de clé et de rechiffrement ;
--   3. une garde d'écriture : aucune donnée bancaire ne peut être écrite sous une clé
--      inconnue, retirée ou compromise ;
--   4. l'index aveugle versionné de l'IBAN (`iban_hash_cle`, NULL = SHA-256 historique) ;
--   5. les RPC opérateur (service_role uniquement) : inventaire, enregistrement, activation
--      (= retour arrière), compromission, retrait, lecture par lots et rechiffrement
--      compare-and-swap par lots (reprenable après interruption à tout moment).
--
-- Formats (en-tête public, jamais le secret) :
--   v1:<iv>:<tag>:<ct>                  historique = clé k1
--   v2:<cle>:A256GCM:<iv>:<tag>:<ct>    versionné
-- Toute autre valeur (jeux de démonstration « DEMO_NON_DECHIFFRABLE_… ») est tolérée à
-- l'écriture comme avant, mais comptée « illisible » par l'inventaire.
--
-- Additive : aucune donnée existante modifiée ; k1 est enregistrée « active » (empreinte à
-- attester par l'opérateur, bank-keys attest). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Lecture de l'en-tête d'un chiffré ────────────────────────────────────

create or replace function public.chiffre_bancaire_format(p_valeur text)
returns text language sql immutable parallel safe set search_path = public as $$
  select case
    when p_valeur ~ '^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$' then 'v1'
    when p_valeur ~ '^v2:k[1-9][0-9]{0,5}:A256GCM:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$' then 'v2'
    else null
  end;
$$;

create or replace function public.chiffre_bancaire_cle(p_valeur text)
returns text language sql immutable parallel safe set search_path = public as $$
  select case public.chiffre_bancaire_format(p_valeur)
    when 'v1' then 'k1'
    when 'v2' then split_part(p_valeur, ':', 2)
    else null
  end;
$$;

revoke all on function public.chiffre_bancaire_format(text) from public, anon, authenticated;
revoke all on function public.chiffre_bancaire_cle(text) from public, anon, authenticated;
grant execute on function public.chiffre_bancaire_format(text) to service_role;
grant execute on function public.chiffre_bancaire_cle(text) to service_role;

-- ── 2. Registre des clés et journal ─────────────────────────────────────────

create table if not exists public.cles_chiffrement_bancaire (
  cle_id text primary key check (cle_id ~ '^k[1-9][0-9]{0,5}$'),
  algorithme text not null default 'A256GCM' check (algorithme = 'A256GCM'),
  statut text not null check (statut in ('preparee','active','dechiffrement','retiree','compromise')),
  -- HMAC-SHA256(clé, « ELSATIA-BANK-KCV-v1:<id> ») : prouve l'identité d'une clé sans la révéler.
  empreinte_controle text check (empreinte_controle ~ '^[0-9a-f]{64}$'),
  motif text check (motif is null or length(motif) <= 500),
  created_at timestamptz not null default now(),
  activee_at timestamptz,
  desactivee_at timestamptz,
  compromise_at timestamptz,
  retiree_at timestamptz,
  check (statut = 'preparee' or statut = 'retiree' or cle_id = 'k1' or empreinte_controle is not null)
);
create unique index if not exists cles_chiffrement_bancaire_une_active
  on public.cles_chiffrement_bancaire ((true)) where statut = 'active';

insert into public.cles_chiffrement_bancaire (cle_id, statut, activee_at, motif)
values ('k1', 'active', now(), 'Clé historique BANK_DATA_ENCRYPTION_KEY (format v1) ; empreinte à attester')
on conflict (cle_id) do nothing;

create table if not exists public.journal_cles_chiffrement_bancaire (
  id bigint generated always as identity primary key,
  action text not null check (action in ('enregistrement','attestation','activation','compromission','retrait','rechiffrement_lot')),
  cle_id text,
  cle_precedente text,
  -- Compteurs et identifiants uniquement : ni clé, ni chiffré, ni clair, ni IBAN.
  details jsonb not null default '{}'::jsonb,
  acteur text not null default current_user,
  created_at timestamptz not null default now()
);
create index if not exists journal_cles_chiffrement_bancaire_date on public.journal_cles_chiffrement_bancaire (created_at desc);

create or replace function public.journal_cles_bancaires_append_only()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Le journal des clés bancaires est en ajout seul' using errcode = '42501';
end;
$$;
drop trigger if exists journal_cles_bancaires_append_only on public.journal_cles_chiffrement_bancaire;
create trigger journal_cles_bancaires_append_only before update or delete on public.journal_cles_chiffrement_bancaire
  for each row execute function public.journal_cles_bancaires_append_only();
revoke all on function public.journal_cles_bancaires_append_only() from public, anon, authenticated, service_role;

alter table public.cles_chiffrement_bancaire enable row level security;
alter table public.journal_cles_chiffrement_bancaire enable row level security;
-- Aucun accès direct d'API : tout passe par les RPC ci-dessous (service_role).
revoke all on public.cles_chiffrement_bancaire from public, anon, authenticated, service_role;
revoke all on public.journal_cles_chiffrement_bancaire from public, anon, authenticated, service_role;

-- ── 3. Garde d'écriture et index aveugle versionné ──────────────────────────

alter table public.coordonnees_bancaires add column if not exists iban_hash_cle text
  check (iban_hash_cle is null or iban_hash_cle ~ '^k[1-9][0-9]{0,5}$');
comment on column public.coordonnees_bancaires.iban_hash_cle is
  'Clé de l''index aveugle HMAC de iban_hash ; NULL = SHA-256 historique non salé (format v1).';

create or replace function public.chiffre_bancaire_cle_ecrivable(p_valeur text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_valeur is null then true
    when public.chiffre_bancaire_cle(p_valeur) is null then true   -- illisible : toléré, inventorié
    else exists (
      select 1 from public.cles_chiffrement_bancaire c
      where c.cle_id = public.chiffre_bancaire_cle(p_valeur) and c.statut in ('preparee','active','dechiffrement'))
  end;
$$;
revoke all on function public.chiffre_bancaire_cle_ecrivable(text) from public, anon, authenticated, service_role;

create or replace function public.garde_chiffres_bancaires()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT' or new.iban_chiffre is distinct from old.iban_chiffre)
     and not public.chiffre_bancaire_cle_ecrivable(new.iban_chiffre) then
    raise exception 'Donnée bancaire refusée : clé de chiffrement % inconnue, retirée ou compromise', public.chiffre_bancaire_cle(new.iban_chiffre)
      using errcode = '22023', hint = 'BANK_KEY_NOT_WRITABLE';
  end if;
  if (tg_op = 'INSERT' or new.bic_chiffre is distinct from old.bic_chiffre)
     and not public.chiffre_bancaire_cle_ecrivable(new.bic_chiffre) then
    raise exception 'Donnée bancaire refusée : clé de chiffrement % inconnue, retirée ou compromise', public.chiffre_bancaire_cle(new.bic_chiffre)
      using errcode = '22023', hint = 'BANK_KEY_NOT_WRITABLE';
  end if;
  if tg_table_name = 'coordonnees_bancaires' then
    -- L'index aveugle suit le format du chiffré : v2 ⇒ HMAC sous la clé du chiffré.
    new.iban_hash_cle := case when public.chiffre_bancaire_format(new.iban_chiffre) = 'v2'
                              then public.chiffre_bancaire_cle(new.iban_chiffre) end;
    if tg_op = 'UPDATE'
       and public.chiffre_bancaire_cle(new.iban_chiffre) is distinct from public.chiffre_bancaire_cle(old.iban_chiffre)
       and new.iban_hash = old.iban_hash then
      raise exception 'Index aveugle IBAN non recalculé lors du changement de clé' using errcode = '22023';
    end if;
    if tg_op = 'UPDATE'
       and public.chiffre_bancaire_format(new.iban_chiffre) is distinct from public.chiffre_bancaire_format(old.iban_chiffre)
       and new.iban_hash = old.iban_hash then
      raise exception 'Index aveugle IBAN non recalculé lors du changement de format' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.garde_chiffres_bancaires() from public, anon, authenticated, service_role;

drop trigger if exists garde_chiffres_bancaires on public.coordonnees_bancaires;
create trigger garde_chiffres_bancaires before insert or update on public.coordonnees_bancaires
  for each row execute function public.garde_chiffres_bancaires();
drop trigger if exists garde_chiffres_bancaires on public.ordres_virements;
create trigger garde_chiffres_bancaires before insert or update of iban_chiffre, bic_chiffre on public.ordres_virements
  for each row execute function public.garde_chiffres_bancaires();

-- Lignes existantes : v1 ⇒ iban_hash_cle NULL (déjà le défaut). Rien à réécrire.

-- ── 4. Inventaire ───────────────────────────────────────────────────────────

create or replace function public.chiffres_bancaires_sources()
returns table (ressource text, id uuid, colonne text, chiffre text)
language sql stable security definer set search_path = public as $$
  select 'coordonnees_bancaires', c.id, 'iban_chiffre', c.iban_chiffre from public.coordonnees_bancaires c
  union all
  select 'coordonnees_bancaires', c.id, 'bic_chiffre', c.bic_chiffre from public.coordonnees_bancaires c where c.bic_chiffre is not null
  union all
  select 'ordres_virements', o.id, 'iban_chiffre', o.iban_chiffre from public.ordres_virements o
  union all
  select 'ordres_virements', o.id, 'bic_chiffre', o.bic_chiffre from public.ordres_virements o where o.bic_chiffre is not null;
$$;
revoke all on function public.chiffres_bancaires_sources() from public, anon, authenticated, service_role;

create or replace function public.cles_bancaires_inventaire()
returns table (ressource text, colonne text, format text, cle_id text, statut_cle text, nombre bigint)
language sql stable security definer set search_path = public as $$
  select s.ressource, s.colonne,
         coalesce(public.chiffre_bancaire_format(s.chiffre), 'illisible') as format,
         public.chiffre_bancaire_cle(s.chiffre) as cle_id,
         case when public.chiffre_bancaire_cle(s.chiffre) is null then null
              else coalesce(k.statut, 'non_enregistree') end as statut_cle,
         count(*) as nombre
  from public.chiffres_bancaires_sources() s
  left join public.cles_chiffrement_bancaire k on k.cle_id = public.chiffre_bancaire_cle(s.chiffre)
  group by 1, 2, 3, 4, 5
  order by 1, 2, 3, 4;
$$;

create or replace function public.cles_bancaires_etat()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cles', coalesce((select jsonb_agg(jsonb_build_object(
        'cle_id', k.cle_id, 'algorithme', k.algorithme, 'statut', k.statut,
        'empreinte_controle', k.empreinte_controle, 'activee_at', k.activee_at,
        'desactivee_at', k.desactivee_at, 'compromise_at', k.compromise_at, 'retiree_at', k.retiree_at)
        order by k.cle_id) from public.cles_chiffrement_bancaire k), '[]'::jsonb),
    'active', (select k.cle_id from public.cles_chiffrement_bancaire k where k.statut = 'active'),
    'inventaire', coalesce((select jsonb_agg(to_jsonb(i)) from public.cles_bancaires_inventaire() i), '[]'::jsonb)
  );
$$;

-- ── 5. Cycle de vie des clés ────────────────────────────────────────────────

create or replace function public.cles_bancaires_enregistrer(p_cle_id text, p_empreinte text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.cles_chiffrement_bancaire;
begin
  if p_cle_id is null or p_cle_id !~ '^k[1-9][0-9]{0,5}$' then raise exception 'Identifiant de clé invalide' using errcode = '22023'; end if;
  if p_empreinte is null or p_empreinte !~ '^[0-9a-f]{64}$' then raise exception 'Empreinte de contrôle invalide' using errcode = '22023'; end if;
  if exists (select 1 from public.cles_chiffrement_bancaire k where k.empreinte_controle = p_empreinte and k.cle_id <> p_cle_id) then
    raise exception 'Cette empreinte est déjà enregistrée sous un autre identifiant' using errcode = '23505';
  end if;
  select * into v from public.cles_chiffrement_bancaire where cle_id = p_cle_id for update;
  if not found then
    insert into public.cles_chiffrement_bancaire (cle_id, statut, empreinte_controle) values (p_cle_id, 'preparee', p_empreinte);
    insert into public.journal_cles_chiffrement_bancaire (action, cle_id) values ('enregistrement', p_cle_id);
    return 'enregistree';
  end if;
  if v.empreinte_controle is null then
    if v.statut in ('retiree','compromise') then raise exception 'Clé % retirée ou compromise : attestation refusée', p_cle_id using errcode = '22023'; end if;
    update public.cles_chiffrement_bancaire set empreinte_controle = p_empreinte where cle_id = p_cle_id;
    insert into public.journal_cles_chiffrement_bancaire (action, cle_id) values ('attestation', p_cle_id);
    return 'attestee';
  end if;
  if v.empreinte_controle <> p_empreinte then
    raise exception 'La clé % présentée ne correspond pas à l''empreinte enregistrée', p_cle_id using errcode = '22023', hint = 'BANK_KEY_FINGERPRINT_MISMATCH';
  end if;
  return 'identique';
end;
$$;

-- Active une clé (nouvelle rotation OU retour arrière vers une clé encore déchiffrante).
create or replace function public.cles_bancaires_activer(p_cle_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.cles_chiffrement_bancaire;
  v_ancienne text;
begin
  select * into v from public.cles_chiffrement_bancaire where cle_id = p_cle_id for update;
  if not found then raise exception 'Clé % non enregistrée', p_cle_id using errcode = '22023'; end if;
  if v.statut = 'active' then return 'deja_active'; end if;
  if v.statut not in ('preparee','dechiffrement') then raise exception 'Clé % % : activation interdite', p_cle_id, v.statut using errcode = '22023'; end if;
  if v.empreinte_controle is null then raise exception 'Clé % sans empreinte attestée : activation interdite', p_cle_id using errcode = '22023'; end if;
  select cle_id into v_ancienne from public.cles_chiffrement_bancaire where statut = 'active' for update;
  update public.cles_chiffrement_bancaire set statut = 'dechiffrement', desactivee_at = now() where cle_id = v_ancienne;
  update public.cles_chiffrement_bancaire set statut = 'active', activee_at = now(), desactivee_at = null where cle_id = p_cle_id;
  insert into public.journal_cles_chiffrement_bancaire (action, cle_id, cle_precedente) values ('activation', p_cle_id, v_ancienne);
  return 'activee';
end;
$$;

create or replace function public.cles_bancaires_compromettre(p_cle_id text, p_motif text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.cles_chiffrement_bancaire;
begin
  select * into v from public.cles_chiffrement_bancaire where cle_id = p_cle_id for update;
  if not found then raise exception 'Clé % non enregistrée', p_cle_id using errcode = '22023'; end if;
  if v.statut = 'active' then raise exception 'Clé % active : activer d''abord une nouvelle clé', p_cle_id using errcode = '22023'; end if;
  if v.statut = 'compromise' then return 'deja_compromise'; end if;
  if v.statut = 'retiree' then raise exception 'Clé % déjà retirée', p_cle_id using errcode = '22023'; end if;
  if coalesce(btrim(p_motif), '') = '' then raise exception 'Motif obligatoire' using errcode = '22023'; end if;
  update public.cles_chiffrement_bancaire set statut = 'compromise', compromise_at = now(), motif = left(btrim(p_motif), 500) where cle_id = p_cle_id;
  insert into public.journal_cles_chiffrement_bancaire (action, cle_id, details)
  values ('compromission', p_cle_id, jsonb_build_object('ancien_statut', v.statut,
    'chiffres_restants', (select count(*) from public.chiffres_bancaires_sources() s where public.chiffre_bancaire_cle(s.chiffre) = p_cle_id)));
  return 'compromise';
end;
$$;

-- Retrait définitif : seulement quand plus AUCUNE donnée ne dépend de la clé.
create or replace function public.cles_bancaires_retirer(p_cle_id text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.cles_chiffrement_bancaire;
  v_restants bigint;
begin
  select * into v from public.cles_chiffrement_bancaire where cle_id = p_cle_id for update;
  if not found then raise exception 'Clé % non enregistrée', p_cle_id using errcode = '22023'; end if;
  if v.statut = 'retiree' then return 'deja_retiree'; end if;
  if v.statut not in ('dechiffrement','compromise','preparee') then raise exception 'Clé % % : retrait interdit', p_cle_id, v.statut using errcode = '22023'; end if;
  -- Verrou des deux tables le temps du contrôle : aucune écriture concurrente sous cette clé.
  lock table public.coordonnees_bancaires, public.ordres_virements in share row exclusive mode;
  select count(*) into v_restants from public.chiffres_bancaires_sources() s where public.chiffre_bancaire_cle(s.chiffre) = p_cle_id;
  if v_restants > 0 then
    raise exception 'Clé % encore utilisée par % valeur(s) : rechiffrement incomplet', p_cle_id, v_restants using errcode = '22023', hint = 'BANK_KEY_STILL_IN_USE';
  end if;
  update public.cles_chiffrement_bancaire set statut = 'retiree', retiree_at = now() where cle_id = p_cle_id;
  insert into public.journal_cles_chiffrement_bancaire (action, cle_id, details) values ('retrait', p_cle_id, jsonb_build_object('ancien_statut', v.statut));
  return 'retiree';
end;
$$;

-- ── 6. Rechiffrement par lots (reprenable) ──────────────────────────────────

create or replace function public.cles_bancaires_exiger_cible(p_cle_cible text, p_format_cible text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if p_format_cible not in ('v1','v2') or (p_format_cible = 'v1' and p_cle_cible <> 'k1') then
    raise exception 'Format cible invalide' using errcode = '22023';
  end if;
  if not exists (select 1 from public.cles_chiffrement_bancaire where cle_id = p_cle_cible and statut = 'active') then
    raise exception 'La clé cible % n''est pas la clé active du registre', p_cle_cible using errcode = '22023', hint = 'BANK_KEY_TARGET_NOT_ACTIVE';
  end if;
end;
$$;
revoke all on function public.cles_bancaires_exiger_cible(text, text) from public, anon, authenticated, service_role;

-- Valeurs lisibles qui ne sont PAS encore sous (clé cible, format cible), par curseur stable.
create or replace function public.chiffres_bancaires_a_rechiffrer(p_cle_cible text, p_format_cible text, p_apres text default null, p_limite integer default 200)
returns table (ressource text, id uuid, colonne text, chiffre text, curseur text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.cles_bancaires_exiger_cible(p_cle_cible, p_format_cible);
  if p_limite is null or p_limite < 1 or p_limite > 1000 then raise exception 'Taille de lot invalide (1 à 1000)' using errcode = '22023'; end if;
  return query
    select s.ressource, s.id, s.colonne, s.chiffre, (s.ressource || '/' || s.id::text || '/' || s.colonne) as curseur
    from public.chiffres_bancaires_sources() s
    where public.chiffre_bancaire_cle(s.chiffre) is not null
      and (public.chiffre_bancaire_cle(s.chiffre) <> p_cle_cible or public.chiffre_bancaire_format(s.chiffre) <> p_format_cible)
      and (p_apres is null or (s.ressource || '/' || s.id::text || '/' || s.colonne) > p_apres)
    order by 5
    limit p_limite;
end;
$$;

-- Parcours complet (vérification après restauration : chaque valeur se déchiffre-t-elle ?).
create or replace function public.chiffres_bancaires_parcourir(p_apres text default null, p_limite integer default 500)
returns table (ressource text, id uuid, colonne text, chiffre text, curseur text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_limite is null or p_limite < 1 or p_limite > 1000 then raise exception 'Taille de lot invalide (1 à 1000)' using errcode = '22023'; end if;
  return query
    select s.ressource, s.id, s.colonne, s.chiffre, (s.ressource || '/' || s.id::text || '/' || s.colonne) as curseur
    from public.chiffres_bancaires_sources() s
    where p_apres is null or (s.ressource || '/' || s.id::text || '/' || s.colonne) > p_apres
    order by 5
    limit p_limite;
end;
$$;

-- Applique un lot de rechiffrements en compare-and-swap, dans UNE transaction. Chaque élément :
-- {ressource, id, colonne, ancien, nouveau, iban_hash?}. Une ligne modifiée entre la lecture et
-- l'écriture (conflit) est laissée intacte : la passe suivante la reprendra.
create or replace function public.chiffres_bancaires_rechiffrer_lot(p_cle_cible text, p_format_cible text, p_lot jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_el jsonb;
  v_ressource text; v_colonne text; v_id uuid; v_ancien text; v_nouveau text; v_hash text;
  v_rechiffres integer := 0; v_conflits integer := 0; v_n integer;
  v_sources jsonb := '{}'::jsonb;
begin
  perform public.cles_bancaires_exiger_cible(p_cle_cible, p_format_cible);
  if jsonb_typeof(p_lot) <> 'array' or jsonb_array_length(p_lot) > 1000 then raise exception 'Lot invalide' using errcode = '22023'; end if;
  for v_el in select value from jsonb_array_elements(p_lot) loop
    v_ressource := v_el->>'ressource'; v_colonne := v_el->>'colonne'; v_id := (v_el->>'id')::uuid;
    v_ancien := v_el->>'ancien'; v_nouveau := v_el->>'nouveau'; v_hash := v_el->>'iban_hash';
    if v_ressource not in ('coordonnees_bancaires','ordres_virements') or v_colonne not in ('iban_chiffre','bic_chiffre') then
      raise exception 'Cible de rechiffrement invalide' using errcode = '22023';
    end if;
    if public.chiffre_bancaire_cle(v_ancien) is null then raise exception 'Ancienne valeur illisible' using errcode = '22023'; end if;
    if public.chiffre_bancaire_cle(v_nouveau) is distinct from p_cle_cible or public.chiffre_bancaire_format(v_nouveau) is distinct from p_format_cible then
      raise exception 'Nouvelle valeur hors cible (%/%)', p_cle_cible, p_format_cible using errcode = '22023';
    end if;
    if v_ressource = 'coordonnees_bancaires' and v_colonne = 'iban_chiffre' then
      if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'Index aveugle IBAN requis' using errcode = '22023'; end if;
      update public.coordonnees_bancaires set iban_chiffre = v_nouveau, iban_hash = v_hash where id = v_id and iban_chiffre = v_ancien;
    elsif v_ressource = 'coordonnees_bancaires' then
      update public.coordonnees_bancaires set bic_chiffre = v_nouveau where id = v_id and bic_chiffre = v_ancien;
    elsif v_colonne = 'iban_chiffre' then
      update public.ordres_virements set iban_chiffre = v_nouveau where id = v_id and iban_chiffre = v_ancien;
    else
      update public.ordres_virements set bic_chiffre = v_nouveau where id = v_id and bic_chiffre = v_ancien;
    end if;
    get diagnostics v_n = row_count;
    if v_n = 1 then
      v_rechiffres := v_rechiffres + 1;
      v_sources := jsonb_set(v_sources, array[public.chiffre_bancaire_cle(v_ancien)],
        to_jsonb(coalesce((v_sources->>public.chiffre_bancaire_cle(v_ancien))::integer, 0) + 1));
    else
      v_conflits := v_conflits + 1;
    end if;
  end loop;
  insert into public.journal_cles_chiffrement_bancaire (action, cle_id, details)
  values ('rechiffrement_lot', p_cle_cible, jsonb_build_object('format', p_format_cible, 'rechiffres', v_rechiffres, 'conflits', v_conflits, 'par_cle_source', v_sources));
  return jsonb_build_object('rechiffres', v_rechiffres, 'conflits', v_conflits);
end;
$$;

-- ── 7. Droits : opérateur (service_role) uniquement ─────────────────────────

do $$
declare f text;
begin
  foreach f in array array[
    'public.cles_bancaires_inventaire()',
    'public.cles_bancaires_etat()',
    'public.cles_bancaires_enregistrer(text, text)',
    'public.cles_bancaires_activer(text)',
    'public.cles_bancaires_compromettre(text, text)',
    'public.cles_bancaires_retirer(text)',
    'public.chiffres_bancaires_a_rechiffrer(text, text, text, integer)',
    'public.chiffres_bancaires_parcourir(text, integer)',
    'public.chiffres_bancaires_rechiffrer_lot(text, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

-- Nouvelles tables : garde du mode sûr (règle de 20260928000807_incident_safe_mode_v1).
select public.incident_installer_gardes();
