-- Compteurs distribués de protection applicative. Aucun identifiant brut n'est
-- stocké : l'application transmet uniquement un HMAC SHA-256.
create table public.rate_limits_applicatifs (
  cle text not null check (char_length(cle) between 1 and 80),
  identifiant_hash text not null check (identifiant_hash ~ '^[0-9a-f]{64}$'),
  fenetre_debut timestamptz not null,
  expire_at timestamptz not null,
  compteur integer not null check (compteur > 0),
  primary key (cle, identifiant_hash, fenetre_debut)
);

create index rate_limits_applicatifs_expiration_idx
  on public.rate_limits_applicatifs (expire_at);

create table public.journal_abus_securite (
  id bigint generated always as identity primary key,
  cle text not null check (char_length(cle) between 1 and 80),
  identifiant_hash text not null check (identifiant_hash ~ '^[0-9a-f]{64}$'),
  compteur integer not null,
  maximum integer not null,
  detecte_at timestamptz not null default clock_timestamp()
);

create index journal_abus_securite_detecte_idx
  on public.journal_abus_securite (detecte_at desc);

alter table public.rate_limits_applicatifs enable row level security;
alter table public.journal_abus_securite enable row level security;

revoke all on public.rate_limits_applicatifs from public, anon, authenticated;
revoke all on public.journal_abus_securite from public, anon, authenticated;
revoke all on sequence public.journal_abus_securite_id_seq from public, anon, authenticated;

create or replace function public.consommer_rate_limit(
  p_cle text,
  p_identifiant_hash text,
  p_fenetre_secondes integer,
  p_maximum integer
)
returns table (autorise boolean, restant integer, reessayer_apres integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_maintenant timestamptz := clock_timestamp();
  v_fenetre timestamptz;
  v_compteur integer;
begin
  if char_length(p_cle) not between 1 and 80
    or p_identifiant_hash !~ '^[0-9a-f]{64}$'
    or p_fenetre_secondes not between 1 and 86400
    or p_maximum not between 1 and 10000 then
    raise exception 'Paramètres de rate limit invalides' using errcode = '22023';
  end if;

  v_fenetre := to_timestamp(floor(extract(epoch from v_maintenant) / p_fenetre_secondes) * p_fenetre_secondes);

  insert into public.rate_limits_applicatifs as limite
    (cle, identifiant_hash, fenetre_debut, expire_at, compteur)
  values
    (p_cle, p_identifiant_hash, v_fenetre, v_fenetre + make_interval(secs => p_fenetre_secondes), 1)
  on conflict (cle, identifiant_hash, fenetre_debut)
  do update set compteur = limite.compteur + 1
  returning compteur into v_compteur;

  -- Une seule alerte par identité et par fenêtre évite que le journal soit lui-même
  -- amplifié par une attaque soutenue.
  if v_compteur = p_maximum + 1 then
    insert into public.journal_abus_securite (cle, identifiant_hash, compteur, maximum)
    values (p_cle, p_identifiant_hash, v_compteur, p_maximum);
  end if;

  return query select
    v_compteur <= p_maximum,
    greatest(0, p_maximum - v_compteur),
    greatest(1, ceil(extract(epoch from (v_fenetre + make_interval(secs => p_fenetre_secondes) - v_maintenant)))::integer);
end;
$$;

revoke all on function public.consommer_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consommer_rate_limit(text, text, integer, integer) to service_role;
