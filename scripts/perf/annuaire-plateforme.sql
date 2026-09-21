-- Banc de performance de l'annuaire plateforme (migration 00276).
--
-- Mesure ce que le cahier demande : la tenue à 500 puis 5 000 entreprises, avec
-- pagination et recherche SERVEUR. On mesure le PLAN réellement choisi, pas
-- seulement le temps : un temps correct obtenu par balayage séquentiel sur 5 000
-- lignes ne dit rien de ce qui se passera à 50 000.
--
-- Le décor est créé puis retiré : ce script ne laisse aucune entreprise derrière lui.

\timing off
\set ON_ERROR_STOP on

begin;
set local perf.volume = '5000';

-- Décor : des entreprises réalistes pour la recherche (noms, villes, SIRET).
create temporary table _perf_ids (id uuid) on commit drop;

do $$
declare i integer; v_id uuid;
begin
  for i in 1..current_setting('perf.volume')::integer loop
    v_id := gen_random_uuid();
    -- `reference_interne` est unique et alimentée par déclencheur : sur 5 000
    -- insertions dans la même transaction, la valeur générée se répète. On la
    -- fournit donc explicitement, ce qui n'enlève rien à la mesure.
    insert into public.entreprises (id, nom, raison_sociale, ville, siret, abonnement_statut, reference_interne, created_at)
    values (
      v_id,
      'Entreprise de perf ' || i,
      case when i % 3 = 0 then 'Bâtiment Durand ' || i else 'Constructions Martin ' || i end,
      (array['Strasbourg','Colmar','Mulhouse','Sélestat','Haguenau'])[1 + (i % 5)],
      lpad((10000000000000 + i)::text, 14, '0'),
      (array['actif','essai','suspendu','annule'])[1 + (i % 4)],
      'PERF-' || lpad(i::text, 6, '0'),
      now() - (i || ' hours')::interval
    );
    insert into _perf_ids values (v_id);
  end loop;
end $$;

-- Un administrateur plateforme, pour mesurer la RPC telle qu'elle est réellement
-- appelée. Sans lui, la fonction REFUSE — ce qui est le comportement voulu, et se
-- vérifie d'ailleurs en retirant ce bloc.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000','f0000000-0000-0000-0000-0000000000ff',
        'authenticated','authenticated','perf-admin@invalid.local',
        crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

-- `plateforme_admins` impose la cohérence entre statut d'identité, activité et
-- horodatage d'activation : un admin « active » doit porter un utilisateur ET une
-- date d'activation. On respecte la contrainte plutôt que de la contourner.
insert into public.plateforme_admins (email, role, nom, utilisateur_id, actif, statut_identite, activation_at)
values ('perf-admin@invalid.local','total','Admin de mesure',
        'f0000000-0000-0000-0000-0000000000ff', true, 'active', now())
on conflict (email) do update
  set actif = true, utilisateur_id = excluded.utilisateur_id,
      statut_identite = 'active', activation_at = now();

analyze public.entreprises;
analyze public.plateforme_admins;



-- ── 1. Les requêtes SOUS-JACENTES, mesurées sans changement de rôle ──────────
-- La RLS de `entreprises` masquerait le décor à un simple `authenticated`, et le
-- planificateur retomberait sur un balayage séquentiel de zéro ligne : une mesure
-- qui ne mesure rien. Ce qu'on veut savoir ici, c'est si les INDEX de la migration
-- 00276 sont choisis sur un vrai volume.

\echo '=== VOLUME entreprises : recherche texte (index trigramme attendu) ==='
explain (analyze, buffers, timing off, costs off)
select count(*) from public.entreprises
where public.elsatia_normaliser_recherche(nom) like '%' || public.elsatia_normaliser_recherche('Durand') || '%';

\echo '=== VOLUME entreprises : recherche SIRET (index sur chiffres seuls attendu) ==='
explain (analyze, buffers, timing off, costs off)
select count(*) from public.entreprises
where public.elsatia_chiffres_seuls(coalesce(siret,'')) = '00010000000042';

\echo '=== page profonde (offset 400) ==='
explain (analyze, buffers, timing off, costs off)
select id from public.entreprises order by created_at desc offset 400 limit 25;

-- ── 2. La RPC elle-même, sous une vraie session d'administrateur plateforme ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-0000000000ff","role":"authenticated","email":"perf-admin@invalid.local","aal":"aal2"}';

\echo '=== RPC annuaire : page 1, tri par date ==='
explain (analyze, buffers, timing off, costs off)
select public.plateforme_annuaire_entreprises('', 'toutes', 'date_inscription', 'desc', 1, 25, '{}'::jsonb);

\echo '=== RPC annuaire : recherche texte ==='
explain (analyze, buffers, timing off, costs off)
select public.plateforme_annuaire_entreprises('Durand', 'toutes', 'date_inscription', 'desc', 1, 25, '{}'::jsonb);

reset role;

rollback;
