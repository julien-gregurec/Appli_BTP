# ELSATIA STUDIO — FINALISATION MASTER LEDGER

Dernière mise à jour : 2026-09-20 (nuit, démarrage). Document vivant, mis à jour à chaque lot intégré. Statuts autorisés : PASS / FAIL / BLOCKED / NOT RUN.

## BASELINE

- HEAD Studio initial : `214d47fd4d8474aa292b5cea121f80cae9c7dff7` (`origin/feat/elsatia-studio-v1`), base `6a814a2b`.
- Rien de Production/Preview touché. Aucun push. Aucun `git add .` global.

## CURRENT TRAIN

- Branche : `integration/studio-commercial-ready-v1` (worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/studio-commercial-ready-v1`).
- TRAIN HEAD : voir `git log -1` — mis à jour à chaque intégration (tableau « INTEGRATED »).

## MIGRATION LEDGER

| Migration | Lot | Statut |
|---|---|---|
| `20260912120000_studio_workspace_foundation` | A | qualifiée historiquement |
| `20260912140000_studio_media_upload` | B | idem |
| `20260912160000_studio_project_management` | C | idem |
| `20260912230000_studio_timeline` | D | idem |
| `20260913010000_studio_render_engine` | E | idem |
| `20260913020000_studio_templates` | F | idem |
| `20260913030000_studio_editor_transactions` | G | idem |
| `20260913040000_studio_media_analysis` | H | idem |
| (nouvelles migrations de la nuit) | — | voir « NEW LOTS » |

Règles : additif, append-only, aucune migration qualifiée réécrite. Nouvelles migrations nommées `20260920HHMMSS_studio_*` (jamais un n° GP). **M-1** : le ledger GP CORE nomme `20260920000308`+ ; les migrations Studio antérieures (`2026091x`) se trieraient avant des migrations GP déjà appliquées → `db push` exigerait `--include-all`. Aucune dépendance croisée (Studio ne référence que `auth.users`/`storage`). Décision de convergence : Q-010.

## LOTS A-H STATUS

Tous classés **WORKING, QUALIFIED locally** par leurs rapports (non rejoués intégralement cette nuit ; voir TESTS). Défauts trouvés à l'audit du 2026-09-20 : voir « DEFECTS » ci-dessous.

## DEFECTS (audit 2026-09-20, sévérité recalculée)

| ID | Sév. | Résumé | Lot cible |
|---|---|---|---|
| D-01 | P1 | Admission de rendu illimitée (aucune limite jobs/projet/workspace), snapshot jsonb par job | S1 |
| D-02 | P1 | `STUDIO_ENABLED` documenté (kill-switch) mais inexistant | S1 |
| D-03 | P1 | Quota média : tombstones/expirés comptés (`purged_at is null`), purge seulement en local → « Quota atteint » définitif | S1 |
| D-04 | P1 | Éditeur : Suppr avec sélection périmée → exception dans le reducer, crash + perte de l'historique | S2 |
| D-05 | P1 | Autosave : `dispose()` sans flush, aucun flush `pagehide`, état `error` perdu à la navigation | S2 |
| D-06 | P1 | Conflit d'autosave sans issue autre que recharger (perd le travail) | S2 |
| D-07 | P1 | Rendu : timeout 600 s pour des timelines jusqu'à 10 min (ratio mesuré ~2× durée) → `RENDER_TIMEOUT` irrattrapable | S4 |
| D-08 | P1 | Rendu : texte hors Noto/emoji accepté par l'éditeur puis rendu en échec `RENDER_FAILED` | S4 |
| D-09 | P1 | Photos avec `exif_orientation` : non traité côté worker (à vérifier par fixture) | S4 |
| D-10 | P1 | `RenderPanel` : URL signée 60 s dans `<video>` sans renouvellement | S4 |
| D-11 | P1 | Pas de reset de mot de passe | S3 |
| D-12 | P1 | Membres : ajout par UUID sans moyen de connaître son UUID ; liste affichée « Compte ELSATIA » | S3 |
| D-13 | P1 | Aucun `loading.tsx` ; textes de roadmap périmés dans l'UI ; 404 générique erroné ; `?error=` reflété | S3 |
| D-14 | P1 | Pas de miniatures (aperçu = clic sur URL signée de l'original) | S5 |
| D-15 | P1 | Suppression d'un média utilisé sans avertissement (échec au rendu) | S3 |
| D-16 | P1 | Aucun observabilité web (Sentry) | S3 |
| D-17 | P1 | Clé service complète partagée (web + 2 workers) | WAITING_JULIEN Q-004 |
| D-18 | P2 | Overlays supprimés silencieusement après trim (`retimePresentation`) | S2 |
| D-19 | P2 | Un caractère = un pas d'undo (40 pas épuisés en une phrase) | S2 |
| D-20 | P2 | Autosave sans reprise automatique ni message 400/403 distinct | S2 |
| D-21 | P2 | Rendu : heartbeat manquant tue le job (code `CANCELLED`), profil non affiché, codes bruts en UI | S4 |
| D-22 | P2 | Politique Auth (12 caractères, confirmations, captcha) seulement côté server action | WAITING Preview/Prod |
| D-23 | P2 | Sandbox de décodage (`-format_whitelist` ffmpeg, uid séparé) | K |
| D-24 | P2 | FK `on delete restrict` sur `auth.users` : pas de suppression de compte | K / Q-008 |
| D-25 | P3 | Lock avant contrôle de rôle, `lease_token`/`storage_key` lisibles, flags TS-only | K |

## FUNCTIONAL MATRIX & COMMERCIAL READINESS

Méthode : 28 capacités critiques ; QUALIFIED = 1, WORKING-UNQUALIFIED/PARTIAL = 0,5, ABSENT/BLOCKED = 0. Pourcentage = somme / 28. Recalculé à chaque lot intégré.

| # | Capacité | Score initial | Note |
|---|---|---:|---|
| R01 | Auth signup/login/logout | 1 | |
| R02 | Reset mot de passe | 0 | S3 |
| R03 | Confirmation e-mail | 0,5 | non prouvée en distant |
| R04 | Workspaces | 1 | |
| R05 | Membres/invitations utilisables | 0,5 | S3 |
| R06 | Projets (CRUD, archive, duplication) | 1 | |
| R07 | Upload TUS + limites | 1 | |
| R08 | Cycle de vie du quota / purge | 0,5 | S1 |
| R09 | Miniatures | 0 | S5 |
| R10 | Timeline automatique | 1 | |
| R11 | Éditeur (cœur) | 0,5 | P1 D-04..06 |
| R12 | Templates | 1 | |
| R13 | Rendu réel | 1 | |
| R14 | Profils 720/1080 prouvés (E2E hors preview) | 0 | J |
| R15 | Admission/anti-abus rendu | 0 | S1 |
| R16 | Musique importée | 0 | M |
| R17 | Brand Kit | 0 | I |
| R18 | Preview/téléchargement | 1 | |
| R19 | Partage révocable | 0 | J2 |
| R20 | Watermark / plans | 0 | J2 + Q-001/Q-003 |
| R21 | Métering d'usage | 0 | J |
| R22 | Isolation tenant/RLS | 1 | |
| R23 | Légal / consentement | 0 | Q-002 |
| R24 | RGPD suppression/export | 0 | K / Q-008 |
| R25 | Observabilité web | 0 | S3 |
| R26 | E2E Strasbourg exact (10+3, 1080) | 0,5 | L |
| R27 | E2E Croatie exact (20+5, 1080) | 0,5 | L |
| R28 | Mobile/WebKit qualifié | 0,5 | Q-005 |

**Score initial : 12,5 / 28 = 44,6 %.**

## QUEUE

| Statut | Lots |
|---|---|
| ACTIVE | S1 — admission, kill-switch, quota |
| READY | S2 éditeur P1 · S3 auth/UX · S4 rendu P1 · S5 miniatures · J profils/usage · I Brand Kit · J2 partage/watermark · M musique · K hardening (sandbox, grants, RGPD technique) · L E2E exacts + happy path · checklists Preview/Production |
| WAITING_EXTERNAL | Clé service dédiée / projet Supabase (Q-004) ; Auth distant (D-22) ; HEVC réels sur iPhone |
| WAITING_JULIEN | Q-001…Q-010 (sous-périmètres seulement) |
| QUALIFIED | A–H (historique) |
| INTEGRATED | (aucun lot de la nuit pour l'instant) |
| DEFERRED_POST_V1 | rotation/opacité/scale, calques, snap/zoom timeline, copier-coller, multi-sélection, split, restauration workspace archivé, transfert de propriété, multilingue, intégrations GP/Tools/Colors/Réserves |

## NEW LOTS

(à compléter à chaque lot : branche, SHA, migrations, tests, preuves)

## TESTS

| Gate (baseline `214d47fd`, cette nuit) | Statut |
|---|---|
| `npm run typecheck` (apps/studio) | NOT RUN (en cours) |
| `npm run lint` | NOT RUN |
| `npm test` (Vitest app) | NOT RUN |
| worker `typecheck` / `test` | NOT RUN (installation en cours) |
| pgTAP (53 fichiers) | NOT RUN |
| Fresh / Upgrade | NOT RUN |
| E2E | NOT RUN |
| Historique (rapports A–H) : 251 + 22 tests, 1 254 assertions pgTAP, E2E 62/62 + 4/4 | non rejoué |

## SECURITY / E2E / PERFORMANCE / PREVIEW / PRODUCTION READINESS

- Sécurité : voir DEFECTS ; aucun P0 ; isolation RLS/IDOR/CSRF/injections vérifiée en lecture.
- E2E : historique verts en profil preview 540×960 ; 1080p non couvert.
- Performance : ratio de rendu mesuré ~2× (320×240 sources synthétiques) ; benchmark 100/500 médias analyse OK (rapport H) ; aucune mesure 1080p sur vraies sources.
- Preview readiness : NON — clé service partagée, Auth distant, pages légales, purge prod, worker hors Vercel.
- Production readiness : NON. Aucune action Production cette nuit.

## QUESTIONS POUR JULIEN — DEMAIN MATIN

Format : ID · SUJET · CONTEXTE · A · B · RECOMMANDATION · CONSÉQUENCE · BLOQUE · NE BLOQUE PAS.

**Q-001 · Modèle de facturation Studio.** Contexte : aucun moteur commercial, aucun plan, Stripe exclu de la roadmap. A) Bêta pilote gratuite plafonnée, sans paiement. B) Abonnement ELSATIA commun (après snapshot de prix Train V3). Reco : A pour le pilote, B ensuite. Conséquence : détermine plans/watermark/quotas. Bloque : R20 (plans), tarification. Ne bloque pas : éditeur, rendu, sécurité, Brand Kit, exports, tests.

**Q-002 · Textes légaux et rétention.** Contexte : aucune page CGU/confidentialité/mentions, aucun consentement à l'inscription. A) Je pose les routes + case de consentement avec des textes-squelette marqués « à valider » (non publiables). B) Rien tant que le texte n'est pas fourni. Reco : A, sans mise en ligne. Rétention par défaut proposée : 30 jours après suppression pour les originaux tombstone, 30 jours pour les logs. Bloque : mise en service publique. Ne bloque pas : tout le développement. Rappel : « marque déposée », jamais ® (mémoire INPI).

**Q-003 · Politique de watermark.** A) Aucun watermark pour les pilotes ; drapeau serveur par workspace prêt, défaut OFF. B) Watermark obligatoire hors plan payant. Reco : A. Bloque : la valeur par défaut commerciale. Ne bloque pas : le mécanisme (implémenté, désactivé).

**Q-004 · Clé service et projet Supabase.** Studio partage le projet Supabase ELSATIA (donc les données Gestion Pro) et détient une clé service complète (web + workers FFmpeg). A) Projet Supabase dédié à Studio. B) Rôle Postgres/JWT scopé limité aux RPC service-only et aux 2 buckets. Reco : A (isolation maximale, coût mensuel à valider). Bloque : Preview/Production Studio. Ne bloque pas : développement local.

**Q-005 · Périmètre mobile.** A) Web responsive : import + aperçu, éditeur desktop-first. B) Éditeur complet mobile. Reco : A ; qualifier WebKit avant ouverture. Bloque : qualification WebKit/iOS (R28). Ne bloque pas : desktop.

**Q-006 · HEIC/HEVC (iPhone).** A) Refuser avec un message explicite (« format le plus compatible »). B) Transcoder côté worker. Reco : A pour V1. Bloque : couverture formats iPhone. Ne bloque pas : JPG/PNG/WEBP/MP4/MOV H.264.

**Q-007 · Ouverture.** Inscription publique ou sur invitation ? Reco : invitation jusqu'à fermeture des P1 (D-11, D-12, D-17) et de R23/R24. Bloque : go-live. Ne bloque pas : dev.

**Q-008 · Suppression de compte / RGPD.** A) Flux de suppression qui purge objets, tombstones et workspaces mono-propriétaire ; transfert requis pour les multi-membres. B) Archivage seul. Reco : A. Bloque : R24. Ne bloque pas : le reste.

**Q-009 · Musique.** Le périmètre V1 déclaré inclut « musique importée ». Je l'implémente (import utilisateur, mixage, fondus), sans bibliothèque de musique licenciée. Question de licence : autorisez-vous l'import de musique par l'utilisateur sans contrôle de droits (responsabilité CGU) ? Reco : oui, clause CGU. Bloque : formulation commerciale. Ne bloque pas : le développement.

**Q-010 · Convergence des migrations (M-1).** A) Renommer les migrations Studio avec un timestamp postérieur au dernier GP au moment du train commun (avant tout déploiement). B) Conserver et utiliser `--include-all`. Reco : A. Bloque : le train commun GP+Studio. Ne bloque pas : Studio isolé.
