-- ELSATIA Colors V1.3 — fermeture explicite des droits d'écriture directs et
-- surface de consultation persistante de la file de nettoyage photo.
--
-- Migration append-only, périmètre strictement métier Colors. Ne modifie ni
-- 00246, ni 00247, ni 00248, ni aucune migration centrale. Doit s'appliquer
-- aussi bien après le ledger Colors complet qu'après le socle canonique
-- 24c944da…4b97e suivi de 00246 → 00247 → 00248.
--
-- Réserve P2 traitée : sur certains socles (dont le socle canonique), les
-- privilèges DML par défaut accordent à `service_role` (voire à `PUBLIC` /
-- `anon`) un accès d'écriture direct aux tables `colors_*`. `service_role`
-- contourne la RLS ; l'isolation multi-tenant et l'immuabilité de l'historique
-- ne doivent donc pas reposer uniquement sur la RLS ni sur les seuls triggers
-- `BEFORE INSERT/UPDATE`. On révoque ici explicitement toute écriture directe
-- pour `PUBLIC`, `anon` et `service_role`. Les écritures légitimes passent
-- exclusivement par les RPC `SECURITY DEFINER` (propriétaire `postgres`, non
-- membre d'aucun rôle API, aucune chaîne `SET ROLE` depuis `authenticator`).

-- 1. Révocation DML directe sur toutes les tables du périmètre Colors ---------
do $$
declare r record;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and c.relname like 'colors\_%'
    order by 1
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on table %s from public, anon, service_role',
      r.rel
    );
  end loop;
end $$;
-- 1b. Le journal `colors_mouvements` est strictement append-only via les RPC
--     `SECURITY DEFINER`. 00246 ne concède que `SELECT` à `authenticated`, mais
--     certains socles (dont le socle canonique) ré-accordent INSERT/UPDATE par
--     privilèges par défaut. On referme explicitement : aucun rôle API ne doit
--     pouvoir écrire ou supprimer une ligne d'historique en direct.
revoke insert, update, delete, truncate on table public.colors_mouvements from authenticated;
-- 2. Révocation des privilèges de séquence rattachés au périmètre Colors ------
--    (aucune séquence attendue : les clés primaires sont des uuid ; boucle
--     défensive au cas où une évolution introduirait un identity/serial).
do $$
declare r record;
begin
  for r in
    select format('%I.%I', n.nspname, c.relname) as seq
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and c.relname like 'colors\_%'
    order by 1
  loop
    execute format(
      'revoke usage, select, update on sequence %s from public, anon, service_role',
      r.seq
    );
  end loop;
end $$;
-- 3. Resserrage des droits EXECUTE : seuls les acteurs prévus (aujourd'hui
--    `authenticated`) appellent les fonctions Colors. `PUBLIC`, `anon` et
--    `service_role` n'ont aucune raison d'exécuter une fonction Colors : les
--    triggers s'exécutent via le moteur, les RPC métier sont appelées avec un
--    JWT utilisateur. Les GRANT `authenticated` existants ne sont pas touchés.
do $$
declare r record;
begin
  for r in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'colors\_%'
    order by 1
  loop
    execute format('revoke execute on function %s from public, anon, service_role', r.fn);
  end loop;
end $$;
-- 4. Surface de consultation persistante et cloisonnée de la file ------------
--    Lecture pure (aucun DML). `SECURITY DEFINER` obligatoire : la table
--    `colors_nettoyages_photos` révoque tout accès direct (00248). Le filtrage
--    est entièrement déterminé côté serveur : entreprise déduite du seau,
--    habilitation vérifiée par `colors_action_autorisee(...,'voir')` (UID +
--    tenant + rôle Colors). Ne retourne jamais la file d'un autre tenant et
--    n'expose pas le chemin Storage interne complet.
create or replace function public.colors_nettoyages_photos_seau(p_seau_id uuid)
returns table (
  seau_id uuid,
  statut text,
  nettoyage_requis boolean,
  tentatives integer,
  created_at timestamptz,
  derniere_tentative_at timestamptz,
  resolved_at timestamptz,
  derniere_erreur text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    f.seau_id,
    f.statut,
    (f.statut = 'a_nettoyer') as nettoyage_requis,
    f.tentatives,
    f.created_at,
    f.updated_at as derniere_tentative_at,
    f.resolved_at,
    case
      when f.statut = 'a_nettoyer'
      then nullif(left(regexp_replace(coalesce(f.derniere_erreur, ''), '[[:cntrl:]]', ' ', 'g'), 200), '')
      else null
    end as derniere_erreur
  from public.colors_nettoyages_photos f
  join public.colors_seaux s on s.id = f.seau_id
  where f.seau_id = p_seau_id
    and public.colors_action_autorisee(s.entreprise_id, 'voir')
  order by f.created_at desc;
$$;
revoke all on function public.colors_nettoyages_photos_seau(uuid) from public, anon, service_role;
grant execute on function public.colors_nettoyages_photos_seau(uuid) to authenticated;
notify pgrst, 'reload schema';
