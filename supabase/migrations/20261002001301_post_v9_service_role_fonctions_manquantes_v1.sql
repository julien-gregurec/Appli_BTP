-- ELSATIA POST-V9 HARDENING V1 — Lot A
-- Fonctions `*_service` appelées par le code mais absentes du train V9.
--
-- Constat (audit Security V2 §7 « RPC service_role manquantes du train canonique »,
-- re-vérifié sur V9 6392131a) : le code appelle 9 RPC de service qui n'existent dans
-- aucune des 389 migrations V9. PostgREST répond PGRST202 et les flux échouent fermés :
--   - src/lib/stripe-abonnement.ts           compter_comptes_application_service
--     (décompte Stripe des comptes facturables : reconcilierAbonnementStripe lève) ;
--   - src/lib/relances-config.ts / relances-moteur.ts / documents-partage.ts
--     relances_auto_parametres_service, relances_auto_candidats_service,
--     relance_document_service, relance_nouveau_lien_partage_service (cron de relances) ;
--   - src/lib/push.ts, src/app/api/cron/notifications-push/route.ts
--     push_notifications_en_attente_service, push_preparer_notification_service,
--     push_marquer_notification_envoyee_service, push_supprimer_abonnement_service.
--
-- Portage SÉMANTIQUE, à l'identique, des sections 5, 6 et 8 de
-- docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed (schéma V9 vérifié
-- colonne par colonne). Volontairement NON portés :
--   - sections 1-4 (grants colonne, Stripe Connect, Boutique) : hors du périmètre des
--     9 fonctions ; les fonctions Connect/Boutique existent déjà dans V9 ;
--   - section 7 (paie_import_*) : rouvrirait l'import paie à secret global unique
--     (SEC-6, DECISION_REQUIRED) ; la route reste fermée (503).
--
-- Règles : SECURITY DEFINER, search_path figé (public, pg_temp), EXECUTE à service_role
-- SEUL (ni PUBLIC, ni anon, ni authenticated). Aucune table n'est regrantée. Aucune
-- migration existante n'est modifiée.
--
-- Retour arrière (après retrait du code appelant) : drop function des 9 signatures
-- listées en section « Exécution ».

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- A1. Abonnement : comptage des comptes facturables (proposition §5)
-- ─────────────────────────────────────────────────────────────────────────────

-- reconcilierAbonnementStripe (src/lib/stripe-abonnement.ts) comptait
-- employes.compte_application_statut in ('actif','pause') : refusé, count=null,
-- quantité « comptes supplémentaires » à 0 et suppression de l'item Stripe.
-- Seul le nombre sort de la fonction, jamais une ligne salarié.
create or replace function public.compter_comptes_application_service(p_entreprise_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.employes
  where entreprise_id = p_entreprise_id
    and compte_application_statut in ('actif', 'pause');
$$;

comment on function public.compter_comptes_application_service(uuid) is
  'Abonnement : nombre de comptes application facturables (actif ou pause) d''une entreprise. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A2. Relances automatiques (cron) (proposition §6)
-- ─────────────────────────────────────────────────────────────────────────────

-- Le moteur de relances est partagé : la relance manuelle et la simulation
-- tournent sous la session de l'utilisateur (RLS) et ne changent pas. Seul le
-- cron (client service_role) passe par ces quatre fonctions, qui renvoient
-- exactement ce que le moteur lisait.

create or replace function public.relances_auto_parametres_service()
returns setof public.parametres_relances
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select *
  from public.parametres_relances
  where devis_auto_actif is true or factures_auto_actif is true;
$$;

comment on function public.relances_auto_parametres_service() is
  'Relances automatiques : paramètres des entreprises ayant activé au moins un volet automatique. Chemin de service.';

create or replace function public.relances_auto_candidats_service(
  p_entreprise_id uuid,
  p_type_document text,
  p_limite integer default 200
)
returns table(id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := greatest(0, least(coalesce(p_limite, 200), 200));
begin
  if p_type_document = 'devis' then
    return query
      select d.id from public.devis d
      where d.entreprise_id = p_entreprise_id
        and d.statut = 'envoye'
        and d.relance_auto_exclue = false
      limit v_limite;
  elsif p_type_document = 'facture' then
    return query
      select f.id from public.factures f
      where f.entreprise_id = p_entreprise_id
        and f.statut in ('envoyee', 'en_retard', 'payee_partiel')
        and f.relance_auto_exclue = false
      limit v_limite;
  else
    raise exception 'Type de document de relance invalide' using errcode = '22023';
  end if;
end;
$$;

comment on function public.relances_auto_candidats_service(uuid, text, integer) is
  'Relances automatiques : identifiants des devis/factures candidats d''une entreprise (plafond 200). Chemin de service.';

-- Même forme que la lecture PostgREST du moteur (document + objet `client`),
-- plus l'historique d'envoi. Le client n'est joint que s'il appartient à la
-- même entreprise que le document.
create or replace function public.relance_document_service(
  p_entreprise_id uuid,
  p_type_document text,
  p_document_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_document jsonb;
begin
  if p_type_document = 'devis' then
    select jsonb_build_object(
      'id', d.id, 'entreprise_id', d.entreprise_id, 'numero', d.numero, 'statut', d.statut,
      'date_emission', d.date_emission, 'montant_ttc', d.montant_ttc,
      'relance_auto_exclue', d.relance_auto_exclue, 'client_id', d.client_id,
      'client_snapshot', d.client_snapshot,
      'client', case when c.id is null then null else jsonb_build_object(
        'nom', c.nom, 'prenom', c.prenom, 'societe', c.societe, 'email', c.email,
        'relance_auto_exclue', c.relance_auto_exclue) end)
      into v_document
    from public.devis d
    left join public.clients c on c.id = d.client_id and c.entreprise_id = d.entreprise_id
    where d.id = p_document_id and d.entreprise_id = p_entreprise_id;
  elsif p_type_document = 'facture' then
    select jsonb_build_object(
      'id', f.id, 'entreprise_id', f.entreprise_id, 'numero', f.numero, 'statut', f.statut,
      'date_echeance', f.date_echeance, 'montant_ttc', f.montant_ttc, 'montant_paye', f.montant_paye,
      'relance_auto_exclue', f.relance_auto_exclue, 'client_id', f.client_id,
      'client_snapshot', f.client_snapshot,
      'client', case when c.id is null then null else jsonb_build_object(
        'nom', c.nom, 'prenom', c.prenom, 'societe', c.societe, 'email', c.email,
        'relance_auto_exclue', c.relance_auto_exclue) end)
      into v_document
    from public.factures f
    left join public.clients c on c.id = f.client_id and c.entreprise_id = f.entreprise_id
    where f.id = p_document_id and f.entreprise_id = p_entreprise_id;
  else
    raise exception 'Type de document de relance invalide' using errcode = '22023';
  end if;

  if v_document is null then
    return null;
  end if;

  return v_document || jsonb_build_object(
    'relances_envoyees', (
      select count(*) from public.relances_documents r
      where r.type_document = p_type_document and r.document_id = p_document_id and r.statut = 'envoyee'),
    'derniere_relance_envoyee', (
      select max(r.date_envoi) from public.relances_documents r
      where r.type_document = p_type_document and r.document_id = p_document_id and r.statut = 'envoyee'));
end;
$$;

comment on function public.relance_document_service(uuid, text, uuid) is
  'Relances automatiques : champs d''éligibilité d''un devis/d''une facture, client courant de la même entreprise et historique d''envoi. Chemin de service.';

-- Révoque les liens actifs du document puis enregistre l'empreinte d'un nouveau
-- jeton (le jeton en clair ne quitte jamais le serveur applicatif). cree_par
-- reste NULL : un lien émis par le cron n'a pas d'auteur humain (le code
-- passait l'identifiant d'entreprise, refusé par la clé étrangère vers
-- utilisateurs — l'e-mail de relance partait sans lien).
create or replace function public.relance_nouveau_lien_partage_service(
  p_entreprise_id uuid,
  p_type_document text,
  p_document_id uuid,
  p_token_hash text,
  p_expire_le timestamptz
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de jeton invalide' using errcode = '22023';
  end if;
  if p_type_document = 'devis' then
    perform 1 from public.devis where id = p_document_id and entreprise_id = p_entreprise_id;
  elsif p_type_document = 'facture' then
    perform 1 from public.factures where id = p_document_id and entreprise_id = p_entreprise_id;
  else
    raise exception 'Type de document de relance invalide' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Document introuvable dans cette entreprise' using errcode = 'P0002';
  end if;

  update public.acces_externes_documents
  set revoque_le = now()
  where entreprise_id = p_entreprise_id
    and type_document = p_type_document
    and document_id = p_document_id
    and revoque_le is null;

  insert into public.acces_externes_documents(entreprise_id, type_document, document_id, token_hash, cree_par, expire_le)
  values (p_entreprise_id, p_type_document, p_document_id, p_token_hash, null, p_expire_le);
end;
$$;

comment on function public.relance_nouveau_lien_partage_service(uuid, text, uuid, text, timestamptz) is
  'Relances automatiques : remplace le lien de partage client d''un document par l''empreinte d''un nouveau jeton. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- A3. Notifications push (webhook temps réel + cron de secours) (proposition §8)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.push_notifications_en_attente_service(
  p_depuis timestamptz,
  p_limite integer default 200
)
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id
  from public.notifications_utilisateurs n
  where n.push_envoyee_at is null
    and n.created_at >= p_depuis
  limit greatest(0, least(coalesce(p_limite, 200), 500));
$$;

comment on function public.push_notifications_en_attente_service(timestamptz, integer) is
  'Push : identifiants des notifications non encore poussées depuis une date (plafond 500). Chemin de service.';

-- Tout ce qu'il faut pour pousser UNE notification : son contenu, la préférence
-- de l'utilisateur pour ce type (null = jamais réglée = active) et ses
-- abonnements. NULL si la notification n'existe pas ou a déjà été traitée.
create or replace function public.push_preparer_notification_service(p_notification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', n.id, 'utilisateur_id', n.utilisateur_id, 'type', n.type, 'titre', n.titre,
    'message', n.message, 'lien', n.lien, 'niveau', n.niveau,
    'preference_active', (
      select p.actif from public.preferences_notifications_push p
      where p.utilisateur_id = n.utilisateur_id and p.type = n.type),
    'abonnements', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth)
                       order by a.created_at)
      from public.push_abonnements a
      where a.utilisateur_id = n.utilisateur_id), '[]'::jsonb))
  from public.notifications_utilisateurs n
  where n.id = p_notification_id and n.push_envoyee_at is null;
$$;

comment on function public.push_preparer_notification_service(uuid) is
  'Push : contenu d''une notification en attente, préférence et abonnements de son destinataire. Chemin de service.';

create or replace function public.push_marquer_notification_envoyee_service(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications_utilisateurs
  set push_envoyee_at = now()
  where id = p_notification_id and push_envoyee_at is null;
$$;

comment on function public.push_marquer_notification_envoyee_service(uuid) is
  'Push : marque une notification comme traitée (jamais retentée). Chemin de service.';

-- Abonnement mort (410/404) : supprimé seulement s'il appartient bien au
-- destinataire de la notification traitée.
create or replace function public.push_supprimer_abonnement_service(p_abonnement_id uuid, p_utilisateur_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_abonnements
  where id = p_abonnement_id and utilisateur_id = p_utilisateur_id;
$$;

comment on function public.push_supprimer_abonnement_service(uuid, uuid) is
  'Push : supprime un abonnement expiré (410/404) de son propriétaire. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Exécution : service_role SEUL
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.compter_comptes_application_service(uuid)',
    'public.relances_auto_parametres_service()',
    'public.relances_auto_candidats_service(uuid, text, integer)',
    'public.relance_document_service(uuid, text, uuid)',
    'public.relance_nouveau_lien_partage_service(uuid, text, uuid, text, timestamptz)',
    'public.push_notifications_en_attente_service(timestamptz, integer)',
    'public.push_preparer_notification_service(uuid)',
    'public.push_marquer_notification_envoyee_service(uuid)',
    'public.push_supprimer_abonnement_service(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
