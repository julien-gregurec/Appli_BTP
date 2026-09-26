-- RGPD × contrats acceptés (devis, avenants) — réconciliation V1.
-- Rapport : docs/qualification/ELSATIA_RGPD_ACCEPTED_CONTRACTS_RECONCILIATION_V1.md
--
-- Problème (DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE, rapport factures V1 §6) :
-- la purge RGPD d'une entreprise (20260923000331 + 20260926000401) classe `devis`,
-- `lignes_devis`, `avenants`, `pieces_jointes_devis` en DELETE. Les verrous
-- `verrouiller_devis_accepte` / `verrouiller_avenant_accepte` refusent la suppression
-- d'un contrat accepté (et le délien de son chantier) : la purge de toute entreprise
-- qui a signé un devis s'arrête. Ce refus est sûr, mais il a deux défauts :
--   - il est muet sur sa cause (message de verrou générique, pas de décision nommée) ;
--   - il est incomplet : `pieces_jointes_devis` n'a pas de verrou, la purge supprime
--     déjà les photos d'un devis accepté alors que le devis lui-même reste bloqué.
--
-- Supprimer ou conserver un contrat accepté est une question JURIDIQUE (preuve du
-- contrat, prescription, garanties du BTP, rôle de sous-traitant de l'éditeur, DPA
-- art. 8 « supprimer ou restituer … sauf obligation légale de conservation »). Cette
-- migration NE la tranche PAS. Elle installe un mécanisme à politique explicite,
-- NON ACTIVÉ par défaut :
--
--  P0  `platform.purge_politique_contrats` (une ligne) : politique `non_decidee` par
--      défaut. Aucun rôle applicatif (anon, authenticated, service_role) n'y a accès ;
--      la changer demande une migration (ou le propriétaire de la base) citant une
--      référence de décision. Chaque changement est journalisé en ajout seul.
--  P1  `non_decidee` (DÉFAUT) : la purge refuse explicitement, avant toute écriture,
--      les tables qui portent un contrat accepté (devis, lignes_devis, avenants,
--      pieces_jointes_devis, chantiers) avec l'erreur auditée
--      DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE. Comportement identique à
--      aujourd'hui (purge incomplète, sans danger), mais nommé, et les photos d'un
--      devis accepté ne sont plus supprimées en avance.
--  P2  `supprimer_apres_preuve` (option D du rapport) : avant toute suppression, une
--      preuve MINIMALE non identifiante est figée (numéro, dates, montants, nombre de
--      lignes, empreinte SHA-256 du document complet), puis le contrat est supprimé.
--      L'empreinte permet d'authentifier plus tard la copie restituée au client
--      (export RGPD) sans que la plateforme garde le contenu.
--  P3  `conserver_contrat_minimise` (option C du rapport) : avant toute suppression,
--      un instantané contractuel IMMUABLE et MINIMISÉ est figé (contenu contractuel,
--      identité imprimée des parties ; ni e-mail, ni téléphone, ni contact, ni notes
--      internes, ni identifiants d'utilisateurs, ni audio) avec une échéance de
--      conservation, puis les objets métier actifs sont supprimés. Photos imprimées
--      sur le devis conservées seulement si la décision le demande.
--  P4  Dans les deux cas, la suppression d'un contrat accepté n'est possible que
--      pendant la purge, et seulement si une preuve du contenu EXACT du contrat à cet
--      instant existe (empreinte recalculée dans le verrou même) : autorisation
--      R1 (20260926000401) liée à la transaction, déposée par la seule fonction de
--      purge (service_role, échéance contrôlée), jamais par un utilisateur.
--      Hors purge, les verrous sont inchangés ; même pendant la purge, aucun champ
--      d'un contrat accepté ne devient modifiable (seul le délien d'un chantier
--      effectivement supprimé est toléré).
--  P5  Les preuves/instantanés vivent dans `platform.contrats_acceptes_purges` :
--      hors du périmètre dynamique de la purge (schéma platform), ajout seul,
--      aucune modification, suppression seulement après échéance, TRUNCATE refusé,
--      aucun droit applicatif ; lecture service_role par fonction dédiée.
--  P6  `preuve_purge_entreprise` (preuve hors base, 20260923000400) inclut la liste
--      des empreintes de contrats : un rejeu après restauration est vérifiable.
--  P7  TRUNCATE refusé sur devis, lignes_devis, avenants, lignes_avenants,
--      pieces_jointes_devis : service_role détient TRUNCATE sur ces tables (ACL
--      20260902000255) et TRUNCATE ne déclenche pas les verrous de ligne — c'était la
--      seule écriture capable d'effacer un contrat accepté sans preuve (même trou que
--      R8 de 20260926000401 pour les factures).
--
-- Activation (NE PAS faire sans décision juridique) :
--   select platform.definir_politique_purge_contrats(
--     'conserver_contrat_minimise', '<référence de la décision>', interval '<durée>', false);
--   ou
--   select platform.definir_politique_purge_contrats('supprimer_apres_preuve', '<référence>');

-- ═══════════════════════════════════════════════════════════════════════
-- P0. Politique (non décidée par défaut) et journal de ses changements
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.purge_politique_contrats (
  singleton boolean primary key default true check (singleton),
  politique text not null default 'non_decidee'
    check (politique in ('non_decidee', 'supprimer_apres_preuve', 'conserver_contrat_minimise')),
  decision_ref text,
  duree_conservation interval,
  inclure_photos boolean not null default false,
  definie_le timestamptz not null default now(),
  definie_par text not null default current_user,
  check (politique = 'non_decidee' or nullif(btrim(decision_ref), '') is not null),
  check (politique <> 'conserver_contrat_minimise'
         or (duree_conservation is not null and duree_conservation > interval '0')),
  check (politique = 'conserver_contrat_minimise' or (duree_conservation is null and not inclure_photos))
);
comment on table platform.purge_politique_contrats is
  'Sort des devis/avenants acceptés lors de la purge RGPD d''une entreprise. non_decidee '
  '(défaut) : la purge s''arrête sur ces contrats. Décision juridique requise pour changer '
  '(DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE). Aucun rôle applicatif n''y a accès.';
insert into platform.purge_politique_contrats (singleton) values (true) on conflict (singleton) do nothing;
alter table platform.purge_politique_contrats enable row level security;
revoke all on table platform.purge_politique_contrats from public, anon, authenticated, service_role;

create table if not exists platform.purge_politique_contrats_journal (
  id bigint generated always as identity primary key,
  politique text not null,
  decision_ref text,
  duree_conservation interval,
  inclure_photos boolean not null,
  definie_le timestamptz not null,
  definie_par text not null
);
alter table platform.purge_politique_contrats_journal enable row level security;
revoke all on table platform.purge_politique_contrats_journal from public, anon, authenticated, service_role;

create or replace function platform.journaliser_politique_contrats()
returns trigger language plpgsql security definer set search_path = platform as $$
begin
  if tg_table_name = 'purge_politique_contrats_journal' then
    raise exception 'Le journal des politiques de purge des contrats est en ajout seul';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'La politique de purge des contrats ne se supprime pas (revenir à non_decidee)';
  end if;
  insert into platform.purge_politique_contrats_journal
    (politique, decision_ref, duree_conservation, inclure_photos, definie_le, definie_par)
  values (new.politique, new.decision_ref, new.duree_conservation, new.inclure_photos, new.definie_le, new.definie_par);
  return new;
end; $$;
revoke all on function platform.journaliser_politique_contrats() from public, anon, authenticated, service_role;

drop trigger if exists journaliser_politique_contrats on platform.purge_politique_contrats;
create trigger journaliser_politique_contrats
  after insert or update on platform.purge_politique_contrats
  for each row execute function platform.journaliser_politique_contrats();
drop trigger if exists politique_contrats_non_supprimable on platform.purge_politique_contrats;
create trigger politique_contrats_non_supprimable
  before delete on platform.purge_politique_contrats
  for each row execute function platform.journaliser_politique_contrats();
drop trigger if exists journal_politique_contrats_immuable on platform.purge_politique_contrats_journal;
create trigger journal_politique_contrats_immuable
  before update or delete on platform.purge_politique_contrats_journal
  for each row execute function platform.journaliser_politique_contrats();

-- Première entrée du journal : l'état par défaut installé par cette migration.
insert into platform.purge_politique_contrats_journal
  (politique, decision_ref, duree_conservation, inclure_photos, definie_le, definie_par)
select p.politique, p.decision_ref, p.duree_conservation, p.inclure_photos, p.definie_le, p.definie_par
  from platform.purge_politique_contrats p
 where not exists (select 1 from platform.purge_politique_contrats_journal);

-- Seul point d'entrée pour changer la politique. Aucun GRANT : exécutable par le
-- propriétaire de la base (migration, console d'administration de la base), jamais par
-- l'application. Refuse un changement pendant qu'une purge est en cours.
create or replace function platform.definir_politique_purge_contrats(
  p_politique text, p_decision_ref text, p_duree interval default null, p_inclure_photos boolean default false)
returns void language plpgsql security invoker set search_path = platform as $$
begin
  if exists (select 1 from platform.purge_autorisations_facture) then
    raise exception 'Une purge est en cours : politique des contrats non modifiable maintenant';
  end if;
  update platform.purge_politique_contrats
     set politique = p_politique,
         decision_ref = nullif(btrim(p_decision_ref), ''),
         duree_conservation = p_duree,
         inclure_photos = coalesce(p_inclure_photos, false),
         definie_le = now(),
         definie_par = current_user
   where singleton;
end; $$;
revoke all on function platform.definir_politique_purge_contrats(text, text, interval, boolean)
  from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- P5. Preuves et instantanés des contrats acceptés purgés
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.contrats_acceptes_purges (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  run_id uuid,
  type_contrat text not null check (type_contrat in ('devis', 'avenant')),
  source_id uuid not null,
  reference text,
  politique text not null check (politique in ('supprimer_apres_preuve', 'conserver_contrat_minimise')),
  decision_ref text not null,
  niveau text not null check (niveau in ('preuve_minimale', 'contrat_minimise')),
  contenu jsonb not null,
  empreinte_document text not null check (empreinte_document ~ '^[0-9a-f]{64}$'),
  empreinte_contenu text not null check (empreinte_contenu ~ '^[0-9a-f]{64}$'),
  conserver_jusqu_au timestamptz,
  cree_le timestamptz not null default now(),
  unique (type_contrat, source_id, empreinte_document),
  check ((niveau = 'contrat_minimise') = (conserver_jusqu_au is not null))
);
create index if not exists contrats_acceptes_purges_entreprise_idx
  on platform.contrats_acceptes_purges (entreprise_id, type_contrat, source_id);
comment on table platform.contrats_acceptes_purges is
  'Preuve (niveau preuve_minimale) ou instantané minimisé (niveau contrat_minimise) de chaque '
  'devis/avenant accepté supprimé par la purge RGPD, figé avant la suppression. Ajout seul ; '
  'suppression seulement après conserver_jusqu_au ; aucun rôle applicatif n''y a accès.';
alter table platform.contrats_acceptes_purges enable row level security;
revoke all on table platform.contrats_acceptes_purges from public, anon, authenticated, service_role;

create or replace function platform.contrats_acceptes_purges_immuables()
returns trigger language plpgsql set search_path = platform as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'Les preuves de contrats purgés ne peuvent pas être vidées (TRUNCATE refusé)';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Une preuve de contrat purgé est immuable';
  end if;
  if old.conserver_jusqu_au is null or old.conserver_jusqu_au > now() then
    raise exception 'Une preuve de contrat purgé ne peut être supprimée qu''après son échéance de conservation';
  end if;
  return old;
end; $$;
revoke all on function platform.contrats_acceptes_purges_immuables() from public, anon, authenticated, service_role;

drop trigger if exists contrats_acceptes_purges_immuables on platform.contrats_acceptes_purges;
create trigger contrats_acceptes_purges_immuables
  before update or delete on platform.contrats_acceptes_purges
  for each row execute function platform.contrats_acceptes_purges_immuables();
drop trigger if exists contrats_acceptes_purges_sans_truncate on platform.contrats_acceptes_purges;
create trigger contrats_acceptes_purges_sans_truncate
  before truncate on platform.contrats_acceptes_purges
  for each statement execute function platform.contrats_acceptes_purges_immuables();

-- ═══════════════════════════════════════════════════════════════════════
-- Document contractuel, empreinte, minimisation
-- ═══════════════════════════════════════════════════════════════════════
-- Tables qui portent (ou suppriment en cascade / par délien) un contrat accepté.
create or replace function public._tables_contrats_acceptes()
returns text[] language sql immutable as $$
  select array['avenants', 'chantiers', 'devis', 'lignes_devis', 'pieces_jointes_devis'];
$$;
revoke all on function public._tables_contrats_acceptes() from public, anon, authenticated;

create or replace function public._nb_contrats_acceptes(p_entreprise_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select (select count(*) from public.devis where entreprise_id = p_entreprise_id and statut = 'accepte')::integer
       + (select count(*) from public.avenants where entreprise_id = p_entreprise_id and statut = 'accepte')::integer
$$;
revoke all on function public._nb_contrats_acceptes(uuid) from public, anon, authenticated, service_role;

-- Le contrat tel qu'il est en base : la ligne entière (to_jsonb : toute future colonne
-- est incluse d'office), ses lignes, ses pièces jointes, les signatures internes qui
-- le référencent ; pour un avenant, le numéro du devis d'origine. Seules exclusions :
-- `chantier_id` (clé de navigation que la purge peut délier), `updated_at`
-- (horodatage technique) et `relance_auto_exclue` (réglage de relance). Horodatages
-- en UTC (déterministe quel que soit le fuseau de la session, identique après
-- restauration).
create or replace function public._document_contrat_accepte(p_type text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_doc jsonb;
begin
  if p_type = 'devis' then
    select (to_jsonb(d) - 'chantier_id' - 'updated_at' - 'relance_auto_exclue')
           || jsonb_build_object(
                'lignes', coalesce((
                  select jsonb_agg(to_jsonb(l) - 'created_at' order by l.ordre, l.id)
                    from public.lignes_devis l where l.devis_id = d.id), '[]'::jsonb),
                'pieces_jointes', coalesce((
                  select jsonb_agg(to_jsonb(p) order by p.created_at, p.id)
                    from public.pieces_jointes_devis p where p.devis_id = d.id), '[]'::jsonb),
                'signatures', coalesce((
                  select jsonb_agg(jsonb_build_object(
                           'id', s.id, 'document_sha256', s.document_sha256, 'signed_at', s.signed_at,
                           'nom_signataire', s.nom_signataire, 'fonction_signataire', s.fonction_signataire)
                         order by s.signed_at, s.id)
                    from public.signatures_documents s
                   where s.entreprise_id = d.entreprise_id and s.type_document = 'devis' and s.document_id = d.id),
                  '[]'::jsonb))
      into v_doc
      from public.devis d where d.id = p_id;
  elsif p_type = 'avenant' then
    select (to_jsonb(a) - 'chantier_id' - 'updated_at')
           || jsonb_build_object(
                'devis_origine_numero', (select d.numero from public.devis d where d.id = a.devis_origine_id),
                'lignes', coalesce((
                  select jsonb_agg(to_jsonb(l) - 'created_at' order by l.ordre, l.id)
                    from public.lignes_avenants l where l.avenant_id = a.id), '[]'::jsonb))
      into v_doc
      from public.avenants a where a.id = p_id;
  else
    raise exception 'Type de contrat inconnu : %', p_type;
  end if;
  return v_doc;
end; $$;
revoke all on function public._document_contrat_accepte(text, uuid) from public, anon, authenticated, service_role;

create or replace function public._empreinte_jsonb(p jsonb)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p::text, 'UTF8')), 'hex')
$$;
revoke all on function public._empreinte_jsonb(jsonb) from public, anon, authenticated;

-- Minimisation (liste BLANCHE : une colonne future n'est conservée que si on l'ajoute ici).
--
-- `contrat_minimise` (P3) garde ce qui fait la preuve du contrat : ce que le document
-- imprime (numéro, dates, montants, lignes, notes au client, identité imprimée des
-- deux parties, photos imprimées si décidé), plus les conditions verrouillées à
-- l'acceptation. Il retire : e-mail, téléphone et contact du client, référence interne,
-- conditions de paiement de la fiche, adresse d'envoi de l'e-mail, notes internes,
-- identifiants d'utilisateurs (created_by, accepte_par → booléen), client_id,
-- enregistrements audio, chemins Storage (sauf photos conservées), nom et fonction du
-- salarié signataire (déjà conservés dans signatures_documents, table RETAIN).
--
-- `preuve_minimale` (P2) ne garde rien d'identifiant : numéro, dates, montants,
-- nombres de lignes / pièces, empreintes des signatures internes.
create or replace function public._contrat_minimise(p_type text, p_doc jsonb, p_niveau text, p_inclure_photos boolean)
returns jsonb language plpgsql immutable as $$
declare
  v_client jsonb;
  v_garder_client constant text[] := array[
    'type', 'nom', 'prenom', 'societe', 'raison_sociale', 'nom_commercial', 'forme_juridique',
    'siret', 'numero_tva', 'adresse_facturation', 'adresse_complement', 'code_postal', 'ville', 'pays',
    'nom_affiche', 'provenance', 'identite_incertaine', 'herite_de', 'version'];
  v_lignes jsonb;
begin
  if p_niveau = 'preuve_minimale' then
    if p_type = 'devis' then
      return jsonb_build_object(
        'type', 'devis', 'id', p_doc -> 'id', 'numero', p_doc -> 'numero', 'statut', p_doc -> 'statut',
        'date_emission', p_doc -> 'date_emission', 'date_validite', p_doc -> 'date_validite',
        'client_snapshot_at', p_doc -> 'client_snapshot_at',
        'montant_ht', p_doc -> 'montant_ht', 'montant_tva', p_doc -> 'montant_tva', 'montant_ttc', p_doc -> 'montant_ttc',
        'nb_lignes', jsonb_array_length(p_doc -> 'lignes'),
        'nb_pieces_jointes', jsonb_array_length(p_doc -> 'pieces_jointes'),
        'signatures', coalesce((select jsonb_agg(jsonb_build_object('id', s -> 'id', 'document_sha256', s -> 'document_sha256', 'signed_at', s -> 'signed_at'))
                                  from jsonb_array_elements(p_doc -> 'signatures') s), '[]'::jsonb));
    end if;
    return jsonb_build_object(
      'type', 'avenant', 'id', p_doc -> 'id', 'ordre', p_doc -> 'ordre', 'statut', p_doc -> 'statut',
      'devis_origine_id', p_doc -> 'devis_origine_id', 'devis_origine_numero', p_doc -> 'devis_origine_numero',
      'date_creation', p_doc -> 'date_creation', 'date_acceptation', p_doc -> 'date_acceptation',
      'montant_ht', p_doc -> 'montant_ht', 'montant_tva', p_doc -> 'montant_tva', 'montant_ttc', p_doc -> 'montant_ttc',
      'nb_lignes', jsonb_array_length(p_doc -> 'lignes'));
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'designation', l -> 'designation', 'description', l -> 'description', 'type', l -> 'type',
           'quantite', l -> 'quantite', 'unite', l -> 'unite', 'prix_unitaire_ht', l -> 'prix_unitaire_ht',
           'remise_ligne', l -> 'remise_ligne', 'taux_tva', l -> 'taux_tva', 'ordre', l -> 'ordre')
           order by (l ->> 'ordre')::numeric nulls last, l ->> 'id'), '[]'::jsonb)
    into v_lignes
    from jsonb_array_elements(p_doc -> 'lignes') l;

  if p_type = 'devis' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_client
      from jsonb_each(coalesce(p_doc -> 'client_snapshot', '{}'::jsonb)) as e(k, v)
     where k = any(v_garder_client);
    return jsonb_build_object(
      'type', 'devis', 'id', p_doc -> 'id', 'numero', p_doc -> 'numero', 'statut', p_doc -> 'statut',
      'date_emission', p_doc -> 'date_emission', 'date_validite', p_doc -> 'date_validite',
      'email_envoye_le', p_doc -> 'email_envoye_le',
      'remise_globale', p_doc -> 'remise_globale',
      'montant_ht', p_doc -> 'montant_ht', 'montant_tva', p_doc -> 'montant_tva', 'montant_ttc', p_doc -> 'montant_ttc',
      'conditions', p_doc -> 'conditions', 'notes_client', p_doc -> 'notes_client',
      'client', case when p_doc -> 'client_snapshot' is null or jsonb_typeof(p_doc -> 'client_snapshot') = 'null'
                     then null else v_client end,
      'client_snapshot_at', p_doc -> 'client_snapshot_at',
      'entreprise', p_doc -> 'entreprise_snapshot',
      'lignes', v_lignes,
      'photos', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nom_original', p -> 'nom_original', 'legende', p -> 'legende', 'mime_type', p -> 'mime_type',
                 'taille_octets', p -> 'taille_octets')
                 || case when p_inclure_photos then jsonb_build_object('storage_path', p -> 'storage_path') else '{}'::jsonb end)
          from jsonb_array_elements(p_doc -> 'pieces_jointes') p
         where p ->> 'type_media' = 'image'), '[]'::jsonb),
      'nb_audio_non_conserves', (select count(*) from jsonb_array_elements(p_doc -> 'pieces_jointes') p
                                  where p ->> 'type_media' is distinct from 'image'),
      'signatures', coalesce((select jsonb_agg(jsonb_build_object('id', s -> 'id', 'document_sha256', s -> 'document_sha256', 'signed_at', s -> 'signed_at'))
                                from jsonb_array_elements(p_doc -> 'signatures') s), '[]'::jsonb));
  end if;

  return jsonb_build_object(
    'type', 'avenant', 'id', p_doc -> 'id', 'ordre', p_doc -> 'ordre', 'statut', p_doc -> 'statut',
    'devis_origine_id', p_doc -> 'devis_origine_id', 'devis_origine_numero', p_doc -> 'devis_origine_numero',
    'date_creation', p_doc -> 'date_creation', 'date_envoi', p_doc -> 'date_envoi',
    'date_acceptation', p_doc -> 'date_acceptation',
    'acceptation_saisie_par_un_membre', (p_doc ->> 'accepte_par') is not null,
    'montant_ht', p_doc -> 'montant_ht', 'montant_tva', p_doc -> 'montant_tva', 'montant_ttc', p_doc -> 'montant_ttc',
    'notes_client', p_doc -> 'notes_client',
    'lignes', v_lignes);
end; $$;
revoke all on function public._contrat_minimise(text, jsonb, text, boolean) from public, anon, authenticated;

-- Une preuve du contenu EXACT actuel de ce contrat existe-t-elle ?
create or replace function public._preuve_contrat_a_jour(p_type text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from platform.contrats_acceptes_purges c
     where c.type_contrat = p_type and c.source_id = p_id
       and c.empreinte_document = public._empreinte_jsonb(public._document_contrat_accepte(p_type, p_id))
  )
$$;
revoke all on function public._preuve_contrat_a_jour(text, uuid) from public, anon, authenticated, service_role;

-- Autorisation R1 (20260926000401) pour cette transaction, cette entreprise et cette
-- table, ET politique décidée. Seul `purger_table_entreprise` dépose l'autorisation.
create or replace function public._purge_contrat_autorisee(p_entreprise_id uuid, p_table text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from platform.purge_autorisations_facture a
            where a.txid = txid_current() and a.entreprise_id = p_entreprise_id and a.table_purgee = p_table)
     and exists (
           select 1 from platform.purge_politique_contrats p where p.politique <> 'non_decidee')
$$;
revoke all on function public._purge_contrat_autorisee(uuid, text) from public, anon, authenticated, service_role;

-- Fige la preuve/instantané de chaque contrat accepté de l'entreprise (idempotent : une
-- nouvelle ligne seulement si le contenu a changé depuis la dernière preuve).
create or replace function public._preserver_contrats_acceptes(p_entreprise_id uuid, p_run_id uuid)
returns integer
language plpgsql security definer set search_path = public set timezone = 'UTC' as $$
declare
  v_pol platform.purge_politique_contrats;
  v_niveau text;
  v_c record;
  v_doc jsonb;
  v_contenu jsonb;
  v_empreinte text;
  v_depart timestamptz;
  v_n integer := 0;
  v_empreintes jsonb := '[]'::jsonb;
begin
  select * into v_pol from platform.purge_politique_contrats where singleton;
  if v_pol.politique is null or v_pol.politique = 'non_decidee' then
    raise exception 'DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — politique de purge des contrats acceptés non décidée';
  end if;
  v_niveau := case v_pol.politique when 'supprimer_apres_preuve' then 'preuve_minimale' else 'contrat_minimise' end;

  for v_c in
    select 'devis'::text as type_contrat, d.id, d.numero as reference, d.date_emission::timestamptz as depart
      from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte'
    union all
    select 'avenant', a.id,
           coalesce((select d.numero from public.devis d where d.id = a.devis_origine_id), '?') || ' / avenant ' || a.ordre,
           coalesce(date_trunc('day', a.date_acceptation), a.date_creation::timestamptz)
      from public.avenants a where a.entreprise_id = p_entreprise_id and a.statut = 'accepte'
    order by 1, 2
  loop
    v_doc := public._document_contrat_accepte(v_c.type_contrat, v_c.id);
    v_empreinte := public._empreinte_jsonb(v_doc);
    if exists (select 1 from platform.contrats_acceptes_purges c
                where c.type_contrat = v_c.type_contrat and c.source_id = v_c.id and c.empreinte_document = v_empreinte) then
      continue;
    end if;
    v_contenu := public._contrat_minimise(v_c.type_contrat, v_doc, v_niveau, v_pol.inclure_photos);
    -- Point de départ de la conservation : date du contrat (émission du devis,
    -- acceptation de l'avenant) — paramètre juridique documenté dans le rapport, pas
    -- la date de la purge (le rejeu après restauration reste identique).
    v_depart := v_c.depart;
    insert into platform.contrats_acceptes_purges
      (entreprise_id, run_id, type_contrat, source_id, reference, politique, decision_ref, niveau,
       contenu, empreinte_document, empreinte_contenu, conserver_jusqu_au)
    values
      (p_entreprise_id, p_run_id, v_c.type_contrat, v_c.id, v_c.reference, v_pol.politique, v_pol.decision_ref, v_niveau,
       v_contenu, v_empreinte, public._empreinte_jsonb(v_contenu),
       case when v_niveau = 'contrat_minimise' then coalesce(v_depart, now()) + v_pol.duree_conservation end);
    v_n := v_n + 1;
    v_empreintes := v_empreintes || jsonb_build_object('type', v_c.type_contrat, 'id', v_c.id, 'empreinte_document', v_empreinte);
  end loop;

  if v_n > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'preuve_contrats_acceptes', 'devis+avenants', v_pol.politique, v_n, true, null,
      jsonb_build_object('decision_ref', v_pol.decision_ref, 'niveau', v_niveau, 'contrats', v_empreintes));
  end if;
  return v_n;
end; $$;
revoke all on function public._preserver_contrats_acceptes(uuid, uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- P4. Verrous : exception de purge bornée à « preuve à jour + autorisation »
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique aux versions précédentes (20260818000210, 20260908000272) hors des
-- blocs « purge RGPD ».
create or replace function public.verrouiller_devis_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      -- Purge RGPD (politique décidée) : suppression seulement dans l'étape `devis`,
      -- et seulement si une preuve du contenu exact de ce devis est figée.
      if public._purge_contrat_autorisee(old.entreprise_id, 'devis')
         and public._preuve_contrat_a_jour('devis', old.id) then
        return old;
      end if;
      raise exception 'Ce devis est accepté et ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if old.statut = 'accepte' then
    if new.statut is distinct from old.statut
       or new.montant_ht is distinct from old.montant_ht
       or new.montant_tva is distinct from old.montant_tva
       or new.montant_ttc is distinct from old.montant_ttc
       or new.client_id is distinct from old.client_id
       or new.chantier_id is distinct from old.chantier_id
       or new.remise_globale is distinct from old.remise_globale
       or new.conditions is distinct from old.conditions
       or new.notes_client is distinct from old.notes_client
       or new.date_emission is distinct from old.date_emission
       or new.date_validite is distinct from old.date_validite
       or new.numero is distinct from old.numero
       or new.entreprise_id is distinct from old.entreprise_id
    then
      -- Purge RGPD : seul le délien (chantier_id → NULL, FK ON DELETE SET NULL) d'un
      -- chantier effectivement supprimé, dans l'étape `chantiers`, preuve à jour.
      if public._purge_contrat_autorisee(old.entreprise_id, 'chantiers')
         and new.chantier_id is null and old.chantier_id is not null
         and not exists (select 1 from public.chantiers c where c.id = old.chantier_id)
         and (to_jsonb(new) - 'chantier_id' - 'updated_at') = (to_jsonb(old) - 'chantier_id' - 'updated_at')
         and public._preuve_contrat_a_jour('devis', old.id) then
        return new;
      end if;
      raise exception 'Ce devis est accepté et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.verrouiller_avenant_accepte()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.statut = 'accepte' then
      if public._purge_contrat_autorisee(old.entreprise_id, 'avenants')
         and public._preuve_contrat_a_jour('avenant', old.id) then
        return old;
      end if;
      raise exception 'Cet avenant est accepté et ne peut plus être supprimé.';
    end if;
    return old;
  end if;

  if new.statut = 'envoye' and old.statut <> 'envoye' then
    new.date_envoi := now();
  end if;
  if new.statut = 'accepte' and old.statut <> 'accepte' then
    new.date_acceptation := now();
    new.accepte_par := auth.uid();
  end if;
  if new.statut = 'refuse' and old.statut <> 'refuse' then
    new.date_refus := now();
  end if;

  if old.statut = 'accepte' then
    if new.statut is distinct from old.statut
       or new.entreprise_id is distinct from old.entreprise_id
       or new.chantier_id is distinct from old.chantier_id
       or new.devis_origine_id is distinct from old.devis_origine_id
       or new.ordre is distinct from old.ordre
       or new.montant_ht is distinct from old.montant_ht
       or new.montant_tva is distinct from old.montant_tva
       or new.montant_ttc is distinct from old.montant_ttc
       or new.date_acceptation is distinct from old.date_acceptation
       or new.accepte_par is distinct from old.accepte_par
       or new.notes_client is distinct from old.notes_client
    then
      raise exception 'Cet avenant est accepté et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- P1–P3. Purge d'une table : porte « contrats acceptés »
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000401 hors des blocs « contrats acceptés ».
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
      select politique into v_politique from platform.purge_politique_contrats where singleton;
      if v_politique is distinct from 'supprimer_apres_preuve' and v_politique is distinct from 'conserver_contrat_minimise' then
        ok := false; lignes_supprimees := null;
        erreur := format('DECISION_REQUIRED:RGPD-PURGE-VS-CONTRAT-ACCEPTE — %s contrat(s) accepté(s) (devis/avenants) : '
                         'politique de purge des contrats non décidée, table %s non purgée', v_contrats, p_table);
        perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, erreur,
          jsonb_build_object('decision_requise', 'RGPD-PURGE-VS-CONTRAT-ACCEPTE', 'contrats_acceptes', v_contrats));
        return next; return;
      end if;
    end if;
  end if;

  begin
    -- R1 : autorisation liée à cette transaction, à cette entreprise, à cette table.
    -- Effacée plus bas ; en cas d'erreur, l'annulation du bloc l'efface aussi.
    insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
    values (txid_current(), p_entreprise_id, p_table, p_run_id)
    on conflict (txid, entreprise_id, table_purgee) do nothing;

    -- R3 : empreinte du contenu comptable avant l'étape.
    select * into v_avant from public.empreinte_comptable_factures_entreprise(p_entreprise_id);

    -- P2/P3 : preuve de chaque contrat accepté figée avant la première écriture.
    if v_contrats > 0 then
      perform public._preserver_contrats_acceptes(p_entreprise_id, p_run_id);
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
    v_detail := jsonb_build_object(
      'controle_factures', 'empreinte_inchangee',
      'nb_factures', v_apres.nb_factures,
      'empreinte_factures', v_apres.empreinte);
    if v_contrats > 0 then
      v_detail := v_detail || jsonb_build_object('politique_contrats', v_politique, 'contrats_acceptes_avant', v_contrats);
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
-- Storage : photos conservées dans un instantané contractuel = RETAIN
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260926000401 (R7) plus une source de références.
create or replace function public.verifier_storage_entreprise(p_entreprise_id uuid)
returns table(bucket_id text, chemin text, categorie text, table_referencee text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conservees text[] := public.tables_conservees_purge();
  v_anonymisees text[] := public.tables_anonymisees_purge();
  v_col record;
  v_chemin text;
begin
  create temporary table if not exists _storage_ref (chemin text, table_nom text) on commit drop;
  delete from _storage_ref;

  for v_col in
    select table_name, column_name from information_schema.columns
     where table_schema = 'public' and column_name ilike '%storage_path%'
  loop
    for v_chemin in
      execute format(
        'select %I from public.%I where entreprise_id = $1 and %I is not null',
        v_col.column_name, v_col.table_name, v_col.column_name
      ) using p_entreprise_id
    loop
      insert into _storage_ref values (v_chemin, v_col.table_name);
    end loop;
  end loop;

  insert into _storage_ref
  select regexp_replace(logo_url, '^.*/storage/v1/object/public/[^/]+/', ''), '__entreprise_logo__'
  from public.entreprises
  where id = p_entreprise_id and logo_url is not null and logo_url ~ '/storage/v1/object/public/';

  -- R7 : le logo figé dans l'identité émettrice d'une facture conservée fait partie
  -- du document émis ; il reste référencé après l'anonymisation de l'entreprise.
  insert into _storage_ref
  select distinct regexp_replace(f.entreprise_snapshot ->> 'logo_url', '^.*/storage/v1/object/public/[^/]+/', ''), 'factures'
  from public.factures f
  where f.entreprise_id = p_entreprise_id
    and f.entreprise_snapshot ->> 'logo_url' ~ '/storage/v1/object/public/';

  -- P3 : photos (et logo émetteur) d'un instantané contractuel conservé, tant qu'il
  -- n'a pas atteint son échéance.
  insert into _storage_ref
  select distinct ph ->> 'storage_path', '__contrat_conserve__'
    from platform.contrats_acceptes_purges c
    cross join lateral jsonb_array_elements(coalesce(c.contenu -> 'photos', '[]'::jsonb)) ph
   where c.entreprise_id = p_entreprise_id and c.niveau = 'contrat_minimise'
     and ph ->> 'storage_path' is not null;
  insert into _storage_ref
  select distinct regexp_replace(c.contenu -> 'entreprise' ->> 'logo_url', '^.*/storage/v1/object/public/[^/]+/', ''), '__contrat_conserve__'
    from platform.contrats_acceptes_purges c
   where c.entreprise_id = p_entreprise_id and c.niveau = 'contrat_minimise'
     and c.contenu -> 'entreprise' ->> 'logo_url' ~ '/storage/v1/object/public/';

  return query
  select
    f.bucket_id, f.chemin,
    case
      when r.table_nom is null then 'ORPHELIN'
      when r.table_nom = any(v_conservees) or r.table_nom = any(v_anonymisees)
        or r.table_nom in ('__entreprise_logo__', '__contrat_conserve__') then 'RETAIN'
      else 'A_PURGER'
    end as categorie,
    r.table_nom
  from public.lister_fichiers_storage_entreprise(p_entreprise_id) f
  left join _storage_ref r on r.chemin = f.chemin
  order by categorie, f.bucket_id, f.chemin;
end; $$;
revoke all on function public.verifier_storage_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.verifier_storage_entreprise(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- P7. TRUNCATE refusé sur les tables des contrats
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.refuser_truncate_contrats()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'TRUNCATE interdit sur % : un contrat accepté ne disparaît que par la purge RGPD, après preuve.', tg_table_name;
end;
$$;
revoke all on function public.refuser_truncate_contrats() from public, anon, authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['devis', 'lignes_devis', 'avenants', 'lignes_avenants', 'pieces_jointes_devis'] loop
    execute format('drop trigger if exists refuser_truncate_%1$s on public.%1$I', v_table);
    execute format('create trigger refuser_truncate_%1$s before truncate on public.%1$I '
                   'for each statement execute function public.refuser_truncate_contrats()', v_table);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════
-- Lecture, rapport, échéance (service_role uniquement)
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.rapport_contrats_acceptes_purge(p_entreprise_id uuid)
returns table(politique text, decision_ref text, devis_acceptes integer, avenants_acceptes integer, preuves integer)
language sql stable security definer set search_path = public as $$
  select p.politique, p.decision_ref,
         (select count(*) from public.devis d where d.entreprise_id = p_entreprise_id and d.statut = 'accepte')::integer,
         (select count(*) from public.avenants a where a.entreprise_id = p_entreprise_id and a.statut = 'accepte')::integer,
         (select count(*) from platform.contrats_acceptes_purges c where c.entreprise_id = p_entreprise_id)::integer
    from platform.purge_politique_contrats p where p.singleton
$$;
revoke all on function public.rapport_contrats_acceptes_purge(uuid) from public, anon, authenticated;
grant execute on function public.rapport_contrats_acceptes_purge(uuid) to service_role;

-- Production d'une preuve (demande d'une autorité, litige) : lecture seule, tracée.
create or replace function public.lire_contrats_acceptes_purges(p_entreprise_id uuid)
returns setof platform.contrats_acceptes_purges
language sql stable security definer set search_path = public as $$
  select * from platform.contrats_acceptes_purges c
   where c.entreprise_id = p_entreprise_id
   order by c.type_contrat, c.reference, c.cree_le, c.id
$$;
revoke all on function public.lire_contrats_acceptes_purges(uuid) from public, anon, authenticated;
grant execute on function public.lire_contrats_acceptes_purges(uuid) to service_role;

-- Suppression des instantanés échus (non branchée sur un planificateur : à activer avec
-- la décision). Renvoie les chemins Storage de photos à supprimer ensuite par l'API.
create or replace function public.purger_contrats_conserves_echus(p_limite integer default 500)
returns table(entreprise_id uuid, type_contrat text, source_id uuid, chemins_storage text[])
language plpgsql security definer set search_path = public as $$
declare
  v_c record;
begin
  for v_c in
    select c.* from platform.contrats_acceptes_purges c
     where c.conserver_jusqu_au is not null and c.conserver_jusqu_au <= now()
     order by c.conserver_jusqu_au, c.id
     limit greatest(coalesce(p_limite, 500), 0)
  loop
    delete from platform.contrats_acceptes_purges where id = v_c.id;
    perform platform.consigner(v_c.entreprise_id, coalesce(v_c.run_id, gen_random_uuid()), 'echeance_contrat_conserve',
      v_c.type_contrat, 'contrat_minimise', 1, true, null,
      jsonb_build_object('source_id', v_c.source_id, 'empreinte_document', v_c.empreinte_document,
                         'conserver_jusqu_au', v_c.conserver_jusqu_au));
    entreprise_id := v_c.entreprise_id; type_contrat := v_c.type_contrat; source_id := v_c.source_id;
    select coalesce(array_agg(ph ->> 'storage_path'), '{}') into chemins_storage
      from jsonb_array_elements(coalesce(v_c.contenu -> 'photos', '[]'::jsonb)) ph
     where ph ->> 'storage_path' is not null;
    return next;
  end loop;
end; $$;
revoke all on function public.purger_contrats_conserves_echus(integer) from public, anon, authenticated;
grant execute on function public.purger_contrats_conserves_echus(integer) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- P6. Preuve hors base : empreintes des contrats acceptés purgés
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260923000400 plus la clé `contrats_acceptes`.
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
