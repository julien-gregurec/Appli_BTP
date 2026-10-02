-- Train canonique V9 : numéro d'origine 20260930001501 (Relevé & Métré Lot 11 (claude/beautiful-tesla-grj0pu, commits Lot 11 portés sur le Lot 10 de fervent-bell)), renuméroté 20261002001116
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA TOOLS → GESTION PRO — RELEVÉ & MÉTRÉ — LOT 11 — COSTING HANDOFF V1
--
-- Branche réellement le contrat `elsatia.tools.estimation` 1.0.0 (Lot 10, packages/releve-domain/src/estimation.ts)
-- sur Gestion Pro. Rapport : docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT11_GP_HANDOFF_V1.md
--
-- Règle produit : TOOLS = relevé → métré → quantitatif → estimation simplifiée HT ; GESTION PRO = propriétaire du prix
-- de vente, de la marge, de la remise, de la TVA, du devis et de sa version commerciale. Tools ne crée JAMAIS de devis :
-- il TRANSMET une estimation ; c'est un utilisateur Gestion Pro qui, explicitement, crée un devis BROUILLON (sans numéro)
-- depuis un import, puis le chiffre dans l'éditeur de devis existant.
--
-- Ce que fait cette migration (additive, aucune table existante modifiée, aucune fonction existante redéfinie) :
--   1. `gp_tools_imports` : un import = un snapshot IMMUABLE du contrat reçu + le dossier (client, chantier) lu par le
--      SERVEUR + une vérification serveur. Identifiants : import id, source id (relevé + état), source version (1, 2, 3…),
--      empreinte serveur (SHA-256) ;
--   2. `gp_tools_imports_lignes` : lignes normalisées (ouvrage, lot, état, unité GP, quantité, PU et montant estimatifs,
--      emplacement), chacune liée ou NON à une prestation GP, sans perte de donnée (la ligne du contrat est conservée) ;
--   3. `gp_tools_correspondances_ouvrages` : correspondance ouvrage Tools (clé code|unité) → prestation du catalogue GP ;
--   4. `gp_tools_imports_journal` : audit append-only (qui, quand, source, version, import, réimport, devis, correspondance) ;
--   5. RPC :
--      - `gp_tools_importer_estimation(relevé, état, contrat)` — double autorisation Tools (`sync-gp`) + GP (entreprise
--        GP ouverte, membre réel), contrat vérifié (nom, version 1.x, HT, aucune donnée commerciale), CONTRÔLE SERVEUR du
--        contenu (plans, lignes, quantités, montants retenus recalculés par le moteur du Lot 10), idempotence (même
--        empreinte → aucun doublon), nouvelle version sans jamais toucher un devis existant ;
--      - `gp_tools_import_comparer(a, b)` — écarts entre deux versions d'une même source ;
--      - `gp_tools_import_creer_devis(import, client, chantier)` — devis BROUILLON explicite, une seule fois par import ;
--      - `gp_tools_correspondance_enregistrer`, `gp_tools_import_appliquer_correspondances` ;
--      - `gp_tools_imports_releve(relevé)` — état des envois vu depuis Tools (sans donnée commerciale).
--
-- Ce qu'elle ne fait PAS : aucune écriture dans les tables Tools, aucun devis automatique, aucun numéro de devis, aucune
-- modification d'un devis existant (un réimport ne met jamais à jour un devis déjà travaillé).

-- ── 1. Correspondances ouvrage Tools → prestation GP ──────────────────────────
create table public.gp_tools_correspondances_ouvrages (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  -- Clé stable d'un ouvrage Tools : `ouvrageCle()` du domaine = « code (ou nom) en minuscules | unité ».
  tools_cle text not null check (char_length(tools_cle) between 3 and 300),
  tools_libelle text not null check (btrim(tools_libelle) <> '' and char_length(tools_libelle) <= 300),
  -- NULL : correspondance retirée, ou prestation GP supprimée depuis (les lignes redeviennent « non liées »).
  prestation_id uuid references public.prestations_catalogue(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.utilisateurs(id) on delete set null,
  updated_by uuid references public.utilisateurs(id) on delete set null,
  unique (entreprise_id, tools_cle)
);

-- ── 2. Imports (snapshot immuable) ────────────────────────────────────────────
create table public.gp_tools_imports (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  source_app text not null default 'tools' check (source_app = 'tools'),
  source_module text not null default 'releve-metre' check (source_module = 'releve-metre'),
  -- Source : relevé + état documenté. Pas de clé étrangère : l'historique GP survit au relevé Tools.
  source_releve_id uuid not null,
  source_etat text not null check (source_etat in ('existant','projete','as_built')),
  source_version integer not null check (source_version > 0),
  source_empreinte text not null check (source_empreinte ~ '^[0-9a-f]{64}$'),
  source_idempotency_key text not null check (char_length(source_idempotency_key) between 1 and 4000),
  contract_name text not null check (contract_name = 'elsatia.tools.estimation'),
  contract_version text not null check (contract_version ~ '^1\.[0-9]+\.[0-9]+$'),
  releve_nom text not null check (char_length(releve_nom) <= 200),
  releve_reference text,
  chantier_id uuid references public.chantiers(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  chantier_nom text not null,
  client_nom text,
  dossier jsonb not null,
  verification jsonb not null,
  nb_ouvrages integer not null check (nb_ouvrages >= 0),
  nb_lignes integer not null check (nb_lignes >= 0),
  nb_lignes_sans_prix integer not null check (nb_lignes_sans_prix >= 0),
  nb_lignes_liees integer not null check (nb_lignes_liees >= 0),
  montant_estimatif_ht numeric(14,2) not null,
  heures_estimees numeric(14,3) not null default 0,
  -- importe : reçu ; devis_cree : un devis brouillon en a été tiré ; remplace : une version plus récente existe et
  -- aucun devis n'avait été créé. Un import `devis_cree` reste `devis_cree` : `nouvelle_version_id` signale la suite.
  statut text not null default 'importe' check (statut in ('importe','devis_cree','remplace')),
  devis_id uuid references public.devis(id) on delete set null,
  devis_cree_le timestamptz,
  devis_cree_par uuid references public.utilisateurs(id) on delete set null,
  precedent_import_id uuid references public.gp_tools_imports(id) on delete set null,
  nouvelle_version_id uuid references public.gp_tools_imports(id) on delete set null,
  -- Contrat reçu, À L'IDENTIQUE (photos, annotations, anomalies, revêtements, prix, pièces, métadonnées compris).
  snapshot jsonb not null,
  transmis_par uuid references public.utilisateurs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, entreprise_id),
  unique (entreprise_id, source_releve_id, source_etat, source_version),
  unique (entreprise_id, source_releve_id, source_etat, source_empreinte)
);
create index gp_tools_imports_entreprise_idx on public.gp_tools_imports (entreprise_id, created_at desc);
create index gp_tools_imports_source_idx on public.gp_tools_imports (source_releve_id, source_etat, source_version desc);

create table public.gp_tools_imports_lignes (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null,
  entreprise_id uuid not null,
  ordre integer not null,
  ligne_ref text not null,
  ouvrage_ref text not null,
  ouvrage_cle text not null,
  ouvrage_code text,
  designation text not null,
  lot text not null,
  categorie text not null,
  nature text not null check (nature in ('quantite','forfait')),
  etat_projet text not null check (etat_projet in ('existant','a_deposer','nouveau','deplace')),
  unite text not null,
  quantite numeric(18,3),
  prix_unitaire_estimatif numeric(18,4),
  montant_estimatif numeric(14,2),
  montant_calcule numeric(14,2),
  heures numeric(14,3),
  corrige boolean not null default false,
  emplacement text not null,
  piece_ref text,
  prestation_id uuid references public.prestations_catalogue(id) on delete set null,
  correspondance text not null check (correspondance in ('liee','non_liee')),
  donnees jsonb not null,
  foreign key (import_id, entreprise_id) references public.gp_tools_imports(id, entreprise_id) on delete cascade,
  unique (import_id, ligne_ref)
);
create index gp_tools_imports_lignes_import_idx on public.gp_tools_imports_lignes (import_id, ordre);

create table public.gp_tools_imports_journal (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  import_id uuid references public.gp_tools_imports(id) on delete set null,
  action text not null check (action in ('import','nouvelle_version','reimport_identique','devis_cree','correspondance','correspondances_appliquees')),
  source_releve_id uuid,
  source_etat text,
  source_version integer,
  auteur_id uuid references public.utilisateurs(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index gp_tools_imports_journal_idx on public.gp_tools_imports_journal (entreprise_id, created_at desc);

-- ── 3. Gardes : snapshot immuable, journal append-only ────────────────────────
create or replace function public.gp_tools_import_garde()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Seuls évoluent : le statut, le devis tiré de l'import, le pointeur « nouvelle version », le compteur de lignes
  -- liées (correspondances complétées après coup) et les liens GP remis à
  -- NULL par une suppression (FK ON DELETE SET NULL). Le snapshot, la source et les montants sont immuables.
  if (to_jsonb(new) - array['statut','devis_id','devis_cree_le','devis_cree_par','nouvelle_version_id','nb_lignes_liees','chantier_id','client_id','precedent_import_id','transmis_par'])
     is distinct from (to_jsonb(old) - array['statut','devis_id','devis_cree_le','devis_cree_par','nouvelle_version_id','nb_lignes_liees','chantier_id','client_id','precedent_import_id','transmis_par'])
     or (new.chantier_id is distinct from old.chantier_id and new.chantier_id is not null)
     or (new.client_id is distinct from old.client_id and new.client_id is not null)
     or (new.precedent_import_id is distinct from old.precedent_import_id and new.precedent_import_id is not null)
     or (new.transmis_par is distinct from old.transmis_par and new.transmis_par is not null) then
    raise exception 'Import Tools immuable : le snapshot reçu ne peut pas être modifié' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger gp_tools_imports_garde before update on public.gp_tools_imports
  for each row execute function public.gp_tools_import_garde();

create or replace function public.gp_tools_import_ligne_garde()
returns trigger language plpgsql set search_path = public as $$
begin
  if (to_jsonb(new) - array['prestation_id','correspondance']) is distinct from (to_jsonb(old) - array['prestation_id','correspondance']) then
    raise exception 'Ligne importée immuable : seule sa correspondance GP peut évoluer' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger gp_tools_imports_lignes_garde before update on public.gp_tools_imports_lignes
  for each row execute function public.gp_tools_import_ligne_garde();

create or replace function public.gp_tools_journal_garde()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['import_id','auteur_id']) = (to_jsonb(old) - array['import_id','auteur_id'])
     and (new.import_id is null or new.import_id = old.import_id) and (new.auteur_id is null or new.auteur_id = old.auteur_id) then
    return new; -- FK ON DELETE SET NULL
  end if;
  raise exception 'Journal des imports Tools : append-only' using errcode = '42501';
end;
$$;
create trigger gp_tools_imports_journal_garde before update on public.gp_tools_imports_journal
  for each row execute function public.gp_tools_journal_garde();

revoke all on function public.gp_tools_import_garde(), public.gp_tools_import_ligne_garde(), public.gp_tools_journal_garde()
  from public, anon, authenticated, service_role;

-- ── 4. RLS : lecture GP (`acces_devis`), aucune écriture directe ──────────────
alter table public.gp_tools_imports enable row level security;
alter table public.gp_tools_imports_lignes enable row level security;
alter table public.gp_tools_imports_journal enable row level security;
alter table public.gp_tools_correspondances_ouvrages enable row level security;

-- Entreprises dont l'utilisateur peut lire les imports : membre ACTIF avec la permission GP `acces_devis`. Évaluée UNE
-- fois par requête (sous-requête `(select …)`, InitPlan) et non par ligne : 5 000 lignes se lisent en quelques ms.
create or replace function public.gp_tools_entreprises_lisibles()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(ue.entreprise_id), '{}'::uuid[])
  from public.utilisateurs_entreprises ue
  where ue.utilisateur_id = auth.uid() and ue.statut = 'actif'
    and public.est_membre_actif(ue.entreprise_id) and public.a_permission(ue.entreprise_id, 'acces_devis');
$$;
revoke all on function public.gp_tools_entreprises_lisibles() from public, anon;
grant execute on function public.gp_tools_entreprises_lisibles() to authenticated;

create policy gp_tools_imports_select on public.gp_tools_imports for select to authenticated
  using (entreprise_id = any ((select public.gp_tools_entreprises_lisibles())::uuid[]));
create policy gp_tools_imports_lignes_select on public.gp_tools_imports_lignes for select to authenticated
  using (entreprise_id = any ((select public.gp_tools_entreprises_lisibles())::uuid[]));
create policy gp_tools_imports_journal_select on public.gp_tools_imports_journal for select to authenticated
  using (entreprise_id = any ((select public.gp_tools_entreprises_lisibles())::uuid[]));
create policy gp_tools_correspondances_select on public.gp_tools_correspondances_ouvrages for select to authenticated
  using (entreprise_id = any ((select public.gp_tools_entreprises_lisibles())::uuid[]));

revoke all on public.gp_tools_imports, public.gp_tools_imports_lignes, public.gp_tools_imports_journal,
  public.gp_tools_correspondances_ouvrages from public, anon, authenticated;
grant select on public.gp_tools_imports, public.gp_tools_imports_lignes, public.gp_tools_imports_journal,
  public.gp_tools_correspondances_ouvrages to authenticated;
grant select, insert, update, delete on public.gp_tools_imports, public.gp_tools_imports_lignes, public.gp_tools_imports_journal,
  public.gp_tools_correspondances_ouvrages to service_role;

-- ── 5. Utilitaires internes ───────────────────────────────────────────────────
create or replace function public.gp_tools_unite(p_unite text)
returns text language sql immutable set search_path = public as $$
  select case p_unite when 'm2' then 'm²' when 'm3' then 'm³' when 'ml' then 'ml' when 'u' then 'u'
    when 'kg' then 'kg' when 'forfait' then 'forfait' else p_unite end;
$$;

create or replace function public.gp_tools_client_nom(p_client public.clients)
returns text language sql immutable set search_path = public as $$
  select nullif(coalesce(nullif(btrim(p_client.raison_sociale), ''), nullif(btrim(p_client.societe), ''),
    btrim(concat_ws(' ', p_client.prenom, p_client.nom))), '');
$$;

-- Lignes d'estimation telles que le SERVEUR les calcule (moteur du Lot 10), avec la référence du contrat
-- (`estimationDetails` : plan:ouvrage:pièce|etage-<étage>:état:nature). Interne : aucune vérification de droits ici.
create or replace function public.gp_tools_lignes_serveur(p_synthese jsonb)
returns table (ref text, quantite numeric, montant numeric, plan_cle text)
language sql immutable set search_path = public as $$
  -- Jointure par hachage (plan, ouvrage) : linéaire en lignes, même à 5 000 lignes × 1 000 ouvrages.
  with plans as (select s from jsonb_array_elements(coalesce(p_synthese, '[]'::jsonb)) s),
  ouvrages as (
    select distinct p.s->>'planId' as plan_id, o->>'id' as ouvrage_id
    from plans p cross join lateral jsonb_array_elements(coalesce(p.s->'quantitatif'->'ouvrages', '[]'::jsonb)) o),
  lignes as (
    select p.s->>'planId' as plan_id, p.s->>'etageId' as etage_id, p.s->>'numero' as numero, l
    from plans p cross join lateral jsonb_array_elements(coalesce(p.s->'estimation'->'lignes', '[]'::jsonb)) l)
  select x.plan_id || ':' || (x.l->>'ouvrageId') || ':' || coalesce(x.l->>'pieceId', 'etage-' || x.etage_id) || ':' || (x.l->>'etatProjet') || ':' || (x.l->>'nature'),
         (x.l->>'quantite')::numeric, (x.l->>'montantRetenu')::numeric, x.plan_id || '#' || x.numero
  from lignes x join ouvrages o on o.plan_id = x.plan_id and o.ouvrage_id = x.l->>'ouvrageId';
$$;

revoke all on function public.gp_tools_unite(text), public.gp_tools_client_nom(public.clients), public.gp_tools_lignes_serveur(jsonb)
  from public, anon, authenticated;

-- Contrôle du contrat reçu (miroir SQL de `validateEstimationGpPayload`, lot 10). Retourne le premier défaut, ou NULL.
create or replace function public.gp_tools_contrat_anomalie(p jsonb, p_releve_id uuid, p_etat text)
returns text language plpgsql immutable set search_path = public as $$
declare v_money constant text := '^-?[0-9]+\.[0-9]{2}$'; v_refs text[]; v_n integer;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return 'Contrat absent ou illisible'; end if;
  if jsonb_typeof(p->'contract') <> 'object' or p->'contract'->>'name' is distinct from 'elsatia.tools.estimation' then
    return format('Contrat inconnu : %s (attendu : elsatia.tools.estimation)', coalesce(p->'contract'->>'name', 'absent'));
  end if;
  if coalesce(p->'contract'->>'version', '') !~ '^1\.[0-9]+\.[0-9]+$' then
    return format('Version de contrat non prise en charge : %s (Gestion Pro accepte elsatia.tools.estimation 1.x)', coalesce(p->'contract'->>'version', 'absente'));
  end if;
  if p->>'kind' is distinct from 'releve-metre/estimation' then return 'Nature de contrat inattendue'; end if;
  if p->'readiness'->>'devis' is distinct from 'not-generated' then return 'Aucun devis ne doit être généré par Tools'; end if;
  if p->'montants'->>'base' is distinct from 'HT' or p->'montants'->>'devise' is distinct from 'EUR' then return 'Montants HT en euros attendus'; end if;
  if p->'source'->>'releveId' is distinct from p_releve_id::text or p->'source'->>'etat' is distinct from p_etat then
    return 'Le contrat ne correspond pas au relevé ou à l''état envoyé';
  end if;
  if p::text ~* '"[^"]*(numeroDevis|devisNumero|numeroFacture|facture|commande|signature|marge|remise|prixVente|prix_vente|tauxTva|tva|ttc|statutDevis|accepte|refuse)[^"]*"\s*:' then
    return 'Donnée commerciale interdite dans le contrat (devis, facture, commande, marge, remise, TVA, prix de vente) : Gestion Pro en décide';
  end if;
  if jsonb_typeof(p->'lignes') <> 'array' or jsonb_typeof(p->'quantitatif'->'ouvrages') <> 'array' or jsonb_typeof(p->'totaux') <> 'object' then
    return 'Contrat incomplet : lignes, ouvrages ou totaux absents';
  end if;
  if p->'quantitatif'->'contract'->>'name' is distinct from 'elsatia.tools.quantitatif' or coalesce(p->'quantitatif'->'contract'->>'version', '') !~ '^1\.[0-9]+\.[0-9]+$' then
    return 'Contrat quantitatif imbriqué non pris en charge (attendu elsatia.tools.quantitatif 1.x)';
  end if;
  v_n := jsonb_array_length(p->'lignes');
  if v_n > 20000 then return 'Contrat trop volumineux (plus de 20 000 lignes)'; end if;
  if coalesce(p->'totaux'->>'total', '') !~ v_money then return 'Total non décimal'; end if;
  select array_agg(o->>'ref') into v_refs from jsonb_array_elements(p->'quantitatif'->'ouvrages') o;
  if exists (select 1 from jsonb_array_elements(p->'lignes') l
             where jsonb_typeof(l) <> 'object' or coalesce(l->>'ref', '') = '' or not (l->>'ouvrageRef' = any(coalesce(v_refs, '{}')))
                or (l->>'montantRetenu' is not null and l->>'montantRetenu' !~ v_money)
                or (l->>'quantite' is not null and l->>'quantite' !~ '^-?[0-9]+(\.[0-9]+)?$')
                or coalesce(l->>'etatProjet', '') not in ('existant','a_deposer','nouveau','deplace')
                or coalesce(l->>'nature', '') not in ('quantite','forfait')) then
    return 'Ligne invalide : référence, ouvrage inconnu, quantité, montant ou état projeté';
  end if;
  if (select count(distinct l->>'ref') from jsonb_array_elements(p->'lignes') l) <> v_n then return 'Ligne en double dans le contrat'; end if;
  return null;
end;
$$;
revoke all on function public.gp_tools_contrat_anomalie(jsonb, uuid, text) from public, anon;
grant execute on function public.gp_tools_contrat_anomalie(jsonb, uuid, text) to authenticated;

-- ── 6. Import (Tools → GP) ────────────────────────────────────────────────────
create or replace function public.gp_tools_importer_estimation(p_releve_id uuid, p_etat text, p_payload jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  v_rel public.tools_releves;
  v_ent uuid;
  v_anomalie text;
  v_synth jsonb;
  v_ecarts integer;
  v_plans_payload text; v_plans_serveur text;
  v_total_serveur numeric; v_nb_serveur integer;
  v_empreinte text;
  v_texte text;
  v_existant public.gp_tools_imports;
  v_prec public.gp_tools_imports;
  v_version integer;
  v_id uuid;
  v_chantier public.chantiers; v_client public.clients;
  v_dossier jsonb;
  v_ouvrages jsonb;
  v_liees integer; v_sans integer; v_nb integer;
  v_statut text;
begin
  if v_uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_rel from public.tools_releves r where r.id = p_releve_id;
  -- Tenant : un relevé d'une autre entreprise est indiscernable d'un relevé inexistant.
  if v_rel.id is null or not public.tools_releve_peut(p_releve_id, 'view') then
    raise exception 'Relevé introuvable ou non accessible' using errcode = '42501';
  end if;
  v_ent := v_rel.entreprise_id;
  -- Droits GP : membre RÉEL (pas une session support) d'une entreprise dont Gestion Pro est ouvert (abonnement GP actif
  -- ou essai en cours). Vérifié AVANT la permission GP, pour un message exact quand Gestion Pro est fermé.
  if not public.est_membre_actif_reel(v_ent) or not public.application_commercialement_ouverte(v_ent, 'gestion_pro') then
    raise exception 'Gestion Pro n''est pas accessible pour cette entreprise' using errcode = '42501', hint = 'GP_INACCESSIBLE';
  end if;
  -- Droits Tools : rôle métreur / administrateur Relevé, capability `releve-metre`, permission GP `gerer_ouvrages`.
  if not public.tools_releve_peut(p_releve_id, 'sync-gp') then
    raise exception 'Envoi vers Gestion Pro non autorisé : rôle métreur ou administrateur Relevé et permission Gestion Pro « gerer_ouvrages » requis'
      using errcode = '42501';
  end if;
  if coalesce(p_etat, '') not in ('existant','projete','as_built') then
    raise exception 'État de synthèse inconnu : %', p_etat using errcode = '22023';
  end if;
  v_anomalie := public.gp_tools_contrat_anomalie(p_payload, p_releve_id, p_etat);
  if v_anomalie is not null then raise exception '%', v_anomalie using errcode = '22023', hint = 'CONTRAT_INVALIDE'; end if;

  -- Un seul import à la fois par source : deux envois concurrents ne créent ni doublon ni version fantôme.
  perform pg_advisory_xact_lock(hashtextextended('gp_tools_import:' || p_releve_id::text || ':' || p_etat, 0));

  -- Le serveur fait foi : l'estimation est recalculée (moteur du Lot 10, droits compris) et comparée au contrat.
  v_synth := public.tools_releve_estimation_synthese(p_releve_id, p_etat);
  select string_agg((pl->>'planId') || '#' || (pl->>'numero'), ',' order by (pl->>'planId') || '#' || (pl->>'numero'))
    into v_plans_payload from jsonb_array_elements(coalesce(p_payload->'source'->'plans', '[]'::jsonb)) pl;
  -- Une seule évaluation des lignes serveur ; comparaison ligne à ligne (référence, quantité, montant retenu).
  with srv as materialized (select * from public.gp_tools_lignes_serveur(v_synth)),
       cli as materialized (select l->>'ref' as ref, (l->>'quantite')::numeric as quantite, (l->>'montantRetenu')::numeric as montant
                            from jsonb_array_elements(p_payload->'lignes') l)
  select (select string_agg(distinct plan_cle, ',' order by plan_cle) from srv), (select coalesce(sum(montant), 0) from srv), (select count(*) from srv),
         (select count(*) from srv full join cli on cli.ref = srv.ref
          where srv.ref is null or cli.ref is null or srv.quantite is distinct from cli.quantite or srv.montant is distinct from cli.montant),
         (select string_agg(ref || '|' || coalesce(quantite::text, '') || '|' || coalesce(montant::text, ''), E'\n' order by ref) from srv)
    into v_plans_serveur, v_total_serveur, v_nb_serveur, v_ecarts, v_texte;
  if v_nb_serveur = 0 then
    raise exception 'Aucune ligne d''estimation à transmettre pour cet état' using errcode = '22023', hint = 'ESTIMATION_VIDE';
  end if;
  if v_ecarts > 0 or v_plans_payload is distinct from v_plans_serveur or v_total_serveur <> (p_payload->'totaux'->>'total')::numeric then
    raise exception 'L''estimation a changé depuis son chargement (plan, ouvrage, prix ou quantité modifiés ou supprimés) : rechargez-la puis renvoyez-la'
      using errcode = 'PT409', hint = 'SOURCE_OBSOLETE', detail = format('%s ligne(s) en écart', v_ecarts);
  end if;
  v_empreinte := encode(extensions.digest(convert_to(v_plans_serveur || E'\n' || v_texte, 'UTF8'), 'sha256'), 'hex');

  -- Idempotence : même source, même contenu → le même import, jamais un doublon silencieux.
  select * into v_existant from public.gp_tools_imports
  where entreprise_id = v_ent and source_releve_id = p_releve_id and source_etat = p_etat and source_empreinte = v_empreinte;
  if v_existant.id is not null then
    insert into public.gp_tools_imports_journal (entreprise_id, import_id, action, source_releve_id, source_etat, source_version, auteur_id, details)
    values (v_ent, v_existant.id, 'reimport_identique', p_releve_id, p_etat, v_existant.source_version, v_uid,
            jsonb_build_object('idempotencyKey', p_payload->>'idempotencyKey', 'contractVersion', p_payload->'contract'->>'version'));
    return jsonb_build_object('statut', 'deja_importe', 'importId', v_existant.id, 'version', v_existant.source_version,
      'montant', v_existant.montant_estimatif_ht, 'lignes', v_existant.nb_lignes, 'ouvrages', v_existant.nb_ouvrages,
      'devisCree', v_existant.devis_id is not null, 'nouvelleVersionId', v_existant.nouvelle_version_id);
  end if;

  select * into v_prec from public.gp_tools_imports
  where entreprise_id = v_ent and source_releve_id = p_releve_id and source_etat = p_etat order by source_version desc limit 1;
  v_version := coalesce(v_prec.source_version, 0) + 1;

  -- Dossier lu par le SERVEUR (GP autoritaire sur client et chantier), jamais depuis le contrat.
  if v_rel.chantier_gp_id is not null then
    select * into v_chantier from public.chantiers c where c.id = v_rel.chantier_gp_id and c.entreprise_id = v_ent;
  end if;
  select * into v_client from public.clients c where c.id = coalesce(v_rel.client_gp_id, v_chantier.client_id) and c.entreprise_id = v_ent;
  v_dossier := jsonb_build_object(
    'releve', jsonb_build_object('id', v_rel.id, 'nom', v_rel.nom, 'reference', v_rel.reference, 'statut', v_rel.statut, 'dateReleve', v_rel.date_releve, 'revision', v_rel.revision),
    'chantier', jsonb_build_object('gpId', v_chantier.id, 'nom', coalesce(v_chantier.nom, v_rel.chantier_nom), 'nomTools', v_rel.chantier_nom,
      'adresse', v_rel.chantier_adresse, 'codePostal', v_rel.chantier_code_postal, 'ville', v_rel.chantier_ville),
    'client', jsonb_build_object('gpId', v_client.id, 'nom', coalesce(public.gp_tools_client_nom(v_client), v_rel.client_nom), 'nomTools', v_rel.client_nom),
    'transmission', jsonb_build_object('par', v_uid, 'le', now(), 'contrat', p_payload->'contract', 'idempotencyKey', p_payload->>'idempotencyKey'));

  select coalesce(jsonb_object_agg(o->>'ref', o), '{}'::jsonb) into v_ouvrages from jsonb_array_elements(p_payload->'quantitatif'->'ouvrages') o;
  select count(*) into v_sans from jsonb_array_elements(p_payload->'lignes') l where l->>'montantRetenu' is null;

  insert into public.gp_tools_imports (
    entreprise_id, source_releve_id, source_etat, source_version, source_empreinte, source_idempotency_key, contract_name, contract_version,
    releve_nom, releve_reference, chantier_id, client_id, chantier_nom, client_nom, dossier, verification,
    nb_ouvrages, nb_lignes, nb_lignes_sans_prix, nb_lignes_liees, montant_estimatif_ht, heures_estimees,
    precedent_import_id, snapshot, transmis_par)
  values (
    v_ent, p_releve_id, p_etat, v_version, v_empreinte, left(coalesce(p_payload->>'idempotencyKey', v_empreinte), 4000),
    p_payload->'contract'->>'name', p_payload->'contract'->>'version',
    left(v_rel.nom, 200), v_rel.reference, v_chantier.id, v_client.id, coalesce(v_chantier.nom, v_rel.chantier_nom),
    coalesce(public.gp_tools_client_nom(v_client), v_rel.client_nom), v_dossier,
    jsonb_build_object('empreinte', v_empreinte, 'lignes', v_nb_serveur, 'totalServeur', v_total_serveur::text, 'plans', v_plans_serveur, 'moteur', 'estimation-v1', 'verifieLe', now()),
    jsonb_array_length(p_payload->'quantitatif'->'ouvrages'), v_nb_serveur, v_sans, 0, v_total_serveur,
    coalesce(nullif(p_payload->'totaux'->>'heures', '')::numeric, 0), v_prec.id, p_payload, v_uid)
  returning id into v_id;

  insert into public.gp_tools_imports_lignes (
    import_id, entreprise_id, ordre, ligne_ref, ouvrage_ref, ouvrage_cle, ouvrage_code, designation, lot, categorie, nature, etat_projet,
    unite, quantite, prix_unitaire_estimatif, montant_estimatif, montant_calcule, heures, corrige, emplacement, piece_ref,
    prestation_id, correspondance, donnees)
  select v_id, v_ent, x.n::integer, l->>'ref', l->>'ouvrageRef', coalesce(o->>'cle', l->>'ouvrageRef'), o->>'code', coalesce(o->>'nom', 'Ouvrage'),
    coalesce(o->>'lot', 'Autre'), coalesce(o->>'categorie', 'autre'), l->>'nature', l->>'etatProjet', public.gp_tools_unite(l->>'unite'),
    (l->>'quantite')::numeric, (l->>'prixUnitaire')::numeric, (l->>'montantRetenu')::numeric, (l->>'montantCalcule')::numeric,
    (l->>'heures')::numeric, jsonb_typeof(l->'correction') = 'object',
    coalesce(nullif(concat_ws(' › ', l->'emplacement'->'chantier'->>'nom', l->'emplacement'->'batiment'->>'nom', l->'emplacement'->'etage'->>'nom',
      l->'emplacement'->'zone'->>'nom', l->'emplacement'->'piece'->>'nom'), ''), '—'),
    l->'emplacement'->'piece'->>'id',
    p.id, case when p.id is null then 'non_liee' else 'liee' end,
    jsonb_build_object('ligne', l, 'ouvrage', o)
  from jsonb_array_elements(p_payload->'lignes') with ordinality x(l, n)
  left join lateral (select v_ouvrages->(x.l->>'ouvrageRef') as o) oo on true
  left join public.gp_tools_correspondances_ouvrages c on c.entreprise_id = v_ent and c.tools_cle = coalesce(oo.o->>'cle', '')
  left join public.prestations_catalogue p on p.id = c.prestation_id and p.entreprise_id = v_ent and p.actif;

  select count(*), count(*) filter (where correspondance = 'liee')
    into v_nb, v_liees from public.gp_tools_imports_lignes where import_id = v_id;
  -- Seul compteur évolutif (les correspondances peuvent être complétées ensuite) ; la garde l'autorise.
  update public.gp_tools_imports set nb_lignes_liees = v_liees where id = v_id;

  -- Versions précédentes : jamais écrasées. Un devis déjà tiré d'une version précédente reste intact ; il est seulement
  -- signalé « nouvelle version disponible » (nouvelle_version_id), avec comparaison.
  update public.gp_tools_imports
  set nouvelle_version_id = v_id, statut = case when statut = 'importe' then 'remplace' else statut end
  where entreprise_id = v_ent and source_releve_id = p_releve_id and source_etat = p_etat and id <> v_id and nouvelle_version_id is null;

  v_statut := case when v_prec.id is null then 'importe' else 'nouvelle_version' end;
  insert into public.gp_tools_imports_journal (entreprise_id, import_id, action, source_releve_id, source_etat, source_version, auteur_id, details)
  values (v_ent, v_id, case when v_prec.id is null then 'import' else 'nouvelle_version' end, p_releve_id, p_etat, v_version, v_uid,
          jsonb_build_object('lignes', v_nb, 'ouvrages', jsonb_array_length(p_payload->'quantitatif'->'ouvrages'), 'montant', v_total_serveur::text,
            'contractVersion', p_payload->'contract'->>'version', 'precedentImportId', v_prec.id, 'devisPrecedent', v_prec.devis_id));
  insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
  values (v_ent, v_uid, case when v_prec.id is null then 'import' else 'reimport' end, 'import_tools', v_id,
          format('Import Tools Relevé « %s » — version %s', v_rel.nom, v_version),
          jsonb_build_object('source', 'tools', 'releveId', p_releve_id, 'etat', p_etat, 'version', v_version, 'montantEstimatifHt', v_total_serveur::text));

  return jsonb_build_object('statut', v_statut, 'importId', v_id, 'version', v_version, 'precedentImportId', v_prec.id,
    'devisPrecedent', v_prec.devis_id is not null, 'montant', v_total_serveur, 'lignes', v_nb, 'lignesLiees', v_liees, 'lignesSansPrix', v_sans,
    'ouvrages', jsonb_array_length(p_payload->'quantitatif'->'ouvrages'));
end;
$$;

-- ── 7. Comparaison de deux versions d'une même source ─────────────────────────
create or replace function public.gp_tools_import_comparer(p_import_id uuid, p_autre_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a public.gp_tools_imports; b public.gp_tools_imports; v_out jsonb;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into a from public.gp_tools_imports where id = p_import_id;
  select * into b from public.gp_tools_imports where id = p_autre_id;
  if a.id is null or b.id is null or a.entreprise_id <> b.entreprise_id
     or not public.est_membre_actif(a.entreprise_id) or not public.a_permission(a.entreprise_id, 'acces_devis') then
    raise exception 'Import introuvable ou non accessible' using errcode = '42501';
  end if;
  if a.source_releve_id <> b.source_releve_id or a.source_etat <> b.source_etat then
    raise exception 'Seules deux versions d''une même source Tools se comparent' using errcode = '22023';
  end if;
  with la as (select * from public.gp_tools_imports_lignes where import_id = a.id),
       lb as (select * from public.gp_tools_imports_lignes where import_id = b.id),
       d as (
         select coalesce(lb.ligne_ref, la.ligne_ref) as ref, coalesce(lb.designation, la.designation) as designation,
                coalesce(lb.lot, la.lot) as lot, coalesce(lb.emplacement, la.emplacement) as emplacement, coalesce(lb.etat_projet, la.etat_projet) as etat,
                coalesce(lb.unite, la.unite) as unite,
                la.quantite as qa, lb.quantite as qb, la.montant_estimatif as ma, lb.montant_estimatif as mb,
                case when la.id is null then 'ajoutee' when lb.id is null then 'supprimee'
                     when la.quantite is distinct from lb.quantite or la.montant_estimatif is distinct from lb.montant_estimatif then 'modifiee'
                     else 'identique' end as statut,
                coalesce(lb.ordre, la.ordre + 1000000) as ordre
         from la full join lb on la.ligne_ref = lb.ligne_ref)
  select jsonb_build_object(
    'a', jsonb_build_object('id', a.id, 'version', a.source_version, 'montant', a.montant_estimatif_ht, 'lignes', a.nb_lignes, 'le', a.created_at),
    'b', jsonb_build_object('id', b.id, 'version', b.source_version, 'montant', b.montant_estimatif_ht, 'lignes', b.nb_lignes, 'le', b.created_at),
    'ecart', b.montant_estimatif_ht - a.montant_estimatif_ht,
    'compteurs', jsonb_build_object(
      'ajoutees', count(*) filter (where statut = 'ajoutee'), 'supprimees', count(*) filter (where statut = 'supprimee'),
      'modifiees', count(*) filter (where statut = 'modifiee'), 'identiques', count(*) filter (where statut = 'identique')),
    'parLot', (select coalesce(jsonb_agg(jsonb_build_object('lot', lot, 'a', ma, 'b', mb, 'ecart', mb - ma) order by lot), '[]'::jsonb)
               from (select lot, coalesce(sum(ma), 0) as ma, coalesce(sum(mb), 0) as mb from d group by lot) t where ma <> mb),
    -- Détail borné (les 500 premiers écarts) : le compteur, lui, est exact.
    'lignes', (select coalesce(jsonb_agg(jsonb_build_object('ref', ref, 'designation', designation, 'lot', lot, 'emplacement', emplacement, 'etat', etat,
                 'unite', unite, 'statut', statut, 'quantiteA', qa, 'quantiteB', qb, 'montantA', ma, 'montantB', mb) order by ordre), '[]'::jsonb)
               from (select * from d where statut <> 'identique' order by ordre limit 500) t))
  into v_out from d;
  return v_out;
end;
$$;

-- ── 8. Correspondances ouvrage Tools → prestation GP ──────────────────────────
create or replace function public.gp_tools_correspondance_enregistrer(p_entreprise_id uuid, p_tools_cle text, p_tools_libelle text, p_prestation_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if not public.est_membre_actif_reel(p_entreprise_id) or not public.a_permission(p_entreprise_id, 'gerer_devis') then
    raise exception 'Correspondance non autorisée : permission Gestion Pro « gerer_devis » requise' using errcode = '42501';
  end if;
  if p_prestation_id is not null and not exists (select 1 from public.prestations_catalogue p where p.id = p_prestation_id and p.entreprise_id = p_entreprise_id) then
    raise exception 'Prestation introuvable dans cette entreprise' using errcode = '42501';
  end if;
  if coalesce(char_length(p_tools_cle), 0) not between 3 and 300 or coalesce(btrim(p_tools_libelle), '') = '' then
    raise exception 'Ouvrage Tools invalide' using errcode = '22023';
  end if;
  insert into public.gp_tools_correspondances_ouvrages (entreprise_id, tools_cle, tools_libelle, prestation_id, created_by, updated_by)
  values (p_entreprise_id, p_tools_cle, left(btrim(p_tools_libelle), 300), p_prestation_id, auth.uid(), auth.uid())
  on conflict (entreprise_id, tools_cle) do update
    set prestation_id = excluded.prestation_id, tools_libelle = excluded.tools_libelle, updated_at = now(), updated_by = auth.uid()
  returning id into v_id;
  insert into public.gp_tools_imports_journal (entreprise_id, action, auteur_id, details)
  values (p_entreprise_id, 'correspondance', auth.uid(), jsonb_build_object('toolsCle', p_tools_cle, 'prestationId', p_prestation_id));
  return v_id;
end;
$$;

-- Réapplique les correspondances actuelles aux lignes d'un import (sans toucher au snapshot ni à un devis).
create or replace function public.gp_tools_import_appliquer_correspondances(p_import_id uuid)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare v_imp public.gp_tools_imports; v_n integer;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_imp from public.gp_tools_imports where id = p_import_id;
  if v_imp.id is null or not public.est_membre_actif_reel(v_imp.entreprise_id) or not public.a_permission(v_imp.entreprise_id, 'gerer_devis') then
    raise exception 'Import introuvable ou non accessible' using errcode = '42501';
  end if;
  with cible as (
    select l.id, p.id as prestation_id
    from public.gp_tools_imports_lignes l
    left join public.gp_tools_correspondances_ouvrages c on c.entreprise_id = l.entreprise_id and c.tools_cle = l.ouvrage_cle
    left join public.prestations_catalogue p on p.id = c.prestation_id and p.entreprise_id = l.entreprise_id and p.actif
    where l.import_id = p_import_id)
  update public.gp_tools_imports_lignes l
  set prestation_id = cible.prestation_id, correspondance = case when cible.prestation_id is null then 'non_liee' else 'liee' end
  from cible where cible.id = l.id
    and (l.prestation_id is distinct from cible.prestation_id or l.correspondance <> case when cible.prestation_id is null then 'non_liee' else 'liee' end);
  get diagnostics v_n = row_count;
  update public.gp_tools_imports set nb_lignes_liees = (select count(*) from public.gp_tools_imports_lignes where import_id = p_import_id and correspondance = 'liee')
  where id = p_import_id;
  insert into public.gp_tools_imports_journal (entreprise_id, import_id, action, source_releve_id, source_etat, source_version, auteur_id, details)
  values (v_imp.entreprise_id, p_import_id, 'correspondances_appliquees', v_imp.source_releve_id, v_imp.source_etat, v_imp.source_version, auth.uid(),
          jsonb_build_object('lignesModifiees', v_n));
  return v_n;
end;
$$;

-- ── 9. Création EXPLICITE d'un devis brouillon depuis un import (côté GP) ─────
-- Une ligne de devis par ouvrage × état projeté × nature. Ligne liée : prestation GP (désignation, type, unité, PRIX
-- DE VENTE et TVA du catalogue GP). Ligne non liée : désignation Tools, base estimative HT Tools comme point de départ
-- (TVA par défaut GP), à chiffrer dans GP. Aucun numéro (brouillon) ; le devis est ensuite la propriété de GP.
create or replace function public.gp_tools_import_creer_devis(p_import_id uuid, p_client_id uuid default null, p_chantier_id uuid default null)
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_imp public.gp_tools_imports; v_client uuid; v_chantier uuid; v_devis uuid; v_suivant integer; v_lignes integer;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select * into v_imp from public.gp_tools_imports where id = p_import_id for update;
  if v_imp.id is null or not public.est_membre_actif(v_imp.entreprise_id) or not public.a_permission(v_imp.entreprise_id, 'acces_devis') then
    raise exception 'Import introuvable ou non accessible' using errcode = '42501';
  end if;
  if not public.est_membre_actif_reel(v_imp.entreprise_id) or not public.a_permission(v_imp.entreprise_id, 'gerer_devis') then
    raise exception 'Création de devis non autorisée : permission Gestion Pro « gerer_devis » requise' using errcode = '42501';
  end if;
  if v_imp.devis_id is not null then
    raise exception 'Un devis a déjà été créé depuis cet import' using errcode = '23505', hint = 'DEVIS_EXISTANT';
  end if;
  if v_imp.nouvelle_version_id is not null then
    select source_version into v_suivant from public.gp_tools_imports where id = v_imp.nouvelle_version_id;
    raise exception 'Une version plus récente de ce relevé a été importée (version %) : comparez-la, puis créez le devis depuis la dernière version', v_suivant
      using errcode = 'PT409', hint = 'VERSION_PERIMEE';
  end if;
  v_client := coalesce(p_client_id, v_imp.client_id);
  v_chantier := coalesce(p_chantier_id, v_imp.chantier_id);
  if v_client is null then raise exception 'Choisissez le client Gestion Pro du devis' using errcode = '22023', hint = 'CLIENT_REQUIS'; end if;
  if not exists (select 1 from public.clients c where c.id = v_client and c.entreprise_id = v_imp.entreprise_id) then
    raise exception 'Client introuvable dans cette entreprise' using errcode = '42501';
  end if;
  if v_chantier is not null and not exists (select 1 from public.chantiers c where c.id = v_chantier and c.entreprise_id = v_imp.entreprise_id) then
    raise exception 'Chantier introuvable dans cette entreprise' using errcode = '42501';
  end if;

  insert into public.devis (entreprise_id, client_id, chantier_id, statut, notes_internes)
  values (v_imp.entreprise_id, v_client, v_chantier, 'brouillon',
    format('Créé depuis l''import Tools Relevé « %s » — version %s du %s (base estimative HT Tools : %s €). Prix de vente, marge, remise et TVA sont décidés dans Gestion Pro.',
      v_imp.releve_nom, v_imp.source_version, to_char(v_imp.created_at at time zone 'Europe/Paris', 'DD/MM/YYYY'), to_char(v_imp.montant_estimatif_ht, 'FM999G999G990D00')))
  returning id into v_devis;

  insert into public.lignes_devis (devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
  select v_devis,
    coalesce(p.designation, g.designation),
    left(concat_ws(' · ', 'Lot ' || g.lot,
      case g.etat_projet when 'a_deposer' then 'dépose' when 'deplace' then 'déplacement' when 'existant' then 'travaux sur existant' else 'neuf' end,
      g.emplacements || case when g.emplacements > 1 then ' emplacements' else ' emplacement' end,
      case when p.id is null then case when g.montant is null then 'sans prix estimatif Tools' else 'base estimative HT Tools ' || to_char(g.montant, 'FM999G999G990D00') || ' €' end
           else 'prestation GP liée' end,
      'import Tools v' || v_imp.source_version), 2000),
    coalesce(p.type, case when g.nature = 'forfait' then 'forfait' else 'fourniture' end),
    case when g.nature = 'forfait' then 1 else g.quantite end,
    coalesce(p.unite, case when g.nature = 'forfait' then 'forfait' else g.unite end),
    coalesce(p.prix_unitaire_ht,
      case when g.montant is null then 0 when g.nature = 'forfait' then g.montant
           when g.quantite > 0 then round(g.montant / g.quantite, 4) else 0 end),
    0, coalesce(p.taux_tva, 20), g.rang::integer
  from (
    select row_number() over (order by min(l.ordre)) as rang, l.ouvrage_ref, l.nature, l.etat_projet,
      min(l.designation) as designation, min(l.lot) as lot, min(l.unite) as unite,
      sum(l.quantite) as quantite, sum(l.montant_estimatif) as montant, count(*) as emplacements,
      (array_agg(l.prestation_id) filter (where l.prestation_id is not null))[1] as prestation_id
    from public.gp_tools_imports_lignes l
    where l.import_id = p_import_id and l.quantite is not null
    group by l.ouvrage_ref, l.nature, l.etat_projet
  ) g
  left join public.prestations_catalogue p on p.id = g.prestation_id and p.entreprise_id = v_imp.entreprise_id and p.actif;
  get diagnostics v_lignes = row_count;

  update public.gp_tools_imports set statut = 'devis_cree', devis_id = v_devis, devis_cree_le = now(), devis_cree_par = auth.uid() where id = p_import_id;
  insert into public.gp_tools_imports_journal (entreprise_id, import_id, action, source_releve_id, source_etat, source_version, auteur_id, details)
  values (v_imp.entreprise_id, p_import_id, 'devis_cree', v_imp.source_releve_id, v_imp.source_etat, v_imp.source_version, auth.uid(),
          jsonb_build_object('devisId', v_devis, 'lignesDevis', v_lignes, 'clientId', v_client, 'chantierId', v_chantier));
  insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
  values (v_imp.entreprise_id, auth.uid(), 'creation', 'devis', v_devis, format('Devis brouillon créé depuis l''import Tools « %s » v%s', v_imp.releve_nom, v_imp.source_version),
          jsonb_build_object('importId', p_import_id, 'source', 'tools'));
  return v_devis;
end;
$$;

-- ── 10. État des envois vu depuis Tools (aucune donnée commerciale) ───────────
create or replace function public.gp_tools_imports_releve(p_releve_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ent uuid;
begin
  if auth.uid() is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  select entreprise_id into v_ent from public.tools_releves where id = p_releve_id;
  if v_ent is null or not public.tools_releve_peut(p_releve_id, 'view') then
    raise exception 'Relevé introuvable ou non accessible' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('importId', i.id, 'etat', i.source_etat, 'version', i.source_version, 'le', i.created_at,
      'montant', i.montant_estimatif_ht, 'lignes', i.nb_lignes, 'ouvrages', i.nb_ouvrages, 'contractVersion', i.contract_version,
      'priseEnCharge', i.devis_id is not null, 'nouvelleVersion', i.nouvelle_version_id is not null) order by i.source_etat, i.source_version desc)
    from public.gp_tools_imports i where i.entreprise_id = v_ent and i.source_releve_id = p_releve_id), '[]'::jsonb);
end;
$$;

-- ── 11. Droits d'exécution ────────────────────────────────────────────────────
revoke all on function public.gp_tools_importer_estimation(uuid, text, jsonb), public.gp_tools_import_comparer(uuid, uuid),
  public.gp_tools_correspondance_enregistrer(uuid, text, text, uuid), public.gp_tools_import_appliquer_correspondances(uuid),
  public.gp_tools_import_creer_devis(uuid, uuid, uuid), public.gp_tools_imports_releve(uuid) from public, anon;
grant execute on function public.gp_tools_importer_estimation(uuid, text, jsonb), public.gp_tools_import_comparer(uuid, uuid),
  public.gp_tools_correspondance_enregistrer(uuid, text, text, uuid), public.gp_tools_import_appliquer_correspondances(uuid),
  public.gp_tools_import_creer_devis(uuid, uuid, uuid), public.gp_tools_imports_releve(uuid) to authenticated;

-- Mode sûr incident : toute nouvelle table reçoit sa garde d'écriture (pgTAP incident_safe_mode_v1).
select public.incident_installer_gardes();
