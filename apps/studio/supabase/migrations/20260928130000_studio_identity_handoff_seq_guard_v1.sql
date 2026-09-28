-- ELSATIA Studio (projet DÉDIÉ) — REDTEAM-V2 : garde de séquence sur l'acceptation
-- d'un jeton de passage (handoff).
--
-- Défaut corrigé : dans `studio_identity_accept_handoff`, la branche `elsif
-- v_state.account = 'active'` (atteinte quand `v_state.state_seq >= p_seq`)
-- écrasait `granted`, `plan` et `valid_until` avec les valeurs du jeton MÊME
-- quand `p_seq < v_state.state_seq`. Un jeton émis à la séquence N (droit accordé),
-- présenté APRÈS l'application d'un événement `entitlement_changed` à la séquence
-- N+1 (droit retiré), rétablissait donc l'accès en écriture — alors que le
-- commentaire d'origine affirme « il ne l'emporte que s'il est plus récent que
-- l'état local ». Fenêtre : la TTL du jeton (60 s) + le décalage d'horloge.
--
-- Correctif minimal : n'appliquer les champs du jeton dans cette branche que
-- lorsque `p_seq = v_state.state_seq` (re-présentation de la génération courante,
-- idempotente). Un jeton périmé (`p_seq < state_seq`) ne modifie plus rien : il
-- renvoie l'état courant. La branche « plus récent » (`state_seq < p_seq`) est
-- inchangée.

begin;

create or replace function public.studio_identity_accept_handoff(
  p_subject text,
  p_seq bigint,
  p_granted boolean,
  p_plan text,
  p_valid_until timestamptz
)
returns table (account text, user_id uuid, email text, unban_required boolean)
language plpgsql
security definer
set search_path = ''
-- Chemin système déclaré par la garde d'écriture (migration 100000) : indispensable
-- pour que l'INSERT/UPDATE sur studio_identity.subject_state soit autorisé.
set "studio.write_path" to 'identity'
as $$
#variable_conflict use_column
declare
  v_state studio_identity.subject_state;
  v_link studio_identity.links;
  v_unban boolean := false;
begin
  if p_seq is null or p_seq < 0 then
    raise exception 'studio_identity: séquence invalide' using errcode = '22023';
  end if;
  insert into studio_identity.subject_state (subject, account, state_seq, granted, plan, valid_until)
  values (p_subject, 'active', p_seq, p_granted, p_plan, p_valid_until)
  on conflict (subject) do nothing;

  select * into v_state from studio_identity.subject_state s where s.subject = p_subject for update;
  select * into v_link from studio_identity.links l where l.subject = p_subject for update;

  if v_state.state_seq < p_seq then
    if v_state.account <> 'active' and v_link.user_id is not null then
      update studio_identity.links set ban_desired = false where subject = p_subject;
      v_unban := true;
    end if;
    update studio_identity.subject_state
       set account = 'active', state_seq = p_seq, granted = p_granted, plan = p_plan,
           valid_until = p_valid_until, updated_at = now()
     where subject = p_subject;
    v_state.account := 'active';
  elsif v_state.account = 'active' and p_seq = v_state.state_seq then
    -- Re-présentation de la génération courante : rafraîchissement idempotent.
    -- Un jeton PÉRIMÉ (p_seq < state_seq) ne peut plus rétablir `granted`
    -- (REDTEAM-V2).
    update studio_identity.subject_state
       set granted = p_granted, plan = p_plan, valid_until = p_valid_until, updated_at = now()
     where subject = p_subject;
  end if;

  return query select v_state.account, v_link.user_id, v_link.email, v_unban;
end;
$$;

commit;
