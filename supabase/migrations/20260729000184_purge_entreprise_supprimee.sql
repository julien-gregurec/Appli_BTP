-- Purge effective des comptes en suppression RGPD (art. 17), après le délai de 30 jours
-- (CGV art. 10 réversibilité). Comble un P0 identifié en qualification RGPD (voir
-- docs/qualification/ELSATIA_RGPD_DATA_LIFECYCLE_CLOSURE_V3.md) :
-- `demander_suppression_entreprise()` (migration 20260719000114) programme une date de
-- purge (`suppression_prevue_at`), mais AUCUNE fonction n'exécutait la purge derrière —
-- la promesse « passé ce délai, vos données sont supprimées » (page /parametres/donnees)
-- n'était donc jamais tenue techniquement.
--
-- Conception volontairement défensive, conforme aux garde-fous de la mission de
-- qualification (corriger uniquement les défauts techniques certains ; conserver par
-- défaut en cas de doute juridique) :
--
--  1. Ne supprime JAMAIS la ligne `entreprises` elle-même. Quasi toutes les tables
--     métier référencent `entreprise_id ... references entreprises(id) on delete
--     cascade` (factures, paiements, bulletins_paie compris) : un DELETE sur
--     `entreprises` cascaderait et détruirait AUSSI les données dont la loi impose la
--     conservation (~10 ans). La ligne entreprise est anonymisée et marquée
--     `purgee_at`, jamais supprimée.
--  2. Conserve par défaut les tables comptables/paie/bancaires — liste dans
--     `tables_conservees_purge()` ci-dessous, miroir SQL de TABLES_CONSERVEES_PURGE
--     (src/lib/rgpd.ts, à garder synchronisé). ⚠️ Cette liste est une PROPOSITION
--     technique ; son exhaustivité et sa durée de conservation exacte restent
--     LEGAL_DECISION_REQUIRED — à confirmer par Julien avant toute purge réelle.
--  3. Purge TABLE PAR TABLE : chaque appel à `purger_table_entreprise` est sa propre
--     transaction (RPC = une transaction), donc individuellement journalisé et
--     rejouable. Une interruption entre deux appels ne laisse jamais un état ambigu :
--     il reste seulement des tables « pas encore purgées », visibles dans
--     `purge_entreprises_progres` (mission de qualification, §11 rejeu/panne).
--  4. `service_role` uniquement (jamais self-service) — conforme à
--     PROMPT_CODEX_RGPD.md : « la purge effective reste une opération supervisée par
--     la plateforme ».
--
-- ⚠️ Fonctions destructrices et irréversibles. NON EXÉCUTÉES dans cette qualification :
-- aucun environnement Supabase local n'était disponible dans le conteneur de
-- qualification (Docker présent mais sans daemon accessible). À valider avec
-- `supabase test db` (voir supabase/tests/purge_entreprise_supprimee.test.sql) avant
-- toute purge en production (REMOTE_ACTION_REQUIRED).

alter table public.entreprises
  add column if not exists purgee_at timestamptz;

create table if not exists public.purge_entreprises_progres (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null,
  table_purgee text not null,
  lignes_supprimees integer,
  erreur text,
  termine_at timestamptz,
  created_at timestamptz not null default now(),
  unique (entreprise_id, table_purgee)
);
comment on table public.purge_entreprises_progres is
  'Suivi de la purge RGPD (art. 17) table par table. Volontairement SANS foreign key '
  'vers entreprises (on delete cascade la supprimerait) : la piste d''audit de la purge '
  'doit survivre à la purge elle-même (mission de qualification RGPD, §9).';

revoke all on public.purge_entreprises_progres from public, anon, authenticated;
alter table public.purge_entreprises_progres enable row level security;
-- Aucune policy : la table n'est accessible que via service_role (qui contourne la RLS),
-- jamais depuis un client authentifié classique.

-- Miroir SQL de TABLES_CONSERVEES_PURGE (src/lib/rgpd.ts) — garder synchronisé.
create or replace function public.tables_conservees_purge()
returns text[]
language sql immutable
as $$
  select array[
    'factures', 'lignes_factures', 'paiements', 'coordonnees_bancaires',
    'bulletins_paie', 'connexions_bancaires', 'lots_virements',
    'ordres_virements', 'journal_paiements_bancaires', 'journal_activite'
  ];
$$;

-- Rapport de simulation (lecture seule, non destructif) : pour une entreprise donnée,
-- liste les tables entreprise_id qui seraient purgées (DELETE) ou conservées (RETAIN),
-- avec le nombre de lignes concernées. À exécuter et faire relire AVANT toute purge.
create or replace function public.rapport_purge_entreprise(p_entreprise_id uuid)
returns table(table_nom text, categorie text, nb_lignes bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_conservees text[] := public.tables_conservees_purge();
  v_count bigint;
begin
  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'entreprise_id'
      and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    execute format('select count(*) from public.%I where entreprise_id = $1', v_table)
      into v_count using p_entreprise_id;
    if v_count > 0 then
      table_nom := v_table;
      categorie := case when v_table = any(v_conservees) then 'RETAIN' else 'DELETE' end;
      nb_lignes := v_count;
      return next;
    end if;
  end loop;
end; $$;

-- Purge UNE table pour une entreprise donnée. Refuse toute table conservée ou inconnue
-- (liste blanche dynamique contre l'injection de nom de table). Journalise le résultat
-- (succès avec compte de lignes, ou erreur) dans purge_entreprises_progres, y compris en
-- cas d'échec, pour rester rejouable sans état ambigu.
create or replace function public.purger_table_entreprise(p_entreprise_id uuid, p_table text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_conservees text[] := public.tables_conservees_purge();
  v_existe boolean;
  v_prevue timestamptz;
  v_nb integer;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    raise exception 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
  end if;

  if p_table = any(v_conservees) then
    raise exception 'Table % conservee pour raison legale : purge refusee', p_table;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table and column_name = 'entreprise_id'
  ) into v_existe;
  if not v_existe then
    raise exception 'Table % inconnue ou sans colonne entreprise_id : purge refusee', p_table;
  end if;

  execute format('delete from public.%I where entreprise_id = $1', p_table) using p_entreprise_id;
  get diagnostics v_nb = row_count;

  insert into public.purge_entreprises_progres(entreprise_id, table_purgee, lignes_supprimees, termine_at)
  values (p_entreprise_id, p_table, v_nb, now())
  on conflict (entreprise_id, table_purgee)
  do update set lignes_supprimees = excluded.lignes_supprimees, termine_at = now(), erreur = null;

  return v_nb;
exception when others then
  insert into public.purge_entreprises_progres(entreprise_id, table_purgee, erreur, termine_at)
  values (p_entreprise_id, p_table, sqlerrm, null)
  on conflict (entreprise_id, table_purgee)
  do update set erreur = excluded.erreur, termine_at = null;
  raise;
end; $$;

-- Liste les fichiers Storage de l'entreprise, tous buckets confondus : le cloisonnement
-- entreprise_id = 1er dossier du chemin est uniforme sur tous les buckets (voir
-- docs/AUDIT_SECURITE.md §2). Lecture seule : la suppression physique des objets doit
-- être faite via l'API Storage (`.storage.from(bucket).remove([...])`) par l'appelant
-- (script service_role), comme le fait déjà le reste du code applicatif (voir
-- src/app/actions/employes.ts) — un DELETE SQL direct sur storage.objects ne garantit
-- pas la suppression physique côté backend de stockage.
create or replace function public.lister_fichiers_storage_entreprise(p_entreprise_id uuid)
returns table(bucket_id text, chemin text)
language sql security definer set search_path = public as $$
  select o.bucket_id, o.name
  from storage.objects o
  where (storage.foldername(o.name))[1] = p_entreprise_id::text
  order by o.bucket_id, o.name;
$$;

-- Anonymise la fiche entreprise elle-même (dernière étape, une fois toutes les tables
-- éligibles purgées et les fichiers Storage supprimés côté appelant). Ne supprime pas la
-- ligne (voir point 1 ci-dessus).
create or replace function public.marquer_entreprise_purgee(p_entreprise_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_prevue timestamptz;
begin
  select suppression_prevue_at into v_prevue from public.entreprises where id = p_entreprise_id;
  if v_prevue is null or v_prevue > now() then
    raise exception 'Purge non autorisee : aucune suppression programmee echue pour cette entreprise';
  end if;

  update public.entreprises
     set nom = 'Entreprise supprimee', raison_sociale = null, siret = null, adresse = null,
         code_postal = null, ville = null, logo_url = null, texte_entete = null,
         texte_pied_page = null, assurance_decennale_numero = null,
         assurance_decennale_assureur = null, assurance_rc_pro_numero = null,
         purgee_at = now(), updated_at = now()
   where id = p_entreprise_id;

  insert into public.purge_entreprises_progres(entreprise_id, table_purgee, termine_at)
  values (p_entreprise_id, '__entreprise_anonymisee__', now())
  on conflict (entreprise_id, table_purgee) do update set termine_at = now(), erreur = null;
end; $$;

revoke all on function public.rapport_purge_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.purger_table_entreprise(uuid, text) from public, anon, authenticated;
revoke all on function public.lister_fichiers_storage_entreprise(uuid) from public, anon, authenticated;
revoke all on function public.marquer_entreprise_purgee(uuid) from public, anon, authenticated;
grant execute on function public.rapport_purge_entreprise(uuid) to service_role;
grant execute on function public.purger_table_entreprise(uuid, text) to service_role;
grant execute on function public.lister_fichiers_storage_entreprise(uuid) to service_role;
grant execute on function public.marquer_entreprise_purgee(uuid) to service_role;

notify pgrst, 'reload schema';
