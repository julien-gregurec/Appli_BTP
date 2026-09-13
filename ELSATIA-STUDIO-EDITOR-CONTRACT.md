# ELSATIA Studio — Contrat Editor v1

## Domaine et interface

Lot G édite le document canonique D/F. `packages/studio-domain/src/editor.ts` contient les commandes pures, leur validation et l'historique de session. Aucun modèle de composition parallèle, moteur vidéo navigateur exporteur ou résolution implicite de template. Les générations restent des versions ; les éditions incrémentent leur révision et passent au statut `modified`.

Route autonome `/projects/[projectId]/editor`. Preview, timeline horizontale, inspecteur d'un seul clip. Le Viewer voit les propriétés désactivées, la lecture et les sorties privées. Owner/admin/editor modifient les projets actifs. Le projet archivé demeure en lecture seule. Le backend et la base recontrôlent les droits.

Commandes : déplacement, ajout avant/après/fin, occurrences multiples, duplication, retrait du montage seulement, remplacement de source, durée, trim, volume/mute, crop, mouvement, transition, overlays et logo temporaire. La commande de remplacement préserve les choix compatibles ; une vidéo limite la durée au disponible et repart de zéro. Une transition devenue trop longue provoque un refus explicite. Aucun asset ni objet Storage n'est supprimé par ces commandes.

Durées entières en ms ; la sémantique séquentielle et les transitions entrantes D sont inchangées. Slider photo 0,5–15 s (étendu pour une durée existante supérieure), champ jusqu'à 600 s conformément à D. Trim dans la durée source ; vitesse 1 seulement. Volume 0/25/50/75/100 %, mute réversible ; le volume antérieur au mute est mémorisé pendant la session, puis 100 % sert de défaut après rechargement. Cover/contain ; pas de repositionnement libre, lock ou fit-to-target dans G.

Les écrans intro/outro sont les clips `card` F. Leur durée et leurs textes se modifient dans l'inspecteur ; un fond se remplace par le sélecteur des médias. Titre, sous-titre, lieu/date et coordonnées sont des overlays éditables/ajoutables. Le logo reste un PNG/JPEG ready du projet, sans Brand Kit.

Les chapitres sont des overlays ordinaires, attachés à une clé stable de clip : ajout, renommage, suppression et déplacement par clip. Sept presets combinent position verticale et alignement existants ; cinq rôles typographiques, pas de fontes utilisateur. La visibilité conserve facultativement `hidden_text` avec `text=""` : le renderer existant ne dessine aucune ligne, et l'éditeur peut restaurer le texte après rechargement. Texte et copie cachée sont bornés à 500 caractères. Éditer un texte conserve son ordre de composition. Un montage libre obtient une présentation minimale explicite uniquement lorsque l'utilisateur ajoute son premier texte.

## Undo, autosave et conflits

Historique local de 40 documents, sans blobs ni URLs signées. Undo/Redo couvre toutes les commandes ; les générations antérieures restent activables depuis l'historique ou le projet. Changer de template reste le parcours F avec avertissement et nouvelle version. Une sauvegarde ne réapplique aucun preset.

Autosave trailing de 600 ms, une seule écriture en vol. Les modifications faites pendant cette requête restent locales et déclenchent ensuite la sauvegarde suivante avec la révision acquittée. L'accusé de réception ne remplace jamais le document local. L'indication `Enregistré` exige l'égalité avec le contenu effectivement acquitté ; elle disparaît dès le premier rendu React d'une modification.

POST `/api/timelines/{projectId}`, action `saveEditor`, UUID de timeline, révision attendue et document clips/présentation. Corps borné à 2 Mio pour 500–1000 clips, comme la limite SQL ; les autres commandes conservent 64 Kio. Parsing explicite des types, IDs, temps, sources, transformations fixes, effets et présentation. Les valeurs autoritaires du projet, workspace, auteur et version ne viennent pas du navigateur.

Migration additive `20260913030000_studio_editor_transactions.sql` :

- `studio_save_editor` reprend le verrou workspace/projet, exige la timeline active attendue, appelle la sauvegarde D/F et retourne le document exact dans la même transaction.
- `studio_request_editor_render` vérifie sous ce même verrou la timeline active et sa révision, puis appelle l'admission E/F avec snapshot, idempotence et retry existants.

Les deux fonctions sont réservées à `authenticated`, sans EXECUTE public/anon/service_role. Le verrou existant impose les rôles et l'état du projet. Aucune table ni politique RLS historique modifiée. Le rollback local retire uniquement ces fonctions et le ledger G, sans supprimer de données ; rollback applicatif requis en même temps.

Conflit HTTP 409 : aucune écriture forcée, aucun retry automatique ; modifications conservées à l'écran, message de rechargement. Panne réseau : état erreur explicite, document conservé, bouton Réessayer. Si la réponse a été perdue après commit, seule une relecture privée strictement équivalente permet de reconnaître la réussite. Les horodatages techniques de lignes ne participent pas à cette équivalence ; les paramètres artistiques et clés stables y participent. Les départs par lien sont bloqués pendant une sauvegarde non acquittée et le navigateur reçoit `beforeunload`. Aucun cache de brouillon persistant inter-session ni collaboration temps réel promis.

## Preview et rendu

L'aperçu de travail interprète la timeline pour l'ordre, les trims, le son, le mouvement et les textes, avec tête de lecture, play/pause et scrub global. Un seul original courant est monté ; aucune précharge de toutes les vidéos. Lecture via signature privée B, renouvellement manuel en cas d'expiration, erreur explicite pour un média absent. Les petites miniatures des médias visités sont générées au navigateur et mémorisées pour 32 assets maximum ; les autres blocs portent un placeholder stable. Une extraction canvas refusée par le navigateur conserve le placeholder.

Le navigateur ne promet pas l'identité pixel avec FFmpeg : transitions, fontes exactes et logo se vérifient via **Générer un aperçu fidèle**, qui lance le renderer E en demi-résolution. C'est le même pipeline privé, les mêmes clips et la même admission atomique ; aucun renderer métier supplémentaire. La sortie reste une vraie vidéo. Créer la vidéo utilise le profil E standard (1080 en exploitation ; profil interne réduit dans les tests locaux).

Les rendus indiquent leur timeline/révision d'entrée, avec métadonnées projet sous RLS. Aucun snapshot média complet n'est envoyé dans le polling ; seules ses références de version sont projetées. Une modification locale, un rendu ancien ou une autre version active affiche `La vidéo doit être régénérée pour inclure vos dernières modifications.` Les boutons de création sont désactivés tant que la sauvegarde n'est pas acquittée. Le SQL refuse un changement de version entre sauvegarde et admission. Les anciens exports restent privés et explicitement anciens.

## Responsive, accessibilité et performance

Desktop : preview et inspecteur côte à côte. Mobile : preview, timeline à défilement horizontal, inspecteur vertical borné, puis rendu. Tablette portrait/paysage. Boutons gauche/droite alternatifs au drag/drop, noms accessibles explicites, focus visible, valeurs des sliders, erreurs et statuts annoncés. Space lit/pause ; Ctrl/Cmd+Z et Shift+Z annulent/rétablissent ; Alt+flèches déplacent ; Delete/Backspace demande confirmation. Les champs et éléments interactifs gardent leurs raccourcis natifs.

La timeline rend au plus 18 cellules légères avec overscan, indépendamment des 500/1000 clips du document. Sélection distante par numéro, inspecteur unique, cache de miniatures borné ; pas de 500 vidéos dans le DOM. L'historique contient au plus 40 snapshots de données. Les mesures exécutées, captures, rendus, incidents et limitations de qualification sont consignés au rapport G.

## Limites

Pas de musique, IA, nouveau moteur de rendu, position libre, vitesse, bibliothèque de fontes, Brand Kit complet ou Lot H. Preview browser approximative explicitement distinguée du MP4 fidèle. Safari/iPhone physique, Linux Production, quotas et capacité distants restent à qualifier. Les limitations Storage, credentials serveur, codecs et délais des signatures B/E/F restent applicables. Aucune migration distante, aucun déploiement, aucune fusion.
