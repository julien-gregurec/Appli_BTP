# ELSATIA Studio — Contrat montage v1

## Frontière

Lot D produit des données, sans rendu ni MP4. Le moteur pur `buildTimeline` vit dans `packages/studio-domain/src/timeline.ts`, sans Next, Supabase, Storage ou dépendance Gestion Pro. L’entrée suit **l’ordre des références du projet** ; le tri chronologique reste une action explicite du Lot C. Seuls les médias ready et non supprimés sont utilisés. L’exclusion des autres médias est comptée et affichée ; une entrée sans média exploitable échoue avec le message demandé.

## Modèle et source d’autorité

`studio_timelines` conserve workspace/projet, version, révision d’édition, statut generated/modified, format, cible, durée réelle, version du moteur, compteur d’exclusions, auteur et dates. `studio_timeline_clips` conserve les sources, ordre, intervalles, transformations, volume, mouvements et transitions. Les colonnes relationnelles sont la source canonique ; il n’existe pas de seconde copie modifiable du manifeste. `studio_get_timeline` produit le document complet en **une requête SQL**, au même snapshot de lecture.

Le projet porte `active_timeline_id`, protégé par une FK composite workspace/projet, et un compteur monotone de versions. Régénérer crée une version distincte et l’active. Activer une ancienne version ne la régénère pas. Supprimer une version ne réutilise pas son numéro. Une édition est explicite, incrémente revision et conserve le numéro de version. L’historique des générations est conservé, pas chaque frappe manuelle. Un futur rendu devra fixer un snapshot immuable avec cette révision avant admission : aucun rendu n’existe dans D.

Les mutations sont atomiques : verrou workspace/projet existant, contrôles de révision projet et montage, validation de toutes les références et insert batch. Une erreur annule la totalité, y compris le compteur et le remplacement des clips. Les UUID des clips existants sont conservés pendant l’édition ; un ajout obtient un nouvel UUID. Le moteur pur ne crée ni UUID ni date : son résultat est structurellement identique à entrée identique.

## Temps et allocation

**Millisecondes entières, intervalles demi-ouverts `[start,end)`, sans chevauchement.** `end-start=duration`, premier start=0, start suivant=end précédent, total=somme des durées. Les transitions sont comprises dans la durée des clips ; aucune soustraction ni ajout de durée. Cette convention remplace, pour D, la proposition initiale en frames avec chevauchement. Le renderer convertira chaque frontière absolue en frame du profil de sortie (par exemple arrondi à la frame la plus proche à 30 fps), plutôt que d’arrondir chaque durée indépendamment. Il n’ajuste pas la composition ni la cible. Si un clip positif en millisecondes devient un intervalle de zéro frame dans le profil choisi, l’admission du rendu doit refuser ce profil avec une erreur de durée insuffisante ; aucune suppression, répétition ou extension silencieuse de clip.

Automatique : photo 3 s, vidéo min(source,5 s). Cible explicite : 1–600 s, presets 15/30/60/90/120. Minimum photo 1 s, vidéo min(source,1 s) ; maximum automatique sous cible : photo 15 s, vidéo min(source,15 s). Allocation par remplissage uniforme des capacités restantes, reste entier attribué dans l’ordre du projet. Cible réalisable : exacte à la milliseconde. Sinon, clamp à la somme des minimums/maximums, tous les médias conservés et écart affiché. Exemple : cinq photos et deux vidéos de 2 s peuvent atteindre 60 s ; une photo seule ne peut atteindre automatiquement 120 s.

Édition photo : 1 ms–600 s. Vidéo : début entier ≥0, fin strictement après début et ≤durée source, durée=fin-début, maximum 600 s par clip édité. Pas de répétition automatique des vidéos courtes, de freeze pour allonger leur durée ni de modification automatique de vitesse. Génération depuis le début de la vidéo, playback_rate=1, volume=1 ; photo volume=0. Une transition devenue incompatible après une réduction de durée entraîne un refus explicite ; le serveur ne remplace pas le choix artistique silencieusement. Maximum technique : 1000 clips par montage ; le quota d’import Lot B reste inchangé à 100 médias par défaut. La mesure à 500 est une qualification du moteur, pas une augmentation implicite du quota d’upload.

## Images et contrat de transformation

Crop par défaut cover, contain réservé et accepté par le modèle. Le décodage applique l’orientation intrinsèque enregistrée par l’admission média ; rotation créative additionnelle=0. L’image orientée est placée dans le format du montage, centrée. Position normalisée de 0 à 1 dans la surface cible, origine haut/gauche. Pour contain, fond noir opaque. Pour cover, découpe selon le point de position normalisé. Scale=1, position_x/y=0.5 sont la transformation de base.

`metadata_json.motion` décrit scaleStart, scaleEnd, positionStart[x,y], positionEnd[x,y] et easing=linear. Interpolation linéaire sur toute la durée du clip, échelles multiplicatives à la taille cover/contain de base. Aucun choix artistique n’est laissé au renderer.

Cycle photo déterministe : zoom_in, pan_left, zoom_out, pan_right, pan_up, pan_down, static ; index incrémenté pour les photos seulement. Zoom : 1→1.1 ou 1.1→1, centre fixe. Pan : échelle constante 1.1, position de 0.45 à 0.55 sur l’axe concerné (sens inversé pour gauche/haut). Static : échelle 1, centre 0.5. La base compare le JSON à la forme canonique de l’animation ; valeurs libres/expressions de rendu interdites. Changer l’animation recalcule uniquement son mouvement. Réordonner/recalculer les positions ne modifie ni mouvement ni transition.

## Transitions incluses dans le clip entrant

`transition_in` porte l’effet ; `transition_out=cut` signifie aucune fin indépendante. `transition_duration_ms` appartient au clip entrant, entre 1 ms et la moitié de sa durée pour un effet, 0 pour cut. La génération utilise une famille cohérente : fade 500 ms ou moitié de la durée si plus court ; cut pour un clip de 1 ms. À t=0 du montage, la référence précédente est un fond noir opaque.

Les effets s’appliquent aux pixels du clip entrant après sa transformation/mouvement. Pendant la transition, sa source et son animation avancent normalement dès son début. La référence de sortie est **l’image finale figée du clip précédent**, calculée juste avant sa frontière de fin, sans prolonger sa source ni son audio. Après la transition, seul le clip entrant est visible. Progression linéaire u=t/durée :

- cut : passage immédiat au clip entrant.
- fade : première moitié référence précédente→noir, seconde moitié noir→entrant ; opacités linéaires.
- dissolve : mélange précédent*(1-u)+entrant*u.
- slide_left : précédent translaté de 0 à -largeur ; entrant de +largeur à 0, sans étirement.
- slide_right : sens inverse du précédent.
- zoom : entrant centré, échelle d’effet 1.1→1, opacité 0→1 sur le précédent fixe.

L’audio original suit strictement l’intervalle du clip vidéo à son volume enregistré, sans chevauchement ni crossfade audio. Pas de musique ou mixage dans ce lot. Ces sémantiques sont un contrat de composition future, pas une prétention à un rendu déjà testé.

## Permissions et disponibilité

SELECT par RLS, uniquement membres du workspace et projets non supprimés. Viewer lit seulement. Owner/admin/editor génèrent, éditent, ajoutent/retirent/réordonnent et activent. Suppression de version owner/admin seulement. Projet archivé : lecture seule. Aucun DML direct authenticated, aucun accès anon/service_role aux nouvelles mutations. RPC SECURITY DEFINER bornées, search_path vide, auth.uid et verrou partagés ; lecture complète SECURITY INVOKER sous RLS. Les références clip→montage et clip→asset portent le workspace ; les mutations exigent en plus le lien actuel asset/projet et l’état ready. Impossible de signer un média arbitraire depuis le montage : les aperçus utilisent le contrôle existant Lot B.

Retirer un clip ne touche aucun média, référence projet ou objet Storage. Un asset peut apparaître plusieurs fois. Retirer un média du projet conserve le montage historique mais rend son clip indisponible ; aucune nouvelle preview possible. Le montage n’empêche pas la suppression/purge demandée dans B/C et ne recrée pas de référence. Toute sauvegarde revalide les sources restantes. S’il reste plusieurs sources indisponibles, régénérer un montage depuis les médias actuels permet de repartir d’un ensemble valide. Un futur renderer doit refuser les sources absentes/non ready et les projets supprimés, jamais substituer un autre média ni inventer un segment.

## Services et API

`/api/timelines/{projectId}` : GET montage actif + versions ; POST actions generate/edit/order/remove/add/activate/delete. Origin contrôlée, commandes ≤64 Kio, IDs et champs validés, cookies serveur existants, cache privé no-store. Les clips complets ne sont pas envoyés depuis le navigateur pour une édition : il transmet une commande bornée et une révision. La route ne manipule aucun octet média.

Services : generateStudioTimeline, getActiveStudioTimeline, getStudioTimeline, listStudioTimelines, updateTimelineClip, reorderTimelineClips, removeTimelineClip, addTimelineClip, setActiveTimeline, deleteStudioTimeline. La base refait l’autorisation même en accès RPC direct. Les erreurs réseau restent 503, les refus 403/404 et les révisions concurrentes 409. Aucun retry métier masquant un échec.

## Validation et suite

Tests unitaires du moteur, répétition dix fois, cibles exactes, sources bornées, édition et calcul 500 médias ; SQL de sécurité/contraintes et E2E réels avec Storage signé. Le rapport Lot D contient les résultats exécutés. Preview limitée aux originaux à la demande et à la liste visuelle : pas de slideshow simulant un export. Aucun worker, FFmpeg, Remotion ou RenderJob introduit. Lot E requiert une nouvelle instruction.
