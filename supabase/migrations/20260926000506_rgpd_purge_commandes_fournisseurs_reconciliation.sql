-- RGPD × commandes fournisseurs engagées — réconciliation V1.
-- Rapport : docs/qualification/ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1.md
--
-- Constat (train canonique V3, §12, DECISION_REQUIRED:RGPD-PURGE-VS-COMMANDE-FOURNISSEUR) :
-- le garde-fou CM-06 (20260923000326) refuse la suppression d'une commande fournisseur qui
-- n'est ni brouillon ni annulée, y compris pendant la purge RGPD (20260923000331, table
-- classée DELETE) : un tenant qui a envoyé, confirmé ou reçu une commande n'est jamais
-- marqué purgé. Reproduit, avec trois défauts réels que ce refus « sûr » masquait :
--
--   D1  La purge vide `lignes_commande` (DELETE, sans verrou) AVANT de buter sur la commande :
--       le recalcul des totaux ramène la commande confirmée/reçue à 0 ligne et 0 €, statut
--       inchangé. La commande reste en base, amputée : ni conservée, ni supprimée.
--   D2  `reglements_fournisseurs` (DELETE) est purgée alors que `depenses_fournisseurs`
--       (facture fournisseur, RETAIN) est conservée : le recalcul réécrit la pièce comptable
--       conservée (montant_regle → 0, statut payee_partiel → a_payer). L'export comptable des
--       achats de ce tenant est faux après la purge.
--   D3  Hors purge, une commande engagée est MODIFIABLE par un utilisateur normal
--       (authenticated + gerer_achats, PostgREST direct) : numéro, montants, fournisseur, et
--       même statut `recue` → `brouillon`, ce qui contourne ensuite CM-06 ; une ligne peut
--       être ajoutée à une commande reçue (totaux recalculés).
--
-- Cette migration ne prend AUCUNE décision juridique nouvelle :
--   - la classification DELETE de `commandes_fournisseurs` / `lignes_commande` (V2) n'est pas
--     changée ; seule la façon de supprimer une commande engagée change ;
--   - ce qui est conservé ne contient AUCUNE donnée personnelle (liste blanche, §PO-2), donc
--     aucune durée de conservation RGPD (art. 5.1.e) n'est requise pour le conserver. Sa
--     conservation suit le principe V2 déjà acté (« toute ambiguïté de rétention est résolue
--     par défaut vers la conservation ») et le régime, non daté, des pièces comptables
--     auxquelles il est rattaché ;
--   - `reglements_fournisseurs` devient RETAIN par nécessité d'intégrité : c'est la seule
--     façon de ne pas falsifier une table RETAIN (D2). Symétrique de `paiements` (RETAIN).
--
--  PO-1  Verrou des commandes engagées (ferme D3) : hors brouillon, une commande n'admet que
--        (a) les transitions de statut du produit, (b) `updated_at`, (c) le délien d'un
--        chantier / auteur réellement supprimé (FK ON DELETE SET NULL). Toute autre colonne,
--        y compris une colonne future, est figée. Lignes d'une commande non brouillon :
--        aucun ajout, aucune suppression hors cascade de la commande, seules `quantite_recue`
--        (réception, commande envoyée/confirmée/partielle) et le rattachement d'un article
--        (NULL → valeur) peuvent changer. Les RPC du produit (statut, réception, réception
--        par lot, scan) restent inchangées et passent.
--  PO-2  Instantané immuable minimisé : `platform.commandes_fournisseurs_purgees`. Avant de
--        supprimer une commande engagée, la purge fige (a) l'empreinte SHA-256 du document
--        COMPLET (commande, lignes, signatures internes, pièces comptables liées) et (b) une
--        version minimisée en liste blanche : numéro, dates, statut, montants HT/TVA/TTC,
--        référence fournisseur, articles (désignation, quantité, unité, PU HT, TVA,
--        quantité reçue), état de réception, pièces comptables liées, empreintes des
--        signatures. Retirés : notes, auteur (utilisateur, salarié), descriptions libres des
--        lignes, chantier, nom et coordonnées du fournisseur (restent dans la fiche
--        fournisseur ANONYMIZE, comportement V2 inchangé). Ajout seul, UPDATE et TRUNCATE
--        refusés, DELETE seulement après une échéance (aucune n'est posée), aucun droit
--        applicatif.
--  PO-3  CM-06 : exception de purge bornée. Pendant l'étape `commandes_fournisseurs` de la
--        purge (autorisation R1 liée à la transaction, déposée par la seule fonction de
--        purge, service_role, échéance échue), une commande engagée peut être supprimée SI un
--        instantané de son contenu EXACT existe (empreinte recalculée dans le trigger).
--        Hors purge, CM-06 est inchangé.
--  PO-4  `purger_table_entreprise` : fige les instantanés avant la première écriture sur
--        `commandes_fournisseurs` / `lignes_commande` ; l'étape `lignes_commande` ne supprime
--        que les lignes des brouillons (les autres partent en cascade avec leur commande,
--        jamais avant : ferme D1) ; garde-fou comptable fournisseurs (empreinte des factures
--        fournisseurs et de leurs règlements avant/après chaque étape, comme R3) ; audit.
--  PO-5  `reglements_fournisseurs` RETAIN (ferme D2) ; TRUNCATE refusé sur
--        commandes_fournisseurs, lignes_commande, depenses_fournisseurs, reglements_fournisseurs.
--  PO-6  Preuve hors base (`preuve_purge_entreprise`) : clé `commandes_fournisseurs`
--        (empreintes) ; rapport et lecture service_role.
--
-- Corps repris à l'identique des dernières définitions (501, 502, 504) hors des blocs
-- marqués « PO- ».

-- ═══════════════════════════════════════════════════════════════════════
-- PO-5. Classification : reglements_fournisseurs RETAIN
-- ═══════════════════════════════════════════════════════════════════════
-- Miroir SQL de TABLES_CONSERVEES_PURGE (src/lib/rgpd.ts) — garder synchronisé.
-- Corps identique à 20260923000400 plus `reglements_fournisseurs`.
create or replace function public.tables_conservees_purge()
returns text[]
language sql immutable
as $$
  select array[
    'factures', 'lignes_factures', 'paiements', 'remises_banque_paiements',
    'coordonnees_bancaires', 'connexions_bancaires', 'lots_virements', 'ordres_virements',
    'journal_paiements_bancaires',
    'bulletins_paie', 'periodes_paie', 'dossiers_paie_salaries', 'validations_paie',
    'absences_paie', 'indemnites_deplacement_paie', 'pieces_jointes_paie',
    'journal_audit_paie',
    'grands_deplacements',
    'facturation_comptes_mensuelle',
    'notes_frais', 'depenses_fournisseurs', 'categories_notes_frais', 'documents_notes_frais',
    'versions_documents_notes_frais', 'exports_notes_frais', 'elements_export_notes_frais',
    'journal_audit_notes_frais',  -- F9 : trigger journal_audit_immuable
    'validations_notes_frais',    -- F9 : trigger validations_notes_frais_immuables
    'reglements_fournisseurs',    -- PO-5 : sa purge réécrivait depenses_fournisseurs (RETAIN)
    'signatures_documents',
    'journal_activite'
  ];
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-1. Verrou des commandes fournisseurs engagées
-- ═══════════════════════════════════════════════════════════════════════
-- Transitions de statut du produit : changer_statut_commande_interne (statut manuel) ∪
-- recomputer_statut_commande (réception). `recue` et `annulee` sont finaux.
create or replace function public._transition_commande_autorisee(p_de text, p_vers text)
returns boolean language sql immutable as $$
  select p_de = p_vers or coalesce(case p_de
    when 'brouillon' then p_vers in ('envoyee', 'annulee')
    when 'envoyee' then p_vers in ('confirmee', 'recue_partiel', 'recue', 'annulee')
    when 'confirmee' then p_vers in ('recue_partiel', 'recue', 'annulee')
    when 'recue_partiel' then p_vers in ('recue', 'annulee')
    else false end, false)
$$;
revoke all on function public._transition_commande_autorisee(text, text) from public, anon, authenticated;

create or replace function public.verrouiller_commande_fournisseur_engagee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_libres constant text[] := array['statut', 'updated_at', 'chantier_id', 'cree_par_utilisateur_id', 'cree_par_employe_id'];
begin
  if old.statut = 'brouillon' then
    return new;
  end if;
  if not public._transition_commande_autorisee(old.statut, new.statut) then
    raise exception 'COMMANDE_ENGAGEE_VERROUILLEE'
      using errcode = 'P0001',
            detail = format('{"code":"COMMANDE_ENGAGEE_VERROUILLEE","commande_id":"%s","statut":"%s","vers":"%s"}',
                            old.id, old.statut, new.statut),
            hint = 'Transition de statut non autorisée pour une commande fournisseur envoyée.';
  end if;
  -- Délien d'une référence réellement supprimée (FK ON DELETE SET NULL) seulement.
  if (new.chantier_id is distinct from old.chantier_id
        and (new.chantier_id is not null
             or exists (select 1 from public.chantiers c where c.id = old.chantier_id)))
     or (new.cree_par_utilisateur_id is distinct from old.cree_par_utilisateur_id
        and (new.cree_par_utilisateur_id is not null
             or exists (select 1 from public.utilisateurs u where u.id = old.cree_par_utilisateur_id)))
     or (new.cree_par_employe_id is distinct from old.cree_par_employe_id
        and (new.cree_par_employe_id is not null
             or exists (select 1 from public.employes e where e.id = old.cree_par_employe_id)))
     or (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres)
  then
    raise exception 'COMMANDE_ENGAGEE_VERROUILLEE'
      using errcode = 'P0001',
            detail = format('{"code":"COMMANDE_ENGAGEE_VERROUILLEE","commande_id":"%s","statut":"%s"}', old.id, old.statut),
            hint = 'Une commande fournisseur envoyée ne peut plus être modifiée (seuls son statut et sa réception évoluent).';
  end if;
  return new;
end;
$$;
revoke all on function public.verrouiller_commande_fournisseur_engagee() from public, anon, authenticated;

drop trigger if exists verrouiller_commande_fournisseur_engagee on public.commandes_fournisseurs;
create trigger verrouiller_commande_fournisseur_engagee
  before update on public.commandes_fournisseurs
  for each row execute function public.verrouiller_commande_fournisseur_engagee();

create or replace function public.verrouiller_lignes_commande_engagee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_libres constant text[] := array['quantite_recue', 'article_id'];
begin
  select c.statut into v_statut
    from public.commandes_fournisseurs c
   where c.id = coalesce(new.commande_id, old.commande_id);
  -- Commande absente : suppression en cascade de la commande (CM-06 / purge l'ont
  -- autorisée), ou insertion orpheline que la FK refusera.
  if v_statut is null or v_statut = 'brouillon' then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' or tg_op = 'DELETE'
     or new.commande_id is distinct from old.commande_id
     or (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres)
     or (new.article_id is distinct from old.article_id and old.article_id is not null)
     or ((new.quantite_recue is distinct from old.quantite_recue or new.article_id is distinct from old.article_id)
         and v_statut not in ('envoyee', 'confirmee', 'recue_partiel'))
  then
    raise exception 'COMMANDE_ENGAGEE_VERROUILLEE'
      using errcode = 'P0001',
            detail = format('{"code":"COMMANDE_ENGAGEE_VERROUILLEE","commande_id":"%s","statut":"%s","ligne":"%s"}',
                            coalesce(new.commande_id, old.commande_id), v_statut, tg_op),
            hint = 'Les lignes d''une commande fournisseur envoyée ne peuvent plus être ajoutées, supprimées ni modifiées (seule la réception évolue).';
  end if;
  return new;
end;
$$;
revoke all on function public.verrouiller_lignes_commande_engagee() from public, anon, authenticated;

drop trigger if exists verrouiller_lignes_commande_engagee on public.lignes_commande;
create trigger verrouiller_lignes_commande_engagee
  before insert or update or delete on public.lignes_commande
  for each row execute function public.verrouiller_lignes_commande_engagee();

-- ═══════════════════════════════════════════════════════════════════════
-- PO-2. Instantanés immuables minimisés des commandes engagées purgées
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.commandes_fournisseurs_purgees (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  run_id uuid,
  commande_id uuid not null,
  numero text not null,
  statut text not null check (statut in ('envoyee', 'confirmee', 'recue_partiel', 'recue')),
  niveau text not null default 'commande_minimisee' check (niveau = 'commande_minimisee'),
  base text not null,
  contenu jsonb not null,
  empreinte_document text not null check (empreinte_document ~ '^[0-9a-f]{64}$'),
  empreinte_contenu text not null check (empreinte_contenu ~ '^[0-9a-f]{64}$'),
  conserver_jusqu_au timestamptz,
  cree_le timestamptz not null default now(),
  unique (commande_id, empreinte_document)
);
create index if not exists commandes_fournisseurs_purgees_entreprise_idx
  on platform.commandes_fournisseurs_purgees (entreprise_id, numero);
comment on table platform.commandes_fournisseurs_purgees is
  'Instantané immuable et minimisé (aucune donnée personnelle : liste blanche) de chaque commande '
  'fournisseur engagée (envoyée, confirmée, reçue) supprimée par la purge RGPD, figé avant la '
  'suppression, avec l''empreinte SHA-256 du document complet. Ajout seul ; UPDATE et TRUNCATE '
  'refusés ; DELETE seulement après conserver_jusqu_au (NULL : régime des pièces comptables '
  'conservées, non daté) ; aucun rôle applicatif n''y a accès.';
alter table platform.commandes_fournisseurs_purgees enable row level security;
revoke all on table platform.commandes_fournisseurs_purgees from public, anon, authenticated, service_role;

create or replace function platform.commandes_fournisseurs_purgees_immuables()
returns trigger language plpgsql set search_path = platform as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les instantanés de commandes fournisseurs purgées ne peuvent pas être vidés (TRUNCATE refusé)';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Un instantané de commande fournisseur purgée est immuable';
  end if;
  if old.conserver_jusqu_au is null or old.conserver_jusqu_au > now() then
    raise exception 'Un instantané de commande fournisseur purgée ne peut être supprimé qu''après son échéance de conservation';
  end if;
  return old;
end; $$;
revoke all on function platform.commandes_fournisseurs_purgees_immuables() from public, anon, authenticated, service_role;

drop trigger if exists commandes_fournisseurs_purgees_immuables on platform.commandes_fournisseurs_purgees;
create trigger commandes_fournisseurs_purgees_immuables
  before update or delete on platform.commandes_fournisseurs_purgees
  for each row execute function platform.commandes_fournisseurs_purgees_immuables();
drop trigger if exists commandes_fournisseurs_purgees_sans_truncate on platform.commandes_fournisseurs_purgees;
create trigger commandes_fournisseurs_purgees_sans_truncate
  before truncate on platform.commandes_fournisseurs_purgees
  for each statement execute function platform.commandes_fournisseurs_purgees_immuables();

-- Statuts protégés par CM-06 (ni brouillon, ni annulée) : ceux qui sont figés.
create or replace function public._statuts_commande_engagee()
returns text[] language sql immutable as $$
  select array['envoyee', 'confirmee', 'recue_partiel', 'recue'];
$$;
revoke all on function public._statuts_commande_engagee() from public, anon, authenticated;

create or replace function public._nb_commandes_engagees(p_entreprise_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from public.commandes_fournisseurs c
   where c.entreprise_id = p_entreprise_id and c.statut = any(public._statuts_commande_engagee())
$$;
revoke all on function public._nb_commandes_engagees(uuid) from public, anon, authenticated, service_role;

-- La commande telle qu'elle est en base : la ligne entière (to_jsonb : toute colonne future
-- incluse d'office), ses lignes, les signatures internes qui la référencent, les pièces
-- comptables (factures fournisseurs) qui la citent. Seules exclusions : `chantier_id` (clé
-- que la purge du chantier peut délier avant), `updated_at` (technique). Horodatages en UTC.
create or replace function public._document_commande_fournisseur(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select (to_jsonb(c) - 'chantier_id' - 'updated_at')
         || jsonb_build_object(
              'fournisseur_reference', (select f.reference from public.fournisseurs f where f.id = c.fournisseur_id),
              'lignes', coalesce((
                select jsonb_agg(to_jsonb(l) - 'created_at' order by l.ordre, l.id)
                  from public.lignes_commande l where l.commande_id = c.id), '[]'::jsonb),
              'signatures', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'id', s.id, 'document_sha256', s.document_sha256, 'signed_at', s.signed_at,
                         'nom_signataire', s.nom_signataire, 'fonction_signataire', s.fonction_signataire)
                       order by s.signed_at, s.id)
                  from public.signatures_documents s
                 where s.entreprise_id = c.entreprise_id and s.type_document = 'commande' and s.document_id = c.id),
                '[]'::jsonb),
              'pieces_comptables', coalesce((
                select jsonb_agg(jsonb_build_object(
                         'depense_id', d.id, 'numero_piece', d.numero_piece, 'date_piece', d.date_piece,
                         'montant_ht', d.montant_ht, 'montant_tva', d.montant_tva, 'montant_ttc', d.montant_ttc)
                       order by d.date_piece, d.id)
                  from public.depenses_fournisseurs d
                 where d.entreprise_id = c.entreprise_id and d.commande_id = c.id), '[]'::jsonb))
    from public.commandes_fournisseurs c where c.id = p_id
$$;
revoke all on function public._document_commande_fournisseur(uuid) from public, anon, authenticated, service_role;

-- Minimisation en LISTE BLANCHE : une colonne future n'est conservée que si on l'ajoute ici.
-- Conservé : ce qui fait la commande (numéro, dates, statut, montants, articles, quantités,
-- TVA), sa réception, ses liens comptables, et l'authentification de ses signatures.
-- Retiré : notes, auteur (utilisateur, salarié), descriptions libres, chantier, identité et
-- coordonnées du fournisseur (seule sa référence interne FRN-… est gardée), noms des
-- signataires (conservés dans signatures_documents, table RETAIN).
create or replace function public._commande_minimisee(p_doc jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'type', 'commande_fournisseur',
    'id', p_doc -> 'id', 'numero', p_doc -> 'numero', 'statut', p_doc -> 'statut',
    'date_commande', p_doc -> 'date_commande', 'date_livraison_prevue', p_doc -> 'date_livraison_prevue',
    'montant_ht', p_doc -> 'montant_ht', 'montant_tva', p_doc -> 'montant_tva', 'montant_ttc', p_doc -> 'montant_ttc',
    'fournisseur', jsonb_build_object('id', p_doc -> 'fournisseur_id', 'reference', p_doc -> 'fournisseur_reference'),
    'lignes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ordre', l -> 'ordre', 'designation', l -> 'designation', 'quantite', l -> 'quantite',
               'unite', l -> 'unite', 'prix_unitaire_ht', l -> 'prix_unitaire_ht', 'taux_tva', l -> 'taux_tva',
               'quantite_recue', l -> 'quantite_recue', 'article_id', l -> 'article_id')
             order by (l ->> 'ordre')::numeric nulls last, l ->> 'id')
        from jsonb_array_elements(p_doc -> 'lignes') l), '[]'::jsonb),
    'reception', jsonb_build_object(
      'quantite_commandee', (select coalesce(sum((l ->> 'quantite')::numeric), 0) from jsonb_array_elements(p_doc -> 'lignes') l),
      'quantite_recue', (select coalesce(sum((l ->> 'quantite_recue')::numeric), 0) from jsonb_array_elements(p_doc -> 'lignes') l),
      'complete', p_doc ->> 'statut' = 'recue'),
    'pieces_comptables', coalesce(p_doc -> 'pieces_comptables', '[]'::jsonb),
    'signatures', coalesce((
      select jsonb_agg(jsonb_build_object('id', s -> 'id', 'document_sha256', s -> 'document_sha256', 'signed_at', s -> 'signed_at'))
        from jsonb_array_elements(p_doc -> 'signatures') s), '[]'::jsonb),
    'non_conserve', jsonb_build_object(
      'notes', p_doc ->> 'notes' is not null,
      'auteur', (p_doc ->> 'cree_par_utilisateur_id') is not null or (p_doc ->> 'cree_par_employe_id') is not null,
      'descriptions_lignes', (select count(*) from jsonb_array_elements(p_doc -> 'lignes') l where l ->> 'description' is not null)))
$$;
revoke all on function public._commande_minimisee(jsonb) from public, anon, authenticated;

create or replace function public._preuve_commande_a_jour(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform.commandes_fournisseurs_purgees p
     where p.commande_id = p_id
       and p.empreinte_document = public._empreinte_jsonb(public._document_commande_fournisseur(p_id))
  )
$$;
revoke all on function public._preuve_commande_a_jour(uuid) from public, anon, authenticated, service_role;

-- Autorisation R1 (20260926000501) pour cette transaction, cette entreprise, cette table.
create or replace function public._purge_commande_autorisee(p_entreprise_id uuid, p_table text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform.purge_autorisations_facture a
     where a.txid = txid_current() and a.entreprise_id = p_entreprise_id and a.table_purgee = p_table)
$$;
revoke all on function public._purge_commande_autorisee(uuid, text) from public, anon, authenticated, service_role;

-- Fige l'instantané de chaque commande engagée (idempotent : une nouvelle ligne seulement si
-- le contenu a changé depuis le dernier instantané). Exige l'autorisation R1 : jamais hors
-- d'une étape de purge.
create or replace function public._preserver_commandes_fournisseurs(p_entreprise_id uuid, p_run_id uuid)
returns integer
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_c record;
  v_doc jsonb;
  v_contenu jsonb;
  v_empreinte text;
  v_n integer := 0;
  v_empreintes jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from platform.purge_autorisations_facture a
                  where a.txid = txid_current() and a.entreprise_id = p_entreprise_id) then
    raise exception 'Instantané de commande fournisseur refusé hors d''une étape de purge autorisée';
  end if;

  for v_c in
    select c.id, c.numero, c.statut from public.commandes_fournisseurs c
     where c.entreprise_id = p_entreprise_id and c.statut = any(public._statuts_commande_engagee())
     order by c.numero, c.id
  loop
    v_doc := public._document_commande_fournisseur(v_c.id);
    v_empreinte := public._empreinte_jsonb(v_doc);
    if exists (select 1 from platform.commandes_fournisseurs_purgees p
                where p.commande_id = v_c.id and p.empreinte_document = v_empreinte) then
      continue;
    end if;
    v_contenu := public._commande_minimisee(v_doc);
    insert into platform.commandes_fournisseurs_purgees
      (entreprise_id, run_id, commande_id, numero, statut, base, contenu, empreinte_document, empreinte_contenu)
    values
      (p_entreprise_id, p_run_id, v_c.id, v_c.numero, v_c.statut,
       'RGPD-PURCHASE-ORDERS-V1:commande_minimisee (sans donnée personnelle ; conservation par défaut V2, régime des pièces comptables)',
       v_contenu, v_empreinte, public._empreinte_jsonb(v_contenu));
    v_n := v_n + 1;
    v_empreintes := v_empreintes || jsonb_build_object('id', v_c.id, 'numero', v_c.numero, 'empreinte_document', v_empreinte);
  end loop;

  if v_n > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'preuve_commandes_fournisseurs', 'commandes_fournisseurs',
      'commande_minimisee', v_n, true, null, jsonb_build_object('commandes', v_empreintes));
  end if;
  return v_n;
end; $$;
revoke all on function public._preserver_commandes_fournisseurs(uuid, uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-3. CM-06 : exception de purge bornée
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260923000326 hors du bloc « purge RGPD ».
create or replace function public.trg_commande_fournisseur_suppression_statut()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.statut not in ('brouillon', 'annulee') then
    -- Purge RGPD : seulement dans l'étape `commandes_fournisseurs`, et seulement si un
    -- instantané du contenu exact de cette commande est figé.
    if public._purge_commande_autorisee(old.entreprise_id, 'commandes_fournisseurs')
       and public._preuve_commande_a_jour(old.id) then
      return old;
    end if;
    raise exception 'COMMANDE_SUPPRESSION_STATUT_INTERDIT'
      using errcode = 'P0001',
            detail = format(
              '{"code":"COMMANDE_SUPPRESSION_STATUT_INTERDIT","commande_id":"%s","statut":"%s"}',
              old.id, old.statut
            ),
            hint = 'Seule une commande fournisseur en brouillon ou annulée peut être supprimée.';
  end if;
  return old;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-4. Garde-fou comptable fournisseurs (comme R3 pour les factures émises)
-- ═══════════════════════════════════════════════════════════════════════
-- Tout le contenu de chaque facture fournisseur conservée et de ses règlements, sauf les clés
-- que la purge délie (FK ON DELETE SET NULL, instantané F8 dans purge_snapshot) et
-- `updated_at`.
create or replace function public.empreinte_comptable_fournisseurs_entreprise(p_entreprise_id uuid)
returns table(nb_depenses integer, empreinte text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  with d as (
    select x.* from public.depenses_fournisseurs x where x.entreprise_id = p_entreprise_id
  ), r as (
    select r.depense_id, jsonb_agg(to_jsonb(r) order by r.date, r.id)::text as t
      from public.reglements_fournisseurs r join d on d.id = r.depense_id
     group by r.depense_id
  )
  select count(*)::integer,
         md5(coalesce(string_agg(
           d.id::text || ':' || md5(
             (to_jsonb(d) - 'chantier_id' - 'commande_id' - 'charge_recurrente_id' - 'outil_id' - 'vehicule_id'
                          - 'purge_snapshot' - 'updated_at')::text
             || coalesce(r.t, '[]')),
           ',' order by d.id), ''))
    from d left join r on r.depense_id = d.id
$$;
revoke all on function public.empreinte_comptable_fournisseurs_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.empreinte_comptable_fournisseurs_entreprise(uuid) to service_role;

-- Tables qui portent (ou suppriment en cascade) une commande engagée.
create or replace function public._tables_commandes_engagees()
returns text[] language sql immutable as $$
  select array['commandes_fournisseurs', 'lignes_commande'];
$$;
revoke all on function public._tables_commandes_engagees() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-4. Purge d'une table
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000504 hors des blocs « PO- ».
create or replace function public.purger_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_supprimees integer, erreur text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prevue timestamptz;
  v_existe boolean;
  v_nb integer;
  v_avant record;
  v_apres record;
  v_detail jsonb;
  v_contrats integer := 0;
  v_politique text;
  v_commandes integer := 0;
  v_fournisseurs_avant record;
  v_fournisseurs_apres record;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    ok := false; lignes_supprimees := null;
    erreur := 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  if p_table = any(public.tables_conservees_purge()) or p_table = any(public.tables_anonymisees_purge()) then
    ok := false; lignes_supprimees := null;
    erreur := format('Table %s conservee ou anonymisee (pas DELETE) : purge refusee', p_table);
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'entreprise_id'
  ) into v_existe;
  if not v_existe then
    ok := false; lignes_supprimees := null;
    erreur := format('Table %s inconnue ou sans colonne entreprise_id : purge refusee', p_table);
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  -- Contrats acceptés (P1) : sans décision, refus explicite AVANT toute écriture.
  if p_table = any(public._tables_contrats_acceptes()) then
    v_contrats := public._nb_contrats_acceptes(p_entreprise_id);
    if v_contrats > 0 then
      -- V3 : état EFFECTIF de la politique (une politique retenue sans durée valide
      -- n'est pas active : fail-closed, refus nommé avant toute écriture).
      v_politique := platform.etat_politique_contrats();
      if v_politique not in ('supprimer_apres_preuve', 'conserver_contrat_minimise') then
        ok := false; lignes_supprimees := null;
        if v_politique = 'duree_requise' then
          erreur := format('DECISION_REQUIRED:RGPD-DUREE-CONSERVATION-CONTRAT — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique conserver_contrat_minimise retenue mais durée de conservation non validée, table %s non purgée',
                           v_contrats, p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-DUREE-CONSERVATION-CONTRAT', 'politique', 'conserver_contrat_minimise',
                               'contrats_acceptes', v_contrats));
        else
          erreur := format('DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — %s contrat(s) accepté(s) (devis/avenants) : '
                           'politique de purge des contrats non décidée, table %s non purgée', v_contrats, p_table);
          perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
            jsonb_build_object('decision_requise', 'RGPD-PURGE-VS-CONTRAT-ACCEPTE', 'contrats_acceptes', v_contrats));
        end if;
        return next; return;
      end if;
    end if;
  end if;

  -- PO-4 : commandes fournisseurs engagées sur les tables qui les portent.
  if p_table = any(public._tables_commandes_engagees()) then
    v_commandes := public._nb_commandes_engagees(p_entreprise_id);
  end if;

  begin
    -- R1 : autorisation liée à cette transaction, à cette entreprise, à cette table.
    -- Effacée plus bas ; en cas d'erreur, l'annulation du bloc l'efface aussi.
    insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
    values (txid_current(), p_entreprise_id, p_table, p_run_id)
    on conflict (txid, entreprise_id, table_purgee) do nothing;

    -- R3 : empreinte du contenu comptable avant l'étape.
    select * into v_avant from public.empreinte_comptable_factures_entreprise(p_entreprise_id);
    -- PO-4 : idem pour les factures fournisseurs conservées et leurs règlements.
    select * into v_fournisseurs_avant from public.empreinte_comptable_fournisseurs_entreprise(p_entreprise_id);

    -- P2/P3 : preuve de chaque contrat accepté figée avant la première écriture.
    if v_contrats > 0 then
      perform public._preserver_contrats_acceptes(p_entreprise_id, p_run_id);
    end if;
    -- PO-2 : instantané de chaque commande engagée figé avant la première écriture.
    if v_commandes > 0 then
      perform public._preserver_commandes_fournisseurs(p_entreprise_id, p_run_id);
    end if;

    perform public._snapshot_avant_purge(p_entreprise_id, p_table, p_run_id);
    if v_contrats > 0 and p_table in ('lignes_devis', 'pieces_jointes_devis') then
      -- Les lignes et pièces d'un devis accepté partent AVEC lui (cascade de l'étape
      -- `devis`, sous le contrôle de son verrou) : jamais avant, pour que le contrat ne
      -- soit à aucun moment amputé en base (recalcul de montants, photos).
      execute format(
        'delete from public.%I x where x.entreprise_id = $1 '
        'and not exists (select 1 from public.devis d where d.id = x.devis_id and d.statut = ''accepte'')', p_table)
        using p_entreprise_id;
    elsif p_table = 'lignes_commande' then
      -- PO-4 (D1) : seules les lignes des brouillons partent ici. Les lignes d'une commande
      -- envoyée, confirmée, reçue ou annulée partent AVEC elle (cascade de l'étape
      -- `commandes_fournisseurs`, sous CM-06), jamais avant.
      delete from public.lignes_commande x
       where x.entreprise_id = p_entreprise_id
         and exists (select 1 from public.commandes_fournisseurs c where c.id = x.commande_id and c.statut = 'brouillon');
    else
      execute format('delete from public.%I where entreprise_id = $1', p_table) using p_entreprise_id;
    end if;
    get diagnostics v_nb = row_count;

    delete from platform.purge_autorisations_facture
     where txid = txid_current() and entreprise_id = p_entreprise_id and table_purgee = p_table;

    select * into v_apres from public.empreinte_comptable_factures_entreprise(p_entreprise_id);
    if v_apres.empreinte is distinct from v_avant.empreinte or v_apres.nb_factures <> v_avant.nb_factures then
      raise exception 'Garde-fou comptable : la purge de % modifierait le contenu d''une facture conservée (empreinte % -> %)',
        p_table, v_avant.empreinte, v_apres.empreinte;
    end if;
    select * into v_fournisseurs_apres from public.empreinte_comptable_fournisseurs_entreprise(p_entreprise_id);
    if v_fournisseurs_apres.empreinte is distinct from v_fournisseurs_avant.empreinte
       or v_fournisseurs_apres.nb_depenses <> v_fournisseurs_avant.nb_depenses then
      raise exception 'Garde-fou comptable fournisseurs : la purge de % modifierait une facture fournisseur conservée ou ses règlements (empreinte % -> %)',
        p_table, v_fournisseurs_avant.empreinte, v_fournisseurs_apres.empreinte;
    end if;
    v_detail := jsonb_build_object(
      'controle_factures', 'empreinte_inchangee',
      'nb_factures', v_apres.nb_factures,
      'empreinte_factures', v_apres.empreinte,
      'controle_factures_fournisseurs', 'empreinte_inchangee',
      'nb_factures_fournisseurs', v_fournisseurs_apres.nb_depenses,
      'empreinte_factures_fournisseurs', v_fournisseurs_apres.empreinte);
    if v_contrats > 0 then
      v_detail := v_detail || jsonb_build_object('politique_contrats', v_politique, 'contrats_acceptes_avant', v_contrats);
    end if;
    if v_commandes > 0 then
      v_detail := v_detail || jsonb_build_object('commandes_engagees_avant', v_commandes,
        'instantanes_commandes', (select count(*) from platform.commandes_fournisseurs_purgees p where p.entreprise_id = p_entreprise_id));
    end if;

    ok := true; lignes_supprimees := v_nb; erreur := null;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', v_nb, true, null, v_detail);
  exception when others then
    ok := false; lignes_supprimees := null; erreur := sqlerrm;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, sqlerrm,
      jsonb_build_object('sqlstate', sqlstate));
  end;
  return next;
end; $$;
revoke all on function public.purger_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.purger_table_entreprise(uuid, text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-5. TRUNCATE refusé (service_role détient TRUNCATE, ACL 20260902000255)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.refuser_truncate_achats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'TRUNCATE interdit sur % : une commande engagée ou une pièce comptable fournisseur ne disparaît que par la purge RGPD, après instantané.', tg_table_name;
end;
$$;
revoke all on function public.refuser_truncate_achats() from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['commandes_fournisseurs', 'lignes_commande', 'depenses_fournisseurs', 'reglements_fournisseurs'] loop
    execute format('drop trigger if exists refuser_truncate_%1$s on public.%1$I', v_table);
    execute format('create trigger refuser_truncate_%1$s before truncate on public.%1$I '
                   'for each statement execute function public.refuser_truncate_achats()', v_table);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-6. Rapport, lecture (service_role uniquement)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.rapport_commandes_fournisseurs_purge(p_entreprise_id uuid)
returns table(commandes_engagees integer, commandes_brouillon_ou_annulees integer, instantanes integer)
language sql stable security definer set search_path = public as $$
  select public._nb_commandes_engagees(p_entreprise_id),
         (select count(*) from public.commandes_fournisseurs c
           where c.entreprise_id = p_entreprise_id and c.statut in ('brouillon', 'annulee'))::integer,
         (select count(*) from platform.commandes_fournisseurs_purgees p where p.entreprise_id = p_entreprise_id)::integer
$$;
revoke all on function public.rapport_commandes_fournisseurs_purge(uuid) from public, anon, authenticated;
grant execute on function public.rapport_commandes_fournisseurs_purge(uuid) to service_role;

-- Production d'une preuve (demande d'une autorité, litige fournisseur) : lecture seule.
create or replace function public.lire_commandes_fournisseurs_purgees(p_entreprise_id uuid)
returns setof platform.commandes_fournisseurs_purgees
language sql stable security definer set search_path = public as $$
  select * from platform.commandes_fournisseurs_purgees p
   where p.entreprise_id = p_entreprise_id
   order by p.numero, p.cree_le, p.id
$$;
revoke all on function public.lire_commandes_fournisseurs_purgees(uuid) from public, anon, authenticated;
grant execute on function public.lire_commandes_fournisseurs_purgees(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- PO-6. Preuve hors base : empreintes des commandes engagées purgées
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000502 plus la clé `commandes_fournisseurs`.
create or replace function public.preuve_purge_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_e record;
  v_audit jsonb;
  v_empreinte text;
  v_statut text;
begin
  select id, purgee_at, suppression_demandee_at, suppression_prevue_at
    into v_e from public.entreprises where id = p_entreprise_id;

  select jsonb_build_object(
           'nb_entrees', count(*),
           'nb_echecs', count(*) filter (where not a.ok),
           'runs', coalesce(jsonb_agg(distinct a.run_id) filter (where a.run_id is not null), '[]'::jsonb),
           'premiere_entree', min(a.created_at),
           'derniere_entree', max(a.created_at)
         ),
         encode(sha256(convert_to(coalesce(string_agg(
           -- format() rend NULL comme chaîne vide sans décaler les champs (concat_ws
           -- les sauterait) : la sérialisation reste positionnelle donc non ambiguë.
           format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', a.id, a.run_id, a.etape, a.table_nom, a.categorie,
                  a.lignes_affectees, a.ok, a.erreur, a.detail::text,
                  to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
           E'\n' order by a.created_at, a.id), ''), 'UTF8')), 'hex')
    into v_audit, v_empreinte
    from platform.purge_audit a
   where a.entreprise_id = p_entreprise_id;

  v_statut := case
    when v_e.id is null then 'ENTREPRISE_INCONNUE'
    when v_e.purgee_at is not null then 'PURGEE'
    when public.purge_entreprise_commencee(p_entreprise_id) then 'PURGE_COMMENCEE'
    when v_e.suppression_prevue_at is not null then 'SUPPRESSION_PROGRAMMEE'
    else 'AUCUNE_SUPPRESSION'
  end;

  return jsonb_build_object(
    'format', 'elsatia.preuve_purge.v1',
    'entreprise_id', p_entreprise_id,
    'statut', v_statut,
    'suppression_demandee_at', v_e.suppression_demandee_at,
    'suppression_prevue_at', v_e.suppression_prevue_at,
    'purgee_at', v_e.purgee_at,
    'audit', v_audit,
    'tables_purgees', coalesce((
      select jsonb_object_agg(t.table_nom, t.lignes) from (
        select a.table_nom, sum(a.lignes_affectees)::bigint as lignes
          from platform.purge_audit a
         where a.entreprise_id = p_entreprise_id and a.ok and a.etape = 'purge_table'
         group by a.table_nom
      ) t), '{}'::jsonb),
    'tables_anonymisees', coalesce((
      select jsonb_object_agg(t.table_nom, t.lignes) from (
        select a.table_nom, sum(a.lignes_affectees)::bigint as lignes
          from platform.purge_audit a
         where a.entreprise_id = p_entreprise_id and a.ok and a.etape = 'anonymiser_table'
         group by a.table_nom
      ) t), '{}'::jsonb),
    -- P6 : ce qui a été figé pour chaque contrat accepté supprimé (empreintes seulement).
    'contrats_acceptes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', c.type_contrat, 'id', c.source_id, 'niveau', c.niveau, 'politique', c.politique,
               'decision_ref', c.decision_ref, 'empreinte_document', c.empreinte_document,
               'empreinte_contenu', c.empreinte_contenu, 'conserver_jusqu_au', c.conserver_jusqu_au)
             order by c.type_contrat, c.source_id, c.empreinte_document)
        from platform.contrats_acceptes_purges c where c.entreprise_id = p_entreprise_id), '[]'::jsonb),
    -- PO-6 : ce qui a été figé pour chaque commande fournisseur engagée supprimée.
    'commandes_fournisseurs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.commande_id, 'numero', p.numero, 'statut', p.statut, 'niveau', p.niveau,
               'empreinte_document', p.empreinte_document, 'empreinte_contenu', p.empreinte_contenu,
               'conserver_jusqu_au', p.conserver_jusqu_au)
             order by p.numero, p.commande_id, p.empreinte_document)
        from platform.commandes_fournisseurs_purgees p where p.entreprise_id = p_entreprise_id), '[]'::jsonb),
    'empreinte_audit_sha256', v_empreinte,
    -- Rappel factuel, pas un engagement : la purge ne touche que la base vivante.
    'sauvegardes', 'Toute sauvegarde anterieure a purgee_at contient encore les donnees purgees. '
                || 'Elles ne disparaissent qu''a l''expiration de la retention de cette sauvegarde. '
                || 'Apres toute restauration anterieure a purgee_at, la purge doit etre rejouee.',
    'genere_at', now()
  );
end; $$;
revoke all on function public.preuve_purge_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.preuve_purge_entreprise(uuid) to service_role;

notify pgrst, 'reload schema';
