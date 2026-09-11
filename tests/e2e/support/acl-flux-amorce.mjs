// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — génère le SQL d'amorçage de la recette E2E (sur la fixture
// isolation_multitenant déjà chargée dans la pile jetable). Les clés push sont de vraies clés P-256
// de recette, générées à chaque exécution, pour que web-push chiffre réellement ses envois.
import { createECDH, randomBytes } from "node:crypto";

const cle = () => {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
};
const ok = cle();
const expire = cle();
const PORT_PUSH = Number(process.env.ACL_FLUX_PUSH_PORT ?? 3198);

console.log(`begin;
set local elsatia.capacite_personnes_bypass = 'on';
-- GoTrue refuse de lire un utilisateur dont une colonne de jeton est NULL (« converting NULL to
-- string is unsupported ») : la fixture pgTAP ne les renseigne pas. Données de recette seulement.
update auth.users set
  confirmation_token = coalesce(confirmation_token, ''), recovery_token = coalesce(recovery_token, ''),
  email_change_token_new = coalesce(email_change_token_new, ''), email_change = coalesce(email_change, ''),
  email_change_token_current = coalesce(email_change_token_current, ''), phone_change = coalesce(phone_change, ''),
  phone_change_token = coalesce(phone_change_token, ''), reauthentication_token = coalesce(reauthentication_token, '')
where email like '%@invalid.local';
-- Un utilisateur connecté a une entreprise active ; la fixture pgTAP la laisse nulle.
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
from public.utilisateurs_entreprises ue
where ue.utilisateur_id = u.id and ue.statut = 'actif' and u.entreprise_active_id is null;
-- La fixture accorde mode_compte_depot au poste administrateur de A : le proxy le traite alors
-- comme le compte partagé du dépôt et l'envoie à la borne de stock. Un administrateur n'est pas
-- un compte de dépôt : on retire cette permission pour la recette de l'export de paie.
update public.permissions_poste set autorise = false
where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and poste_id = 'a1000000-0000-0000-0000-000000000001'
  and cle_permission = 'mode_compte_depot';
-- Recette rejouable : remise à zéro de l'état consommé par un passage précédent (les journaux
-- immuables, eux, ne sont pas touchés : le spec vérifie des écarts).
delete from public.relances_documents where document_id = 'a9000000-0000-0000-0000-0000000000e2';
delete from public.acces_externes_documents where document_id = 'a9000000-0000-0000-0000-0000000000e2';
update public.notifications_utilisateurs set push_envoyee_at = null
where id in ('ae000000-0000-0000-0000-0000000000e2', 'ae000000-0000-0000-0000-0000000000e3');
update public.lots_virements set statut = 'transmis', provider_statut = null, execute_at = null
where id = 'e2e00000-0000-0000-0000-000000000001';
update public.periodes_paie set date_export = null where id = 'ad000000-0000-0000-0000-0000000000e2';
-- Entreprise B : porte l'export de paie. exporter_paie est une fonctionnalité « avancée » que
-- l'offre Mini de A n'ouvre pas ; B reçoit l'offre non limitée « premium », SANS abonnement
-- Stripe (le cron quotidien ne la touche donc pas). Son administrateur n'est pas un compte dépôt.
update public.entreprises set abonnement_offre = 'premium', abonnement_statut = 'actif'
where id = 'b0000000-0000-0000-0000-000000000001';
update public.permissions_poste set autorise = false
where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and poste_id = 'b1000000-0000-0000-0000-000000000001'
  and cle_permission = 'mode_compte_depot';
update public.permissions_poste set autorise = true
where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and poste_id = 'b1000000-0000-0000-0000-000000000001'
  and cle_permission = 'exporter_paie';
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise)
select 'b0000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'exporter_paie', true
where not exists (select 1 from public.permissions_poste where entreprise_id = 'b0000000-0000-0000-0000-000000000001'
                  and poste_id = 'b1000000-0000-0000-0000-000000000001' and cle_permission = 'exporter_paie');
insert into public.periodes_paie(id, entreprise_id, mois, date_debut, date_fin, cree_par) values
  ('bd000000-0000-0000-0000-0000000000e2', 'b0000000-0000-0000-0000-000000000001', '2031-02-01', '2031-02-01', '2031-02-28', '20000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
update public.periodes_paie set date_export = null where id = 'bd000000-0000-0000-0000-0000000000e2';
-- Entreprise A : compte Connect, référence expert-comptable, abonnement Mini mensuel actif.
update public.entreprises set stripe_account_id = 'acct_acl_e2e_A', reference_interne = 'ENT-ACL-A',
  stripe_subscription_id = 'sub_acl_e2e_A', stripe_customer_id = 'cus_acl_A',
  abonnement_offre = 'mini', abonnement_periodicite = 'mensuel', abonnement_statut = 'actif'
where id = 'a0000000-0000-0000-0000-000000000001';
-- 3 comptes actifs + 1 en pause = 4 facturables ; Mini en inclut 3 → 1 compte supplémentaire.
update public.employes set compte_application_statut = 'actif' where id in
  ('a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a2000000-0000-0000-0000-000000000003');
update public.employes set compte_application_statut = 'pause' where id = 'a2000000-0000-0000-0000-000000000004';
update public.employes set reference_interne = 'ACL-EMP-A2' where id = 'a2000000-0000-0000-0000-000000000002';
-- Factures clients : A payée par Checkout Connect, B dont la session expire.
update public.factures set stripe_checkout_id = 'cs_acl_e2e_connect' where id = 'aa000000-0000-0000-0000-000000000001';
update public.factures set stripe_checkout_id = 'cs_acl_e2e_expire' where id = 'ba000000-0000-0000-0000-000000000001';
-- Boutique : une commande à payer, une à expirer, une pour la tentative directe du client (D1).
insert into public.boutique_commandes(id, entreprise_id, utilisateur_id, statut, stripe_checkout_id, montant_ht, montant_tva, montant_ttc) values
  ('ac000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'en_attente_paiement', 'cs_acl_e2e_btq', 10, 2, 12),
  ('ac000000-0000-0000-0000-0000000000e3', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'en_attente_paiement', 'cs_acl_e2e_btq_exp', 10, 2, 12),
  ('ac000000-0000-0000-0000-0000000000e4', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'en_attente_paiement', 'cs_acl_e2e_d1', 10, 2, 12)
on conflict (id) do nothing;
-- Paie : période ouverte de A ; l'administrateur A peut exporter.
insert into public.periodes_paie(id, entreprise_id, mois, date_debut, date_fin, cree_par) values
  ('ad000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', '2031-02-01', '2031-02-01', '2031-02-28', '10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise)
select 'a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', p, true
from unnest(array['exporter_paie', 'gerer_paie', 'executer_virements']) p
where not exists (select 1 from public.permissions_poste where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
                  and poste_id = 'a1000000-0000-0000-0000-000000000001' and cle_permission = p);
-- Relances automatiques : volet devis actif, un devis envoyé il y a 20 jours.
insert into public.parametres_relances(entreprise_id, devis_auto_actif, envoyer_weekend) values
  ('a0000000-0000-0000-0000-000000000001', true, true)
on conflict (entreprise_id) do update set devis_auto_actif = true, envoyer_weekend = true;
update public.clients set email = 'client-a-e2e@recette.invalid' where id = 'a3000000-0000-0000-0000-000000000001';
insert into public.devis(id, entreprise_id, numero, client_id, chantier_id, statut, date_emission, montant_ht, montant_tva, montant_ttc) values
  ('a9000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', 'TEST_A_DEV_E2E', 'a3000000-0000-0000-0000-000000000001',
   'a4000000-0000-0000-0000-000000000001', 'envoye', current_date - 20, 100, 20, 120)
on conflict (id) do nothing;
-- Powens : lot transmis au prestataire.
insert into public.lots_virements(id, entreprise_id, numero, type_lot, statut, date_execution, provider, provider_payment_id) values
  ('e2e00000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'LOT-ACL-E2E', 'salaires', 'transmis', current_date, 'powens', 'pay_acl_e2e')
on conflict (id) do nothing;
-- Push : deux notifications et deux appareils (l'un répond 201, l'autre 410 = abonnement mort).
insert into public.notifications_utilisateurs(id, entreprise_id, utilisateur_id, type, titre, message) values
  ('ae000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'acl_e2e', 'Recette ACL webhook', 'Notification poussée par le webhook'),
  ('ae000000-0000-0000-0000-0000000000e3', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'acl_e2e', 'Recette ACL cron', 'Notification rattrapée par le cron')
on conflict (id) do nothing;
insert into public.push_abonnements(id, entreprise_id, utilisateur_id, endpoint, p256dh, auth) values
  ('af000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://127.0.0.1:${PORT_PUSH}/ok/acl-e2e', '${ok.p256dh}', '${ok.auth}'),
  ('af000000-0000-0000-0000-0000000000e3', 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://127.0.0.1:${PORT_PUSH}/gone/acl-e2e', '${expire.p256dh}', '${expire.auth}')
on conflict (id) do nothing;
commit;`);
