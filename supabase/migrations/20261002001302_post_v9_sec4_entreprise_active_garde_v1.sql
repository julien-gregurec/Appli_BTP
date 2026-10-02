-- ELSATIA POST-V9 HARDENING V1 — SEC-4 : `entreprise_active_id` sans WITH CHECK.
--
-- Référence : docs/qualification/ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2.md §7 ;
-- docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §4 (SEC-4).
--
-- Défaut reproduit sur V9 (6392131a) : la policy UPDATE « un utilisateur modifie son
-- profil » (USING id = auth.uid(), sans WITH CHECK) et le GRANT UPDATE
-- (entreprise_active_id) à authenticated permettent, par PostgREST direct, de pointer son
-- entreprise active vers n'importe quelle organisation ; contexte_abonnement_courant()
-- (SECURITY DEFINER) renvoie alors nom, référence interne, logo et statut d'abonnement du
-- tenant visé.
--
-- Correctif minimal (patch recommandé par le rapport) : déclencheur BEFORE INSERT OR
-- UPDATE OF entreprise_active_id. Il ne bride QUE les écritures directes des rôles
-- d'API (authenticated, anon) : la nouvelle valeur doit être NULL, ou une entreprise
-- dont l'utilisateur a une appartenance non désactivée, ou une entreprise où il a un
-- accès support plateforme en cours. Les écrivains légitimes sont tous des fonctions
-- SECURITY DEFINER (current_user = propriétaire) qui valident déjà la cible :
-- creer_entreprise_bootstrap, rejoindre_entreprise_par_code, activer_compte_employe,
-- plateforme_entrer_entreprise / plateforme_quitter_entreprise,
-- tools_changer_entreprise_active. Ils ne sont pas modifiés et ne passent pas par la
-- garde. Le flux d'onboarding (création d'entreprise avant appartenance) n'est donc
-- pas affecté : la création est atomique et SECURITY DEFINER.
--
-- Aucune policy, aucun grant, aucune fonction existante n'est modifié (deux fonctions
-- nouvelles : la garde et son contrôle d'appartenance SECURITY DEFINER).
-- Retour arrière : drop trigger utilisateurs_entreprise_active_garde on public.utilisateurs;
--                  drop function public.utilisateurs_entreprise_active_garde();
--                  drop function public.entreprise_active_autorisee(uuid);

begin;

-- Contrôle d'appartenance, indépendant de la RLS de l'appelant. Ne répond que pour
-- l'utilisateur courant (auth.uid()) : aucun oracle sur l'appartenance d'un tiers.
create or replace function public.entreprise_active_autorisee(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (exists (
            select 1 from public.utilisateurs_entreprises ue
            where ue.utilisateur_id = auth.uid()
              and ue.entreprise_id = p_entreprise_id
              and ue.statut <> 'desactive')
          or public.est_acces_support_actif(p_entreprise_id));
$$;

comment on function public.entreprise_active_autorisee(uuid) is
  'SEC-4 (post-V9) : vrai si l''utilisateur courant peut choisir cette entreprise comme entreprise active (appartenance non désactivée ou accès support en cours).';

revoke all on function public.entreprise_active_autorisee(uuid) from public, anon;
grant execute on function public.entreprise_active_autorisee(uuid) to authenticated, service_role;

create or replace function public.utilisateurs_entreprise_active_garde()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Seules les écritures directes des rôles d'API sont concernées. Dans une fonction
  -- SECURITY DEFINER (propriétaire postgres), current_user n'est ni authenticated ni anon.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.entreprise_active_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.entreprise_active_id is not distinct from old.entreprise_active_id then
    return new;
  end if;
  -- La policy UPDATE impose déjà id = auth.uid() ; la garde le revérifie.
  if current_user = 'authenticated' and new.id = auth.uid()
     and public.entreprise_active_autorisee(new.entreprise_active_id) then
    return new;
  end if;
  raise exception 'Entreprise active non autorisée'
    using errcode = '42501',
          hint = 'L''entreprise active doit être une entreprise dont vous êtes membre.';
end;
$$;

comment on function public.utilisateurs_entreprise_active_garde() is
  'SEC-4 (post-V9) : une écriture directe (authenticated/anon) de utilisateurs.entreprise_active_id doit viser NULL, une entreprise dont l''utilisateur est membre (non désactivé) ou un accès support en cours.';

revoke all on function public.utilisateurs_entreprise_active_garde() from public, anon, authenticated;

drop trigger if exists utilisateurs_entreprise_active_garde on public.utilisateurs;
create trigger utilisateurs_entreprise_active_garde
  before insert or update of entreprise_active_id on public.utilisateurs
  for each row execute function public.utilisateurs_entreprise_active_garde();

commit;
