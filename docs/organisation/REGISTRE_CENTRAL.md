# Registre central ELSATIA

Dernière consolidation : 6 août 2026.

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
| Recette Isolation Multi-Entreprises — provisionnement entreprise B | Compte B (`recette.isolation.b@elsatia-preview.invalid`) et entreprise B (`958398eb-0e0e-4123-be8e-d13d384d1fdb`, `RECETTE_ISOLATION_B — Entreprise Fictive`) créés via les parcours normaux de l'application. **Bug bloquant découvert puis corrigé le 6 août 2026** : `public.chantiers` n'avait plus aucune policy RLS PERMISSIVE couvrant INSERT/UPDATE/DELETE depuis la migration `20260715000081` — empêchait la création de tout chantier via l'UI, sur n'importe quelle entreprise, depuis le 15 juillet 2026. Corrigé par la migration `20260806000196_correctif_rls_ecriture_chantiers.sql`, validée (15 tests pgTAP, 232 Vitest, typecheck, lint, build), appliquée sur `elsatia-preview`, intégrée en fast-forward sur `release/commercialisation-v1` (commit `5161bf5`). **Provisionnement B désormais complet** : client `RECETTE_ISOLATION_B_CLIENT_1` (`CLI-0001`, id `a9f1c74d-19e6-4703-9fda-5fa7cb0c434a`) ; chantier `RECETTE_ISOLATION_B_CHANTIER_1` (`CHA-2026-001`, id `fdba11db-7e0d-4bd8-b83b-64b815838157`) ; salarié `RECETTE_ISOLATION_B_EMPLOYE_1` (poste Ouvrier, id `ef325094-443d-4d56-a768-6b7eb0b23e79`) ; fournisseur `RECETTE_ISOLATION_B_FOURNISSEUR_1` (`FRN-0001`, id `de96501f-d375-4d63-9838-c0921505acb2`) ; devis `RECETTE_ISOLATION_B_DEVIS_1` (`DEV-2026-001`, id `7f94c23a-7f25-4884-ae31-0e7f287c5230`, statut Accepté, HT 1 000,00 € / TVA 150,00 € / TTC 1 150,00 €, 2 lignes à 20 % et 10 % de TVA) ; facture `RECETTE_ISOLATION_B_FACTURE_1` (id `b9f8110d-5452-4617-984d-78c9799b69a5`, transformée depuis le devis, statut Brouillon, mêmes montants) ; dépense `RECETTE_ISOLATION_B_DEPENSE_1` (id `2387f44d-e06b-4e5f-a600-eb9bd297a862`, HT 100,00 € / TVA 20,00 € / TTC 120,00 €). Baseline entreprise A vérifiée strictement identique avant/après l'ensemble du provisionnement (24 clients, 20 chantiers, 12 salariés, mêmes répartitions de devis/factures par statut, derniers numéros `DEV-2026-035`/`FAC-2026-025` inchangés, 30 dépenses) — aucune donnée A altérée | **Tests complets d'isolation A↔B pas encore commencés.** C'est la prochaine étape à autoriser séparément |
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
