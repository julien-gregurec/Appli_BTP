-- ELSATIA-GP-RESERVES-INTEGRATION-COMPLETION-V1
--
-- Termine le flux applicatif Gestion Pro ↔ Réserves annoncé par le contrat
-- docs/reserves/ELSATIA_RESERVES_GP_INTEGRATION_CONTRACT_V1.md (« ⛔ à faire ») :
--
--   GP → Réserves  `reserves_synchroniser_chantier_gp` : crée OU rattache le chantier
--                  Réserves, reprend adresse, CP, ville, référence, client, dates,
--                  description, les entreprises participantes (sous-traitants GP), leurs
--                  contacts et ceux du client, et prépare la copie des plans GP.
--                  `reserves_confirmer_plan_gp` : confirme une copie de plan déposée.
--   Réserves → GP  `reserves_etat_chantier_gp` : ce que la fiche chantier GP affiche
--                  (compteurs par état, lien, droit de synchroniser), en une lecture.
--
-- Règles portées ici, toutes vérifiées par supabase/tests/
-- reserves_gp_integration_completion_v1.test.sql :
--
--   1. IDEMPOTENCE. Relancer la synchronisation N fois ne crée jamais N chantiers, N
--      entreprises, N contacts ni N plans : chaque objet repris porte la clé de son
--      origine GP (index uniques partiels), et un verrou transactionnel par chantier GP
--      sérialise deux synchronisations concurrentes.
--   2. PROPRIÉTÉ DES CHAMPS. GP est la source d'un champ tant que Réserves ne l'a pas
--      modifié : l'empreinte des dernières valeurs transmises est conservée ; un champ
--      modifié dans Réserves depuis est CONSERVÉ et signalé, jamais écrasé.
--   3. PLANS VERSIONNÉS. Un plan repris de GP est une COPIE possédée par Réserves
--      (bucket `reserves-plans`), versionnée (`gp_version`). Une nouvelle version GP ne
--      remplace le fichier que si le plan n'a pas été modifié dans Réserves ET ne porte
--      aucune réserve ; sinon elle est seulement signalée (`gp_maj_disponible`). Le
--      fichier actif n'est remplacé qu'après dépôt confirmé de la copie : jamais de plan
--      vide, jamais d'écrasement silencieux.
--   4. MOINDRE PRIVILÈGE PAR DONNÉE. On ne transmet que ce que l'appelant voit dans GP :
--      chantier consultable (`peut_consulter_chantier`), sous-traitants avec
--      `acces_sous_traitants`, contacts client avec `acces_clients`, plans visibles au
--      sens de `peut_voir_document_chantier` (audience). Côté Réserves : `gerer_chantier`
--      (+ `gerer_intervenants`, `gerer_plans` pour les parties correspondantes).
--   5. UN CONTACT N'EST PAS UN ACCÈS. Les entreprises reprises restent `invitee` sans
--      organisation rattachée ; les contacts vivent dans `reserves_contacts`, qui n'a
--      AUCUN lien vers `utilisateurs`. Aucune habilitation, aucun accès applicatif n'est
--      écrit, même si l'e-mail d'un contact est celui d'un compte ELSATIA existant.
--   6. TENANT. Tout ce qui est écrit porte l'entreprise du chantier GP ; les sources sont
--      filtrées sur cette même entreprise. Les colonnes d'intégration ne sont pas
--      modifiables en écriture directe (PATCH) : seules les fonctions du domaine les posent.
--   7. SUPPRESSION / ARCHIVAGE GP. Aucune clé étrangère nouvelle vers une table GP : les
--      origines sont des identifiants simples. Supprimer un document, un sous-traitant ou
--      un chantier GP ne touche ni ne bloque Réserves (contrat R-04 conservé).
--
-- Migration strictement ADDITIVE : aucune table, colonne, policy ni fonction existante
-- n'est supprimée ou réécrite (`reserves_importer_chantier_gp` et
-- `reserves_resume_chantier_gp` restent inchangées pour leurs appelants existants).

begin;

-- ── 1. Colonnes d'intégration ────────────────────────────────────────────────
alter table public.reserves_chantiers
  add column if not exists gp_empreinte jsonb,
  add column if not exists gp_dernier_rapport jsonb;

alter table public.reserves_plans
  add column if not exists source text not null default 'reserves',
  add column if not exists document_gp_id uuid,
  add column if not exists gp_version integer,
  add column if not exists gp_empreinte text,
  add column if not exists gp_copie_chemin text,
  add column if not exists gp_copie_empreinte text,
  add column if not exists gp_copie_mime_type text,
  add column if not exists gp_copie_taille_octets integer,
  add column if not exists gp_copie_nom_fichier text,
  add column if not exists gp_maj_disponible boolean not null default false,
  add column if not exists gp_synchronise_at timestamptz,
  add column if not exists modifie_localement_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reserves_plans_source_check') then
    alter table public.reserves_plans add constraint reserves_plans_source_check
      check (source in ('reserves','gestion_pro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reserves_plans_origine_gp_check') then
    alter table public.reserves_plans add constraint reserves_plans_origine_gp_check
      check ((source = 'gestion_pro') = (document_gp_id is not null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reserves_plans_gp_version_check') then
    alter table public.reserves_plans add constraint reserves_plans_gp_version_check
      check (gp_version is null or gp_version >= 1);
  end if;
end $$;

create unique index if not exists reserves_plans_document_gp_unique
  on public.reserves_plans (chantier_id, document_gp_id) where document_gp_id is not null;

alter table public.reserves_intervenants
  add column if not exists source text not null default 'reserves',
  add column if not exists fournisseur_gp_id uuid,
  add column if not exists gp_empreinte jsonb,
  add column if not exists gp_synchronise_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reserves_intervenants_source_check') then
    alter table public.reserves_intervenants add constraint reserves_intervenants_source_check
      check (source in ('reserves','gestion_pro'));
  end if;
end $$;

create unique index if not exists reserves_intervenants_fournisseur_gp_unique
  on public.reserves_intervenants (chantier_id, fournisseur_gp_id) where fournisseur_gp_id is not null;

-- ── 2. Contacts de chantier : un annuaire, jamais un accès ───────────────────
-- Volontairement AUCUNE colonne vers `utilisateurs` ni vers `entreprises` tierces : un
-- contact est une coordonnée. L'accès d'une entreprise intervenante reste né de la
-- désignation + du rattachement explicites (00268), jamais d'un e-mail.
create table if not exists public.reserves_contacts (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  chantier_id uuid not null references public.reserves_chantiers(id) on delete cascade,
  intervenant_id uuid references public.reserves_intervenants(id) on delete set null,
  role text not null default 'autre' check (role in ('client','entreprise','autre')),
  nom text not null check (btrim(nom) <> '' and length(nom) <= 180),
  fonction text check (fonction is null or length(fonction) <= 120),
  email text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  telephone text check (telephone is null or length(telephone) <= 40),
  source text not null default 'reserves' check (source in ('reserves','gestion_pro')),
  cle_gp text check (cle_gp is null or length(cle_gp) <= 120),
  gp_empreinte jsonb,
  gp_synchronise_at timestamptz,
  created_by uuid default auth.uid() references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'gestion_pro') = (cle_gp is not null))
);
create unique index if not exists reserves_contacts_cle_gp_unique
  on public.reserves_contacts (chantier_id, cle_gp) where cle_gp is not null;
create index if not exists reserves_contacts_chantier_idx
  on public.reserves_contacts (chantier_id, role, nom);

drop trigger if exists reserves_contacts_updated on public.reserves_contacts;
create trigger reserves_contacts_updated before update on public.reserves_contacts
  for each row execute function public.reserves_set_updated_at();

-- Cohérence de tenant : l'intervenant et le chantier d'un contact appartiennent à
-- l'organisation du contact.
create or replace function public.reserves_contacts_coherence()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.reserves_chantiers c
    where c.id = new.chantier_id and c.entreprise_id = new.entreprise_id
  ) then
    raise exception 'Contact : chantier hors de l''organisation' using errcode = '42501';
  end if;
  if new.intervenant_id is not null and not exists (
    select 1 from public.reserves_intervenants i
    where i.id = new.intervenant_id and i.chantier_id = new.chantier_id
      and i.entreprise_id = new.entreprise_id
  ) then
    raise exception 'Contact : entreprise intervenante hors du chantier' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reserves_contacts_coherence on public.reserves_contacts;
create trigger reserves_contacts_coherence before insert or update on public.reserves_contacts
  for each row execute function public.reserves_contacts_coherence();

alter table public.reserves_contacts enable row level security;
-- Lecture : l'organisation hôte seulement. Une entreprise invitée ne lit PAS l'annuaire
-- du chantier (coordonnées du client final, des autres corps d'état).
drop policy if exists reserves_contacts_select on public.reserves_contacts;
create policy reserves_contacts_select on public.reserves_contacts
  for select to authenticated using (public.reserves_action_autorisee(entreprise_id, 'voir'));
drop policy if exists reserves_contacts_insert on public.reserves_contacts;
create policy reserves_contacts_insert on public.reserves_contacts
  for insert to authenticated with check (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));
drop policy if exists reserves_contacts_update on public.reserves_contacts;
create policy reserves_contacts_update on public.reserves_contacts
  for update to authenticated
  using (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'))
  with check (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));
drop policy if exists reserves_contacts_delete on public.reserves_contacts;
create policy reserves_contacts_delete on public.reserves_contacts
  for delete to authenticated using (public.reserves_action_autorisee(entreprise_id, 'gerer_intervenants'));

revoke all on table public.reserves_contacts from anon;
grant select, insert, update, delete on table public.reserves_contacts to authenticated;

-- ── 3. Gardes : colonnes d'intégration posées par le domaine seulement ───────
-- Même principe que R-05 : une écriture émise directement sous `authenticated`/`anon`
-- (PATCH REST) ne peut ni forger un lien GP, ni effacer une empreinte, ni changer la
-- version d'un plan. Les fonctions du domaine (`security definer`) passent.
create or replace function public.reserves_garde_integration_gp_chantier()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'reserves' or new.chantier_gp_id is not null
       or new.gp_empreinte is not null or new.gp_dernier_rapport is not null then
      raise exception 'Un chantier lié à Gestion Pro se crée par la synchronisation, pas en écriture directe'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source is distinct from old.source
     or new.chantier_gp_id is distinct from old.chantier_gp_id
     or new.gp_empreinte is distinct from old.gp_empreinte
     or new.gp_dernier_rapport is distinct from old.gp_dernier_rapport
     or new.synchronise_at is distinct from old.synchronise_at then
    raise exception 'Lien Gestion Pro non modifiable en écriture directe' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reserves_chantiers_garde_integration_gp on public.reserves_chantiers;
create trigger reserves_chantiers_garde_integration_gp before insert or update on public.reserves_chantiers
  for each row execute function public.reserves_garde_integration_gp_chantier();

create or replace function public.reserves_garde_integration_gp_plan()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    -- Traçage de la modification locale d'un plan repris de GP (nom, niveau, zone,
    -- fichier) : c'est elle qui interdit ensuite tout remplacement automatique.
    if old.source = 'gestion_pro'
       and coalesce(current_setting('elsatia.reserves_sync_gp', true), 'off') <> 'on'
       and (new.nom is distinct from old.nom or new.niveau is distinct from old.niveau
            or new.zone is distinct from old.zone or new.storage_path is distinct from old.storage_path) then
      new.modifie_localement_at := now();
    end if;
  end if;
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'reserves' or new.document_gp_id is not null or new.gp_version is not null
       or new.gp_empreinte is not null or new.gp_copie_chemin is not null or new.gp_maj_disponible
       or new.modifie_localement_at is not null then
      raise exception 'Un plan repris de Gestion Pro se crée par la synchronisation' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source is distinct from old.source
     or new.document_gp_id is distinct from old.document_gp_id
     or new.gp_version is distinct from old.gp_version
     or new.gp_empreinte is distinct from old.gp_empreinte
     or new.gp_copie_chemin is distinct from old.gp_copie_chemin
     or new.gp_copie_empreinte is distinct from old.gp_copie_empreinte
     or new.gp_copie_mime_type is distinct from old.gp_copie_mime_type
     or new.gp_copie_taille_octets is distinct from old.gp_copie_taille_octets
     or new.gp_copie_nom_fichier is distinct from old.gp_copie_nom_fichier
     or new.gp_maj_disponible is distinct from old.gp_maj_disponible
     or new.gp_synchronise_at is distinct from old.gp_synchronise_at
     or (new.modifie_localement_at is distinct from old.modifie_localement_at
         and new.modifie_localement_at is distinct from now()) then
    raise exception 'Origine Gestion Pro d''un plan non modifiable en écriture directe' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reserves_plans_garde_integration_gp on public.reserves_plans;
create trigger reserves_plans_garde_integration_gp before insert or update on public.reserves_plans
  for each row execute function public.reserves_garde_integration_gp_plan();

create or replace function public.reserves_garde_integration_gp_intervenant()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'reserves' or new.fournisseur_gp_id is not null or new.gp_empreinte is not null then
      raise exception 'Une entreprise reprise de Gestion Pro se crée par la synchronisation' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source is distinct from old.source
     or new.fournisseur_gp_id is distinct from old.fournisseur_gp_id
     or new.gp_empreinte is distinct from old.gp_empreinte
     or new.gp_synchronise_at is distinct from old.gp_synchronise_at then
    raise exception 'Origine Gestion Pro d''une entreprise non modifiable en écriture directe' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reserves_intervenants_garde_integration_gp on public.reserves_intervenants;
create trigger reserves_intervenants_garde_integration_gp before insert or update on public.reserves_intervenants
  for each row execute function public.reserves_garde_integration_gp_intervenant();

create or replace function public.reserves_garde_integration_gp_contact()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    if new.source <> 'reserves' or new.cle_gp is not null or new.gp_empreinte is not null then
      raise exception 'Un contact repris de Gestion Pro se crée par la synchronisation' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.source is distinct from old.source
     or new.cle_gp is distinct from old.cle_gp
     or new.gp_empreinte is distinct from old.gp_empreinte
     or new.gp_synchronise_at is distinct from old.gp_synchronise_at
     or new.entreprise_id is distinct from old.entreprise_id
     or new.chantier_id is distinct from old.chantier_id then
    raise exception 'Origine Gestion Pro d''un contact non modifiable en écriture directe' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists reserves_contacts_garde_integration_gp on public.reserves_contacts;
create trigger reserves_contacts_garde_integration_gp before insert or update on public.reserves_contacts
  for each row execute function public.reserves_garde_integration_gp_contact();

-- ── 4. Règle de propriété d'un champ ─────────────────────────────────────────
-- GP gagne tant que Réserves n'a pas touché au champ depuis la dernière transmission
-- (valeur courante = valeur transmise la dernière fois). Sinon Réserves gagne.
create or replace function public.reserves_gp_champ(
  p_courant text, p_precedent text, p_nouveau text
) returns text language sql immutable set search_path = public as $$
  select case when p_courant is not distinct from p_precedent then p_nouveau else p_courant end;
$$;

create or replace function public.reserves_gp_champ_conserve(
  p_courant text, p_precedent text, p_nouveau text
) returns boolean language sql immutable set search_path = public as $$
  select p_courant is distinct from p_precedent and p_courant is distinct from p_nouveau;
$$;

-- E-mail repris seulement s'il est bien formé (même contrôle que les colonnes cibles).
create or replace function public.reserves_gp_email(p text)
returns text language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p,'')) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
              and length(btrim(p)) <= 320 then lower(btrim(p)) end;
$$;

create or replace function public.reserves_gp_texte(p text, p_max integer)
returns text language sql immutable set search_path = public as $$
  select nullif(left(btrim(coalesce(p,'')), p_max), '');
$$;

-- ── 5. GP → Réserves : synchronisation ───────────────────────────────────────
create or replace function public.reserves_synchroniser_chantier_gp(
  p_chantier_gp_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_gp public.chantiers;
  v_client public.clients;
  v_ent uuid;
  v_rc public.reserves_chantiers;
  v_id uuid;
  v_cree boolean := false;
  v_rattache boolean := false;
  v_nouveau jsonb;
  v_prec jsonb;
  v_conserves text[] := '{}';
  v_champ text;
  v_nom_client text;
  v_nom text;
  v_i integer;
  v_peut_intervenants boolean;
  v_peut_plans boolean;
  v_st record;
  v_int public.reserves_intervenants;
  v_int_id uuid;
  v_etat text;
  v_ent_creees int := 0; v_ent_maj int := 0; v_ent_rattachees int := 0; v_ent_inchangees int := 0;
  v_ct_crees int := 0; v_ct_maj int := 0; v_ct_inchanges int := 0;
  v_pl_crees int := 0; v_pl_a_jour int := 0; v_pl_maj int := 0; v_pl_conflits int := 0;
  v_ct record;
  v_contact public.reserves_contacts;
  v_doc record;
  v_plan public.reserves_plans;
  v_ext text;
  v_chemin text;
  v_copies jsonb := '[]'::jsonb;
  v_rapport jsonb;
  v_n integer;
begin
  select * into v_gp from public.chantiers where id = p_chantier_gp_id;
  if not found then raise exception 'Chantier Gestion Pro introuvable'; end if;
  v_ent := v_gp.entreprise_id;
  -- Double habilitation, sur l'entreprise DU CHANTIER, jamais celle de l'appelant.
  if not public.reserves_action_autorisee(v_ent, 'gerer_chantier') then
    raise exception 'Synchronisation non autorisée côté Réserves' using errcode = '42501';
  end if;
  if not public.peut_consulter_chantier(v_ent, v_gp.id) then
    raise exception 'Synchronisation non autorisée côté Gestion Pro' using errcode = '42501';
  end if;
  v_peut_intervenants := public.reserves_action_autorisee(v_ent, 'gerer_intervenants');
  v_peut_plans := public.reserves_action_autorisee(v_ent, 'gerer_plans');

  -- Deux synchronisations concurrentes du même chantier GP se suivent, ne se croisent pas.
  perform pg_advisory_xact_lock(hashtextextended('reserves_sync_gp:' || p_chantier_gp_id::text, 0));
  perform set_config('elsatia.reserves_sync_gp', 'on', true);

  select * into v_client from public.clients where id = v_gp.client_id and entreprise_id = v_ent;
  v_nom_client := public.reserves_gp_texte(coalesce(
    nullif(btrim(coalesce(v_client.raison_sociale,'')), ''),
    nullif(btrim(coalesce(v_client.societe,'')), ''),
    nullif(btrim(concat_ws(' ', v_client.prenom, v_client.nom)), '')
  ), 180);

  v_nouveau := jsonb_build_object(
    'nom', public.reserves_gp_texte(v_gp.nom, 180),
    'reference', public.reserves_gp_texte(v_gp.reference_interne, 80),
    'adresse', public.reserves_gp_texte(v_gp.adresse, 400),
    'code_postal', case when btrim(coalesce(v_gp.code_postal,'')) ~ '^[0-9A-Za-z -]{2,12}$'
                        then btrim(v_gp.code_postal) end,
    'ville', public.reserves_gp_texte(v_gp.ville, 120),
    'client', v_nom_client,
    'description', public.reserves_gp_texte(v_gp.description, 4000),
    'date_debut', v_gp.date_debut_prevue::text,
    'date_fin_prevue', case when v_gp.date_fin_prevue is null or v_gp.date_debut_prevue is null
                              or v_gp.date_fin_prevue >= v_gp.date_debut_prevue
                            then v_gp.date_fin_prevue::text end
  );

  -- 5.1 Chantier : lien existant, sinon rattachement d'un homonyme libre, sinon création.
  select * into v_rc from public.reserves_chantiers
  where entreprise_id = v_ent and chantier_gp_id = p_chantier_gp_id for update;

  if not found then
    select * into v_rc from public.reserves_chantiers
    where entreprise_id = v_ent and chantier_gp_id is null and source = 'reserves'
      and archived_at is null and lower(btrim(nom)) = lower(v_nouveau->>'nom')
    order by created_at limit 1 for update;
    if found then
      update public.reserves_chantiers
      set source = 'gestion_pro', chantier_gp_id = p_chantier_gp_id
      where id = v_rc.id;
      v_rattache := true;
    else
      v_nom := v_nouveau->>'nom';
      v_i := 1;
      while exists (select 1 from public.reserves_chantiers where entreprise_id = v_ent and nom = v_nom) loop
        v_i := v_i + 1;
        v_nom := left(v_nouveau->>'nom', 150) || ' (' || coalesce(v_nouveau->>'reference', 'GP')
                 || case when v_i > 2 then ' ' || v_i::text else '' end || ')';
      end loop;
      insert into public.reserves_chantiers (entreprise_id, nom, source, chantier_gp_id)
      values (v_ent, v_nom, 'gestion_pro', p_chantier_gp_id)
      returning * into v_rc;
      -- Le nom éventuellement suffixé est celui que Réserves possède désormais.
      v_nouveau := v_nouveau || jsonb_build_object('nom', v_nom);
      v_cree := true;
    end if;
    select * into v_rc from public.reserves_chantiers where id = v_rc.id;
  end if;
  v_id := v_rc.id;
  -- À la création, l'empreinte « précédente » est l'état vide du chantier neuf ; au
  -- rattachement, elle est inconnue : seuls les champs vides de Réserves sont complétés.
  v_prec := case when v_cree then jsonb_build_object('nom', v_nouveau->>'nom')
                 else coalesce(v_rc.gp_empreinte, '{}'::jsonb) end;

  foreach v_champ in array array['nom','reference','adresse','code_postal','ville','client',
                                 'description','date_debut','date_fin_prevue'] loop
    if public.reserves_gp_champ_conserve(to_jsonb(v_rc)->>v_champ, v_prec->>v_champ, v_nouveau->>v_champ) then
      v_conserves := v_conserves || v_champ;
    end if;
  end loop;

  -- Un renommage GP qui heurterait un autre chantier Réserves du même nom est conservé.
  v_nom := public.reserves_gp_champ(v_rc.nom, v_prec->>'nom', v_nouveau->>'nom');
  if v_nom is distinct from v_rc.nom and exists (
    select 1 from public.reserves_chantiers where entreprise_id = v_ent and nom = v_nom and id <> v_id
  ) then
    v_nom := v_rc.nom;
    if not ('nom' = any(v_conserves)) then v_conserves := v_conserves || 'nom'::text; end if;
  end if;

  update public.reserves_chantiers c set
    nom = coalesce(v_nom, c.nom),
    reference = public.reserves_gp_champ(c.reference, v_prec->>'reference', v_nouveau->>'reference'),
    adresse = public.reserves_gp_champ(c.adresse, v_prec->>'adresse', v_nouveau->>'adresse'),
    code_postal = public.reserves_gp_champ(c.code_postal, v_prec->>'code_postal', v_nouveau->>'code_postal'),
    ville = public.reserves_gp_champ(c.ville, v_prec->>'ville', v_nouveau->>'ville'),
    client = public.reserves_gp_champ(c.client, v_prec->>'client', v_nouveau->>'client'),
    description = public.reserves_gp_champ(c.description, v_prec->>'description', v_nouveau->>'description'),
    date_debut = public.reserves_gp_champ(c.date_debut::text, v_prec->>'date_debut', v_nouveau->>'date_debut')::date,
    date_fin_prevue = case
      when public.reserves_gp_champ(c.date_fin_prevue::text, v_prec->>'date_fin_prevue', v_nouveau->>'date_fin_prevue')::date
           < public.reserves_gp_champ(c.date_debut::text, v_prec->>'date_debut', v_nouveau->>'date_debut')::date
      then c.date_fin_prevue
      else public.reserves_gp_champ(c.date_fin_prevue::text, v_prec->>'date_fin_prevue', v_nouveau->>'date_fin_prevue')::date
    end,
    gp_empreinte = v_nouveau,
    synchronise_at = now()
  where c.id = v_id;

  -- 5.2 Entreprises participantes (sous-traitants GP du chantier) et leurs contacts.
  if v_peut_intervenants and public.a_permission(v_ent, 'acces_sous_traitants') then
    for v_st in
      select distinct on (f.id) f.id as fournisseur_id, f.nom, f.reference, f.contact_nom,
             f.email, f.telephone, f.specialite, stc.mission
      from public.sous_traitants_chantiers stc
      join public.fournisseurs f on f.id = stc.fournisseur_id and f.entreprise_id = stc.entreprise_id
      where stc.chantier_id = p_chantier_gp_id and stc.entreprise_id = v_ent
        and stc.statut <> 'annulee' and f.type_tiers = 'sous_traitant'
      order by f.id, stc.created_at
    loop
      v_nouveau := jsonb_build_object(
        'nom', public.reserves_gp_texte(v_st.nom, 180),
        'corps_etat', public.reserves_gp_texte(coalesce(nullif(btrim(coalesce(v_st.specialite,'')),''), v_st.mission), 120),
        'email_contact', public.reserves_gp_email(v_st.email),
        'telephone_contact', public.reserves_gp_texte(v_st.telephone, 40)
      );
      select * into v_int from public.reserves_intervenants
      where chantier_id = v_id and fournisseur_gp_id = v_st.fournisseur_id for update;
      if not found then
        -- Rattachement d'une entreprise déjà saisie à la main sous le même nom.
        select * into v_int from public.reserves_intervenants
        where chantier_id = v_id and fournisseur_gp_id is null and lower(btrim(nom)) = lower(v_nouveau->>'nom')
        limit 1 for update;
        if found then
          update public.reserves_intervenants set source = 'gestion_pro', fournisseur_gp_id = v_st.fournisseur_id
          where id = v_int.id;
          v_prec := '{}'::jsonb;
          v_etat := 'rattache';
          v_ent_rattachees := v_ent_rattachees + 1;
        else
          v_nom := v_nouveau->>'nom';
          if exists (select 1 from public.reserves_intervenants where chantier_id = v_id and nom = v_nom) then
            v_nom := left(v_nom, 150) || ' (' || coalesce(public.reserves_gp_texte(v_st.reference, 25), 'GP') || ')';
          end if;
          insert into public.reserves_intervenants (
            entreprise_id, chantier_id, nom, corps_etat, email_contact, telephone_contact,
            source, fournisseur_gp_id
          ) values (
            v_ent, v_id, v_nom, v_nouveau->>'corps_etat', v_nouveau->>'email_contact',
            v_nouveau->>'telephone_contact', 'gestion_pro', v_st.fournisseur_id
          ) returning * into v_int;
          v_nouveau := v_nouveau || jsonb_build_object('nom', v_nom);
          v_prec := v_nouveau;
          v_etat := 'cree';
          v_ent_creees := v_ent_creees + 1;
        end if;
        select * into v_int from public.reserves_intervenants where id = v_int.id;
      else
        v_prec := coalesce(v_int.gp_empreinte, '{}'::jsonb);
        v_etat := 'existant';
      end if;

      v_nom := public.reserves_gp_champ(v_int.nom, v_prec->>'nom', v_nouveau->>'nom');
      if v_nom is distinct from v_int.nom and exists (
        select 1 from public.reserves_intervenants where chantier_id = v_id and nom = v_nom and id <> v_int.id
      ) then v_nom := v_int.nom; end if;

      update public.reserves_intervenants i set
        nom = coalesce(v_nom, i.nom),
        corps_etat = public.reserves_gp_champ(i.corps_etat, v_prec->>'corps_etat', v_nouveau->>'corps_etat'),
        email_contact = public.reserves_gp_champ(i.email_contact, v_prec->>'email_contact', v_nouveau->>'email_contact'),
        telephone_contact = public.reserves_gp_champ(i.telephone_contact, v_prec->>'telephone_contact', v_nouveau->>'telephone_contact'),
        gp_empreinte = v_nouveau,
        gp_synchronise_at = now()
      where i.id = v_int.id
        and (i.nom, i.corps_etat, i.email_contact, i.telephone_contact, i.gp_empreinte) is distinct from (
          coalesce(v_nom, i.nom),
          public.reserves_gp_champ(i.corps_etat, v_prec->>'corps_etat', v_nouveau->>'corps_etat'),
          public.reserves_gp_champ(i.email_contact, v_prec->>'email_contact', v_nouveau->>'email_contact'),
          public.reserves_gp_champ(i.telephone_contact, v_prec->>'telephone_contact', v_nouveau->>'telephone_contact'),
          v_nouveau);
      get diagnostics v_n = row_count;
      if v_etat = 'existant' then
        if v_n > 0 then v_ent_maj := v_ent_maj + 1; else v_ent_inchangees := v_ent_inchangees + 1; end if;
      end if;
      v_int_id := v_int.id;

      -- Contact de l'entreprise (fiche tiers GP) : coordonnée, jamais un accès.
      if coalesce(btrim(v_st.contact_nom),'') <> '' or public.reserves_gp_email(v_st.email) is not null
         or coalesce(btrim(v_st.telephone),'') <> '' then
        v_n := public.reserves_gp_poser_contact(
          v_ent, v_id, v_int_id, 'entreprise',
          'fournisseur:' || v_st.fournisseur_id::text,
          coalesce(public.reserves_gp_texte(v_st.contact_nom, 180), public.reserves_gp_texte(v_st.nom, 180)),
          case when coalesce(btrim(v_st.contact_nom),'') <> '' then public.reserves_gp_texte(v_st.nom, 120) end,
          public.reserves_gp_email(v_st.email), public.reserves_gp_texte(v_st.telephone, 40)
        );
        if v_n = 1 then v_ct_crees := v_ct_crees + 1;
        elsif v_n = 2 then v_ct_maj := v_ct_maj + 1;
        else v_ct_inchanges := v_ct_inchanges + 1; end if;
      end if;
    end loop;
  end if;

  -- 5.3 Contacts du client (fiche client GP et ses contacts).
  if v_peut_intervenants and v_client.id is not null and public.a_permission(v_ent, 'acces_clients') then
    for v_ct in
      select 'client:' || v_client.id::text as cle, v_nom_client as nom, 'Client'::text as fonction,
             public.reserves_gp_email(v_client.email) as email, public.reserves_gp_texte(v_client.telephone, 40) as tel
      where v_nom_client is not null
        and (public.reserves_gp_email(v_client.email) is not null or coalesce(btrim(v_client.telephone),'') <> '')
      union all
      select 'contact_client:' || cc.id::text, public.reserves_gp_texte(cc.nom, 180),
             public.reserves_gp_texte(coalesce(cc.fonction, 'Contact client'), 120),
             public.reserves_gp_email(cc.email), public.reserves_gp_texte(cc.telephone, 40)
      from public.contacts_clients cc
      where cc.client_id = v_client.id and coalesce(btrim(cc.nom),'') <> ''
    loop
      v_n := public.reserves_gp_poser_contact(v_ent, v_id, null, 'client', v_ct.cle, v_ct.nom,
        v_ct.fonction, v_ct.email, v_ct.tel);
      if v_n = 1 then v_ct_crees := v_ct_crees + 1;
      elsif v_n = 2 then v_ct_maj := v_ct_maj + 1;
      else v_ct_inchanges := v_ct_inchanges + 1; end if;
    end loop;
  end if;

  -- 5.4 Plans : documents GP classés « plan », d'un format que Réserves sait afficher,
  -- et visibles de l'appelant dans GP (audience du document).
  if v_peut_plans then
    for v_doc in
      select d.id, d.nom, d.storage_path, d.mime_type, d.taille_octets
      from public.documents_chantier d
      where d.chantier_id = p_chantier_gp_id and d.entreprise_id = v_ent
        and d.categorie = 'plan'
        and d.mime_type in ('application/pdf','image/jpeg','image/png','image/webp')
        and d.taille_octets <= 26214400
        and public.peut_voir_document_chantier(d.id)
      order by d.created_at, d.id
    loop
      v_ext := case v_doc.mime_type when 'application/pdf' then 'pdf' when 'image/jpeg' then 'jpg'
                 when 'image/png' then 'png' else 'webp' end;
      select * into v_plan from public.reserves_plans
      where chantier_id = v_id and document_gp_id = v_doc.id for update;

      if not found then
        v_nom := public.reserves_gp_texte(v_doc.nom, 180);
        v_i := 1;
        while exists (select 1 from public.reserves_plans where chantier_id = v_id and nom = v_nom
                      and niveau is null and zone is null) loop
          v_i := v_i + 1;
          v_nom := left(public.reserves_gp_texte(v_doc.nom, 180), 150) || ' (Gestion Pro'
                   || case when v_i > 2 then ' ' || v_i::text else '' end || ')';
        end loop;
        insert into public.reserves_plans (
          entreprise_id, chantier_id, nom, mime_type, taille_octets, nom_fichier,
          source, document_gp_id, gp_synchronise_at
        ) values (
          v_ent, v_id, v_nom, v_doc.mime_type, v_doc.taille_octets::integer,
          left(coalesce(v_doc.nom, ''), 260), 'gestion_pro', v_doc.id, now()
        ) returning * into v_plan;
        v_chemin := v_ent::text || '/' || v_id::text || '/' || v_plan.id::text || '/'
                 || gen_random_uuid()::text || '.' || v_ext;
        update public.reserves_plans set gp_copie_chemin = v_chemin, gp_copie_empreinte = v_doc.storage_path,
          gp_copie_mime_type = v_doc.mime_type, gp_copie_taille_octets = v_doc.taille_octets::integer,
          gp_copie_nom_fichier = left(coalesce(v_doc.nom, ''), 260)
        where id = v_plan.id;
        v_copies := v_copies || jsonb_build_object('plan_id', v_plan.id, 'source_chemin', v_doc.storage_path,
          'destination_chemin', v_chemin, 'mime_type', v_doc.mime_type);
        v_pl_crees := v_pl_crees + 1;
        continue;
      end if;

      if v_plan.gp_empreinte is not distinct from v_doc.storage_path and v_plan.storage_path is not null then
        -- Même version déjà copiée : rien à faire, sauf lever un signalement devenu caduc.
        if v_plan.gp_maj_disponible or v_plan.gp_copie_chemin is not null then
          update public.reserves_plans set gp_maj_disponible = false, gp_copie_chemin = null,
            gp_copie_empreinte = null, gp_copie_mime_type = null, gp_copie_taille_octets = null,
            gp_copie_nom_fichier = null
          where id = v_plan.id;
        end if;
        v_pl_a_jour := v_pl_a_jour + 1;
        continue;
      end if;

      -- Nouvelle version GP (ou première copie jamais confirmée).
      if v_plan.storage_path is not null and (
           v_plan.modifie_localement_at is not null
           or exists (select 1 from public.reserves r where r.plan_id = v_plan.id)
         ) then
        -- Plan modifié dans Réserves ou déjà utilisé pour localiser des réserves : on ne
        -- remplace pas le fond de plan sous des repères existants. Signalement seul.
        update public.reserves_plans set gp_maj_disponible = true, gp_synchronise_at = now()
        where id = v_plan.id and not gp_maj_disponible;
        v_pl_conflits := v_pl_conflits + 1;
        continue;
      end if;

      if v_plan.gp_copie_chemin is not null and v_plan.gp_copie_empreinte is not distinct from v_doc.storage_path
         and v_plan.gp_copie_chemin like '%.' || v_ext then
        v_chemin := v_plan.gp_copie_chemin;  -- reprise d'une copie interrompue : même cible
      else
        v_chemin := v_ent::text || '/' || v_id::text || '/' || v_plan.id::text || '/'
                 || gen_random_uuid()::text || '.' || v_ext;
        update public.reserves_plans set gp_copie_chemin = v_chemin, gp_copie_empreinte = v_doc.storage_path,
          gp_copie_mime_type = v_doc.mime_type, gp_copie_taille_octets = v_doc.taille_octets::integer,
          gp_copie_nom_fichier = left(coalesce(v_doc.nom, ''), 260), gp_synchronise_at = now()
        where id = v_plan.id;
      end if;
      v_copies := v_copies || jsonb_build_object('plan_id', v_plan.id, 'source_chemin', v_doc.storage_path,
        'destination_chemin', v_chemin, 'mime_type', v_doc.mime_type);
      if v_plan.storage_path is null then v_pl_crees := v_pl_crees + 1; else v_pl_maj := v_pl_maj + 1; end if;
    end loop;
  end if;

  v_rapport := jsonb_build_object(
    'chantier_reserves_id', v_id,
    'cree', v_cree,
    'rattache', v_rattache,
    'champs_conserves', to_jsonb(v_conserves),
    'entreprises', jsonb_build_object('creees', v_ent_creees, 'mises_a_jour', v_ent_maj,
      'rattachees', v_ent_rattachees, 'inchangees', v_ent_inchangees,
      'autorise', v_peut_intervenants and public.a_permission(v_ent, 'acces_sous_traitants')),
    'contacts', jsonb_build_object('crees', v_ct_crees, 'mis_a_jour', v_ct_maj, 'inchanges', v_ct_inchanges,
      'autorise', v_peut_intervenants),
    'plans', jsonb_build_object('crees', v_pl_crees, 'a_jour', v_pl_a_jour, 'mis_a_jour', v_pl_maj,
      'conflits', v_pl_conflits, 'autorise', v_peut_plans),
    'plans_a_copier', v_copies,
    'synchronise_at', now()
  );
  update public.reserves_chantiers set gp_dernier_rapport = v_rapport - 'plans_a_copier' where id = v_id;
  perform set_config('elsatia.reserves_sync_gp', 'off', true);
  return v_rapport;
end;
$$;

-- Pose idempotente d'un contact repris : 1 = créé, 2 = mis à jour, 0 = inchangé.
create or replace function public.reserves_gp_poser_contact(
  p_entreprise_id uuid, p_chantier_id uuid, p_intervenant_id uuid, p_role text, p_cle text,
  p_nom text, p_fonction text, p_email text, p_telephone text
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_c public.reserves_contacts; v_nouveau jsonb; v_prec jsonb; v_n integer;
begin
  if p_nom is null then return 0; end if;
  v_nouveau := jsonb_build_object('nom', p_nom, 'fonction', p_fonction, 'email', p_email, 'telephone', p_telephone);
  select * into v_c from public.reserves_contacts where chantier_id = p_chantier_id and cle_gp = p_cle for update;
  if not found then
    insert into public.reserves_contacts (entreprise_id, chantier_id, intervenant_id, role, nom, fonction,
      email, telephone, source, cle_gp, gp_empreinte, gp_synchronise_at)
    values (p_entreprise_id, p_chantier_id, p_intervenant_id, p_role, p_nom, p_fonction, p_email, p_telephone,
      'gestion_pro', p_cle, v_nouveau, now());
    return 1;
  end if;
  v_prec := coalesce(v_c.gp_empreinte, '{}'::jsonb);
  update public.reserves_contacts c set
    nom = coalesce(public.reserves_gp_champ(c.nom, v_prec->>'nom', p_nom), c.nom),
    fonction = public.reserves_gp_champ(c.fonction, v_prec->>'fonction', p_fonction),
    email = public.reserves_gp_champ(c.email, v_prec->>'email', p_email),
    telephone = public.reserves_gp_champ(c.telephone, v_prec->>'telephone', p_telephone),
    intervenant_id = coalesce(c.intervenant_id, p_intervenant_id),
    gp_empreinte = v_nouveau,
    gp_synchronise_at = now()
  where c.id = v_c.id
    and (c.nom, c.fonction, c.email, c.telephone, c.gp_empreinte, c.intervenant_id) is distinct from (
      coalesce(public.reserves_gp_champ(c.nom, v_prec->>'nom', p_nom), c.nom),
      public.reserves_gp_champ(c.fonction, v_prec->>'fonction', p_fonction),
      public.reserves_gp_champ(c.email, v_prec->>'email', p_email),
      public.reserves_gp_champ(c.telephone, v_prec->>'telephone', p_telephone),
      v_nouveau, coalesce(c.intervenant_id, p_intervenant_id));
  get diagnostics v_n = row_count;
  return case when v_n > 0 then 2 else 0 end;
end;
$$;

-- ── 6. Confirmation d'une copie de plan déposée ──────────────────────────────
-- Le fichier actif n'est remplacé qu'ici, une fois l'objet présent dans le bucket, et
-- seulement pour la copie que la synchronisation a elle-même préparée.
create or replace function public.reserves_confirmer_plan_gp(
  p_plan_id uuid, p_chemin text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_plan public.reserves_plans;
begin
  select * into v_plan from public.reserves_plans where id = p_plan_id for update;
  if not found or v_plan.source <> 'gestion_pro' then raise exception 'Plan Gestion Pro introuvable'; end if;
  if not public.reserves_action_autorisee(v_plan.entreprise_id, 'gerer_plans') then
    raise exception 'Confirmation de plan non autorisée' using errcode = '42501';
  end if;
  -- Rejeu d'une confirmation déjà appliquée : idempotent.
  if v_plan.gp_copie_chemin is null and v_plan.storage_path = p_chemin then
    return jsonb_build_object('plan_id', v_plan.id, 'version', v_plan.gp_version, 'deja_confirme', true);
  end if;
  if v_plan.gp_copie_chemin is null or v_plan.gp_copie_chemin <> p_chemin then
    raise exception 'Aucune copie en attente pour ce chemin';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'reserves-plans' and o.name = p_chemin) then
    raise exception 'Aucun document déposé pour ce plan';
  end if;
  -- Un plan devenu porteur de repères entre la préparation et le dépôt n'est pas remplacé.
  if v_plan.storage_path is not null and (
       v_plan.modifie_localement_at is not null
       or exists (select 1 from public.reserves r where r.plan_id = v_plan.id)) then
    perform set_config('elsatia.reserves_sync_gp', 'on', true);
    update public.reserves_plans set gp_maj_disponible = true, gp_copie_chemin = null,
      gp_copie_empreinte = null, gp_copie_mime_type = null, gp_copie_taille_octets = null,
      gp_copie_nom_fichier = null
    where id = v_plan.id;
    perform set_config('elsatia.reserves_sync_gp', 'off', true);
    return jsonb_build_object('plan_id', v_plan.id, 'version', v_plan.gp_version, 'remplace', false);
  end if;

  perform set_config('elsatia.reserves_sync_gp', 'on', true);
  update public.reserves_plans set
    storage_path = p_chemin,
    mime_type = coalesce(gp_copie_mime_type, mime_type),
    taille_octets = coalesce(gp_copie_taille_octets, taille_octets),
    nom_fichier = coalesce(nullif(gp_copie_nom_fichier, ''), nom_fichier),
    -- Une nouvelle version peut avoir un autre nombre de pages : il sera réappris.
    nb_pages = case when storage_path is null then nb_pages else null end,
    gp_empreinte = gp_copie_empreinte,
    gp_version = coalesce(gp_version, 0) + 1,
    gp_copie_chemin = null, gp_copie_empreinte = null, gp_copie_mime_type = null,
    gp_copie_taille_octets = null, gp_copie_nom_fichier = null,
    gp_maj_disponible = false,
    gp_synchronise_at = now(),
    televerse_at = now(), televerse_par = auth.uid()
  where id = v_plan.id
  returning * into v_plan;
  perform set_config('elsatia.reserves_sync_gp', 'off', true);
  return jsonb_build_object('plan_id', v_plan.id, 'version', v_plan.gp_version, 'remplace', true);
end;
$$;

-- ── 7. Réserves → GP : état affichable sur la fiche chantier ─────────────────
-- Une seule lecture pour la fiche GP. Renvoie NULL quand le bloc ne doit pas exister
-- (chantier non consultable dans GP, organisation sans Réserves, utilisateur sans rôle
-- Réserves) : la fiche reste utilisable, simplement sans le bloc. Ne renvoie jamais le
-- détail des réserves, ni les noms des entreprises, ni les motifs.
create or replace function public.reserves_etat_chantier_gp(
  p_chantier_gp_id uuid
) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare v_ent uuid; v_rc public.reserves_chantiers; v_res jsonb;
begin
  select entreprise_id into v_ent from public.chantiers where id = p_chantier_gp_id;
  if v_ent is null then return null; end if;
  if not public.peut_consulter_chantier(v_ent, p_chantier_gp_id) then return null; end if;
  if not public.reserves_action_autorisee(v_ent, 'voir') then return null; end if;

  select * into v_rc from public.reserves_chantiers
  where entreprise_id = v_ent and chantier_gp_id = p_chantier_gp_id;

  if not found then
    return jsonb_build_object('lie', false, 'chantier_reserves_id', null,
      'peut_synchroniser', public.reserves_action_autorisee(v_ent, 'gerer_chantier'));
  end if;

  select jsonb_build_object(
      'total', count(*) filter (where r.statut <> 'annulee'),
      'ouvertes', count(*) filter (where r.statut = 'emise'),
      'en_cours', count(*) filter (where r.statut in ('assignee','acceptee','refusee_responsabilite','levee_refusee')),
      'attente_levee', count(*) filter (where r.statut = 'levee_demandee'),
      'levees', count(*) filter (where r.statut = 'levee'),
      'annulees', count(*) filter (where r.statut = 'annulee'),
      'non_levees', count(*) filter (where r.statut not in ('levee','annulee')),
      'en_retard', count(*) filter (where r.echeance < current_date and r.statut not in ('levee','annulee')),
      'statuts', coalesce((select jsonb_object_agg(s.statut, s.n) from (
          select r2.statut, count(*) as n from public.reserves r2 where r2.chantier_id = v_rc.id group by r2.statut
        ) s), '{}'::jsonb)
    ) into v_res
  from public.reserves r where r.chantier_id = v_rc.id;

  return v_res || jsonb_build_object(
    'lie', true,
    'chantier_reserves_id', v_rc.id,
    'synchronise_at', v_rc.synchronise_at,
    'plans_maj_disponible', (select count(*) from public.reserves_plans p
                             where p.chantier_id = v_rc.id and p.gp_maj_disponible),
    'champs_conserves', coalesce(v_rc.gp_dernier_rapport->'champs_conserves', '[]'::jsonb),
    'peut_synchroniser', public.reserves_action_autorisee(v_ent, 'gerer_chantier')
  );
end;
$$;

-- ── 8. Droits d'exécution ────────────────────────────────────────────────────
do $$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.reserves_synchroniser_chantier_gp(uuid)',
    'public.reserves_confirmer_plan_gp(uuid,text)',
    'public.reserves_etat_chantier_gp(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', v_signature);
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
  foreach v_signature in array array[
    'public.reserves_gp_poser_contact(uuid,uuid,uuid,text,text,text,text,text,text)',
    'public.reserves_garde_integration_gp_chantier()',
    'public.reserves_garde_integration_gp_plan()',
    'public.reserves_garde_integration_gp_intervenant()',
    'public.reserves_garde_integration_gp_contact()',
    'public.reserves_contacts_coherence()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
