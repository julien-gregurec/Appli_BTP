# ELSATIA Studio V1 — Déploiement proposé et exploitation

Document de préparation du 12 septembre 2026. **Aucun déploiement demandé ni effectué.** Aucun service, DNS, bucket, queue ou secret créé. Les noms et tailles ci-dessous sont des propositions à confirmer par mesures.

## Environnements et ressources

| Élément | Local / CI | Preview future | Production future |
|---|---|---|---|
| Web Studio | Next port proposé 3030 | Projet Vercel séparé, origine propre | Projet Studio séparé ; domaine à confirmer |
| Auth/DB | Supabase jetable, PostgreSQL 17 | Projet de test explicitement identifié | Identité ELSATIA commune, tables Studio isolées et RLS, seulement après gate partagé |
| Storage | Buckets Studio locaux | Buckets privés avec données synthétiques | Originaux/proxies/rendus/brand-kits privés dans région choisie |
| Queue | Redis dédié | Redis privé dédié Studio | Redis durable, TLS et authentification, pas de port public |
| Worker | Image Linux FFmpeg/ffprobe | Container hors Vercel web | Worker(s) isolés, autoscaling seulement après benchmark |
| Dispatcher / purge | Processus contrôlés | Service permanent borné | Outbox, watchdog, sweep Storage ; healthchecks indépendants |

Région : cohérence géographique web/DB/Storage/worker à privilégier ; `fra1` est la configuration web actuelle observée, pas la preuve d’une région pour tous les services. Fournisseur worker à choisir après mesure et contraintes d’exploitation ; aucune souscription implicite.

Dimensionnement de départ pour **benchmark**, pas capacité garantie : 4 vCPU, 8 Gio RAM, concurrency 1, scratch disque dimensionné selon profil. Fixer le scratch à partir du coût maximal normalisation + intermédiaires + rendu avec marge ; réserver avant téléchargement et refuser proprement si insuffisant. Intermédiaires compressés/par segments pour éviter un pipeline de frames brutes explosif.

Limites produit proposées pour le pilote : 100 médias/projet, 1 Go/fichier, 5 Go/projet, vidéo finale ≤10 minutes, 1080p maximum ; ces deux dernières limites complètent le cahier et restent à valider. Ne pas afficher une limite de 1 Go tant que Storage et upload reprenable ne l’ont pas passée. La configuration locale existante à 50 MiB reste inchangée pendant ce passage.

## Variables et secrets futurs

| Périmètre | Variables proposées | Règle |
|---|---|---|
| Web public | NEXT_PUBLIC_STUDIO_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Uniquement origine et clé publique ; rôle RLS obligatoire |
| API | STUDIO_ENABLED, RATE_LIMIT_HMAC_KEY, STUDIO_STORAGE_PROVIDER, STUDIO_UPLOAD_MAX_BYTES, STUDIO_PROJECT_MAX_BYTES, STUDIO_MAX_ASSETS | Valeurs serveur autoritaires, contrôles d’origine/projet et budget |
| Orchestration | STUDIO_DATABASE_URL, STUDIO_REDIS_URL, STUDIO_WORKER_CONCURRENCY, STUDIO_JOB_TIMEOUT_SECONDS | Comptes dédiés à privilèges minimaux ; aucun secret NEXT_PUBLIC |
| Storage orchestration | Identifiant technique limité / clé provider pour objets Studio | Aucun credential Gestion Pro étendu injecté dans le subprocess FFmpeg |
| Worker | FFMPEG_BIN, FFPROBE_BIN, STUDIO_SCRATCH_ROOT, STUDIO_SCRATCH_MAX_BYTES | Chemins contrôlés, versions figées, réseau décodeur bloqué |
| Obs / IA | SENTRY_DSN, identifiant release, STUDIO_AI_ENABLED, clé fournisseur optionnelle | IA off par défaut, pas de trace média/token/EXIF ; secret séparé |

La session Studio doit être validée sur son domaine avec les callbacks exacts. Une identité commune Supabase n’établit pas automatiquement du SSO inter-domaines. Ne pas élargir les cookies `.elsatia.fr` ni modifier la configuration Auth commune sans lot de tests dédié. La création d’un workspace personnel ne crée pas de droits de Gestion Pro.

## Procédure future de mise en service

1. Identifier branche/SHA cible et environnement explicitement ; inventorier les diff et préserver les travaux non liés. Aucun automatisme lié au simple push de cette branche d’audit.
2. Vérifier le ledger **et les contenus** de migrations cibles, la configuration Auth/Storage et les droits techniques. Les validations locales V2 historiques ne prouvent pas l’état distant.
3. Prouver sauvegarde et restauration **DB + objets** sur instance isolée. Inventaire Storage, tailles/checksums, politiques de rétention ; aucune confusion entre métadonnées `storage.objects` et fichiers binaires.
4. Ajouter migrations Studio avec nouveau timestamp unique, tester installation fraîche et upgrade depuis copie autorisée ; migration sans renumérotation de l’existant. Down SQL uniquement en fixture vide, rollback applicatif sur données conservées.
5. Construire une image worker verrouillée avec FFmpeg/ffprobe, codecs, fontes et SBOM ; vérifier le corpus JPG/HEIC/MOV/MP4/WEBM/HDR/VFR. Adapter les limites fournisseur de Storage **uniquement** aux buckets/instances concernés.
6. Configurer CORS exact, signatures d’upload, expiration des objets incomplets, Storage privé ; quotas applicatifs et bornes techniques concordants. Reprise TUS à tester avec token expiré et nouvelle autorisation.
7. Déployer d’abord infrastructure et migrations additives, puis worker compatible, dispatcher et web avec admission jobs fermée. Contrôler le healthcheck du worker et la compatibilité manifest/schema.
8. Ouvrir Preview synthétique ; exécuter tests SQL/RLS, non-régression, scénarios Strasbourg/Croatie, annulation/retry, restore et charge. Conserver preuves.
9. Décision de release séparée ; autorisation explicite avant toute mutation Production. Ouvrir progressivement l’admission et surveiller coûts, temps d’attente et erreurs.

## Retour arrière et incidents

Couper `STUDIO_ENABLED`/admission des nouveaux jobs, conserver consultation des rendus sains si possible, suspendre dispatch et drainer ou annuler les travaux en cours. Rétablir l’image précédente compatible avec les manifests ; ne pas relire un nouveau format de timeline avec un moteur ancien. Les anciennes versions de moteur/templates nécessaires doivent rester disponibles.

Ne jamais restaurer toute la base partagée pour annuler une modification Studio sans plan de récupération de toutes les applications. Une migration additive reste en place et un correctif est réémis. Les objets déjà publiés sont immuables ; les tentatives interrompues peuvent être purgées après vérification d’absence de référence.

Cas de perte Redis : reconstruire à partir RenderJob/outbox avec mêmes identifiants ; lease fencing et unicité empêchent doubles publications. Cas de panne Storage : refuser nouveaux uploads/jobs consommateurs, préserver les réservations récupérables puis réconcilier. Cas de capacité disque : rejet contrôlé avant téléchargement ; watchdog et alerte, aucun effacement aveugle d’originaux.

## Mesures, coûts et rétention

Logs JSON : timestamp, service/version, correlation_id, workspace opaque, job_id, état, attempt, durée, octets, error_code ; pas de nom fichier, titre, visage, localisation, URL/token ni clé. Sentry configuré sans PII et filtres explicites. Tableau workers : queue age, count, failed/stalled/cancelled, runtime p50/p95, mémoire/scratch, temps preprocessing/encoding, retry count et erreurs codecs.

UsageCounter/UsageEvent : `render_minutes`, `storage_bytes`, `ai_operations`, `exports` ; distinguer minutes vidéo facturables, CPU secondes réellement consommées et transferts. Réserver avant admission et solder atomiquement ; un retry technique ne facture pas deux fois. Export compte l’autorisation créée, pas les requêtes Range du lecteur.

Modèle de coût à mesurer : **CPU-heures × tarif + stockage Go-mois × tarif + egress Go × tarif + appels IA + queue/DB fixes**. Aucun tarif fournisseur n’est retenu dans cet audit. Alertes de budget, capacité et durée de file configurables ; protéger la capacité des autres apps en limitant concurrence et requêtes DB Studio.

Rétentions proposées à arbitrer : uploads incomplets 24 h ; scratch terminé immédiatement avec sweep de secours ; logs techniques minimaux 30 jours ; originaux conservés tant que projet actif ; rendus secondaires selon politique workspace ; purge projet dans une fenêtre annoncée après tombstone. Les backups ont leur propre expiration documentée. Partages révoqués immédiatement côté app, accès Storage restant borné par signature courte.

Pas de garantie RGPD automatique par le seul hébergement européen : politique de suppression/compte commun, sous-traitants, consentements éventuels, rétention, droits sur musique/fontes et licences du build doivent être validés avant commercialisation. Aucune publication sociale automatique ni entraînement sur données utilisateurs.

## Conditions de GO release

- Aucun P0/P1, Auth/RLS et scénarios réels réussis, UI mobile utilisable.
- Preuve de rollback et restore DB/objets ; droits minimaux et révocation des accès testés.
- Capacité fichier/projet annoncée prouvée, budget pilote fixé et métriques visibles.
- Projet/domaine/ledger cibles confirmés et autorisation explicite de déploiement.

État actuel : **NON DÉPLOYÉ ; conditions non vérifiées en environnement distant**.
