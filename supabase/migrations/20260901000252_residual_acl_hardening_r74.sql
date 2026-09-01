-- ADMIN-GLOBAL-V1-R7.4 : ferme les ACL résiduelles sans modifier les
-- frontières F4/Ed25519 installées par 00243 à 00245.

-- service_role conserve les mises à jour techniques non financières sur
-- entreprises, mais aucun privilège INSERT/UPDATE sur les huit colonnes de
-- remise. Un REVOKE de colonne ne pouvant pas restreindre un grant de table,
-- le grant large est remplacé par une liste de colonnes non sensibles.
revoke insert, update on table public.entreprises from service_role;
grant select on table public.entreprises to service_role;

do $$
declare
  v_colonnes text;
begin
  select string_agg(format('%I', column_name), ',' order by ordinal_position)
  into v_colonnes
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'entreprises'
    and is_generated = 'NEVER'
    and column_name not in (
      'remise_stripe_coupon_id', 'remise_description',
      'remise_motif_interne', 'remise_duree_mois', 'remise_type',
      'remise_valeur', 'remise_cree_par', 'remise_appliquee_at'
    );

  if v_colonnes is null then
    raise exception 'Aucune colonne non financière disponible sur public.entreprises';
  end if;

  execute format('grant update (%s) on table public.entreprises to service_role', v_colonnes);
end;
$$;

-- Les mutations plateforme disposent déjà de RPC canoniques bornées, AAL2 et
-- auditées. Les lectures nécessaires à l'UI restent accordées.
revoke insert, update, delete on table public.plateforme_admins from authenticated;
revoke insert, update, delete on table public.acces_applications_entreprises from authenticated;
revoke insert, update, delete on table public.habilitations_applications_utilisateurs from authenticated;
revoke insert, update, delete on table public.historique_acces_applications from authenticated;

grant select on table public.plateforme_admins to authenticated;
grant select on table public.acces_applications_entreprises to authenticated;
grant select on table public.habilitations_applications_utilisateurs to authenticated;
grant select on table public.historique_acces_applications to authenticated;

-- Le contenu support n'est plus lisible en CRUD PostgREST. Le flux entreprise
-- passe par une lecture bornée à une appartenance active ; le flux plateforme
-- conserve sa RPC AAL2/session support existante.
revoke select, update, delete on table public.support_messages from authenticated;
grant insert on table public.support_messages to authenticated;

create function public.support_messages_entreprise(p_entreprise_id uuid)
returns table(id uuid, cote text, auteur_nom text, contenu text, created_at timestamptz)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- Ne pas utiliser est_membre_actif ici : cette fonction inclut les sessions
  -- support plateforme. Leur contenu reste exclusivement accessible par la RPC
  -- plateforme AAL2 déjà installée en 00239.
  if p_entreprise_id is null or not exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
  ) then
    raise exception using errcode = '42501', message = 'Accès refusé';
  end if;

  return query
  select m.id, m.cote, m.auteur_nom, m.contenu, m.created_at
  from public.support_messages m
  where m.entreprise_id = p_entreprise_id
  order by m.created_at;
end;
$$;

revoke all on function public.support_messages_entreprise(uuid)
  from public, anon, service_role;
grant execute on function public.support_messages_entreprise(uuid)
  to authenticated;

notify pgrst, 'reload schema';
