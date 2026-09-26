# ELSATIA Studio V1 — Roadmap A à L

Proposition du 12 septembre 2026. **Aucun lot d’implémentation n’est lancé par ce document.** Chaque lot contient ses tests, son commit ciblé, sa documentation et son moyen de désactivation. L’ordre alphabétique nomme les lots, pas une obligation de réaliser les tests à la fin.

## Échelle et dépendances

Complexité relative : S = 1, M = 2, L = 3, XL = 5 unités. Ce sont des comparaisons de difficulté, pas des jours ni un devis. Le chemin critique est A → B/C → D → E → J → K/L. Templates F accompagne D ; Brand Kit I est nécessaire aux rendus de recette ; H ne doit jamais bloquer D/E.

| Lot | Contenu et livrable autonome | Dépendances | Preuve de sortie | Complexité | Retour arrière |
|---|---|---|---|---|---|
| A — Foundation | App Next isolée, packages contrats/domaine, Auth Studio, workspace personnel/membres, catalogue et capacités via adaptateur, RLS initiale, schéma additif | Décisions identité + propriétaire du schéma commun | Inscription sans entreprise, accès A/B refusé, app buildable, fresh + upgrade isolés verts | XL / 5 | Désactiver route/feature Studio ; rollback code ; aucune suppression des tables peuplées |
| B — Media upload | Réservation quota, TUS signé direct, progress/retry, 100 médias, inspection ffprobe asynchrone, thumbnails et métadonnées, nettoyage | A | JPG/PNG/MP4/MOV/WEBM, corruption/refus, coupure/reprise, MIME réel, concurrence quota | XL / 5 | Stopper nouvelles sessions ; laisser finaliser/purger les sessions connues |
| C — Projects | Dashboard, liste avec cover/type/date/durée/statut/dernier rendu, création, renommage, ouverture, duplication, suppression | A ; assets B pour couvertures | CRUD avec contrôle tenant, duplication sans mélange, purge sans casser les références | M / 2 | Masquer mutations UI ; conserver données ; annuler seulement jobs du projet supprimé |
| D — Automatic timeline | Schéma versionné, tracks/clips/transitions/audio/texte/branding, moteur déterministe, allocation durée, ordre phase/date/manuelle | A, contrats B/C | Tests frames, sources bornées, ordre stable, cible 60/90 s exacte, contradictions signalées | L / 3 | Réactiver version précédente du moteur ; manifests existants immuables |
| E — Video render worker | Image FFmpeg/ffprobe, jobs/outbox/BullMQ, orchestration séparée, codecs, heartbeat/lease, annulation/retry, progression | B, C, D ; F minimal | Rendu réel, worker kill/retry, Redis perdu/reconstruction, double livraison sans double sortie | XL / 5 | Suspendre dispatch, drainer/annuler, revenir à l’image compatible précédente |
| F — Templates | Six templates requis, neuf styles structurés, transitions réutilisables, intro/outro, safe areas/fonts | D ; validation vidéo E | Manifest et rendu de chaque template, formats 4 ratios, absence de texte tronqué | M / 2 | Version de template précédente, aucune mutation des snapshots déjà rendus |
| G — Editor | Blocs réordonnables clavier/tactile, exclusion, durée/trim, textes, musique, transition, remplacement, couverture, nouveau rendu | C, D, E, F | Chaque action change le snapshot attendu ; brouillon distinct du dernier MP4 valide | L / 3 | Revenir à l’UI précédente ; préserver versions de timeline |
| H — AI analysis | Score qualité indicatif, doublons/proximité, chronologie/chapitres, contrats IA texte/média, fallback sans fournisseur | B, D | IA coupée/timeout → montage possible ; aucune suppression média ; usage mesuré | L / 3 | Désactiver fournisseur IA ; conserver heuristiques et montage déterministe |
| I — Brand Kit | Logo, couleurs, entreprise/slogan, coordonnées/réseaux ; snapshot et écran final | A, B, D | Logo correct dans les 4 formats, remplacement sans changer les anciens rendus | M / 2 | Désactiver nouveau kit, conserver snapshots et logos référencés |
| J — Exports | Profils MP4 H.264/AAC 720/1080, player vrai MP4, téléchargement/Range, lien révocable, watermark serveur, usages | E, F, I | ffprobe valide, fichier téléchargé lisible, partage expiré/révoqué refusé | L / 3 | Suspendre nouvelles signatures/partages, garder les sorties privées |
| K — Hardening | Quotas, coûts, sécurité décodeur/SSRF, purge/RGPD, droits, métriques/alertes, restore, limites de charge | A–J | Attaques multi-tenant refusées ; restauration DB+objets ; consommation idempotente ; budgets mesurés | XL / 5 | Désactiver admission jobs ; rollback compatible ; incident et récupération documentés |
| L — Tests E2E | Tests transversaux Strasbourg et Croatie, mobile, erreurs, reprise, non-régression ELSATIA ; release checklist | A–K | Scénarios exacts avec vrais MP4, traces et inspections, pas de mocks sur chaîne d’acceptation | L / 3 | Refus release ; aucune infrastructure distante modifiée automatiquement |

Total indicatif : **41 unités relatives**. Upload volumineux, architecture worker, sécurité et exploitation concentrent le risque. Toute estimation calendrier sera faite après le spike technique du lot E et la validation des choix d’identité/stockage ; pas de promesse d’effort avant ces mesures.

## Premier lot recommandé

**Lot A, découpé en petits commits :**

1. Squelette autonome et contrats TypeScript, commandes de build/lint/tests séparées, garde anti-import Gestion Pro. Aucun changement fonctionnel dans l’application principale.
2. Contrat d’identité commun et onboarding personnel Studio ; tests absence d’entreprise, session expirée, compte existant et redirections. Examiner les triggers d’inscription communs avant toute adaptation.
3. Migrations additives workspace/membership/projet et tests RLS, uniquement sur instances locales jetables. Pas d’ID de migration réservé dans le présent document : relire l’inventaire lors de la création.
4. Smoke d’inscription et CRUD vide, documentation et protocole de rollback. Extension du catalogue/habilitations dans un commit transversal séparé, testé sur les trois apps existantes.

Le lot A peut avancer localement sans infrastructure payante. Son application sur une base partagée distante dépend de la preuve de sauvegarde/restauration et de la validation du ledger cible. La future livraison reste explicitement autorisée séparément.

## Règles de livraison

- Un commit ne contient que le lot et ses tests ; jamais `git add .` dans ce worktree déjà modifié. Aucune capture média importante ni secret versionné.
- Tests unitaires dès A ; SQL/RLS dès les premières tables ; vrais tests worker dès E ; E2E à chaque parcours livré, consolidés en L.
- Contrats versionnés et migrations append-only ; aucun ancien numéro réutilisé, aucun fichier historique renuméroté.
- Rollback de schéma destructif réservé aux bases éphémères. Sur données réelles, préférer rollback applicatif et correction additive ; une suppression de colonne/table n’est pas un retour arrière sans perte.
- Pas de Stripe, application native complète, carte animée, génération vidéo IA, publication sociale automatique ou marketplace dans ces lots.
- Capacité cible : 100 médias ; fichier environ 1 Go et total plusieurs Go **sous réserve du benchmark et du fournisseur**. Un upload local limité ne suffit pas pour accepter B/K.

Référence des tests : [plan de validation](ELSATIA-STUDIO-V1-TEST-PLAN.md).
