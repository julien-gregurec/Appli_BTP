# ELSATIA — Qualification de la capacité de reprise après incident (DR) — hébergé — V1

_Audit autonome réalisé le 21 septembre 2026, sans disponibilité de l'opérateur humain pendant l'exécution. Toute ambiguïté a été tranchée par le choix le plus conservateur (`DECISION_REQUIRED` → hypothèse la plus défavorable retenue) plutôt que par un arrêt de la mission. Aucune action destructive n'a été exécutée sur un environnement Preview ou Production : ce document distingue explicitement ce qui est **prouvé** (`PROVEN`, avec preuve reproductible ci-dessous) de ce qui est **supposé** (`NOT_PROVEN` / `DECISION_REQUIRED`, faute de preuve accessible depuis ce dépôt)._

## Verdict

# **DR LOCALLY PROVEN / HOSTED NOT PROVEN**

- La mécanique de sauvegarde/restauration PostgreSQL a été **démontrée réellement, en local, dans un environnement isolé, de façon reproductible** (section 8).
- Aucune restauration réelle (DB, Storage, Auth, configuration, secrets) n'a de trace de démonstration sur un environnement **hébergé** (Supabase distant), **Preview** ou **Production**. Rien dans le dépôt ne prouve que le plan Supabase actif inclut réellement des sauvegardes automatiques configurées, testées et surveillées.
- Ce n'est ni `DR BLOCKED` (le mécanisme de base fonctionne et rien n'empêche techniquement de qualifier l'hébergé), ni `DR HOSTED READY FOR REHEARSAL` (aucune preuve que l'environnement hébergé soit dans un état permettant un drill sans risque n'est disponible depuis ce dépôt — c'est une décision d'infrastructure externe, pas de code).

---

## 1. Inventaire des mécanismes existants

| Domaine | Mécanisme trouvé dans le dépôt | Statut |
|---|---|---|
| PostgreSQL (Supabase) | Aucun script de `pg_dump`/export applicatif. Aucune tâche cron de sauvegarde DB dans `vercel.json` ou `.github/workflows/`. | **Aucun mécanisme applicatif** — dépend entièrement de la sauvegarde managée Supabase (externe au code) |
| Supabase backups (PITR) | Non configuré dans le dépôt (ne peut pas l'être : c'est un réglage de plan Supabase, pas du code). `docs/BUDGET_MISE_EN_SERVICE.md:47` : « Restauration Supabase à un instant précis, conservation 7 jours » listée comme **option payante à +100 $/mois, non incluse** dans la configuration budgétée de base. La formule de base ne mentionne que « sauvegardes quotidiennes sur 7 jours » (`docs/BUDGET_MISE_EN_SERVICE.md:10,25`) — une promesse commerciale Supabase, pas un fait vérifié depuis ce dépôt. | **DECISION_REQUIRED → hypothèse conservatrice : NOT_PROVEN** (aucun accès à la console Supabase depuis cette session pour confirmer le plan actif, l'activation réelle du PITR, ni un test de restauration passé) |
| Storage (fichiers) | 9 buckets privés cloisonnés par entreprise + 1 bucket public (`entreprise-assets`), confirmés par `docs/AUDIT_SECURITE.md`. Aucun mécanisme de copie/export/réplication du Storage trouvé dans le code. La sauvegarde du Storage suit le même plan Supabase que la DB — non vérifiable ici. | **NOT_PROVEN** |
| Secrets | `.env.local.example` liste ~30 secrets (Supabase service role, Stripe ×4, OpenAI, VAPID, Sentry, `BANK_DATA_ENCRYPTION_KEY`, `PAYROLL_IMPORT_SECRET`, `CRON_SECRET`, `NOTIFICATIONS_WEBHOOK_SECRET`). Aucun gestionnaire de secrets externe (Vault, AWS Secrets Manager…) référencé — les secrets vivent dans les variables d'environnement Vercel/Supabase, sans procédure documentée de sauvegarde/rotation, sauf avertissement explicite : « ne jamais changer `BANK_DATA_ENCRYPTION_KEY` sans procédure de rotation/rechiffrement » (`.env.local.example:50`) — la procédure elle-même n'existe pas dans le dépôt. `scripts/verify-secrets.mjs` vérifie l'**absence** de secrets committés par erreur (hygiène), pas leur sauvegarde. | **NOT_PROVEN** (pas de coffre-fort de secrets, pas de procédure de restauration des secrets en cas de perte du projet Vercel/Supabase) |
| Vercel | `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` documente `npx vercel rollback` — un retour arrière de **code et variables liées au déploiement ciblé**, explicitement dit ne pas restaurer la base : « Le retour arrière Vercel restaure le code et les variables attachées au déploiement ciblé. Il ne restaure pas la base Supabase. » (ligne 40-41). Pas de sauvegarde du projet Vercel lui-même (domaine, config crons, env vars hors déploiement) documentée. | **Rollback code : PROVEN comme procédure documentée (non exécuté par cette mission — aucune autorisation de toucher au déploiement en cours) ; sauvegarde de la config Vercel elle-même : NOT_PROVEN** |
| Stripe configuration | Webhooks idempotents (voir section 6). Aucune sauvegarde/export de la configuration Stripe (produits, prix, webhooks, Connect) trouvée. Reconstruction dépendrait d'une re-création manuelle via le Dashboard/API Stripe — non testée. | **NOT_PROVEN** |
| Workers / crons | Deux tâches Vercel Cron (`vercel.json`) : `/api/cron/abonnements` (03:15 UTC) et `/api/cron/notifications-push` (03:45 UTC), protégées par `CRON_SECRET`. Aucun worker de sauvegarde. En cas de perte du projet Vercel, ces crons doivent être redéployés — pas de procédure de restauration écrite. | **NOT_PROVEN** au-delà du code source (qui lui est dans Git) |
| Fichiers utilisateurs / documents / photos / signatures | Stockés dans les buckets Supabase Storage privés cités ci-dessus, cloisonnés par `entreprise_id`. Aucune copie hors Supabase identifiée dans le dépôt. | **NOT_PROVEN** |

## 2. Travaux DR déjà présents dans le dépôt — comparaison avec l'état actuel

Aucun document ni script intitulé DR/disaster-recovery/backup n'existait avant cette mission. Ce qui s'en approche le plus :

- `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md` — un **rollback applicatif** (code Vercel), pas un plan DR. Il dit lui-même : « Ce document décrit la procédure du lot 2. **Il ne remplace pas les sauvegardes de production.** » (ligne 3). Il renvoie explicitement la restauration de base à « la sauvegarde disponible » sans préciser laquelle, ni comment la déclencher, ni son RPO/RTO.
- `docs/AUDIT_SECURITE.md` (18 juillet 2026) — audit de sécurité applicative (RLS, isolation multi-entreprise, webhook Stripe). Mentionne la sauvegarde une seule fois, comme précaution avant un script SQL (« après une sauvegarde »), sans qualifier cette sauvegarde.
- `docs/BUDGET_MISE_EN_SERVICE.md` — chiffre les sauvegardes Supabase comme **poste budgétaire**, pas comme capacité vérifiée. C'est un document de préparation commerciale au lancement, antérieur à toute mise en production confirmée.
- `docs/ARCHIVAGE_JUSTIFICATIFS.md` — étape 1 du déploiement du module : « Sauvegarder la base et le stockage » — une instruction opérationnelle à exécuter avant chaque migration sensible, pas un mécanisme automatisé ni documenté.
- Textes juridiques (`docs/juridique/cgv.md:57`, `politique-confidentialite.md:74`, `rgpd-registre-des-traitements.md:71`, `dpa-entreprises-clientes.md:31`) affirment tous des « sauvegardes régulières/automatiques » comme mesure de sécurité RGPD (art. 32). **Ce sont des engagements contractuels et juridiques déclaratifs, non adossés dans ce dépôt à une preuve technique de configuration, de test ou de supervision.** C'est l'écart le plus significatif trouvé par cette mission : l'entreprise s'engage juridiquement sur une garantie que le code ne permet pas de vérifier.

**Conclusion de la comparaison** : il n'y a pas de régression par rapport à un état antérieur plus mature — il n'y a simplement jamais eu de qualification DR formelle avant ce document. Le socle applicatif (idempotence Stripe, RLS, cloisonnement Storage) est solide ; le socle DR au sens propre (preuve de sauvegarde + preuve de restauration + RPO/RTO mesurés) est inexistant avant cette mission.

## 3. Automatisation réelle — fréquence, rétention, hors-site, chiffrement, rotation, alertes, healthchecks

| Critère | État constaté | Preuve/absence de preuve |
|---|---|---|
| Fréquence de sauvegarde | Non pilotée par le code de ce dépôt | `NOT_PROVEN` — dépend du plan Supabase souscrit, non vérifiable ici |
| Rétention | Idem — chiffres cités uniquement dans un document budgétaire (7 jours base, PITR 7 jours en option) | `NOT_PROVEN` (déclaratif, non technique) |
| Stockage hors site | Aucune réplication vers un stockage tiers (S3, autre région, autre cloud) trouvée dans le code | `NOT_PROVEN` |
| Chiffrement | TLS en transit confirmé (Supabase, Stripe signé, `BANK_DATA_ENCRYPTION_KEY` chiffre les IBAN en base — AES-256). Chiffrement **des sauvegardes elles-mêmes** : non vérifiable depuis le dépôt (dépend de Supabase) | Chiffrement applicatif ciblé : `PROVEN` (code présent). Chiffrement des backups : `NOT_PROVEN` |
| Rotation (secrets/clés) | Explicitement **non procédurée** pour `BANK_DATA_ENCRYPTION_KEY` (« ne jamais la changer sans procédure de rotation/rechiffrement des IBAN existants » — la procédure n'existe pas) | `NOT_PROVEN` |
| Alertes | Sentry configuré pour les erreurs applicatives (`docs/SENTRY.md`), pas pour l'échec d'une sauvegarde ou d'une restauration | `NOT_PROVEN` sur le périmètre DR |
| Healthchecks | Aucun healthcheck de sauvegarde/DB trouvé. Les deux crons Vercel n'ont pas de supervision de succès/échec documentée au-delà des logs Vercel | `NOT_PROVEN` |

## 4. Un restore a-t-il déjà été réellement démontré ?

| Environnement | Démontré ? | Détail |
|---|---|---|
| LOCAL | **OUI — PROVEN par cette mission** | Voir section 8 : drill reproductible exécuté dans ce conteneur isolé (PostgreSQL 16 local, sans Docker ni accès à Supabase), le 21 septembre 2026. |
| HOSTED ISOLATED (projet Supabase de test séparé) | **NON — NOT_PROVEN** | Aucune trace dans le dépôt, les journaux `RELAIS_*.md` ou la documentation d'un restore Supabase réellement exécuté, même sur un projet de test. |
| PREVIEW (déploiement Vercel de preview) | **NON — NOT_PROVEN** | Aucune trace. |
| PRODUCTION | **NON — NOT_PROVEN**, et **interdiction explicite de tester** conservée par cette mission (aucune restauration destructive en production, conformément à la consigne). |

Aucune extrapolation n'est faite : le fait qu'un restore fonctionne en local sur un PostgreSQL générique ne permet **pas** de conclure qu'un restore fonctionnerait sur l'infrastructure Supabase hébergée réelle (Auth, Storage, extensions propriétaires, réseau, volumétrie réelle diffèrent — voir section 8).

## 5. RPO / RTO actuellement démontrés

- **RPO démontré (hébergé)** : `NOT_PROVEN`. Aucune preuve technique accessible depuis ce dépôt de la fréquence réelle des sauvegardes Supabase en vigueur (dépend du plan souscrit, non vérifiable sans accès à la console/API Supabase, hors périmètre de cette session).
- **RTO démontré (hébergé)** : `NOT_PROVEN`, pour la même raison — aucune restauration hébergée chronométrée n'existe.
- **RPO/RTO démontrés (local, périmètre DB uniquement, hors Storage/Auth/config)** :
  - RPO local : **instantané au moment du `pg_dump`** — pas de perte entre la sauvegarde et la restauration dans le drill (pas de fenêtre d'écriture concurrente testée).
  - RTO local mesuré : **~0,3 s pour la sauvegarde + ~1,4 s pour la restauration** sur le sous-ensemble de schéma qui s'applique hors Supabase (134 tables sur 178 fichiers de migration, données synthétiques minimales). **Ce chiffre ne doit pas être extrapolé à la production** : il ne mesure ni le volume réel de données, ni le temps réseau, ni la reconstruction du Storage/Auth/secrets/Vercel, ni la coordination humaine (déclaration d'incident, communication, DNS). Le RTO réel d'un incident hébergé complet reste `NOT_PROVEN`.

## 6. Problème historique de retry webhook Stripe — état actuel dans le code

**Recherché et confirmé résolu.** Les trois routes webhook Stripe du dépôt appliquent toutes le même schéma d'idempotence :

- `src/app/api/stripe/webhook/route.ts` (Stripe Connect, paiements clients) — `INSERT` dans `stripe_webhook_events` avant tout traitement ; si l'insertion échoue avec le code Postgres `23505` (violation de contrainte unique = évènement déjà vu), la route répond `{received:true, duplicate:true}` sans ré-appliquer l'effet métier.
- `src/app/api/stripe/boutique/webhook/route.ts` — même mécanisme sur `stripe_webhook_events`.
- `src/app/api/stripe/abonnement/webhook/route.ts` — même mécanisme sur une table dédiée `abonnement_evenements` (contrainte unique sur `stripe_event_id`), avec en plus suppression de l'enregistrement et retour HTTP 500 en cas d'échec du traitement métier — ce qui autorise intentionnellement Stripe à *rejouer* l'évènement plus tard, sans risque de double-traitement puisque le prochain rejeu retentera l'insertion (qui réussira, l'ancienne ayant été supprimée) et ré-exécutera proprement la synchronisation.
- La table `stripe_webhook_events` est créée par la migration `20260715000080_suite_metier_complete.sql:205`, avec RLS activée et tous les privilèges révoqués pour `public`/`anon`/`authenticated` (accès service-role uniquement).
- `docs/AUDIT_SECURITE.md` (18 juillet 2026) confirme indépendamment : « Webhook Stripe — ✅ conforme […] Déduplication via `stripe_webhook_events`. »

**Conclusion** : le risque historique de retraitement d'un webhook Stripe rejoué (double paiement, double facturation) est **couvert par construction** dans le code actuel, sur les trois points d'entrée webhook existants. Aucun code n'a été trouvé qui traite un évènement Stripe sans passer par cette déduplication.

## 7. Capacité à restaurer — par composant

| Composant | Capacité de restauration | Statut |
|---|---|---|
| DB (PostgreSQL/Supabase) | Mécanique de dump/restore **prouvée en local** sur un sous-ensemble représentatif du schéma réel (72 % des fichiers de migration s'appliquent tels quels hors Supabase ; les 28 % restants dépendent de primitives Supabase — `storage.objects`, extensions gérées, rôles gérés — non reproductibles hors plateforme Supabase, voir section 8). Sur l'infrastructure hébergée elle-même : `NOT_PROVEN`. | Local : `PROVEN` (partiel, DB seule). Hébergé : `NOT_PROVEN` |
| Storage | Aucun mécanisme de sauvegarde/restauration testé, ni en local ni en hébergé. Un restore de la structure de policies est possible via les migrations SQL (elles recréent les policies), mais **pas les fichiers eux-mêmes**, qui ne sont pas dans Git. | `NOT_PROVEN` |
| Configuration (Vercel : domaine, crons, régions) | Reconstructible manuellement depuis `vercel.json` (versionné) + réglages Dashboard non versionnés (domaine, protections, intégrations). Partiellement reconstructible depuis le code, partiellement dépendant de réglages non documentés. | `DECISION_REQUIRED → conservateur : NOT_PROVEN dans son ensemble` |
| Variables d'environnement / secrets | `.env.local.example` sert de **liste de référence des noms de variables**, pas de leurs valeurs. Aucune sauvegarde chiffrée des valeurs réelles trouvée. En cas de perte du projet Vercel/Supabase, certains secrets (`BANK_DATA_ENCRYPTION_KEY` notamment) seraient **irrécupérables** — leur perte rend les IBAN déjà chiffrés en base illisibles définitivement, ce qui est un risque de perte de données silencieuse à signaler. | `NOT_PROVEN`, et **risque identifié à traiter en priorité** |
| Auth (Supabase Auth) | Aucun export/import des comptes Auth (utilisateurs, mots de passe hachés, sessions) testé. La table `auth.users` est gérée par Supabase, hors des migrations du dépôt. | `NOT_PROVEN` |
| Fonctions / jobs (crons Vercel) | Définition versionnée dans `vercel.json` → redéployable directement depuis Git. C'est la seule brique dont la reconstruction de la **définition** est réellement prouvée par le simple fait qu'elle est en Git, mais son **exécution effective post-restauration** (variables `CRON_SECRET`, dépendances DB déjà restaurées) n'a pas été testée en conditions réelles. | Définition : `PROVEN` (versionnée). Fonctionnement après incident réel : `NOT_PROVEN` |
| Application (code Next.js) | Rollback Vercel documenté et **outillé** (`npx vercel rollback`), code entièrement versionné dans Git. C'est la brique la mieux couverte. | `PROVEN comme procédure disponible` (non exécutée par cette mission, aucun incident réel ni autorisation de manipuler le déploiement en cours) |

## 8. Drill reproductible — environnement LOCAL isolé

Un environnement local isolé était disponible dans ce conteneur (PostgreSQL 16 natif, `pg_dump`/`pg_restore` disponibles ; **Docker non disponible** — le socket `/var/run/docker.sock` est absent, donc `supabase start`, qui dépend de Docker, n'a pas pu être utilisé). Un drill a donc été exécuté directement contre un cluster PostgreSQL local, sans toucher à aucun environnement Preview ou Production, avec des données strictement synthétiques créées pour l'occasion.

**Étapes exécutées (reproductibles avec les commandes ci-dessous)** :

1. Démarrage du cluster local : `service postgresql start`.
2. Création d'une base `dr_drill` isolée + stubs minimaux des schémas `auth`/`storage`/`extensions`/rôles `anon`/`authenticated`/`service_role` (ces schémas ne sont pas fournis par un PostgreSQL générique, seulement par la plateforme Supabase).
3. Application séquentielle des 178 fichiers de `supabase/migrations/*.sql` (le schéma réel du produit, sans modification) :
   - **129 réussis, 49 échoués** (72 % du schéma applicable hors Supabase). Les échecs concernent presque tous des dépendances à des primitives propriétaires Supabase (buckets/policies `storage.objects` réels, fonctions internes gérées par la plateforme) — **c'est en soi un résultat utile** : il montre que ce produit ne peut pas être restauré à l'identique sur un PostgreSQL générique quelconque ; une restauration hors Supabase nécessiterait de recréer l'équivalent des services Auth/Storage de Supabase, pas seulement la base relationnelle.
   - 134 tables applicatives réelles ont été matérialisées (`entreprises`, `clients`, `chantiers`, `factures`, etc.).
4. Insertion de données synthétiques de test (deux entreprises fictives « DRILL Entreprise A/B », deux clients associés).
5. Empreinte de contrôle avant incident : `2 lignes | md5=0301a501d0eccc725180a3d147a8869c` sur `entreprises`, `2` lignes sur `clients`.
6. Sauvegarde : `pg_dump -Fc -d dr_drill -f backup.dump` → **0,28 s**, fichier de 1,1 Mo.
7. **Simulation d'incident réel : suppression complète de la base** (`DROP DATABASE dr_drill`) — action destructive, mais exclusivement sur la base locale isolée créée pour ce drill, jamais sur une base du projet.
8. Recréation d'une base vide `dr_drill_restored` et restauration : `pg_restore -d dr_drill_restored --no-owner --exit-on-error backup.dump` → **1,44 s, zéro erreur**.
9. Vérification post-restauration : mêmes 134 tables, mêmes 2 lignes, **même empreinte md5** sur `entreprises`, même comptage sur `clients`. **Intégrité confirmée bit à bit sur les données testées.**
10. Nettoyage : bases et fichier de sauvegarde du drill supprimés après vérification.

**Ce que ce drill prouve** : la mécanique de sauvegarde/restauration PostgreSQL logique (`pg_dump`/`pg_restore`) fonctionne sans erreur et sans perte sur la majorité du schéma réel de ce produit, dans un environnement jetable et isolé.

**Ce que ce drill ne prouve pas** (pour éviter toute extrapolation) :
- que Supabase (plateforme hébergée) exécute réellement ce type de sauvegarde, à quelle fréquence, avec quelle rétention, ni si le plan actuellement souscrit l'inclut ;
- la restauration de Storage, Auth, ou des secrets/variables d'environnement ;
- le comportement sous volumétrie de production réelle, ni sous charge/écriture concurrente ;
- un temps de restauration représentatif d'un incident réel hébergé (réseau, coordination, DNS, Vercel, communication client).

Aucun drill n'a été tenté sur Preview ou Production, conformément à la consigne.

## 9. Runbook incident

**Aucun runbook incident n'existe dans ce dépôt.** Le document le plus proche, `docs/DEPLOIEMENT_ET_RETOUR_ARRIERE.md`, couvre uniquement :
- le rollback du **code** applicatif via Vercel ;
- des critères de déclenchement de rollback (erreurs de connexion, fuite de données inter-entreprises, taux d'erreur anormal…) ;
- une esquisse de retour arrière **de schéma** DB (nouvelle migration corrective plutôt que suppression), avec la restauration de sauvegarde explicitement classée « en dernier recours ».

Il ne couvre pas : qui déclenche l'incident, qui décide, comment communiquer aux utilisateurs, comment restaurer Storage/Auth/secrets, ni de critère de RPO/RTO cible à respecter. **Absence confirmée, pas supposée.**

## 10. Synthèse des preuves vs hypothèses

**Prouvé (`PROVEN`) par cette mission ou par le code existant :**
- Idempotence des trois webhooks Stripe (protection contre les rejeux) — lecture directe du code, corroborée par un audit de sécurité antérieur indépendant.
- Cloisonnement RLS multi-entreprise et policies Storage par entreprise — lecture directe du code/migrations.
- Rollback de code Vercel disponible comme procédure documentée et outillée.
- Mécanique de sauvegarde/restauration PostgreSQL (dump logique) fonctionnelle et sans perte, en local, sur 72 % du schéma réel — drill exécuté et vérifié dans cette session.

**Non prouvé (`NOT_PROVEN`), faute d'accès ou de preuve dans ce dépôt :**
- Configuration réelle des sauvegardes Supabase hébergées (fréquence, rétention, PITR, hors-site, chiffrement au repos).
- Toute restauration réellement exécutée sur un environnement hébergé, isolé, preview ou production.
- Restauration de Storage, Auth, secrets/variables d'environnement, configuration Vercel non versionnée, configuration Stripe.
- RPO/RTO hébergés.
- Alerting/healthcheck sur l'état des sauvegardes.
- Cohérence entre les engagements RGPD/CGV (« sauvegardes automatiques régulières ») et une preuve technique vérifiable.

**Risque prioritaire signalé** : la clé `BANK_DATA_ENCRYPTION_KEY` n'a ni sauvegarde ni procédure de rotation documentée ; sa perte rendrait les IBAN déjà chiffrés en base irrécupérables de façon définitive et silencieuse — à traiter avant tout incident, indépendamment de la qualification DR globale.

---

_Document produit de façon autonome. Aucune question n'a été posée pendant l'exécution ; les points ambigus ont été résolus par le choix le plus conservateur et documentés comme tels ci-dessus (`DECISION_REQUIRED`). Aucune action destructive n'a été effectuée hors de l'environnement de drill local jetable créé et détruit par cette mission._
