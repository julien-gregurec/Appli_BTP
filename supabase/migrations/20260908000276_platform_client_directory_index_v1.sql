-- ELSATIA-PLATFORM-CLIENT-DIRECTORY-INDEX-V1
--
-- Annuaire des entreprises clientes : recherche, filtres, tris et pagination
-- SERVEUR, plus les index qui les rendent tenables à 500 comme à 5 000 entreprises.
--
-- PROVENANCE. Contenu métier repris de
-- `docs/migrations-proposees/platform-client-directory-index-v1.sql.proposed`
-- (lot annuaire plateforme), laissé sans numéro parce qu'un train global était
-- en cours. Le Train V3 le numérote à la suite réelle du ledger.
--
-- CONTRE-AUDIT DE REPRISE, contre le ledger du train :
--   • toutes les colonnes indexées existent sur `public.entreprises`
--     (raison_sociale, ville, siret, abonnement_statut, abonnement_echeance,
--     suspension_prevue_at, remise_appliquee_at) ;
--   • `plateforme_exiger_permission()` et `plateforme_journaliser()` existent ;
--   • `pg_trgm` est déjà installée par la migration 00247 ;
--   • le piège d'indexation est traité à la source : `unaccent()` est STABLE et
--     ne peut pas entrer telle quelle dans un index d'expression, d'où le
--     wrapper IMMUTABLE qui nomme explicitement le dictionnaire.
--
-- L'export CSV de l'annuaire échoue si sa journalisation échoue : c'est une
-- exigence du lot, portée par le code appelant et par `plateforme_journaliser`.

create extension if not exists unaccent;

-- `unaccent()` est STABLE (il dépend d'un dictionnaire) : on la fige dans un
-- wrapper IMMUTABLE en nommant explicitement le dictionnaire. C'est la forme
-- recommandée pour un index d'expression.
create or replace function public.elsatia_normaliser_recherche(p_valeur text)
returns text
language sql
immutable
parallel safe
strict
set search_path = public, pg_catalog
as $$
  select lower(public.unaccent('public.unaccent'::regdictionary, p_valeur));
$$;

comment on function public.elsatia_normaliser_recherche(text) is
  'Normalisation de recherche partagée avec le client TypeScript : minuscules et diacritiques retirés. IMMUTABLE pour être indexable.';

-- Un SIRET saisi « 123 456 789 00012 » doit rejoindre « 12345678900012 ».
create or replace function public.elsatia_chiffres_seuls(p_valeur text)
returns text
language sql
immutable
parallel safe
strict
as $$
  select regexp_replace(p_valeur, '[^0-9]', '', 'g');
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 2 — Index
--
-- Sans ces index, un `ilike '%terme%'` sur 5 000 lignes reste un scan complet.
-- `pg_trgm` rend la recherche partielle indexable ; les index B-tree servent
-- au tri serveur et aux filtres d'onglet.
-- ───────────────────────────────────────────────────────────────────────────

create extension if not exists pg_trgm;

create index if not exists entreprises_recherche_nom_trgm
  on public.entreprises using gin (public.elsatia_normaliser_recherche(nom) gin_trgm_ops);

create index if not exists entreprises_recherche_raison_trgm
  on public.entreprises using gin (public.elsatia_normaliser_recherche(coalesce(raison_sociale, '')) gin_trgm_ops);

create index if not exists entreprises_recherche_ville_trgm
  on public.entreprises using gin (public.elsatia_normaliser_recherche(coalesce(ville, '')) gin_trgm_ops);

create index if not exists entreprises_siret_chiffres
  on public.entreprises (public.elsatia_chiffres_seuls(coalesce(siret, '')));

-- Tri et filtres : les colonnes réellement offertes au tri par l'écran.
create index if not exists entreprises_created_at_idx on public.entreprises (created_at desc);
create index if not exists entreprises_statut_echeance_idx
  on public.entreprises (abonnement_statut, abonnement_echeance);
create index if not exists entreprises_suspension_idx
  on public.entreprises (suspension_prevue_at) where suspension_prevue_at is not null;
create index if not exists entreprises_remise_idx
  on public.entreprises (remise_appliquee_at) where remise_appliquee_at is not null;

-- Jointures d'enrichissement, appelées une fois par page.
create index if not exists abonnements_entreprises_entreprise_idx
  on public.abonnements_entreprises (entreprise_id);
create index if not exists factures_abonnement_entreprise_date_idx
  on public.factures_abonnement (entreprise_id, created_at desc);
create index if not exists acces_applications_entreprises_entreprise_idx
  on public.acces_applications_entreprises (entreprise_id) where autorise;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 3 — RPC d'annuaire : recherche, filtres, onglet, tri, pagination
--
-- Contrat attendu par `src/lib/plateforme-annuaire-serveur.ts::sourceSupabase`.
-- Tant que cette fonction n'existe pas, l'application détecte son absence
-- (codes 42883 / PGRST202) et bascule en mode dégradé en l'affichant.
--
-- Retour : jsonb { lignes: [...], total: int, compteurs: {...}, resume: [...] }
-- Chaque ligne porte exactement les champs du type `LigneAnnuaire`.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.plateforme_annuaire_entreprises(
  p_recherche text default '',
  p_onglet text default 'toutes',
  p_tri text default 'date_inscription',
  p_sens text default 'desc',
  p_page integer default 1,
  p_taille integer default 25,
  p_filtres jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_terme      text    := nullif(btrim(p_recherche), '');
  v_terme_n    text    := case when v_terme is null then null else public.elsatia_normaliser_recherche(v_terme) end;
  v_chiffres   text    := case when v_terme is null then null else public.elsatia_chiffres_seuls(v_terme) end;
  v_page       integer := greatest(coalesce(p_page, 1), 1);
  -- Plafond DUR : aucune page ne dépasse 100 lignes, quelle que soit la demande.
  v_taille     integer := least(greatest(coalesce(p_taille, 25), 1), 100);
  v_offset     integer := (v_page - 1) * v_taille;
  v_tri        text    := coalesce(p_tri, 'date_inscription');
  v_sens       text    := case when lower(coalesce(p_sens, 'desc')) = 'asc' then 'asc' else 'desc' end;
  v_maintenant timestamptz := now();
  v_total      integer;
  v_lignes     jsonb;
begin
  -- Le rôle plateforme fait autorité ici, pas l'écran.
  perform public.plateforme_exiger_permission('consulter_plateforme');
  perform public.appliquer_suspensions_impayes();

  -- La liste blanche de tri interdit toute injection d'ordre depuis l'URL.
  if v_tri not in (
    'nom','date_inscription','forfait','montant','prochaine_echeance',
    'montant_impaye','derniere_activite','comptes_actifs','fin_remise'
  ) then
    v_tri := 'date_inscription';
  end if;

  with base as (
    select
      e.*,
      ab.code_offre           as ab_code_offre,
      ab.periodicite          as ab_periodicite,
      ab.prix_contractuel_ht  as ab_prix_contractuel_ht,
      -- Situation de paiement, dans le même ordre de priorité que le TypeScript :
      -- impayé signalé > état Stripe > essai. Une facturation illisible ne peut
      -- pas produire « à jour » : elle produit 'inconnu'.
      case
        when e.suspension_prevue_at is not null then 'impaye'
        when ab.statut = 'impaye'               then 'impaye'
        when e.derniere_facture_statut = 'uncollectible' then 'impaye'
        when e.abonnement_statut = 'annule'     then 'sans_objet'
        when e.derniere_facture_statut in ('open','draft')
             and e.abonnement_echeance < current_date then 'retard'
        when e.derniere_facture_statut in ('open','draft') then 'en_attente'
        when e.derniere_facture_statut in ('paid','void') then 'a_jour'
        when e.abonnement_statut = 'essai'      then 'sans_objet'
        else 'inconnu'
      end as paiement,
      (select count(*) from public.employes em
        where em.entreprise_id = e.id and em.compte_application_statut = 'actif') as nb_comptes_actifs,
      (select count(*) from public.employes em
        where em.entreprise_id = e.id and em.statut <> 'sorti') as nb_salaries,
      (select max(em.derniere_connexion_at) from public.employes em
        where em.entreprise_id = e.id) as derniere_activite,
      (select coalesce(array_agg(me.module_code order by me.module_code), '{}')
         from public.modules_entreprises me
        where me.entreprise_id = e.id and me.actif) as modules_actifs,
      (select coalesce(array_agg(ae.application_code order by ae.application_code), '{}')
         from public.acces_applications_entreprises ae
        where ae.entreprise_id = e.id and ae.autorise) as applications_actives,
      (select u.email from public.utilisateurs_entreprises ue
         join auth.users u on u.id = ue.utilisateur_id
        where ue.entreprise_id = e.id and ue.statut = 'actif'
        order by ue.created_at limit 1) as proprietaire_email
    from public.entreprises e
    left join public.abonnements_entreprises ab on ab.entreprise_id = e.id
  ),
  filtree as (
    select * from base b
    where
      (v_terme_n is null
       or public.elsatia_normaliser_recherche(b.nom) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.raison_sociale,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.ville,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.code_postal,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.reference_interne,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.code_adhesion,'')) like '%' || v_terme_n || '%'
       or public.elsatia_normaliser_recherche(coalesce(b.proprietaire_email,'')) like '%' || v_terme_n || '%'
       or (length(v_chiffres) >= 3
           and public.elsatia_chiffres_seuls(coalesce(b.siret,'')) like '%' || v_chiffres || '%'))
      and (p_onglet is null or p_onglet = 'toutes'
       or (p_onglet = 'actives'          and b.abonnement_statut = 'actif' and b.paiement <> 'impaye')
       or (p_onglet = 'essais'           and b.abonnement_statut = 'essai')
       or (p_onglet = 'a_renouveler'     and (b.abonnement_echeance between current_date and current_date + 30
                                          or b.abonnement_essai_fin between current_date and current_date + 30))
       or (p_onglet = 'paiement_attente' and b.paiement = 'en_attente')
       or (p_onglet = 'retards'          and b.paiement = 'retard')
       or (p_onglet = 'impayes'          and b.paiement = 'impaye')
       or (p_onglet = 'suspendues'       and b.abonnement_statut = 'suspendu')
       or (p_onglet = 'resiliees'        and (b.abonnement_statut = 'annule'
                                          or b.abonnement_annulation_prevue_at is not null)))
      and (p_filtres->>'forfait'      is null or p_filtres->>'forfait'      = '' or coalesce(b.abonnement_offre, b.ab_code_offre) = p_filtres->>'forfait')
      and (p_filtres->>'periodicite'  is null or p_filtres->>'periodicite'  = '' or coalesce(b.abonnement_periodicite, b.ab_periodicite) = p_filtres->>'periodicite')
      and (p_filtres->>'statutAbonnement' is null or p_filtres->>'statutAbonnement' = '' or b.abonnement_statut = p_filtres->>'statutAbonnement')
      and (p_filtres->>'statutPaiement'   is null or p_filtres->>'statutPaiement'   = '' or b.paiement = p_filtres->>'statutPaiement')
      and (p_filtres->>'module'       is null or p_filtres->>'module'       = '' or (p_filtres->>'module')      = any(b.modules_actifs))
      and (p_filtres->>'application'  is null or p_filtres->>'application'  = '' or (p_filtres->>'application') = any(b.applications_actives))
      and (p_filtres->>'ville'        is null or p_filtres->>'ville'        = ''
           or public.elsatia_normaliser_recherche(coalesce(b.ville,''))
              like '%' || public.elsatia_normaliser_recherche(p_filtres->>'ville') || '%')
      and (p_filtres->>'inscritDu'    is null or p_filtres->>'inscritDu'    = '' or b.created_at::date >= (p_filtres->>'inscritDu')::date)
      and (p_filtres->>'inscritAu'    is null or p_filtres->>'inscritAu'    = '' or b.created_at::date <= (p_filtres->>'inscritAu')::date)
      and (p_filtres->>'echeanceDu'   is null or p_filtres->>'echeanceDu'   = '' or b.abonnement_echeance >= (p_filtres->>'echeanceDu')::date)
      and (p_filtres->>'echeanceAu'   is null or p_filtres->>'echeanceAu'   = '' or b.abonnement_echeance <= (p_filtres->>'echeanceAu')::date)
      and (p_filtres->>'remise'       is null or p_filtres->>'remise'       = ''
           or (p_filtres->>'remise' = 'oui' and b.remise_type is not null)
           or (p_filtres->>'remise' = 'non' and b.remise_type is null))
      and (p_filtres->>'comptesMin'   is null or p_filtres->>'comptesMin'   = '' or b.nb_comptes_actifs >= (p_filtres->>'comptesMin')::int)
      and (p_filtres->>'comptesMax'   is null or p_filtres->>'comptesMax'   = '' or b.nb_comptes_actifs <= (p_filtres->>'comptesMax')::int)
      and (p_filtres->>'salariesMin'  is null or p_filtres->>'salariesMin'  = '' or b.nb_salaries       >= (p_filtres->>'salariesMin')::int)
  ),
  page as (
    select f.*, count(*) over () as total_count
    from filtree f
    order by
      -- Une valeur absente se range toujours en fin de liste, dans les deux sens.
      case when v_tri = 'nom'                and v_sens = 'asc'  then public.elsatia_normaliser_recherche(f.nom) end asc  nulls last,
      case when v_tri = 'nom'                and v_sens = 'desc' then public.elsatia_normaliser_recherche(f.nom) end desc nulls last,
      case when v_tri = 'date_inscription'   and v_sens = 'asc'  then f.created_at end asc  nulls last,
      case when v_tri = 'date_inscription'   and v_sens = 'desc' then f.created_at end desc nulls last,
      case when v_tri = 'prochaine_echeance' and v_sens = 'asc'  then f.abonnement_echeance end asc  nulls last,
      case when v_tri = 'prochaine_echeance' and v_sens = 'desc' then f.abonnement_echeance end desc nulls last,
      case when v_tri = 'derniere_activite'  and v_sens = 'asc'  then f.derniere_activite end asc  nulls last,
      case when v_tri = 'derniere_activite'  and v_sens = 'desc' then f.derniere_activite end desc nulls last,
      case when v_tri = 'comptes_actifs'     and v_sens = 'asc'  then f.nb_comptes_actifs end asc  nulls last,
      case when v_tri = 'comptes_actifs'     and v_sens = 'desc' then f.nb_comptes_actifs end desc nulls last,
      case when v_tri = 'montant'            and v_sens = 'asc'  then f.ab_prix_contractuel_ht end asc  nulls last,
      case when v_tri = 'montant'            and v_sens = 'desc' then f.ab_prix_contractuel_ht end desc nulls last,
      f.nom asc
    limit v_taille offset v_offset
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'nom', p.nom,
      'raison_sociale', p.raison_sociale,
      'siret', p.siret,
      'ville', p.ville,
      'code_postal', p.code_postal,
      'reference_interne', p.reference_interne,
      'code_adhesion', p.code_adhesion,
      'proprietaire_nom', null,
      'proprietaire_email', p.proprietaire_email,
      'telephone', null,
      'created_at', p.created_at,
      'abonnement_statut', p.abonnement_statut,
      'abonnement_offre', coalesce(p.abonnement_offre, p.ab_code_offre),
      'abonnement_periodicite', coalesce(p.abonnement_periodicite, p.ab_periodicite),
      'abonnement_echeance', p.abonnement_echeance,
      'abonnement_essai_fin', p.abonnement_essai_fin,
      'abonnement_annulation_prevue_at', p.abonnement_annulation_prevue_at,
      'prix_contractuel_ht', p.ab_prix_contractuel_ht,
      'remise_type', p.remise_type,
      'remise_valeur', p.remise_valeur,
      'remise_description', p.remise_description,
      'remise_duree_mois', p.remise_duree_mois,
      'remise_appliquee_at', p.remise_appliquee_at,
      'suspension_prevue_at', p.suspension_prevue_at,
      'derniere_facture_statut', p.derniere_facture_statut,
      'derniere_facture_url', p.derniere_facture_url,
      'montant_impaye_ht', null,          -- voir bloc 5
      'nb_comptes_actifs', p.nb_comptes_actifs,
      'nb_comptes_facturables', p.nb_comptes_actifs,
      'nb_salaries', p.nb_salaries,
      'modules_actifs', to_jsonb(p.modules_actifs),
      'applications_actives', to_jsonb(p.applications_actives),
      'option_ia_statut', p.option_ia_statut,
      'derniere_activite', p.derniere_activite
    )), '[]'::jsonb),
    coalesce(max(p.total_count), 0)
  into v_lignes, v_total
  from page p;

  return jsonb_build_object(
    'lignes', v_lignes,
    'total', v_total,
    'page', v_page,
    'taille', v_taille,
    'genere_a', v_maintenant
  );
end;
$$;

revoke all on function public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)
  from public, anon;
grant execute on function public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)
  to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 4 — Compteurs d'onglets et indicateurs de synthèse
--
-- L'écran affiche des compteurs sur le jeu FILTRÉ complet. Les recalculer en
-- rapatriant tout le parc annulerait le bénéfice du bloc 3 : ils doivent être
-- agrégés en base, dans une seconde fonction appelée en parallèle.
--
-- Le revenu mensuel récurrent n'est PAS une multiplication du tarif public :
-- il additionne `prix_contractuel_ht` ramené au mois, et vaut NULL si aucune
-- entreprise ne porte de prix contractuel (exigence §9).
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.plateforme_annuaire_compteurs(
  p_recherche text default '',
  p_filtres jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_permission('consulter_plateforme');
  -- Implémentation : reprendre les CTE `base`/`filtree` du bloc 3 (à factoriser
  -- dans une vue `plateforme_annuaire_base`) et agréger par `paiement` et par
  -- `abonnement_statut`, plus :
  --   sum(prix_contractuel_ht / case periodicite when 'annuel' then 12 else 1 end)
  --     filter (where prix_contractuel_ht is not null)
  -- et le nombre d'entreprises SANS prix contractuel, que l'écran affiche en
  -- note sous l'indicateur.
  raise exception 'plateforme_annuaire_compteurs : à écrire lors du déploiement réel';
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 5 — États manquants, signalés à l'écran comme non disponibles
-- ───────────────────────────────────────────────────────────────────────────

-- (a) Archivage. Aucun champ ne le porte : l'onglet « Archivées » est
--     aujourd'hui affiché DÉSACTIVÉ plutôt qu'à zéro.
alter table public.entreprises add column if not exists archivee_at timestamptz;
create index if not exists entreprises_archivee_idx
  on public.entreprises (archivee_at) where archivee_at is not null;

-- (b) Client pilote. Filtre demandé au §6, sans donnée source.
alter table public.entreprises add column if not exists client_pilote boolean not null default false;

-- (c) Pays. `entreprises` ne porte que ville et code postal.
alter table public.entreprises add column if not exists pays text;

-- (d) Distinction demandée au §5 entre échec de paiement et impayé confirmé.
--     Les deux partagent aujourd'hui `suspension_prevue_at`.
alter table public.entreprises
  add column if not exists paiement_echec_at timestamptz,
  add column if not exists impaye_confirme_at timestamptz,
  add column if not exists montant_impaye_ht numeric(12,2);

comment on column public.entreprises.montant_impaye_ht is
  'Somme HT des factures d''abonnement émises et non réglées. Tant que cette colonne n''est pas alimentée par le webhook Stripe, l''annuaire affiche « Non disponible » et n''affiche JAMAIS zéro.';


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 6 — Traçabilité de l'export
--
-- `plateforme_journaliser` existe (migration 20260816000202) mais son exécution
-- est révoquée de `authenticated` et n'a jamais été réaccordée. Aucune Server
-- Action ne peut donc journaliser une action plateforme. L'export CSV de
-- l'annuaire REFUSE de produire un fichier tant que ce grant manque : un export
-- massif de données clients sans trace est précisément ce que le §15 interdit.
-- ───────────────────────────────────────────────────────────────────────────

grant execute on function public.plateforme_journaliser(text,text,text,jsonb) to authenticated;

-- Les compteurs de l'annuaire sont SECURITY DEFINER : sans révocation explicite,
-- PostgreSQL les laisse exécutables par `public`, donc par `anon`. La fonction de
-- liste voisine avait bien sa révocation ; celle des compteurs avait été oubliée,
-- exposant à un visiteur non authentifié le nombre d'entreprises clientes, d'impayés
-- et de retards. Le contrôle interne de permission n'y change rien : une surface
-- qui n'a aucune raison d'être atteignable ne doit pas l'être.
revoke all on function public.plateforme_annuaire_compteurs(text,jsonb) from public, anon;
grant execute on function public.plateforme_annuaire_compteurs(text,jsonb) to authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- BLOC 7 — Rôle « commercial »
--
-- Le §17 demande six rôles ; `plateforme_admins.role` en connaît quatre
-- (total, support, facturation, lecture). Aucun rôle n'a été inventé côté
-- écran. Pour l'ajouter, il faut étendre la contrainte ET `plateforme_a_permission`.
-- ───────────────────────────────────────────────────────────────────────────

-- alter table public.plateforme_admins drop constraint if exists plateforme_admins_role_check;
-- alter table public.plateforme_admins add constraint plateforme_admins_role_check
--   check (role in ('total','support','facturation','commercial','lecture'));
--
-- Puis, dans `plateforme_a_permission` :
--   when 'commercial' then p_permission = any(array[
--     'consulter_plateforme','consulter_tarification','consulter_facturation'
--   ])
-- Le rôle commercial ne doit PAS recevoir 'gerer_remises' : une remise reste
-- réservée à `total` et `facturation`, en session AAL2.


notify pgrst, 'reload schema';
