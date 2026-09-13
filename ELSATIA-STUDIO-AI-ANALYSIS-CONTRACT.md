# ELSATIA Studio — contrat d’analyse média, Lot H

## Architecture et activation

`STUDIO_AI_ANALYSIS=0` par défaut. L’application et le worker acceptent `1` ou `true` pour activer l’analyse. OFF masque les recommandations, refuse leur lancement et conserve import, templates, timeline, éditeur et rendu. Le worker OFF sort avant toute connexion. Le moteur `buildTimeline()` reste pur, sans appel IA.

La base est la source des jobs et du cache ; BullMQ transporte leurs identifiants dans la queue séparée `studio-analysis-media-v1`. Le worker de rendu reste séparé. POST authentifié et same-origin → RPC d’admission → pending → claim avec lease → analyzing → completed/failed/skipped. La requête Next.js ne télécharge ni ne décode le média. Les originaux privés sont lus en streaming vers un répertoire temporaire du worker, puis hachés et décodés localement.

Installer dans le runtime du worker (Python 3.9–3.12, CI 3.11) :

```sh
python3 -m venv /chemin/prive/studio-vision
/chemin/prive/studio-vision/bin/pip install -r workers/studio-video/analysis/requirements.txt
# Dans workers/studio-video, avec l’environnement serveur déjà chargé :
STUDIO_AI_ANALYSIS=1 STUDIO_ANALYSIS_PYTHON=/chemin/prive/studio-vision/bin/python npm run start:analysis
```

Variables serveur : `NEXT_PUBLIC_SUPABASE_URL`, `STUDIO_STORAGE_SERVICE_KEY`, `STUDIO_REDIS_URL`, `STUDIO_ANALYSIS_PYTHON`. Les chemins FFmpeg/ffprobe existants sont réutilisés. `STUDIO_ANALYSIS_CONCURRENCY` vaut 1, plafonnée à 2 ; timeout 120 s, borné à 10–600 s. `STUDIO_ANALYSIS_TMP` doit pointer vers un disque privé dimensionné pour deux originaux (jusqu’à 1 Gio chacun), hors répertoire public. Le worker doit être supervisé comme le worker E. Aucun lancement en Production n’est effectué par ce lot.

## Providers et vie privée

`StudioAIProvider` expose analyzeImage/analyzeVideo. Ranking, grouping et ordre sont des fonctions déterministes de domaine. `local-opencv` est le provider disponible. OpenCV headless, CPU seul, une thread et OpenCL désactivé ; FFmpeg décode une image ou cinq frames vidéo dans une boîte de 512 px. [OpenCV documente son détecteur à cascades](https://docs.opencv.org/4.13.0/db/d28/tutorial_cascade_classifier.html) ; le [paquet headless inclut les cascades Haar](https://pypi.org/project/opencv-python-headless/).

Aucun fournisseur externe commercial, clé IA, description sémantique ou appel réseau IA n’est configuré. Le contrat prépare un provider futur ; seul un stub de panne, réservé à une API loopback, est utilisé pour qualification. Le local reste autoritaire ; un provider optionnel reçoit des chemins de petites frames, jamais l’original ni le GPS, et dispose d’un timeout de 3 s avec AbortSignal. Un provider qui ignore l’annulation n’empêche pas le fallback. Une intégration externe réelle exigera consentement, budget, tracking réel, minimisation et nouvelle qualification.

La cascade fournit un nombre approximatif de visages et le centre normalisé du plus grand visage, réservé à une future aide au cadrage. Aucun nom, identité, embedding, descripteur de visage ou base biométrique. Le renderer ne change pas le cadrage utilisateur. Les histogrammes globaux et dHash ne sont pas des empreintes biométriques. Ni EXIF supplémentaires ni GPS ne sont extraits/conservés par H. La fixture visage est publique et libre, issue de [scikit-image/NASA](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut), uniquement dans les tests.

## Données, permissions et cache

Migration `20260913040000_studio_media_analysis.sql` : une table, aucune modification des migrations historiques. Relation asset/workspace et projet/workspace par clés étrangères composites ; unicité `(asset_id, analysis_version)`. Version `media-v1`. Résultat JSON borné à 64 Kio, statut, erreurs génériques, lease, heartbeat, attempts, elapsed_ms, provider_calls et fallback. Les groupes sont calculés à partir du cache pour chaque bibliothèque : un asset peut être référencé dans plusieurs projets, il ne possède donc pas un groupe global figé.

RLS : membre et asset accessible pour lire ; owner/admin/editor du projet actif pour demander ou annuler ; viewer lecture seule. Aucune écriture directe authenticated/anon. Dispatch/claim/touch/finish réservés au service serveur, non exposés au client. Admission, claim et finish contrôlent droits et relations ; la lease empêche un ancien worker de publier. La RPC de lecture publique retire lease/heartbeat. L’API n’accepte aucune storage key arbitraire.

Une ouverture ne relance jamais l’analyse. Admission répétée conserve le résultat completed de même version ; relecture échouée ou skipped peut être demandée. Réanalyse completed explicite avec délai de 30 s. Nouvelle version = nouvelle entrée ; remplacement d’un original = nouvel asset immuable, donc nouvelle entrée. Suppression logique/physique de l’asset purge ses analyses ; une référence encore partagée suit la politique B/C existante. Annulation invalide la lease, le heartbeat arrête le worker. Une lease sans heartbeat depuis 60 s devient failed ; l’utilisateur peut réessayer. Aucune suppression automatique de média.

Les fichiers temporaires sont nettoyés en `finally` après succès/erreur/arrêt propre. Après SIGKILL ou panne disque, arrêter le worker puis supprimer uniquement ses anciens sous-répertoires de `STUDIO_ANALYSIS_TMP` après vérification de l’absence de jobs actifs ; ne jamais nettoyer le stockage original. Aucun cron nouveau. Le rollback local refuse une table non vide pour préserver les résultats ; il est testé sur une installation jetable, jamais appliqué au distant.

## Algorithmes `media-v1`

Mesures sur les frames réduites : variance du Laplacien (netteté), moyenne luminance 0–255, fractions <20 et >235, variance globale, dHash 64 bits, histogrammes BGR 8 bins par canal. Résolution basée sur les dimensions de la source fournies par ffprobe.

Avec `clamp` dans [0,100], `s` petit côté, `l` grand côté :

- Netteté = clamp(100 × ln(1 + variance Laplacien) / ln(501)). Warning indicatif si variance <60 ; un flou artistique reste accessible.
- Exposition = clamp(100 − abs(luminance−128)/1,28 − 40 × max(fraction sombre, fraction claire)).
- Résolution = clamp(100 × min(s/1080, l/1920)).
- Ratio = clamp(100 × min(1, 3s/l)).
- Qualité = arrondi(0,40 netteté + 0,35 exposition + 0,20 résolution + 0,05 ratio).

Très sombre : moyenne <35 ou fraction sombre >0,8 ; sombre <75 ; surexposée >225 ou fraction claire >0,8 ; claire >185 ; sinon normale. Résolution insuffisante si score <100 ; haute si ≥2160×3840. Classification indicatrice, pas une mesure scientifique de qualité perçue.

Doublons exacts : SHA-256 des octets complets, images et vidéos. Quasi-doublons : images seulement, distance de Hamming ≤6/64, histogramme normalisé L1 ≤0,12, différence de ratio ≤0,1 et variance ≥25 pour éviter les images uniformes. Groupement par représentant stable, pas fusion transitive de chaînes. Ces seuils ne garantissent pas la reconnaissance de tous les recadrages/rafales ; aucune suppression.

Le meilleur score du groupe reçoit unicité 100 ; les autres 15. Recommandation = 0,75 qualité + 0,25 unicité. Badges selon la qualité : Excellent ≥85, Recommandé ≥65, Correct ≥40, Faible qualité sinon ; autre membre du groupe = Doublon possible. Sans résultat courant, score provisoire 40 et média toujours utilisable. Pas de pertinence sémantique inventée.

Scènes photos : proximité de captured_at ≤30 min ET distance histogramme ≤0,2. Sans date fiable, pas d’événement inventé. Vidéos : frames à 0/25/50/75/95 % ; changement indicatif si distance entre histogrammes >0,25. Warning « À raccourcir » au-delà de 30 s. Pas de stabilisation, ni analyse de chaque frame, ni coupure automatique.

## Sélection et contrôle utilisateur

Budget : plancher((durée cible − intro − outro) / durée photo préférée du template), minimum 1. Sélection gloutonne par recommandation, pénalité de 12 par média de scène déjà retenue, un représentant par groupe de doublons. L’ordre proposé suit les dates fiables, puis l’ordre projet et l’ID stable. Même jeu + version = mêmes propositions, indépendamment de l’ordre des réponses SQL.

L’utilisateur choisit « Choisir les meilleurs médias », peut cocher/décocher, choisir ordre recommandé ou ordre du projet. La génération exige une confirmation explicite et crée une nouvelle version ; vérification de revision projet et de tous les IDs avant sauvegarde. Les anciens montages et tous les médias restent accessibles. Le template chronologique respecte l’ordre explicitement transmis par cette sélection. Avant/Après reste manuel, sans attribution métier inventée.

UI paginée par 24 recommandations, texte et badges compréhensibles sans couleur seule, polling pendant les jobs actifs uniquement. Pas de chargement de tous les originaux/miniatures. Le badge de l’éditeur G ne bloque aucune commande. « Continuer sans analyse » rejoint le parcours existant.

## Coût, limites et qualification

`ai_operations` = somme des tentatives conservées pour les assets du projet ; analyzed_assets = completed courants ; elapsed_ms = dernière tentative. Provider calls et coût externe = 0 avec le provider local ; ce ne sont pas un historique de facturation ni le coût CPU de l’hébergeur. Version/suppression peuvent retirer ces compteurs : un quota commercial futur nécessitera un ledger dédié.

Limites : Haar est approximatif (profils, occultations, petits visages peuvent être manqués), pas de classification sémantique indoor/outdoor ; histogrammes/scènes indicatifs ; vidéo échantillonnée seulement ; dimensions ffprobe peuvent représenter le raster encodé plutôt que la rotation de présentation. Pas de promesse de cadrage corrigé pour tous les MOV orientés. Les mesures de performance portent sur fixtures réduites ; temps réseau et longues vidéos diffèrent. Voir le rapport H pour les preuves et résultats réels.
