-- Train canonique V9 FINAL : numéro d'origine 20260930000101 (claude/gracious-curie-135pix ; 20260930000901 dans le train V9 b50979d4), renuméroté 20261002001113
-- (après 20261002000813 hotfix, 20261002000901 Legal Consent et 20261002001001-1003 Security / Stripe :
--  postérieure au ledger de la Preview hébergée). Corps inchangé.
--
-- ELSATIA — LOGIN RATE LIMIT NAT / AGENCY HARDENING V1
--
-- Le rate limit de connexion ne compte plus chaque POST /login par IP (une
-- agence entière derrière une même box était bloquée dès la 11e connexion en
-- 10 minutes). Il compte désormais les ÉCHECS d'identification par compte, par
-- couple compte+IP et par IP. Un succès ne doit rien consommer : il faut donc
-- pouvoir LIRE un compteur sans l'incrémenter avant d'appeler Supabase Auth.
--
-- Même contrat que consommer_rate_limit (mêmes fenêtres fixes, même table,
-- aucun identifiant brut : uniquement un HMAC SHA-256), sans écriture.
create or replace function public.consulter_rate_limit(
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

  select limite.compteur into v_compteur
  from public.rate_limits_applicatifs limite
  where limite.cle = p_cle
    and limite.identifiant_hash = p_identifiant_hash
    and limite.fenetre_debut = v_fenetre;

  v_compteur := coalesce(v_compteur, 0);

  -- « autorise » : il reste au moins une unité de budget (compteur < maximum).
  return query select
    v_compteur < p_maximum,
    greatest(0, p_maximum - v_compteur),
    greatest(1, ceil(extract(epoch from (v_fenetre + make_interval(secs => p_fenetre_secondes) - v_maintenant)))::integer);
end;
$$;

revoke all on function public.consulter_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consulter_rate_limit(text, text, integer, integer) to service_role;
