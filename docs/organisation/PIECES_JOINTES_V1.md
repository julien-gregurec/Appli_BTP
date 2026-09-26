# PIECES-JOINTES-V1 — Audit transverse et harmonisation des pièces jointes

**Constat de départ** : ELSATIA compte déjà 12 buckets Storage privés et de nombreux modules avec pièces jointes fonctionnelles, construits lot après lot sans jamais avoir été audités transversalement. Ce lot audite d'abord l'existant module par module, puis corrige les écarts réels trouvés — sans construire de GED complète ni ajouter de pièces jointes arbitrairement là où le besoin n'est pas démontré.

## 1. Inventaire Storage (état réel, vérifié en base live)

| Bucket | Public | Taille max | Usage |
|---|---|---|---|
| `entreprise-assets` | **oui** (logos, volontaire) | 5 Mo | Logo entreprise |
| `chantier-documents` | non | 15 Mo | Photos/plans/PV de chantier + photos de comptes-rendus (nouveau, ce lot) |
| `devis-medias` | non | 20 Mo | Photos/audio joints à un devis |
| `messagerie-medias` | non | 20 Mo | Photos/vidéos de messagerie interne (dont fil chantier) |
| `documents-employes` | non | 10 Mo | Carte BTP, photo, signature dessinée |
| `factures-fournisseurs` | non | 20 Mo | Justificatif de dépense fournisseur |
| `fiches-techniques` | non | 20 Mo | Fiches techniques/sécurité d'articles de stock |
| `notes-frais` | non | 15 Mo | Justificatifs de notes de frais (1 à 20 pages) |
| `notes-frais-exports` | non | 250 Mo | Archives ZIP d'export notes de frais |
| `bulletins-paie` | non | 20 Mo | Bulletins de paie (import RH) |
| `documents-paie` | non | 20 Mo | Autres documents de paie |
| `pointage-preuves` | non | 10 Mo | Photo de preuve de pointage (bucket existant, jamais réellement branché — aucune UI d'upload ni de lecture trouvée) |

Chaque bucket privé suit la même convention `storage.foldername(name)[1] = entreprise_id`, avec RLS scopée par `est_membre_actif()`/`a_permission()` — architecture cohérente et volontaire, confirmée bucket par bucket.

**Deux mentions `anon` trouvées dans d'anciens fichiers de migration** (`documents_chantier`/`chantier-documents`, une ancienne policy « prototype » sur `factures-fournisseurs ») : **vérifiées comme mortes en base live** (aucune policy `anon` active sur `storage.objects` ni sur `public.documents_chantier` aujourd'hui — superseded par des migrations ultérieures). Pas une vulnérabilité réelle, juste du bruit historique dans les fichiers de migration.

## 2. Bug de sécurité réel trouvé et corrigé : lecture non restreinte de documents sensibles

En comparant les policies RESTRICTIVE d'écriture (`role_gestion_fichiers_insert/update/delete`, qui narrowent correctement vers `gerer_employes`/`gerer_achats`/`gerer_pointage`) à celles de lecture, **aucune policy RESTRICTIVE SELECT équivalente n'existait**. La lecture (donc `createSignedUrl`, utilisée par toutes les routes de téléchargement de l'app) ne dépendait encore que de la vieille policy PERMISSIVE `est_membre_actif()` seule.

**Conséquence réelle, confirmée en base live avant correctif** : n'importe quel membre actif d'une entreprise pouvait lire/télécharger directement (via l'API Storage, y compris hors de l'application) :
- la carte BTP et la signature dessinée de n'importe quel autre salarié (`documents-employes`),
- les factures fournisseurs (`factures-fournisseurs`),
- les preuves de pointage (`pointage-preuves`, bucket non branché en pratique mais policy corrigée par cohérence),

— sans jamais avoir la permission métier correspondante.

**Correctif** (migration `20260824000224`) : nouvelle fonction `peut_lire_document_employe_sensible()` qui distingue les 3 types de documents stockés dans `documents-employes` — la **photo** reste volontairement lisible par tout membre actif (annuaire/fiche interne, comportement inchangé), tandis que **carte BTP et signature** exigent désormais `gerer_employes` ou d'être le salarié concerné (self). Une nouvelle policy RESTRICTIVE `role_gestion_fichiers_select` applique cette règle plus `gerer_achats`/`gerer_pointage` pour les deux autres buckets. 9 tests pgTAP couvrent self-access, cross-employé (bloqué), gerer_employes (autorisé) et isolation cross-tenant.

## 3. Classification par module

| Module | État | Classification | Action |
|---|---|---|---|
| Messagerie | Complet (upload signé, vérif magic-bytes, nom sécurisé, nettoyage orphelins) | **A** | Aucune |
| Notes de frais | Exceptionnellement complet (hash SHA-256 chaîné, triggers d'immuabilité, versionnage) | **A** | Aucune (antivirus reste un stub documenté, non bloquant) |
| Documents de chantier | Complet, upload mobile-first (`capture=environment`) | **A** | Aucune (pas de preview PDF/Office inline — choix assumé, téléchargement suffit) |
| Stock (fiches techniques) | Complet, correctement scopé aux articles de stock malgré un nom de migration trompeur | **A** | Aucune |
| Paie (bulletins/documents) | Architecture de RLS la plus stricte du dépôt (best practice) | **A** | Aucune (l'absence d'auto-service employé pour consulter son propre bulletin est un vrai manque, mais **hors périmètre pièces-jointes** — c'est un sujet d'accès, pas de stockage) |
| Fournisseurs (factures) | Complet | **A** | Mineur : pas de bouton téléchargement/suppression dédié (seulement remplacement) — non corrigé, jugé cosmétique |
| **Devis** | Upload/preview/download complets, **aucune suppression possible** | **B → A** | **Corrigé ce lot** : RPC `retirer_piece_jointe_devis`, UI de suppression sur la fiche et dans l'éditeur (qui affiche enfin les pièces déjà enregistrées en modification) |
| **Employés (documents sensibles)** | Fonctionnel mais angle mort RLS en lecture | **B → A** | **Corrigé ce lot** (voir §2) |
| **Comptes-rendus de chantier** | Texte seul (dictée IA), aucune pièce jointe, aucune édition/suppression | **B** | **Corrigé partiellement ce lot** : photos ajoutées (réutilise `documents_chantier`) ; l'édition/suppression du texte du compte-rendu reste hors périmètre (pas un sujet pièces-jointes) |
| Commandes fournisseurs | Génère son propre PDF, mais aucun upload de document entrant (bon de livraison scanné) | **B** | Non corrigé — le besoin existe déjà un cran plus loin (dépenses) ; à évaluer dans un futur lot commandes |
| Factures (client) | Aucune pièce jointe, seulement le PDF officiel généré | **C** | Non implémenté — l'immuabilité de la facture émise (`verrouiller_facture_emise`) rend un futur ajout possible mais délicat (nouvelle table dédiée, jamais toucher `factures`) ; pas de besoin métier concret démontré aujourd'hui |
| Support (tickets) | Fil de discussion texte fonctionnel, aucune pièce jointe | **C** | Non implémenté — recommandation forte pour un prochain petit lot (capture d'écran = besoin très courant, modèle de table déjà prêt à étendre) |
| Clients | Aucun document, seulement un champ notes texte | **C** | Non implémenté — besoin plausible mais aucune amorce dans le modèle de données, pas urgent |
| Matériel/outillage | Aucun document propre (facture liée en lecture seule) | **D** | Non nécessaire — aucune trace d'un besoin réel au-delà de ce qui existe déjà |
| Véhicules/flotte | Aucun document propre (échéances déjà suivies par dates) | **D** | Non nécessaire, idem |
| Admin plateforme | Aucun upload staff-side hors support | **D** | Non nécessaire |
| Interventions | Signature électronique déjà présente, pas de photo/fichier | **E** | BETA — ne pas développer |
| Appels d'offres / DOE | Fiches techniques déjà couvertes par le module stock | **E** | DISABLED — ne pas développer |

## 4. Duplication identifiée, non corrigée : photos de chantier

Deux pipelines distincts alimentent la même page `/chantiers/[id]/documents` :
1. `documents_chantier` (upload dédié, catégories, audience, suppression) ;
2. `pieces_jointes_messages`/`messagerie-medias` (photos/vidéos postées dans le fil de discussion chantier, affichées en lecture seule sur la même page).

Capacités différentes (20 Mo + vidéo vs 15 Mo sans vidéo), pas de suppression possible pour les médias de messagerie depuis cette vue. **Non corrigé dans ce lot** : la messagerie est volontairement immuable (pas de suppression de message), et forcer une suppression partielle depuis une autre page créerait une incohérence différente. Documenté comme dette connue, pas une régression de sécurité.

## 5. Système commun

Aucun composant d'upload générique n'existe : `devis-medias.ts` et `messagerie-medias.ts` sont deux implémentations quasi identiques (mêmes noms de fonctions, mêmes garanties de sécurité : nom sécurisé, vérification MIME magic-bytes, prévention path-traversal) mais dupliquées plutôt que partagées. Volontairement **non fusionné** dans ce lot : les deux modules ont des contraintes réellement différentes (types MIME, comptes max, cible), et forcer une abstraction commune sur seulement deux implémentations aurait été une factorisation prématurée pour un gain marginal. Si un 3e module a besoin du même pattern (ex. support, §3), ce sera le bon moment d'extraire un noyau commun.

## 6. Sécurité — contrôles génériques déjà en place (vérifiés, non modifiés)

- **Nom de fichier** : jamais utilisé comme chemin brut — chaque module génère `entreprise_id/.../uuid-nom-securise`, avec normalisation Unicode et rejet des caractères spéciaux (`nomMediaXSecurise`).
- **MIME serveur** : la messagerie et les devis vérifient les *magic bytes* réels du fichier téléversé contre le MIME déclaré (`detecterMimeMediaX`/`mimeDetecteCompatible`) — pas une confiance aveugle dans l'extension. Les autres modules valident au moins le MIME déclaré serveur-side avant upload.
- **Antivirus** : aucun scanner réel branché nulle part ; le seul point qui prévoyait cette option (`analyse_antivirus_obligatoire` sur les notes de frais) retourne explicitement une erreur 503 si jamais activé — pas de faux sentiment de sécurité.
- **Signed URLs** : toujours courtes (60 à 900 secondes selon le module), jamais stockées en base.
- **Orphelins** : chaque flux d'upload en plusieurs étapes (préparer/finaliser) nettoie le fichier Storage si l'insertion en base échoue à n'importe quelle étape.

## 7. Quotas de stockage / lien abonnement

Le quota affiché sur `/abonnement` (`stockageGoInclus`) mesure le stockage réellement utilisé — les nouveaux flux de ce lot (suppression devis, photos compte-rendu) n'introduisent aucun nouveau mécanisme de comptage : ils utilisent les buckets et tables déjà mesurés. Non retouché, aucune régression possible sur ce point.

## 8. Mobile et accessibilité

Non retesté intégralement ce lot (aucune modification CSS/layout large — seulement des boutons/listes ajoutés dans des sections déjà responsives). Le nouveau composant `PhotosCompteRendu` réutilise `capture="environment"` (photo directe depuis mobile) comme `documents_chantier` le fait déjà. Vérifié en direct : upload et suppression fonctionnent en conditions réelles (Preview, voir §9).

## 9. Recette réelle (Preview, Stripe Test non concerné — aucun paiement impliqué)

Fixture `RECETTE-PIECES-JOINTES-V1` créée via le vrai flux de signup, un client et un chantier de test. Vérifié en direct dans l'application réelle (pas seulement en base) :
- **Devis** : création d'un devis brouillon avec une photo jointe → pièce visible sur la fiche → bouton « Retirer » avec confirmation réelle (message capturé et vérifié) → suppression effective, ligne DB et objet Storage tous deux supprimés (vérifié par requête directe après coup, zéro résidu).
- **Comptes-rendus** : rédaction d'un compte-rendu → ajout d'une photo réelle (upload, rendu, `naturalWidth` vérifié non nul donc image réellement chargée) → suppression avec confirmation → bannière « Photo retirée », zéro résidu.
- La correction RLS (§2) a été vérifiée par tests pgTAP comportementaux réels (self-access, cross-employé bloqué, cross-tenant bloqué) plutôt que par un aller-retour HTTP live supplémentaire, par économie de temps — les deux mécanismes (fonction SQL testée + route HTTP qui l'appelle directement via `createSignedUrl`) sont le même code, donc la garantie est équivalente.

Fixture entièrement nettoyée après recette : entreprise, client, chantier, compte-rendu, devis, compte auth — zéro résidu vérifié par requête sur chaque table concernée.

## 10. QA

406/406 tests Vitest, typecheck propre, lint 0 erreur, build propre, `verify:secrets` (865 fichiers, 0 secret), `verify:migrations` (205 migrations, 3 ajoutées ce lot), `npm audit` 0 vulnérabilité. **pgTAP complet exécuté en local** (stack Docker Supabase démarrée pour ce lot, jamais utilisée auparavant dans les lots récents) : 22 nouveaux tests, tous passants ; 3 fichiers de tests préexistants montrent des échecs **confirmés sans rapport avec ce lot** (staleness d'assertions face à des comportements légitimement changés par des lots ultérieurs — le trigger d'immuabilité des factures, un format de message d'erreur, et une fonction `document_commercial_par_token` légitimement `anon`-exécutable pour les liens de partage public) : non corrigés ici, hors périmètre, signalés pour un futur nettoyage de dette de tests.

## 11. Incident de process

Deux bugs réels dans mes propres migrations de ce lot, trouvés **avant tout déploiement** grâce aux tests pgTAP locaux :
1. Un FK composite `(compte_rendu_id, entreprise_id)` sans liste de colonnes explicite sur `ON DELETE SET NULL` aurait mis `entreprise_id` à `null` en plus de `compte_rendu_id` (comportement PostgreSQL par défaut sur les FK composites) — violait la contrainte NOT NULL. Corrigé en précisant `on delete set null (compte_rendu_id)`.
2. Le premier jet de la FK cross-tenant n'utilisait qu'`id` sans `entreprise_id`, ce qui aurait permis à un document de l'entreprise B de référencer un compte-rendu de l'entreprise A. Corrigé en FK composite avec contrainte unique `(id, entreprise_id)` sur `comptes_rendus_chantier`, suivant le même pattern déjà utilisé sur `factures.devis_origine_id`.

Ces deux bugs n'ont jamais atteint Preview ni Production — détectés par les tests pgTAP locaux avant le premier `db query --linked`.

## 12. Roadmap (hors périmètre de ce lot, explicitement)

Par ordre de priorité recommandé :
1. **Support** (§3, classification C) — capture d'écran sur un ticket, modèle de table déjà prêt.
2. **Commandes fournisseurs** — upload direct d'un document entrant (bon de livraison scanné) sur la commande elle-même, pas seulement sur la dépense liée.
3. **Clients** — documents contractuels, si un besoin réel se confirme.
4. **Factures client** — documents associés (preuve de livraison signée), en gardant une table strictement séparée pour ne jamais toucher `factures` (immuabilité).
5. **Nettoyage de dette de tests** — les 3 fichiers pgTAP préexistants signalés au §10.

Explicitement **hors roadmap** (rappel de la consigne du lot) : GED complète, signature électronique avancée, OCR, antivirus maison, versioning documentaire complexe, stockage multi-cloud.
