# ELSATIA Colors — cœur métier fonctionnel V1

## Périmètre et audit initial

Ce jalon part du commit canonique Colors `a4c01eaa31a7c1a12cbc20d7bc38bee2f16faaf2`. Il reste strictement local et ne modifie ni le socle multi-applications, ni Gestion Pro, ni Stripe, ni les migrations centrales 00234 à 00245.

| Fonction | Complète | Partielle | Absente | État réel au départ | Action retenue |
|---|---:|---:|---:|---|---|
| Shell autonome et identité Colors | ✓ | | | Layout, navigation et domaine local prêts | Réutilisé |
| Authentification et habilitation produit | ✓ | | | Gardes serveur canoniques prêtes | Réutilisées sans modification |
| PWA | | ✓ | | Manifeste, icônes et cache du shell | Conservée, hors-ligne métier reporté |
| Responsive/mobile | | ✓ | | Shell responsive, pages métier factices | Écrans métier mobile-first ajoutés |
| Inventaire, seaux, quantités, mouvements | | | ✓ | Placeholders uniquement | Modèle et interface créés |
| Photos privées | | | ✓ | Aucun stockage métier | Bucket privé et téléversement créés |
| OCR/IA | | | ✓ | Aucun fournisseur Colors | Contrat testable et mocks, aucun appel réel |
| HEX/RAL | | | ✓ | Aucun algorithme | Distance Lab générique, sans palette propriétaire |
| Nuanciers/catalogues/imports | | | ✓ | Placeholders | Architecture documentée, imports reportés |
| Documentation métier | | | ✓ | Documentation du shell seulement | Présent document créé |

## Modèle métier

La migration `20260828000246_colors_functional_core_v1.sql` crée exclusivement :

- `colors_emplacements` : hiérarchie souple (dépôt, véhicule, chantier, atelier, zone, rack, étagère, autre), ordre, archivage et propriétaire ;
- `colors_seaux` : identité fabricant, teinte, HEX, RAL approximatif, quantité, état, emplacement, photo privée et archivage ;
- `colors_mouvements` : journal append-only des entrées, sorties, consommations, retours, déplacements, ajustements, ouvertures, fermetures, passages à vide, archivages et restaurations ;
- `colors_analyses_ocr` : résultat brut, confiance et statut de confirmation ;
- `colors_parametres` : seuil de stock faible par organisation.

Les clés étrangères d’historique utilisent `RESTRICT`. Les clients authentifiés n’ont aucun droit `DELETE` sur les tables métier. Les seaux sont archivés, jamais supprimés depuis l’application.

## Quantités, unités et états

Trois modes sont acceptés : pourcentage (`pourcent`), volume (`l`, `ml`) et poids (`kg`, `g`). Le restant est compris entre zéro et le nominal. Le pourcentage est généré par PostgreSQL et arrondi à deux décimales. Aucune conversion poids/volume n’est effectuée ; la densité est seulement conservée lorsqu’elle est connue.

Les états techniques sont `ferme`, `ouvert`, `vide`, `archive`. La première ouverture fixe la date, un niveau nul impose l’état vide, l’archive est exclue de l’inventaire actif et sa restauration conserve tout l’historique.

Les ajustements, déplacements et transitions d’état passent par des RPC dédiées et verrouillent la ligne. Un trigger refuse une modification directe des colonnes opérationnelles.

## Photos et stockage

Le bucket `colors-seaux` est privé, limité à 10 Mo et aux formats JPEG, PNG, WebP, HEIC et HEIF. Le chemin est `entreprise_id/seau_id/uuid.extension`. Les politiques vérifient l’accès Colors, le rôle, le tenant et l’existence du seau. La fiche utilise une URL signée valable cinq minutes et une transformation de taille demandée à Supabase.

Le remplacement de photo principale est opérationnel. La suppression utilisateur et la compression locale ne sont pas exposées dans cette V1 ; elles restent dans la roadmap.

## OCR, couleurs et nuanciers

`FournisseurOcrColors` définit un port injectable. Il propose marque, produit, référence, teinte, référence de teinte et volume nominal, toujours avec le statut `a_confirmer`. Les tests utilisent exclusivement des mocks. Aucun fournisseur, appel payant ni clé n’est ajouté.

Le rapprochement HEX/RAL convertit les couleurs en Lab et calcule une distance euclidienne sur une palette explicitement fournie et autorisée. Le résultat porte toujours `approximative: true`. Aucune base RAL ou fabricant n’est embarquée et aucune correspondance n’est présentée comme certifiée.

Une future architecture de catalogues pourra accueillir Sto, Caparol, Zolpan, Seigneurie ou Tollens uniquement à partir de sources licenciées ou autorisées, avec provenance et confirmation.

## Recherche, stock faible et export

La recherche serveur couvre marque, produit, références, teinte, HEX et RAL en une requête, avec emplacement, état, archive, stock faible et absence de photo. L’inventaire est borné à 60 lignes dans cette V1 ; une pagination à curseur est prévue au-delà. Les index tenant/état/emplacement, stock faible, texte et chronologie évitent les parcours complets usuels.

Le seuil par défaut est 20 %. Un badge et une jauge sont affichés, sans notification externe. L’export CSV est limité à l’organisation active par le garde serveur et la RLS, avec un maximum de 5 000 lignes.

## Rôles et permissions

| Action | Admin | Gestionnaire | Dépôt | Consultation |
|---|---:|---:|---:|---:|
| Voir le stock / une fiche | ✓ | ✓ | ✓ | ✓ |
| Ajouter un seau | ✓ | ✓ | ✓ | — |
| Modifier les métadonnées | ✓ | ✓ | — | — |
| Ajuster / déplacer / marquer vide | ✓ | ✓ | ✓ | — |
| Archiver / restaurer | ✓ | ✓ | — | — |
| Gérer les emplacements | ✓ | ✓ | — | — |
| Utiliser l’OCR / ajouter une photo | ✓ | ✓ | ✓ | — |
| Exporter | ✓ | ✓ | — | ✓ |
| Gérer les paramètres | ✓ | — | — | — |

Cette matrice existe dans l’interface, dans les actions et routes serveur, dans `colors_action_autorisee`, dans les politiques RLS et dans Storage. Un administrateur plateforme global ne bénéficie que de la lecture lorsqu’un accès support central actif l’autorise.

## Multi-tenant et sécurité

Toutes les lignes portent `entreprise_id`. Une décision exige simultanément l’accès organisationnel Colors, l’habilitation individuelle active et le rôle approprié. Les fonctions `SECURITY DEFINER` fixent leur `search_path`, reverrouillent la ligne et revalident l’entreprise avant mutation. `PUBLIC` et `anon` n’ont aucun droit d’exécution sur les RPC. La connaissance d’un UUID d’un autre tenant n’accorde aucun accès.

Les tests pgTAP couvrent les tenants A/B, les quatre rôles, l’absence d’accès Colors, les écritures directes, les RPC, les contraintes, l’archivage, l’historique et Storage.

## Mobile, PWA, accessibilité et performance

Les écrans utilisent une grille réduite à une colonne sous 760 px, des contrôles tactiles d’au moins 44 px, des labels visibles, des focus contrastés, des messages avec `role=status` et une navigation sans modale. La capture photo utilise `capture=environment` lorsqu’elle est prise en charge.

Le manifeste, les icônes et le service worker du shell sont présents. Hors connexion, seules la page de connexion et les icônes préchargées peuvent servir de repli. Inventaire, actions, images signées, recherche et OCR exigent le réseau. Un mode offline métier avec file d’attente et résolution de conflits est explicitement hors périmètre.

Les listes joignent l’emplacement dans la requête, les statistiques sont dérivées d’un seul chargement borné, les images de liste ne chargent aucune HD et la fiche demande une URL signée redimensionnée. La pagination, les vraies miniatures persistées et la compression avant envoi restent à faire.

## Limites et roadmap

- activer un fournisseur OCR autorisé, avec traitement serveur, limitation de débit, rétention et écran de confirmation ;
- ajouter une palette RAL légalement exploitable et des catalogues avec provenance ;
- proposer suppression contrôlée de photo, compression et miniatures persistées ;
- compléter l’ajout rapide en un assistant photo → propositions → confirmation sur une seule page ;
- ajouter pagination à curseur, filtre marque dédié et filtre « récemment modifié » ;
- définir des seuils faibles en volume en plus du pourcentage ;
- rendre les paramètres et l’archivage d’emplacement totalement administrables ;
- construire l’offline métier seulement après conception de la synchronisation ;
- intégrer un sélecteur commun Gestion Pro ↔ Colors dans toutes les futures applications ELSATIA, sur ordinateur et mobile, n’affichant que les applications autorisées et revalidant les droits dans chaque application cible.

Cette livraison ne réalise aucun déploiement, aucune migration distante, aucun appel Stripe et aucune modification de compte réel.

## V1.1 — intégrité métier

La migration append-only `20260828000247_colors_integrity_v11.sql` ferme les quatre réserves P1 de la V1 sans modifier `00246` ni le socle central.

- **Auteurs canoniques** : les créations utilisateur imposent `auth.uid()` même si le client fournit un autre `created_by`. L’entreprise et l’auteur initial sont immuables. Les mouvements, confirmations OCR et paramètres enregistrent l’UID serveur de l’action.
- **Écritures officielles** : l’UPDATE direct des seaux, des analyses OCR et des paramètres est révoqué. Les métadonnées utilisent `colors_modifier_seau`, les paramètres `colors_enregistrer_parametres`, et les colonnes opérationnelles conservent leurs RPC verrouillées.
- **Machine OCR** : une analyse naît uniquement en `a_confirmer` via `colors_creer_analyse_ocr`. `colors_confirmer_analyse_ocr` exige une sélection non vide et fixe `confirme_par/confirme_at`; `colors_rejeter_analyse_ocr` clôt la proposition. Une analyse traitée ne peut pas l’être une seconde fois. Aucun fournisseur réel n’est appelé.
- **Photos** : `colors_definir_photo` valide l’objet exact dans le bucket privé, le chemin canonique `entreprise/seau/fichier`, le tenant, le MIME et la taille de 1 octet à 10 Mo. Storage interdit les renommages/déplacements. Le remplacement associe d’abord le nouvel objet, puis supprime l’ancien; un échec renvoie `nettoyageRequis: true`. Les objets non référencés restent supprimables par un rôle OCR autorisé et pourront être repris par un futur job idempotent.
- **CSV** : `celluleCsvColors` neutralise `=`, `+`, `-` et `@` après espaces de tête pour toute valeur textuelle, puis encode guillemets et retours ligne. Les nombres réellement typés, dont les négatifs, restent des valeurs métier.
- **Mouvements** : les états avant/après proviennent des lignes verrouillées. Le passage à vide conserve donc réellement `ferme` ou `ouvert`. Les consommations/sorties diminuent, les retours augmentent, les ajustements exigent un motif, les déplacements changent d’emplacement et les transitions ouverture/fermeture sont strictes. Des contraintes SQL protègent aussi les nouvelles lignes du journal.
- **Stock faible et statistiques** : le seuil par tenant est utilisé par le filtre, le badge et la RPC d’agrégation. La valeur par défaut reste 20 % en l’absence de paramètre; 0 et 100 sont valides. Les statistiques agrègent toutes les lignes du tenant et ne dépendent plus de la liste d’inventaire limitée à 60.
- **Recherche** : une colonne normalisée générée et un index GIN trigramme remplacent l’ancien index tsvector non utilisé par l’application. La requête serveur cible désormais directement `recherche_text`.
- **Mobile et accessibilité** : menu, fermeture, avatar et liens essentiels atteignent au moins 44 px sous 760 px. Le bouton de fermeture porte le nom accessible « Fermer la navigation ».

Les deux reconstructions locales ont été vérifiées : ledger Colors `00246 → 00247`, puis ledger canonique de 226 migrations `00245 → 00246 → 00247`. Les dettes restantes sont la pagination de l’inventaire, la compression/les miniatures, un job périodique de reprise des orphelins, l’offline métier, les catalogues licenciés et l’intégration future d’un fournisseur OCR autorisé.
