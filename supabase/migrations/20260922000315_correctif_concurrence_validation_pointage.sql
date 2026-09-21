-- Correctif concurrence — validation de pointage (lot Planning/Pointage concurrency v1)
--
-- Constat (recette manuelle + lecture de code) : `valider_preuve_pointage` fait un
-- `UPDATE public.pointages SET verification_statut = ... WHERE id = p_pointage_id` sans
-- verrou ni vérification de l'état déjà en place. Deux managers qui valident/rejettent le
-- même pointage à quelques secondes d'écart écrasent silencieusement la décision l'un de
-- l'autre (dernier arrivé gagne, sans erreur ni avertissement pour le premier). Un simple
-- double-clic ou un retry réseau sur le même choix, en revanche, échouait déjà à l'identique
-- (pas de protection dédiée, mais rejouable sans dégât puisque idempotent en valeur — non
-- vérifié avant ce correctif).
--
-- Correctif : verrouille la ligne (`for update`) avant de lire son état, puis :
--   * rejoue exactement la même décision (même statut, même commentaire) → no-op silencieux
--     (idempotence double-clic / retry réseau, cas G) ;
--   * une décision déjà prise (valide/rejete) et qu'on tente de remplacer par une décision
--     différente → erreur explicite `CONFLIT_CONCURRENCE_POINTAGE` (cas A/B : deux personnes
--     valident le même pointage, validation pendant modification) plutôt qu'un écrasement
--     silencieux.
-- Aucune règle métier changée : mêmes contrôles de permission/motif de rejet qu'avant, même
-- signature de fonction (aucun changement d'appel côté application requis).
create or replace function public.valider_preuve_pointage(
  p_entreprise_id uuid,
  p_pointage_id uuid,
  p_statut text,
  p_commentaire text default null::text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pointage public.pointages;
  v_commentaire text := nullif(btrim(p_commentaire), '');
begin
  if p_statut not in ('valide', 'rejete') then
    raise exception 'Statut invalide';
  end if;
  if not public.a_permission(p_entreprise_id, 'valider_pointages') then
    raise exception 'Accès refusé';
  end if;
  if p_statut = 'rejete' and v_commentaire is null then
    raise exception 'Le motif du rejet est obligatoire';
  end if;

  select p.* into v_pointage
  from public.pointages p
  where p.id = p_pointage_id
    and p.entreprise_id = p_entreprise_id
  for update;

  if not found then
    raise exception 'Pointage introuvable';
  end if;

  if v_pointage.verification_statut = p_statut
     and v_pointage.commentaire_verification is not distinct from v_commentaire then
    return;
  end if;

  if v_pointage.verification_statut in ('valide', 'rejete') then
    raise exception 'CONFLIT_CONCURRENCE_POINTAGE : ce pointage a déjà été % par quelqu''un d''autre entre-temps.',
      case v_pointage.verification_statut when 'valide' then 'validé' else 'rejeté' end;
  end if;

  update public.pointages
  set verification_statut = p_statut,
      verification_at = now(),
      verification_par = auth.uid(),
      commentaire_verification = v_commentaire
  where id = p_pointage_id
    and entreprise_id = p_entreprise_id;
end;
$function$;

revoke all on function public.valider_preuve_pointage(uuid, uuid, text, text)
  from public, anon;
grant execute on function public.valider_preuve_pointage(uuid, uuid, text, text)
  to authenticated;

comment on function public.valider_preuve_pointage(uuid, uuid, text, text) is
  'Valide/rejette un pointage. Verrouille la ligne (for update) et détecte les conflits de '
  'concurrence : une décision déjà prise par quelqu''un d''autre lève CONFLIT_CONCURRENCE_POINTAGE '
  'au lieu d''être silencieusement écrasée ; rejouer la même décision est un no-op (idempotence '
  'double-clic/retry réseau).';

notify pgrst, 'reload schema';
