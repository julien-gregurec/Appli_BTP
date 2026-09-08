# ELSATIA Contact / Card — Modèle de vie privée et de sécurité V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
Révision : **R3** — O1 à O4, E4 et E5 arbitrées. R2 = `0fd1e32`.
Statut : **conception**. Rien n'est implémenté ; aucune politique RLS n'est créée ici.

---

## 1. Ce qui rend ce produit particulier

Contact / Card est **la seule application ELSATIA qui collecte les données personnelles de
gens qui n'ont pas de compte, ne connaissent pas ELSATIA, et ne le connaîtront peut-être
jamais.** Une personne remplit un formulaire de partage réciproque parce qu'elle vient de
rencontrer quelqu'un dans un salon, pas parce qu'elle a choisi une plateforme.

Deux conséquences qui gouvernent tout le reste :

1. **Le consentement doit être obtenu de cette personne**, explicitement, au moment de la
   collecte, et il doit dire à qui les données vont.
2. **La personne doit pouvoir revenir** — savoir ce qui a été collecté, le faire rectifier,
   le faire supprimer — sans créer de compte.

Le second point est le plus exigeant, et c'est celui qu'il ne faut pas escamoter.

---

## 2. Surfaces exposées

| Surface | Authentification | Exposition |
|---|---|---|
| Page publique de carte `/c/<token>` | aucune | champs autorisés d'**une** carte |
| Téléchargement vCard | aucune | mêmes champs |
| Formulaire réciproque | aucune | écriture seule |
| Application Contact / Card | compte ELSATIA + habilitation | carnet, cartes, réception |
| Pont Gestion Pro | serveur à serveur, `client:propose` | propositions |

Les trois premières lignes sont accessibles à n'importe qui sur Internet. Elles concentrent
donc l'essentiel du risque.

---

## 3. Jetons

Réutilisation exacte du patron éprouvé de `src/lib/documents-partage.ts` :

```ts
randomBytes(32).toString("base64url")   // 256 bits, non prédictible
createHash("sha256").update(token).digest("hex")   // seule l'empreinte va en base
```

Règles :

* **le jeton en clair n'est jamais stocké** — ni en base, ni en journal, ni en télémétrie ;
* la résolution passe par une fonction `security definer` qui filtre
  `revoque_le is null and (expire_le is null or expire_le > now())` **avant** de renvoire
  quoi que ce soit — la révocation est donc appliquée avant tout accès aux données, pas au
  moment de l'affichage ;
* cette fonction est accordée à `anon` et à rien d'autre ; la table des jetons elle-même
  n'est **jamais** lue directement depuis le code applicatif public ;
* un jeton résout **une carte**. Il n'ouvre aucun chemin vers les autres données de
  l'entreprise. C'est l'exigence « une carte publique ne doit jamais permettre d'explorer les
  autres données de l'entreprise », et elle tient parce que la fonction ne renvoie qu'un
  identifiant de carte.

### 3.1 Puce NFC et QR code

> **La puce contient une URL. Rien d'autre.**

Pas de vCard embarquée, pas de nom, pas de téléphone, pas de clé, pas de jeton signé porteur
de données. Une puce clonée ne donne que ce que donne l'URL — que le titulaire peut révoquer
en un geste.

Le QR reprend **le même jeton** que la puce : c'est ce qui rend vrai le test « le QR et le NFC
désignent la même carte », et ce qui permet de révoquer les deux d'un coup.

### 3.2 Expiration

Un jeton de carte n'expire **pas** par défaut : une carte physique en portefeuille doit
fonctionner dans deux ans. La sécurité vient de la révocation, pas de l'expiration.

En revanche, les jetons de courte vie expirent : lien d'invitation d'échange, lien de
rectification adressé à une personne extérieure. Le patron
`reserves_invitations.expire_at not null` s'applique à ceux-là.

---

## 4. Le formulaire réciproque

C'est le point d'entrée le plus exposé du produit : anonyme, en écriture, atteignable par
n'importe qui.

**Consentement.** Case explicite, **non cochée par défaut**, bouton d'envoi inactif tant
qu'elle ne l'est pas. Le texte nomme le destinataire (« Vos informations seront transmises à
Sophie Martin — Bâtiment Martin ») et la finalité (« pour vous recontacter dans un cadre
professionnel »). La date, l'heure et le texte exact du consentement sont conservés avec la
soumission : un consentement dont on ne peut pas produire le libellé n'est pas prouvable.

**Anti-abus.** `rate_limits_applicatifs` et `journal_abus_securite` (migration 193) existent
et s'appliquent tels quels : plafond par jeton de carte, plafond par empreinte d'adresse IP,
fenêtre glissante. L'identifiant est **haché** en base (`identifiant_hash ~ '^[0-9a-f]{64}$'`)
— une adresse IP en clair serait elle-même une donnée personnelle stockée.

**Anti-bot.** Champ-piège invisible et délai minimal de soumission avant tout recours à un
mécanisme externe. Aucun service tiers ne doit être ajouté sans arbitrage RGPD : un captcha
tiers est un transfert de données de plus.

**Contenu.** Longueurs maximales par champ, e-mail et téléphone validés par
`isPlausibleEmail` / `isPlausiblePhoneNumber` (existants), champ « contexte de la rencontre »
plafonné et traité comme du texte, jamais interprété.

---

## 5. Images

| Contrôle | Règle |
|---|---|
| Types acceptés | JPEG, PNG, HEIC, PDF — **liste blanche**, validée sur le contenu et pas sur l'extension |
| Taille maximale | plafond par fichier, appliqué côté bucket (`file_size_limit`) et côté application |
| Bucket | **privé**. Sur les 13 buckets du dépôt, un seul est public (`entreprise-assets`) et il n'accueille que logos et photos de profil affichés |
| Accès | URL signées de courte durée, jamais d'URL publique |
| Antivirus | **aucun antivirus n'est disponible dans l'écosystème aujourd'hui.** Ne rien promettre. Si un scan est ajouté, il devra être réel et vérifiable |
| Conservation | **politique arrêtée (O2)** — voir §5.1 |

Une photo de carte de visite contient un nom, un employeur, un téléphone et souvent un
visage. Elle est aussi sensible que le contact lui-même, et parfois plus.

### 5.1 Politique de conservation des images (O2)

| Situation | Durée | Mécanisme |
|---|---|---|
| Carte reçue, **jamais traitée** | **30 jours** maximum | purge automatique |
| Carte vérifiée, données **confirmées** | image supprimée sous **7 jours** | purge automatique |
| Demande de l'utilisateur | **immédiate** | suppression anticipée |
| Conservation prolongée | **action manuelle seule** | motif, auteur, date d'expiration, journal |
| Par défaut | **aucune conservation illimitée** | l'expiration est obligatoire |

Cinq propriétés qui font la différence entre une politique écrite et une politique tenue :

1. **La suppression de l'image n'emporte pas les données structurées.** L'état visé est
   *carte classée, données conservées, image supprimée* — d'où deux cycles de vie séparés,
   celui de la carte et celui de l'image.
2. **Une conservation exceptionnelle expire d'elle-même.** À l'échéance, l'image redevient
   purgeable sans qu'un humain ait à y penser. C'est ce qui empêche « prolongé une fois »
   de devenir « conservé pour toujours ».
3. **Une image dont l'OCR a échoué reste purgeable.** Aucun état d'erreur ne retient une
   donnée personnelle en otage.
4. **La purge est idempotente.** Elle ne fait que marquer ; l'effacement du stockage
   appartient à l'application, qui confirme ensuite. Une purge interrompue est reprise au
   passage suivant, sans double effet.
5. **Les durées sont configurables sans migration**, par entreprise — une politique qu'il
   faut redéployer pour ajuster n'est pas une politique, c'est une constante.

Chaque transition est écrite dans un journal **append-only** : image reçue, purge
programmée, purge effectuée, purge échouée, suppression anticipée, conservation accordée,
conservation expirée, conservation révoquée.

---

## 6. Cloisonnement multi-tenant

Patron existant, sans invention : `entreprise_id` sur chaque table, RLS activée,
`est_membre_actif(entreprise_id)` en lecture, `a_permission(entreprise_id, '<clé>')` en
écriture, politiques `restrictive` cumulatives — exactement ce que font `contacts_clients`,
`fournisseurs` et `reserves_*`.

Nouvelles clés de permission à déclarer dans `permissions_disponibles` :

| Clé | Portée |
|---|---|
| `acces_contact_card` | ouvrir l'application, gérer sa propre carte et son propre carnet |
| `gerer_cartes_entreprise` | créer, attribuer, suspendre, révoquer les cartes de l'entreprise |
| `acces_carnet_partage` | consulter les contacts **versés** au patrimoine de l'entreprise |

### 6.1 La frontière la plus délicate

Le §10 de la mission exige qu'un responsable ne puisse pas consulter sans justification les
contacts personnels reçus par un collaborateur tant qu'ils ne sont pas versés au registre
partagé.

Cela se traduit par une règle de lecture, à porter **en RLS et pas seulement dans
l'interface** :

```
contact non versé   → lisible par son titulaire uniquement
contact versé       → lisible par les porteurs de `acces_carnet_partage`
carte               → visible du responsable (existence, état, activité agrégée)
contenu du carnet   → jamais visible du responsable avant versement
```

`gerer_cartes_entreprise` donne le droit de **révoquer une carte**, jamais celui de **lire un
carnet**. Ce sont deux droits distincts et ils ne doivent jamais être fusionnés « pour
simplifier ».

Un administrateur plateforme ELSATIA n'a pas davantage accès : la migration 234 précise que
le contournement d'administrateur global « ne donne accès qu'à la notion applicative
« application autorisée », jamais un accès SQL cross-tenant aux données métier ».

---

## 7. RGPD

### 7.1 Rôles

L'entreprise titulaire de la carte est **responsable de traitement** des contacts qu'elle
reçoit. ELSATIA est **sous-traitant**. Cela doit figurer aux CGU et au registre — les pages
`cgu`, `cgv`, `confidentialite` et `mentions-legales` existent déjà dans Gestion Pro et
devront couvrir cette application.

### 7.2 Base légale et finalité

Pour la personne qui remplit le formulaire réciproque : **le consentement**, recueilli
explicitement, dont la preuve est conservée.

Finalité, énoncée à la personne au moment de la collecte : permettre au titulaire de la carte
de la recontacter dans un cadre professionnel. **Aucune autre.** Pas de prospection croisée,
pas de constitution d'annuaire, pas de revente, pas de réutilisation par une autre entreprise
de l'écosystème.

### 7.3 Les droits, sans compte

C'est l'exigence la plus concrète, et elle doit être conçue dès le départ :

* **accusé** — la personne reçoit, si elle a laissé une adresse, la confirmation de ce qui a
  été transmis et à qui ;
* **rectification et suppression** — chaque accusé porte un lien à jeton de courte durée,
  permettant de corriger ou de demander la suppression **sans créer de compte** ;
* **suppression effective** — elle efface la soumission, l'image d'origine, et les
  suggestions OCR. Elle **n'efface pas** ce qui a déjà été versé et transformé en fiche
  client de l'entreprise : cette fiche relève alors du responsable de traitement, c'est-à-dire
  de l'entreprise, et la demande doit lui être transmise. Ce point doit être **dit à la
  personne**, pas contourné ;
* **opposition** — une personne peut demander à ne plus être sollicitée par ce titulaire.

`src/app/actions/rgpd.ts` existe côté Gestion Pro et donne le patron des exports et
suppressions.

### 7.4 Conservation

| Donnée | Durée proposée | À arbitrer |
|---|---|---|
| Carte reçue non classée | rappel à 90 jours, archivage à 180 | oui |
| Image d'origine | supprimée après confirmation humaine | **D6** |
| Suggestions OCR | supprimées avec l'image | oui |
| Contact versé | selon la politique de l'entreprise sur ses clients | non — règle existante |
| Preuve de consentement | conservée tant que le contact existe | oui |
| Journal d'audit | aligné sur `journal_activite` | non |

Aucune de ces durées ne doit être écrite en dur : elles doivent être paramétrables et
documentées, sur le modèle de `politiques_conservation_notes_frais` qui existe déjà.

### 7.5 Transferts hors UE

**D1 place l'OCR au périmètre cible**, mais facultatif et **désactivable par entreprise**.
Cela ne supprime pas le sujet : quand il est actif, **les images de cartes de visite partent
chez le fournisseur d'IA** — aujourd'hui OpenAI, seul fournisseur implémenté dans
`src/lib/ai/providers/`. C'est un transfert de données personnelles vers un tiers, qui doit
être mentionné à la politique de confidentialité, porté au registre, et couvert
contractuellement — ce sont les dix points ci-dessous, qui restent à valider (J1 à J3 du
rapport d'audit).

### Le double interrupteur, désormais ordonné (D1, O3)

| Ordre | Niveau | Réglage | Défaut | Qui décide |
|---|---|---|---|---|
| 1 | Plateforme | `contact_ocr_plateforme.autorise` **et** `FEATURE_AI_ENABLED` | **faux** | ELSATIA |
| 2 | Entreprise | `contact_parametres.ocr_actif` | **faux** | l'entreprise cliente |

Les deux doivent être vrais pour qu'une seule image parte, et **l'ordre est contraint** :
une entreprise ne peut pas activer l'OCR tant que la plateforme ne l'a pas autorisé.

Cette règle d'ordre est portée **par la base**, via un déclencheur, et non par l'interface.
Une règle d'ordre qui ne vivrait que dans du TypeScript se contournerait par un appel
direct — et l'enjeu ici est l'envoi de données personnelles à un tiers.

### Le fournisseur est remplaçable (O3)

Le domaine Contact / Card ne parle **jamais** à OpenAI directement : il parle à une
interface, et le fournisseur autorisé est nommé en base, pas codé en dur. C'est le patron
déjà retenu par `src/lib/ai/provider.ts`, dont le commentaire annonce « un futur
`providers/anthropic.ts` ou `providers/gemini.ts` » sans changement ailleurs.

Changer de fournisseur — pour des raisons de coût, de région de traitement ou de contrat —
doit rester une décision d'exploitation, pas une réécriture du produit.

### Les dix points à valider avant toute activation réelle (O3)

Aucun appel n'a été émis vers un fournisseur d'OCR pour produire ce dossier, et aucun ne
doit l'être avant que ces dix points soient tranchés et **consignés** :

| # | Point | Pourquoi il bloque |
|---|---|---|
| 1 | Coût par analyse | sans lui, aucune tarification du produit n'est possible |
| 2 | Contrat applicable | c'est lui qui rend le transfert licite |
| 3 | Localisation / région de traitement | détermine si un transfert hors UE a lieu |
| 4 | Conservation chez le fournisseur | notre purge à 7 jours ne vaut rien si le tiers garde l'image |
| 5 | Information délivrée à l'utilisateur | exigence D2, et preuve à conserver |
| 6 | Registre des traitements | obligation du responsable de traitement |
| 7 | Base juridique | consentement de la personne, ou intérêt légitime — à trancher |
| 8 | Mécanisme de suppression | une demande d'effacement doit atteindre le tiers |
| 9 | Sous-traitants ultérieurs | le fournisseur peut lui-même sous-traiter |
| 10 | Données sensibles éventuelles | une carte peut porter un titre révélant une donnée sensible ; il faut une règle |

Ces dix points sont stockés dans `contact_ocr_plateforme.validations`, et la base **refuse**
l'autorisation plateforme tant que le fournisseur et la région ne sont pas nommés.

C'est le point qui rend le dispositif défendable : **une entreprise qui refuse que les
photos de ses cartes soient envoyées à un tiers coupe l'OCR sans perdre le produit.** La
saisie manuelle reste un parcours complet, pas un mode dégradé.

La base refuse d'activer l'OCR sans trace de l'information donnée ni de qui l'a activée —
`check (not ocr_actif or (ocr_information_affichee_at is not null and ocr_active_par is not
null and ocr_active_at is not null))`, vérifié en recette.

### L'annonce et la confirmation (D2)

Le traitement est **annoncé avant le premier envoi d'image** : ce qui part, chez qui,
pourquoi, et comment couper la fonction. L'horodatage de cette annonce est conservé —
sans lui, on ne peut pas démontrer que le traitement a été porté à la connaissance de
l'entreprise.

La confirmation est ensuite exigée **champ par champ**, jamais globalement. Il n'existe
aucun geste « tout accepter » : c'est précisément celui qui viderait la vérification de son
sens, et l'absence de ce bouton est un choix de conception, pas un oubli d'interface. Un
champ non confirmé n'est jamais repris, et une analyse ne peut pas se clore tant qu'un champ
reste en attente — garanti par contrainte et par déclencheur, tous deux vérifiés en recette.

---

## 8. Ce que les notifications ne doivent pas dire

Une notification externe — e-mail ou push — sort du périmètre authentifié : elle s'affiche sur
un écran verrouillé, transite par un serveur de messagerie, apparaît dans une prévisualisation.

Elle dit donc : qu'une carte est arrivée, de qui **si le nom est déjà connu du titulaire**, et
un lien vers l'application. Elle ne contient **ni téléphone, ni e-mail, ni adresse, ni image**.

Le contenu complet ne s'affiche que dans l'application, après authentification. C'est
l'exigence « les notifications externes ne doivent pas exposer inutilement de données
personnelles », et elle est facile à violer par inadvertance en réutilisant le titre de la
notification interne comme objet d'e-mail.

---

## 9. En-têtes et isolation d'origine

La page publique de carte doit :

* porter `robots: { index: false, follow: false }` — patron de
  `src/app/document/[token]/page.tsx` ;
* servir le QR avec `Cache-Control: private, no-store, max-age=0` et
  `X-Content-Type-Options: nosniff` — patron de `src/app/api/identification/[id]/qr/route.ts` ;
* porter une CSP stricte — Réserves V6 et Colors en ont déjà écrit une, réutilisable ;
* **vivre sur `card.elsatia.fr`** (O4, tranché), origine distincte de `app.elsatia.fr`.

### 9.1 Ce que garantit le domaine dédié

| Exigence | Comment elle est tenue |
|---|---|
| Aucun cookie de session Gestion Pro | origine distincte : le navigateur n'envoie jamais les cookies de `app.elsatia.fr` |
| Aucun accès au stockage authentifié | la page ne lit que ce que la fonction de résolution lui rend — un identifiant de carte |
| Jeton non prédictible | 256 bits d'aléa |
| Jeton stocké sous forme sûre | **sha256 uniquement** ; le jeton en clair n'existe nulle part en base |
| Révocation immédiate | filtre `revoque_at is null` **dans** la fonction de résolution, donc avant tout accès |
| Rate limiting | `rate_limits_applicatifs` + `journal_abus_securite`, clés `contact_carte_ouverture` et `contact_echange_envoi` |
| Anti-indexation configurable | `contact_parametres.indexation_publique_autorisee`, **faux par défaut** |
| Aucune fuite entre locataires | un jeton résout **une** carte, et rien d'autre |
| Aucune donnée par modification d'URL | aucun identifiant séquentiel ni énumérable dans le chemin |
| CSP dédiée | plus stricte que celle de l'application authentifiée |
| Collecte minimale de journaux | un **compteur** d'ouvertures et une date. Ni IP, ni agent, ni référent, ni géolocalisation |
| NFC et QR | même URL révocable, **jamais** les coordonnées, **jamais** un secret permanent |

---

## 10. Risques ouverts

| Risque | Gravité | Traitement |
|---|---|---|
| Énumération de jetons | faible | 256 bits d'aléa ; plafond de résolution par IP |
| Moissonnage de cartes publiques | moyen | plafond, `noindex`, aucune liste ni index public |
| Formulaire réciproque utilisé pour spammer un titulaire | moyen | plafond + journal + possibilité de fermer l'échange sur une carte |
| Carte d'un salarié parti restée active | **élevé** | révocation au départ, **procédure obligatoire** à documenter |
| Contact personnel absorbé sans le vouloir par l'entreprise | **élevé** | versement toujours explicite, jamais par défaut |
| Doublon créé par un rejeu | moyen | `buildIdempotencyKey` sur l'identifiant de carte reçue |
| Image de carte conservée trop longtemps | moyen | **traité (O2)** — 30 j non traitée, 7 j après confirmation, aucune conservation illimitée |
| Conservation exceptionnelle devenant permanente | moyen | **traité (O2)** — expiration obligatoire, libération automatique à l'échéance |
| Transfert d'images à un tiers IA | **élevé** | double interrupteur **ordonné** et *fail-closed* ; les dix points d'O3 restent à valider avant activation |
| Dépendance à un fournisseur d'OCR unique | moyen | **traité (O3)** — interface remplaçable, fournisseur nommé en base |
| Page publique partageant l'origine de l'application | **élevé** | **traité (O4)** — `card.elsatia.fr`, origine distincte |
| Une entreprise subit l'OCR sans l'avoir voulu | moyen | impossible : `ocr_actif` est faux par défaut et son activation est attribuable (D1) |
| Un candidat devient salarié par inadvertance | **élevé** | impossible : `candidats` n'a **aucune** clé étrangère vers `employes` ni la paie (D5), vérifié en recette |
| Notification externe trop bavarde | moyen | §8 |
| Antivirus annoncé mais inexistant | moyen | ne rien annoncer |

---

## 11. Ce qui n'est pas promis

* **Aucun antivirus** : il n'en existe aucun dans l'écosystème aujourd'hui.
* **Aucun chiffrement de bout en bout** des contacts : les données sont chiffrées au repos et
  en transit par l'infrastructure, ce qui n'est pas la même chose et ne doit pas être présenté
  comme telle.
* **Aucune conformité RGPD « clé en main »** : le produit fournit les mécanismes (consentement,
  preuve, rectification, suppression, journal). La conformité reste celle de l'entreprise
  responsable de traitement.
* **Aucune garantie de suppression chez un tiers IA** au-delà de ce que son contrat prévoit.
