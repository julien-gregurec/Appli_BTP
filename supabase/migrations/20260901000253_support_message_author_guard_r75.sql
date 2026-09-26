-- ADMIN-GLOBAL-V1-R7.5 : l'entreprise n'écrit plus directement dans le fil
-- support. L'identité et toutes les métadonnées sont établies côté PostgreSQL.

revoke insert on table public.support_messages from public, anon, authenticated;

-- Cette policy ne doit pas rester comme surface dormante réactivable par un
-- futur GRANT trop large : l'unique entrée entreprise devient la RPC ci-dessous.
drop policy if exists support_msg_insert on public.support_messages;

create function public.support_envoyer_message_entreprise(
  p_entreprise_id uuid,
  p_contenu text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auteur_nom text;
  v_message_id uuid;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentification requise';
  end if;

  if nullif(btrim(coalesce(p_contenu, '')), '') is null then
    raise exception using errcode = '22023', message = 'Message vide';
  end if;

  select concat_ws(
    ' · ',
    coalesce(
      nullif(btrim(u.prenom), ''),
      nullif(btrim(concat_ws(' ', u.prenom, u.nom)), ''),
      'Utilisateur'
    ),
    e.nom
  )
  into v_auteur_nom
  from public.utilisateurs_entreprises ue
  join public.utilisateurs u on u.id = ue.utilisateur_id
  join public.entreprises e on e.id = ue.entreprise_id
  where ue.utilisateur_id = v_uid
    and ue.entreprise_id = p_entreprise_id
    and ue.statut = 'actif'
    and e.abonnement_statut not in ('suspendu', 'annule')
    and (e.suspension_prevue_at is null or e.suspension_prevue_at > now());

  if v_auteur_nom is null then
    raise exception using errcode = '42501', message = 'Accès refusé';
  end if;

  insert into public.support_messages(
    entreprise_id,
    cote,
    auteur_id,
    auteur_nom,
    contenu,
    lu_par_plateforme,
    lu_par_entreprise,
    created_at
  ) values (
    p_entreprise_id,
    'entreprise',
    v_uid,
    v_auteur_nom,
    btrim(p_contenu),
    false,
    false,
    clock_timestamp()
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

revoke all on function public.support_envoyer_message_entreprise(uuid, text)
  from public, anon, service_role;
grant execute on function public.support_envoyer_message_entreprise(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
