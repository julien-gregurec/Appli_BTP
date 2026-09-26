-- ELSATIA-BOUTIQUE-PAYMENT-IDEMPOTENCY-CLOSURE-V1
--
-- P1 confirmé par reproduction locale (base rejouée à partir de zéro, 320
-- migrations — voir
-- docs/qualification/ELSATIA_BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1.md) :
-- boutique_finaliser_commande_payee lit la commande par un simple SELECT
-- (sans verrou), puis, si elle n'est pas déjà 'payee', décrémente le stock et
-- clôture la commande. Un rejeu STRICTEMENT SÉQUENTIEL (retry Stripe après un
-- 200 déjà renvoyé, appel RPC direct répété) est déjà un no-op sûr grâce au
-- garde-fou `v_deja_payee` — vérifié empiriquement, non régressé ici.
--
-- Le point réellement cassé est la CONCURRENCE : deux appels concurrents pour
-- la même commande/checkout (deux évènements Stripe distincts pour un même
-- paiement livrés en parallèle par des workers différents, ou une
-- double-livraison réseau non sérialisée par le journal
-- stripe_webhook_events, cf. D3 documenté dans 20260922000326) lisent tous
-- deux statut <> 'payee' avant que le premier n'ait committé sa mise à jour :
-- les deux décrémentent le stock. Aucune erreur n'est levée (ni par la
-- fonction, ni par le déclencheur boutique_commandes_paiement_serveur_seul,
-- qui laisse passer service_role sans condition) : c'est un double
-- fulfilment SILENCIEUX, pas un crash.
--
-- Reproduit avec un harnais de test portant l'exacte logique ci-dessous plus
-- un délai injecté entre la lecture et l'écriture (pour rendre la fenêtre de
-- course observable à la demande plutôt que dépendante du hasard de
-- l'ordonnanceur) : stock 10 -> 4 après deux appels concurrents pour une
-- ligne de quantité 3 (attendu : 7 après un seul décrément).
--
-- FIX minimal : verrouille la ligne commande dès la lecture. `FOR NO KEY
-- UPDATE`, pas `FOR UPDATE` : boutique_lignes_commande référence
-- boutique_commandes(id) par FK (on delete cascade) ; 20260921000302 a déjà
-- documenté, pour un cas structurellement identique (recalc_paiements_facture
-- sur factures, référencée par la FK de paiements), le deadlock d'escalade de
-- verrou que `FOR UPDATE` provoquerait si une future insertion dans
-- boutique_lignes_commande posait, dans la même transaction, le verrou
-- `FOR KEY SHARE` implicite de sa FK avant que ce correctif ne tente de
-- monter en `FOR UPDATE`. La mise à jour qui suit (statut, updated_at) ne
-- touche ni id ni aucune colonne référencée par une contrainte unique : les
-- conditions d'usage de `FOR NO KEY UPDATE` documentées par 20260921000302
-- sont réunies. Le second appelant concurrent bloque jusqu'au commit du
-- premier, relit alors une commande déjà 'payee' sous le verrou et sort par
-- le no-op existant. Contrat métier inchangé : APPLY au premier appel valide,
-- NO-OP sûr ensuite (séquentiel ou concurrent), aucun contournement du
-- déclencheur de sécurité (le verrou ne change ni le rôle appelant ni le
-- contenu de la transaction, seulement son ordonnancement).
--
-- Additif : redéfinit uniquement le corps de la fonction (create or
-- replace), sans toucher à ses privilèges (déjà restreints à service_role
-- par 20260922000323). Aucun secret Stripe réel.

begin;

create or replace function public.boutique_finaliser_commande_payee(p_commande_id uuid, p_checkout_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_deja_payee boolean; v_commande public.boutique_commandes; v_fournisseur uuid; v_depense uuid;
begin
  select * into v_commande
  from public.boutique_commandes
  where id = p_commande_id and stripe_checkout_id = p_checkout_id
  for no key update;
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

notify pgrst, 'reload schema';

commit;

-- Retour arrière : recréer la fonction sans "for no key update" sur le
-- SELECT (redonne le corps exact de 20260801000194 — réintroduit le P1).
