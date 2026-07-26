-- 20260724000175 rattachait la depense boutique a la tresorerie mais oubliait que
-- "Decaisse 30 jours" (tresorerie/page.tsx) lit reglements_fournisseurs, pas
-- depenses_fournisseurs.montant_regle directement : sans une ligne de reglement, le
-- flux realise sur 30 jours ratait toujours cette vraie sortie d'argent, meme si la
-- depense elle-meme etait bien marquee "payee". Ajoute la ligne de reglement manquante.

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
      v_commande.entreprise_id, v_fournisseur, 'BTQ-'||v_commande.id, 'outillage', current_date, 'payee',
      v_commande.montant_ht, v_commande.montant_tva, v_commande.montant_ttc,
      'Commande boutique Liria réglée par carte (Stripe).'
    )
    on conflict(entreprise_id, fournisseur_id, numero_piece) do update set updated_at = now()
    returning id into v_depense;

    if v_depense is not null and not exists(select 1 from public.reglements_fournisseurs where depense_id = v_depense) then
      insert into public.reglements_fournisseurs(entreprise_id, depense_id, montant, date, mode, reference)
      values(v_commande.entreprise_id, v_depense, v_commande.montant_ttc, current_date, 'cb', v_commande.stripe_checkout_id);
    end if;
  end if;
end;
$$;

revoke all on function public.boutique_finaliser_commande_payee(uuid,text) from public, anon;
grant execute on function public.boutique_finaliser_commande_payee(uuid,text) to authenticated;

notify pgrst, 'reload schema';
