# ELSATIA Studio — Contrat de rendu v1

## Décision avant implémentation — 13 septembre 2026

FFmpeg seul, orchestré en TypeScript dans `workers/studio-video`, conformément au Master Plan. Remotion simplifierait des compositions React et du texte élaboré mais ajouterait Chromium, un runtime et une qualification de licence sans bénéfice pour les effets du Lot D. Remotion + FFmpeg et un pipeline hybride restent possibles pour un futur lot ; aucun de ces besoins supplémentaires n'est présent dans E.

Composition séquentielle par clips, source privée téléchargée en streaming, normalisation locale, transition depuis la dernière image figée du clip précédent, assemblage final H.264/yuv420p + AAC stéréo 48 kHz, 30 fps. Silence AAC lorsque la source n'a pas d'audio. Les frontières absolues en ms sont arrondies en frames ; zéro frame est refusé. Les transitions occupent le début du clip entrant, sans overlap temporel supplémentaire. Aucun choix artistique ni modification de timeline dans le renderer.

## Architecture retenue

Next autorise et prévalide les objets, puis transaction DB : snapshot immuable, RenderJob et outbox. Le dispatcher séparé alimente BullMQ/Redis dédié avec l'UUID du job, jamais les credentials ou les médias. PostgreSQL reste autoritaire. Le worker revendique une lease atomique avec jeton ; heartbeat, progression monotone et publication conditionnée au jeton. Une seule sortie par job. Redis peut être reconstruit depuis les jobs queued de l'outbox. Aucun rendu dans Next.

Bucket `studio-renders` privé, capacités de lecture 60 s après contrôle utilisateur/projet/output. Clés générées côté serveur sous `studio/{workspace}/{project}/renders/{job}/`. Les tentatives utilisent un sous-chemin de lease pour empêcher un ancien worker d'écraser la sortie courante. RLS SELECT membre ; mutations par RPC ; viewer ne lance ni n'annule. Origin contrôlée sur API.

Retry automatique métier : zéro ; une lease expirée échoue explicitement. Retry manuel crée un nouveau job lié à l'échec, revalidant la timeline active courante. Annulation persistante, arrêt FFmpeg, nettoyage scratch sur toutes les sorties. Publication refusée après annulation, révocation du demandeur ou suppression du projet. Les binaires reçoivent des fichiers locaux et une allowlist de protocoles, un environnement sans credentials et aucun shell.

Profils standard : 1080×1920,1920×1080,1080×1080,1080×1350 ; preview interne à demi-résolution, dimensions paires. Concurrence locale 1, threads FFmpeg 2, timeout 10 min configurable, taille des téléchargements et scratch bornée. Pas de HEVC/HDR annoncé, musique globale, IA, templates ou Lot F.

Références primaires : [filtres FFmpeg](https://ffmpeg.org/ffmpeg-filters.html), [jobs idempotents BullMQ](https://docs.bullmq.io/patterns/idempotent-jobs), [identifiants BullMQ](https://docs.bullmq.io/guide/jobs/job-ids), [stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs). Les résultats de qualification et versions exactes seront consignés dans le rapport Lot E.

## Mapping du contrat D

Les intervalles sont séquentiels et semi-ouverts. `round(ms × 30 / 1000)` convertit les frontières absolues ; la différence donne le nombre de frames. Un clip arrondi à zéro frame est refusé. Aucun overlap ajouté à la durée totale. Un découpage vidéo utilise `source_start_ms/source_end_ms` et les limites mesurées par ffprobe. Playback 1, rotation 0, scale de base 1 et position de base au centre sont les valeurs actuellement autorisées par D ; les valeurs futures ne sont pas silencieusement ignorées, elles sont refusées. La rotation déclarée par le conteneur vidéo est appliquée par le décodage FFmpeg.

`cover` conserve le ratio puis recadre ; `contain` conserve le ratio avec fond noir. Le mouvement D `scaleStart/End`, `positionStart/End` est interpolé linéairement avec la progression du clip, pour static/zoom_in/zoom_out/pan_left/pan_right/pan_up/pan_down. Le renderer ne choisit pas une nouvelle animation.

| Transition | Composition pendant la durée D |
| --- | --- |
| cut | Le clip entrant commence immédiatement. |
| fade | Première moitié : ancienne image vers noir ; seconde : noir vers entrant, interpolation linéaire explicite. |
| dissolve | Mélange linéaire ancien/entrant. |
| slide_left/right | Déplacement horizontal dans la direction D. |
| zoom | Entrant 1,1→1 pendant la transition, avec fondu. |

Le premier clip utilise le noir comme référence s'il a une transition. L'audio appartient au clip courant seulement : trim, volume 0–1, silence pour photo/vidéo sans son. Aucun mélange audio inter-clip ou musique globale. Intermédiaires Matroska avec PCM pour éviter l'accumulation de padding AAC ; assemblage final MP4 H.264 CRF 20, preset ultrafast, yuv420p, 30 fps, AAC stéréo 48 kHz, faststart. Le champ DB `bitrate=8000000` est préparatoire ; l'encodeur utilise une qualité CRF, sans promettre un débit constant de 8 Mb/s.

## Contrôle, état et idempotence

API `/api/renders/{projectId}`, session Supabase vérifiée et appartenance RLS. POST de 4 Kio maximum, origine identique, UUID validés. Le client ne fournit ni storage_key, ni snapshot arbitraire, ni credential privilégiée. La requête porte un UUID idempotent ; même UUID et mêmes paramètres renvoient le même job, une réutilisation incohérente est refusée. Next vérifie l'existence Storage, puis SQL relit sous verrou la timeline active et les références ready. Le snapshot reste inchangé si le montage est ensuite édité.

`queued → preparing → rendering → encoding → uploading → completed`, ou failed/cancelled. `status` porte aussi l'étape ; la progression est approximative et monotone (1–99, puis 100 à publication). Heartbeat toutes les secondes, expiration après 60 s. Les opérations critiques partagent le verrou workspace/projet et recontrôlent les droits du demandeur. Les appels SDK du worker ont une limite de 15 s, le job une deadline de 600 s par défaut. Les anciens workers ne peuvent ni reprendre une lease expirée ni publier.

Retry automatique : aucun. Retry manuel : maximum trois descendants d'une tentative initiale, nouveau job et nouvelle admission du montage actif ; sources toujours manquantes ou permissions refusées bloquent cette admission. Une annulation queued est immédiate ; en cours, le heartbeat arrête FFmpeg et la publication. Après une réponse réseau de finalisation perdue, la sortie n'est supprimée que si la DB confirme la même lease failed/cancelled ; en cas d'incertitude, la réconciliation s'en charge ultérieurement.

## Sécurité et ressources

Originaux dans `studio-originals`, sorties dans `studio-renders`, tous privés. Clé finale exacte : `studio/{workspace}/{project}/renders/{job}/{lease}/output.mp4`. La FK composite conserve le tenant. RLS SELECT membre du projet, mutations jobs/outputs uniquement via RPC autorisées. Les RPC de claim/progression/publication sont service_role uniquement. Owner/admin/editor rendent et annulent ; viewer lit, preview et télécharge. Toute signature recherche un output autorisé par UUID, avec expiration 60 s. Une capacité déjà délivrée reste valable jusqu'à son expiration.

Worker concurrence 1, FFmpeg 2 threads, filtre 1 thread ; autres instances à coordonner avant mise en ligne. Durée maximale 600 s, téléchargements cumulés ≤5 Gio, scratch ≤10 Gio contrôlé chaque seconde, output ≤1 Gio ; RSS FFmpeg échantillonné et arrêté au-delà de 1,5 Gio. Le plafond RSS est une protection approximative, pas un cgroup. Scratch privé par job/lease et fichiers 0600, médias streamés, jamais de base64/blobs PostgreSQL. Décodage local sans shell, protocoles file/pipe, ffprobe limité à 10 s, dimensions ≤100 MP et 16 384 pixels par axe. Credentials retirées de l'environnement des processus FFmpeg/ffprobe.

Codes publics : ASSET_MISSING, ASSET_UNREADABLE, UNSUPPORTED_CODEC, TIMELINE_INVALID, STORAGE_DOWNLOAD_FAILED, RENDER_FAILED, ENCODE_FAILED, STORAGE_UPLOAD_FAILED, CANCELLED, WORKER_LOST, RENDER_TIMEOUT, RESOURCE_LIMIT. Pas de stack brute dans l'UI. Les diagnostics détaillés optionnels sont réservés à l'exploitation locale.

## Nettoyage et limites

Success/failure/cancellation nettoient le scratch dans `finally`. Une coupure de processus/hôte peut laisser un dossier ou un objet non référencé : `workers/studio-video/src/reconcile.ts` inspecte en dry run, puis `--apply` efface les déchets vieux d'une heure en conservant les leases actives et outputs publiés. Réconciliation locale uniquement, bornée, sans cron. Les jobs failed/cancelled restent comme historique ; pas de purge automatique d'un export valide ni de rétention cachée des originaux.

Formats décodés V1 : JPEG/PNG/WEBP statiques, MP4/MOV H.264. HEVC, HDR, 4K, animation WEBP/GIF, musique, texte, templates et rendu distribué ne sont pas qualifiés. Le worker local utilise les binaires fournis par les packages verrouillés ; les versions natives et mesures figurent au rapport. Une mise en Production devra qualifier des binaires maintenus, le packaging Linux, les quotas/admissions, l'observabilité, la credential serveur et la capacité disque. Aucune de ces opérations distantes n'est réalisée dans E.
