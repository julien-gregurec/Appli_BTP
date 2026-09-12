# ELSATIA Studio — Lot D Automatic Timeline

**Clôture : la [qualification finale D-bis](ELSATIA-STUDIO-V1-LOT-D-FINAL-QUALIFICATION.md) remplace le verdict ci-dessous et conclut GO.** Ce rapport conserve les preuves et incidents de la première campagne.

Qualification initiale des 12–13 septembre 2026. **Verdict : NO-GO de qualification**, malgré les quatre E2E Lot D verts. Le gate complet reste à 13/14 à cause du parcours Foundation perturbé par Auth 504 ; aucune autorisation de déploiement. Production et Supabase distant intouchés. Aucun Lot E.

## Scope et contrôle initial

Branche `feat/elsatia-studio-v1`, HEAD de départ `b2e6e293fa2cef9e6349ff98defce503794bf3a0`, remote autorisé `gh`. Les neuf documents demandés ont été lus et les sources A/B/C inspectées. Les guides Next installés Route Handlers et Server/Client Components ont été consultés avant modification.

Inventaire initial : 255 migrations, identifiants uniques ; dernière `20260912160000_studio_project_management.sql`. Identifiant libre choisi : **20260912230000**. Total final vérifié : **256**. Aucune migration historique modifiée. L’implantation autonome `apps/studio` et `packages/studio-domain` est conservée, sans dépendance Gestion Pro.

Les dix modifications suivies préexistantes sont conservées hors lot : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/{auth-session.spec.ts,helpers.ts,roles-and-direct-access.spec.ts,security.spec.ts}`, `tsconfig.json`. Les six audits non suivis et `tools/` restent hors commits. Référence d’empreintes antérieure : `/tmp/elsatia-studio-cbis/baseline.json`. État initial conforme à la clôture C-ter.

## Architecture et modèle

Moteur pur `buildTimeline`, version v1, sans hasard/horloge/UUID. Entrée : projet, médias ready dans l’ordre des références Lot C. Sortie : format et cible figés, durées, clips, sources bornées, mouvements explicites et transitions. L’ajout d’un clip autorise plusieurs occurrences d’un même asset.

Tables `studio_timelines` et `studio_timeline_clips`, colonnes projet `active_timeline_id` et `timeline_version_counter`. Source canonique relationnelle, lecture JSON transactionnelle par RPC ; pas de deuxième manifeste modifiable. Générations versionnées, compteur monotone même après suppression. Éditions explicites avec révision optimiste ; activation des versions conservées. Sauvegarde batch transactionnelle et contrôle de révision du projet.

Convention réelle : millisecondes entières, intervalles demi-ouverts séquentiels, transitions incluses dans le clip entrant. Ce choix et l’édition du brouillon précisent les propositions initiales en frames/manifest immuable ; la section 12 d’ARCHITECTURE l’indique. Le [contrat complet](ELSATIA-STUDIO-TIMELINE-CONTRACT.md) fixe la conversion des frontières en frames, le fond, la transformation, les mouvements, les transitions et l’audio source. Le futur renderer n’a pas à répartir la durée ou choisir des effets.

## Génération et édition

Automatique : photo 3 s, vidéo jusqu’à 5 s. Cibles presets et personnalisées jusqu’à 600 s. Allocation entière entre minimum photo 1 s / vidéo min(source,1 s) et maximum photo 15 s / vidéo min(source,15 s). Cible réalisable exacte ; sinon toutes les sources sont conservées et l’écart expliqué. Le plafond d’édition par clip est 600 s. Les vidéos partent du début par défaut, playback_rate=1, volume=1, sans dépassement de source.

Animations cycliques static/zoom/pan avec paramètres Ken Burns figés ; génération fade cohérente, modèle cut/fade/dissolve/slide/zoom. Une édition/réorganisation ne change pas les choix artistiques existants. Une transition dépassant la moitié d’un clip est refusée.

Section Montage de la page projet : préparation/régénération, version, cible/réel/écart, liste de clips, aperçus privés sur demande, formulaire durée/découpe/animation/transition, glisser-déposer, boutons Monter/Descendre, retrait et ajout. Sauvegarde de chaque action explicite ; aucune suppression d’asset lors du retrait d’un clip. Aperçus originaux uniquement, aucun lecteur simulant un MP4 exporté.

## Sécurité et RLS

Nouvelles tables RLS SELECT membre du workspace/projet accessible. Les quatre rôles lisent ; owner/admin/editor génèrent/éditent/réordonnent/activent ; suppression de version owner/admin. Viewer et projet archivé readonly. DML direct fermé, RPC à search_path vide, identité authentifiée et verrou workspace/projet réutilisés. Foundation Auth/onboarding/rôles/politiques inchangés.

FKs composites tenant, contrôle du lien réel asset/projet (pas seulement provenance d’upload), état ready et durée vidéo. La base vérifie les temps, l’ordre contigu, le total, la forme exacte du mouvement et les transitions. Les mutations en échec annulent clips/révision/compteur. Réponse de lecture complète dans un seul snapshot SQL. Aucun credential nouveau ; signatures d’aperçu Lot B inchangées. API JSON ≤64 Kio, contrôle Origin et validation des IDs/commandes ; pas de média binaire dans Next.

## Migrations et tests

Preuves privées : `/tmp/elsatia-studio-lot-d/` et `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-bwPbLU/`.

| Contrôle final | Résultat |
|---|---|
| Inventaire | 256 migrations uniques |
| Fresh install | PASS, 256 migrations |
| Rollback/réapplication | PASS, 256→255→256, compteurs projet/média conservés |
| SQL complet | **49 fichiers, 1 124 assertions PASS** |
| SQL Lot D | **52 assertions PASS**, dont batch de 500 clips |
| Batch SQL de 500 occurrences d’un asset | **109,42 ms**, insert groupé et lecture atomique |
| Vitest Studio | **11 fichiers, 214 tests PASS** |
| Lint application et scripts | PASS |
| Typecheck | PASS |
| Build production local final | PASS |
| E2E Lot D Chantier | PASS, 27,3 s, 5 photos/2 vidéos et 60 s |
| E2E Lot D Voyage | PASS, 52,4 s, 20 photos/5 vidéos, 90 s, chronologie et versions |
| E2E Lot D Viewer/A-B | PASS, 22,4 s |
| E2E Lot D mobile 390 px | PASS, 16,3 s ; capture inspectée, formulaire et boutons lisibles sans débordement |
| E2E A/B/C | **9/10 PASS** ; onboarding Foundation non validé dans cette campagne |
| Suite complète finale | **13/14**, 416,41 s, 0 skipped, 0 flaky, retries=0 |
| Stabilité avant tests | **100/100 cycles**, 210 requêtes, 0 erreur ; p95 23 ms, max 36 ms |
| Deuxième suite fraîche | Non exécutée : gate arrêté sur l’échec de la première |
| Stabilité finale | Non exécutée après cet échec ; aucun résultat vert supposé |
| `git diff --check` | PASS |

Le build final conserve les protections. Les services Montage transmettent le client déjà authentifié à leurs helpers privés dans la même requête, ce qui évite les lectures Auth redondantes ; il n’existe aucun cache global de permissions. La base recontrôle toujours RLS et mutations. Le bouton Recharger le montage est manuel en cas d’indisponibilité ; aucune reprise automatique de test n’a été ajoutée.

- Upgrade initial Lot C→D : réussi, 1 115 assertions SQL avant les dernières assertions additionnelles.
- Moteur 500 médias : **3,98 ms**, delta heap observé **124 320 octets**, 500 clips et cible 600 s exacte. Mesure Node locale ponctuelle, pas un engagement de latence réseau. Test automatisé avec plafond 1 s /20 Mio ; aucune fixture lourde dans Git.
- Première recette E2E : interruption volontaire après identification d’un sélecteur de menu Animation inadéquat ; les données de réordonnement étaient correctes. Correction du sélecteur vers le rôle accessible combobox, sans réduction des assertions ni retry Playwright. Preuve conservée dans `e2e-first-artifacts`.
- Rollback : script réservé aux tables de montage vides de l’instance jetable, sinon refus. Une première tentative sur le schéma intermédiaire avait demandé une fonction pas encore présente ; traitement `IF EXISTS` limité aux ajouts intermédiaires, transaction annulée puis rollback réussi. La réapplication finale reste testée depuis la lignée C.
- Nouveau contrôle reproductible `timeline-migration-check.mjs` : état frais 256 → rollback 255 → réapplication 256, contrôles des compteurs projet/média. Intégré au gate et à la CI Studio.

## Non-régression et exploitation locale

Les dix E2E A/B/C sont conservés. La campagne finale les a exécutés avec les quatre E2E D, workers=1 et retries=0. Upload smoke sélectionné à 64 Mio pour cette recette de non-régression ; le scénario historique 1 Gio reste disponible mais n’est pas une nouvelle exigence de D. Les tests SQL de tout le dépôt couvrent aussi les autres domaines, sans modifier leurs sources. Les suites navigateur complètes Gestion Pro/Colors/Tools ne sont pas revendiquées comme rejouées dans D.

Aucun changement de ressources globales Docker ou arrêt d’un autre projet. La permission précédente d’arrêt Analytics était limitée à C-ter ; une question de renouvellement a été posée, mais aucun arrêt sans réponse n’a été effectué. Les validations utilisent les seules instances Studio jetables. Pas de DNS forcé, health check désactivé ou assouplissement de RLS pour contourner une panne.

## Fichiers principaux

- `packages/studio-domain/src/timeline.ts`, exports et contrat projet additif.
- `apps/studio/src/lib/{timelines,database}.ts`, route `api/timelines/[projectId]`, composant TimelineEditor, page projet et styles.
- Migration `20260912230000_studio_timeline.sql`, test SQL Studio timeline et rollback local.
- Tests `timeline.test.ts`, `timeline-service.test.ts`, `timeline.spec.ts`.
- Harnais local/readiness/gate, contrôle de migration et workflow Studio.
- Présent rapport, contrat montage et complément ARCHITECTURE.

## Limites et risques restants

Pas de rendu, export, worker, musique, template, IA ou Lot E. Preview originale à la demande, sans slideshow. Quota d’import inchangé à 100 médias par défaut ; 500/1000 qualifient le moteur/modèle, pas une nouvelle capacité commerciale de stockage.

La disponibilité des sources reste distincte de la reproductibilité des choix : retirer/purger un média dans B/C peut rendre une ancienne version inexploitable. Elle conserve ses clips historiques, sans bloquer la suppression des données ; le futur renderer devra échouer explicitement. Réimporter crée un nouvel asset ; régénérer utilise les références actuelles. Aucune rétention cachée d’original imposée par D.

Les générations sont historisées, les éditions d’une même version ne sont pas un journal de chaque modification. Avant le Lot E, l’admission d’un rendu devra figer sa révision d’entrée et valider les sources. La conversion en frames et le rendu des effets définis dans le contrat restent à qualifier visuellement dans ce futur lot. Safari/iOS physique, CI GitHub distante et services Supabase distants ne sont pas qualifiés par les seuls tests locaux.

## Livraison

**Aucun commit créé, aucun push** : les changements restent locaux et reviewables tant que le gate est NO-GO. HEAD inchangé : `b2e6e293fa2cef9e6349ff98defce503794bf3a0`. Destination prévue uniquement `gh/feat/elsatia-studio-v1`, après qualification verte ; aucune fusion ni Production.

Les deux instances jetables de ce lot (upgrade et gate frais) sont supprimées. Le `.env.local` précédent est restauré à l’identique ; les dix fichiers préexistants conservent leurs empreintes. Les autres conteneurs sont préservés ; aucun arrêt Analytics réalisé. La demande de renouvellement de l’autorisation C-ter était restée sans réponse, et n’a pas été interprétée comme une autorisation.

**Prêt pour Lot E : non.** Prochaine étape : réserver une capacité locale suffisante, avec autorisation avant arrêt d’autres services, puis rejouer la qualification complète sur deux instances neuves. Aucun Lot E commencé.


## Incident runtime observé et verdict

La reprise intermédiaire donnait 2/4 D : Chantier et Viewer verts ; Voyage avait bien créé deux versions, puis une lecture bibliothèque/order renvoyait 503 après reload ; le mobile échouait à Auth avant montage. Les traces et captures sont conservées. La requête bibliothèque de 25 médias mesurée directement sous le rôle de la fixture s’exécute en 3,707 ms, sans changer les politiques ou délais applicatifs.

Sur le build final, les quatre D passent. L’échec Foundation attend le titre du dashboard après onboarding pendant 45 s ; Next signale un flux destination fermé précocement. La trace serveur finale observe **4 941 appels, huit HTTP 504, tous sur `/auth/v1/user`**, avec maximum **48 443 ms**. Aucun résultat 503/504 n’a été transformé en accès accordé ou masqué par une session non vérifiée.

Le relevé mémoire pendant cette campagne montre `MemAvailable=475484 kB` (environ 464 Mio), `SwapFree=60 kB` et pression mémoire `full avg10=60.29`. Cette forte pression et les 504 sont cohérents avec l’incident C-ter ; le readiness avant tests ne suffit manifestement pas à garantir la stabilité sous charge. Les ressources globales et les autres services n’ont pas été modifiés pour obtenir artificiellement un résultat vert.

Verdict du harnais : **NO-GO**. Il s’arrête après la première suite rouge, archive ses preuves et nettoie l’instance ; il ne relance pas une suite jusqu’à obtenir du vert. La qualification distante GitHub n’a pas été exécutée. Production et migrations distantes restent intouchées.
