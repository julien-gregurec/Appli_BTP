# AI-PROD-ACTIVATION-V1 — Activation contrôlée de l'Assistant IA en Production

**Statut final : `FEATURE_AI_ENABLED=true` en Production, activation confirmée saine.**

## 0. Découverte critique préalable : mauvais projet ciblé

Avant tout travail sur ce lot, ce workspace (`elsatia-main`) était lié au projet Vercel **`elsatia-preview`**, pas au vrai Production. Le vrai Production est un projet **distinct** :

| | Preview (déjà utilisé toute la session) | **Production réelle** |
|---|---|---|
| Vercel | `elsatia-preview` | `elsatia-production` |
| Domaine | `elsatia-preview*.vercel.app` | **`app.elsatia.fr`** |
| Supabase | `pgvvpqyjziyapbbkydmc` | **`exhvuzegsefmoguxoiak`** |

Tous les `vercel deploy --prod` de cette session (et vraisemblablement de sessions précédentes, d'après l'historique de la mémoire de travail) déployaient en réalité sur le propre environnement « Production » du projet `elsatia-preview` — jamais sur `app.elsatia.fr`. Confirmé et corrigé avec Julien avant toute action d'écriture : le workspace a été relié explicitement à `elsatia-production` (`.vercel/project.json`, ancien lien sauvegardé dans `.vercel/project.json.preview-backup`). **Ce point doit être vérifié systématiquement au début de tout futur lot touchant à Production.**

## 1. Blocage réel trouvé et résolu : clé OpenAI absente

`elsatia-production` n'avait **aucune** variable `OPENAI_API_KEY`, sous aucun nom, vérifié trois façons (code source, liste complète des 37 variables Production, intégrations Vercel — aucune trouvée). Julien a créé un nouveau projet OpenAI dédié « ELSATIA Production » et une clé associée, ajoutée dans Vercel (scope Production uniquement). Revérifiée après coup : existence + scope confirmés, valeur jamais lue.

## 2. Git

- Base : `feat/pieces-jointes-v1` (HEAD `0f83b63`), confirmée contenir toute la lignée validée (P15-PREP, AI-LAUNCH-V1/V1B/V1C, ABONNEMENTS-DETAIL-V1/V1B/V1C, COMPTES-SUPPLEMENTAIRES-V1/V1C, REMISES-CLIENTS-V1, PIECES-JOINTES-V1) via `git merge-base --is-ancestor` sur chaque branche.
- `release/commercialisation-v1` : **OLD HEAD `8fc8b75`** → fusion **fast-forward** (aucun commit divergent côté release, zéro conflit) → **NEW HEAD `0f83b63`**.
- Diff `8fc8b75..0f83b63` : 61 fichiers, aucun secret, aucun debug/TODO, aucune référence Stripe Live (vérifié par grep ciblé).
- Poussé sur `origin/release/commercialisation-v1`.

## 3. Migrations Production — dérive réelle découverte et corrigée

Comparaison précise (`comm`) entre les 205 fichiers du dépôt et les 194 versions enregistrées dans `supabase_migrations.schema_migrations` de Production : **11 migrations manquantes, zéro migration inconnue** (contrairement à Preview, le ledger de Production est propre).

En poussant les 11 migrations (`db push --linked`), la première (`20260819000216`, TERRAIN-MOBILE-V1B) a échoué : la policy `documents_chantier_ajout_terrain` existait déjà. Investigation : **tout l'effet de cette migration (4 policies, 1 permission, 4 assignations de poste) était déjà appliqué en Production, hors suivi de version** — même schéma de dérive que celui déjà documenté sur Preview cette session (`est_plateforme_admin()`), maintenant confirmé aussi sur Production. Vérifié précisément (policies + données), puis marquée `applied` via `migration repair` sans réexécution. Les 10 migrations suivantes sont passées, avec quelques `NOTICE ... already exists, skipping` bénins (guards `IF NOT EXISTS` déjà en place pour `alertes_delegation_v1` et `remises_clients_v1` — mêmes causes, sans besoin de repair puisque le fichier entier s'est terminé sans erreur).

Vérification post-migration : `db push --dry-run` → « Remote database is up to date », ledger à 205, et présence confirmée de toutes les fonctions/triggers/policies critiques (`peut_lire_document_employe_sensible`, `retirer_piece_jointe_devis`, `documents_chantier.compte_rendu_id`, `verrou_facture_emise`, `proteger_colonnes_remise`, `plateforme_appliquer_remise`, `publier_message_avec_pieces`).

## 4. QA avant déploiement

406/406 Vitest (129 ciblés IA/abonnements/remises/pièces-jointes inclus), typecheck propre, lint 0 erreur, build propre, `verify:secrets` (873 fichiers, 0 secret), `verify:migrations` (205, cohérent), `npm audit` 0 vulnérabilité. **pgTAP local non ré-exécuté à ce point** : la stack Docker locale a échoué 3 fois de suite (conteneurs `analytics`/`vector` unhealthy, problème d'infrastructure locale sans rapport avec le schéma) — les mêmes migrations avaient déjà été validées via 22 tests pgTAP réels lors de PIECES-JOINTES-V1 dans cette même session ; je m'appuie sur cette vérification antérieure plutôt que de fabriquer un nouveau résultat.

## 5. Déploiement code, IA encore désactivée

Déployé sur `app.elsatia.fr` avec `FEATURE_AI_ENABLED` encore à sa valeur d'origine (`false`). Smoke test : `/`, `/dashboard` (redirect propre), `/login`, `/abonnement` (redirect propre) — aucun 500. Logs Vercel : uniquement des entrées `info`, aucune erreur.

## 6. Rollback préparé

`release_before_ai_activation = 8fc8b75`. Rollback flag : retirer `FEATURE_AI_ENABLED` (ou remettre `false`) + redéployer — aucun rollback DB nécessaire (aucun changement de schéma spécifique à l'activation elle-même, seulement à l'intégration déjà QA'ée).

## 7. Activation

`FEATURE_AI_ENABLED=true` (Production uniquement), redéployé. Health check immédiat : `/`, `/dashboard`, `/login` tous sains, aucun 500, logs Vercel propres.

## 8. Recette réelle sur `app.elsatia.fr`

Fixture `RECETTE-AI-PROD-V1` créée via le vrai flux de signup (admin Gérant + un second compte Terrain réel avec poste Ouvrier), données 100% fictives : client, chantier `RECETTE-AI-PROD-V1`, devis, deux employés, une affectation planning.

| Test | Résultat |
|---|---|
| Devis à relancer | ✅ Réponse correcte (aucun devis >7j, cohérent avec la fixture) |
| Factures en retard | ✅ Réponse correcte (aucune facture, cohérent) |
| Résumé chantier | ⚠️ Voir §9 — outil ne trouve pas le chantier alors qu'il existe (pas d'hallucination, juste un échec de recherche) |
| Planning lecture | ✅ Réponse exacte (4h, tâche, chantier — correspond à la fixture) |
| Proposition de créneaux | ✅ Exactement 3 propositions, aucune écriture avant confirmation |
| Création planning | ✅ Carte de confirmation réelle avec alerte de conflit intelligente ; **zéro écriture avant confirmation** (vérifié en base) ; après clic « Valider et créer », **exactement 1** ligne créée, données exactes |
| Modification | ⚠️ Voir §9 — l'outil ne retrouve pas l'affectation qu'il vient pourtant de créer |
| Annulation | ✅ Clic « Ignorer » → **zéro écriture** (vérifié en base, compte inchangé) |
| Terrain sans accès financier | ✅ Chantier invisible pour l'utilisateur Terrain (isolation au niveau des données, pas seulement un refus d'outil) ; question planning légitime répond correctement |
| Cross-tenant | Non retesté avec une 2e entreprise jetable sur Production (option prévue par le cahier des charges) — code inchangé depuis la validation réelle par HTTP live lors d'AI-LAUNCH-V1B/V1C |
| Prompt injection | ✅ Refus net, aucune fuite |
| Rate-limit | Non déclenché volontairement sur Production réelle (cahier des charges : ne pas générer de charge inutile) — couvert par la suite de tests automatisés qui passe |
| Coûts/tokens | ✅ 13 appels réels journalisés dans `journal_ia`, tous `succes`, jetons entrée/sortie/coût présents et cohérents, attribution correcte par utilisateur, **aucun contenu de conversation stocké** |
| Quota | ✅ Comptage mensuel cohérent (13/13) |
| Mobile 390px | ✅ Bouton assistant et zone de saisie entièrement visibles, aucun débordement horizontal (correctif AI-LAUNCH-V1C toujours actif) |
| Mobile 430px | ✅ Idem |
| Accessibilité | ✅ `aria-live="polite"` sur la liste de messages, champ et bouton Envoyer tous deux accessibles au clavier (`tabIndex=0`) |
| Logs Vercel après recette | ✅ 100 entrées consultées, uniquement `info`, aucune erreur |
| Erreur console navigateur | 1 erreur sans rapport (`sw.js` derrière une redirection — service worker/PWA, aucun lien avec l'IA) |
| Site/tarifs cohérence | ✅ `/abonnement` et `/tarifs` sont déjà 100% conditionnés par `iaEstActive()`, rien de statique à corriger |

## 9. Anomalies réelles trouvées (non bloquantes — l'assistant échoue de façon sûre)

Deux outils (résumé de chantier orienté rentabilité, modification d'un événement de planning) ne retrouvent pas des objets qui existent pourtant bien (le chantier est sélectionnable dans `/rentabilite`, l'affectation modifiée existe en base juste après sa création). Dans les deux cas, l'assistant **ne invente rien** : il répond honnêtement qu'il ne trouve pas l'objet plutôt que de halluciner une réponse ou d'écrire des données incorrectes — c'est le mode d'échec voulu. Cause probable : la recherche par nom de ces deux outils est plus étroite que celle utilisée par les outils de lecture (planning, devis, factures), qui eux ont fonctionné parfaitement. **Recommandation** : lot de suivi ciblé sur `src/lib/ai/copilote.ts` pour élargir/uniformiser la logique de recherche de ces deux outils spécifiques — aucune urgence sécurité, aucune corruption de données.

## 10. Nettoyage

Entreprise, 2 comptes auth, client, chantier, devis, 2 employés, 2 affectations, 13 lignes `journal_ia` — tout supprimé en cascade via la suppression de l'entreprise. Vérifié par requête directe sur chaque table : **zéro résidu**. Aucun trigger immuable contourné.

## 11. Décision finale

Tous les health checks sont verts, aucune anomalie de sécurité ou de disponibilité trouvée, les deux limitations d'outils identifiées échouent de façon sûre (pas d'hallucination, pas d'écriture incorrecte) et sont documentées comme travail de suivi plutôt que comme motif de rollback.

**`FEATURE_AI_ENABLED` reste à `true` en Production.**
