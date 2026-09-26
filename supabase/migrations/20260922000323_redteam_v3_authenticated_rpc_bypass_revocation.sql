begin;

-- ELSATIA-REDTEAM-V3 — 3 RPC SECURITY DEFINER encore exécutables par
-- "authenticated" sans aucune vérification d'appartenance de l'appelant à
-- l'entreprise ciblée, ni (pour la Boutique) de preuve de paiement Stripe
-- réel. Trouvées par revue red-team, confirmées par requête catalogue sur
-- une base rejouée à partir de zéro (313 migrations) :
-- has_function_privilege('authenticated', <fonction>, 'EXECUTE') = true pour
-- les 3 fonctions ci-dessous, alors qu'aucun appelant "authenticated"
-- légitime n'existe dans src/ (grep exhaustif : les 3 ne sont appelées que
-- via le client service_role, deps.admin.rpc(...)/admin.rpc(...)).

-- 1) Auto-octroi de capacité payante (P0). synchroniser_capacite_stripe_service
--    ne vérifie que la cohérence p_stripe_subscription_id ↔
--    entreprises.stripe_subscription_id, jamais l'appartenance de
--    l'appelant à p_entreprise_id : tout utilisateur authentifié de
--    n'importe quelle entreprise pouvait s'auto-attribuer jusqu'à 100000
--    unités de "capacité personnes supplémentaire" sans jamais payer, en
--    appelant directement la RPC avec p_statut_final='completed'.
--    20260905000267 a fermé 7 fonctions soeurs de la même famille
--    ("Modèle 2" de son commentaire) ; celle-ci avait été omise.
revoke execute on function public.synchroniser_capacite_stripe_service(
  uuid, text, integer, integer, text, text, text, text, text, text, text, jsonb, timestamptz, text, timestamptz, text
) from authenticated;

-- 2) Falsification de l'état de réconciliation Stripe d'un AUTRE tenant
--    (P1). capacite_stripe_finaliser_op_convergente(p_operation_id) ne
--    vérifie ni p_entreprise_id ni appartenance de l'appelant : tout
--    utilisateur authentifié pouvait clore prématurément l'opération de
--    réconciliation d'une entreprise tierce (UUID nu, non scopé), la
--    retirant silencieusement de la file de reprise du cron et masquant
--    une dérive de facturation que la réconciliation devait détecter.
--    Non balayée par 20260905000267 : ne porte pas le suffixe "_service"
--    utilisé par le grep de cette migration.
revoke execute on function public.capacite_stripe_finaliser_op_convergente(uuid) from authenticated;

-- 3) Boutique : commande marquée payée sans paiement réel (P0). La
--    migration 20260902000255_acl_reconciliation_v1 a retiré EXECUTE à
--    service_role sur boutique_finaliser_commande_payee mais l'a laissé à
--    "authenticated" — déjà documenté et déjà décidé, jamais fusionné :
--    docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md, "Constat de sécurité"
--    et décision D1. Restaure l'exécution au seul chemin serveur (le
--    webhook Boutique, après vérification de signature Stripe, de mode, et
--    de payment_status — seul appelant réel, confirmé par grep de src/).
revoke execute on function public.boutique_finaliser_commande_payee(uuid, text) from authenticated;
grant execute on function public.boutique_finaliser_commande_payee(uuid, text) to service_role;

-- D1 — même sans cette RPC, la RLS boutique_commandes_maj laisse le client
-- propriétaire (droit gerer_boutique) écrire statut='payee' par un simple
-- PATCH PostgREST, et boutique_commandes_creation ne restreint pas la
-- valeur de statut à l'insertion. Déclencheur BEFORE INSERT OR UPDATE :
-- refuse toute tentative non service_role de placer statut='payee', et
-- toute modification d'une commande déjà payée. Les écritures légitimes du
-- client (brouillon → en_attente_paiement → annulee, coordonnées de
-- livraison, session Checkout) restent permises ; le webhook (service_role)
-- n'est jamais concerné par ce refus.
--
-- auth.role() plutôt que current_user : boutique_finaliser_commande_payee
-- est elle-même SECURITY DEFINER, propriété de "postgres" (comme toutes les
-- fonctions de ce dépôt créées par migration) — à l'intérieur de son corps,
-- current_user vaut "postgres", pas "service_role", ce qui ferait échouer à
-- tort le chemin serveur légitime si le déclencheur testait current_user
-- (vérifié empiriquement avant livraison : W6 échouait avec cette
-- variante). auth.role() lit le GUC request.jwt.claim.role posé une fois
-- par PostgREST pour toute la requête ; il n'est pas affecté par le
-- changement de current_user d'une fonction SECURITY DEFINER.
create or replace function public.boutique_commandes_paiement_serveur_seul()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.statut = 'payee' then
    raise exception 'boutique_commandes: statut payee reserve au chemin serveur' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.statut = 'payee' then
    raise exception 'boutique_commandes: commande payee non modifiable hors chemin serveur' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists boutique_commandes_paiement_serveur_seul on public.boutique_commandes;
create trigger boutique_commandes_paiement_serveur_seul
  before insert or update on public.boutique_commandes
  for each row execute function public.boutique_commandes_paiement_serveur_seul();

commit;
