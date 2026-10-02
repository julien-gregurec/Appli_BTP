-- ELSATIA-LEGAL-CONSENT-COMMERCIALIZATION-PACK-V1 — preuve d'acceptation des CGU / CGV / DPA.
--
-- Rapport : docs/qualification/ELSATIA_LEGAL_CONSENT_COMMERCIALIZATION_PACK_V1.md (§3).
--
-- Ce que la migration pose :
--   1. platform.documents_legaux_versions : catalogue immuable des versions publiées
--      (code, version, empreinte SHA-256 du fichier docs/juridique, date d'effet, portée,
--      exigence de ré-acceptation). Seed : versions en vigueur au 02/10/2026, identiques
--      au registre applicatif src/lib/documents-legaux-versions.ts (test vitest).
--   2. platform.acceptations_documents_legaux : journal APPEND-ONLY des acceptations
--      (utilisateur, entreprise, document, version, empreinte, contexte, horodatage
--      serveur). Aucune adresse IP ni user-agent : non justifiés à ce stade (décision
--      propriétaire / avocat, voir rapport §3.4).
--   3. RPC `authenticated` uniquement :
--        accepter_documents_legaux(entreprise, contexte, documents)
--        documents_legaux_a_accepter(entreprise)
--        creer_entreprise_avec_acceptation(...)  — création + preuve, atomiques
--        acceptations_documents_legaux_entreprise(entreprise) — lecture par l'admin
--
-- Choix structurants :
--   * schéma `platform` : hors de portée des grants `authenticated` ET du balayage
--     dynamique `entreprise_id` de la purge RGPD (public.*). La preuve est donc conservée
--     par défaut (fail-closed, comme les autres preuves) tant qu'aucune durée n'est
--     décidée — aucune durée arbitraire n'est posée ici ;
--   * pas de clé étrangère vers auth.users ni public.entreprises : la suppression d'un
--     compte ou la purge d'une entreprise ne doit pas effacer la preuve par cascade ;
--   * l'horodatage est celui du serveur (clock_timestamp()), jamais une valeur client ;
--   * la version et l'empreinte acceptées doivent être EXACTEMENT celles en vigueur :
--     une acceptation d'un texte périmé ou altéré est refusée.

create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;
grant usage on schema platform to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Catalogue des versions
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.documents_legaux_versions (
  code text not null check (code in ('cgu', 'cgv', 'dpa')),
  version text not null check (version ~ '^[0-9A-Za-z.\-]{1,32}$'),
  empreinte_sha256 text not null check (empreinte_sha256 ~ '^[0-9a-f]{64}$'),
  fichier text not null check (fichier ~ '^[a-z0-9\-]+\.md$'),
  portee text not null check (portee in ('utilisateur', 'entreprise')),
  en_vigueur_depuis timestamptz not null,
  -- true : toute acceptation d'une version antérieure cesse de valoir pour ce document.
  -- La première version d'un document l'est toujours (rien d'antérieur ne vaut).
  reacceptation_requise boolean not null default true,
  cree_le timestamptz not null default clock_timestamp(),
  primary key (code, version),
  unique (code, empreinte_sha256)
);

revoke all on table platform.documents_legaux_versions from public, anon, authenticated, service_role;
grant select on table platform.documents_legaux_versions to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Journal des acceptations (append-only)
-- ═══════════════════════════════════════════════════════════════════════
create table if not exists platform.acceptations_documents_legaux (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null,
  -- null uniquement pour un document de portée « utilisateur » accepté hors entreprise.
  entreprise_id uuid,
  document_code text not null,
  document_version text not null,
  document_empreinte_sha256 text not null,
  contexte text not null check (contexte in ('creation_entreprise', 'souscription_abonnement', 'reacceptation')),
  accepte_le timestamptz not null default clock_timestamp(),
  foreign key (document_code, document_version) references platform.documents_legaux_versions (code, version)
);

create index if not exists acceptations_documents_legaux_entreprise_idx
  on platform.acceptations_documents_legaux (entreprise_id, document_code, accepte_le desc);
create index if not exists acceptations_documents_legaux_utilisateur_idx
  on platform.acceptations_documents_legaux (utilisateur_id, document_code, accepte_le desc);

revoke all on table platform.acceptations_documents_legaux from public, anon, authenticated, service_role;
grant select on table platform.acceptations_documents_legaux to service_role;

create or replace function platform._documents_legaux_immuables()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Preuve juridique immuable : % interdit sur %', tg_op, tg_table_name
    using errcode = '55000';
end;
$$;
revoke all on function platform._documents_legaux_immuables() from public, anon, authenticated, service_role;

drop trigger if exists documents_legaux_versions_immuables on platform.documents_legaux_versions;
create trigger documents_legaux_versions_immuables
  before update or delete on platform.documents_legaux_versions
  for each row execute function platform._documents_legaux_immuables();
drop trigger if exists documents_legaux_versions_immuables_truncate on platform.documents_legaux_versions;
create trigger documents_legaux_versions_immuables_truncate
  before truncate on platform.documents_legaux_versions
  for each statement execute function platform._documents_legaux_immuables();

drop trigger if exists acceptations_documents_legaux_append_only on platform.acceptations_documents_legaux;
create trigger acceptations_documents_legaux_append_only
  before update or delete on platform.acceptations_documents_legaux
  for each row execute function platform._documents_legaux_immuables();
drop trigger if exists acceptations_documents_legaux_append_only_truncate on platform.acceptations_documents_legaux;
create trigger acceptations_documents_legaux_append_only_truncate
  before truncate on platform.acceptations_documents_legaux
  for each statement execute function platform._documents_legaux_immuables();

-- Mode sûr (incident, migration 20260928000807) : `incident_installer_gardes()` ne couvre
-- que le schéma public. Le journal de preuves, en `platform`, reçoit explicitement la même
-- garde : en `lecture_seule` (globale ou Gestion Pro) aucune preuve n'est écrite, et en
-- `app_coupee` aucune session utilisateur n'en écrit. La garde est inerte hors incident.
drop trigger if exists incident_garde_ecriture on platform.acceptations_documents_legaux;
create trigger incident_garde_ecriture
  before insert or update or delete on platform.acceptations_documents_legaux
  for each statement execute function public.incident_garde_ecriture('gestion_pro');

-- Seed : versions en vigueur (empreintes = sha256 des fichiers docs/juridique au commit
-- de cette migration ; contrôlées par src/lib/documents-legaux-versions.test.ts).
insert into platform.documents_legaux_versions
  (code, version, empreinte_sha256, fichier, portee, en_vigueur_depuis, reacceptation_requise)
values
  ('cgu', '1.0', '736ff027db0329f54b05f00d352ef9286264514fad50545cc5043fa2a7123876', 'cgu.md', 'utilisateur', '2026-10-02 00:00:00+02', true),
  ('cgv', '1.0', '3c1a468c0a79148bcf618a508990e8421813bcaf8bb54b4c3376a7bb7980b7de', 'cgv.md', 'entreprise', '2026-10-02 00:00:00+02', true),
  ('dpa', '2026-08-24', '7d9c73842c7b657b9d53291e6ece5375794020a136f05d466a3e0a5f4e563217', 'dpa-entreprises-clientes.md', 'entreprise', '2026-10-02 00:00:00+02', true)
on conflict (code, version) do nothing;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Fonctions internes
-- ═══════════════════════════════════════════════════════════════════════

-- Version en vigueur d'un document à un instant donné.
create or replace function platform._document_legal_en_vigueur(p_code text)
returns platform.documents_legaux_versions
language sql
stable
set search_path = pg_catalog, platform
as $$
  select v.*
    from platform.documents_legaux_versions v
   where v.code = p_code
     and v.en_vigueur_depuis <= now()
   order by v.en_vigueur_depuis desc, v.cree_le desc
   limit 1;
$$;

-- Date d'effet de la dernière version en vigueur qui exige une (ré)acceptation :
-- toute acceptation d'une version entrée en vigueur à cette date ou après reste valable.
create or replace function platform._document_legal_seuil_validite(p_code text)
returns timestamptz
language sql
stable
set search_path = pg_catalog, platform
as $$
  select max(v.en_vigueur_depuis)
    from platform.documents_legaux_versions v
   where v.code = p_code
     and v.en_vigueur_depuis <= now()
     and (v.reacceptation_requise
          or v.en_vigueur_depuis = (select min(w.en_vigueur_depuis) from platform.documents_legaux_versions w where w.code = p_code));
$$;

-- L'appelant peut-il engager l'entreprise (CGV, DPA) ? Membre actif (statut) disposant de
-- `gerer_parametres`. Volontairement indépendant de l'état commercial (essai expiré,
-- suspension) : un réabonnement doit pouvoir accepter les conditions.
create or replace function platform._peut_engager_entreprise(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.utilisateurs_entreprises ue
      join public.permissions_poste pp
        on pp.entreprise_id = ue.entreprise_id
       and pp.poste_id = ue.poste_id
       and pp.cle_permission = 'gerer_parametres'
       and pp.autorise
     where ue.entreprise_id = p_entreprise_id
       and ue.utilisateur_id = auth.uid()
       and ue.statut = 'actif'
  );
$$;

create or replace function platform._est_membre_statut_actif(p_entreprise_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.utilisateurs_entreprises ue
     where ue.entreprise_id = p_entreprise_id
       and ue.utilisateur_id = auth.uid()
       and ue.statut = 'actif'
  );
$$;

revoke all on function platform._document_legal_en_vigueur(text) from public, anon, authenticated, service_role;
revoke all on function platform._document_legal_seuil_validite(text) from public, anon, authenticated, service_role;
revoke all on function platform._peut_engager_entreprise(uuid) from public, anon, authenticated, service_role;
revoke all on function platform._est_membre_statut_actif(uuid) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 4. RPC exposées
-- ═══════════════════════════════════════════════════════════════════════

-- Documents que l'appelant (et, si fournie, son entreprise) doit encore accepter.
create or replace function public.documents_legaux_a_accepter(p_entreprise_id uuid default null)
returns table (code text, version text, empreinte_sha256 text, portee text)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, platform
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Aucun utilisateur authentifié' using errcode = '42501';
  end if;
  if p_entreprise_id is not null and not platform._est_membre_statut_actif(p_entreprise_id) then
    raise exception 'Accès refusé à cette entreprise' using errcode = '42501';
  end if;

  return query
  select v.code, v.version, v.empreinte_sha256, v.portee
    from (select (platform._document_legal_en_vigueur(c.code)).* from (values ('cgu'), ('cgv'), ('dpa')) as c(code)) v
   where v.code is not null
     and (v.portee = 'utilisateur' or p_entreprise_id is not null)
     and not exists (
       select 1
         from platform.acceptations_documents_legaux a
         join platform.documents_legaux_versions av
           on av.code = a.document_code and av.version = a.document_version
        where a.document_code = v.code
          and av.en_vigueur_depuis >= platform._document_legal_seuil_validite(v.code)
          and case when v.portee = 'utilisateur'
                   then a.utilisateur_id = v_uid
                   else a.entreprise_id = p_entreprise_id end
     );
end;
$$;

-- Enregistre l'acceptation des documents transmis. Chaque élément de p_documents :
-- {"code": "cgv", "version": "1.0", "empreinte": "<sha256>"}. Tout élément qui ne désigne
-- pas exactement la version en vigueur fait échouer l'ensemble (aucune preuve partielle).
create or replace function public.accepter_documents_legaux(
  p_entreprise_id uuid,
  p_contexte text,
  p_documents jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, platform
as $$
declare
  v_uid uuid := auth.uid();
  v_doc jsonb;
  v_vigueur platform.documents_legaux_versions;
  v_inserees integer := 0;
begin
  if v_uid is null then
    raise exception 'Aucun utilisateur authentifié' using errcode = '42501';
  end if;
  if p_contexte is null or p_contexte not in ('creation_entreprise', 'souscription_abonnement', 'reacceptation') then
    raise exception 'Contexte d''acceptation invalide' using errcode = '22023';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'Aucun document à accepter' using errcode = '22023';
  end if;
  if p_entreprise_id is not null and not platform._est_membre_statut_actif(p_entreprise_id) then
    raise exception 'Accès refusé à cette entreprise' using errcode = '42501';
  end if;

  for v_doc in select * from jsonb_array_elements(p_documents) loop
    if jsonb_typeof(v_doc) <> 'object' then
      raise exception 'Document invalide' using errcode = '22023';
    end if;
    v_vigueur := platform._document_legal_en_vigueur(v_doc ->> 'code');
    if v_vigueur.code is null then
      raise exception 'Document inconnu : %', coalesce(v_doc ->> 'code', '∅') using errcode = '22023';
    end if;
    if v_vigueur.version is distinct from (v_doc ->> 'version')
       or v_vigueur.empreinte_sha256 is distinct from (v_doc ->> 'empreinte') then
      raise exception 'Version périmée ou altérée pour % : relisez la version en vigueur', v_vigueur.code
        using errcode = '22023';
    end if;
    if v_vigueur.portee = 'entreprise' then
      if p_entreprise_id is null then
        raise exception 'Le document % s''accepte au nom d''une entreprise', v_vigueur.code using errcode = '22023';
      end if;
      if not platform._peut_engager_entreprise(p_entreprise_id) then
        raise exception 'Votre poste ne permet pas d''engager l''entreprise' using errcode = '42501';
      end if;
    end if;

    -- Idempotence : une même personne qui ré-accepte la même version pour la même
    -- entreprise ne crée pas de doublon (la première preuve fait foi).
    if not exists (
      select 1 from platform.acceptations_documents_legaux a
       where a.utilisateur_id = v_uid
         and a.entreprise_id is not distinct from p_entreprise_id
         and a.document_code = v_vigueur.code
         and a.document_version = v_vigueur.version
    ) then
      insert into platform.acceptations_documents_legaux
        (utilisateur_id, entreprise_id, document_code, document_version, document_empreinte_sha256, contexte)
      values
        (v_uid, p_entreprise_id, v_vigueur.code, v_vigueur.version, v_vigueur.empreinte_sha256, p_contexte);
      v_inserees := v_inserees + 1;
    end if;
  end loop;

  return v_inserees;
end;
$$;

-- Création d'entreprise ET preuve d'acceptation dans la même transaction : aucune
-- entreprise ne naît sans CGU/CGV/DPA acceptés dans leur version en vigueur.
create or replace function public.creer_entreprise_avec_acceptation(
  p_nom text,
  p_siret text default null,
  p_adresse text default null,
  p_code_postal text default null,
  p_ville text default null,
  p_documents jsonb default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, platform
as $$
declare
  v_entreprise_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Aucun utilisateur authentifié' using errcode = '42501';
  end if;
  if p_documents is null or jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) = 0 then
    raise exception 'Acceptation des conditions obligatoire' using errcode = '22023';
  end if;

  v_entreprise_id := public.creer_entreprise_bootstrap(p_nom, p_siret, p_adresse, p_code_postal, p_ville);
  perform public.accepter_documents_legaux(v_entreprise_id, 'creation_entreprise', p_documents);

  if exists (select 1 from public.documents_legaux_a_accepter(v_entreprise_id)) then
    raise exception 'Acceptation incomplète : CGU, CGV et DPA en vigueur sont requis' using errcode = '22023';
  end if;
  return v_entreprise_id;
end;
$$;

-- Historique des preuves d'une entreprise, pour ses administrateurs. Aucune donnée
-- d'une autre entreprise, aucune donnée personnelle au-delà de l'identifiant interne.
create or replace function public.acceptations_documents_legaux_entreprise(p_entreprise_id uuid)
returns table (
  document_code text,
  document_version text,
  document_empreinte_sha256 text,
  contexte text,
  utilisateur_id uuid,
  accepte_le timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, platform
as $$
begin
  if not platform._peut_engager_entreprise(p_entreprise_id) then
    raise exception 'Accès refusé à cette entreprise' using errcode = '42501';
  end if;
  return query
  select a.document_code, a.document_version, a.document_empreinte_sha256, a.contexte, a.utilisateur_id, a.accepte_le
    from platform.acceptations_documents_legaux a
   where a.entreprise_id = p_entreprise_id
   order by a.accepte_le desc, a.document_code;
end;
$$;

revoke all on function public.documents_legaux_a_accepter(uuid) from public, anon, service_role;
revoke all on function public.accepter_documents_legaux(uuid, text, jsonb) from public, anon, service_role;
revoke all on function public.creer_entreprise_avec_acceptation(text, text, text, text, text, jsonb) from public, anon, service_role;
revoke all on function public.acceptations_documents_legaux_entreprise(uuid) from public, anon, service_role;
grant execute on function public.documents_legaux_a_accepter(uuid) to authenticated;
grant execute on function public.accepter_documents_legaux(uuid, text, jsonb) to authenticated;
grant execute on function public.creer_entreprise_avec_acceptation(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.acceptations_documents_legaux_entreprise(uuid) to authenticated;

notify pgrst, 'reload schema';
