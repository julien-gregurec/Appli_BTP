# ELSATIA STUDIO FINALISATION — STARTUP REPORT

Date : 2026-09-20 (nuit, Julien indisponible jusqu'au matin). Mode autonome, aucune action Production/Preview/DNS/Stripe.
Audits initiaux : lecture seule, 4 revues de code indépendantes (éditeur/timeline, rendu/export, sécurité/RLS, produit/UX) recoupées avec les rapports de lots A→H. Rien n'a été exécuté avant ce rapport hormis l'inventaire Git et l'installation des dépendances ; les gates de base sont consignés dans le ledger maître.

## CURRENT HEAD / BASELINE

| Élément | Valeur |
|---|---|
| HEAD Studio réel | `214d47fd4d8474aa292b5cea121f80cae9c7dff7` (= HEAD connu, aucune dérive) |
| Emplacement | `origin/feat/elsatia-studio-v1` seulement — aucune branche locale, aucun worktree préexistant |
| Base de la branche | `6a814a2b` (lignée GP « 252 migrations ») ; 280 commits d'avance sur `origin/main` |
| Train de finalisation | `integration/studio-commercial-ready-v1` (créé cette nuit, worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/studio-commercial-ready-v1`) |
| Repo principal | `feat/stripe-test-canonical-prices-p0-v1` @ `df58d813`, gelé, non touché |

## WORKTREES / BRANCHES

Seule branche Studio : `feat/elsatia-studio-v1` (distante). ~75 worktrees GP/Tools/Colors/Réserves existent, tous hors périmètre Studio. Deux autres conversations nocturnes (voies A/B, GP) tournent en parallèle sur la même machine (charge CPU 5→12) ; note de coordination ajoutée dans `ELSATIA-STACKS/mission-nuit-2026-09-20/COORDINATION.md` (voie C).

## MIGRATION LEDGER

8 migrations Studio, timestamps `20260912120000` → `20260913040000` (foundation, media_upload, project_management, timeline, render_engine, templates, editor_transactions, media_analysis), 260 au total avec les 252 GP de la base. Elles ne dépendent que de `auth.users` et `storage` (aucun objet GP).

**Risque de convergence (M-1)** : le ledger GP actuel (CORE) nomme ses migrations `20260920000308`…`20260921000311`. Les migrations Studio `2026091[23]…` se trieraient donc AVANT des migrations GP déjà appliquées ailleurs : `supabase db push` refuse l'ordre inversé sans `--include-all`. Aucune collision de nom, aucune dépendance croisée. Traitement à décider au moment du train commun (voir ledger, Q-010). Les nouvelles migrations de cette nuit utilisent `20260920…` avec un suffixe horaire non-GP.

## LOTS A → H STATUS

| Lot | Statut | Preuve / réserve |
|---|---|---|
| A Foundation (auth, workspaces, RLS) | WORKING, QUALIFIED locally | pgTAP + E2E ; pas de reset mot de passe, invitation par UUID |
| B Media upload (TUS, quotas) | WORKING, QUALIFIED locally | pas de miniatures ; fuite de quota (tombstones comptés, purge locale uniquement) |
| C Projects | WORKING, QUALIFIED locally | duplication sans timeline ; suppression sans corbeille |
| D Timeline automatique | WORKING, QUALIFIED locally | déterministe, 60/90 s |
| E Render worker | WORKING, QUALIFIED locally | MP4 réel ; E2E toujours en profil 540×960 ; timeout inadapté au plafond 10 min |
| F Templates | WORKING, QUALIFIED locally | 6 templates, 4 ratios |
| G Editor | WORKING, QUALIFIED locally | 3 défauts P1 (voir ledger) |
| H Analyse IA locale | WORKING, QUALIFIED locally | désactivée par défaut ; fallback OK |
| I Brand Kit | ABSENT | seul hook : `logoAssetId` dans les options de template |
| J Exports | PARTIAL | download URL signée 60 s ; pas de profils 720/1080, partage, watermark, métering |
| K Hardening | PARTIAL | RLS/IDOR/CSRF/injections OK ; admission de rendus illimitée, purge prod absente |
| L E2E finaux | PARTIAL | scénarios Strasbourg/Croatie existants mais réduits (5+2 photos/vidéos vs 10+3 / 20+5) |

Aucun lot classé REGRESSION, DEAD CODE ou SUPERSEDED. Deux éditeurs coexistent (ancien `TimelineEditor` sans autosave, `VideoEditor` autosave) : dette à vérifier avant de conserver les deux.

## FUNCTIONAL MATRIX (résumé — détail dans le ledger)

Présent et réel : auth/signup/login/logout, workspaces (personnel + pro), membres (par UUID), projets (CRUD, archive, duplication, ordre, filtres), upload TUS reprenable, timeline déterministe, éditeur (déplacer/retirer/dupliquer/remplacer/trim/volume/transition/texte/animation/logo, undo-redo 40 pas, autosave avec concurrence optimiste), 6 templates, rendu FFmpeg réel H.264/AAC 30 fps, annulation/retry, analyse locale.
Absent : Brand Kit, musique (aucun code), partage révocable, watermark, profil 720p, quotas de rendu, plans/billing, pages légales, reset mot de passe, invitation par e-mail, RGPD (suppression/export), miniatures, `loading.tsx`, observabilité web.
Absent par conception V1 (post-V1, master plan) : rotation, opacité, scale libre, calques/pistes, snap, zoom timeline, copier-coller, multi-sélection, split, éditeur pro.

## SECURITY STATUS

Aucun P0, aucun chemin cross-tenant : 8/8 tables RLS SELECT-only, écritures par RPC `search_path=''`, IDOR/CSRF/open-redirect/injection FFmpeg vérifiés. P1 : clé service complète partagée avec Gestion Pro (web + workers) ; aucune limite d'admission de rendu ; purge Storage impossible hors localhost. P2 : politique Auth (mot de passe 12 côté action seulement), sandbox de décodage, blocage suppression de compte par FK.

## TEST STATUS

Historique (rapports, non rejoué cette nuit) : 251 tests app + 22 worker, 53 fichiers pgTAP / 1 254 assertions, E2E 62/62 (A–G, H OFF) + 4/4 (H ON). CI : E–H exclus des PR, workflow rendu en `workflow_dispatch`. Rejeu cette nuit : voir ledger (statuts PASS/FAIL/NOT RUN uniquement).

## RENDER / EXPORT STATUS

Rendu : RÉEL de bout en bout (snapshot immuable → outbox → BullMQ → FFmpeg → Storage privé). Export : un seul profil `standard` (1080p) + `preview` (moitié) ; E2E forcé en preview (`STUDIO_RENDER_INTERNAL_PREVIEW=1`) donc le 1080p n'est couvert par aucun test applicatif. Pas de musique, pas de watermark, pas de partage.

## TOP BLOCKERS (COMMERCIAL)

1. Admission de rendu illimitée + aucun kill-switch (`STUDIO_ENABLED` documenté, inexistant).
2. Fuite de quota / purge Storage hors localhost.
3. Pages légales, consentement, RGPD (texte = décision Julien).
4. Reset de mot de passe, invitation de membre utilisable.
5. Preuve 1080p réelle (E2E) et musique (dans le périmètre V1 déclaré).
6. Brand Kit, partage révocable, watermark/plans (Q billing).
7. Clé service partagée (décision d'infrastructure : projet Supabase dédié ou rôle scopé).

## NEXT 10 ACTIONS

1. Consigner les gates de base (typecheck/lint/vitest) puis lever la pile Supabase locale Studio (fresh + pgTAP).
2. S1 — admission de rendu bornée + kill-switch + quota (SQL + TS + pgTAP).
3. S2 — correctifs éditeur P1 (Suppr sur sélection périmée, flush à la navigation/`pagehide`, sortie du conflit).
4. S3 — UX/auth : reset mot de passe, ID de compte pour invitation, `loading.tsx`, textes périmés, codes d'erreur.
5. S4 — rendu : timeout proportionnel, couverture glyphes, EXIF, renouvellement d'URL signée.
6. J — profils 720/1080, nom de fichier, métering `studio_usage_events`.
7. I — Brand Kit V1 minimal (workspace, snapshot au rendu).
8. J2 — partage révocable + watermark piloté par plan (flag, défaut off).
9. M — musique importée (mix, fondus).
10. L — E2E exacts Strasbourg (10+3) / Croatie (20+5) en 1080 + happy path ; checklists Preview/Production.

## QUESTIONS ALREADY IDENTIFIED

Q-001 à Q-010 : voir ledger (billing, plans, watermark, textes légaux/rétention, mobile, domaine/projet Auth, ouverture publique, HEVC/HEIC, musique/licences, ordre de convergence des migrations).

## ESTIMATED PATH TO COMMERCIAL READY

Estimation qualitative, non promise : S1–S4 (durcissement + UX + éditeur) sont réalisables sans Julien ; I/J/M/L (fonctions produit) aussi mais coûteux sur une machine saturée. Les items texte légal, billing, domaine et infrastructure de clé service resteront « prêt sous conditions » jusqu'aux décisions de Julien. Le pourcentage de readiness est calculé dans le ledger à partir de la matrice, pas estimé à l'œil.
