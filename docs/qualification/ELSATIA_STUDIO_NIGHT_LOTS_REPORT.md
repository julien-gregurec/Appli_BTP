# ELSATIA STUDIO — Lots de la nuit du 2026-09-20 (S1 → J2)

Base : `214d47fd` (lots A→H). Train : `integration/studio-commercial-ready-v1`. Aucun push, aucune action Production/Preview/DNS/Stripe. Les statuts de test sont ceux du ledger maître (PASS / FAIL / BLOCKED / NOT RUN) ; ce document décrit **ce qui a été construit et pourquoi**.

## S1 — Admission de rendu bornée, interrupteur, quota
- **Problème (P1)** : aucun plafond sur les jobs de rendu (un éditeur pouvait en créer à l'infini, chacun stockant un snapshot jsonb, avec un worker de concurrence 1) ; `STUDIO_ENABLED` documenté mais absent ; des réservations d'upload abandonnées bloquaient le quota jusqu'à un nettoyage manuel.
- **Solution** : table `studio_render_limits` (une ligne réglable par l'exploitant : `admission_open`, actifs/espace 6, actifs/projet 4, 30/h/utilisateur, 200/jour/espace) appliquée **dans** `studio_request_render` sous le verrou d'espace déjà pris par `studio_project_lock` (comptes sans course) ; un rejeu d'une demande déjà connue reste servi même admission fermée. `studio_reserve_media` ne compte plus une réservation dont la fenêtre d'upload a expiré sans atteindre `ready`. `STUDIO_ENABLED=0|false|off` répond 503 sur toute la surface web. Refus d'admission et `ASSET_MISSING`/`TIMELINE_INVALID` : messages français fixes, statuts 429/503/400. Scripts de réconciliation : cible distante possible seulement avec `STUDIO_RECONCILE_ALLOW_REMOTE_HOST=<hôte exact>`, dry-run par défaut.
- **Migration** : `20260920010000_studio_render_admission.sql` (additive ; deux fonctions remplacées avec corps identiques hors ajouts).
- **Limite** : la purge physique en Production reste à planifier (checklist Preview §1.7).

## S2 — Éditeur : robustesse
- Suppr/Backspace et Alt+flèches ne jettent plus d'exception dans un reducer d'état ; une sélection inexistante (suppression, annulation, restauration) retombe sur un clip valide.
- L'autosave envoie une dernière fois les modifications non sauvegardées à la fermeture de l'éditeur (`dispose`), au `pagehide` et quand l'onglet passe en arrière-plan (`keepalive` pour les petites sauvegardes).
- Échecs transitoires (réseau, 429, 5xx) : reprise automatique avec backoff exponentiel borné ; 400/401/403/404 : arrêt avec message précis.
- Conflit (autre onglet) : brouillon téléchargeable, bouton de rechargement, liens de nouveau utilisables.
- Frappe et curseurs sur une même cible = un seul pas d'annulation (`editorCoalesce`) ; un texte retiré par un raccourcissement de clip est annoncé et annulable.

## S3 — Auth, UX, observabilité
- Réinitialisation du mot de passe (`/forgot-password`, `/auth/recovery` PKCE ou `token_hash`, `/reset-password`), réponse identique que le compte existe ou non ; redirection de récupération à ajouter à la liste autorisée Auth.
- `Notice` n'affiche que des messages d'une liste fermée (plus d'injection de texte via `?error=`).
- Page Membres : identifiant de compte de l'utilisateur (nécessaire pour être ajouté), rôles en français ; lien mort « Templates » retiré ; textes de feuille de route périmés remplacés ; 404 générique ; `loading.tsx` (dashboard, paramètres) ; référence d'erreur affichée ; `instrumentation.ts` journalise route (gabarit), méthode et digest, jamais l'URL, le message ni les en-têtes.

## S4 — Rendu
- Délai de rendu = `max(configuré, 3 × durée + 60 s)` (plafond 2 h) : un budget fixe de 600 s faisait échouer sans recours toute timeline de plus de ~5 minutes en 1080p.
- Texte de calque/titre/chapitre validé à l'écriture sur les plages de caractères couvertes par les polices Noto embarquées (`renderableText`) : plus d'emoji accepté par l'éditeur puis rendu en échec ; les textes déjà stockés se chargent toujours ; glyphe manquant → `TEXT_UNSUPPORTED`.
- Cinq battements de cœur manqués (et non un seul) avant d'interrompre un rendu sain (`HEARTBEAT_LOST`) ; l'annulation explicite reste immédiate.
- **Non-défaut vérifié** : les photos EXIF tournées sont correctement redressées par le FFmpeg 6.0 embarqué (fixture 200×100 orientation 6 → 100×200).

## J1 — Profil 720p, registre d'usage, panneau de rendu
- Profil `hd720` (1280×720, 720×720, 720×900, 720×1280) ; `standard` reste la classe 1080 ; `preview` reste interne. Choix de qualité dans le panneau.
- `studio_usage_events` : une ligne `render_seconds` et, hors aperçu, une ligne `export` par sortie publiée (déclencheur idempotent) ; lisible par owner/admin ; carte « Utilisation ce mois-ci » dans Paramètres.
- Panneau de rendu : libellés/erreurs français, résolution affichée, interrogation adaptative (1,5 s actif, 8 s au repos, suspendue si l'onglet est masqué), renouvellement de l'URL signée de 60 s si la lecture échoue, nom de téléchargement = slug ASCII du projet + résolution.
- **Migration** : `20260920030000_studio_export_profiles.sql`.

## I — Brand Kit
- Un kit par espace : entreprise, signature, téléphone, site, logo PNG/JPEG (colonne e-mail réservée). Écriture owner/admin, lecture membres ; validation SQL et TypeScript identiques (caractères dessinables) ; révision optimiste ; un média utilisé comme logo ne peut pas être supprimé ; le rollback ne détruit jamais un kit.
- Le formulaire de style est prérempli (entreprise, téléphone, site, signature comme texte de fin) et propose « Logo de la marque », rattaché au projet à la génération par une référence partagée (idempotent).
- **Hors périmètre volontaire** : couleurs de marque et réseaux sociaux (les styles gardent leurs palettes fixes) — post-V1 ; **e-mail** non appliqué aux vidéos.
- **Migration** : `20260920050000_studio_brand_kit.sql`.

## J2 — Partage révocable et filigrane serveur
- Liens de partage : seul le SHA-256 du secret est stocké ; exports finals uniquement ; 1 à 30 jours ; 5 liens actifs maximum par export ; editor+ créent/révoquent, viewer et autre tenant refusés ; la table n'a aucun droit client ; résolution réservée au service_role, sans champ tenant dans la réponse (la clé de stockage, donc l'URL signée d'une minute, contient toutefois les UUID opaques d'espace et de projet : aucun nom, e-mail ni identifiant de compte). Page publique `/s/[token]` : sans session, `noindex`, `no-referrer`, URL signée d'une minute renouvelée par le lecteur.
- Filigrane : `studio_workspaces.render_watermark` (défaut faux, positionné par l'exploitant) copié dans chaque snapshot par un déclencheur ; le worker dessine « ELSATIA Studio » sur l'encodage final uniquement si le snapshot le demande. **Aucune politique commerciale décidée** (Q-003).
- **Migration** : `20260920070000_studio_shares_watermark.sql`.

## Qualification et outillage
- Le gate `e2e-gate.mjs` construit désormais la base **Lot H** (`setup --lot-h`), exécute les contrôles A→H inchangés, puis `post-h-migration-check.mjs` : upgrade des migrations post-H sur des données H, retour arrière inverse (SQL par migration qui refuse de détruire des données utilisateur), réapplication, données identiques octet pour octet.
- `runtime-check.mjs` attend « une migration appliquée par fichier » au lieu de 260.
- `apps/studio/postcss.config.mjs` isole Studio du pipeline Tailwind racine (le build échouait sans les dépendances racine).
- Acceptation pleine taille (opt-in) : `tests/acceptance.spec.ts`, Strasbourg 10+3 et Croatie 20+5 en 1080×1920.
