-- Renommage de l'identité active de la boutique et de l'éditeur.
-- Les migrations historiques restent immuables ; cette migration corrige leurs données
-- actives et redéfinit les fonctions susceptibles de recréer les anciens libellés.

update public.permissions_disponibles
set description = case cle
  when 'acces_boutique' then 'Parcourir la boutique de matériel ELSATIA'
  when 'gerer_boutique' then 'Commander du matériel dans la boutique ELSATIA'
end
where cle in ('acces_boutique', 'gerer_boutique');

update public.depenses_fournisseurs
set notes = 'Commande boutique ELSATIA réglée par carte (Stripe).', updated_at = now()
where notes = 'Commande boutique Liria réglée par carte (Stripe).';

-- Les deux valeurs ci-dessous désignent l'ancienne identité de l'éditeur dans les
-- données actives, et non une entreprise cliente portant fortuitement un nom proche.
update public.entreprises
set nom = 'ELSATIA', updated_at = now()
where lower(btrim(nom)) = 'liria concept';

update public.entreprises
set raison_sociale = 'ELSATIA', updated_at = now()
where lower(btrim(raison_sociale)) = 'liria concept';

update public.entreprises
set nom = 'ELSATIA Gestion Pro - Entreprise Demo', updated_at = now()
where nom = 'Liria Gestion Pro - Entreprise Demo';

update public.zones_depot
set nom = 'Dépôt principal ELSATIA', updated_at = now()
where nom = 'Dépôt principal LIRIA';

-- Fusionne chaque ancienne fiche boutique dans la fiche ELSATIA éventuelle de la
-- même entreprise. Toutes les clés étrangères actuellement connues sont rattachées
-- avant suppression. Les rares collisions de références sont suffixées plutôt que
-- supprimées afin de ne perdre aucune donnée comptable ou catalogue.
do $$
declare
  v_source public.fournisseurs%rowtype;
  v_cible public.fournisseurs%rowtype;
  v_notes_legacy constant text := 'Fiche créée automatiquement pour rattacher les achats de la boutique Liria (imprimantes, plastifieuses, étiquettes) à la trésorerie.';
  v_notes_elsatia constant text := 'Fiche créée automatiquement pour rattacher les achats de la boutique ELSATIA (imprimantes, plastifieuses, étiquettes) à la trésorerie.';
begin
  for v_source in
    select *
    from public.fournisseurs
    where nom = 'Liria (boutique)'
    order by entreprise_id, created_at, id
    for update
  loop
    select * into v_cible
    from public.fournisseurs
    where entreprise_id = v_source.entreprise_id
      and nom = 'ELSATIA (boutique)'
      and id <> v_source.id
    order by created_at, id
    limit 1
    for update;

    if v_cible.id is null then
      update public.fournisseurs
      set nom = 'ELSATIA (boutique)',
          notes = case when notes is null or notes = v_notes_legacy then v_notes_elsatia else notes end,
          updated_at = now()
      where id = v_source.id;
      continue;
    end if;

    -- Une telle affectation serait anormale pour la boutique, mais elle doit rester
    -- valide si elle existe déjà avant la fusion.
    if exists (
      select 1 from public.sous_traitants_chantiers where fournisseur_id = v_source.id
    ) then
      update public.fournisseurs
      set type_tiers = 'sous_traitant', updated_at = now()
      where id = v_cible.id;
    end if;

    update public.commandes_fournisseurs
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.depenses_fournisseurs d
    set numero_piece = d.numero_piece || '-MIG-' || left(d.id::text, 8), updated_at = now()
    where d.entreprise_id = v_source.entreprise_id
      and d.fournisseur_id = v_source.id
      and exists (
        select 1
        from public.depenses_fournisseurs cible
        where cible.entreprise_id = d.entreprise_id
          and cible.fournisseur_id = v_cible.id
          and cible.numero_piece = d.numero_piece
      );

    update public.depenses_fournisseurs
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.charges_recurrentes
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.coordonnees_bancaires
    set actif = false, updated_at = now()
    where entreprise_id = v_source.entreprise_id
      and fournisseur_id = v_source.id
      and actif
      and exists (
        select 1
        from public.coordonnees_bancaires cible
        where cible.entreprise_id = v_source.entreprise_id
          and cible.fournisseur_id = v_cible.id
          and cible.actif
      );

    update public.coordonnees_bancaires
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.ordres_virements
    set fournisseur_id = v_cible.id
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.connecteurs_externes
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.tarifs_fournisseurs t
    set reference_fournisseur = t.reference_fournisseur || '-MIG-' || left(t.id::text, 8),
        updated_at = now()
    where t.entreprise_id = v_source.entreprise_id
      and t.fournisseur_id = v_source.id
      and exists (
        select 1
        from public.tarifs_fournisseurs cible
        where cible.entreprise_id = t.entreprise_id
          and cible.fournisseur_id = v_cible.id
          and cible.reference_fournisseur = t.reference_fournisseur
      );

    update public.tarifs_fournisseurs
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.sous_traitants_chantiers
    set fournisseur_id = v_cible.id, updated_at = now()
    where entreprise_id = v_source.entreprise_id and fournisseur_id = v_source.id;

    update public.fournisseurs
    set contact_nom = coalesce(contact_nom, v_source.contact_nom),
        email = coalesce(email, v_source.email),
        telephone = coalesce(telephone, v_source.telephone),
        adresse = coalesce(adresse, v_source.adresse),
        code_postal = coalesce(code_postal, v_source.code_postal),
        ville = coalesce(ville, v_source.ville),
        siret = coalesce(siret, v_source.siret),
        notes = case
          when notes is null or notes = v_notes_legacy then
            case when v_source.notes is null or v_source.notes = v_notes_legacy then v_notes_elsatia else v_source.notes end
          else notes
        end,
        actif = actif or v_source.actif,
        specialite = coalesce(specialite, v_source.specialite),
        numero_tva = coalesce(numero_tva, v_source.numero_tva),
        assurance_rc_pro = coalesce(assurance_rc_pro, v_source.assurance_rc_pro),
        assurance_decennale = coalesce(assurance_decennale, v_source.assurance_decennale),
        date_validite_assurance = coalesce(date_validite_assurance, v_source.date_validite_assurance),
        updated_at = now()
    where id = v_cible.id;

    delete from public.fournisseurs where id = v_source.id;
  end loop;
end;
$$;

create or replace function public.obtenir_ou_creer_fournisseur_boutique(p_entreprise_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_entreprise_id::text || ':elsatia-boutique', 0));

  select id into v_id
  from public.fournisseurs
  where entreprise_id = p_entreprise_id and nom = 'ELSATIA (boutique)'
  order by created_at, id
  limit 1;

  if v_id is not null then return v_id; end if;

  insert into public.fournisseurs(entreprise_id, nom, notes)
  values(
    p_entreprise_id,
    'ELSATIA (boutique)',
    'Fiche créée automatiquement pour rattacher les achats de la boutique ELSATIA (imprimantes, plastifieuses, étiquettes) à la trésorerie.'
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.obtenir_ou_creer_fournisseur_boutique(uuid) from public, anon, authenticated;
grant execute on function public.obtenir_ou_creer_fournisseur_boutique(uuid) to authenticated;

create or replace function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_deja_payee boolean; v_commande public.boutique_commandes; v_fournisseur uuid; v_depense uuid;
begin
  select * into v_commande
  from public.boutique_commandes
  where id = p_commande_id and stripe_checkout_id = p_checkout_id;
  v_deja_payee := v_commande.statut = 'payee';
  if v_commande.id is null or v_deja_payee then return; end if;

  update public.boutique_produits p
  set stock_disponible = greatest(0, p.stock_disponible - l.quantite), updated_at = now()
  from public.boutique_lignes_commande l
  where l.produit_id = p.id and l.commande_id = p_commande_id;

  update public.boutique_commandes set statut = 'payee', updated_at = now() where id = p_commande_id;

  if v_commande.montant_ttc > 0 then
    v_fournisseur := public.obtenir_ou_creer_fournisseur_boutique(v_commande.entreprise_id);
    insert into public.depenses_fournisseurs(
      entreprise_id, fournisseur_id, numero_piece, categorie, date_piece, statut,
      montant_ht, montant_tva, montant_regle, notes
    ) values (
      v_commande.entreprise_id, v_fournisseur, 'BTQ-' || v_commande.id, 'outillage', current_date, 'payee',
      v_commande.montant_ht, v_commande.montant_tva, v_commande.montant_ttc,
      'Commande boutique ELSATIA réglée par carte (Stripe).'
    )
    on conflict(entreprise_id, fournisseur_id, numero_piece) do update set updated_at = now()
    returning id into v_depense;

    if v_depense is not null and not exists(
      select 1 from public.reglements_fournisseurs where depense_id = v_depense
    ) then
      insert into public.reglements_fournisseurs(entreprise_id, depense_id, montant, date, mode, reference)
      values(v_commande.entreprise_id, v_depense, v_commande.montant_ttc, current_date, 'cb', v_commande.stripe_checkout_id);
    end if;
  end if;
end;
$$;

revoke all on function public.boutique_finaliser_commande_payee(uuid, text) from public, anon;
grant execute on function public.boutique_finaliser_commande_payee(uuid, text) to authenticated;

notify pgrst, 'reload schema';
