-- Une commande boutique payee (equipement achete a Liria : imprimantes code-barre,
-- plastifieuses, etiquettes aimantees) ne creait jusqu'ici aucune trace dans
-- depenses_fournisseurs, donc restait totalement invisible en tresorerie pour
-- l'entreprise cliente (ni "decaisse 30 jours", ni projection a 90 jours) malgre
-- une vraie sortie d'argent reelle via Stripe.
--
-- Ajoute une fiche fournisseur "Liria (boutique)" auto-creee par entreprise (recherchee
-- par nom, idempotente), et modifie boutique_finaliser_commande_payee pour y rattacher
-- une depense reglee au moment de la confirmation du paiement Stripe. L'idempotence de
-- la fonction (deja verifiee via v_deja_payee) protege aussi cette nouvelle insertion :
-- un webhook rejoue n'insere pas deux fois la meme depense.

create or replace function public.obtenir_ou_creer_fournisseur_boutique(p_entreprise_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.fournisseurs where entreprise_id = p_entreprise_id and nom = 'Liria (boutique)';
  if v_id is not null then return v_id; end if;
  insert into public.fournisseurs(entreprise_id, nom, notes)
  values(p_entreprise_id, 'Liria (boutique)', 'Fiche créée automatiquement pour rattacher les achats de la boutique Liria (imprimantes, plastifieuses, étiquettes) à la trésorerie.')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.obtenir_ou_creer_fournisseur_boutique(uuid) from public,anon,authenticated;
grant execute on function public.obtenir_ou_creer_fournisseur_boutique(uuid) to authenticated;

create or replace function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_deja_payee boolean; v_commande public.boutique_commandes; v_fournisseur uuid;
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
      v_commande.entreprise_id, v_fournisseur, 'BTQ-'||v_commande.id, 'outillage', current_date, 'payee',
      v_commande.montant_ht, v_commande.montant_tva, v_commande.montant_ttc,
      'Commande boutique Liria réglée par carte (Stripe).'
    )
    on conflict(entreprise_id, fournisseur_id, numero_piece) do nothing;
  end if;
end;
$$;

revoke all on function public.boutique_finaliser_commande_payee(uuid,text) from public, anon;
grant execute on function public.boutique_finaliser_commande_payee(uuid,text) to authenticated;

notify pgrst, 'reload schema';
