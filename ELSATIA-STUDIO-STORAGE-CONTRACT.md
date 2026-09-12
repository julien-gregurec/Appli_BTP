# ELSATIA Studio — Contrat Storage Lot B

## Provider et frontières

Provider initial : Supabase Storage, bucket **`studio-originals` privé**. Aucun bucket Gestion Pro réutilisé. Application autonome `apps/studio`, objets métier `studio_projects` et `studio_media_assets`. Les contrats TypeScript restent sans dépendance de framework dans `packages/studio-domain/src/media.ts`.

Les fichiers passent du navigateur à Storage, jamais par une route Next. Les routes Next acceptent des commandes JSON bornées à 4 Kio, vérifient session, UUID, appartenance et rôle, puis autorisent un asset enregistré. Ni clé objet arbitraire, ni workspace client non vérifié.

L’adaptateur serveur `storage-admin.ts` utilise `STUDIO_STORAGE_SERVICE_KEY`. Il s’agit d’un credential **privilégié**, pas d’un compte automatiquement limité au bucket par le fournisseur. Il reste dans un module `server-only`, jamais dans un bundle client. Le code fixe le bucket et obtient la clé depuis une ligne autorisée par RLS. Le navigateur reçoit uniquement une capacité d’upload pour un chemin précis et la clé publique de passerelle.

## Autorisations

Owner/admin/editor créent des projets, réservent/importent/confirment et suppriment des médias. Viewer lit projets, métadonnées et aperçus validés. Aucun UPDATE/INSERT/DELETE direct sur les tables métier pour authenticated. Création/réservation/suppression passent par RPC avec contrôle `auth.uid()` sous verrou workspace. La finalisation est une RPC réservée au serveur ; elle revérifie le rôle de l’utilisateur authentifié et l’existence/taille dans `storage.objects`.

Une politique **restrictive** sur `storage.objects` interdit toutes les opérations anon/authenticated pour le seul bucket Studio, même en présence d’une ancienne politique permissive large. La signature, l’inspection et la purge passent donc par l’adaptateur serveur. Aucun droit ni politique Lot A modifié.

## Clés et immutabilité

`studio/{workspaceId}/{projectId}/{assetId}/original.{extension}`

UUID générés côté DB, extension issue d’une allowlist, aucun nom fourni par l’utilisateur dans la clé. Le nom original est conservé uniquement pour affichage. Les capacités sont créées avec `upsert:false` ; le retry réutilise l’asset et la même clé. Une nouvelle sélection volontaire du même fichier constitue une autre demande ; pas de déduplication par contenu dans B.

## Cycle d’upload

1. Réservation transactionnelle d’un asset `pending`, de ses octets et d’une place projet. Idempotence `(workspace_id, uploaded_by, request_id)` ; une réutilisation avec d’autres paramètres est refusée.
2. Autorisation après RLS vers `/storage/v1/upload/resumable/sign`, header `x-signature` et clé publique `apikey`. Le domaine direct Storage est utilisé sur Supabase hébergé.
3. TUS par chunks **6 Mio**, trois transferts en parallèle par défaut. Progression réelle par octets, retry automatique borné puis bouton Réessayer. Pause/réessai réutilisent l’URL TUS dans l’onglet.
4. Confirmation : info objet réelle, taille exacte et Content-Type, puis lectures HTTP Range et inspection des signatures/conteneurs. Lecture bornée à **4 Mio cumulés**, 16 requêtes maximum et budget réseau de 45 secondes ; moov ≤2 Mio, en-tête image ≤256 Kio. Un fournisseur ignorant Range est refusé, sans téléchargement complet de secours.
5. La RPC serveur publie `ready`, dimensions et métadonnées minimales. Un simple appel client ne peut pas publier un asset. Reconfirmation d’un asset déjà validé idempotente. Une indisponibilité transitoire de lecture laisse l’asset reprenable ; un format invalide devient `failed` et ne peut pas être prévisualisé.

La fenêtre d’admission/réautorisation d’un asset est de **2 heures**. Les autres statuts sont réservés au contrat futur ; B ne construit aucun worker ni étape de rendu.

**Limite de reprise :** les octets déjà transférés sont repris après coupure/pause dans le même onglet. Après fermeture/rechargement, la ligne pending reste visible mais les handles File/URL TUS ne sont pas persistés : supprimer l’entrée puis resélectionner le fichier. Aucune promesse de reprise inter-onglets ou après 24 h.

Références officielles : [TUS Supabase](https://supabase.com/docs/guides/storage/uploads/resumable-uploads), [exemple signé et route `/sign`](https://github.com/supabase/supabase/blob/master/examples/storage/resumable-upload-signed-uppy/index.html), [contrôle d’accès Storage](https://supabase.com/docs/guides/storage/security/access-control).

## Formats et métadonnées

- Images statiques JPEG/JPG, PNG, WEBP. Extension, MIME, magic bytes, structure terminale et dimensions contrôlés. Dimensions ≤16 384 px par côté et ≤100 mégapixels. EXIF orientation conservée ; dimensions affichées adaptées aux rotations usuelles.
- Vidéos MP4 et MOV avec `ftyp` reconnu, piste vidéo **H.264 (avc1/avc3)** et conteneur ISO BMFF non fragmenté. Analyse légère des boîtes moov/trak : dimensions, durée, codec et matrice de rotation. Durée maximale d’admission 24 h. Une vidéo sans piste ou tronquée est refusée.
- HEIC/HEIF, HEVC/H.265, WEBM, audio seul, SVG, images animées, MP4 fragmenté sans durée exploitable et anciens MOV sans ftyp ne sont pas annoncés comme supportés. Conversion préalable nécessaire.
- Aucune analyse FFmpeg, validation décodée de toutes les frames, antivirus ou normalisation HDR/VFR. `ready` signifie admission au stockage, pas qualification pour un futur rendu.
- Aucune extraction/indexation GPS, appareil ou date EXIF dans B. `captured_at` reste null lorsque non qualifié. Les originaux conservent leurs octets et donc leurs éventuelles métadonnées embarquées ; B ne prétend pas les anonymiser.

## Limites configurables

Une ligne `studio_media_limits`, lisible par les comptes authentifiés et modifiable uniquement par un opérateur privilégié, fournit les valeurs autoritaires :

| Limite | Défaut |
|---|---:|
| Image | 50 Mio |
| Vidéo | 1 Gio |
| Projet | 5 Gio |
| Workspace | 20 Gio |
| Médias réservés par projet | 100 |
| Concurrence navigateur | 3, bornée de 1 à 5 |

Les valeurs peuvent être abaissées par configuration DB ; relever les plafonds techniques exige une nouvelle qualification. Le bucket est plafonné à 1 Gio. La configuration globale de 1 Gio est appliquée **uniquement à la copie Supabase jetable**, pas au `supabase/config.toml` partagé ni au projet distant.

Quotas réservés sous verrou workspace, incluant les lignes non purgées ; pas de libération prématurée sur erreur/suppression. Les capacités signées Supabase ne lient pas la taille réservée au token : un client hostile peut envoyer un objet plus gros, dans la borne du bucket. La confirmation le refuse et la réconciliation le purge ; le coût de quarantaine temporaire doit être surveillé avant exposition publique. Aucun mécanisme de facturation.

## Aperçus

`getStudioMediaSignedUrl(assetId)` vérifie utilisateur, appartenance, projet et état `ready`. URL de lecture valable **60 secondes**, jamais enregistrée en base, réponse `private, no-store`. Aucun objet public permanent. Un lien déjà obtenu reste une capacité bearer jusqu’à son expiration, y compris après retrait de membership.

Grille paginée par 24 lignes, sans téléchargement automatique des originaux. L’utilisateur demande l’aperçu ; images affichées directement, vidéos via lecteur natif `preload=metadata`. Bouton de renouvellement si URL expirée. Aucun proxy vidéo ni miniature serveur.

## Suppression et réconciliation

La suppression pose immédiatement un tombstone : disparition des listes et refus de nouvelles signatures. L’objet n’est pas supprimé trop tôt, car une ancienne capacité d’upload pourrait sinon recréer le même chemin. `purge_after = création + 30 h` couvre la fenêtre de réautorisation de 2 h, les 2 h de validité d’un token émis à la fin de cette fenêtre, les 24 h d’une session TUS démarrée tardivement et une marge de 2 h. Les quotas restent réservés jusqu’à la purge physique vérifiée. Une URL de preview déjà émise expire au plus tard en 60 secondes.

Commande manuelle **locale seulement**, aucun cron actif :

```sh
node --env-file=apps/studio/.env.local apps/studio/scripts/storage-reconcile.mjs
node --env-file=apps/studio/.env.local apps/studio/scripts/storage-reconcile.mjs --apply
```

Dry-run par défaut. Parcours paginé et borné du bucket Studio :

- pending/failed expirés → tombstone ;
- tombstones après le délai → suppression API Storage, vérification d’absence, puis `purged_at` et libération du quota ;
- ready sans objet → failed, donc aucune nouvelle preview ;
- objets sans ligne DB et âgés de plus de 30 h → purge ;
- erreurs fournisseur → conservation de la réservation, code de sortie non nul, rejeu idempotent.

Les noms, clés, signatures et secrets ne sont pas imprimés. Le script ne touche aucun autre bucket. Les sessions TUS partielles relèvent aussi de l’expiration fournisseur. La purge des assets d’un workspace archivé, la restauration et les politiques de compte global restent à compléter dans un lot dédié ; aucune purge globale implicite.

## Validation et exploitation

Voir `ELSATIA-STUDIO-V1-LOT-B-REPORT.md`. La limite de 1 Gio est qualifiée par transfert local d’un MP4 synthétique complété d’une boîte libre, créé dynamiquement hors Git. Cela prouve le protocole/octet, pas le débit Internet mobile ni le décodage d’une vidéo longue réelle. La configuration distante, les coûts, la rotation du credential et les limites du compte fournisseur doivent être recettés avant toute mise en ligne autorisée.
