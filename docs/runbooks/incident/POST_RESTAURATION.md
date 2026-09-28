# Procédure — Ordre post-restauration (DB → réouverture du trafic)

S'applique après toute restauration de la base (PITR, snapshot, `scripts/dr/06_restore.sh`).
Prérequis : décision propriétaire (DR V2 §2). Preuve locale du verrou : drill S5 ; du rejeu :
drill S2/S6/S7 ; pgTAP `incident_safe_mode_v1`, `stripe_webhook_reservations_orphelines_v1`.

> **Règle : aucun droit commercial n'est rouvert avant la réconciliation Stripe.** La base
> restaurée reflète Stripe **au point de restauration** : tout paiement, résiliation, échec de
> prélèvement ou changement d'offre survenu après est absent (conclusion DR V2 §12 : Stripe reste
> la source de vérité ; `abonnement_evenements` est restauré avec le dump, donc sans les événements
> postérieurs). Rouvrir avant le rejeu, c'est rendre l'accès à un client résilié ou couper un
> client qui a payé.

## 0. Verrouiller AVANT tout trafic
Le mode sûr est **dans** la base restaurée, avec l'état du point de restauration (probablement
nominal). Il faut donc le poser sur la base restaurée **avant** que le trafic ne l'atteigne :
- restauration sur un **nouveau projet** (recommandé, DR V2 §2) : poser les verrous sur le nouveau
  projet, **puis** basculer les variables Vercel ;
- restauration **en place** : exécuter ces deux lignes en tout premier dans l'éditeur SQL dès que
  le projet redevient joignable (les proxys gardent 5 min le dernier état connu — poser
  `app_coupee` global sur l'ancienne base avant la restauration couvre cette fenêtre) :

```sql
select public.incident_basculer_operateur('<nom>', 'global', 'app_coupee', true, 'RESTORE <id> : base restaurée, trafic coupé', '<INC>');
select public.incident_basculer_operateur('<nom>', 'global', 'reconciliation_stripe_requise', true, 'RESTORE <id> : rejeu Stripe requis', '<INC>');
```
Effets (prouvés) : utilisateurs en 503 ; écritures de session refusées même en direct ; crons
(abonnements, essais IA, planificateur de purge RGPD) refusés ; webhooks Stripe **acceptés** ;
la réouverture globale est refusée par la base tant que le verrou est posé.
Studio (projet dédié, s'il est restauré aussi) : `select studio_guard.set_mode('off', …)`.

## 1. DB — valider la restauration
`scripts/dr/04_manifest.sh` + `07_verify.sh` (zéro divergence) + `08_verify_rls_functional.sh`
(DR V2 §5) ; `preview:db-verify` ; noter l'horodatage exact du point de restauration `T0`.

## 2. Storage
La base restaurée référence des objets (`storage.objects`) ; les binaires ne sont **pas** restaurés
avec elle. Contrôler les références mortes (fichiers supprimés après `T0`) et les objets orphelins
(créés après `T0`) : procédure Storage du DR V2 ; Studio : `storage-reconcile.mjs` en dry-run.
Poser `uploads` global si l'écart n'est pas soldé.

## 3. Auth
`auth.users` / `auth.sessions` sont revenus à `T0` : comptes créés après `T0` absents, mots de passe
modifiés après `T0` revenus à l'ancien, sessions révoquées après `T0` redevenues valides.
- Révoquer toutes les sessions : `delete from auth.sessions;` (reconnexion générale, sûr).
- Lister les inscriptions / changements d'accès postérieurs à `T0` (journaux Auth) et prévenir les
  personnes concernées.

## 4. Stripe — rejeu et réconciliation
1. Pour **chaque endpoint** (Connect, SaaS abonnements, boutique ; Tools : compte séparé), renvoyer
   tous les événements depuis `T0` (Stripe conserve 30 jours) :
   `stripe events list --created[gte]=<T0 unix>` puis `stripe events resend <evt> --webhook-endpoint=<we_…>`
   (ou Dashboard → Webhooks → événements → Resend). L'ordre importe peu : les événements anciens
   sont journalisés « périmés » sans effet (`stripe_event_ordering_v1`), les doublons sont
   ignorés, une réservation interrompue est reprise (migration `20260928000702`).
2. Tools : rejouer les notifications Stripe du compte Tools ; Apple/Google : relancer la
   vérification des achats (`/api/tools/monetization/{apple,google}/verify`) pour les comptes
   concernés (l'historique Apple se relit par API ; Google RTDN n'est pas rejouable — voir rapport §14).
3. Contrôles (doivent tous être vides / cohérents) :
   ```sql
   select * from public.incident_webhooks_stripe_orphelins();                   -- 0 ligne
   select abonnement_statut, count(*) from public.entreprises
    where stripe_subscription_id is not null group by 1;                        -- à comparer à Stripe
   select * from public.stripe_essai_ecarts order by 1 desc limit 20;           -- écarts d'essai
   ```
   Comparer les abonnements actifs Stripe (`stripe subscriptions list --status=active`) aux
   entreprises `actif`/`essai` ; tout écart = rejouer l'événement manquant, **jamais** une
   correction manuelle du statut.
4. Attester : lever le verrou avec un motif chiffré
   (`… 'reconciliation_stripe_requise', false, 'RESTORE <id> : N événements rejoués, 0 orpheline, 0 écart' …`).

## 5. Jobs RGPD
Après la réconciliation (les purges suppriment aussi des événements de facturation) :
pour chaque preuve de purge archivée hors base dont `purgee_at > T0` →
`node scripts/purger-entreprise.mjs <entreprise_id> restaurer-echeance --preuve=<fichier.json>` si
l'entreprise n'a plus d'échéance → `execute` → `verify` → nouvelle `preuve` (`ELSATIA_DATA_RETENTION_BACKUP_CONSISTENCY_V1.md` §5,
`ELSATIA_RGPD_PURGE_OPERATION_V2.md`). Le planificateur de purge (cron d'abonnements) reprend seul à
la réouverture.

## 6. Contrôles de santé
- `GET /api/health` GP / Réserves / Studio : `OPERATIONAL` hors `mode_sur` ; sondes profondes
  (Bearer) : e-mail, Stripe, worker.
- `select * from public.incident_journal order by id desc limit 20;` : toutes les étapes tracées.

## 7. Réouverture du trafic
1. `app_coupee` global → `false` (refusé par la base tant que l'étape 4 n'est pas attestée).
2. Surveiller 30 min (santé, 5xx, `journal_abus_securite`, webhooks Stripe).
3. Statut public `OPERATIONAL` ; communication clients (DR V2 §9) ; postmortem (DR V2 §10) avec
   `backup_id`, `T0`, nombre d'événements rejoués, écarts traités.
