-- GP_V1_RC — dépendance minimale extraite, vendue à l'identique.
--
-- La migration 20260903000257_modules_a_la_carte_r3_v1 (GP V1, périmètre direct) appelle
-- `public.plateforme_exiger_session_aal2()` dans sa RPC de mutation plateforme des modules
-- (« 5. Mutation sécurisée (plateforme uniquement, AAL2) »). Cette fonction est définie par
-- `20260826000237_platform_aal2_role_integrity_v1.sql` — 1156 lignes, hors périmètre GP V1
-- (matrice de rôles plateforme, cycle de vie des identités administrateur, colonnes de
-- révocation sur `plateforme_admins` dépendant elles-mêmes de la migration 236, également hors
-- périmètre). Embarquer 237 entière importerait tout ce hors-périmètre pour une seule fonction.
--
-- PL/pgSQL ne vérifie pas l'existence des fonctions appelées dans un corps de fonction à la
-- création (seulement à l'exécution) : 257 s'appliquait donc déjà sans erreur, mais sa RPC de
-- mutation plateforme échouait à l'exécution (fonction introuvable) — trouvé par pgTAP
-- (`modules_a_la_carte_r3_v1.test.sql`, assertions 12/12b/12c/13b/13c), pas par lecture seule.
--
-- Ce fichier ne vendors QUE cette fonction, logique et sémantique de sécurité strictement
-- identiques à l'original (même source de vérité — le claim `aal` du JWT vérifié par
-- Supabase/PostgREST — même message, mêmes REVOKE) : aucun affaiblissement, aucun ajout.
-- `plateforme_verrouiller_mutations_admin()` (même migration 237) n'est PAS repris : 257 ne
-- l'appelle pas (vérifié par grep exhaustif des appels `public.*(` de 257).

begin;

create or replace function public.plateforme_exiger_session_aal2()
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Authentification forte AAL2 requise';
  end if;
end;
$$;
revoke all on function public.plateforme_exiger_session_aal2() from public, anon, authenticated;

commit;
