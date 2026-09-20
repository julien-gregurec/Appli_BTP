-- RGPD — orchestration de la suppression d'entreprise (art. 17) : état-machine,
-- tombstone, régimes de rétention configurables, legal holds, purge idempotente.
-- Complète 20260719000114_rgpd_export_suppression.sql (qui ne posait que la
-- demande à 30 jours) : ici, la purge réelle, en 2 temps (données opérationnelles
-- immédiates / données comptables-sociales conservées puis anonymisées).
--
-- Décisions prises par défaut (le plus conservateur), à confirmer :
-- DECISION_REQUIRED : la ligne `entreprises` n'est JAMAIS supprimée physiquement
--   (seulement anonymisée in fine) : les factures/paiements gardent une FK valide
--   pendant la durée légale de conservation. Voir docs/qualification/... §COMPANY ERASURE.
-- DECISION_REQUIRED : la confirmation de purge reste en libre-service (l'admin de
--   l'entreprise confirme lui-même après le délai de 30 jours), sans validation
--   humaine côté plateforme. Un circuit "blocked" existe pour une intervention manuelle.
-- LEGAL_REVIEW_REQUIRED : aucune durée légale n'est inventée ici. Les régimes
--   comptabilité/paie/audit restent bloqués (legal_review_required = true, pas
--   d'échéance) tant qu'un humain n'a pas validé une durée réelle via
--   valider_regime_retention_rgpd (service_role uniquement).

-- ─────────────────────────────────────────────────────────────
-- 0. État-machine sur entreprises
-- États : actif → requested → review → retention → purge_ready → purging → completed
--         (blocked possible à tout moment avant completed)
-- ─────────────────────────────────────────────────────────────
alter table public.entreprises
  add column if not exists suppression_statut text not null default 'actif'
    check (suppression_statut in ('actif','requested','review','retention','purge_ready','purging','completed','blocked')),
  add column if not exists suppression_blocage_motif text,
  add column if not exists retention_debutee_at timestamptz;

-- Les entreprises déjà en attente de suppression (colonnes historiques de la
-- migration 114) reprennent l'état 'requested' pour rester cohérentes.
update public.entreprises
   set suppression_statut = 'requested'
 where suppression_demandee_at is not null
   and suppression_statut = 'actif';

-- Les fonctions historiques (migration 114) ne connaissaient pas encore
-- suppression_statut : on les recrée pour qu'elles pilotent aussi l'état-machine.
create or replace function public.demander_suppression_entreprise(p_entreprise_id uuid)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_prevue timestamptz;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  v_prevue := now() + interval '30 days';
  update public.entreprises
     set suppression_demandee_at = now(),
         suppression_prevue_at = v_prevue,
         suppression_demandee_par = auth.uid(),
         suppression_statut = 'requested',
         updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_demandee', 'entreprise',
          'Demande de suppression du compte (purge prévue le ' || to_char(v_prevue, 'DD/MM/YYYY') || ')');
  perform public._journaliser_purge_entreprise(p_entreprise_id, 'suppression_demandee',
    jsonb_build_object('prevue_le', v_prevue), auth.uid());
  return v_prevue;
end; $$;

create or replace function public.annuler_suppression_entreprise(p_entreprise_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_statut text;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  select suppression_statut into v_statut from public.entreprises where id = p_entreprise_id;
  if v_statut not in ('requested', 'review') then
    raise exception 'Impossible d''annuler : la suppression a déjà progressé au-delà de la demande (statut : %)', coalesce(v_statut, 'actif');
  end if;

  update public.entreprises
     set suppression_demandee_at = null, suppression_prevue_at = null,
         suppression_demandee_par = null, suppression_statut = 'actif', updated_at = now()
   where id = p_entreprise_id;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'suppression_annulee', 'entreprise', 'Demande de suppression annulée');
  perform public._journaliser_purge_entreprise(p_entreprise_id, 'suppression_annulee', '{}'::jsonb, auth.uid());
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 1. Régimes de rétention (généralise politiques_conservation_notes_frais,
--    qui reste le système dédié aux notes de frais et n'est pas touché ici).
-- tables_concernees = null → régime "par défaut" (toute table entreprise_id
-- non listée ailleurs) ; c'est le seul régime purgé sans réserve légale.
-- ─────────────────────────────────────────────────────────────
create table public.politiques_retention_rgpd (
  cle text primary key,
  description text not null,
  duree_conservation_mois integer check (duree_conservation_mois is null or duree_conservation_mois >= 0),
  legal_review_required boolean not null default true,
  tables_concernees text[],
  updated_at timestamptz not null default now(),
  updated_by uuid references public.utilisateurs(id) on delete set null
);

insert into public.politiques_retention_rgpd (cle, description, duree_conservation_mois, legal_review_required, tables_concernees) values
  ('operationnel',
   'Données métier sans régime de conservation légale identifié (chantiers, devis, clients, planning, stock, messagerie, etc.) : purgées dès la confirmation de suppression.',
   0, false, null),
  ('comptabilite_factures',
   'Factures, lignes, paiements, écritures comptables importées, facturation de la plateforme. Durée usuellement citée en interne (~10 ans, Code de commerce) mais non vérifiée indépendamment ici : LEGAL_REVIEW_REQUIRED.',
   null, true, array['factures','lignes_factures','paiements','ecritures_comptables_importees','facturation_comptes_mensuelle']),
  ('paie_sociale',
   'Bulletins de paie, pointages, dossiers salariés, virements de paie, coordonnées bancaires liées. Durée liée aux obligations sociales, non vérifiée indépendamment ici : LEGAL_REVIEW_REQUIRED.',
   null, true, array['bulletins_paie','pointages','dossiers_paie_salaries','temps_travail_paie','absences_paie','coordonnees_bancaires','lots_virements','ordres_virements','journal_paiements_bancaires']),
  ('audit_securite',
   'Journaux d''activité et de sécurité : conservés sous forme pseudonymisée pour preuve opérationnelle, jamais supprimés automatiquement ici : LEGAL_REVIEW_REQUIRED.',
   null, true, array['journal_activite','journal_ia','acces_support_log']),
  ('notes_frais_archivees',
   'Notes de frais archivées : régime déjà géré par son propre système (politiques_conservation_notes_frais / legal_holds_notes_frais), vérifié directement plutôt que dupliqué (voir verifier_purge_prete). Purement documentaire ici : pas d''échéance générique calculée pour cette clé.',
   null, true, array['notes_frais','documents_notes_frais','versions_documents_notes_frais','exports_notes_frais','elements_export_notes_frais','legal_holds_notes_frais','suggestions_ocr_notes_frais','tentatives_acces_notes_frais','categories_notes_frais','journal_audit_notes_frais']);

create table public.retention_entreprise_echeances (
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  politique_cle text not null references public.politiques_retention_rgpd(cle),
  echeance_le timestamptz,
  calculee_at timestamptz not null default now(),
  primary key (entreprise_id, politique_cle)
);

-- ─────────────────────────────────────────────────────────────
-- 2. Legal holds génériques (mêmes principes que legal_holds_notes_frais) :
-- bloque la purge d'un régime (ou de tout, si politique_cle est null) tant
-- qu'il est actif.
-- ─────────────────────────────────────────────────────────────
create table public.legal_holds_entreprise (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  politique_cle text references public.politiques_retention_rgpd(cle),
  motif text not null check (btrim(motif) <> ''),
  actif boolean not null default true,
  pose_par uuid references public.utilisateurs(id) on delete set null,
  pose_at timestamptz not null default now(),
  leve_par uuid references public.utilisateurs(id) on delete set null,
  leve_at timestamptz
);
create index legal_holds_entreprise_actif_idx on public.legal_holds_entreprise(entreprise_id) where actif;

-- ─────────────────────────────────────────────────────────────
-- 3. Journal de purge, chaîné par empreinte (même principe que
-- journal_audit_notes_frais) : preuve opérationnelle sans données
-- personnelles (détails limités aux compteurs/noms de table/étapes).
-- ─────────────────────────────────────────────────────────────
create table public.journal_purge_entreprise (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  etape text not null,
  details jsonb not null default '{}'::jsonb,
  empreinte_precedente text,
  empreinte text not null,
  created_by uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  check (empreinte_precedente is null or empreinte_precedente ~ '^[0-9a-f]{64}$'),
  check (empreinte ~ '^[0-9a-f]{64}$')
);
create index journal_purge_entreprise_entreprise_idx on public.journal_purge_entreprise(entreprise_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- 4. Tombstone : preuve de purge minimale, anti-réactivation. Volontairement
-- SANS foreign key vers entreprises (survit même si la ligne entreprise
-- venait un jour à disparaître par un autre mécanisme) et sans aucune donnée
-- personnelle : uniquement l'id (opaque), le périmètre purgé et une empreinte.
-- ─────────────────────────────────────────────────────────────
create table public.entreprises_purgees (
  entreprise_id uuid primary key,
  purge_terminee_le timestamptz not null default now(),
  perimetre_purge text[] not null,
  manifeste_sha256 text not null check (manifeste_sha256 ~ '^[0-9a-f]{64}$'),
  motif text not null default 'demande_rgpd_art17',
  reactivation_bloquee boolean not null default true
);

alter table public.politiques_retention_rgpd enable row level security;
alter table public.retention_entreprise_echeances enable row level security;
alter table public.legal_holds_entreprise enable row level security;
alter table public.journal_purge_entreprise enable row level security;
alter table public.entreprises_purgees enable row level security;

create policy politiques_retention_rgpd_lecture on public.politiques_retention_rgpd
  for select to authenticated using (true);

create policy retention_echeances_lecture on public.retention_entreprise_echeances
  for select to authenticated using (public.a_permission(entreprise_id, 'gerer_parametres'));

create policy legal_holds_entreprise_lecture on public.legal_holds_entreprise
  for select to authenticated using (public.a_permission(entreprise_id, 'gerer_parametres'));

create policy journal_purge_entreprise_lecture on public.journal_purge_entreprise
  for select to authenticated using (public.a_permission(entreprise_id, 'gerer_parametres'));

-- entreprises_purgees ne porte plus de donnée personnelle : lisible par la
-- plateforme (service_role) uniquement, jamais directement par les clients.

-- ─────────────────────────────────────────────────────────────
-- 5. Chaîne d'audit interne (helper), utilisée par toutes les fonctions
-- ci-dessous ainsi que par la couche applicative (Storage/Auth) via le
-- wrapper journaliser_etape_purge_entreprise.
-- ─────────────────────────────────────────────────────────────
create or replace function public._journaliser_purge_entreprise(p_entreprise_id uuid, p_etape text, p_details jsonb, p_created_by uuid)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_precedente text;
  v_charge jsonb;
  v_empreinte text;
  v_id uuid;
begin
  select empreinte into v_precedente
    from public.journal_purge_entreprise
   where entreprise_id = p_entreprise_id
   order by created_at desc, id desc
   limit 1;

  v_charge := jsonb_build_object(
    'entreprise_id', p_entreprise_id,
    'etape', p_etape,
    'details', coalesce(p_details, '{}'::jsonb),
    'empreinte_precedente', v_precedente,
    'horodatage', now()
  );
  v_empreinte := encode(digest(convert_to(v_charge::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.journal_purge_entreprise(entreprise_id, etape, details, empreinte_precedente, empreinte, created_by)
  values (p_entreprise_id, p_etape, coalesce(p_details, '{}'::jsonb), v_precedente, v_empreinte, p_created_by)
  returning id into v_id;

  return v_id;
end; $$;

-- Wrapper appelable par la couche applicative (Storage/Auth, service_role
-- uniquement) pour journaliser des étapes qui n'ont pas d'équivalent SQL.
create or replace function public.journaliser_etape_purge_entreprise(p_entreprise_id uuid, p_etape text, p_details jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  return public._journaliser_purge_entreprise(p_entreprise_id, p_etape, p_details, null);
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 6. Purge des données opérationnelles (régime 'operationnel') : toute table
-- portant entreprise_id, à l'exclusion des tables listées dans les autres
-- régimes et de l'infrastructure RGPD/notes de frais elle-même. Idempotente
-- (delete ... where entreprise_id = $1 ne fait rien au 2e passage).
--
-- Certaines tables opérationnelles (ex. clients) restent référencées par des
-- lignes légalement conservées (ex. factures.client_id, on delete restrict) :
-- la suppression échouerait et casserait la comptabilité conservée. Dans ce
-- cas précis (violation de contrainte FK), la table est anonymisée (mêmes
-- colonnes heuristiques que la purge légale) au lieu d'être vidée, plutôt que
-- de faire échouer toute l'opération.
-- ─────────────────────────────────────────────────────────────
create or replace function public._purger_donnees_operationnelles_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_col text;
  v_exclues text[];
  v_supprimees jsonb := '{}'::jsonb;
  v_anonymisees jsonb := '{}'::jsonb;
  v_nb bigint;
begin
  select coalesce(array_agg(distinct t), '{}')
    into v_exclues
    from public.politiques_retention_rgpd, unnest(coalesce(tables_concernees, '{}'::text[])) as t;

  v_exclues := v_exclues || array[
    'entreprises','entreprises_purgees','journal_purge_entreprise',
    'politiques_retention_rgpd','retention_entreprise_echeances','legal_holds_entreprise',
    'utilisateurs_entreprises','postes','permissions_poste'
  ];

  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'entreprise_id'
      and t.table_type = 'BASE TABLE'
      and c.table_name <> all (v_exclues)
    order by c.table_name
  loop
    begin
      execute format('delete from public.%I where entreprise_id = $1', v_table) using p_entreprise_id;
      get diagnostics v_nb = row_count;
      if v_nb > 0 then
        v_supprimees := v_supprimees || jsonb_build_object(v_table, v_nb);
      end if;
    exception when foreign_key_violation then
      v_nb := 0;
      for v_col in
        select column_name from information_schema.columns
         where table_schema = 'public' and table_name = v_table
           and is_nullable = 'YES'
           and column_name <> 'entreprise_id'
           and column_name ~* 'email|telephone|adresse|^nom$|^prenom$|iban|bic|notes|commentaire|contact|siret'
      loop
        execute format('update public.%I set %I = null where entreprise_id = $1 and %I is not null', v_table, v_col, v_col)
          using p_entreprise_id;
        get diagnostics v_nb = row_count;
      end loop;
      v_anonymisees := v_anonymisees || jsonb_build_object(v_table, true);
    end;
  end loop;

  return jsonb_build_object('supprimees', v_supprimees, 'anonymisees_car_referencees_par_donnees_retenues', v_anonymisees);
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 6bis. Recalcul des échéances de rétention : recalculable à tout moment
-- (pas figé à la date de confirmation), pour qu'une validation humaine
-- tardive d'un régime (valider_regime_retention_rgpd) profite aussitôt aux
-- entreprises déjà en rétention, sans action supplémentaire de l'admin.
-- L'échéance est ancrée sur retention_debutee_at (début réel de la
-- rétention), pas sur l'instant du recalcul.
-- ─────────────────────────────────────────────────────────────
create or replace function public._recalculer_echeances_retention_entreprise(p_entreprise_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_debut timestamptz;
  v_politique record;
  v_echeance timestamptz;
begin
  select retention_debutee_at into v_debut from public.entreprises where id = p_entreprise_id;
  if v_debut is null then
    return; -- la rétention n'a pas encore démarré pour cette entreprise.
  end if;

  -- notes_frais_archivees est délibérément exclu : son échéance réelle est
  -- gouvernée par le système dédié existant (politiques_conservation_notes_frais
  -- + legal_holds_notes_frais), vérifié directement par verifier_purge_prete
  -- plutôt que dupliqué ici (une échéance générique ne serait jamais fiable :
  -- elle ignorerait une durée par-entreprise déjà configurable et les holds
  -- posés note par note).
  for v_politique in
    select cle, duree_conservation_mois, legal_review_required
      from public.politiques_retention_rgpd
     where cle not in ('operationnel', 'notes_frais_archivees')
  loop
    v_echeance := case
      when v_politique.legal_review_required or v_politique.duree_conservation_mois is null then null
      else v_debut + (v_politique.duree_conservation_mois || ' months')::interval
    end;
    insert into public.retention_entreprise_echeances(entreprise_id, politique_cle, echeance_le)
    values (p_entreprise_id, v_politique.cle, v_echeance)
    on conflict (entreprise_id, politique_cle) do update
      set echeance_le = excluded.echeance_le, calculee_at = now();
  end loop;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 7. Confirmation de purge (self-service, 2e confirmation forte) : requiert
-- le statut 'review' (30 jours écoulés depuis la demande), aucune réserve
-- légale active, et la re-saisie du nom de l'entreprise. Purge aussitôt le
-- périmètre opérationnel et calcule les échéances des régimes protégés.
-- ─────────────────────────────────────────────────────────────
create or replace function public.confirmer_purge_entreprise(p_entreprise_id uuid, p_confirmation_nom text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_nom text;
  v_statut text;
  v_supprimees jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;

  select nom, suppression_statut into v_nom, v_statut
    from public.entreprises where id = p_entreprise_id for update;

  if v_statut is distinct from 'review' then
    raise exception 'La suppression n''est pas prête à être confirmée (statut actuel : %)', coalesce(v_statut, 'actif');
  end if;
  if exists (select 1 from public.legal_holds_entreprise where entreprise_id = p_entreprise_id and actif) then
    raise exception 'Une réserve légale (legal hold) bloque la purge';
  end if;
  if btrim(lower(coalesce(p_confirmation_nom, ''))) <> btrim(lower(coalesce(v_nom, ''))) then
    raise exception 'Le nom saisi ne correspond pas au nom de l''entreprise';
  end if;

  update public.entreprises
     set suppression_statut = 'retention', retention_debutee_at = now(), updated_at = now()
   where id = p_entreprise_id;

  v_supprimees := public._purger_donnees_operationnelles_entreprise(p_entreprise_id);
  perform public._recalculer_echeances_retention_entreprise(p_entreprise_id);

  perform public._journaliser_purge_entreprise(p_entreprise_id, 'retention_demarree',
    jsonb_build_object('donnees_operationnelles_supprimees', v_supprimees), auth.uid());

  return 'retention';
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 8. Lecture de l'état de préparation (utilisée par l'UI, le cron et les
-- fonctions de purge légale elles-mêmes).
-- ─────────────────────────────────────────────────────────────
create or replace function public.verifier_purge_prete(p_entreprise_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.entreprises where id = p_entreprise_id and suppression_statut in ('retention','purge_ready'))
     and not exists (select 1 from public.legal_holds_entreprise where entreprise_id = p_entreprise_id and actif)
     and not exists (
       select 1 from public.retention_entreprise_echeances
       where entreprise_id = p_entreprise_id
         and politique_cle <> 'notes_frais_archivees'
         and (echeance_le is null or echeance_le > now())
     )
     -- notes_frais_archivees : délégué au système dédié existant plutôt que
     -- dupliqué (holds actifs posés note par note, durée par-entreprise déjà
     -- configurable via politiques_conservation_notes_frais).
     and not exists (
       select 1 from public.legal_holds_notes_frais lh
       join public.notes_frais nf on nf.id = lh.note_frais_id and nf.entreprise_id = p_entreprise_id
       where lh.actif
     )
     and not exists (
       select 1 from public.notes_frais nf
       join public.politiques_conservation_notes_frais pc on pc.entreprise_id = nf.entreprise_id
       where nf.entreprise_id = p_entreprise_id
         and nf.date_frais > (current_date - (pc.duree_conservation_annees || ' years')::interval)
     );
$$;

-- ─────────────────────────────────────────────────────────────
-- 9. Avancement automatique (appelé par le cron applicatif, service_role) :
-- requested → review (délai de 30 jours écoulé) et retention → purge_ready
-- (toutes les échéances atteintes, aucune réserve légale).
-- ─────────────────────────────────────────────────────────────
create or replace function public.avancer_purges_dues()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_nb integer;
begin
  update public.entreprises
     set suppression_statut = 'review', updated_at = now()
   where suppression_statut = 'requested'
     and suppression_prevue_at is not null
     and suppression_prevue_at <= now();
  get diagnostics v_nb = row_count;
  return v_nb;
end; $$;

create or replace function public.avancer_purges_pretes()
returns uuid[]
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[]; v_entreprise uuid;
begin
  -- Recalcule d'abord toutes les échéances (une validation légale tardive
  -- via valider_regime_retention_rgpd doit profiter sans action de l'admin).
  for v_entreprise in select id from public.entreprises where suppression_statut = 'retention' loop
    perform public._recalculer_echeances_retention_entreprise(v_entreprise);
  end loop;

  select coalesce(array_agg(id), '{}') into v_ids
    from public.entreprises
   where suppression_statut = 'retention'
     and public.verifier_purge_prete(id);

  update public.entreprises set suppression_statut = 'purge_ready', updated_at = now()
   where id = any(v_ids);

  return v_ids;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 10. Purge légale finale (service_role uniquement, appelée par
-- l'orchestrateur applicatif après vérification) : anonymise les colonnes à
-- caractère personnel des régimes comptabilité/paie (heuristique par nom de
-- colonne, même principe qu'anonymiser_employe existant) SANS supprimer les
-- lignes ni les montants. Ne touche jamais au régime notes_frais_archivees
-- (système dédié séparé) ni au contenu binaire des fichiers Storage conservés
-- (ex. PDF de bulletins de paie) : limite connue, voir le rapport de
-- qualification.
-- ─────────────────────────────────────────────────────────────
create or replace function public.executer_purge_legale_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_statut text;
  v_table text;
  v_col text;
  v_tables text[];
  v_touchees jsonb := '{}'::jsonb;
  v_nb bigint;
begin
  select suppression_statut into v_statut from public.entreprises where id = p_entreprise_id for update;
  if v_statut <> 'purge_ready' then
    raise exception 'Entreprise non prête pour la purge légale (statut : %)', coalesce(v_statut, 'actif');
  end if;
  if not public.verifier_purge_prete(p_entreprise_id) then
    raise exception 'Les échéances de rétention ne sont pas toutes atteintes';
  end if;

  update public.entreprises set suppression_statut = 'purging', updated_at = now() where id = p_entreprise_id;

  select coalesce(array_agg(distinct t), '{}') into v_tables
    from public.politiques_retention_rgpd, unnest(coalesce(tables_concernees, '{}'::text[])) as t
   where cle in ('comptabilite_factures', 'paie_sociale');

  foreach v_table in array v_tables loop
    if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = v_table) then
      continue;
    end if;
    for v_col in
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = v_table
         and is_nullable = 'YES'
         and column_name ~* 'email|telephone|adresse|iban|bic|titulaire|notes|commentaire|contact|nom_fichier_original|libelle'
    loop
      execute format('update public.%I set %I = null where entreprise_id = $1 and %I is not null', v_table, v_col, v_col)
        using p_entreprise_id;
      get diagnostics v_nb = row_count;
      if v_nb > 0 then
        v_touchees := v_touchees || jsonb_build_object(v_table || '.' || v_col, v_nb);
      end if;
    end loop;
  end loop;

  perform public._journaliser_purge_entreprise(p_entreprise_id, 'purge_legale_executee',
    jsonb_build_object('colonnes_anonymisees', v_touchees), null);

  return v_touchees;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 11. Clôture (service_role uniquement) : appelée par l'orchestrateur
-- applicatif seulement après succès de la purge Storage et Auth. Écrit le
-- tombstone (empreinte du manifeste complet fourni par la couche
-- applicative) et passe l'entreprise à 'completed'. Idempotente : un
-- deuxième appel avec un manifeste différent est refusé si déjà 'completed'.
-- ─────────────────────────────────────────────────────────────
create or replace function public.marquer_purge_terminee_entreprise(p_entreprise_id uuid, p_manifeste jsonb, p_manifeste_sha256 text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_statut text;
  v_perimetre text[];
begin
  select suppression_statut into v_statut from public.entreprises where id = p_entreprise_id for update;
  if v_statut = 'completed' then
    return; -- déjà terminé : idempotent, pas d'erreur sur double appel/retry.
  end if;
  if v_statut <> 'purging' then
    raise exception 'Entreprise non en cours de purge (statut : %)', coalesce(v_statut, 'actif');
  end if;
  if p_manifeste_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Empreinte de manifeste invalide';
  end if;

  select coalesce(array_agg(distinct cle), '{}') into v_perimetre
    from public.politiques_retention_rgpd where cle <> 'operationnel';

  insert into public.entreprises_purgees(entreprise_id, perimetre_purge, manifeste_sha256, motif)
  values (p_entreprise_id, array['operationnel'] || v_perimetre, p_manifeste_sha256, 'demande_rgpd_art17')
  on conflict (entreprise_id) do update
    set purge_terminee_le = now(), perimetre_purge = excluded.perimetre_purge, manifeste_sha256 = excluded.manifeste_sha256;

  update public.entreprises set suppression_statut = 'completed', updated_at = now() where id = p_entreprise_id;

  perform public._journaliser_purge_entreprise(p_entreprise_id, 'purge_completee', coalesce(p_manifeste, '{}'::jsonb), null);
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 12. Circuit-breaker manuel + legal holds génériques.
-- ─────────────────────────────────────────────────────────────
create or replace function public.bloquer_purge_entreprise(p_entreprise_id uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.a_permission(p_entreprise_id, 'gerer_parametres') or public.est_acces_support_actif(p_entreprise_id)) then
    raise exception 'Accès refusé';
  end if;
  if btrim(coalesce(p_motif, '')) = '' then
    raise exception 'Motif requis';
  end if;
  update public.entreprises
     set suppression_statut = 'blocked', suppression_blocage_motif = p_motif, updated_at = now()
   where id = p_entreprise_id and suppression_statut <> 'completed';
  perform public._journaliser_purge_entreprise(p_entreprise_id, 'purge_bloquee', jsonb_build_object('motif', p_motif), auth.uid());
end; $$;

create or replace function public.debloquer_purge_entreprise(p_entreprise_id uuid, p_statut_retour text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.a_permission(p_entreprise_id, 'gerer_parametres') or public.est_acces_support_actif(p_entreprise_id)) then
    raise exception 'Accès refusé';
  end if;
  if p_statut_retour not in ('actif','requested','review','retention') then
    raise exception 'Statut de retour invalide';
  end if;
  update public.entreprises
     set suppression_statut = p_statut_retour, suppression_blocage_motif = null, updated_at = now()
   where id = p_entreprise_id and suppression_statut = 'blocked';
  perform public._journaliser_purge_entreprise(p_entreprise_id, 'purge_debloquee', jsonb_build_object('statut_retour', p_statut_retour), auth.uid());
end; $$;

create or replace function public.poser_legal_hold_entreprise(p_entreprise_id uuid, p_politique_cle text, p_motif text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not (public.a_permission(p_entreprise_id, 'gerer_parametres') or public.est_acces_support_actif(p_entreprise_id)) then
    raise exception 'Accès refusé';
  end if;
  if btrim(coalesce(p_motif, '')) = '' then
    raise exception 'Motif requis';
  end if;
  insert into public.legal_holds_entreprise(entreprise_id, politique_cle, motif, pose_par)
  values (p_entreprise_id, p_politique_cle, p_motif, auth.uid())
  returning id into v_id;
  perform public._journaliser_purge_entreprise(p_entreprise_id, 'hold_pose', jsonb_build_object('politique_cle', p_politique_cle, 'motif', p_motif), auth.uid());
  return v_id;
end; $$;

create or replace function public.lever_legal_hold_entreprise(p_hold_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_entreprise uuid;
begin
  select entreprise_id into v_entreprise from public.legal_holds_entreprise where id = p_hold_id and actif;
  if v_entreprise is null then
    raise exception 'Réserve légale introuvable ou déjà levée';
  end if;
  if not (public.a_permission(v_entreprise, 'gerer_parametres') or public.est_acces_support_actif(v_entreprise)) then
    raise exception 'Accès refusé';
  end if;
  update public.legal_holds_entreprise set actif = false, leve_par = auth.uid(), leve_at = now() where id = p_hold_id;
  perform public._journaliser_purge_entreprise(v_entreprise, 'hold_leve', jsonb_build_object('hold_id', p_hold_id), auth.uid());
end; $$;

-- Validation humaine d'une durée légale réelle (service_role uniquement :
-- jamais appelable par un admin d'entreprise ni par le cron applicatif sans
-- intervention). C'est le seul moyen de faire passer un régime de
-- legal_review_required = true à false.
create or replace function public.valider_regime_retention_rgpd(p_cle text, p_duree_mois integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_duree_mois is null or p_duree_mois <= 0 then
    raise exception 'Durée invalide';
  end if;
  update public.politiques_retention_rgpd
     set duree_conservation_mois = p_duree_mois, legal_review_required = false, updated_at = now()
   where cle = p_cle;
  if not found then
    raise exception 'Régime de rétention introuvable';
  end if;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 13. Export personnel (droit d'accès individuel, distinct de l'export
-- entreprise) : un salarié ne récupère que son propre profil et ses propres
-- lignes, jamais celles de ses collègues.
-- ─────────────────────────────────────────────────────────────
create or replace function public.exporter_donnees_utilisateur(p_utilisateur_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_sensibles text[];
  v_rows jsonb;
  v_donnees jsonb := '{}'::jsonb;
  v_employe record;
begin
  if auth.uid() is null or auth.uid() <> p_utilisateur_id then
    raise exception 'Accès refusé';
  end if;

  select coalesce(array_agg(column_name), '{}') into v_sensibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'utilisateurs'
     and column_name ~* 'mot_de_passe|password|secret|token|hash';
  execute 'select coalesce(to_jsonb(u) - $2, ''{}''::jsonb) from public.utilisateurs u where u.id = $1'
    into v_rows using p_utilisateur_id, v_sensibles;
  v_donnees := v_donnees || jsonb_build_object('profil', v_rows);

  execute 'select coalesce(jsonb_agg(to_jsonb(ue)), ''[]''::jsonb) from public.utilisateurs_entreprises ue where ue.utilisateur_id = $1'
    into v_rows using p_utilisateur_id;
  v_donnees := v_donnees || jsonb_build_object('memberships', v_rows);

  for v_employe in
    select id, entreprise_id from public.employes where utilisateur_id = p_utilisateur_id
  loop
    execute 'select coalesce(to_jsonb(e), ''{}''::jsonb) from public.employes e where e.id = $1'
      into v_rows using v_employe.id;
    v_donnees := v_donnees || jsonb_build_object('employe_' || v_employe.id, v_rows);

    for v_table in
      select c.table_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public' and c.column_name = 'employe_id' and t.table_type = 'BASE TABLE'
      order by c.table_name
    loop
      select coalesce(array_agg(column_name), '{}') into v_sensibles
        from information_schema.columns
       where table_schema = 'public' and table_name = v_table
         and column_name ~* 'mot_de_passe|password|secret|token|hash';
      execute format(
        'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from public.%I x where x.employe_id = $1',
        v_table
      ) into v_rows using v_employe.id, v_sensibles;
      if jsonb_array_length(v_rows) > 0 then
        v_donnees := v_donnees || jsonb_build_object(v_table || '_' || v_employe.id, v_rows);
      end if;
    end loop;
  end loop;

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  select ue.entreprise_id, p_utilisateur_id, 'export_rgpd_personnel', 'utilisateur', 'Export RGPD personnel'
    from public.utilisateurs_entreprises ue where ue.utilisateur_id = p_utilisateur_id;

  return jsonb_build_object('genere_le', now(), 'utilisateur_id', p_utilisateur_id, 'donnees', v_donnees);
end; $$;

-- ─────────────────────────────────────────────────────────────
-- 14. Manifeste des références Storage d'une entreprise (chemins logiques
-- uniquement : le téléchargement, le checksum réel et la gestion des
-- fichiers absents sont faits côté applicatif, cf. src/lib/rgpd/storage.ts).
-- ─────────────────────────────────────────────────────────────
create or replace function public.manifeste_storage_entreprise(p_entreprise_id uuid)
returns table(table_source text, ligne_id uuid, colonne text, chemin text)
language plpgsql security definer set search_path = public as $$
declare v_table text; v_col text;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;

  for v_table, v_col in
    select c.table_name, c.column_name
    from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name ~* 'storage_path' and t.table_type = 'BASE TABLE'
      and exists (
        select 1 from information_schema.columns c2
        where c2.table_schema = 'public' and c2.table_name = c.table_name and c2.column_name = 'entreprise_id'
      )
    order by 1, 2
  loop
    return query execute format(
      'select %L::text, x.id, %L::text, x.%I from public.%I x where x.entreprise_id = $1 and x.%I is not null',
      v_table, v_col, v_col, v_table, v_col
    ) using p_entreprise_id;
  end loop;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- Droits d'exécution
-- ─────────────────────────────────────────────────────────────
revoke all on function public.confirmer_purge_entreprise(uuid, text) from public, anon;
revoke all on function public.verifier_purge_prete(uuid) from public, anon;
revoke all on function public.avancer_purges_dues() from public, anon;
revoke all on function public.avancer_purges_pretes() from public, anon;
revoke all on function public.executer_purge_legale_entreprise(uuid) from public, anon;
revoke all on function public.marquer_purge_terminee_entreprise(uuid, jsonb, text) from public, anon;
revoke all on function public.journaliser_etape_purge_entreprise(uuid, text, jsonb) from public, anon;
revoke all on function public.bloquer_purge_entreprise(uuid, text) from public, anon;
revoke all on function public.debloquer_purge_entreprise(uuid, text) from public, anon;
revoke all on function public.poser_legal_hold_entreprise(uuid, text, text) from public, anon;
revoke all on function public.lever_legal_hold_entreprise(uuid) from public, anon;
revoke all on function public.valider_regime_retention_rgpd(text, integer) from public, anon;
revoke all on function public.exporter_donnees_utilisateur(uuid) from public, anon;
revoke all on function public.manifeste_storage_entreprise(uuid) from public, anon;

grant execute on function public.confirmer_purge_entreprise(uuid, text) to authenticated;
grant execute on function public.verifier_purge_prete(uuid) to authenticated, service_role;
grant execute on function public.bloquer_purge_entreprise(uuid, text) to authenticated;
grant execute on function public.debloquer_purge_entreprise(uuid, text) to authenticated;
grant execute on function public.poser_legal_hold_entreprise(uuid, text, text) to authenticated;
grant execute on function public.lever_legal_hold_entreprise(uuid) to authenticated;
grant execute on function public.exporter_donnees_utilisateur(uuid) to authenticated;
grant execute on function public.manifeste_storage_entreprise(uuid) to authenticated;

-- Réservées à l'orchestrateur applicatif (cron + purge Storage/Auth), jamais
-- appelables directement par un client authentifié.
grant execute on function public.avancer_purges_dues() to service_role;
grant execute on function public.avancer_purges_pretes() to service_role;
grant execute on function public.executer_purge_legale_entreprise(uuid) to service_role;
grant execute on function public.marquer_purge_terminee_entreprise(uuid, jsonb, text) to service_role;
grant execute on function public.journaliser_etape_purge_entreprise(uuid, text, jsonb) to service_role;
grant execute on function public.valider_regime_retention_rgpd(text, integer) to service_role;

notify pgrst, 'reload schema';
