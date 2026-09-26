-- ELSATIA-RESERVES-FULL-LOCAL-QUALIFICATION-V1 — correctifs trouvés par la recette
--
-- Sept défauts prouvés par `supabase/tests/reserves_full_local_qualification_v1.test.sql`
-- (rouges sur le train sans ce fichier, verts avec). Aucune table, colonne ni policy n'est
-- créée ou supprimée : six fonctions sont redéfinies à signature identique, deux fonctions
-- internes et un trigger sont ajoutés. Rapport : docs/qualification/ELSATIA_RESERVES_FULL_LOCAL_QUALIFICATION_V1.md
--
--   D1 (intégrité, historique) — la garde de workflow se contentait d'un drapeau de session
--      (`elsatia.reserves_transition`) que N'IMPORTE QUEL client SQL peut poser lui-même.
--      Prouvé : un utilisateur `authenticated` de l'hôte fait passer une réserve LEVÉE à
--      « assignée » et efface `levee_at`, sans aucune ligne d'historique (test 7.12).
--      PostgREST n'expose pas `set_config`, mais une garantie d'immuabilité ne doit pas
--      dépendre de la surface HTTP. Correctif : le drapeau n'est honoré que lorsque la
--      mise à jour est exécutée par une fonction SECURITY DEFINER (rôle courant ≠ rôle
--      d'API). Les RPC métier, propriété de `postgres`, passent inchangées.
--
--   D2 (cloisonnement, suspension) — l'accès GRATUIT d'une entreprise invitée survivait à
--      la suspension de l'organisation hôte : A suspendue pour impayé ne voyait plus rien,
--      mais B continuait de lire et d'écrire dans les réserves de A (tests 11.3, 11.4, 11.11).
--      L'accès gratuit n'existe que parce que l'hôte paie Réserves : il suit désormais
--      l'état de l'hôte (tenant actif, pas de suspension échue, droit Réserves valide).
--      Aucune reconnexion : la décision est prise à chaque requête.
--
--   D3 (cloisonnement, export PDF) — l'en-tête du PDF d'une entreprise invitée comptait
--      TOUTES les réserves du chantier (total, ouvertes, levées, en retard), y compris
--      celles des autres entreprises et les réserves internes de l'hôte (test 9.7).
--      Les compteurs suivent désormais la visibilité de l'appelant.
--
--   D4 (intégration Gestion Pro) — l'import d'un chantier GP ne reprenait que son nom ;
--      l'adresse, le code postal et la ville restaient vides dans Réserves et dans les PDF
--      (test 10.2). Ils sont repris à l'import et à chaque resynchronisation, bornés aux
--      contraintes de `reserves_chantiers`.
--
--   D5 (historique) — voir en fin de fichier : organisation auteur des transitions jouées
--      par l'entreprise intervenante.
--
--   D6 (cloisonnement, traçabilité) — voir en fin de fichier : le rattachement d'une
--      entreprise intervenante ne se modifie plus par écriture directe (défaut connu V6).
--
--   D7 (annuaire) — voir en fin de fichier : jokers de recherche échappés.

-- ── D1 ───────────────────────────────────────────────────────────────────────
create or replace function public.reserves_garde_workflow()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Le drapeau n'a de valeur que posé par une action métier. Une action métier est une
  -- fonction SECURITY DEFINER : pendant son exécution, le rôle courant est son
  -- propriétaire, jamais un rôle d'API. Un client connecté en `authenticated`/`anon`
  -- qui pose le drapeau lui-même n'obtient donc rien.
  if coalesce(current_setting('elsatia.reserves_transition', true), 'off') = 'on'
     and current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.statut is distinct from old.statut
     or new.intervenant_id is distinct from old.intervenant_id
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id
     or new.numero is distinct from old.numero
     or new.cree_par is distinct from old.cree_par
     or new.assignee_at is distinct from old.assignee_at
     or new.acceptee_at is distinct from old.acceptee_at
     or new.levee_demandee_at is distinct from old.levee_demandee_at
     or new.levee_at is distinct from old.levee_at
     or new.cloturee_at is distinct from old.cloturee_at
  then
    raise exception 'Transition de réserve interdite : utilisez une action métier ELSATIA Réserves';
  end if;
  return new;
end;
$$;
revoke all on function public.reserves_garde_workflow() from public, anon, authenticated;

-- ── D2 ───────────────────────────────────────────────────────────────────────
-- L'organisation hôte peut-elle, à cet instant, offrir Réserves à ses invités ? Mêmes
-- critères que `est_membre_actif()` + `a_acces_application()` côté tenant, sans la
-- condition d'appartenance (l'appelant est l'invité, pas un membre de l'hôte).
create or replace function public.reserves_hote_actif(p_entreprise_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_entreprise_id is not null
    and exists (
      select 1 from public.entreprises e
      where e.id = p_entreprise_id
        and e.abonnement_statut not in ('suspendu', 'annule')
        and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
    )
    and exists (
      select 1
      from public.acces_applications_entreprises ae
      join public.applications_elsatia a on a.code = ae.application_code and a.actif
      where ae.entreprise_id = p_entreprise_id
        and ae.application_code = 'reserves'
        and ae.autorise
        and (ae.valide_du is null or ae.valide_du <= now())
        and (ae.valide_jusqu_au is null or ae.valide_jusqu_au > now())
    );
$$;
revoke all on function public.reserves_hote_actif(uuid) from public, anon, authenticated;

create or replace function public.reserves_intervenant_courant(p_intervenant_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select p_intervenant_id is not null
    and auth.uid() is not null
    and exists (
      select 1
      from public.reserves_intervenants i
      where i.id = p_intervenant_id
        and i.statut = 'active'
        and i.entreprise_intervenante_id is not null
        and public.est_membre_actif(i.entreprise_intervenante_id)
        and public.a_acces_application(i.entreprise_intervenante_id, 'reserves')
        and public.reserves_hote_actif(i.entreprise_id)
    );
$$;

-- ── D3 ───────────────────────────────────────────────────────────────────────
create or replace function public.reserves_export_entete(p_chantier_id uuid)
returns table (
  chantier text, reference text, adresse text, code_postal text, ville text, statut text,
  date_reception date, organisation text, organisation_siret text,
  total bigint, ouvertes bigint, levees bigint, en_retard bigint
)
language sql security definer stable set search_path = public as $$
  select c.nom, c.reference, c.adresse, c.code_postal, c.ville,
         c.statut, c.date_reception,
         coalesce(nullif(btrim(e.raison_sociale), ''), e.nom), e.siret,
         count(r.id),
         count(r.id) filter (where r.statut not in ('levee','annulee')),
         count(r.id) filter (where r.statut = 'levee'),
         count(r.id) filter (where r.echeance < current_date and r.statut not in ('levee','annulee'))
  from public.reserves_chantiers c
  join public.entreprises e on e.id = c.entreprise_id
  -- Même prédicat que `reserves_export_chantier` : l'en-tête ne compte que ce que la
  -- liste qu'il introduit a le droit de contenir.
  left join public.reserves r
    on r.chantier_id = c.id
   and (public.reserves_action_autorisee(r.entreprise_id, 'exporter')
        or public.reserves_intervenant_courant(r.intervenant_id))
  where c.id = p_chantier_id
    and (
      public.reserves_action_autorisee(c.entreprise_id, 'exporter')
      or public.reserves_chantier_visible_intervenant(c.id)
    )
  group by c.nom, c.reference, c.adresse, c.code_postal, c.ville, c.statut,
           c.date_reception, e.raison_sociale, e.nom, e.siret;
$$;

-- ── D4 ───────────────────────────────────────────────────────────────────────
create or replace function public.reserves_importer_chantier_gp(p_chantier_gp_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_gp public.chantiers;
  v_id uuid;
  v_adresse text;
  v_code_postal text;
  v_ville text;
begin
  select * into v_gp from public.chantiers where id = p_chantier_gp_id;
  if not found then raise exception 'Chantier Gestion Pro introuvable'; end if;
  if not public.reserves_action_autorisee(v_gp.entreprise_id, 'gerer_chantier') then
    raise exception 'Import non autorisé côté Réserves';
  end if;
  if not public.a_permission(v_gp.entreprise_id, 'acces_chantiers') then
    raise exception 'Import non autorisé côté Gestion Pro';
  end if;

  -- Bornées aux contraintes de `reserves_chantiers` : une donnée GP hors format est
  -- laissée vide plutôt que de faire échouer l'import.
  v_adresse := nullif(left(btrim(coalesce(v_gp.adresse, '')), 400), '');
  v_code_postal := case when btrim(coalesce(v_gp.code_postal, '')) ~ '^[0-9A-Za-z -]{2,12}$'
                        then btrim(v_gp.code_postal) end;
  v_ville := nullif(left(btrim(coalesce(v_gp.ville, '')), 120), '');

  select id into v_id from public.reserves_chantiers
  where entreprise_id = v_gp.entreprise_id and chantier_gp_id = p_chantier_gp_id;

  if v_id is null then
    insert into public.reserves_chantiers (
      entreprise_id, nom, adresse, code_postal, ville, source, chantier_gp_id, synchronise_at
    ) values (
      v_gp.entreprise_id, v_gp.nom, v_adresse, v_code_postal, v_ville,
      'gestion_pro', p_chantier_gp_id, now()
    ) returning id into v_id;
  else
    update public.reserves_chantiers
    set nom = v_gp.nom, adresse = v_adresse, code_postal = v_code_postal, ville = v_ville,
        synchronise_at = now()
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- ── D5 ───────────────────────────────────────────────────────────────────────
-- Les transitions jouées par l'entreprise intervenante (acceptation, refus, demande de
-- levée) étaient historisées avec `auteur_entreprise_id` NUL : l'historique exporté ne
-- disait pas QUELLE entreprise avait agi (test 11.23). Corps repris à l'identique du
-- train (dernière définition : 20260907000270), seule la valeur de cette colonne change.
create or replace function public.reserves_appliquer_transition(p_reserve_id uuid, p_statut_apres text, p_commentaire text DEFAULT NULL::text, p_intervenant_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reserve public.reserves;
  v_acteur text;
  v_transition public.reserves_transitions;
  v_intervenant uuid;
  v_entreprise_intervenante uuid;
  v_entreprise_dessaisie uuid;
  v_type_notification text;
  v_destinataire uuid;
  v_payload jsonb;
begin
  select * into v_reserve from public.reserves where id = p_reserve_id for update;
  if not found then raise exception 'Réserve introuvable'; end if;

  v_acteur := public.reserves_acteur_courant(p_reserve_id);
  if v_acteur is null then raise exception 'Action non autorisée sur cette réserve'; end if;

  select * into v_transition from public.reserves_transitions
  where statut_avant = v_reserve.statut and statut_apres = p_statut_apres and acteur = v_acteur;
  if not found then
    raise exception 'Transition % → % impossible pour l''acteur %',
      v_reserve.statut, p_statut_apres, v_acteur;
  end if;

  if v_transition.commentaire_obligatoire and coalesce(btrim(p_commentaire), '') = '' then
    raise exception 'Un motif est obligatoire pour l''action %', v_transition.action;
  end if;

  v_intervenant := v_reserve.intervenant_id;
  if v_transition.action in ('assignation','reassignation') then
    if p_intervenant_id is null then raise exception 'Aucune entreprise intervenante fournie'; end if;
    v_intervenant := p_intervenant_id;
  elsif p_intervenant_id is not null and p_intervenant_id is distinct from v_reserve.intervenant_id then
    raise exception 'Cette action ne peut pas réattribuer la réserve';
  end if;

  if v_transition.action = 'demande_levee' and v_reserve.photo_obligatoire_levee then
    if not exists (
      select 1 from public.reserves_photos
      where reserve_id = p_reserve_id
        and usage in ('travaux','levee')
        and disponible_at is not null
        and supprimee_at is null
    ) then
      raise exception 'Photo obligatoire : ajoutez une preuve avant de demander la levée';
    end if;
  end if;

  perform set_config('elsatia.reserves_transition', 'on', true);
  update public.reserves set
    statut = p_statut_apres,
    intervenant_id = v_intervenant,
    assignee_at = case when v_transition.action in ('assignation','reassignation','reouverture')
                       then now() else assignee_at end,
    acceptee_at = case when v_transition.action = 'acceptation' then now()
                       when v_transition.action in ('reouverture','reassignation') then null
                       else acceptee_at end,
    levee_demandee_at = case when v_transition.action = 'demande_levee' then now()
                             when v_transition.action in ('reouverture','reassignation') then null
                             else levee_demandee_at end,
    levee_at = case when v_transition.action = 'levee_validee' then now()
                    when v_transition.action in ('reouverture','reassignation') then null
                    else levee_at end,
    cloturee_at = case when p_statut_apres in ('levee','annulee') then now() else null end
  where id = p_reserve_id;
  perform set_config('elsatia.reserves_transition', 'off', true);

  update public.reserves_photos
  set verrouillee_at = now()
  where reserve_id = p_reserve_id
    and disponible_at is not null and supprimee_at is null and verrouillee_at is null;

  insert into public.reserves_historique (
    entreprise_id, reserve_id, action, statut_avant, statut_apres,
    champ, valeur_avant, valeur_apres, commentaire, auteur_id, auteur_entreprise_id
  ) values (
    v_reserve.entreprise_id, p_reserve_id, v_transition.action, v_reserve.statut, p_statut_apres,
    case when v_intervenant is distinct from v_reserve.intervenant_id then 'intervenant_id' end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_reserve.intervenant_id::text end,
    case when v_intervenant is distinct from v_reserve.intervenant_id then v_intervenant::text end,
    nullif(btrim(coalesce(p_commentaire, '')), ''), auth.uid(),
    -- D5 : l'organisation de l'acteur est toujours tracée. Côté intervenant, c'est
    -- l'entreprise qui porte la réserve AU MOMENT du geste (une action d'intervenant ne
    -- réattribue jamais la réserve).
    case when v_acteur = 'hote' then v_reserve.entreprise_id
         else (select i.entreprise_intervenante_id from public.reserves_intervenants i
               where i.id = v_reserve.intervenant_id) end
  );

  select i.entreprise_intervenante_id into v_entreprise_intervenante
  from public.reserves_intervenants i where i.id = v_intervenant;

  v_type_notification := case v_transition.action
    when 'assignation' then 'reserve_assignee'
    when 'reassignation' then 'reserve_assignee'
    when 'acceptation' then 'responsabilite_acceptee'
    when 'refus_responsabilite' then 'responsabilite_refusee'
    when 'demande_levee' then 'levee_demandee'
    when 'levee_validee' then 'levee_validee'
    when 'levee_refusee' then 'levee_refusee'
    when 'reouverture' then 'reserve_reouverte'
    when 'annulation' then 'reserve_annulee'
    else null end;

  v_destinataire := case when v_acteur = 'hote' then v_entreprise_intervenante
                         else v_reserve.entreprise_id end;

  v_payload := jsonb_build_object(
    'statut_avant', v_reserve.statut, 'statut_apres', p_statut_apres,
    'numero', v_reserve.numero, 'titre', v_reserve.titre,
    'action', v_transition.action
  );

  if v_type_notification is not null then
    insert into public.reserves_evenements_notifications (
      entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
    ) values (
      v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, v_type_notification,
      v_destinataire, v_payload
    );
  end if;

  -- Entreprise dessaisie : elle apprend le transfert. Sans cette notification, elle
  -- découvrirait la perte de la charge en constatant que la réserve a disparu de sa
  -- liste — ce qui ressemble à un bug, pas à une décision.
  if v_intervenant is distinct from v_reserve.intervenant_id
     and v_reserve.intervenant_id is not null then
    select i.entreprise_intervenante_id into v_entreprise_dessaisie
    from public.reserves_intervenants i where i.id = v_reserve.intervenant_id;
    if v_entreprise_dessaisie is not null
       and v_entreprise_dessaisie is distinct from v_entreprise_intervenante then
      insert into public.reserves_evenements_notifications (
        entreprise_id, chantier_id, reserve_id, type, destinataire_entreprise_id, payload
      ) values (
        v_reserve.entreprise_id, v_reserve.chantier_id, p_reserve_id, 'reserve_transferee',
        v_entreprise_dessaisie, v_payload
      );
    end if;
  end if;
end;
$function$;

revoke all on function public.reserves_appliquer_transition(uuid, text, text, uuid) from public, anon, authenticated;

-- ── D6 ───────────────────────────────────────────────────────────────────────
-- Rattachement d'une entreprise intervenante : uniquement par les actions métier.
--
-- Défaut connu depuis la recette V6 (`test.fixme` de reserves-v6-securite.spec.ts, SQL
-- proposé dans docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql §1, jamais
-- numéroté) : la policy d'écriture de `reserves_intervenants` ne vérifie que le droit
-- `gerer_intervenants` de l'HÔTE. Un `PATCH` PostgREST sur `entreprise_intervenante_id`
-- dessaisissait donc instantanément l'entreprise porteuse (plus aucun accès, aucune
-- révocation tracée), et un `POST` pouvait créer une intervention déjà « active » pour une
-- organisation qui n'avait rien accepté. Prouvé par les tests pgTAP 5.32 à 5.35.
--
-- Correctif : même principe que D1, sans drapeau. Une action métier est une fonction
-- SECURITY DEFINER, exécutée sous son propriétaire ; un client d'API l'est sous
-- `authenticated`. Ce dernier garde la main sur les champs descriptifs (nom, contact,
-- corps d'état…) mais ne touche plus aux colonnes qui portent le rattachement : elles ne
-- changent que par invitation, désignation, adhésion, révocation ou réactivation — qui
-- tracent toutes leur geste. Aucune fonction du domaine n'a besoin d'être modifiée.
create or replace function public.reserves_garde_rattachement()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.entreprise_intervenante_id is not null or new.statut <> 'invitee'
       or new.rejoint_at is not null or new.revoque_at is not null then
      raise exception 'Une entreprise intervenante se déclare « invitée » : son rattachement passe par l''invitation';
    end if;
    return new;
  end if;
  if new.entreprise_intervenante_id is distinct from old.entreprise_intervenante_id
     or new.statut is distinct from old.statut
     or new.rejoint_at is distinct from old.rejoint_at
     or new.revoque_at is distinct from old.revoque_at
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id
  then
    raise exception 'Rattachement d''une entreprise intervenante interdit en écriture directe : passez par l''invitation, la révocation ou la réactivation';
  end if;
  return new;
end;
$$;
revoke all on function public.reserves_garde_rattachement() from public, anon, authenticated;

drop trigger if exists reserves_intervenants_garde_rattachement on public.reserves_intervenants;
create trigger reserves_intervenants_garde_rattachement
  before insert or update on public.reserves_intervenants
  for each row execute function public.reserves_garde_rattachement();


-- ── D7 ───────────────────────────────────────────────────────────────────────
-- Recherche à l'annuaire : les jokers de `ilike` n'étaient pas échappés. Un terme « %%% »
-- franchissait la borne des trois caractères et rendait TOUTES les organisations publiées
-- (proposition §3 de docs/reserves/ELSATIA_RESERVES_V6_SQL_PROPOSE_NON_INTEGRE.sql ; la
-- recette V6 ne le voyait pas, son décor ne publiant aucune organisation). Prouvé par les
-- tests pgTAP 2.18 et 2.19. Corps repris à l'identique du train, seul le motif change.
create or replace function public.reserves_annuaire_rechercher(p_entreprise_id uuid, p_terme text)
 RETURNS TABLE(entreprise_id uuid, nom text, ville text, corps_etat text, zone_intervention text, deja_utilisatrice boolean, origine text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_terme text := btrim(coalesce(p_terme, ''));
  v_siret text := public.reserves_siret_normalise(v_terme);
  -- D7 : `%` et `_` sont des jokers de `ilike` ; échappés, ils redeviennent des caractères.
  v_motif text := replace(replace(replace(btrim(coalesce(p_terme, '')), '\', '\\'), '%', '\%'), '_', '\_');
begin
  if not public.reserves_action_autorisee(p_entreprise_id, 'inviter_entreprise') then
    raise exception 'Recherche à l''annuaire non autorisée';
  end if;

  -- SIRET exact : 14 chiffres, rien d'autre. Un préfixe ne suffit pas — ce serait une
  -- énumération déguisée du registre des organisations ELSATIA.
  if v_siret is not null and length(v_siret) = 14 then
    return query
      select e.id,
             coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
             e.ville,
             a.corps_etat,
             a.zone_intervention,
             coalesce(acc.autorise, false),
             'siret'::text
      from public.entreprises e
      left join public.reserves_annuaire_publication a on a.entreprise_id = e.id
      left join public.acces_applications_entreprises acc
        on acc.entreprise_id = e.id and acc.application_code = 'reserves'
      where public.reserves_siret_normalise(e.siret) = v_siret
        and e.id <> p_entreprise_id
      limit 5;
    return;
  end if;

  -- Recherche par nom : uniquement parmi les organisations publiées, et à partir de
  -- trois caractères pour qu'une lettre isolée ne balaie pas l'annuaire.
  if length(v_terme) < 3 then return; end if;

  return query
    select e.id,
           coalesce(nullif(btrim(e.raison_sociale), ''), e.nom),
           e.ville,
           a.corps_etat,
           a.zone_intervention,
           coalesce(acc.autorise, false),
           'annuaire'::text
    from public.reserves_annuaire_publication a
    join public.entreprises e on e.id = a.entreprise_id
    left join public.acces_applications_entreprises acc
      on acc.entreprise_id = e.id and acc.application_code = 'reserves'
    where a.publiee
      and e.id <> p_entreprise_id
      and (
        coalesce(e.raison_sociale, '') ilike '%' || v_motif || '%' escape '\'
        or e.nom ilike '%' || v_motif || '%' escape '\'
      )
    order by e.nom
    limit 20;
end;
$function$;

notify pgrst, 'reload schema';
