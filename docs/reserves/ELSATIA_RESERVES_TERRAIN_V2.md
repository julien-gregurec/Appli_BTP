# ELSATIA Réserves — capture terrain V2

Lot : `ELSATIA-RESERVES-V2-TERRAIN-CAPTURE`
Base : `feat/reserves-v1-foundation-workflow` (`17ca07c`)
Migration : `supabase/migrations/20260907000269_reserves_v2_terrain_capture_v1.sql`

Ce lot ferme les trois manques P0 de la V1. Il ne développe **aucune** fonction P1 :
pas de synchronisation hors-ligne, pas de PDF serveur, pas de canal de notification
externe.

## 1. Stockage des fichiers

Deux buckets Supabase, **privés** (`public = false`) :

| Bucket | Contenu | Formats | Plafond |
| --- | --- | --- | --- |
| `reserves-photos` | Photos de réserve | JPEG, PNG, WEBP | 15 Mo |
| `reserves-plans` | Documents de plan | JPEG, PNG, WEBP, PDF | 25 Mo |

Aucune URL publique permanente n'existe. Chaque affichage passe par une **URL signée de
15 minutes**, émise seulement pour les objets que les policies laissent lire.

### Le chemin n'est jamais une preuve

C'est le point de sécurité central du lot. Un chemin de fichier est une *affirmation* du
client, pas une autorisation. Deux barrières indépendantes :

**En amont — le client ne choisit rien.** `reserves_ajouter_photo()` et
`reserves_ajouter_plan()` *composent* le chemin à partir des identifiants réels lus en
base, et le renvoient à l'appelant :

```
reserves-photos : <entreprise_hôte>/<chantier>/<réserve>/<uuid>.<ext>
reserves-plans  : <entreprise_hôte>/<chantier>/<plan>/<uuid>.<ext>
```

L'extension est déduite du type MIME, jamais du nom de fichier fourni. Le nom d'origine
est conservé comme simple métadonnée.

**En aval — le chemin est confronté à la base.** `reserves_storage_photo_autorisee()` et
`reserves_storage_plan_autorisee()` décomposent le chemin, rejettent tout ce qui n'a pas
exactement la forme attendue, puis vérifient que le triplet annoncé correspond à une
ligne réelle — la réserve existe, dans ce chantier, chez cette organisation — avant
d'appliquer le contrôle d'accès métier.

Un chemin forgé désigne donc soit une réserve inexistante, soit une réserve que
l'appelant n'a de toute façon pas le droit de lire ou d'alimenter. Le test pgTAP le
vérifie sur cinq variantes, dont le rattachement d'une vraie réserve à un faux chantier
et sa réattribution à une autre organisation.

### Écriture, jamais réécriture

| Bucket | select | insert | update | delete |
| --- | :-: | :-: | :-: | :-: |
| `reserves-photos` | ✅ | ✅ | ❌ | ❌ |
| `reserves-plans` | ✅ | ✅ | ❌ | ✅ (gestion des plans) |

Une photo déposée ne peut être ni écrasée ni effacée depuis l'application. Retirer une
photo est un geste métier tracé, pas une opération de stockage.

## 2. Cycle de vie d'une photo

```
reserves_ajouter_photo()   →  la base réserve l'emplacement et rend le chemin
       ↓
   dépôt du fichier         →  policy Storage : le chemin est confronté à la base
       ↓
reserves_confirmer_photo() →  vérifie que l'objet EXISTE dans le bucket
```

`disponible_at` sépare la réservation du fichier réellement déposé. Sans cette étape,
appeler la RPC sans jamais téléverser suffirait à satisfaire l'exigence de photo à la
levée. **Une photo ne compte que confirmée**, et la confirmation lit `storage.objects`.

Si le dépôt échoue, la ligne est retirée par suppression douce : aucun objet orphelin,
aucune photo fantôme.

### Suppression : douce, et verrouillée par la décision

`reserves_supprimer_photo()` marque `supprimee_at` — la ligne subsiste toujours, et le
retrait est écrit à l'historique.

Deux bornes :

- **seule l'entreprise qui a déposé** peut retirer ; le maître d'ouvrage ne retire pas
  les photos de son sous-traitant, ni l'inverse ;
- **une photo verrouillée ne peut plus être retirée.** Toute photo confirmée et vivante
  au moment d'une transition reçoit un `verrouillee_at` posé explicitement par la machine
  à états.

Le verrou est un drapeau, pas une comparaison d'horodatages : dans une même transaction
`now()` est constant, deux événements du même geste seraient indiscernables. Ce point a
été trouvé par le test avant d'être corrigé.

## 3. Compression

Une photo de chantier sert à **constater** un défaut : il faut assez de définition pour
voir une fissure, pas la pleine résolution d'un capteur 48 Mpx.

Politique : réduction à **2048 px sur le grand côté, JPEG 0,85**, appliquée dans le
navigateur avant l'envoi. Mesuré en exécution réelle : 1,6 Mo → 227 ko, image finale
2048 × 1536.

**Choix assumé : une seule image compressée est conservée, pas l'original.** Stocker les
deux doublerait le coût de stockage pour un bénéfice que personne n'a demandé à ce stade.

## 4. HEIC — ce que nous faisons vraiment

HEIC est **refusé**, à la source comme dans le bucket. Ni Chrome ni Firefox ne le
décodent, et Réserves n'embarque pas de convertisseur : l'accepter reviendrait à stocker
des photos qu'une partie des utilisateurs ne pourrait pas voir.

Le cas courant du terrain reste couvert : comme l'attribut `accept` du champ n'annonce
que JPEG/PNG/WEBP, **iOS transcode lui-même en JPEG** au moment de la sélection. Un
utilisateur d'iPhone en réglage « Haute efficacité » n'a rien à faire. S'il parvient tout
de même à soumettre un HEIC, le message lui indique le réglage « Le plus compatible ».

## 5. Plans et repérage

- **Création** : nom, niveau, zone, document (image ou PDF).
- **Visionneuse** : zoom 100–600 %, déplacement au doigt, pastilles colorées par statut.
- **Pointage** : le mode « Placer une réserve » transforme un appui sur le plan en
  coordonnée normalisée, puis ouvre le formulaire de constat pré-rempli.

La position est dérivée du **rectangle rendu de l'image**, qui intègre déjà le zoom et le
déplacement : diviser par ses dimensions annule la transformation. Le même endroit du
plan rend donc toujours la même coordonnée, quel que soit le zoom au moment du pointage.
Un déplacement du plan n'est jamais pris pour un pointage.

Un PDF reste consultable mais ne porte pas de pastille : le rendu PDF en canvas
demanderait une bibliothèque dédiée, et l'interface le dit explicitement plutôt que de
laisser l'utilisateur devant un plan muet.

## 6. Administration des membres

En V1, une organisation devait passer par un administrateur plateforme pour habiliter ses
propres salariés. `reserves_attribuer_role()` et `reserves_retirer_acces_membre()` ferment
ce manque, sous quatre bornes portées par la base :

1. l'appelant doit être `reserves_admin_organisation` **de cette organisation** ;
2. la cible doit déjà être **membre actif** de la même organisation — on habilite, on
   n'enrôle pas ;
3. `application_code` est figé à `'reserves'` : Gestion Pro, Colors, Tools et les rôles
   plateforme restent hors de portée ;
4. l'organisation doit conserver **au moins un administrateur Réserves**.

`reserves_intervenant` est volontairement exclu des rôles attribuables : ce n'est pas un
rôle interne mais celui du compte gratuit d'une entreprise extérieure, obtenu en
rejoignant une intervention.

**Écart assumé par rapport à la demande** : la liste des rôles attribuables inclut
`reserves_admin_organisation`, que l'énoncé ne citait pas. Sans lui, une organisation à
administrateur unique ne peut jamais déléguer, et un départ la laisse sans pilote. La
garde du dernier administrateur encadre le risque.

## 7. Entreprise invitée : le parcours complet

```
Hôte          nomme l'entreprise sur le chantier
Hôte          désigne son organisation ELSATIA → accès applicatif gratuit ouvert
Invitée       se connecte → arrive sur l'invitation en attente
Invitée       rejoint → habilitation `reserves_intervenant` sur son propre tenant
```

**Correction apportée en V2** : la V1 rendait ce parcours impossible. À sa première
connexion, la personne invitée n'a pas encore d'habilitation, et `connexionAction` la
déconnectait — l'invitation était inatteignable. `reserves_invitations_en_attente()`
expose désormais le strict nécessaire (identifiant de l'intervention et nom sous lequel
l'entreprise a été nommée, rien du chantier ni du maître d'ouvrage), et la connexion
oriente vers la page qui accorde l'habilitation.

### Invitation par e-mail

**Non implémentée, et volontairement.** L'infrastructure d'e-mail d'ELSATIA vit dans
Gestion Pro ; la brancher sur Réserves supposerait d'y dupliquer identifiants, gabarits
et journalisation, alors que Réserves est une application indépendante. L'écran fournit
un **lien d'invitation copiable** vers une page qui existe réellement. C'est le
comportement honnête tant que l'envoi n'existe pas.

## 8. Ce que la V2 ne livre pas

- synchronisation hors-ligne (points d'ancrage V1 conservés, rien de plus) ;
- génération PDF côté serveur — l'impression navigateur reste le chemin ;
- rendu des PDF dans la visionneuse, donc pas de pastille sur un plan PDF ;
- envoi réel des notifications, e-mail d'invitation compris ;
- annuaire d'organisations : la désignation demande encore l'identifiant technique du
  tenant invité ;
- QR chantier/zone, signature et procès-verbal.
