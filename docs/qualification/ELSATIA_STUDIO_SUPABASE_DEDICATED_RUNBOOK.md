# ELSATIA STUDIO — Projet Supabase dédié : bootstrap, ledger, runbook

Décision Julien Q-004 (2026-09-20) : Studio dispose de son propre projet Supabase, en deux environnements séparés, **STUDIO PREVIEW** et **STUDIO PRODUCTION**. La base Gestion Pro n'est pas utilisée comme stockage métier Studio. **Ce document prépare ; il n'exécute rien à distance.** Aucun projet Supabase n'est créé, lié ou modifié sans autorisation explicite.

## 1. Ce qui existe déjà dans le dépôt (prêt, qualifié localement)

`apps/studio/supabase/` = le projet Supabase Studio :

| Élément | Contenu |
|---|---|
| `config.toml` | référence de configuration (`project_id = "elsatia-studio"`), mot de passe ≥ 12, **confirmation e-mail activée**, `secure_password_change`, redirections `/auth/callback` `/auth/confirm` `/auth/recovery`, limite objet 1 GiB |
| `templates/confirmation.html`, `recovery.html` | e-mails de marque Studio (liens `/auth/confirm?token_hash=…&type=email|recovery`) |
| `migrations/` | **liens symboliques** vers les migrations Studio du dépôt (`*_studio_*.sql`) : aucune copie, donc aucune dérive |

Le harnais local sait construire cette pile isolée : `node scripts/local-test.mjs setup --studio-only`.

## 2. Q-010 — ledger : analyse et décision

**Constat vérifié.** Les migrations Studio ne référencent que `auth.users` et `storage` (aucun objet Gestion Pro). Un projet Studio dédié démarre donc d'une base vide avec **uniquement** les migrations Studio : le ledger Studio est **découplé** du ledger GP. Le tri lexical `2026091x` < `20260920000308` (GP) devient sans objet : il ne pouvait gêner que dans un ledger commun.

**Preuves** (voir le rapport V2) : installation *Fresh* du projet dédié (`--studio-only`) : nombre de migrations = nombre de fichiers Studio, tous les fichiers pgTAP Studio verts ; installation *Upgrade* depuis la base Lot H puis migrations post-H : verte (gate `post-h-migration-check`). Le mode historique (ledger GP + Studio, 260 → …) reste rejouable pour les gates A→H.

**Décision.** 1) Studio dédié : **aucun renommage** des migrations qualifiées. 2) Le ledger de Studio Preview/Production est celui de `apps/studio/supabase/migrations`. 3) Les nouvelles migrations Studio continuent de s'ajouter dans `supabase/migrations/2026…_studio_*.sql` **et** d'être liées dans `apps/studio/supabase/migrations` (script de contrôle ci-dessous). 4) Si un jour Studio est réuni au train GP dans une même base, la question Q-010 (renommage ou `--include-all`) se reposera, mais ce n'est plus le chemin cible.

Contrôle d'intégrité (à lancer en CI et avant tout push distant) : `node scripts/studio-supabase-check.mjs` — vérifie que chaque migration Studio du dépôt est liée, que rien d'autre n'y figure et que les noms sont strictement croissants et uniques.

## 3. Variables d'environnement (par environnement)

| Variable | Rôle | Règle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | projet Studio (public) | clé publique uniquement |
| `NEXT_PUBLIC_STUDIO_URL` | origine exacte de l'app | HTTPS hors local |
| `STUDIO_STORAGE_SERVICE_KEY` | clé service **du projet Studio dédié** | serveur/worker seulement ; blast radius limité à Studio |
| `STUDIO_REDIS_URL`, `STUDIO_RENDER_TMP`, `STUDIO_RENDER_TIMEOUT_SECONDS` | worker | Redis privé authentifié |
| `STUDIO_ENABLED` | interrupteur (`0|false|off` → 503) | défaut activé |
| `STUDIO_MAIL_PROVIDER` (+ `RESEND_API_KEY`, `STUDIO_MAIL_FROM`) | envoi des invitations | absent = lien à copier |
| `STUDIO_LEGAL_PUBLISHED`, `STUDIO_LEGAL_TEXT_VERSION` | pages légales | 0 tant que la relecture juridique n'est pas faite |
| `STUDIO_RECONCILE_ALLOW_REMOTE_HOST` | purge Storage distante | hôte exact ; jamais par défaut |
| `STUDIO_RENDER_INTERNAL_PREVIEW` | **ne jamais définir** hors recette | force des rendus 540×960 |

## 4. Bootstrap d'un projet distant — À FAIRE PAR UNE PERSONNE AUTORISÉE (checklist)

1. Créer deux projets Supabase distincts (Preview, Production), région cohérente avec l'hébergeur du worker. **Ne pas** réutiliser le projet Gestion Pro.
2. Auth : appliquer `apps/studio/supabase/config.toml` (mot de passe ≥ 12, confirmations, captcha, redirections **exactes** du domaine Studio, SMTP de production, gabarits `templates/`). Aucun cookie `.elsatia.fr` élargi.
3. Vérifier `node scripts/studio-supabase-check.mjs`, puis `supabase link --project-ref <ref>` **dans `apps/studio`** et `supabase db push --dry-run` ; relire la liste (12 → 15 migrations attendues aujourd'hui), puis `db push`.
4. Storage : les buckets `studio-originals` et `studio-renders` sont créés par les migrations (privés, 1 GiB, listes MIME). Vérifier la politique restrictive.
5. Worker de rendu hors Vercel avec **la clé service du projet Studio** ; concurrence 1 ; Redis authentifié ; `STUDIO_RENDER_TMP` dimensionné.
6. Sauvegarde/restauration DB + objets **prouvées** avant toute donnée réelle.
7. Preview fermée d'abord (allow-list d'inscription ou invitations), recette, puis pilote.

## 5. Fédération d'identité ELSATIA (plus tard)

Studio a ses propres utilisateurs Auth. L'identité ELSATIA commune sera fédérée par un mécanisme propre (SSO/OIDC ou échange de jeton signé) **sans** coupler la base métier Studio à Gestion Pro. Contrat d'accès au catalogue : `ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md`.

## 6. Retour arrière

Studio n'ayant plus de base partagée, un incident Studio se traite dans le projet Studio (restauration PITR de **ce** projet) sans toucher aux autres applications. Les scripts `rollback-post-h/*.sql` restent réservés aux bases jetables ou vides.
