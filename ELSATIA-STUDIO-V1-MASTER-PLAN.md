# ELSATIA Studio V1 — Master plan

Date : 12 septembre 2026. Livrable initial limité à l’audit et à la conception, conformément au cahier des charges complet. **Aucune application Studio, migration ou infrastructure n’est livrée ici.**

## Décision

**GO SOUS CONDITIONS pour le développement local isolé.** Le socle Next.js/TypeScript/Supabase est adapté. Studio sera une application autonome du dépôt, avec ses projets, workspaces, assets, timelines, templates, Brand Kits, jobs et usages. L’identité ELSATIA commune reste un service transversal ; Gestion Pro ne devient pas une dépendance métier.

La commercialisation n’est pas validée. Les deux scénarios obligatoires devront produire de vrais MP4 par worker ; un prototype navigateur ou des jobs simulés ne constitueront pas leur validation.

## Documents livrés

| Document | Contenu |
|---|---|
| [Audit](ELSATIA-STUDIO-V1-AUDIT.md) | État du dépôt, preuves, réutilisation précise, incompatibilités, risques |
| [Architecture](ELSATIA-STUDIO-V1-ARCHITECTURE.md) | Stack, comparaison FFmpeg/Remotion, flux, modèle de données, upload, rendu, sécurité, intégration |
| [Roadmap A–L](ELSATIA-STUDIO-V1-ROADMAP.md) | Lots testables/commitables/réversibles, dépendances et complexité relative |
| [Plan de tests](ELSATIA-STUDIO-V1-TEST-PLAN.md) | Unitaires, intégration, SQL/RLS, E2E, fixtures, Strasbourg et Croatie |
| [Déploiement](ELSATIA-STUDIO-V1-DEPLOYMENT.md) | Environnements, ressources, variables, exploitation, coûts, rollback et gates futurs |

## Architecture retenue pour la proposition

**Next.js/React/TypeScript → API Studio → PostgreSQL RenderJob + outbox → BullMQ/Redis → worker Node/FFmpeg → Storage privé → MP4 H.264/AAC.** Le navigateur transfère les médias directement au Storage par upload signé reprenable ; le serveur web ne décode ni ne rend les vidéos. La preview affiche le fichier réellement rendu ; une modification crée une nouvelle version de timeline et un nouveau rendu.

FFmpeg est recommandé pour cette V1 sobre. Les compositions Remotion restent une alternative si le spike prouve un besoin que FFmpeg couvre mal, après analyse du runtime et de la licence. Aucun changement de stack du dépôt principal, aucune nouvelle dépendance installée dans ce passage.

Modèle canonique : User commun, Workspace/Membership propres, Project/ProjectAsset/MediaAsset, Timeline immuable et ses clips/transitions/audio/textes/branding, Template versionné, BrandKit, RenderJob/Output/Export/ShareLink, SubscriptionPlan/WorkspacePlan, UsageCounter/UsageEvent et AuditLog. UploadSession et outbox complètent la robustesse. Assets et sorties dans Storage, jamais en SQL. FKs tenant et RLS sur chaque donnée métier ; contrat d’intégration sans FK chantier/devis.

## Périmètre V1 à atteindre

Inscription personnelle/professionnelle, dashboard/projets, jusqu’à 100 médias, upload photo/vidéo reprenable, analyse indicative sans suppression automatique, six templates minimum et neuf styles, durée/format, musique importée, titre/logo/Brand Kit, timeline automatique, édition simple, MP4 720/1080, preview, téléchargement et lien révocable. Les métadonnées disponibles ordonnent le voyage ; les phases chantier peuvent être attribuées manuellement. Architecture mobile préparée par les contrats, sans app native V1.

À préparer sans activer : IA sémantique/visages facultative, bibliothèque musicale licenciée, capacités FREE/PERSONAL/PRO/BUSINESS, watermark contrôlé serveur, intégration Gestion Pro. Hors V1 : éditeur professionnel, génération vidéo IA, clonage vocal, publication sociale automatique, marketplace, collaboration live, carte animée complexe, parallaxe et 4K avancée.

## Principales décisions et conditions

| Décision | Proposition | Condition de validation |
|---|---|---|
| Implantation | `apps/studio`, port local 3030 ; domaine à définir | Lot A isolé, CI dédiée et aucun import métier Gestion Pro |
| Identité | Compte Supabase Auth commun + onboarding workspace personnel | Tester compte sans entreprise et sessions par domaine ; contrat catalogue/capacités explicite |
| Données | Tables `public.studio_*`, SQL/RLS ; aucun ORM supplémentaire | Nouveau timestamp lors du lot ; fresh/upgrade/RLS et aucune réécriture historique |
| Stockage | Supabase privé + TUS via adapter compatible évolution S3/R2 | Limites fournisseur et reprise à ~1 Go prouvées ; config locale 50 MiB actuellement insuffisante |
| Rendu | Worker FFmpeg séparé ; MP4 H.264/AAC 30 fps | Codec/HEIC/HEVC/HDR/VFR, fontes, licences, benchmark mémoire/disque |
| Fiabilité | Outbox DB, queue, lease, retry, annulation, sorties immuables | Crash/retry sans double publication ni double usage ; perte Redis récupérable |
| Capacité | 100 médias ; proposition 1 Go/fichier et 5 Go/projet pilote | Mesurer et confirmer coût/rétention ; ne pas annoncer avant preuve |
| Infrastructure commune | Préserver la lignée canonique ELSATIA | Validation distante et restore préalable à toute future migration partagée |

La dernière canonicalisation locale est présente au HEAD : **252 migrations uniques** au contrôle actuel. Le rapport V2 documente replay/upgrade/RLS réussis ; ces suites n’ont pas été relancées ici. Les rapports plus anciens de divergence ne doivent pas être interprétés comme un état local inchangé. Les preuves distantes restent hors périmètre.

## Réutilisation et effort

Réutiliser les contrats d’accès commun, helpers neutres de session/sécurité, protocole d’upload signé, principe de partage par hash, abstractions IA et outils Vitest/pgTAP/Playwright/Sentry. Adapter les droits aux workspaces et les uploads aux gros fichiers. Ne pas importer le contexte entreprise Colors, les permissions chantier, les tarifs Stripe Gestion Pro, les buckets métier ni le script vidéo marketing comme moteur SaaS.

Complexité relative totale : **41 unités** (S=1, M=2, L=3, XL=5), sans conversion en jours. Foundation, upload, worker et hardening sont les lots XL. Le calendrier doit être recalibré après le spike codecs/rendu et la validation de l’onboarding personnel.

## Premier lot recommandé et gates

**Commencer par A — Foundation**, d’abord squelette indépendant et contrats, puis Auth/workspaces/RLS avec tests locaux. Ne pas démarrer tout le produit à la fois. Les premiers commits doivent rester petits et ne contenir aucune modification préexistante du worktree.

Conditions pour continuer vers une V1 commercialisable :

1. Contrat compte commun + onboarding sans entreprise accepté et démontré.
2. Migrations additives compatibles avec base fraîche et base existante ; aucun impact d’accès sur les autres apps.
3. Uploads volumineux, décodeurs et worker qualifiés ; budget CPU/disque/Storage défini.
4. Scénario **Chantier Strasbourg : 10 photos, 3 vidéos, Chantier Pro, 9:16, 60 s, titre/logo/musique** validé par vrai MP4.
5. Scénario **Vacances Croatie 2026 : 20 photos, 5 vidéos, Voyage, 9:16, 90 s, tri par dates** validé de même.
6. Isolation, annulation/retry, suppression, lien révocable, restauration et observabilité prouvées ; autorisation explicite avant déploiement.

## État Git et arrêt du passage

- Branche créée : `feat/elsatia-studio-v1`, depuis `6a814a2bd6949fced340660657c74c6a22bdcffb`.
- Commit de ce passage : **aucun** ; documents laissés à relire.
- Livrables : les six fichiers racine `ELSATIA-STUDIO-V1-*.md`, y compris ce master plan.
- Changements préexistants : dix fichiers suivis modifiés, six rapports non suivis et `tools/`, conservés sans staging.
- Le début de prototype issu du premier texte tronqué a été entièrement retiré à réception du cahier complet. Aucun code Studio conservé.
- Aucun déploiement, fusion, push, modification Production, migration ou installation de dépendance.

**Arrêt ici, au livrable initial demandé. Verdict : GO SOUS CONDITIONS.**
