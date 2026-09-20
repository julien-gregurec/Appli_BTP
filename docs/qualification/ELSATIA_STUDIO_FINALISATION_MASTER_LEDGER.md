# ELSATIA STUDIO — FINALISATION MASTER LEDGER

Dernière mise à jour : 2026-09-20 (fin de nuit). Document vivant. Statuts autorisés : PASS / FAIL / BLOCKED / NOT RUN. Aucune action Production, Preview, DNS, Stripe ou Supabase distant n'a eu lieu.

## BASELINE

- HEAD Studio initial : `214d47fd4d8474aa292b5cea121f80cae9c7dff7` (`origin/feat/elsatia-studio-v1`), base `6a814a2b`, 260 migrations (252 GP + 8 Studio).
- Aucun push. Aucun `git add .` global. Branche distante non modifiée.

## CURRENT TRAIN

- Branche `integration/studio-commercial-ready-v1`, worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/studio-commercial-ready-v1`.
- **TRAIN HEAD** : voir `git log -1` du worktree (le dernier commit du train porte ce ledger). Lots intégrés dans l'ordre : S1, S2, S3, S4+J1, I, J2, S5 (branches `feat/studio-*`, fusions `--no-ff`).

## MIGRATION LEDGER

| Migration | Lot | Statut |
|---|---|---|
| `20260912120000_studio_workspace_foundation` → `20260913040000_studio_media_analysis` (8) | A–H | qualifiées historiquement, rejouées cette nuit (Fresh + chaîne A→H) |
| `20260920010000_studio_render_admission` | S1 | Fresh PASS, upgrade H PASS, pgTAP 21 |
| `20260920030000_studio_export_profiles` | J1 | Fresh PASS, upgrade H PASS, pgTAP 33 |
| `20260920050000_studio_brand_kit` | I | Fresh PASS, upgrade H PASS, pgTAP 44 |
| `20260920070000_studio_shares_watermark` | J2 | Fresh PASS, upgrade H PASS, pgTAP 37 |

Total attendu : **264**. Règles respectées : additif, append-only, aucune migration qualifiée réécrite, aucun n° GP. Un SQL de retour arrière par migration post-H (`apps/studio/scripts/rollback-post-h/`) refuse de détruire des données utilisateur (kit, liens, registre d'usage, jobs 720p).

**M-1 (ouvert)** : le ledger GP CORE nomme ses migrations `20260920000308`…`20260921000311` ; les migrations Studio `2026091x` se trieraient avant des migrations GP déjà appliquées → `db push` exigerait `--include-all`. Aucune dépendance croisée (Studio ne référence que `auth.users` et `storage`). Décision : Q-010.

## LOTS A-H STATUS

Tous **WORKING**, requalifiés localement cette nuit sur la pile jetable : Fresh 264 + pgTAP des 12 fichiers, chaîne historique A→H (`analysis-migration-check` : 257 → 258 → 259 → 260) PASS.

## LOTS DE LA NUIT (détail : `ELSATIA_STUDIO_NIGHT_LOTS_REPORT.md`)

| Lot | Contenu | Statut |
|---|---|---|
| S1 | admission de rendu bornée, kill-switch `STUDIO_ENABLED`, quota, purge distante sur opt-in | **QUALIFIED locally** (pgTAP 21, Vitest 16) |
| S2 | éditeur : crash Suppr, flush à la sortie, backoff, conflit, undo | **QUALIFIED locally** (Vitest 24 + E2E) |
| S3 | reset mot de passe (e-mail réel Mailpit → lien → nouveau mot de passe → ancien refusé), notices fermées, UX, journalisation sans PII | **QUALIFIED locally** (E2E PASS) |
| S4 | timeout proportionnel, texte dessinable, heartbeat tolérant, sonde de sortie | **QUALIFIED locally** (Vitest, test de rendu réel) |
| J1 | profil 720p, registre d'usage, panneau de rendu | **QUALIFIED locally** (pgTAP 33 ; rendu 1080 pleine taille : acceptation PASS ; rendu 720 : NOT RUN, dimensions par pgTAP seulement) |
| I | Brand Kit | **QUALIFIED locally** (pgTAP 44 + E2E PASS) |
| J2 | liens de partage révocables, filigrane serveur | **QUALIFIED locally** (pgTAP 37, frame décodée, E2E PASS) ; politique de filigrane = Q-003 |
| S5 | miniatures d'images, confirmation avant retrait d'un média utilisé | WORKING, non qualifié individuellement (couvert par la régression E2E) |
| M (musique) | **non démarré** | READY — voir « SPEC M » |

## DEFECTS (audit 2026-09-20)

| ID | Sév. | Résumé | Statut |
|---|---|---|---|
| D-01 | P1 | admission de rendu illimitée | **FIXED** S1 |
| D-02 | P1 | `STUDIO_ENABLED` inexistant | **FIXED** S1 |
| D-03 | P1 | quota : réservations abandonnées comptées ; purge locale seulement | **PARTIAL** : réservations expirées libérées ; purge distante possible sur opt-in, **planification en Production à faire** |
| D-04 | P1 | crash Suppr sur sélection périmée | **FIXED** S2 (E2E) |
| D-05 | P1 | dernières éditions perdues à la navigation | **FIXED** S2 (E2E) |
| D-06 | P1 | conflit sans issue | **FIXED** S2 |
| D-07 | P1 | `RENDER_TIMEOUT` irrattrapable > ~5 min | **FIXED** S4 |
| D-08 | P1 | texte non dessinable → rendu en échec | **FIXED** S4 |
| D-09 | P1 | EXIF non traité | **NOT A DEFECT** (FFmpeg 6.0 redresse, vérifié) |
| D-10 | P1 | URL signée 60 s sans renouvellement | **FIXED** S4/J1 |
| D-11 | P1 | pas de reset de mot de passe | **FIXED** S3 |
| D-12 | P1 | membres : UUID introuvable | **PARTIAL** : identifiant affiché, rôles FR ; invitation par e-mail absente |
| D-13 | P1 | pas de `loading`, textes périmés, `?error=` reflété | **FIXED** (loading limité à dashboard/paramètres, voir « Piège hydratation ») |
| D-14 | P1 | pas de miniatures | **FIXED (pilote)** S5 : à la demande, pas de dérivée stockée |
| D-15 | P1 | média utilisé supprimable sans avertissement | **FIXED** S5 |
| D-16 | P1 | aucune observabilité web | **PARTIAL** : journal `onRequestError` sans PII ; pas de Sentry ni d'alerte |
| D-17 | P1 | clé service complète partagée | **OPEN** — WAITING_JULIEN Q-004 |
| D-18 | P2 | overlays perdus après trim | **PARTIAL** : annoncé et annulable |
| D-19 | P2 | un caractère = un pas d'undo | **FIXED** S2 |
| D-20 | P2 | autosave sans reprise | **FIXED** S2 |
| D-21 | P2 | heartbeat, profil, codes bruts | **FIXED** S4/J1 |
| D-22 | P2 | politique Auth (12, confirmations, captcha) | **OPEN** — à régler sur le projet cible |
| D-23 | P2 | sandbox de décodage | **OPEN** (checklist Preview §1.6) |
| D-24 | P2 | FK `on delete restrict`, pas de suppression de compte | **OPEN** — Q-008 |
| D-25 | P3 | verrou avant contrôle de rôle, colonnes lisibles | **OPEN** |
| D-26 | P1 | (nouveau) Storage : environnement local — un `ffprobe` de sortie à 10 s échoue sous charge | **FIXED** (60 s pour notre propre fichier) |
| D-27 | P2 | (nouveau) e-mail de récupération limité à 2/heure en local → tests | **FIXED** dans la config jetable |
| D-28 | P1 | (nouveau, trouvé par E2E) les e-mails de récupération des gabarits Auth partagés pointent vers `/auth/confirm?type=recovery`, non géré : reset impossible | **FIXED** (`/auth/confirm` gère email/signup/recovery) |
| D-29 | P2 | (nouveau) action déclenchée avant l'hydratation React perdue sous charge | **MITIGATED** : E2E attendent l'hydratation ; à surveiller côté utilisateur (formulaires natifs OK, champs contrôlés à vérifier) |

## FUNCTIONAL MATRIX & COMMERCIAL READINESS

Méthode : 28 capacités critiques ; QUALIFIED = 1, WORKING-UNQUALIFIED/PARTIAL = 0,5, ABSENT/BLOCKED = 0. Pourcentage = somme / 28.

| # | Capacité | Initial | Final | Note |
|---|---|---:|---:|---|
| R01 | Auth signup/login/logout | 1 | 1 | |
| R02 | Reset mot de passe | 0 | 1 | E2E réel PASS |
| R03 | Confirmation e-mail | 0,5 | 0,5 | non prouvée en distant |
| R04 | Workspaces | 1 | 1 | |
| R05 | Membres/invitations utilisables | 0,5 | 0,5 | pas d'invitation par e-mail |
| R06 | Projets | 1 | 1 | |
| R07 | Upload TUS + limites | 1 | 1 | |
| R08 | Cycle de vie du quota / purge | 0,5 | 0,5 | purge Production non planifiée |
| R09 | Miniatures | 0 | 0,5 | pilote, non qualifié seul |
| R10 | Timeline automatique | 1 | 1 | |
| R11 | Éditeur (cœur) | 0,5 | 1 | D-04/05/06 corrigés + E2E |
| R12 | Templates | 1 | 1 | |
| R13 | Rendu réel | 1 | 1 | |
| R14 | Profils 720/1080 prouvés | 0 | 0,5 | 1080 prouvé pleine taille (acceptation) ; 720p : dimensions SQL seulement, rendu 720 non joué |
| R15 | Admission/anti-abus rendu | 0 | 1 | |
| R16 | Musique importée | 0 | 0 | non démarré |
| R17 | Brand Kit | 0 | 1 | |
| R18 | Preview/téléchargement | 1 | 1 | |
| R19 | Partage révocable | 0 | 1 | |
| R20 | Watermark / plans | 0 | 0,5 | mécanisme qualifié, politique non décidée |
| R21 | Métering d'usage | 0 | 1 | registre + résumé ; aucune facturation |
| R22 | Isolation tenant/RLS | 1 | 1 | |
| R23 | Légal / consentement | 0 | 0 | Q-002 |
| R24 | RGPD suppression/export | 0 | 0 | Q-008 |
| R25 | Observabilité web | 0 | 0,5 | journal sans PII, pas d'alerte |
| R26 | E2E Strasbourg exact (10+3, 1080) | 0,5 | 0,5 | format/durée/images prouvés ; **musique et logo absents** de la recette |
| R27 | E2E Croatie exact (20+5, 1080) | 0,5 | 0,5 | format/durée/images prouvés ; **dates EXIF et chapitres par journée non couverts** |
| R28 | Mobile/WebKit qualifié | 0,5 | 0,5 | Chromium seul ; Q-005 |

**Score initial : 12,5 / 28 = 44,6 %. Score final : 20 / 28 = 71,4 %.**

## QUEUE

| Statut | Lots |
|---|---|
| ACTIVE | (aucun : fin de nuit) |
| READY | M musique · K RGPD technique (suppression de compte, export) · sandbox de décodage · WebKit/mobile E2E · acceptation pleine taille si non jouée · invitation par e-mail |
| WAITING_EXTERNAL | Auth/Supabase distants (D-22), iPhone réel, HEIC/HEVC réels, restauration DB+objets |
| WAITING_JULIEN | Q-001 … Q-010 (sous-périmètres seulement) |
| QUALIFIED | A–H, S1, S2, S4, J1, I, J2 |
| INTEGRATED | S1, S2, S3, S4, J1, I, J2, S5 dans le train local |
| DEFERRED_POST_V1 | rotation/opacité/scale, calques, snap/zoom timeline, copier-coller, multi-sélection, split, couleurs et réseaux de marque, transfert de propriété, restauration d'un espace archivé, multilingue, intégrations GP/Tools/Colors/Réserves |

### SPEC M — musique importée (non implémentée)
1. Storage : autoriser `audio/mpeg`, `audio/mp4`, `audio/wav` dans le bucket `studio-originals` et dans `studio_reserve_media` (nouveau type `audio`, plafond de taille) ; inspection ffprobe côté web (durée, codec) ; jamais publié.
2. Modèle : `presentation.music = {asset_id, volume, fade_in_ms, fade_out_ms}` validé en domaine et dans `studio_validate_presentation` (fonction à remplacer) ; asset audio « ready » du projet.
3. Éditeur : sélecteur de piste, volume, fondus ; prévisualisation approximative.
4. Worker : entrée audio supplémentaire, boucle/coupe à la durée, `afade`, mixage avec l'audio des clips (`amix`, normalisation contrôlée) sur l'encodage final ; test de rendu réel (RMS non nul avec piste, nul sans).
5. Droits : import par l'utilisateur sous sa responsabilité (clause CGU, Q-009).
Coût estimé : lot de taille L (migration + domaine + éditeur + worker + E2E).

## TESTS

| Gate (train `8ac770d2` + correctifs de fin de nuit) | Statut |
|---|---|
| `tsc --noEmit` app / worker | PASS |
| ESLint (fichiers modifiés) | PASS |
| Vitest app | **PASS 297/297** (18 fichiers ; était 251) |
| Vitest worker | 22 PASS ; 4 tests d'analyse **BLOCKED** (module OpenCV `cv2` absent ; aucun téléchargement fait) |
| pgTAP Fresh (12 fichiers) | **PASS — 520 assertions, 0 échec** (analysis 45, brand 44, editor 22, export 33, media 40, project 105, admission 21, render 45, shares 37, templates 18, timeline 52, foundation 58) |
| Chaîne historique A→H (`analysis-migration-check`) | PASS (257 → 258 → 259 → 260, remise en état vérifiée) |
| Upgrade post-H / rollback inverse / reapply (`post-h-migration-check`) | **PASS** (4 migrations sur base H peuplée : 260 → 264 → 260 → 264, données identiques) |
| pgTAP après upgrade | **PASS — 520 assertions, 12 fichiers** |
| Build production (webpack) | PASS |
| E2E complets (36 cas, aperçus 540×960, Chrome installé, worker + Redis réels) | **36/36 PASS en un seul passage (12,0 min) sur le build final** ; le premier passage (avant correctifs) avait donné 34/36 : attente « rendering » périmée dans un test, et flux de récupération = vrai défaut de route `/auth/confirm` (D-28) |
| E2E ciblés de la nuit | Brand Kit PASS, partage PASS, S2 PASS, rendu réel Chantier PASS, invalid-links PASS, onboarding/isolation PASS |
| Acceptation pleine taille (hors gate, sans drapeau aperçu) | **PASS ×2** : Strasbourg 10 photos + 3 vidéos, Chantier Pro, 9:16, 60 s ; Croatie 20 + 5, Voyage, 9:16, 90 s → MP4 H.264/AAC 1080×1920 30 fps, 1 800 / 2 700 images ±1, durée ±0,1 s, images décodées non noires. **Limites** : sources synthétiques minuscules, sans musique ni logo, sans dates EXIF |
| npm audit | NOT RUN |

Piège hydratation : un `change` ou `submit` déclenché avant l'hydratation React est perdu (constaté sous charge) ; tous les E2E attendent désormais que le champ de fichier / le formulaire porte ses handlers. Le squelette `loading.tsx` a été limité à dashboard et paramètres (un Suspense racine retarde l'hydratation).

## SECURITY

Aucun P0. RLS SELECT-only sur toutes les tables, écritures par RPC `search_path=''`, IDOR/CSRF/redirect ouvert/injection FFmpeg vérifiés en lecture par l'audit et couverts par pgTAP. Ajouts de la nuit : plafonds d'admission, liens de partage (hash seul, table fermée, résolution service-only, page publique `noindex`/`no-referrer`), filigrane non falsifiable, notices à liste fermée, journal sans PII. **Ouverts** : clé service partagée (Q-004), politique Auth distante, sandbox de décodage, suppression de compte.

## PERFORMANCE

Première moitié de la nuit : mesures invalides (machine saturée, charge 20–25, par d'autres voies GP et des conteneurs tiers ; un `ffprobe` de sortie a dépassé 10 s, corrigé). Une fois la machine calmée : rendu 1080×1920 de 60 s ≈ **17 s** (journal worker `renderMs` 16 826, RSS Node 96 Mio, RSS enfant 77 Mio) et scénario Strasbourg complet (13 imports + génération + rendu + ffprobe) en 53 s ; Croatie (25 imports, 90 s) en 2,0 min. **Sources synthétiques minuscules** : aucun débit garanti pour de vraies photos/vidéos de téléphone, non mesuré.

## PREVIEW / PRODUCTION READINESS

**Preview : NON** (checklists : `ELSATIA_STUDIO_PREVIEW_PRODUCTION_CHECKLISTS.md`). **Production : NON.** Bloquants : Q-004, Q-002/Q-008, Q-001, Auth distant, purge planifiée, worker hors Vercel, iPhone réel, restauration.

## QUESTIONS POUR JULIEN — DEMAIN MATIN

Format : ID · SUJET · CONTEXTE · A · B · RECOMMANDATION · CONSÉQUENCE · BLOQUE · NE BLOQUE PAS.

**Q-001 · Modèle de facturation Studio.** Aucun moteur commercial, aucun plan. A) Bêta pilote gratuite plafonnée (les plafonds d'admission existent). B) Abonnement ELSATIA commun (après snapshot de prix Train V3). Reco : A puis B. Bloque : plans, watermark par plan, tarification. Ne bloque pas : tout le reste.

**Q-002 · Textes légaux et rétention.** Aucune page CGU/confidentialité/mentions, aucun consentement à l'inscription. A) Je pose routes + case de consentement avec squelettes « à valider » non publiables. B) Rien avant le texte. Reco : A sans mise en ligne ; rétention proposée 30 jours (originaux supprimés) et 30 jours (journaux). « Marque déposée », jamais ®. Bloque : mise en service publique. Ne bloque pas : le développement.

**Q-003 · Politique de watermark.** Le mécanisme existe (colonne par espace, défaut faux, non falsifiable). A) Aucun watermark pour les pilotes. B) Obligatoire hors plan payant. Reco : A. Bloque : la valeur commerciale par défaut.

**Q-004 · Clé service et projet Supabase.** Studio partage le projet Supabase ELSATIA (donc Gestion Pro) avec une clé service complète côté web et workers. A) Projet Supabase dédié. B) Rôle/JWT scopé (RPC service-only + 2 buckets). Reco : A. Bloque : Preview/Production. Ne bloque pas : le local.

**Q-005 · Périmètre mobile.** A) Web responsive : import et aperçu, éditeur desktop-first. B) Éditeur complet mobile. Reco : A ; qualifier WebKit puis iPhone réel avant ouverture.

**Q-006 · HEIC/HEVC.** A) Refuser avec un message clair. B) Transcoder côté worker. Reco : A pour la V1.

**Q-007 · Ouverture.** Inscription publique ou sur invitation ? Reco : invitation tant que D-17, D-22, R23, R24 sont ouverts.

**Q-008 · Suppression de compte / RGPD.** A) Flux qui purge objets, tombstones et espaces mono-propriétaire (transfert requis pour les espaces à plusieurs). B) Archivage seul. Reco : A. Bloque : R24.

**Q-009 · Musique.** Le périmètre V1 déclaré inclut « musique importée » ; **non implémentée cette nuit** (voir SPEC M). Autorisez-vous l'import par l'utilisateur sans contrôle de droits (responsabilité CGU) ? Reco : oui. Bloque : la formulation commerciale et le scénario Strasbourg complet.

**Q-010 · Convergence des migrations (M-1).** A) Renommer les migrations Studio avec un timestamp postérieur au dernier GP au moment du train commun. B) Conserver et utiliser `--include-all`. Reco : A. Bloque : le train commun GP+Studio.

**Q-011 · Miniatures.** Conception pilote : générées à la demande depuis l'original (aucune dérivée stockée). A) Suffisant pour le pilote. B) Dérivée stockée générée à la confirmation (nouveau bucket + migration). Reco : A puis B avant l'ouverture publique. Bloque : rien ; coût CPU/E-S à surveiller.
