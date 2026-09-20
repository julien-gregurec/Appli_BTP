# ELSATIA STUDIO — Checklists Preview et Production

Statut : préparation seulement. **Rien de ce document n'a été exécuté** : aucune action Preview, Production, DNS, Stripe ou Supabase distant n'a eu lieu pendant la nuit du 2026-09-20. Chaque case est à cocher par une personne autorisée, avec preuve.

## 0. Décisions à obtenir avant tout (voir le ledger maître)

- [ ] Q-004 — projet Supabase dédié à Studio **ou** rôle/JWT scopé (la clé service actuelle du web et des workers est complète).
- [ ] Q-001/Q-003 — modèle de facturation, plans, watermark par défaut.
- [ ] Q-002 — CGU, confidentialité, mentions légales, rétention ; Q-008 — suppression de compte.
- [ ] Q-007 — inscription ouverte ou sur invitation.
- [ ] Q-010 — traitement du tri des migrations (M-1) dans la lignée commune.

## 1. Préparation Preview (synthétique, jamais de données clients)

1. **Sauvegarde/restauration prouvées** sur instance isolée (base **et objets**). Sans preuve, pas de migration distante.
2. **Ledger cible** : lister les migrations appliquées ; vérifier le contenu, pas seulement les noms. Migrations Studio dans l'ordre : `20260912120000` → `20260913040000` (A–H) puis post-H : `20260920010000` (admission + quota), `20260920030000` (profil 720p + registre d'usage), `20260920050000` (Brand Kit), `20260920070000` (partage + filigrane). Si la base cible contient déjà des migrations GP `20260920…`/`20260921…`, les timestamps Studio `2026091x` sont antérieurs : prévoir `--include-all` ou renommage (Q-010). Aucune dépendance croisée : Studio ne référence que `auth.users` et `storage`.
3. **Auth** (réglages du projet, pas seulement le code) : mot de passe ≥ 12 caractères, confirmation e-mail activée, captcha, redirections autorisées **exactes** : `<origine Studio>/auth/callback`, `/auth/confirm`, `/auth/recovery`. Ne pas élargir les cookies `.elsatia.fr`.
4. **Storage** : buckets `studio-originals` et `studio-renders` privés, limite 1 GiB, listes MIME ; aucune policy publique. Vérifier CORS exact pour l'upload TUS.
5. **Variables web** : `NEXT_PUBLIC_STUDIO_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` ; serveur seulement : `STUDIO_STORAGE_SERVICE_KEY`. `STUDIO_ENABLED=1` (interrupteur : `0|false|off` répond 503 partout). **Ne jamais définir `STUDIO_RENDER_INTERNAL_PREVIEW`** (force des rendus 540×960).
6. **Worker de rendu (hors Vercel)** : image Linux FFmpeg/ffprobe figée, Redis privé authentifié, `STUDIO_REDIS_URL`, `STUDIO_RENDER_TMP` (chemin absolu, disque dimensionné), `STUDIO_RENDER_TIMEOUT_SECONDS` (défaut 600 ; le budget effectif est `max(valeur, 3 × durée + 60 s)`), concurrence 1. Le worker n'expose aucun port. Le décodeur ne doit avoir ni réseau ni clé service (sandbox : voir ledger D-23).
7. **Purge** : planifier `apps/studio/scripts/storage-reconcile.mjs` (dry-run par défaut, `--apply` explicite) et `workers/studio-video/src/reconcile.ts`. Cible distante = `STUDIO_RECONCILE_ALLOW_REMOTE_HOST=<hôte exact>`. Sans cette purge, les médias supprimés continuent de compter dans le quota.
8. **Limites d'admission** (`studio_render_limits`, une ligne) : `admission_open`, actifs par espace (6) et par projet (4), 30/heure/utilisateur, 200/jour/espace. Fermer `admission_open` pendant un déploiement ; les relectures d'une demande déjà connue restent servies.
9. **Watermark** : colonne `studio_workspaces.render_watermark` (défaut faux), à positionner par l'exploitant ; jamais depuis le client.

## 2. Recette Preview

- [ ] Migrations appliquées ; pgTAP Studio vert sur une copie ; `post-h-migration-check` vert.
- [ ] Parcours réel sur comptes synthétiques : inscription → confirmation e-mail → espace → projet → import → style → montage → rendu 720 et 1080 → téléchargement → lien de partage → révocation → réinitialisation du mot de passe.
- [ ] Scénarios **Chantier Strasbourg** (10 photos + 3 vidéos, Chantier Pro, 9:16, 60 s, 1080) et **Vacances Croatie 2026** (20 + 5, Voyage, 9:16, 90 s) : MP4 H.264/AAC 1080×1920, 1 800 / 2 700 images à 30 fps ±1, ffprobe joint aux preuves.
- [ ] Isolation : espace B ne lit/écrit rien de A (SELECT/INSERT/UPDATE/DELETE, RPC, Storage, URL devinée).
- [ ] Pannes : worker arrêté en plein rendu, Redis vidé, Storage indisponible, session expirée pendant l'autosave.
- [ ] iPhone Safari réel (import, aperçu, lecture ; formats HEIC/HEVC refusés avec message).
- [ ] Charge : 2 tenants concurrents, admission bornée, aucune famine.
- [ ] Observabilité : journaux `studio-web` (route, digest, sans PII) et journaux du worker collectés ; alerte sur `RENDER_TIMEOUT`, `WORKER_LOST`, file d'attente.

## 3. Production (décision de release distincte, autorisation explicite)

- [ ] Preview verte et preuves archivées ; aucun P0/P1 ouvert au ledger.
- [ ] Sauvegarde datée avant migration ; fenêtre et responsable désignés ; plan de retour arrière écrit.
- [ ] Ordre : infrastructure et migrations additives → worker compatible → dispatcher → web **avec `admission_open=false`** → contrôles → ouverture progressive.
- [ ] Retour arrière : couper `STUDIO_ENABLED`, fermer l'admission, drainer/annuler les jobs, restaurer l'image précédente. **Les scripts `rollback-post-h/*.sql` ne valent que pour bases jetables ou vides** ; sur données réelles, correctif additif. Ne jamais restaurer la base partagée pour annuler Studio seul.
- [ ] Textes légaux publiés et consentement à l'inscription ; « marque déposée » (jamais ®) ; suppression de compte opérationnelle.
- [ ] Facturation : décision Q-001 appliquée avant toute ouverture payante ; aucune donnée Stripe Live modifiée sans lot dédié.

## 4. Ce que cette nuit n'a PAS prouvé

Réseau distant, Auth distant (captcha, confirmations), capacité 1 Go/fichier et 5 Go/projet, iOS réel, HEIC/HEVC, restauration DB+objets, coûts, charge multi-tenant. Ces points sont des conditions de la Preview, pas des acquis.
