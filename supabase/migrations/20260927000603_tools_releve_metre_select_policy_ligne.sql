-- ELSATIA TOOLS — RELEVÉ & MÉTRÉ — LOT 2 — RECOVERY V2
-- Correctif : création d'un projet relevé via PostgREST (`INSERT … RETURNING`).
-- Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT2_FOUNDATION_RECOVERY_V2.md (§12, §14).
--
-- Constat (pile locale réelle GoTrue + PostgREST, parcours Playwright « Nouveau relevé ») :
-- `supabase.from('tools_releves').insert(…).select()` échoue en 42501 « new row violates
-- row-level security policy » pour un métreur ou un admin Relevé pourtant autorisé à `create`.
-- Cause : un `INSERT … RETURNING` impose à la NOUVELLE ligne la policy SELECT. Celle de
-- `tools_releves` appelait `tools_releve_peut(id, 'view')`, qui RELIT la table par `id` :
-- la ligne en cours d'insertion n'est pas visible de ce SELECT interne → faux refus.
-- L'insertion simple (sans RETURNING), seule exercée par pgTAP, passait.
--
-- Correctif, sans changer la matrice de droits :
--   1. `tools_releve_peut_ligne(entreprise, propriétaire, visibilité, supprimé, action)` porte
--      la décision, à partir des colonnes de la ligne ; corps repris de `tools_releve_peut`
--      (20260927000601) à l'identique ;
--   2. `tools_releve_peut(id, action)` lit la ligne puis délègue : une seule source de vérité ;
--   3. la policy SELECT de `tools_releves` évalue la ligne elle-même.
-- Les tables filles gardent `tools_releve_peut(releve_id, …)` : leur projet parent existe
-- déjà quand elles sont insérées. Migrations appliquées 20260927000601/602 non modifiées.

create or replace function public.tools_releve_peut_ligne(
  p_entreprise_id uuid, p_proprietaire_id uuid, p_visibilite text, p_supprime boolean, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_role text; v_profil text; v_proprio boolean;
begin
  if auth.uid() is null or p_entreprise_id is null then return false; end if;
  if p_action = 'create' or not public.tools_releve_action_autorisee(p_entreprise_id, p_action) then return false; end if;

  v_role := public.tools_releve_role_courant(p_entreprise_id);
  if v_role is null then
    -- Session support : lecture seule des relevés actifs.
    return p_action = 'view' and not coalesce(p_supprime, false);
  end if;
  v_profil := public.tools_releve_profil(v_role);
  v_proprio := p_proprietaire_id = auth.uid();

  if coalesce(p_supprime, false) then
    return p_action in ('view','delete') and (v_profil = 'admin' or (v_profil = 'metreur' and v_proprio));
  end if;
  if p_action in ('view','export') then
    return v_profil = 'admin' or v_proprio or p_visibilite = 'entreprise';
  end if;
  if p_action in ('edit','sync-gp') then
    return v_profil = 'admin' or (v_profil = 'metreur' and (v_proprio or p_visibilite = 'entreprise'));
  end if;
  if p_action in ('delete','share') then
    return v_profil = 'admin' or (v_profil = 'metreur' and v_proprio);
  end if;
  return false;
end;
$$;

create or replace function public.tools_releve_peut(p_releve_id uuid, p_action text)
returns boolean language plpgsql security definer stable set search_path = public as $$
declare
  v_entreprise uuid; v_proprietaire uuid; v_visibilite text; v_supprime boolean;
begin
  if auth.uid() is null or p_releve_id is null then return false; end if;
  select r.entreprise_id, r.proprietaire_id, r.visibilite, r.deleted_at is not null
    into v_entreprise, v_proprietaire, v_visibilite, v_supprime
  from public.tools_releves r where r.id = p_releve_id;
  if v_entreprise is null then return false; end if;
  return public.tools_releve_peut_ligne(v_entreprise, v_proprietaire, v_visibilite, v_supprime, p_action);
end;
$$;

drop policy if exists tools_releves_select on public.tools_releves;
create policy tools_releves_select on public.tools_releves
  for select to authenticated
  using (public.tools_releve_peut_ligne(entreprise_id, proprietaire_id, visibilite, deleted_at is not null, 'view'));

revoke all on function public.tools_releve_peut_ligne(uuid,uuid,text,boolean,text) from public, anon;
grant execute on function public.tools_releve_peut_ligne(uuid,uuid,text,boolean,text) to authenticated;

notify pgrst, 'reload schema';
