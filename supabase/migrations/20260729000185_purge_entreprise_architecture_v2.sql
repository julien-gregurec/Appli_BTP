-- RGPD purge — architecture V2. Corrige les défauts structurels confirmés par
-- l'exécution réelle de la qualification end-to-end (docs/qualification/
-- ELSATIA_RGPD_PURGE_END_TO_END_V1.md, verdict « NOT PROVEN ») : F1 à F8.
--
-- Portée de cette migration : uniquement les défauts TECHNIQUES certains (contraintes
-- FK, triggers d'immuabilité, ordre de purge, survie de l'audit, références Storage
-- pendantes). Conformément à la mission de clôture V2, AUCUNE décision juridique
-- nouvelle n'est prise ici : toute table dont le statut de rétention est ambigu est
-- classée RETAIN par défaut (voir docs/qualification/
-- ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md §12 pour la liste des décisions
-- juridiques encore ouvertes).
--
-- Résumé des corrections :
--  F1  purger_table_entreprise() ne relance plus l'exception : elle consigne l'échec
--      et retourne un enregistrement (ok/lignes/erreur). Comme la fonction ne lève
--      plus d'exception, PostgREST/le pilote peut committer la transaction — l'audit
--      d'un échec n'est donc plus perdu (avant : l'INSERT d'audit dans le bloc
--      EXCEPTION était annulé par le ROLLBACK provoqué par le `raise;` final).
--  F2  L'ordre de purge n'est plus alphabétique : rapport_purge_entreprise() calcule
--      un tri topologique réel à partir de pg_constraint (RESTRICT/NO ACTION),
--      recalculé à chaque appel — robuste aux futures migrations sans entretien manuel.
--  F3  Les tables verrouillées en permanence par une FK RESTRICT/NO ACTION depuis une
--      table retenue (comptabilité/paie/virements) sont reclassées RETAIN (paie,
--      notes de frais/archivage) ou ANONYMIZE (clients, employés, fournisseurs :
--      la ligne reste pour satisfaire la FK, les données personnelles sont vidées).
--  F4  L'audit de la purge vit dans un schéma `platform` séparé, jamais scanné par
--      la recherche dynamique de colonnes `entreprise_id` — il ne peut plus être purgé
--      par sa propre exécution.
--  F5  journal_audit_paie (trigger d'immuabilité existant) est reclassée RETAIN au lieu
--      de DELETE : la table refusait déjà la suppression, seule la classification était
--      fausse.
--  F6  signatures_documents (trigger d'immuabilité existant, valeur probante) est
--      reclassée RETAIN pour la même raison, et ses fichiers Storage ne sont plus
--      supprimés (la preuve ne doit pas pointer vers un fichier détruit).
--  F7  verifier_storage_entreprise() réconcilie dynamiquement, pour TOUTE colonne
--      *_storage_path du schéma public, les fichiers Storage réels avec les lignes qui
--      les référencent encore : classe chaque fichier ORPHELIN (à supprimer) ou
--      RÉFÉRENCÉ (à conserver), sans se limiter aux tables connues à l'écriture de
--      cette migration.
--  F8  Avant de purger une table référencée par une table retenue via ON DELETE SET
--      NULL/SET DEFAULT, un instantané lisible (id + libellé) est écrit dans une
--      colonne `purge_snapshot jsonb` de la table retenue — la traçabilité humaine
--      survit même quand la ligne source est supprimée.

-- ═══════════════════════════════════════════════════════════════════════
-- 0. Schéma platform : audit de la purge, hors de portée de tout scan public
-- ═══════════════════════════════════════════════════════════════════════
create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;
grant usage on schema platform to service_role;

create table if not exists platform.purge_audit (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  run_id uuid not null,
  etape text not null,
  table_nom text,
  categorie text,
  lignes_affectees integer,
  ok boolean not null,
  erreur text,
  detail jsonb,
  created_at timestamptz not null default now()
);
comment on table platform.purge_audit is
  'Piste d''audit de la purge RGPD (art. 17), schéma platform séparé du schéma public '
  'applicatif : la recherche dynamique de colonnes entreprise_id (rapport_purge_entreprise) '
  'ne porte que sur le schéma public, donc cette table ne peut jamais être incluse dans '
  'son propre périmètre de purge (corrige F4). Sans FK vers entreprises (on delete cascade '
  'la supprimerait) : doit survivre à la purge qu''elle documente. Écriture uniquement via '
  'les fonctions SECURITY DEFINER ci-dessous — jamais de DELETE/UPDATE applicatif.';
create index if not exists purge_audit_entreprise_run_idx on platform.purge_audit (entreprise_id, run_id, created_at);
alter table platform.purge_audit enable row level security;
-- Aucune policy définie : ceinture-bretelles avec le REVOKE ci-dessous, accessible
-- uniquement via service_role (qui contourne RLS) ou les fonctions SECURITY DEFINER
-- du schéma platform.
revoke all on table platform.purge_audit from public, anon, authenticated;
grant select, insert on table platform.purge_audit to service_role;

create or replace function platform.consigner(
  p_entreprise_id uuid, p_run_id uuid, p_etape text, p_table_nom text, p_categorie text,
  p_lignes integer, p_ok boolean, p_erreur text, p_detail jsonb default null
) returns void
language sql security definer set search_path = platform as $$
  insert into platform.purge_audit
    (entreprise_id, run_id, etape, table_nom, categorie, lignes_affectees, ok, erreur, detail)
  values
    (p_entreprise_id, p_run_id, p_etape, p_table_nom, p_categorie, p_lignes, p_ok, p_erreur, p_detail);
$$;
revoke all on function platform.consigner(uuid, uuid, text, text, text, integer, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function platform.consigner(uuid, uuid, text, text, text, integer, boolean, text, jsonb) to service_role;

-- Migration des lignes existantes de l'ancien registre public (mission de qualification
-- V1, jamais exécutée en purge réelle en production) vers le nouveau registre platform,
-- puis suppression de l'ancienne table : elle portait une colonne entreprise_id et était
-- donc elle-même vulnérable à F4.
insert into platform.purge_audit (entreprise_id, run_id, etape, table_nom, categorie, lignes_affectees, ok, erreur, detail, created_at)
select entreprise_id, gen_random_uuid(), 'legacy_v1', table_purgee, null,
       lignes_supprimees, (erreur is null), erreur,
       jsonb_build_object('source', 'public.purge_entreprises_progres', 'termine_at', termine_at),
       created_at
from public.purge_entreprises_progres
on conflict do nothing;

drop table if exists public.purge_entreprises_progres;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Classification — RETAIN / ANONYMIZE, calculée à partir du graphe réel
-- ═══════════════════════════════════════════════════════════════════════

-- Miroir SQL de TABLES_RETENUES_PURGE (src/lib/rgpd.ts) — garder synchronisé.
-- Remplace tables_conservees_purge() (v1) : liste complétée pour couvrir tout ce que
-- le graphe de dépendances réel (pg_constraint) force structurellement à conserver,
-- plus les domaines explicitement nommés par la mission de clôture V2 (§2 : factures,
-- avoirs [= factures type='avoir'], paiements, paie, écritures, documents contractuels,
-- audit). Toute ambiguïté de rétention est résolue par défaut vers la conservation
-- (LEGAL_DECISION_REQUIRED documenté séparément, pas résolu ici).
create or replace function public.tables_conservees_purge()
returns text[]
language sql immutable
as $$
  select array[
    -- Facturation (mission §2 : factures, avoirs, paiements)
    'factures', 'lignes_factures', 'paiements', 'remises_banque_paiements',
    -- Bancaire / virements
    'coordonnees_bancaires', 'connexions_bancaires', 'lots_virements', 'ordres_virements',
    'journal_paiements_bancaires',
    -- Paie (mission §2), y compris le sous-module préparation/validation paie complet :
    -- absences_paie, indemnites_deplacement_paie et pieces_jointes_paie sont des
    -- enregistrements de détail d'un dossier de paie retenu, pas des données autonomes ;
    -- les en supprimer séparément viderait de son contenu un dossier qu'on a par ailleurs
    -- décidé de conserver.
    'bulletins_paie', 'periodes_paie', 'dossiers_paie_salaries', 'validations_paie',
    'absences_paie', 'indemnites_deplacement_paie', 'pieces_jointes_paie',
    'journal_audit_paie',       -- F5 : trigger d'immuabilité déjà existant (journal_paie_immuable)
    'grands_deplacements',      -- indemnités de paie (module preparation_paie)
    'facturation_comptes_mensuelle', -- facturation de la plateforme elle-même au client
    -- Notes de frais : verrouillées structurellement par ordres_virements (RESTRICT,
    -- F3) dès qu'une note a été remboursée par virement ; le sous-système d'archivage
    -- (versions/exports) est traité comme un tout avec la note de frais qu'il documente.
    'notes_frais', 'depenses_fournisseurs', 'categories_notes_frais', 'documents_notes_frais',
    'versions_documents_notes_frais', 'exports_notes_frais', 'elements_export_notes_frais',
    -- Documents contractuels / preuve (mission §2)
    'signatures_documents',     -- F6 : trigger d'immuabilité déjà existant (signature_document_immuable)
    -- Écritures / audit (mission §2)
    'journal_activite'
  ];
$$;

-- Tables où la ligne reste (jamais supprimée) mais dont le contenu personnel est vidé.
-- Ces tables sont verrouillées en lecture par une FK RESTRICT/NO ACTION depuis une table
-- retenue (F3 : bulletins_paie→employes, ordres_virements→{employes,fournisseurs,
-- notes_frais,depenses_fournisseurs}, factures→clients) : la ligne ne PEUT pas être
-- supprimée tant que la donnée financière/paie qui la référence est conservée. La
-- solution GDPR standard pour ce conflit rétention-légale / droit à l'effacement est la
-- pseudonymisation, pas la suppression — cohérent avec anonymiser_employe() (migration
-- 20260719000114) déjà en place pour ce même besoin au niveau d'un salarié isolé.
create or replace function public.tables_anonymisees_purge()
returns text[]
language sql immutable
as $$
  select array['employes', 'clients', 'fournisseurs'];
$$;

-- Colonnes correspondant à une donnée personnelle identifiable, à vider pour les tables
-- ANONYMIZE. Pattern repris et généralisé de anonymiser_employe() (migration
-- 20260719000114) pour couvrir aussi clients et fournisseurs.
create or replace function public.colonnes_personnelles_purge()
returns text
language sql immutable
as $$
  select 'email|telephone|adresse|notes|photo|signature|carte_btp|iban|bic|'
      || 'securite_sociale|naissance|identifiant|reference_interne|siret|contact|'
      || 'societe|raison_sociale|latitude|longitude'
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Rapport — DELETE / ANONYMIZE / RETAIN, ordre topologique réel
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.rapport_purge_entreprise(uuid);
create or replace function public.rapport_purge_entreprise(p_entreprise_id uuid)
returns table(table_nom text, categorie text, nb_lignes bigint, ordre integer)
language plpgsql security definer set search_path = public as $$
declare
  v_conservees text[] := public.tables_conservees_purge();
  v_anonymisees text[] := public.tables_anonymisees_purge();
  v_table text;
  v_count bigint;
  v_a_purger text[] := '{}';
begin
  -- `if not exists` + purge explicite : cette fonction peut être appelée plusieurs fois
  -- dans la même transaction/session (dry-run répété, script de purge, tests pgTAP) —
  -- `on commit drop` ne vide la table qu'au commit, pas entre deux appels.
  create temporary table if not exists _rapport_lignes (table_nom text primary key, categorie text, nb_lignes bigint)
    on commit drop;
  delete from _rapport_lignes;

  -- Passage 1 : compte réel des lignes par table candidate (nécessite du SQL dynamique,
  -- donc une boucle — identique dans l'esprit à rapport_purge_entreprise v1).
  for v_table in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'entreprise_id' and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where entreprise_id = $1', v_table)
      into v_count using p_entreprise_id;
    if v_count > 0 then
      insert into _rapport_lignes values (
        v_table,
        case when v_table = any(v_conservees) then 'RETAIN'
             when v_table = any(v_anonymisees) then 'ANONYMIZE'
             else 'DELETE' end,
        v_count
      );
      if v_table != all(v_conservees) and v_table != all(v_anonymisees) then
        v_a_purger := v_a_purger || v_table;
      end if;
    end if;
  end loop;

  -- Passage 2 : tri topologique réel (Kahn, via plus long chemin) sur les arêtes
  -- RESTRICT/NO ACTION du sous-graphe DELETE-uniquement, restreint aux tables qui ont
  -- effectivement des lignes pour cette entreprise. Recalculé à chaque appel à partir
  -- de pg_constraint : toute nouvelle table/FK ajoutée par une migration future est
  -- automatiquement prise en compte, sans entretien manuel de l'ordre (corrige F2).
  return query
  with aretes as (
    select chi.relname::text as enfant, par.relname::text as parent
    from pg_constraint con
    join pg_class chi on chi.oid = con.conrelid
    join pg_class par on par.oid = con.confrelid
    join pg_namespace nsp on nsp.oid = chi.relnamespace
    where con.contype = 'f' and nsp.nspname = 'public'
      and con.confdeltype in ('r', 'a')
      and chi.relname = any(v_a_purger) and par.relname = any(v_a_purger)
      and chi.relname != par.relname
  ),
  niveau as (
    with recursive profondeur(table_nom, n) as (
      select t::text collate "C", 0 from unnest(v_a_purger) t
      where not exists (select 1 from aretes where parent = t)
      union
      select ar.parent, p.n + 1
      from aretes ar join profondeur p on p.table_nom = ar.enfant
      -- Garde-fou anti-cycle : le graphe réel vérifié (qualification V2) n'a aucun cycle
      -- RESTRICT/NO ACTION parmi les tables DELETE (profondeur max observée : 2). Une
      -- future migration qui en introduirait un serait un bug de schéma qu'aucun ordre
      -- de purge ne peut résoudre (il faudrait revoir la FK elle-même) ; cette limite
      -- évite une récursion infinie plutôt que de masquer le problème.
      where p.n < 50
    )
    select profondeur.table_nom, max(profondeur.n) as n from profondeur group by profondeur.table_nom
  )
  select r.table_nom, r.categorie, r.nb_lignes, coalesce(nv.n, 0)::integer as ordre
  from _rapport_lignes r
  left join niveau nv on nv.table_nom = r.table_nom
  order by (r.categorie = 'DELETE') desc, coalesce(nv.n, 0), r.table_nom;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Instantané (F8) — préserver la traçabilité humaine avant un SET NULL
-- ═══════════════════════════════════════════════════════════════════════
-- Tables retenues dont une colonne référence, via ON DELETE SET NULL/SET DEFAULT, une
-- table qui va être purgée (constaté réellement par le graphe pg_constraint, §"F8
-- edges" de la qualification V2 : factures.chantier_id, factures.devis_origine_id,
-- depenses_fournisseurs.{chantier_id,charge_recurrente_id,commande_id,outil_id,
-- vehicule_id}, facturation_comptes_mensuelle.poste_id, grands_deplacements.chantier_id,
-- indemnites_deplacement_paie.chantier_id, notes_frais.chantier_id). Sans instantané, la
-- FK viderait silencieusement ces colonnes (constat F8 réel : factures.devis_origine_id
-- passait à NULL sur 180/180 factures conservées lors de la purge de devis).
alter table public.factures add column if not exists purge_snapshot jsonb;
alter table public.depenses_fournisseurs add column if not exists purge_snapshot jsonb;
alter table public.facturation_comptes_mensuelle add column if not exists purge_snapshot jsonb;
alter table public.grands_deplacements add column if not exists purge_snapshot jsonb;
alter table public.indemnites_deplacement_paie add column if not exists purge_snapshot jsonb;
alter table public.notes_frais add column if not exists purge_snapshot jsonb;
comment on column public.factures.purge_snapshot is
  'Instantané lisible (id + libellé) des lignes référencées par SET NULL et supprimées '
  'par une purge RGPD (ex. chantier_id, devis_origine_id) — écrit par '
  'public._snapshot_avant_purge(), jamais par l''application. Corrige F8.';

-- Meilleure colonne "libellé humain" disponible pour une table donnée, dans l'ordre de
-- préférence ; repli sur l'id si aucune ne s'applique. Généraliste : fonctionne pour
-- toute table cible future sans entretien de mapping table par table.
create or replace function public._libelle_ligne(p_table text, p_id uuid)
returns text
language plpgsql stable as $$
declare
  v_col text;
  v_val text;
begin
  select column_name into v_col
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table
     and column_name = any(array['numero', 'reference', 'nom', 'libelle', 'titre', 'raison_sociale'])
   order by array_position(array['numero', 'reference', 'nom', 'libelle', 'titre', 'raison_sociale'], column_name)
   limit 1;
  if v_col is null then
    return p_id::text;
  end if;
  execute format('select %I::text from public.%I where id = $1', v_col, p_table) into v_val using p_id;
  return coalesce(v_val, p_id::text);
end; $$;

-- Avant de purger p_table_purgee, écrit dans chaque table retenue qui la référence via
-- SET NULL/SET DEFAULT un instantané {id, libelle, table_origine, purge_le} par ligne
-- concernée, sous la clé = nom de la colonne FK. Trouve les arêtes dynamiquement via
-- pg_constraint (pas de mapping en dur) : une future FK SET NULL depuis une table
-- retenue est automatiquement couverte, à condition que cette table porte une colonne
-- purge_snapshot (sinon : erreur explicite plutôt qu'une perte silencieuse — garde-fou
-- contre une régression F8).
create or replace function public._snapshot_avant_purge(p_entreprise_id uuid, p_table_purgee text, p_run_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_edge record;
  v_row record;
  v_a_snapshot_colonne boolean;
  v_n integer := 0;
begin
  for v_edge in
    select chi.relname::text as table_retenue, att.attname::text as colonne_fk
    from pg_constraint con
    join pg_class chi on chi.oid = con.conrelid
    join pg_class par on par.oid = con.confrelid
    join pg_namespace nsp on nsp.oid = chi.relnamespace
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = con.conkey[1]
    where con.contype = 'f' and nsp.nspname = 'public'
      and con.confdeltype in ('n', 'd')
      and chi.relname = any(public.tables_conservees_purge())
      and par.relname = p_table_purgee
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_edge.table_retenue and column_name = 'purge_snapshot'
    ) into v_a_snapshot_colonne;
    if not v_a_snapshot_colonne then
      raise exception
        'Garde-fou F8 : % référence % (colonne %) via SET NULL/SET DEFAULT mais n''a pas '
        'de colonne purge_snapshot — ajouter la colonne avant de purger % (voir section 3 '
        'de la migration 20260729000185).', v_edge.table_retenue, p_table_purgee, v_edge.colonne_fk, p_table_purgee;
    end if;

    for v_row in
      execute format(
        'select r.id as retenue_id, r.%I as ref_id from public.%I r '
        'where r.entreprise_id = $1 and r.%I is not null',
        v_edge.colonne_fk, v_edge.table_retenue, v_edge.colonne_fk
      ) using p_entreprise_id
    loop
      execute format(
        'update public.%I set purge_snapshot = coalesce(purge_snapshot, ''{}''::jsonb) || jsonb_build_object($1, $2) where id = $3',
        v_edge.table_retenue
      ) using v_edge.colonne_fk,
              jsonb_build_object(
                'id', v_row.ref_id, 'libelle', public._libelle_ligne(p_table_purgee, v_row.ref_id),
                'table_origine', p_table_purgee, 'purge_le', now()
              ),
              v_row.retenue_id;
      v_n := v_n + 1;
    end loop;
  end loop;

  if v_n > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'snapshot', p_table_purgee, 'DELETE', v_n, true, null, null);
  end if;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. Purge d'une table (F1) — ne relance plus l'exception
-- ═══════════════════════════════════════════════════════════════════════
-- Changement de signature volontaire (integer → table) par rapport à v1 : v1 catchait
-- l'erreur, écrivait l'audit, PUIS relançait (`raise;`) — ce qui annule TOUT, y compris
-- l'INSERT d'audit, puisque PostgREST exécute chaque appel RPC dans sa propre
-- transaction et un appel qui échoue (exception non attrapée par l'appelant) fait un
-- ROLLBACK complet. C'était le constat F1 : « l'audit d'échec ne survit jamais ».
-- Corrigé en ne relançant plus l'exception : la fonction catche systématiquement,
-- consigne dans platform.purge_audit (qui, elle, committe puisque la fonction se
-- termine normalement), et retourne le résultat (succès ou échec) à l'appelant, qui
-- décide de la suite (script de purge : passe à la table suivante, s'arrête, ou retente
-- plus tard).
drop function if exists public.purger_table_entreprise(uuid, text);
create or replace function public.purger_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_supprimees integer, erreur text)
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_existe boolean;
  v_nb integer;
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

  -- F8 (instantané) + suppression, dans le MÊME bloc protégé : le garde-fou F8 (colonne
  -- purge_snapshot manquante) lève une exception volontairement bruyante pour une
  -- table conservée mal préparée — mais elle doit rester soumise au même contrat F1
  -- (jamais de raise hors de cette fonction) pour ne pas perdre, elle aussi, son audit
  -- d'échec par rollback de la transaction PostgREST appelante.
  begin
    perform public._snapshot_avant_purge(p_entreprise_id, p_table, p_run_id);
    execute format('delete from public.%I where entreprise_id = $1', p_table) using p_entreprise_id;
    get diagnostics v_nb = row_count;
    ok := true; lignes_supprimees := v_nb; erreur := null;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', v_nb, true, null, null);
  exception when others then
    ok := false; lignes_supprimees := null; erreur := sqlerrm;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, sqlerrm,
      jsonb_build_object('sqlstate', sqlstate));
  end;
  return next;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. Anonymisation au niveau entreprise (F3) — clients, employés, fournisseurs
-- ═══════════════════════════════════════════════════════════════════════
-- Variante « toute l'entreprise » de anonymiser_employe() (migration 20260719000114,
-- self-service un salarié à la fois) : appelée par la purge pour vider TOUTES les
-- lignes de la table pour l'entreprise, généralisée à clients/employes/fournisseurs.
-- La ligne reste (contrairement à purger_table_entreprise) parce qu'une FK RESTRICT/NO
-- ACTION depuis une table retenue empêche structurellement sa suppression (F3) — voir
-- tables_anonymisees_purge(). Vide dynamiquement toute colonne personnelle (même motif
-- que anonymiser_employe), y compris les colonnes *_storage_path : les fichiers Storage
-- correspondants deviennent orphelins et sont supprimés séparément par
-- verifier_storage_entreprise() + le script de purge (F7).
create or replace function public.anonymiser_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_anonymisees integer, erreur text)
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_col text;
  v_nb integer;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    ok := false; lignes_anonymisees := null;
    erreur := 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
    perform platform.consigner(p_entreprise_id, p_run_id, 'anonymiser_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  if p_table != all(public.tables_anonymisees_purge()) then
    ok := false; lignes_anonymisees := null;
    erreur := format('Table %s n''est pas une table ANONYMIZE : appel refuse', p_table);
    perform platform.consigner(p_entreprise_id, p_run_id, 'anonymiser_table', p_table, null, null, false, erreur, null);
    return next; return;
  end if;

  begin
    execute format(
      'update public.%I set nom = ''Anonymise RGPD'', updated_at = now() where entreprise_id = $1',
      p_table
    ) using p_entreprise_id;
    get diagnostics v_nb = row_count;

    -- prenom existe (employes, clients) et est NOT NULL sur employes : traité à part,
    -- toujours par une valeur littérale (ne peut pas passer par la boucle "null" ci-dessous).
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = p_table and column_name = 'prenom') then
      execute format('update public.%I set prenom = ''Anonymise'' where entreprise_id = $1', p_table) using p_entreprise_id;
    end if;

    for v_col in
      select column_name from information_schema.columns
       where table_schema = 'public' and table_name = p_table
         and is_nullable = 'YES' and column_name not in ('nom', 'prenom')
         and column_name ~* public.colonnes_personnelles_purge()
    loop
      execute format('update public.%I set %I = null where entreprise_id = $1', p_table, v_col) using p_entreprise_id;
    end loop;

    ok := true; lignes_anonymisees := v_nb; erreur := null;
    perform platform.consigner(p_entreprise_id, p_run_id, 'anonymiser_table', p_table, 'ANONYMIZE', v_nb, true, null, null);
  exception when others then
    ok := false; lignes_anonymisees := null; erreur := sqlerrm;
    perform platform.consigner(p_entreprise_id, p_run_id, 'anonymiser_table', p_table, 'ANONYMIZE', null, false, sqlerrm,
      jsonb_build_object('sqlstate', sqlstate));
  end;
  return next;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 6. Storage (F7) — inventaire → suppression → vérification, sans mapping en dur
-- ═══════════════════════════════════════════════════════════════════════
-- Liste les fichiers Storage réels de l'entreprise, tous buckets confondus (inchangé
-- par rapport à v1 : le cloisonnement entreprise_id = 1er dossier du chemin est
-- uniforme sur tous les buckets, voir docs/AUDIT_SECURITE.md §2).
create or replace function public.lister_fichiers_storage_entreprise(p_entreprise_id uuid)
returns table(bucket_id text, chemin text)
language sql security definer set search_path = public as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (storage.foldername(o.name))[1] = p_entreprise_id::text
  order by o.bucket_id, o.name;
$$;

-- Réconcilie, pour CHAQUE fichier Storage réel de l'entreprise, s'il est encore
-- référencé par une colonne *_storage_path quelque part en base — découvert
-- dynamiquement (information_schema), pas depuis une liste écrite en dur : une future
-- colonne *_storage_path est automatiquement couverte. Classe chaque fichier :
--   'ORPHELIN'   : aucune ligne ne le référence plus → sûr à supprimer physiquement.
--   'RETAIN'     : référencé par une ligne d'une table conservée (ou par une ligne
--                  restante d'une table anonymisée) → NE JAMAIS supprimer.
--   'A_PURGER'   : référencé par une ligne d'une table encore classée DELETE qui n'a
--                  pas encore été purgée (utile en dry-run ; ne devrait plus apparaître
--                  après une purge complète).
create or replace function public.verifier_storage_entreprise(p_entreprise_id uuid)
returns table(bucket_id text, chemin text, categorie text, table_referencee text)
language plpgsql security definer set search_path = public as $$
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

  -- Cas particulier : entreprises.logo_url stocke une URL publique complète
  -- (`getPublicUrl()`, src/app/actions/entreprise.ts), pas un chemin nu — ne correspond
  -- donc pas au motif `%storage_path%` ci-dessus. `entreprises` n'est pas une table
  -- purgeable (la ligne n'est jamais supprimée, seulement anonymisée), donc son logo
  -- doit toujours rester RETAIN tant que marquer_entreprise_purgee n'a pas tourné —
  -- sans ce cas particulier, le logo serait classé ORPHELIN et supprimé prématurément
  -- par le script AVANT que logo_url ne soit lui-même vidé, créant une référence morte
  -- transitoire si la purge est interrompue entre les deux étapes.
  insert into _storage_ref
  select regexp_replace(logo_url, '^.*/storage/v1/object/public/[^/]+/', ''), '__entreprise_logo__'
  from public.entreprises
  where id = p_entreprise_id and logo_url is not null and logo_url ~ '/storage/v1/object/public/';

  return query
  select
    f.bucket_id, f.chemin,
    case
      when r.table_nom is null then 'ORPHELIN'
      when r.table_nom = any(v_conservees) or r.table_nom = any(v_anonymisees) or r.table_nom = '__entreprise_logo__' then 'RETAIN'
      else 'A_PURGER'
    end as categorie,
    r.table_nom
  from public.lister_fichiers_storage_entreprise(p_entreprise_id) f
  left join _storage_ref r on r.chemin = f.chemin
  order by categorie, f.bucket_id, f.chemin;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 7. Étape finale — anonymisation de la fiche entreprise, avec garde de complétude
-- ═══════════════════════════════════════════════════════════════════════
-- v1 anonymisait la fiche entreprise sans vérifier que la purge était réellement
-- complète. v2 ajoute une garde de complétude (mission §6 : "verify") : refuse tant que
-- rapport_purge_entreprise() indique encore des lignes DELETE en attente, ou que
-- verifier_storage_entreprise() indique encore des fichiers A_PURGER (Storage pas
-- entièrement nettoyé). N'exige PAS l'absence de fichiers ORPHELIN (leur suppression
-- physique est un appel Storage API séparé, fait par l'appelant service_role — cette
-- fonction ne vérifie que l'état base de données + liste Storage).
drop function if exists public.marquer_entreprise_purgee(uuid);
create or replace function public.marquer_entreprise_purgee(p_entreprise_id uuid, p_run_id uuid default gen_random_uuid())
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_reste_delete integer;
  v_reste_storage integer;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    raise exception 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
  end if;

  select count(*) into v_reste_delete
    from public.rapport_purge_entreprise(p_entreprise_id) where categorie = 'DELETE';
  if v_reste_delete > 0 then
    raise exception 'Purge incomplete : % table(s) DELETE ont encore des lignes — marquage refuse', v_reste_delete;
  end if;

  select count(*) into v_reste_storage
    from public.verifier_storage_entreprise(p_entreprise_id) where categorie = 'A_PURGER';
  if v_reste_storage > 0 then
    raise exception 'Purge incomplete : % fichier(s) Storage encore rattaches a des lignes DELETE — marquage refuse', v_reste_storage;
  end if;

  update public.entreprises
     set nom = 'Entreprise supprimee', raison_sociale = null, siret = null, adresse = null,
         code_postal = null, ville = null, logo_url = null, texte_entete = null,
         texte_pied_page = null, assurance_decennale_numero = null,
         assurance_decennale_assureur = null, assurance_rc_pro_numero = null,
         purgee_at = now(), updated_at = now()
   where id = p_entreprise_id;

  perform platform.consigner(p_entreprise_id, p_run_id, 'marquer_purgee', '__entreprise__', null, null, true, null, null);
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- 8. Lecture de l'audit (F4) — pour le script/l'UI d'opération, service_role uniquement
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.lire_audit_purge_entreprise(p_entreprise_id uuid, p_run_id uuid default null)
returns table(run_id uuid, etape text, table_nom text, categorie text, lignes_affectees integer, ok boolean, erreur text, detail jsonb, created_at timestamptz)
language sql security definer set search_path = public as $$
  select a.run_id, a.etape, a.table_nom, a.categorie, a.lignes_affectees, a.ok, a.erreur, a.detail, a.created_at
  from platform.purge_audit a
  where a.entreprise_id = p_entreprise_id and (p_run_id is null or a.run_id = p_run_id)
  order by a.created_at;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- 9. Droits d'exécution — service_role uniquement, comme v1
-- ═══════════════════════════════════════════════════════════════════════
revoke all on function public.rapport_purge_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.purger_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.anonymiser_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._snapshot_avant_purge(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public._libelle_ligne(text, uuid) from public, anon, authenticated;
revoke all on function public.lister_fichiers_storage_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.verifier_storage_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.marquer_entreprise_purgee(uuid, uuid) from public, anon, authenticated;
revoke all on function public.lire_audit_purge_entreprise(uuid, uuid) from public, anon, authenticated;

grant execute on function public.rapport_purge_entreprise(uuid) to service_role;
grant execute on function public.purger_table_entreprise(uuid, text, uuid) to service_role;
grant execute on function public.anonymiser_table_entreprise(uuid, text, uuid) to service_role;
grant execute on function public._snapshot_avant_purge(uuid, text, uuid) to service_role;
grant execute on function public._libelle_ligne(text, uuid) to service_role;
grant execute on function public.lister_fichiers_storage_entreprise(uuid) to service_role;
grant execute on function public.verifier_storage_entreprise(uuid) to service_role;
grant execute on function public.marquer_entreprise_purgee(uuid, uuid) to service_role;
grant execute on function public.lire_audit_purge_entreprise(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
