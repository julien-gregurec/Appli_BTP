# ELSATIA — Préproduction DB E2E & Rollback V1

Date : 2026-09-02

Branche : `codex/elsatia-preprod-db-e2e-rollback-v1`

SHA testé : `ac7bf050056c1bf74593c299112d68d2d26e9b45`

Branche distante vérifiée : `gh/feat/tarification-on-canonical-preprod-v1` au même SHA

Mode : local/Test uniquement, aucune mutation Production

## 1. Périmètre et provenance des preuves

### Preuves exécutées dans ce lot par CODEX

- pile Supabase Fresh isolée, migrations et pgTAP ;
- suite Playwright intégrée, MFA TOTP réel, Storage synthétique ;
- huit Checkout Sessions Stripe Test et expiration ;
- QA racine et Tools complète ;
- migration d'une copie logique locale 210 → 253 ;
- restauration de cette copie à l'état 210 et comparaison des sentinelles ;
- nettoyage des fixtures et arrêt des environnements.

### Acquis historiques réutilisés et revérifiés

- dump Production chiffré et son manifeste DR ;
- Restore canonique sur PGDATA chiffré ;
- ACL applicatif à zéro et classification des 532 écarts système ;
- backup/restore Storage DR déjà validé ;
- état fermé du rôle temporaire `elsatia_backup`.

### Éléments documentaires Claude

Aucun nouveau livrable Claude n'a été fourni dans ce lot. Le présent document
formalise le runbook exécutable et les limites de rollback constatées par
CODEX ; il ne remplace pas une procédure humaine de go-live Production.

## 2. Fresh canonique

La pile locale dédiée utilisait le project ID
`elsatia-preprod-db-e2e-rollback-v1` et les ports 57320–57329, sans toucher aux
piles locales existantes. Elle a été construite depuis Git au SHA testé.

| Contrôle | Résultat |
|---|---:|
| Migrations appliquées | 253 uniques |
| Première version | `20260710000001` |
| Dernière version | `20260902000255` |
| Migration ACL 255 | présente |
| pgTAP | 45 fichiers, 870/870 PASS |
| Second passage | aucune migration absente |

La durée détaillée du reset n'a pas été persistée ; aucun chiffre n'est donc
inventé dans ce rapport.

## 3. Restore chiffré

- sparsebundle :
  `/Volumes/ELSATIA-DEV/ELSATIA-BACKUPS/ELSATIA-PRODUCTION-DR.sparsebundle` ;
- type : sparse bundle, APFS, `image-encrypted: TRUE`, lecture/écriture ;
- montage : `/Volumes/ELSATIA-PRODUCTION-DR` ;
- dump :
  `ELSATIA-PRODUCTION-BACKUPS/database/elsatia-production-20260902T163430Z.dump` ;
- taille : 2 319 892 octets ;
- SHA-256 :
  `271c25e434c26c095136775de692b7c65a597c7ebea1aea57f10ef256885d84b` ;
- PGDATA Restore canonique :
  `/Volumes/ELSATIA-PRODUCTION-DR/ELSATIA-PRODUCTION-BACKUPS/restore/acl-reconciliation-v1/production-restore/pgdata` ;
- méthode : bind mount Docker vers le volume chiffré ;
- taille observée historiquement : environ 213–219 Mio.

Le Restore canonique atteint 253 migrations et passe les mêmes 45 fichiers
pgTAP, soit 870/870. Le second passage ne trouve aucune migration absente.

### Sentinelles Restore

| Sentinel | Valeur |
|---|---:|
| Auth users | 6 |
| Storage metadata | 1 |
| Entreprises | 6 |
| Utilisateurs | 6 |
| Clients | 31 |
| Chantiers | 30 |
| Devis | 108 |
| Factures | 73 |
| Ledger final | 253 |

Les empreintes d'identifiants et agrégats métier du contrôle DR antérieur sont
restés identiques avant/après migration. Aucune perte métier n'a été observée.

## 4. Drift Fresh / Restore

Résultat repris des inventaires exhaustifs du même Restore et du même socle :

- drift canonique applicatif : **0** ;
- drift système exploitable : **0** ;
- drift système Supabase managé : **532** lignes, exactement allowlistées ;
- répartition : 488 Fresh-only et 44 Restore-only ;
- aucun droit Restore-only pour `anon`, `authenticated`, `service_role` ou
  `authenticator`.

L'allowlist fermée reste celle de
`docs/audits/elsatia-supabase-system-drift-audit-v1.md`. Tout nouvel objet,
rôle, privilège ou changement de sens reste bloquant.

## 5. E2E applicatif, rôles et multitenant

La fixture E2E a été corrigée uniquement dans le harness : un administrateur
plateforme ne doit pas être artificiellement rattaché à une entreprise métier.
Les sélecteurs de mot de passe ont également été rendus non ambigus et les
routes interdites vérifient désormais le statut HTTP 404.

- Playwright : **40/40 PASS** ;
- authentification, session et logout : PASS ;
- non authentifié : refus ;
- AAL1 sans facteur : enrôlement imposé ;
- AAL1 avec facteur : challenge imposé ;
- AAL2 non-admin/inactif : refus ;
- AAL2 admin total actif : accès ;
- entreprise A/B, lectures/écritures et refus croisés : PASS ;
- RPC, documents, habilitations applicatives et changement d'entreprise : PASS ;
- Gestion Pro / Tools / Colors selon habilitations : PASS ;
- métier Colors profond : hors périmètre, conformément au cadrage.

## 6. MFA/AAL2

Un utilisateur Auth local aléatoire a été créé, enrôlé avec un vrai facteur
TOTP, challengé, vérifié à AAL2, déconnecté, reconnecté, rechallengé puis
désenrôlé. Le secret TOTP et le mot de passe sont restés exclusivement en
mémoire du harness local et n'ont été ni affichés ni conservés.

Résultats :

- enrollment → verify → AAL2 → `/plateforme` : PASS ;
- reconnexion → challenge → AAL2 : PASS ;
- unenroll contrôlé : PASS ;
- fixture Auth/facteur supprimée : PASS ;
- tests ciblés MFA/fail-closed : **24/24 PASS** ;
- Auth indisponible, `getAAL`, `listFactors` et challenge en erreur : zone
  sensible refusée ;
- second admin total et récupération logique par email : couverts par la suite
  SQL/MFA ; aucune suppression SQL manuelle n'est retenue comme procédure
  normale.

## 7. Storage E2E et rollback

Le test local a exercé un bucket privé pour les tenants A/B et le bucket public
contractuel `entreprise-assets` :

- A accède à A et B accède à B ;
- A → B et B → A refusés ;
- contrat public : PASS ;
- suppression puis restauration d'un objet : SHA-256 identique ;
- aucune fixture finale : 0 utilisateur MFA, 0 facteur MFA et 0 objet dont le
  chemin contient `preprod-`.

Deux objets synthétiques laissés par une première passe du harness ont été
identifiés précisément puis supprimés via l'API Storage locale avant l'arrêt.
Aucune donnée Production n'a été modifiée.

## 8. Stripe Test, webhook et attestation

Huit Checkout Sessions ont été créées en mode Test puis expirées :

| Offre | Mensuel | Annuel |
|---|---:|---:|
| Mini | 79 EUR | 790 EUR |
| Pro | 249 EUR | 2 490 EUR |
| Business | 449 EUR | 4 490 EUR |
| Entreprise | 599 EUR | 5 990 EUR |

Pour les huit sessions : montant, EUR, intervalle, Price ID canonique et
`livemode=false` sont conformes. Une ancienne Price Enterprise mensuelle
dupliquée sans lookup key a été observée et laissée intacte ; le harness a
sélectionné fail-closed la Price TARIFS-V2 canonique. Stripe Live n'a pas été
lu ni modifié.

- sessions créées : 8/8 ;
- sessions expirées : 8/8 ;
- tests Stripe ciblés étendus : **119/119 PASS** (9 fichiers) ;
- modes Test/Live inattendus, événements incomplets, entreprise absente,
  invalide ou inconnue, erreur Supabase, idempotence, double événement,
  verrouillage, saga, expiration et logs sensibles : PASS par la suite ciblée ;
- attestation Ed25519, registry publique, key id et signatures inconnues :
  fail-closed ;
- aucune clé privée dans Git et aucun provisionnement Production.

## 9. QA finale

| Contrôle | Résultat |
|---|---:|
| Vitest Gestion Pro | 87 fichiers, 686/686 PASS |
| Tests Tools | 20 fichiers, 107/107 PASS |
| MFA ciblé | 24/24 PASS |
| Stripe ciblé étendu | 119/119 PASS |
| Typecheck Gestion Pro | PASS |
| Typecheck Tools | PASS |
| ESLint Gestion Pro | PASS, 0 erreur, 3 warnings historiques `img` |
| ESLint Tools | PASS |
| Build Gestion Pro | PASS |
| Build Tools | PASS |
| verify:migrations | PASS, 253 uniques |
| verify:secrets | PASS, 1 265 fichiers, aucun secret reconnu |
| npm audit racine | 0 vulnérabilité |
| npm audit Tools | 0 vulnérabilité |
| git diff --check | PASS |

Le premier build avait rencontré un lien `node_modules` non exploitable par
Turbopack dans le worktree temporaire. Une installation reproductible locale
(`npm ci`, racine puis Tools) a corrigé uniquement l'environnement ; les deux
builds complets passent ensuite.

## 10. Preuve exécutable du rollback DB

Une base secondaire locale `elsatia_preprod_rollback_probe`, sans lien avec
Preview ou Production, a été créée dans le conteneur Restore :

1. restauration du dump : sentinelles exactes `6|1|210|6|31|30|108|73` ;
2. application ordonnée de **toutes** les migrations absentes du ledger,
   y compris les migrations historiques dont le timestamp est inférieur au
   maximum Production ;
3. état post-migration : 253 versions uniques, max `20260902000255`, mêmes
   compteurs métier ;
4. suppression/recréation de la seule base probe ;
5. nouvelle restauration du même dump ;
6. état rollback : sentinelles exactes `6|1|210|6|31|30|108|73` ;
7. suppression finale de la base probe.

Deux avertissements connus de `pg_restore` concernent le socle managé
(`realtime.list_changes`/`log_min_messages` et `vault.secrets`) ; ils sont les
mêmes que lors de la restauration DR validée et n'altèrent pas les sentinelles
ELSATIA.

### Anomalie de harness classifiée

La suite pgTAP complète ne doit pas être relancée dans une *base secondaire*
créée à l'intérieur d'un cluster Restore : les grants/default privileges et
objets système Supabase sont attachés à la base principale et ne sont pas tous
recréés par le dump logique dans cette topologie. Cette tentative a donc produit
des refus liés au socle du harness et n'est pas une preuve produit. La preuve
retenue est la suite **870/870** exécutée sur le Restore canonique, dont le
PGDATA chiffré est dédié, et la comparaison des sentinelles sur la probe.

La première tentative de montée avait aussi ignoré les migrations absentes à
timestamp inférieur au maximum du ledger. Elle a été abandonnée, la probe a été
recréée depuis le dump, puis le parcours correct « toutes les versions absentes »
a atteint 253 sans collision. Aucun correctif produit n'a été nécessaire.

## 11. Runbook rollback coordonné

Le rollback code seul n'est pas un rollback complet : un ancien binaire peut
être incompatible avec les nouvelles ACL, fonctions ou colonnes. Le retour
arrière Production devra être atomique et humainement autorisé :

1. fermer les écritures et capturer état/ledger/variables/version applicative ;
2. conserver PITR/snapshot, dump logique chiffré, backup Storage, hashes,
   inventaire ACL/admins/MFA et état Stripe ;
3. restaurer DB et Storage dans une cible isolée ;
4. vérifier checksums, sentinelles, Auth, ACL/RLS et liens DB ↔ Storage ;
5. déployer le binaire correspondant à l'état DB restauré ;
6. exécuter smoke tests HTTP, DB non mutatif, Auth login/session/logout et
   tenant isolation ;
7. rouvrir les écritures seulement après GO explicite.

Les down migrations improvisées sont interdites. La récupération MFA normale
reste le second admin total, la récupération email puis l'unenroll contrôlé.
Le rollback Stripe utilise uniquement les lookup keys Test connues ; Live est
hors périmètre. Le rollback Storage restaure bucket/path exact et impose un
checksum identique.

## 12. Nettoyage et sûreté Production

- base `elsatia_preprod_rollback_probe` : supprimée ;
- fixtures MFA : supprimées ;
- objets Storage synthétiques : supprimés ;
- Checkout Sessions Test : expirées ;
- scripts temporaires contenant la logique de fixtures : supprimés ;
- fichier temporaire Vercel Preview : absent ;
- pile Fresh dédiée : arrêtée ; certains services auxiliaires ont nécessité
  l'arrêt Docker et portent un exit 137/143, sans perte de preuve persistante ;
- Restore : PostgreSQL arrêté proprement avec exit 0 ; relay arrêté ;
- volume DR chiffré : monté et intact ;
- rôle Production `elsatia_backup` : acquis historique NOLOGIN, password
  supprimé, droits révoqués, 0 session ; non réactivé dans ce lot ;
- Production, Preview, Vercel, Stripe Live, DNS et données clients : non
  modifiés ;
- push : non effectué.

## 13. Verdicts

| Domaine | Verdict |
|---|---|
| Fresh 253 + pgTAP | GO |
| Restore 253 + pgTAP | GO |
| Drift applicatif / exploitable | 0 / 0 |
| Drift système managé | 532 allowlistés |
| MFA/AAL2 E2E et fail-closed | GO |
| Admin/rôles, multitenant, multi-app | GO |
| Storage E2E et rollback | GO |
| Stripe Checkout/Webhook/attestation Test | GO |
| QA racine et Tools | GO |
| Rollback DB 210 → 253 → 210 | GO |
| Prérequis techniques préproduction | FERMÉS |

Blockers techniques restants dans ce périmètre : **0**. Ce verdict ne constitue
pas une autorisation de migration, déploiement ou commercialisation Production.

`ELSATIA-PREPROD-DB-E2E-ROLLBACK-V1 VALIDÉ — BDD E2E ET ROLLBACK PRÊTS — PRÉREQUIS TECHNIQUES PRODUCTION FERMÉS`
