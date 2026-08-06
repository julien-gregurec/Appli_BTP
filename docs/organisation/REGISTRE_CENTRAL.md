# Registre central ELSATIA

Dernière consolidation : 6 août 2026 (correctif d'isolation des factures).

## Projet de référence

Le projet de référence est :

`/Users/juliengregurec/Documents/btp-platform`

Les travaux de commercialisation sont réalisés dans le worktree Git dédié :

`/Users/juliengregurec/Projects/liria-codex`

Le dépôt principal reste la source de référence. Le worktree ne constitue pas un second projet et ne doit pas être mélangé avec un autre worktree.

## État des lots de commercialisation

La numérotation ci-dessous est la numérotation actuelle et fait foi. Les anciens plans ou rapports historiques peuvent employer une autre numérotation ; ils ne doivent pas être réécrits.

| Lot | Périmètre | État | Référence |
| --- | --- | --- | --- |
| 1 | Audit et plan de renommage | Validé et intégré | Historique de `release/commercialisation-v1` |
| 2 | Configuration centralisée de marque | Validé et intégré | Historique de `release/commercialisation-v1` |
| 3 | Interface, PWA, métadonnées, documents et e-mails | Validé et intégré | Historique de `release/commercialisation-v1` |
| 4 | Assistant IA | Validé et intégré | `1c4d1b8a99f7dfb1502af7539f70d65463c4d252` |
| 5 | Migration 194 et données actives | Validé et intégré | `aea62ff02d7711df049714cd2d4b34bb8496a8b9` |
| 6 | Nettoyage final de l’ancienne identité | Terminé et validé localement sur `lot6/nettoyage-final-elsatia` | Aucun push ni déploiement |
| 7 | Garde-fou automatisé contre le retour de l’ancien nom | Non commencé | À autoriser séparément après validation du lot 6 |

## Règles d’identité

- Marque, éditeur et logo texte : **ELSATIA**.
- Logiciel, interface, PWA, PDF, e-mails et assistant IA : **ELSATIA Gestion Pro**.
- Fournisseur automatique de la boutique : **ELSATIA (boutique)**.
- Aucun domaine officiel ne doit être inventé ou codé en dur ; utiliser la configuration d’environnement.
- Les migrations historiques, audits historiques, rapports de relais et médias archivés restent inchangés.

## État des autres sujets

| Sujet | État au 5 août 2026 | Emplacement ou prochaine action |
| --- | --- | --- |
| Application ELSATIA Gestion Pro | Projet principal actif | Racine du dépôt |
| Recette fonctionnelle Preview (R1-R7C) | Prestations, Fournisseurs, Clients et Devis validés en conditions réelles sur `elsatia-preview` | Suite prévue : authentification, isolation multi-entreprises, Storage privé, Factures, Stripe test, Mobile/PWA — voir `docs/organisation/CHECKLIST_LANCEMENT.md` |
| Recette Auth (inscription, confirmation, connexion, déconnexion, mot de passe oublié) | Phases 0 à 4 validées sur `elsatia-preview` (commit `06f8b6e`) ; Phase 5 « mot de passe oublié » en pause (quota d'envoi d'e-mails Supabase atteint) | Reprise de la Phase 5 uniquement, profil vierge, une seule demande de lien, clic unique en navigation privée |
| Recette Isolation Multi-Entreprises — vérification préalable | **PHASE 0 VALIDÉE** (5 août 2026). Projet Vercel `elsatia-preview` confirmé (résolution CLI `julien-gregurec1/elsatia-preview`) ; `SUPABASE_SERVICE_ROLE_KEY` et `NEXT_PUBLIC_SUPABASE_URL` existent chacune une seule fois, scopées Preview uniquement, aucun doublon, aucune trace du projet parasite `liria-concept-gestion-btp` (lié par erreur au répertoire personnel, cause d'une fausse anomalie entre-temps résolue) ; projet Supabase `elsatia-preview`, réf. `pgvvpqyjziyapbbkydmc`, région `eu-west-3`/Paris (UE). Remplacement de la valeur de `SUPABASE_SERVICE_ROLE_KEY` à partir du projet Supabase `elsatia-preview` confirmé manuellement par l'utilisateur (valeur jamais affichée, copiée ni enregistrée) | Voir ligne « Provisionnement entreprise B » ci-dessous pour la suite |
| Recette Isolation Multi-Entreprises — provisionnement entreprise B | Compte B (`recette.isolation.b@elsatia-preview.invalid`) et entreprise B (`958398eb-0e0e-4123-be8e-d13d384d1fdb`, `RECETTE_ISOLATION_B — Entreprise Fictive`) créés via les parcours normaux de l'application. **Bug bloquant découvert puis corrigé le 6 août 2026** : `public.chantiers` n'avait plus aucune policy RLS PERMISSIVE couvrant INSERT/UPDATE/DELETE depuis la migration `20260715000081` — empêchait la création de tout chantier via l'UI, sur n'importe quelle entreprise, depuis le 15 juillet 2026. Corrigé par la migration `20260806000196_correctif_rls_ecriture_chantiers.sql`, validée (15 tests pgTAP, 232 Vitest, typecheck, lint, build), appliquée sur `elsatia-preview`, intégrée en fast-forward sur `release/commercialisation-v1` (commit `5161bf5`). Provisionnement complet : client `RECETTE_ISOLATION_B_CLIENT_1` (`CLI-0001`), chantier `RECETTE_ISOLATION_B_CHANTIER_1` (`CHA-2026-001`), salarié `RECETTE_ISOLATION_B_EMPLOYE_1`, fournisseur `RECETTE_ISOLATION_B_FOURNISSEUR_1` (`FRN-0001`), devis `RECETTE_ISOLATION_B_DEVIS_1` (`DEV-2026-001`, Accepté, HT 1 000,00 € / TVA 150,00 € / TTC 1 150,00 €), facture `RECETTE_ISOLATION_B_FACTURE_1` (transformée depuis le devis, Brouillon, mêmes montants), dépense `RECETTE_ISOLATION_B_DEPENSE_1` (HT 100,00 € / TVA 20,00 € / TTC 120,00 €) | Voir ligne « Recette d'isolation en lecture A↔B » ci-dessous |
| Recette Isolation Multi-Entreprises — recette en lecture A↔B | **VALIDÉE le 6 août 2026, sans anomalie.** Catégories testées dans les deux sens : listes (clients, chantiers, salariés, fournisseurs, devis, factures, dépenses), tableaux de bord et compteurs, sélecteurs de formulaire, routes directes par UUID, requêtes API/RLS simulées (rôle `authenticated`, JWT réel de chaque compte, transactions systématiquement annulées), fonctions RPC de lecture (`est_membre_actif`, `a_permission`, `peut_consulter_chantier`) appelées avec des paramètres croisés. Résultat A→B et B→A : toutes les recherches directes, filtres par `entreprise_id` et marqueurs `RECETTE_ISOLATION_B_` à `0` ligne ; comptages sans filtre strictement égaux aux totaux propres de chaque entreprise ; 7 routes directes vers des UUID de l'autre entreprise → `404` systématique dans les deux sens ; RPC croisées → toutes `false`. Point de vigilance documenté : les références courtes (`FRN-0001`, `DEV-2026-001`) existent en parallèle dans A et B par coïncidence de numérotation propre à chaque entreprise (confirmé en vérifiant l'identité réelle de chaque ressource, pas seulement la référence) — ce n'est pas une fuite. **Storage** : aucun objet B n'existe (aucune pièce jointe créée durant le provisionnement) — test fonctionnel reporté. Baselines A et B strictement inchangées avant/après toute la recette | Voir ligne « Recette d'écriture croisée — IDOR factures » ci-dessous |
| Recette Isolation Multi-Entreprises — recette d'écriture croisée (INSERT/UPDATE/DELETE, IDOR, Storage destructif, RPC offensif) | **Suspendue le 6 août 2026** après confirmation d'une fuite réelle sur `public.factures` (voir ligne suivante). Périmètre déjà couvert avant suspension : INSERT rollback sur 9 tables × 5 combinaisons de désaccord d'entreprise. Non commencés : UPDATE, DELETE, Server Actions, RPC offensif, Storage destructif | **À reprendre séparément**, après autorisation explicite distincte de celle du correctif `factures` |
| Recette d'écriture croisée — IDOR `factures` (découverte, correctif, validation) | **Fuite confirmée le 6 août 2026** : `public.factures` acceptait, via INSERT direct (hors flux applicatifs), une valeur de `client_id`, `devis_origine_id`, `facture_origine_id` ou `facture_parente_id` appartenant à une autre entreprise que la facture elle-même — seule `chantier_id` était déjà protégée par une clé étrangère composite (`factures_chantier_entreprise_fkey`). Root cause : les policies RLS de `factures` ne contrôlent que `factures.entreprise_id`, jamais la cohérence des relations sortantes ; ce n'est pas une régression, la faille existait avant le début de la recette. Exploitabilité circonscrite : uniquement via appel direct à l'API REST/SQL Supabase — non atteignable depuis l'UI ni les Server Actions (`src/app/actions/factures.ts` ne fait aucun `.insert()` brut sur `factures`), ni depuis les RPC `creer_facture_depuis_devis`/`modifier_facture_brouillon` (toutes deux `security invoker`, re-lisent la ressource source sous la RLS de l'appelant, donc une référence étrangère y provoque un « introuvable » applicatif, pas une fuite). Aucune donnée résiduelle : chaque test a été exécuté puis annulé (`rollback`), aucune ligne `RECETTE_IDOR_*` n'a persisté. **Correctif appliqué et validé** : migration `20260806000197_correctif_isolation_factures.sql` (ajout de clés étrangères composites `(colonne, entreprise_id) → (id, entreprise_id)` sur les 4 relations, plus les 2 index uniques manquants sur `devis` et `factures` ; migration additive, aucune policy RLS modifiée). Validation locale : 28 assertions pgTAP dédiées + 212 tests pgTAP au total, 232 tests Vitest, `typecheck`, `lint`, `build` — tous au vert. Contrôle de cohérence des données réelles sur `elsatia-preview` avant application : 0 incohérence sur les 4 relations. Migration appliquée sur `elsatia-preview` (`migration list` local=remote), état vivant vérifié (5 contraintes dont la nouvelle et la préexistante, 2 index uniques, 5 policies RLS inchangées). 10 tests directs sur `elsatia-preview` (transactions annulées, comptes réels A/B) : les 6 opérations auparavant permissives sont désormais bloquées (`23503`, violation de la nouvelle clé étrangère composite) dans les deux sens A→B et B→A ; les 4 opérations légitimes (mêmes colonnes que la RPC de transformation, y compris facture manuelle sans devis) restent possibles. Après rollback : baselines reconfirmées à l'identique (factures A = 25, factures B = 1, 0 ligne résiduelle). Compatibilité applicative : établie par analyse de code (RPC `security invoker`, valeurs dérivées de la ressource source de la même entreprise) et par les assertions de non-régression pgTAP reproduisant exactement les colonnes des RPC ; aucun appel RPC live supplémentaire n'a été effectué sur Preview faute de devis « accepté non transformé » ou de facture brouillon disponibles pour l'entreprise A sans créer de nouvelles données (hors périmètre autorisé). Intégré en fast-forward sur `release/commercialisation-v1`. Aucun push, aucun déploiement Production | **Risque secondaire distinct identifié, non corrigé** : `public.relances_impayes.facture_id` présente la même classe de faiblesse (clé étrangère simple vers `factures(id)`, sans lien composite avec son propre `entreprise_id`) — nécessite une autorisation séparée avant tout correctif. La recette d'écriture croisée générale reste par ailleurs suspendue (voir ligne ci-dessus) |
| Checklist de lancement commercial | Document de suivi unique créé le 5 août 2026 | `docs/organisation/CHECKLIST_LANCEMENT.md` — source de référence pour l'avancement pré-lancement, à consulter avant ce registre pour tout sujet de commercialisation |
| Sécurité multi-entreprises et RLS | Phase 1 terminée localement | Rapport enregistré par le commit `e9a996c` sur `release/commercialisation-v1` |
| Intégrations fournisseurs PunchOut / EDI | Architecture prête, développement non commencé | `docs/architecture/integrations-fournisseurs.md` |
| Outil de recherche de nom et de marque | Centralisé, autonome | `tools/naming-studio/` |
| Problème IA avec Anthropic | Idée/problème enregistré, diagnostic à faire | Créer une tâche avec l’erreur exacte et le scénario de reproduction |
| Documentation officielle | À structurer progressivement | Master Plan, documentation développeur/API/IA, manuels, installation et changelog |
| Vidéo officielle | En attente des variantes de production validées | Ne pas régénérer les anciens médias pendant le lot 6 |
| Vision et business | Marque « Elsatia » déposée à l'INPI le 01-08-2026 (n° 5284384) ; structure juridique toujours en backlog | Voir `docs/organisation/CHECKLIST_LANCEMENT.md` section 3 et 3bis |
| ELSATIA Colors | Backlog produit séparé | Fonctionnalités, développement et stratégie à cadrer avant implémentation |

## Règles simples pour la suite

1. Consulter ce registre avant de démarrer un nouveau lot.
2. Mettre à jour le tableau lorsqu’un lot est validé ou change d’état.
3. Utiliser des branches et worktrees Git dédiés sans mélanger leurs modifications.
4. Ne commencer le lot 7 qu’après une autorisation explicite.
5. Ne pousser, déployer ou appliquer une migration en production qu’après une autorisation distincte.
