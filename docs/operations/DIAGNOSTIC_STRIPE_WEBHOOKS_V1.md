# Diagnostic Stripe & webhooks — procédure opérateur

Public : administrateur plateforme ELSATIA. Interface : `/plateforme/stripe` (lecture seule, réservée aux administrateurs plateforme, session MFA AAL2 exigée par le layout `/plateforme`).

**Stripe Live n'est pas activé à ce jour.** Cette procédure est écrite pour être applicable en mode Test dès maintenant, et telle quelle après bascule Live.

---

## 1. Chaîne réelle, de bout en bout

```
Stripe ──▶ POST /api/stripe/abonnement/webhook
             │
             ├─ 1. signature HMAC (STRIPE_WEBHOOK_ABONNEMENT_SECRET)      → 400 si invalide
             ├─ 2. barrière de mode (STRIPE_WEBHOOK_EXPECTED_MODE)        → 503 / 200-ignoré
             ├─ 3. refus des évènements Connect                           → 400
             ├─ 4. résolution de l'entreprise (metadata → sub → customer) → 422 / 503
             ├─ 5. réservation d'idempotence (abonnement_evenements)      → 200 si doublon
             ├─ 6. traitement métier selon le type d'évènement
             └─ 7. finalisation (statut_resultant) ─── ou rollback de la réservation
```

Trois codes de retour à connaître :

| Code | Signification | Ce que fait Stripe |
|---|---|---|
| `200` | Traité, ou doublon, ou volontairement ignoré | Rien |
| `503` | Indisponibilité transitoire (config, Supabase, verrou remise) | **Re-livre** |
| `422` / `400` | Évènement non traitable ou non authentique | Ne re-livre pas |
| `500` | Échec métier après journalisation ; la réservation est annulée | **Re-livre** |

## 2. Évènements traités, et leur effet

| Évènement Stripe | Effet métier | État en base | E-mail client |
|---|---|---|---|
| `checkout.session.completed` (mode subscription) | Synchronisation complète + réconciliation capacité | `entreprises`, `abonnements_entreprises` | — |
| `customer.subscription.created/updated/deleted` | Synchronisation depuis l'observation Stripe | idem | — |
| `invoice.created` (hors `subscription_create`) | Ajout des dépassements appareils/stockage à la facture | Stripe | — |
| `invoice.paid` | Statut `actif` + facture | `entreprises`, `factures_abonnement` | — |
| **`invoice.payment_failed`** | Statut **`suspendu`** + facture | idem | **Oui** — notification au contact de facturation Stripe |
| `invoice.payment_action_required` | Statut `suspendu` + facture | idem | — |

Tout autre type d'évènement est journalisé puis ignoré sans effet (`statut_resultant` vide).

## 3. Limite structurelle à connaître avant de lire la vue

Le journal `abonnement_evenements` **ne conserve que les évènements traités avec succès**. Quand le traitement métier échoue, la réservation est supprimée (`annuler_evenement_abonnement_service`) pour que Stripe puisse re-livrer l'évènement.

**Conséquence directe : on ne peut pas diagnostiquer une panne en cherchant des erreurs dans le journal — il n'y en a jamais.** Les échecs sont visibles :

- dans les **logs serveur**, sous le message `Webhook abonnement non traité` avec une `categorie` (`configuration_*`, `mode_stripe_incorrect`, `entreprise_inconnue`, `rattachement_stripe_incoherent`, `verrou_remise_occupe`, `echec_metier_apres_journalisation`) ;
- dans le **tableau de bord Stripe**, section Webhooks, qui montre les tentatives et les codes de retour.

Le signal exploitable dans `/plateforme/stripe` est donc le **silence** : un abonnement actif qui ne produit plus d'évènement.

## 4. Lire la vue `/plateforme/stripe`

| Bloc | Ce qu'il montre | Ce qu'on en fait |
|---|---|---|
| **Entreprises reliées à Stripe** | Statut, `cus_…`, `sub_…`, dernière facture, dernier évènement et son ancienneté | Ligne en rouge = abonnement actif silencieux depuis plus de 7 jours → §5 |
| **Derniers évènements webhook traités** | 50 derniers : date, type, entreprise, statut résultant, mode (test/live), objet Stripe | Vérifier qu'un évènement attendu est bien arrivé, et dans le bon mode |
| **Factures d'abonnement non réglées** | Statuts `open`, `past_due`, `uncollectible`, `payment_failed`, `void` | Suivi commercial ; la relance est pilotée par Stripe |
| **Opérations de capacité non finalisées** | Opérations hors `completed`/`failed`, dont `needs_reconcile` | §6 |

Aucun secret n'est consultable depuis cette page : ni `STRIPE_WEBHOOK_ABONNEMENT_SECRET`, ni clé API, ni donnée bancaire. Les identifiants `cus_`/`sub_`/`in_` sont des références opaques, déjà présentes sur `/plateforme`.

## 5. Symptôme : un abonnement actif ne reçoit plus d'évènement

Dans cet ordre :

1. **Vérifier le mode.** Colonne « Mode » des derniers évènements. Un `STRIPE_WEBHOOK_EXPECTED_MODE` incohérent avec l'environnement fait rejeter tous les évènements en amont de la base. Symptôme typique : *aucun* évènement récent, toutes entreprises confondues.
2. **Vérifier l'endpoint côté Stripe.** Tableau de bord Stripe → Webhooks : l'endpoint est-il actif, l'URL est-elle la bonne, quels sont les codes de retour des dernières tentatives ?
   - beaucoup de `503` → indisponibilité transitoire : configuration, Supabase, ou verrou remise. Stripe re-livre seul ; vérifier les logs serveur.
   - beaucoup de `400` → signature : le secret de l'endpoint et `STRIPE_WEBHOOK_ABONNEMENT_SECRET` ont divergé.
   - `422` → évènement non rattachable à une entreprise (§7).
3. **Vérifier les logs serveur** sur la période, en filtrant `Webhook abonnement non traité`.
4. **Rejouer depuis Stripe.** Le tableau de bord Stripe permet de re-livrer un évènement. C'est le moyen de rattrapage **normal et privilégié** : le webhook est idempotent (réservation par `stripe_event_id`), un rejeu est sans risque.

## 6. Symptôme : opération de capacité `needs_reconcile`

Ces opérations sont **reprises automatiquement** par la tâche planifiée des abonnements (`/api/cron/abonnements` → `reprendreOperationsCapaciteStripe`), sous réserve que `FEATURE_CRONS_ENABLED` soit actif.

1. Vérifier que la tâche planifiée tourne effectivement (`cronsActifs` dans la réponse de l'endpoint).
2. Laisser au moins un cycle complet avant toute intervention.
3. Une opération qui persiste plusieurs jours signale un blocage réel : analyser `erreur_courte` et les logs avant toute action manuelle.

**Ne jamais modifier directement la table `operations_capacite_stripe`.** Elle n'est alimentée que par des RPC `SECURITY DEFINER` qui portent les invariants (au plus une opération active par entreprise, idempotence). Une écriture directe casserait ces invariants.

## 7. Symptôme : `rattachement_stripe_incoherent` ou `entreprise_inconnue`

Le webhook refuse (422) un évènement dont la subscription ou le customer ne correspond pas à ceux enregistrés sur l'entreprise. C'est une **garde fail-closed volontaire** : elle empêche d'écrire les données d'un client sur un autre. Ne pas chercher à la contourner.

Diagnostic :

1. Relever `cus_…` / `sub_…` dans l'évènement Stripe, et les comparer à ceux de l'entreprise dans `/plateforme/stripe`.
2. Si l'entreprise pointe vers une **autre** subscription : il y a deux abonnements Stripe pour un même client (double souscription). Décision commerciale requise — annuler le doublon côté Stripe — avant toute correction en base.
3. Si l'entreprise n'a **aucune** subscription enregistrée : le premier rattachement se fait automatiquement (`lier_subscription_entreprise_service`) au prochain évènement de cycle de vie. Rejouer un `customer.subscription.updated` depuis Stripe suffit généralement.

## 8. Réconciliation — état réel des moyens disponibles

| Besoin | Moyen existant | Exposé à l'opérateur ? |
|---|---|---|
| Re-livrer un évènement manqué | Tableau de bord Stripe (rejeu) | **Oui** — voie normale, idempotente |
| Resynchroniser les comptes supplémentaires DB → Stripe | `reconcilierAbonnementStripe` | Automatique (tâche planifiée), pas de bouton |
| Reprendre une opération de capacité `needs_reconcile` | `reprendreOperationsCapaciteStripe` | Automatique (tâche planifiée), pas de bouton |
| Reprendre une opération de remise bloquée | `reprendreOperationRemiseAction` (`src/app/actions/plateforme.ts`) — **existe, testée, protégée par rôle + AAL2** | **Non — aucune interface ne la déclenche** |

**Gap ouvert, assumé et documenté :** l'action de reprise d'une opération de remise existe côté serveur mais n'est reliée à aucun écran, faute de pouvoir lister les opérations concernées — la table `plateforme_operations_remise` n'est lisible que par RPC, et aucune RPC de listage n'existe.

Contrat minimal nécessaire pour fermer ce gap dans un lot ultérieur :

```
plateforme_lister_operations_remise_actives()
  → id, entreprise_id, type_operation, statut, nombre_tentatives,
    empreinte_erreur, created_at, derniere_tentative_at
  garde : plateforme_exiger_role('total','facturation') + plateforme_exiger_session_aal2()
  lecture seule, aucun champ Stripe secret, aucun état interne du coupon
```

Une fois cette RPC disponible, l'écran n'a plus qu'à lister ces opérations et brancher le bouton sur `reprendreOperationRemiseAction`, qui est déjà idempotente (relecture Stripe puis finalisation attestée).

En attendant : une opération de remise bloquée se détecte par l'écart entre la remise annoncée sur `/plateforme` et celle réellement appliquée dans Stripe, et se traite par escalade technique.

## 9. Ce qu'il ne faut jamais faire

- Écrire directement dans `abonnement_evenements`, `factures_abonnement`, `operations_capacite_stripe` ou `plateforme_operations_remise`.
- Forcer `abonnement_statut` en base pour « débloquer » un client : l'évènement Stripe suivant écrasera la valeur. Corriger la cause, ou passer par les actions dédiées (*Signaler l'impayé* / *Règlement reçu*).
- Modifier un Price, un produit ou un coupon Stripe pour contourner un incident.
- Communiquer un identifiant Stripe à un tiers non autorisé.
