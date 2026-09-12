# ELSATIA Studio V1 — Plan de tests

Statut au 12 septembre 2026 : **plan uniquement**. Aucun test ni fixture Studio créé/exécuté. Contrôles réellement exécutés pendant l’audit : inventaire des migrations (252 noms uniques) et `git diff --check`. Les résultats historiques ELSATIA ne constituent pas une recette Studio.

## 1. Environnements et fixtures

Utiliser Supabase/PostgreSQL local jetable, Storage privé de test, Redis dédié, worker Linux figé et serveur Studio. Les tests refusent une URL hors loopback ou de l’environnement CI allowlisté ; aucun `.env.local` de Production importé. Comptes synthétiques : workspace personnel A, professionnel B, utilisateur multi-workspace, owner/admin/editor/viewer, membre révoqué, utilisateur extérieur et admin plateforme sans accès métier.

Fixtures générées à la demande par scripts déterministes versionnés, sans photos de personnes :

- 3 photos minuscules distinctes (motifs/colorimétrie), dont une paire avant/après ; variante sombre/floue et doublon/quasi-doublon.
- 2 vidéos courtes, l’une avec audio synthétique, l’autre silencieuse ; variantes rotation, VFR, portrait/paysage et codec refusé/corruption pour robustesse.
- 1 WAV de test synthétisé par le script, original et réutilisable, avec origine/licence indiquées ; aucun morceau tiers.
- Logo PNG transparent minuscule ; titre accentué, texte long, caractères spéciaux.
- EXIF/date vidéo déterministes et fixtures sans date. Les jeux Strasbourg/Croatie sont produits à partir de motifs variés avec dates/labels distincts, pas de gros fichiers commités.

Un test volumétrique séparé génère un fichier proche de 1 Go et un projet de plusieurs Go hors dépôt, uniquement dans un environnement avec budget disque/réseau explicite. Les tests rapides ne peuvent prouver cette capacité.

## 2. Matrice de validation

| Domaine | Tests unitaires | Tests intégration / sécurité | E2E attendu |
|---|---|---|---|
| Auth | Redirections, rôles, onboarding idempotent | Compte sans entreprise, compte existant, révocation effective, JWT falsifié | Inscription/confirmation/connexion/récupération dans Studio |
| Projet | Validation nom/type/format/durée | CRUD et FKs tenant, dernier owner, concurrence revision | Créer, modifier, dupliquer, renommer, supprimer ; retour dashboard |
| Upload | MIME/taille/nom/métadonnées | Token mauvais tenant/expiré, taille falsifiée, fichier interdit/corrompu, finalisation dupliquée, somme quotas atomique | Image + vidéo, erreur affichée, retry sans perdre les fichiers valides |
| Reprise | Machine d’état UploadSession | TUS interrompu, token renouvelé après contrôle, upload abandonné nettoyé | Coupure réseau et reprise ; resélection mobile si requise |
| Analyse | EXIF manquant/malformé/fuseau, tri stable, score heuristique | Décodage borné, photos immenses, rotation/HDR/HEVC selon capacités | Suggestions explicables, conserver/exclure volontairement, aucun média supprimé |
| Timeline | Ordre, frames, recouvrements, overrides, minimums, clips trop courts | Manifeste validé et figé, assets ready seulement, projections atomiques | Génération, modification ordre/durée, régénération cohérente |
| Worker | États autorisés, erreurs classifiées, compilation allowlist | Vrai FFmpeg, échec, retry, crash, stale lease, jobs dupliqués, Redis perdu | 202/jobId, progression, completed/failed/cancelled, retry manuel |
| Audio | Gain/mute/fade/trim/loop, silence | Source sans audio, décodage invalide, durée exacte, clipping/normalisation | Import musique, son original activé/coupé, nouveau rendu |
| Templates | Six configs + neuf styles validés | Polices intégrées, crop/letterbox, transitions et marges | Titre, chapitres, logo, outro corrects sur 4 ratios |
| Export | Profil, nom téléchargement, watermark | ffprobe, checksum, MIME HTTP, Range, accès tenant, cache | Vrai MP4 prévisualisé et téléchargé, qualité 720/1080 |
| Partage | Hash/expiration/révocation | Token absent/faux/expiré, aucun accès originaux, URL courte | Ouvrir le seul rendu partagé puis révoquer ; expiration de la dernière URL testée |
| Suppression | Références et tombstones | Job concurrent, scratch/orphelins, compte commun préservé | Supprimer projet puis impossibilité de lire/relancer ses rendus |
| Coûts | Reservations/settlement/unicité event | Courses quota, retry sans double usage, échec libérant réservation | Dashboard espace/minutes/rendus cohérent avec ledger |
| IA | Fallback et validation suggestions | Timeout, fournisseur indisponible, payload hostile | Vidéo exportable avec IA totalement désactivée |

Tests de timeline par propriétés : aucun temps négatif/NaN, `end-start=duration`, media in/out dans les bornes, durée finale au frame près, ordre stable à égalité de dates, transition ≤ segments voisins, texte/logo à l’intérieur du rendu. Un input identique produit un hash de manifeste identique. Les overrides impossibles provoquent une erreur utilisable plutôt qu’un montage tronqué silencieusement.

## 3. Scénario obligatoire — Chantier Strasbourg

1. Inscrire un utilisateur de test, créer son workspace, projet **Chantier Strasbourg**.
2. Importer **10 photos + 3 vidéos** par le vrai chemin signé ; attendre leur analyse/état ready. Attribuer phases avant/travaux/résultat, sans prétendre à une classification sémantique démontrée.
3. Choisir **Chantier Pro**, **9:16**, **60 secondes**, qualité **1080**.
4. Ajouter titre accentué, logo PNG et musique synthétique ; renseigner entreprise/contact ; générer.
5. Vérifier création réelle du RenderJob, snapshot et outbox, puis worker/encoding/completed ; la route Next doit répondre avant la fin du rendu.
6. Télécharger le MP4 : container MP4, vidéo H.264, audio AAC, **1080×1920**, **1 800 frames à 30 fps**, durée visuelle à ±1 frame (tolérance distincte documentée pour padding AAC), fichier non vide, checksum égal à l’output.
7. Décoder images du début, des phases et de la fin ; contrôler titre/logo/outro, absence de frame noire inattendue, intégrité des transitions ; écouter la musique et ses fades.
8. Réordonner deux médias d’une même phase, modifier durée/texte, remplacer une photo et changer la couverture ; lancer un second rendu. Vérifier nouveau hash/version et ancien rendu toujours consultable comme version précédente.
9. Prévisualiser, télécharger, créer/révoquer le lien ; vérifier l’accès par un utilisateur d’un autre workspace refusé.

Preuves à conserver : rapport Playwright, identifiants synthétiques job/timeline, manifest hash, ffprobe JSON, checksum et captures de frames. Aucun mock du Storage, de la queue ou de FFmpeg sur ce scénario.

## 4. Scénario obligatoire — Vacances Croatie 2026

1. Créer **Vacances Croatie 2026**, importer **20 photos + 5 vidéos**, dans un ordre volontairement différent des dates.
2. Répartir les dates explicites sur plusieurs journées ; inclure un média sans date et un avec timezone connu ; afficher le fallback/provenance sans inventer un lieu.
3. Choisir template **Voyage**, **9:16**, **90 secondes**, 1080 ; option chapitres par journée.
4. Générer réellement. Vérifier que les dates disponibles pilotent le tri stable, que le fallback est documenté et que l’utilisateur peut le corriger.
5. Télécharger un MP4 H.264/AAC **1080×1920**, **2 700 frames à 30 fps**, durée visuelle ±1 frame. Vérifier début/fin des journées, légendes et absence de séquence vide.
6. Couper le fournisseur IA avant un nouveau rendu : le parcours reste fonctionnel.

## 5. Pannes et courses obligatoires

- Worker arrêté pendant rendering : lease expire, reprise bornée, une seule sortie publiée, un seul débit de consommation.
- Redis indisponible après commit SQL : job reste visible et queued ; outbox renvoyée à la reprise.
- Redis perd ses données : reconstruction des jobs non terminaux depuis PostgreSQL, sans duplication.
- Fichier remplacé après signature ou faux MIME/extension : rejet avant rendu, aucune ouverture de protocole réseau par FFmpeg.
- Sortie Storage en échec : pas de completed prématuré ; retry cohérent avec scratch et objets partiels.
- Annulation pendant queued puis encoding ; conflit annulation/fin ; projet supprimé pendant rendu ; ancien worker incapable de publier.
- Quota atteint par deux uploads/jobs concurrents : transaction réserve sans dépasser la limite.
- Retry manuel après erreur permanente corrigée : nouvel input/snapshot explicite ; aucune boucle infinie.

## 6. Performance, CI et acceptation

Mesurer wall time, CPU secondes, RSS pic, scratch pic, octets transférés et temps d’attente pour 15/30/60/90/120 s et 100 médias, aux quatre ratios. Tester 720/1080, concurrence 1 puis 2, navigateur desktop et Safari mobile. Valeurs cibles provisoires à qualifier : API admission p95 < 2 s hors upload, réponse annulation visible < 5 s, pas de croissance mémoire non bornée. **Aucun engagement de rendu « en temps réel » avant benchmark.**

CI proposée : jobs séparés domaine/unitaires, frontend type/lint/build, DB fraîche + upgrade simulé + pgTAP, worker réel sur fixtures courtes, E2E intégrés. Les deux longs scénarios obligatoires s’exécutent sur environnement isolé avant release avec timeout adapté et rapport d’erreur, sans retry masquant un défaut. Les tests ELSATIA existants sont requis si un package commun ou une migration partagée change.

Gate V1 : tous les parcours critiques et matrices de rôles réussis, vrais MP4 des deux scénarios inspectés, rollback et restauration éprouvés, capacité/fournisseur documentés, aucun P0/P1 ouvert. État présent : **NON EXÉCUTÉ / NON VALIDÉ**.
