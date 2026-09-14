-- GP V1 — grille de devis : types de lignes, coûts de ligne, révision, en-tête
-- Intégré au ledger le 2026-09-12 (GP V1, lot 0) depuis supabase/proposed/gp-v1-metier-grille-devis.sql.proposed, contenu inchangé.
-- Rejouable ; additif ; Fresh + Upgrade prouvés (docs/gp-v1, § 19).

do $$
begin
  if to_regclass('public.catalogue_familles') is null or to_regclass('public.lignes_devis_couts') is null then
    raise exception 'Prérequis absent : appliquer d''abord gp-v1-metier-bibliotheque' using errcode = '55000';
  end if;
end $$;

create or replace function pg_temp.ajouter_contrainte(p_table regclass, p_nom text, p_definition text)
returns void language plpgsql as $$
begin
  if not exists (select 1 from pg_constraint where conrelid = p_table and conname = p_nom) then
    execute format('alter table %s add constraint %I %s', p_table, p_nom, p_definition);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 1. Types de lignes
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_table text;
begin
  foreach v_table in array array['lignes_devis', 'lignes_factures'] loop
    execute format($f$
      alter table public.%1$I
        add column if not exists type_ligne                  text not null default 'libre',
        add column if not exists remise_section_pct          numeric(7, 3),
        add column if not exists commentaire_interne         text,
        add column if not exists famille_instantane          text,
        add column if not exists fournisseur_instantane      text,
        add column if not exists code_fournisseur_instantane text
    $f$, v_table);
    perform pg_temp.ajouter_contrainte(format('public.%I', v_table)::regclass, v_table || '_type_ligne_check',
      $c$check (type_ligne in ('article', 'libre', 'titre', 'sous_titre', 'commentaire', 'sous_total', 'remise', 'vide', 'separateur', 'saut_page'))$c$);
    -- Règle des montants par type. NOT VALID : les lignes existantes (toutes « libre ») ne sont pas revérifiées.
    perform pg_temp.ajouter_contrainte(format('public.%I', v_table)::regclass, v_table || '_type_ligne_montants_check',
      $c$check (case type_ligne
                 when 'article' then true
                 when 'libre' then true
                 when 'remise' then quantite = 1 and prix_unitaire_ht <= 0 and remise_ligne = 0
                 else quantite = 0 and prix_unitaire_ht = 0 and remise_ligne = 0 end) not valid$c$);
    perform pg_temp.ajouter_contrainte(format('public.%I', v_table)::regclass, v_table || '_grille_longueurs_check',
      $c$check ((remise_section_pct is null or remise_section_pct between 0 and 100)
                and coalesce(length(commentaire_interne), 0) <= 2000
                and coalesce(length(famille_instantane), 0) <= 250
                and coalesce(length(fournisseur_instantane), 0) <= 200
                and coalesce(length(code_fournisseur_instantane), 0) <= 120)$c$);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Coûts de ligne : main-d'œuvre, coefficient ; journal des prix étendu
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.lignes_devis_couts
  add column if not exists cout_main_oeuvre_ht numeric(12, 4) not null default 0,
  add column if not exists coefficient         numeric(8, 4);
select pg_temp.ajouter_contrainte('public.lignes_devis_couts', 'lignes_devis_couts_mo_coef_check',
  'check (cout_main_oeuvre_ht >= 0 and (coefficient is null or (coefficient > 0 and coefficient <= 1000)))');

alter table public.devis_prix_journal drop constraint if exists devis_prix_journal_champ_check;
alter table public.devis_prix_journal add constraint devis_prix_journal_champ_check
  check (champ in ('prix_unitaire_ht', 'quantite', 'remise_ligne', 'prix_achat_ht', 'remise_globale', 'cout_main_oeuvre_ht', 'coefficient'));

drop policy if exists devis_prix_journal_lecture on public.devis_prix_journal;
create policy devis_prix_journal_lecture on public.devis_prix_journal as restrictive for select to authenticated
  using (public.a_permission(entreprise_id, 'acces_devis')
         and (champ not in ('prix_achat_ht', 'cout_main_oeuvre_ht', 'coefficient') or public.a_permission(entreprise_id, 'voir_couts_devis')));

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 4. En-tête du devis
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.devis
  add column if not exists revision              integer not null default 0,
  add column if not exists mode_reglement        text,
  add column if not exists conditions_paiement   text,
  add column if not exists commercial_employe_id uuid references public.employes (id) on delete set null;
select pg_temp.ajouter_contrainte('public.devis', 'devis_entete_grille_check',
  'check (revision >= 0 and coalesce(length(mode_reglement), 0) <= 60 and coalesce(length(conditions_paiement), 0) <= 500)');
alter table public.factures
  add column if not exists mode_reglement      text,
  add column if not exists conditions_paiement text;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Verrou du devis émis : champs internes qui restent libres
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.verrouiller_devis_emis()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_libre text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;
  if old.statut <> 'brouillon' then
    if new.statut = 'brouillon' then
      raise exception 'Ce devis a déjà été émis et ne peut pas redevenir brouillon.';
    end if;
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_libre in array array[
      'statut', 'email_envoye_le', 'email_envoye_a', 'relance_auto_exclue', 'notes_internes',
      'chantier_id', 'updated_at', 'client_snapshot', 'client_snapshot_at',
      'reference_interne', 'commercial_employe_id', 'revision'
    ] loop
      v_old := v_old - v_libre;
      v_new := v_new - v_libre;
    end loop;
    if v_old is distinct from v_new then
      raise exception 'Ce devis a déjà été émis et ne peut plus être modifié.';
    end if;
  end if;
  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 6. Rendu : rien d'interne vers le client
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.ligne_pour_rendu(p_ligne jsonb)
returns jsonb language sql immutable as $$
  select p_ligne - 'devis_id' - 'facture_id' - 'parametres_quantite' - 'detail_calcul' - 'quantite_forcee'
                 - 'source_id' - 'created_at'
                 - 'commentaire_interne' - 'fournisseur_instantane' - 'code_fournisseur_instantane' - 'famille_instantane'
$$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 7. RPC d'enregistrement v2 — signature étendue
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- `p_revision` : révision lue par l'éditeur ; si elle ne correspond plus (un autre onglet, un autre poste a
-- enregistré entre-temps), l'enregistrement est REFUSÉ (40001) : jamais d'écrasement silencieux. `null`
-- (appelant historique) : aucun contrôle. Retour {id, revision}.
drop function if exists public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb);
create or replace function public.enregistrer_devis_brouillon_v2(
  p_entreprise_id uuid,
  p_devis_id      uuid,
  p_devis         jsonb,
  p_ouvrages      jsonb,
  p_lignes        jsonb,
  p_couts         jsonb default '[]'::jsonb,
  p_revision      integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_statut text;
  v_revision integer;
  v_couts boolean := public.a_permission(p_entreprise_id, 'gerer_couts_devis');
  v_commercial uuid := nullif(p_devis ->> 'commercial_employe_id', '')::uuid;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lignes, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Un devis compte au moins une ligne.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where coalesce(l ->> 'type_ligne', 'libre') not in ('article', 'libre', 'titre', 'sous_titre', 'commentaire', 'sous_total', 'remise', 'vide', 'separateur', 'saut_page')
  ) then
    raise exception 'Type de ligne inconnu.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where (coalesce(btrim(l ->> 'designation'), '') = '' and coalesce(l ->> 'type_ligne', 'libre') not in ('vide', 'separateur', 'saut_page'))
       or coalesce((l ->> 'remise_ligne')::numeric, 0) not between 0 and 100
       or coalesce((l ->> 'taux_tva')::numeric, -1) not between 0 and 100
       or (l ->> 'quantite') is null or (l ->> 'prix_unitaire_ht') is null
  ) then
    raise exception 'Ligne invalide : désignation, quantité, prix, remise (0 à 100) et TVA (0 à 100) sont requis.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_lignes) l
    where (coalesce(l ->> 'type_ligne', 'libre') = 'remise'
           and ((l ->> 'quantite')::numeric <> 1 or (l ->> 'prix_unitaire_ht')::numeric > 0 or coalesce((l ->> 'remise_ligne')::numeric, 0) <> 0))
       or (coalesce(l ->> 'type_ligne', 'libre') not in ('article', 'libre', 'remise')
           and ((l ->> 'quantite')::numeric <> 0 or (l ->> 'prix_unitaire_ht')::numeric <> 0 or coalesce((l ->> 'remise_ligne')::numeric, 0) <> 0))
  ) then
    raise exception 'Une ligne de structure ne porte ni quantité ni prix ; une remise est un montant négatif à quantité 1.';
  end if;
  if coalesce((p_devis ->> 'remise_globale')::numeric, 0) not between 0 and 100 then
    raise exception 'La remise globale doit être comprise entre 0 et 100 %%.';
  end if;
  if v_commercial is not null and not exists (
    select 1 from public.employes e where e.id = v_commercial and e.entreprise_id = p_entreprise_id
  ) then
    raise exception 'Commercial introuvable dans cette entreprise.';
  end if;

  if p_devis_id is null then
    insert into public.devis (
      entreprise_id, client_id, chantier_id, date_emission, date_validite,
      conditions, notes_client, notes_internes, remise_globale, filigrane, moteur_presentation,
      reference_interne, reference_client, mode_reglement, conditions_paiement, commercial_employe_id, revision
    ) values (
      p_entreprise_id,
      (p_devis ->> 'client_id')::uuid,
      nullif(p_devis ->> 'chantier_id', '')::uuid,
      coalesce(nullif(p_devis ->> 'date_emission', '')::date, current_date),
      nullif(p_devis ->> 'date_validite', '')::date,
      nullif(p_devis ->> 'conditions', ''),
      nullif(p_devis ->> 'notes_client', ''),
      nullif(p_devis ->> 'notes_internes', ''),
      coalesce((p_devis ->> 'remise_globale')::numeric, 0),
      case when jsonb_typeof(p_devis -> 'filigrane') = 'object' then p_devis -> 'filigrane' end,
      2,
      nullif(btrim(p_devis ->> 'reference_interne'), ''),
      nullif(btrim(p_devis ->> 'reference_client'), ''),
      nullif(btrim(p_devis ->> 'mode_reglement'), ''),
      nullif(btrim(p_devis ->> 'conditions_paiement'), ''),
      v_commercial,
      1
    ) returning id, revision into v_id, v_revision;
  else
    select statut, revision into v_statut, v_revision
    from public.devis where id = p_devis_id and entreprise_id = p_entreprise_id
    for update;
    if not found then raise exception 'Devis introuvable'; end if;
    if v_statut <> 'brouillon' then raise exception 'Seul un devis brouillon peut etre modifie'; end if;
    if p_revision is not null and p_revision <> v_revision then
      raise exception 'Ce devis a été modifié ailleurs depuis votre dernière lecture (révision % au lieu de %). Rechargez-le avant d''enregistrer.', v_revision, p_revision
        using errcode = '40001';
    end if;
    v_id := p_devis_id;

    -- Journal : valeurs d'avant, comparées par clé stable de ligne, AVANT la réécriture.
    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, a.cle_ligne, c.champ, c.ancienne, c.nouvelle
    from public.lignes_devis a
    join jsonb_to_recordset(p_lignes) as n(cle_ligne text, quantite numeric, prix_unitaire_ht numeric, remise_ligne numeric)
      on n.cle_ligne = a.cle_ligne
    cross join lateral (values
      ('prix_unitaire_ht', a.prix_unitaire_ht, n.prix_unitaire_ht),
      ('quantite', a.quantite, n.quantite),
      ('remise_ligne', a.remise_ligne, coalesce(n.remise_ligne, 0))
    ) as c(champ, ancienne, nouvelle)
    where a.devis_id = v_id and c.ancienne is distinct from c.nouvelle;

    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, '*', 'remise_globale', d.remise_globale, coalesce((p_devis ->> 'remise_globale')::numeric, 0)
    from public.devis d
    where d.id = v_id and d.remise_globale is distinct from coalesce((p_devis ->> 'remise_globale')::numeric, 0);

    update public.devis set
      client_id = (p_devis ->> 'client_id')::uuid,
      chantier_id = nullif(p_devis ->> 'chantier_id', '')::uuid,
      date_emission = coalesce(nullif(p_devis ->> 'date_emission', '')::date, date_emission),
      date_validite = nullif(p_devis ->> 'date_validite', '')::date,
      conditions = nullif(p_devis ->> 'conditions', ''),
      notes_client = nullif(p_devis ->> 'notes_client', ''),
      notes_internes = nullif(p_devis ->> 'notes_internes', ''),
      remise_globale = coalesce((p_devis ->> 'remise_globale')::numeric, 0),
      filigrane = case when jsonb_typeof(p_devis -> 'filigrane') = 'object' then p_devis -> 'filigrane' end,
      moteur_presentation = 2,
      reference_interne = nullif(btrim(p_devis ->> 'reference_interne'), ''),
      reference_client = nullif(btrim(p_devis ->> 'reference_client'), ''),
      mode_reglement = nullif(btrim(p_devis ->> 'mode_reglement'), ''),
      conditions_paiement = nullif(btrim(p_devis ->> 'conditions_paiement'), ''),
      commercial_employe_id = v_commercial,
      revision = revision + 1,
      updated_at = now()
    where id = v_id
    returning revision into v_revision;

    delete from public.lignes_devis where devis_id = v_id;
    delete from public.devis_ouvrages where devis_id = v_id;
  end if;

  insert into public.devis_ouvrages (
    devis_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_reference, ouvrage_nom,
    categorie, unite_principale, quantite_principale, options, saisies, libelle_client, description_client,
    mode_presentation, instantane_modele, modifications_manuelles
  )
  select v_id, p_entreprise_id, o.cle, coalesce(o.ordre, 0), o.ouvrage_id, o.ouvrage_version, o.ouvrage_reference,
         o.ouvrage_nom, o.categorie, o.unite_principale, o.quantite_principale, coalesce(o.options, '[]'::jsonb),
         coalesce(o.saisies, '{}'::jsonb), o.libelle_client, o.description_client,
         coalesce(o.mode_presentation, 'regroupe'), o.instantane_modele, coalesce(o.modifications_manuelles, '{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_ouvrages, '[]'::jsonb)) as o(
    cle text, ordre integer, ouvrage_id uuid, ouvrage_version integer, ouvrage_reference text, ouvrage_nom text,
    categorie text, unite_principale text, quantite_principale numeric, options jsonb, saisies jsonb,
    libelle_client text, description_client text, mode_presentation text, instantane_modele jsonb,
    modifications_manuelles jsonb);

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
    cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
    reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
    afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
    type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  )
  select v_id, coalesce(l.designation, ''), l.description, coalesce(l.type, 'forfait'), l.quantite, coalesce(l.unite, 'u'),
         l.prix_unitaire_ht, coalesce(l.remise_ligne, 0), l.taux_tva, coalesce(l.ordre, 0),
         coalesce(nullif(l.cle_ligne, ''), gen_random_uuid()::text), l.ouvrage_cle, coalesce(l.origine_ligne, 'saisie'),
         l.source_catalogue, l.source_id, l.reference_interne_instantane, l.reference_fabricant_instantane,
         l.nature, l.parametres_quantite, coalesce(l.quantite_forcee, false), coalesce(l.visible_client, true),
         coalesce(l.afficher_quantite, true), coalesce(l.afficher_prix, true), l.description_client_personnalisee,
         l.motif_ajustement, l.detail_calcul,
         coalesce(l.type_ligne, 'libre'), l.remise_section_pct, nullif(btrim(l.commentaire_interne), ''),
         l.famille_instantane, l.fournisseur_instantane, l.code_fournisseur_instantane
  from jsonb_to_recordset(p_lignes) as l(
    designation text, description text, type text, quantite numeric, unite text, prix_unitaire_ht numeric,
    remise_ligne numeric, taux_tva numeric, ordre integer, cle_ligne text, ouvrage_cle text, origine_ligne text,
    source_catalogue text, source_id uuid, reference_interne_instantane text, reference_fabricant_instantane text,
    nature text, parametres_quantite jsonb, quantite_forcee boolean, visible_client boolean,
    afficher_quantite boolean, afficher_prix boolean, description_client_personnalisee text,
    motif_ajustement text, detail_calcul text,
    type_ligne text, remise_section_pct numeric, commentaire_interne text, famille_instantane text,
    fournisseur_instantane text, code_fournisseur_instantane text);

  if v_couts then
    insert into public.devis_prix_journal (entreprise_id, devis_id, cle_ligne, champ, ancienne, nouvelle)
    select p_entreprise_id, v_id, n.cle_ligne, c.champ, c.ancienne, c.nouvelle
    from jsonb_to_recordset(coalesce(p_couts, '[]'::jsonb)) as n(cle_ligne text, prix_achat_ht numeric, cout_main_oeuvre_ht numeric, coefficient numeric)
    left join public.lignes_devis_couts a on a.devis_id = v_id and a.cle_ligne = n.cle_ligne
    cross join lateral (values
      ('prix_achat_ht', a.prix_achat_ht, n.prix_achat_ht),
      ('cout_main_oeuvre_ht', a.cout_main_oeuvre_ht, coalesce(n.cout_main_oeuvre_ht, 0)),
      ('coefficient', a.coefficient, n.coefficient)
    ) as c(champ, ancienne, nouvelle)
    where p_devis_id is not null and c.ancienne is distinct from c.nouvelle
      and not (c.champ <> 'prix_achat_ht' and a.cle_ligne is null and c.nouvelle is null);

    delete from public.lignes_devis_couts where devis_id = v_id;
    insert into public.lignes_devis_couts (devis_id, cle_ligne, entreprise_id, prix_achat_ht, cout_main_oeuvre_ht, coefficient)
    select v_id, n.cle_ligne, p_entreprise_id, n.prix_achat_ht, coalesce(n.cout_main_oeuvre_ht, 0), n.coefficient
    from jsonb_to_recordset(coalesce(p_couts, '[]'::jsonb)) as n(cle_ligne text, prix_achat_ht numeric, cout_main_oeuvre_ht numeric, coefficient numeric)
    where n.prix_achat_ht is not null
      and exists (select 1 from public.lignes_devis l where l.devis_id = v_id and l.cle_ligne = n.cle_ligne);
  else
    perform public.purger_couts_orphelins_devis(v_id);
  end if;

  return jsonb_build_object('id', v_id, 'revision', v_revision);
end $$;

revoke all on function public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer) from public, anon, service_role;
grant execute on function public.enregistrer_devis_brouillon_v2(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
-- 8. Duplication et conversion en facture : nouvelles colonnes recopiées
-- ─────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dupliquer_devis(p_devis_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_source public.devis;
  v_nouveau_id uuid;
begin
  select * into v_source from public.devis where id = p_devis_id;
  if not found then
    raise exception 'Devis introuvable';
  end if;

  insert into public.devis (
    entreprise_id, client_id, chantier_id, statut, date_emission,
    date_validite, conditions, notes_client, notes_internes, remise_globale, filigrane, moteur_presentation,
    reference_interne, reference_client, mode_reglement, conditions_paiement, commercial_employe_id, revision
  ) values (
    v_source.entreprise_id, v_source.client_id, v_source.chantier_id, 'brouillon', current_date,
    null, v_source.conditions, v_source.notes_client, v_source.notes_internes, v_source.remise_globale,
    v_source.filigrane, v_source.moteur_presentation,
    v_source.reference_interne, v_source.reference_client, v_source.mode_reglement, v_source.conditions_paiement,
    v_source.commercial_employe_id, 1
  ) returning id into v_nouveau_id;

  insert into public.devis_ouvrages (
    devis_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_reference, ouvrage_nom,
    categorie, unite_principale, quantite_principale, options, saisies, libelle_client, description_client,
    mode_presentation, instantane_modele, modifications_manuelles
  )
  select v_nouveau_id, o.entreprise_id, o.cle, o.ordre, o.ouvrage_id, o.ouvrage_version, o.ouvrage_reference,
         o.ouvrage_nom, o.categorie, o.unite_principale, o.quantite_principale, o.options, o.saisies,
         o.libelle_client, o.description_client, o.mode_presentation, o.instantane_modele, o.modifications_manuelles
  from public.devis_ouvrages o where o.devis_id = p_devis_id;

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
    cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
    reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
    afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
    type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  )
  select v_nouveau_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
         cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
         reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
         afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
         type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  from public.lignes_devis
  where devis_id = p_devis_id
  order by ordre;

  if public.a_permission(v_source.entreprise_id, 'gerer_couts_devis') then
    insert into public.lignes_devis_couts (devis_id, cle_ligne, entreprise_id, prix_achat_ht, cout_main_oeuvre_ht, coefficient)
    select v_nouveau_id, c.cle_ligne, c.entreprise_id, c.prix_achat_ht, c.cout_main_oeuvre_ht, c.coefficient
    from public.lignes_devis_couts c where c.devis_id = p_devis_id;
  end if;

  return v_nouveau_id;
end;
$$;

create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
  v_delai integer := 30;
  v_deja_facture numeric;
begin
  select * into v_devis from public.devis where id = p_devis_id for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if not public.est_membre_actif(v_devis.entreprise_id) then raise exception 'Accès refusé'; end if;
  if not public.a_permission(v_devis.entreprise_id, 'gerer_factures') then
    raise exception 'Accès refusé : la création de facture exige le droit de gérer les factures.' using errcode = '42501';
  end if;
  if v_devis.statut <> 'accepte' then raise exception 'Le devis doit etre accepte avant facturation'; end if;
  if v_devis.client_id is null then raise exception 'Le devis doit etre rattache a un client'; end if;

  v_deja_facture := public.montant_facture_devis(v_devis.entreprise_id, p_devis_id);
  if v_deja_facture > 0.01 then
    raise exception 'Ce devis est déjà facturé, au moins en partie (déjà % €) : utilisez une facture de solde/finale ou une situation plutôt qu''une nouvelle facture complète.', to_char(v_deja_facture, 'FM999999990.00');
  end if;

  select delai_paiement_jours into v_delai
  from public.clients
  where id = v_devis.client_id and entreprise_id = v_devis.entreprise_id;
  if not found then raise exception 'Client du devis introuvable'; end if;

  insert into public.factures (
    entreprise_id, client_id, chantier_id, devis_origine_id, type,
    date_echeance, notes_client, remise_globale, moteur_presentation,
    reference_interne, reference_client, mode_reglement, conditions_paiement
  ) values (
    v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id,
    p_devis_id, p_type, current_date + coalesce(v_delai, 30), v_devis.notes_client,
    v_devis.remise_globale, v_devis.moteur_presentation,
    v_devis.reference_interne, v_devis.reference_client, v_devis.mode_reglement, v_devis.conditions_paiement
  ) returning id into v_facture_id;

  insert into public.factures_ouvrages (
    facture_id, entreprise_id, cle, ordre, ouvrage_id, ouvrage_version, ouvrage_reference,
    ouvrage_nom, categorie, unite_principale, quantite_principale, options, saisies, libelle_client,
    description_client, mode_presentation, instantane_modele, modifications_manuelles
  )
  select v_facture_id, o.entreprise_id, o.cle, o.ordre, o.ouvrage_id, o.ouvrage_version,
         o.ouvrage_reference, o.ouvrage_nom, o.categorie, o.unite_principale, o.quantite_principale, o.options,
         o.saisies, o.libelle_client, o.description_client, o.mode_presentation, o.instantane_modele,
         o.modifications_manuelles
  from public.devis_ouvrages o where o.devis_id = p_devis_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
    cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
    reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
    afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
    type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  )
  select v_facture_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre,
         cle_ligne, ouvrage_cle, origine_ligne, source_catalogue, source_id, reference_interne_instantane,
         reference_fabricant_instantane, nature, parametres_quantite, quantite_forcee, visible_client,
         afficher_quantite, afficher_prix, description_client_personnalisee, motif_ajustement, detail_calcul,
         type_ligne, remise_section_pct, commentaire_interne, famille_instantane, fournisseur_instantane, code_fournisseur_instantane
  from public.lignes_devis where devis_id = p_devis_id order by ordre;

  return v_facture_id;
end;
$$;

revoke all on function public.creer_facture_depuis_devis(uuid, text) from public, anon;
grant execute on function public.creer_facture_depuis_devis(uuid, text) to authenticated;

notify pgrst, 'reload schema';
