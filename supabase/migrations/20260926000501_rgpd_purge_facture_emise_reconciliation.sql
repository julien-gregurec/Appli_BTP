-- RGPD × immutabilité des factures émises — réconciliation V1.
-- Rapport : docs/qualification/ELSATIA_RGPD_INVOICE_IMMUTABILITY_RECONCILIATION_V1.md
--
-- Problème (train canonique V1, §6, DECISION_REQUIRED:RGPD-PURGE-VS-FACTURE-EMISE) :
-- la purge RGPD V2 (20260923000331) supprime `chantiers` et `devis`. Les FK
-- `factures.chantier_id` / `factures.devis_origine_id` sont ON DELETE SET NULL,
-- et `_snapshot_avant_purge` écrit `factures.purge_snapshot` juste avant. Le verrou
-- `verrouiller_facture_emise` (20260822000222, dernière version 20260922000307)
-- refuse ces deux écritures sur une facture émise : `purger_table_entreprise`
-- renvoie ok=false et la purge d'une entreprise qui a émis une facture ne peut
-- jamais aboutir.
--
-- Constat qui rend l'arbitrage technique, et non juridique : AUCUN rendu du document
-- facture (PDF, impression, lien public, e-mail, export comptable) ne lit `chantiers`
-- ni `devis` (inventaire du rapport §3). `chantier_id` et `devis_origine_id` sont des
-- clés de navigation internes, pas des mentions de la facture. Les délier ne change
-- ni le document, ni ses montants, ni sa TVA, ni ses paiements — À CONDITION que la
-- purge ne puisse rien changer d'autre. Cette migration impose cette condition en
-- base au lieu de la supposer :
--
--  R1  Autorisation de purge non falsifiable. `purger_table_entreprise` (service_role
--      uniquement, échéance contrôlée) dépose une autorisation dans
--      `platform.purge_autorisations_facture`, liée à la transaction courante
--      (`txid_current()`), à l'entreprise et à la table purgée, et la retire avant de
--      rendre la main. Aucun rôle applicatif (anon, authenticated, service_role) n'a
--      de droit sur cette table ni sur le schéma pour anon/authenticated : l'exception
--      est inatteignable depuis les flux ordinaires. Pas de paramètre de session
--      (GUC) : `set_config()` est exécutable par tout rôle, un drapeau de session
--      serait falsifiable.
--  R2  Exception minimale dans `verrouiller_facture_emise`. Avec l'autorisation de la
--      transaction et de l'entreprise de la facture, et seulement elle, une facture
--      émise accepte : `chantier_id` → NULL pendant la purge de `chantiers` si le
--      chantier n'existe plus et que sa référence est déjà consignée dans
--      `purge_snapshot` ; idem pour `devis_origine_id` pendant la purge de `devis` ;
--      et un `purge_snapshot` qui ne fait qu'ajouter des clés. Toute autre colonne
--      reste verrouillée, la suppression reste interdite, le retour en brouillon aussi.
--  R3  Garde-fou comptable. Avant et après CHAQUE étape de suppression, la purge
--      calcule l'empreinte du contenu comptable de toutes les factures de l'entreprise
--      (tout sauf les deux clés de navigation et `purge_snapshot`, plus leurs lignes et
--      paiements). Une différence annule l'étape (ok=false, audité) : aucun effet de
--      bord (trigger, cascade) d'une table purgée ne peut modifier une facture, même
--      sur un champ que le verrou laisse libre (statut, montant payé). L'empreinte est
--      consignée dans `platform.purge_audit`.
--  R4  Identité émettrice figée en base. `factures.entreprise_snapshot` n'était écrit
--      que par `changerStatutFactureAction` (TypeScript) : une facture émise par un
--      autre chemin, ou avant 20260812000200, n'en avait pas et s'affichait avec
--      l'identité vivante de l'entreprise — donc « Entreprise supprimee » après
--      `marquer_entreprise_purgee`. Capture par trigger à l'émission (même règle que
--      les devis, 20260922000308), reprise des factures émises sans snapshot
--      (provenance marquée), et contrôle de dernier recours avant anonymisation.
--  R5  Même contrôle de dernier recours pour `client_snapshot` avant l'anonymisation
--      des clients (le trigger et la reprise de 20260908000272 couvrent déjà le cas
--      général).
--  R6  `factures_devis_origine_entreprise_fkey` (composite, NO ACTION) devient
--      ON DELETE SET NULL (devis_origine_id), comme sa jumelle chantier : même
--      comportement que la FK simple sur la même colonne, et l'invariant F3 de la
--      purge (supabase/tests/purge_entreprise_supprimee.test.sql) redevient vrai.
--  R7  Le logo référencé par l'identité figée d'une facture conservée n'est plus
--      classé ORPHELIN par `verifier_storage_entreprise` (sinon le script de purge
--      le supprime et l'en-tête de la facture perd son logo).
--  R8  TRUNCATE refusé sur `factures`, `lignes_factures`, `paiements` : TRUNCATE ne
--      déclenche pas les triggers de ligne, c'était la seule écriture qui contournait
--      le verrou (service_role garde TRUNCATE après 20260902000255).
--
-- Hors périmètre, non décidé ici (rapport §10) : durée de conservation des factures,
-- sort des données de contact dans `client_snapshot`, conservation des devis signés
-- comme preuve contractuelle, classement de `remises_banque`.

-- ═══════════════════════════════════════════════════════════════════════
-- R6. FK composite devis alignée sur sa jumelle chantier
-- ═══════════════════════════════════════════════════════════════════════
alter table public.factures drop constraint if exists factures_devis_origine_entreprise_fkey;
alter table public.factures
  add constraint factures_devis_origine_entreprise_fkey
  foreign key (devis_origine_id, entreprise_id) references public.devis(id, entreprise_id)
  on delete set null (devis_origine_id) not valid;
alter table public.factures validate constraint factures_devis_origine_entreprise_fkey;

-- ═══════════════════════════════════════════════════════════════════════
-- R1. Autorisation de purge, liée à la transaction
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.purge_autorisations_facture (
  txid bigint not null,
  entreprise_id uuid not null,
  table_purgee text not null,
  run_id uuid,
  created_at timestamptz not null default now(),
  primary key (txid, entreprise_id, table_purgee)
);
comment on table platform.purge_autorisations_facture is
  'Autorisation éphémère de délier une facture émise pendant une purge RGPD. Écrite et '
  'effacée par purger_table_entreprise() dans la même transaction ; lue par '
  'verrouiller_facture_emise(). Aucun rôle applicatif n''y a accès : l''exception du '
  'verrou est inatteignable hors de la fonction de purge.';
alter table platform.purge_autorisations_facture enable row level security;
revoke all on table platform.purge_autorisations_facture from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R3. Empreinte du contenu comptable d'une facture
-- ═══════════════════════════════════════════════════════════════════════
-- Tout le contenu de la facture sauf les deux clés de navigation que la purge a le
-- droit de délier et la trace de purge elle-même, plus ses lignes et ses paiements.
-- Déterministe (jsonb canonique, tri explicite, horodatages rendus en UTC quel que soit
-- le fuseau de la session) : identique après une restauration.
create or replace function public.empreinte_comptable_facture(p_facture_id uuid)
returns text
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  select md5(
    (to_jsonb(f) - 'chantier_id' - 'devis_origine_id' - 'purge_snapshot')::text
    || coalesce((
         select jsonb_agg(to_jsonb(l) order by l.ordre, l.id)::text
         from public.lignes_factures l where l.facture_id = f.id), '[]')
    || coalesce((
         select jsonb_agg(to_jsonb(p) order by p.date, p.id)::text
         from public.paiements p where p.facture_id = f.id), '[]')
  )
  from public.factures f
  where f.id = p_facture_id
$$;

-- Même formule que empreinte_comptable_facture(), en une requête ensembliste (appelée
-- avant et après chaque étape de purge : doit rester rapide sur un gros tenant).
create or replace function public.empreinte_comptable_factures_entreprise(p_entreprise_id uuid)
returns table(nb_factures integer, empreinte text)
language sql stable security definer set search_path = public set timezone = 'UTC' as $$
  with fe as (
    select f.* from public.factures f where f.entreprise_id = p_entreprise_id
  ), l as (
    select l.facture_id, jsonb_agg(to_jsonb(l) order by l.ordre, l.id)::text as t
    from public.lignes_factures l join fe on fe.id = l.facture_id
    group by l.facture_id
  ), p as (
    select p.facture_id, jsonb_agg(to_jsonb(p) order by p.date, p.id)::text as t
    from public.paiements p join fe on fe.id = p.facture_id
    group by p.facture_id
  )
  select count(*)::integer,
         md5(coalesce(string_agg(
           fe.id::text || ':' || md5(
             (to_jsonb(fe) - 'chantier_id' - 'devis_origine_id' - 'purge_snapshot')::text
             || coalesce(l.t, '[]') || coalesce(p.t, '[]')),
           ',' order by fe.id), ''))
  from fe
  left join l on l.facture_id = fe.id
  left join p on p.facture_id = fe.id
$$;

revoke all on function public.empreinte_comptable_facture(uuid) from public, anon, authenticated;
revoke all on function public.empreinte_comptable_factures_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.empreinte_comptable_facture(uuid) to service_role;
grant execute on function public.empreinte_comptable_factures_entreprise(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R2. Verrou des factures émises, avec l'exception de purge
-- ═══════════════════════════════════════════════════════════════════════
-- Corps identique à 20260922000307 hors du bloc « purge RGPD » : mêmes champs libres,
-- mêmes messages, même traitement des snapshots encore vides.
create or replace function public.verrouiller_facture_emise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_champs_libres text[] := array[
    'statut', 'montant_paye', 'notes_internes', 'email_envoye_le', 'email_envoye_a',
    'stripe_checkout_id', 'stripe_checkout_url', 'stripe_payment_intent_id',
    'stripe_payment_status', 'lien_paiement_expire_at', 'updated_at',
    'relance_auto_exclue'
  ];
  v_champ text;
  v_snapshot text;
  v_purge_tables text[];
  v_purge_ok boolean;
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut plus être supprimée.';
    end if;
    return old;
  end if;

  if old.statut <> 'brouillon' then
    if new.statut = 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut pas redevenir brouillon.';
    end if;

    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_champ in array v_champs_libres loop
      v_old := v_old - v_champ;
      v_new := v_new - v_champ;
    end loop;
    foreach v_snapshot in array array['entreprise_snapshot', 'client_snapshot', 'client_snapshot_at'] loop
      if (v_old ? v_snapshot) and (v_old ->> v_snapshot) is null then
        v_old := v_old - v_snapshot;
        v_new := v_new - v_snapshot;
      end if;
    end loop;

    if v_old is distinct from v_new then
      -- Purge RGPD : autorisation déposée par purger_table_entreprise() dans CETTE
      -- transaction, pour CETTE entreprise. Inatteignable autrement (R1). Chaque
      -- condition est un booléen strict (coalesce) : un NULL ne vaut jamais accord.
      select array_agg(a.table_purgee) into v_purge_tables
      from platform.purge_autorisations_facture a
      where a.txid = txid_current() and a.entreprise_id = old.entreprise_id;

      v_purge_ok := coalesce(
        v_purge_tables is not null
        -- Rien d'autre que les deux clés de navigation et la trace de purge.
        and (v_old - 'chantier_id' - 'devis_origine_id' - 'purge_snapshot')
            = (v_new - 'chantier_id' - 'devis_origine_id' - 'purge_snapshot'),
        false);

      -- chantier_id : seulement vers NULL, pendant la purge de chantiers, chantier
      -- réellement supprimé et référence déjà consignée dans purge_snapshot.
      if v_purge_ok and new.chantier_id is distinct from old.chantier_id then
        v_purge_ok := coalesce(
          new.chantier_id is null
          and 'chantiers' = any(v_purge_tables)
          and not exists (select 1 from public.chantiers c where c.id = old.chantier_id)
          and old.purge_snapshot -> 'chantier_id' ->> 'id' = old.chantier_id::text,
          false);
      end if;

      -- devis_origine_id : même règle pendant la purge de devis.
      if v_purge_ok and new.devis_origine_id is distinct from old.devis_origine_id then
        v_purge_ok := coalesce(
          new.devis_origine_id is null
          and 'devis' = any(v_purge_tables)
          and not exists (select 1 from public.devis d where d.id = old.devis_origine_id)
          and old.purge_snapshot -> 'devis_origine_id' ->> 'id' = old.devis_origine_id::text,
          false);
      end if;

      -- purge_snapshot : ajout de clés uniquement, aucune clé existante réécrite.
      if v_purge_ok and new.purge_snapshot is distinct from old.purge_snapshot then
        v_purge_ok := coalesce(
          jsonb_typeof(new.purge_snapshot) = 'object'
          and coalesce(jsonb_typeof(old.purge_snapshot), 'object') = 'object'
          and not exists (
            select 1 from jsonb_each(coalesce(old.purge_snapshot, '{}'::jsonb)) o
            where (new.purge_snapshot -> o.key) is distinct from o.value),
          false);
      end if;

      if not v_purge_ok then
        raise exception 'Cette facture a déjà été émise et ne peut plus être modifiée.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════
-- R8. TRUNCATE refusé sur le contenu comptable
-- ═══════════════════════════════════════════════════════════════════════
create or replace function public.refuser_truncate_facturation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'TRUNCATE interdit sur % : les factures émises, leurs lignes et leurs paiements sont conservés.', tg_table_name;
end;
$$;

drop trigger if exists refuser_truncate_factures on public.factures;
create trigger refuser_truncate_factures
  before truncate on public.factures
  for each statement execute function public.refuser_truncate_facturation();
drop trigger if exists refuser_truncate_lignes_factures on public.lignes_factures;
create trigger refuser_truncate_lignes_factures
  before truncate on public.lignes_factures
  for each statement execute function public.refuser_truncate_facturation();
drop trigger if exists refuser_truncate_paiements on public.paiements;
create trigger refuser_truncate_paiements
  before truncate on public.paiements
  for each statement execute function public.refuser_truncate_facturation();

-- ═══════════════════════════════════════════════════════════════════════
-- R4. Identité émettrice figée à l'émission, en base
-- ═══════════════════════════════════════════════════════════════════════
-- Même règle que capturer_entreprise_snapshot_devis (20260922000308). Un snapshot
-- fourni par l'appelant (changerStatutFactureAction) est respecté : c'est la même
-- projection (ENTETE_ENTREPRISE_COLONNES = construire_entreprise_snapshot).
create or replace function public.capturer_entreprise_snapshot_facture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'brouillon' or new.entreprise_snapshot is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    -- Seulement à l'émission : une facture déjà émise sans snapshot relève de la
    -- reprise ci-dessous (provenance marquée), pas d'une capture silencieuse.
    if old.statut <> 'brouillon' then
      return new;
    end if;
  end if;
  new.entreprise_snapshot := public.construire_entreprise_snapshot(new.entreprise_id);
  return new;
end;
$$;

-- Préfixe capturer_ : s'exécute avant verrou_facture_emise (ordre alphabétique).
drop trigger if exists capturer_entreprise_snapshot_factures on public.factures;
create trigger capturer_entreprise_snapshot_factures
  before insert or update on public.factures
  for each row execute function public.capturer_entreprise_snapshot_facture();

-- Reprise des factures émises sans identité figée : identité ACTUELLE de l'entreprise,
-- marquée comme reconstituée (même convention que la reprise client_snapshot de
-- 20260908000272). Le verrou accepte un snapshot encore vide qui se remplit.
create or replace function public._reprendre_entreprise_snapshot_factures(p_entreprise_id uuid, p_provenance text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.factures f
     set entreprise_snapshot = public.construire_entreprise_snapshot(f.entreprise_id)
           || jsonb_build_object('provenance', p_provenance, 'identite_incertaine', true)
   where f.statut <> 'brouillon'
     and f.entreprise_snapshot is null
     and (p_entreprise_id is null or f.entreprise_id = p_entreprise_id)
     -- Une entreprise déjà purgée n'a plus que son identité anonymisée : la figer
     -- la ferait passer pour l'identité d'émission.
     and exists (select 1 from public.entreprises e where e.id = f.entreprise_id and e.purgee_at is null)
     and public.construire_entreprise_snapshot(f.entreprise_id) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public._reprendre_entreprise_snapshot_factures(uuid, text) from public, anon, authenticated, service_role;

select public._reprendre_entreprise_snapshot_factures(null, 'backfill_identite_actuelle');

-- R5 : même reprise de dernier recours pour client_snapshot, appelée avant
-- l'anonymisation des clients. Ne réécrit jamais un snapshot existant.
create or replace function public._reprendre_client_snapshot_factures(p_entreprise_id uuid, p_provenance text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  update public.factures f
     set client_snapshot = public.construire_client_snapshot(f.client_id, f.entreprise_id, p_provenance)
           || jsonb_build_object('identite_incertaine', true),
         client_snapshot_at = now()
   where f.statut <> 'brouillon'
     and f.client_snapshot is null
     and f.entreprise_id = p_entreprise_id
     and public.construire_client_snapshot(f.client_id, f.entreprise_id) is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public._reprendre_client_snapshot_factures(uuid, text) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- R1 + R3. purger_table_entreprise — autorisation et garde-fou comptable
-- ═══════════════════════════════════════════════════════════════════════
-- Identique à 20260923000331 (contrat F1 : jamais d'exception vers l'appelant) hors
-- des lignes marquées R1/R3.
create or replace function public.purger_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_supprimees integer, erreur text)
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_existe boolean;
  v_nb integer;
  v_avant record;
  v_apres record;
  v_detail jsonb;
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

  begin
    -- R1 : autorisation liée à cette transaction, à cette entreprise, à cette table.
    -- Effacée plus bas ; en cas d'erreur, l'annulation du bloc l'efface aussi.
    insert into platform.purge_autorisations_facture (txid, entreprise_id, table_purgee, run_id)
    values (txid_current(), p_entreprise_id, p_table, p_run_id)
    on conflict (txid, entreprise_id, table_purgee) do nothing;

    -- R3 : empreinte du contenu comptable avant l'étape.
    select * into v_avant from public.empreinte_comptable_factures_entreprise(p_entreprise_id);

    perform public._snapshot_avant_purge(p_entreprise_id, p_table, p_run_id);
    execute format('delete from public.%I where entreprise_id = $1', p_table) using p_entreprise_id;
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

    ok := true; lignes_supprimees := v_nb; erreur := null;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', v_nb, true, null, v_detail);
  exception when others then
    ok := false; lignes_supprimees := null; erreur := sqlerrm;
    perform platform.consigner(p_entreprise_id, p_run_id, 'purge_table', p_table, 'DELETE', null, false, sqlerrm,
      jsonb_build_object('sqlstate', sqlstate));
  end;
  return next;
end; $$;

-- ═══════════════════════════════════════════════════════════════════════
-- R5. anonymiser_table_entreprise — identité client figée avant anonymisation
-- ═══════════════════════════════════════════════════════════════════════
-- Identique à 20260923000331 hors des lignes marquées R5.
create or replace function public.anonymiser_table_entreprise(p_entreprise_id uuid, p_table text, p_run_id uuid default gen_random_uuid())
returns table(ok boolean, lignes_anonymisees integer, erreur text)
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_col text;
  v_nb integer;
  v_repris integer;
  v_sans_snapshot integer;
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
    -- R5 : une facture émise ne doit jamais dépendre de la fiche client anonymisée.
    if p_table = 'clients' then
      v_repris := public._reprendre_client_snapshot_factures(p_entreprise_id, 'reprise_avant_anonymisation_rgpd');
      if v_repris > 0 then
        perform platform.consigner(p_entreprise_id, p_run_id, 'reprise_client_snapshot', 'factures', 'RETAIN', v_repris, true, null, null);
      end if;
      select count(*) into v_sans_snapshot
        from public.factures f
       where f.entreprise_id = p_entreprise_id and f.statut <> 'brouillon' and f.client_snapshot is null;
      if v_sans_snapshot > 0 then
        raise exception 'Garde-fou comptable : % facture(s) émise(s) sans identité client figée — anonymisation refusée', v_sans_snapshot;
      end if;
    end if;

    execute format(
      'update public.%I set nom = ''Anonymise RGPD'', updated_at = now() where entreprise_id = $1',
      p_table
    ) using p_entreprise_id;
    get diagnostics v_nb = row_count;

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
-- R4. marquer_entreprise_purgee — identité émettrice figée avant anonymisation
-- ═══════════════════════════════════════════════════════════════════════
-- Identique à 20260923000331 hors des lignes marquées R4.
create or replace function public.marquer_entreprise_purgee(p_entreprise_id uuid, p_run_id uuid default gen_random_uuid())
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_prevue timestamptz;
  v_reste_delete integer;
  v_reste_storage integer;
  v_repris integer;
  v_sans_snapshot integer;
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

  -- R4 : aucune facture émise ne doit dépendre de la fiche entreprise anonymisée.
  v_repris := public._reprendre_entreprise_snapshot_factures(p_entreprise_id, 'reprise_avant_purge_rgpd');
  if v_repris > 0 then
    perform platform.consigner(p_entreprise_id, p_run_id, 'reprise_entreprise_snapshot', 'factures', 'RETAIN', v_repris, true, null, null);
  end if;
  select count(*) into v_sans_snapshot
    from public.factures f
   where f.entreprise_id = p_entreprise_id and f.statut <> 'brouillon' and f.entreprise_snapshot is null;
  if v_sans_snapshot > 0 then
    raise exception 'Garde-fou comptable : % facture(s) émise(s) sans identité émettrice figée — marquage refuse', v_sans_snapshot;
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
-- R7. verifier_storage_entreprise — logo des factures conservées
-- ═══════════════════════════════════════════════════════════════════════
-- Identique à 20260923000331 hors du bloc marqué R7.
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
-- Droits — inchangés pour les fonctions redéfinies (create or replace conserve les
-- ACL), réaffirmés ici par ceinture-bretelles.
-- ═══════════════════════════════════════════════════════════════════════
revoke all on function public.purger_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.anonymiser_table_entreprise(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.marquer_entreprise_purgee(uuid, uuid) from public, anon, authenticated;
revoke all on function public.verifier_storage_entreprise(uuid) from public, anon, authenticated;
grant execute on function public.purger_table_entreprise(uuid, text, uuid) to service_role;
grant execute on function public.anonymiser_table_entreprise(uuid, text, uuid) to service_role;
grant execute on function public.marquer_entreprise_purgee(uuid, uuid) to service_role;
grant execute on function public.verifier_storage_entreprise(uuid) to service_role;

revoke all on function public.capturer_entreprise_snapshot_facture() from public, anon, authenticated;
revoke all on function public.refuser_truncate_facturation() from public, anon, authenticated;

notify pgrst, 'reload schema';
