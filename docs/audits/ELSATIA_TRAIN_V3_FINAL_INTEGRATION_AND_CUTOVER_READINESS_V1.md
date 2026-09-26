# ELSATIA — Train V3 : audit final d'intégration et de préparation au cutover (V1)

**Date** : 2026-09-09 · **Nature** : audit de préparation. Aucune fusion, aucun déploiement,
aucun accès Stripe Live n'a été effectué.

---

## 1. État git figé

| Élément | Valeur |
|---|---|
| Branche | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` |
| SHA du contenu testé | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` (2026-09-09 10:01:46) |
| SHA distant au moment de l'audit | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` — identique |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/train-v3-commercial`, **propre** (0 ligne) |
| `main` | `4d92ddbedccf8b2948f8b224739b622298b174c0` (2026-07-29) |
| **merge-base** | `4d92ddb` — c'est `main` lui-même |
| Commits propres au train | **369 en avance, 0 en retard** |
| Ledger | **278 migrations**, dernier numéro `20260909000280` |

Conséquence : le Train V3 est un **descendant strict** de `main`. La fusion serait un
fast-forward ; aucun conflit n'est structurellement possible. `main` a six semaines de retard.

Aucun commit inattendu n'est apparu après le SHA candidat.

---

## 2. Ledger — audit structurel

- **278 fichiers** `.sql`, aucun fichier non-SQL dans le répertoire
- Ordre lexicographique **stable et déterministe** (`ls` ≡ `sort`)
- **Aucun doublon** de nom complet ; **aucune collision** de préfixe horodaté
- **Aucune migration `.proposed`** infiltrée dans le ledger
- Les numéros 275→280 occupent les **rangs 273→278** — l'écart de 2 est l'héritage
  documenté des doublons historiques (n° ≠ rang), et non une anomalie du train
- `verify:migrations` : *« 278 migrations valides, noms et horodatages uniques »*

| Rang | Migration | Objets | Dépendances | Verdict |
|---|---|---|---|---|
| 273 | `…275_gp_subscriptions_modules_discounts_v1` | `modules_gestion_pro_tarifs`, `remises_commerciales`, vue `mes_remises_visibles`, `historique_remises_commerciales`, RLS *forcée*, `revoke all` | `entreprises` | ✅ |
| 274 | `…276_platform_client_directory_index_v1` | `unaccent`+`pg_trgm`, `elsatia_normaliser_recherche`, `elsatia_chiffres_seuls`, 11 index, `plateforme_annuaire_entreprises`, `plateforme_annuaire_compteurs`, colonnes `archivee_at`/`client_pilote`/`pays` | `entreprises`, `abonnements`, `factures` | ✅ |
| 275 | `…277_platform_support_access_communications_v1` (1 825 l.) | `assistance_motifs`, `assistance_perimetres`, `assistance_domaines_sensibles`, `assistance_actions_interdites`, `assistance_sessions`, `assistance_sessions_applications` | `applications_elsatia` | ✅ |
| 276 | `…278_contract_price_freeze_multiproduct_v1` | `generations_tarifaires`, `contrats_abonnement`, `historique_contrats_abonnement` + 4 triggers | 275 | ✅ |
| 277 | `…279_reserves_photos_immuables_v1` | 2 policies `storage.objects` (jamais supprimables, jamais réécrites) | schéma `storage` | ✅ |
| 278 | `…280_platform_audit_log_bounded_v1` | `revoke` sur `plateforme_journaliser`, `plateforme_annuaire_journaliser_export`, `assistance_revoquer` | 276, 277 | ✅ |

---

## 3. Validation des migrations — Fresh et trois upgrades

Rejoués par l'audit sur **quatre conteneurs Postgres jetables dédiés** (`audit-fresh`,
`audit-210`, `audit-263`, `audit-274`), image `supabase/postgres:17.6.1.143`, arbre figé
à `52d3282`.

| Chemin | Avant | Appliquées | Final | Code sortie |
|---|---|---|---|---|
| **Fresh install** | 0 | 278 | 278 | **0** |
| **Upgrade depuis 210** | 202 | **76** | 278 | **0** |
| **Upgrade depuis 263** | 261 | **17** | 278 | **0** |
| **Upgrade depuis 274** | 272 | **6** | 278 | **0** |

**Équivalence prouvée sur les objets, pas seulement sur la terminaison.** Les quatre
chemins produisent des invariants strictement identiques :

```
tables_public=220  fonctions=545  contrats=1  generations=1  modules_tarifs=1
remises=1  assistance=1  annuaire_fn=1  journ_export=1  pol_photos=4  rls_forcee=11
```

---

## 4. pgTAP

**70 suites détectées · 70 exécutées · 70 réussies · 0 échec · 1 902 assertions**,
sur l'état Fresh figé.

**Contrôle de non-vacuité (test par mutation).** La protection de la migration 280 a été
retirée sur un conteneur jetable — `grant execute on plateforme_journaliser to authenticated` :

| État | Résultat de `platform_audit_log_bounded_v1` |
|---|---|
| Protection en place | 12 / 12 |
| **Protection retirée** | **10 / 12** — `not ok 1 – un administrateur plateforme ne peut pas appeler le journal directement` · `not ok 2 – aucun événement d'audit fabriqué n'a pu être écrit` |
| Protection restaurée | 12 / 12 |

Le test mord donc réellement sur le mécanisme qu'il prétend garder.

---

## 5. Tarification

### Conforme

| Élément | Attendu | Constaté |
|---|---|---|
| Mini / Pro / Business / Entreprise | 79 / 249 / 449 / 599 € | `7_900` / `24_900` / `44_900` / `59_900` centimes ✅ |
| Annuel | 10 mensualités pour tout récurrent | `MULTIPLICATEURS_ANNUELS` = 10 pour forfait, comptes, modules, stockage, IA ; `prestation: 1` ✅ |
| Comptes supplémentaires par rôle | 5 / 9 / 15 / 0 € | `500` / `900` / `1_500` / `0` ✅ |
| Pack de crédits IA | 29 €, ponctuel | `2_900`, `nature: "achat_ponctuel"`, `prixAnnuelCentimes: null` ✅ |
| IA intensive | 79 €/mois ou 790 €/an | `7_900` / `79_000` ✅ |

Deux arbitrages historiquement ouverts sont **fermés** par ce train : le conflit annuel
×10 / ×12 (tranché à ×10 pour tout élément récurrent) et les deux modèles de comptes
incompatibles (seul `par_type_de_compte` est vendable ; `capacite_personnes` reste
calculable pour honorer les contrats souscrits sous lui).

### Figement du prix contractuel — vérifié **empiriquement en base**

`contrats_abonnement` porte ses propres montants (`prix_forfait_ht_centimes`,
`prix_unitaires_ht`, totaux avant/après remise) et référence `generations_tarifaires`.
Quatre triggers sont actifs : `contrat_generation_vendable_trg`, `contrat_montants_figes_trg`,
`contrat_pas_de_suppression_trg`, `contrat_journaliser_trg`.

Essais réels menés par l'audit sur conteneur jetable :

```
-- contrat NEUF sur une génération retirée :
ERROR: La génération COMPTES-PAR-FORFAIT-2026-07 est retirée de la vente : elle ne peut
       pas fonder un contrat nouveau. Reprise d'un contrat existant : utiliser
       provenance « reprise » ou « migration ».

-- remise « à vie » assortie d'une date de fin :
ERROR: violates check constraint "contrats_abonnement_check2"
```

Un Price historique est donc **refusé pour un contrat neuf et reconnu pour une reprise** —
exactement la séparation demandée. `historique_contrats_abonnement` est append-only par
trigger. Quatre générations sont semées, dont deux retirées **avec motif obligatoire**
(`check (vendable or motif_retrait is not null)`).

### RÉSERVE COMMERCIALE — modules à la carte

Les cinq modules vendables portent exactement la grille attendue, mais **tous les cinq
sont marqués `statutPrix: "provisoire"`**, statut que le catalogue définit lui-même comme
« proposition de travail destinée à l'arbitrage de Julien » :

| Module | Prix | Statut |
|---|---|---|
| `pointage` | mini 25 € | provisoire |
| `notes_frais` | mini 12 € | provisoire |
| `materiel_vehicules` | mini 19 € · pro 15 € | provisoire |
| `stock` | mini 29 € · pro 24 € | provisoire |
| `rentabilite_avancee` | pro 29 € | provisoire |

`statutPrix` n'est **jamais une garde** : il n'alimente qu'un `Badge` d'affichage. La vente
est commandée par le booléen distinct `vendableALaCarte`. Rien n'empêche donc techniquement
un encaissement à un prix que le dépôt qualifie lui-même de non arbitré.

Point de sécurité **satisfait** en revanche : les 6 modules `a_definir` (sans aucun prix)
sont tous `vendableALaCarte: false` — le catalogue est fail-closed sur un module sans prix.

Répartition complète : 8 `valide`, 12 `provisoire`, 6 `a_definir`.

---

## 6. Annuaire et plateforme

- **Aucune fonction `STABLE` ou `IMMUTABLE` n'écrit** — requête exhaustive sur `pg_proc`
  croisant volatilité et présence d'`insert`/`update`/`delete` : ensemble vide
- `plateforme_annuaire_entreprises` et `plateforme_annuaire_compteurs` sont `STABLE`
  `SECURITY DEFINER` ; le journaliseur d'export est `VOLATILE` — séparation correcte
- `elsatia_normaliser_recherche` et `elsatia_chiffres_seuls` sont `IMMUTABLE`
- Performances (reprises du dépôt, commit `9b1c21e`, **non remesurées par cet audit**) :
  page 1 à 27 ms, recherche à 125 ms sur 5 000 entreprises ; index trigramme, SIRET et date
  confirmés choisis par le planificateur

---

## 7. Assistance et communications

- **Mode strict par défaut** : variable absente → `strict: true, raison: "defaut_absent"` ;
  valeur invalide → `strict: true, raison: "valeur_invalide"` ; désactivation **refusée sur
  chaque signal de Production**
- `plateforme_journaliser` : ACL réduite à `postgres=X/postgres` — **l'exécution directe est
  révoquée**, y compris pour un administrateur plateforme
- `plateforme_annuaire_journaliser_export` appelle `plateforme_exiger_session_aal2()` :
  **export soumis à AAL2**
- `assistance_quitter` et `assistance_revoquer` en sont **délibérément exemptées, motif
  écrit dans la migration** : fermer une session doit rester possible après expiration.
  Toutes deux journalisent en interne via `plateforme_journaliser`
- **10 triggers append-only / immuables** : `assistance_evenements`, `assistance_notifications`,
  `assistance_sessions` (×2), `communications_journal`, `historique_contrats_abonnement`,
  `historique_remises_commerciales`, `journal_audit_notes_frais`, `journal_audit_paie`,
  `plateforme_operations_remise_historique`

---

## 8. Boutique

- `boutiqueEstActive()` n'accepte que la chaîne exacte `"true"` : toute autre valeur,
  `undefined` compris, **ferme** — fail-closed confirmé
- Le webhook Boutique porte **exactement une** garde d'activation (la duplication a été
  retirée par `d823692` sans supprimer la protection), renvoyant 404
- Contrôle de mode Test/Live fail-closed : 5 tests, **5 réussis** en isolement
- Réserve mineure (P2) : `Sidebar` déclare `boutiqueActive = true` en valeur par défaut de
  propriété. Un seul appelant existe et il passe la valeur calculée — aucun chemin
  fail-open en pratique, mais le défaut de la propriété est à l'envers de la politique

---

## 9. Webhook Stripe

- `src/app/api/stripe/abonnement/webhook/route.ts` : **seul `POST` exporté** (conformité
  Next.js 16) ; idempotence par réservation atomique
  `reserver_evenement_abonnement_service(p_stripe_event_id)` avec état `duplicate` renvoyant
  `{received: true, duplicate: true}`
- `src/app/api/stripe/boutique/webhook/route.ts` : **seul `POST` exporté**
- Cinq routes Stripe au total ; **aucun endpoint n'a été désactivé, modifié ou supprimé**
  par cet audit

---

## 10. Réserves — authenticité des preuves E2E

Preuves produites le 2026-09-09 à 18:44–18:46 sur machine libre (load1 ≈ 3,4) :

| Passe | Résultat |
|---|---|
| Scénario 2 isolé | **réussi**, 2,9 s |
| **Chromium bureau** | **14/14 en une seule exécution**, 25,2 s — 14 détectés, 14 exécutés, 0 ignoré |
| WebKit / iPhone 13 | **2/2**, 3,9 s |
| Chromium / Pixel 7 | **2/2**, 1,9 s |

Contrôles d'authenticité : `playwright.config.ts` est **inchangé depuis `cb9df18`**
(`retries: 0`, `timeout: 45_000`, `actionTimeout: 15_000`) ; `git diff HEAD` sur la config
et `tests/` est **vide** ; aucun timeout global n'a été ajouté. Les profils mobiles sont
filtrés par `grep: /@responsive/` et couvrent **exactement 2 scénarios chacun** — jamais 14.

Les scénarios couvrent l'isolation A/B, les files locales séparées, la synchronisation
idempotente sans doublon, la non-écrasement d'un état serveur plus récent, la photo hors
ligne sans doublon, la reprise après interruption, le cache et la file conservés après
rechargement, et l'invisibilité des données de l'organisation précédente après déconnexion.

---

## 11. Validation applicative

| Contrôle | Résultat | Durée |
|---|---|---|
| `npm test` (racine + Tools + Réserves + Colors) | voir réserve ci-dessous | 90 s |
| `npm run typecheck` (4 projets) | **rc=0** | 284 s |
| `npm run lint` (4 projets) | **rc=0** | 103 s |
| `npm run verify:migrations` | **rc=0** — *278 migrations valides, noms et horodatages uniques* | 0 s |
| `npm run verify:secrets` | **rc=0** — *1 712 fichiers suivis contrôlés, aucun secret reconnu (1 exception nommée)* | 2 s |
| `git diff --check` | **rc=0** | 0 s |
| Build racine + Tools | **rc=0**, 36 pages statiques | 408 s |
| Build Réserves | **rc=0**, 19 pages statiques | 94 s |
| Build Colors | **rc=0**, 26 pages statiques (voir ci-dessous) | 255 s |
| Build webpack (chemin qui détectait le webhook) | **rc=0**, 38 pages statiques, 1 avertissement de compilation | 482 s |

Totaux : **146 fichiers de test** · **1 725 tests** au niveau racine · **119 pages statiques**
construites sur les quatre builds · **0 erreur** · **1 avertissement** (build webpack).
Le build racine, Réserves et Colors ne produisent **aucun** avertissement.

### RÉSERVE — trois tests fragiles sous charge (P2)

La suite complète a rapporté **3 échecs sur 1 725** (2 fichiers sur 146) lors d'une
exécution concurrente d'un typecheck. Diagnostic mené :

| Test | Cause | Verdict |
|---|---|---|
| `src/lib/xlsx.test.ts` — classeur réel | `Test timed out in 5000ms` (3,87 s en isolement, plafond 5 s) | **marge insuffisante**, pas un défaut |
| `route.test.ts` — événement Live en contexte Test | `Test timed out in 5000ms` | **marge insuffisante** |
| `route.test.ts` — événement Test en contexte Live | `expected vi.fn() to not be called, been called 1 times` (`boutique_finaliser_commande_payee`) | **cascade** du précédent : le test expiré en plein vol après `vi.stubEnv` a laissé retomber son appel asynchrone dans le suivant |

Rejeux isolés sur machine calme : `route.test.ts` **5/5**, `xlsx.test.ts` **2/2**, et le test
litigieux **passe seul**. Aucun défaut applicatif n'est démontré. Le risque réel est de
lecture : sur poste chargé, la suite rapporte un échec P0 apparent sur le croisement
Stripe Test/Live qui n'en est pas un. **Aucun timeout global n'a été augmenté.**

### Colors — la garde de build a fonctionné

Le premier `npm run build:colors` a échoué en **1 seconde**, rc=1. Ce n'est pas un défaut :
le hook `prebuild` exécute `verify:public-env`, qui **interrompt le build** quand les cinq
variables publiques manquent, *« pour qu'un build publié ne livre pas silencieusement un
Colors sans authentification, sans photos et sans réinitialisation »*. Avec
`ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COLORS_URL` et
`NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` déclarées, le build passe en 255 s.
**Conséquence pour le cutover : ces cinq variables sont bloquantes.**

### Non exécuté

`verify:stripe-prices` **n'a pas été exécuté** par cet audit : il interroge l'API Stripe et
exige des clés. Le contrôle des 27 Price Test est repris des preuves antérieures, **non
reproduit ici**. Aucun appel Stripe, Test comme Live, n'a été émis.

---

## 12. Matrice des branches

| Branche | SHA | État |
|---|---|---|
| `integration/…train-v2-reserves-gp-v1` | `1fc1331` | **Intégrée** — ancêtre direct du Train V3 |
| `feat/platform-client-directory-billing-workspace-v1` | `339195d` | **Intégrée par reprise** — 0 fichier absent du train |
| `feat/platform-cross-app-support-access-communications-v1` | `9fcf128` | **Intégrée par reprise** — 0 fichier absent |
| `feat/gp-subscriptions-modules-discounts-canonical-v1` | `9c83557` | **Intégrée par reprise** — 0 fichier absent |
| `integration/colors-code-on-ecosystem-ledger-v1` | `0a937d3` | **Intégrée**, sauf `apps/reserves/src/lib/offline/resilience.ts` — module de l'ère V4 dont l'en-tête déclare que Réserves n'est pas hors-ligne, **remplacé** par la pile V5/V6 et référencé nulle part. Absence correcte |
| `feat/stripe-test-canonical-prices-p0-v1` | `df58d81` | **HORS TRAIN — 303 fichiers absents** (travaux `apps/tools` : Atelier, moteurs géométriques, tracés). Branche **gelée** : ne pas modifier, ne pas fusionner, ne pas déployer |
| `docs/preserve-orphan-elsatia-reports-v1` | `1801e61` | **Documentaire à conserver séparément** — 23 rapports orphelins, poussée sur origin |
| `docs/preserve-doe-technical-library-audit-v1` | `c1c4119` | **Documentaire à conserver séparément** |
| `audit/elsatia-contact-card-architecture-v1` | `0e644d5` | **Documentaire** — architecture close, zéro code produit |
| `audit/elsatia-boutique-commerce-architecture-v1` | `65999e2` | **Documentaire** — à ne pas confondre avec une implémentation applicative |
| `feat/market-architecture-legal-business-v1` | `e0d45c9` | **Documentaire** — aucun développement Market avant le socle multiproduit |
| `audit/elsatia-drone-scan-architecture-master-v1` | `513968e` | **Documentaire** — 13 documents, 0 code |
| Branches du site vitrine | — | **Autre dépôt** (`elsatia-site`) — hors périmètre de ce train |

Aucune de ces branches n'a été fusionnée pendant l'audit.

---

## 13. Runbook de cutover — à exécuter, non exécuté

### Point de non-retour

**Le point de non-retour est l'application de la migration `20260908000277`**
(assistance et communications, 1 825 lignes). En amont, les migrations 275 et 276
n'ajoutent que des tables, index et fonctions nouvelles : un rollback applicatif seul reste
possible, le socle existant n'étant pas altéré. À partir de 277, et surtout de **280** qui
**révoque `plateforme_journaliser`**, le schéma retire des droits dont le code antérieur
dépend : un rollback du seul frontend laisserait l'ancienne application appeler une
fonction qu'elle n'a plus le droit d'exécuter. **Après 280, seule une restauration de
sauvegarde ramène un état cohérent.**

### Étapes

1. **Gel des écritures** — fermer les sessions d'assistance ouvertes, suspendre les tâches
   planifiées et les webhooks entrants (mise en file, pas rejet). Responsable : Julien.
2. **Sauvegarde** — dump complet horodaté, **restauration vérifiée sur une base jetable**
   avant d'aller plus loin. Une sauvegarde non testée ne compte pas.
3. **Contrôle des variables** — les cinq variables publiques Colors sont **bloquantes**
   (le build s'arrête sans elles) : `ELSATIA_APPLICATION_ENV`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COLORS_URL`,
   `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`. Vérifier aussi `ELSATIA_ASSISTANCE_STRICTE`
   (toute valeur autre que le mot attendu ⇒ mode strict, ce qui est le comportement voulu)
   et `FEATURE_BOUTIQUE_ENABLED` (laisser **absente** : la Boutique doit rester fermée).
4. **Contrôle des secrets** — `npm run verify:secrets` sur l'arbre déployé.
5. **Migrations** — appliquer les 6 migrations 275→280 dans l'ordre du ledger, une par une,
   `ON_ERROR_STOP=1`, en consignant le code de sortie de chacune.
6. **Vérifications post-migration** — rejouer les 70 suites pgTAP sur la base migrée ;
   contrôler les invariants : `tables_public=220`, `fonctions=545`, 4 générations tarifaires
   dont 2 retirées avec motif, 4 triggers sur `contrats_abonnement`, 2 policies
   `reserves_photos_*`, ACL de `plateforme_journaliser` réduite à `postgres`.
7. **Déploiement applicatif** — racine + Tools, Réserves, Colors.
8. **Smoke tests** — connexion ; ouverture d'un chantier ; annuaire page 1 et recherche ;
   ouverture puis fermeture d'une session d'assistance ; **un webhook Stripe Test rejoué
   deux fois doit produire un seul traitement**.
9. **Surveillance** — 5xx, latence de l'annuaire, journal d'assistance, file de webhooks,
   pendant 24 h.
10. **Décision GO/NO-GO** — prise par Julien, sur preuves écrites des étapes 5, 6 et 8.
11. **Rollback avant le point de non-retour** — tant que 277 n'est pas appliquée :
    redéployer l'applicatif antérieur, les migrations 275 et 276 étant additives et inertes.
12. **Restauration après le point de non-retour** — restaurer la sauvegarde de l'étape 2.
    Un rollback frontend seul est **incompatible** avec un schéma portant 280.
13. **Responsabilités humaines** — Julien décide et exécute ; aucune étape n'est déléguée à
    un agent ; les étapes 1, 2, 10 et 12 exigent une présence humaine.
14. **Preuve et journal** — consigner pour chaque étape l'horodatage, la commande, le code
    de sortie et l'opérateur.

---

## 14. Réserves ouvertes

| # | Réserve | Niveau | Nature |
|---|---|---|---|
| R1 | Cinq modules vendables portent un prix `provisoire`, sans garde technique empêchant l'encaissement | — | **Commerciale** — arbitrage de Julien puis passage à `valide` |
| R2 | Trois tests à marge insuffisante face au plafond de 5 s : sous charge, faux échec P0 apparent | P2 | Technique, non bloquante |
| R3 | `Sidebar` : défaut de propriété `boutiqueActive = true` à l'envers de la politique fail-closed | P2 | Technique, non bloquante |
| R4 | `verify:stripe-prices` et les 27 Price Test non reproduits par cet audit | — | **Stripe Test** — à rejouer avant cutover |
| R5 | Les cinq variables publiques Colors sont bloquantes au build | — | **Action humaine** de configuration |
| R6 | Mesures de performance de l'annuaire reprises du dépôt, non remesurées ici | — | Documentaire |

---

## 15. Verdict

**GO CUTOVER SOUS CONDITIONS.**

Aucun blocage technique n'est démontré. Le socle est solide et vérifié : quatre chemins de
migration convergents avec équivalence prouvée sur les objets, 70/70 pgTAP dont la
non-vacuité est démontrée par mutation, typecheck et lint verts sur quatre projets, quatre
builds réussis, aucun secret, `git diff --check` propre, et des gardes commerciales qui
mordent réellement en base.

Les conditions restantes ne sont pas techniques :

- **Commercial** — arbitrer les cinq prix de modules `provisoire` (R1)
- **Stripe Test** — rejouer `verify:stripe-prices` et les 27 Price (R4)
- **Humain** — déclarer les variables bloquantes, tester la restauration de sauvegarde,
  fixer la fenêtre et le responsable (R5)
- **Stripe Live** — aucune action n'a été exécutée et aucune n'est planifiée par ce lot

