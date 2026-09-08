# ELSATIA Contact / Card — Modèle de vie privée et de sécurité V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
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
| Conservation | l'original est supprimé après confirmation humaine des données extraites — délai à fixer (décision D6) |

Une photo de carte de visite contient un nom, un employeur, un téléphone et souvent un
visage. Elle est aussi sensible que le contact lui-même, et parfois plus.

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

Si l'OCR est activé (décision D5), **les images de cartes de visite partent chez le
fournisseur d'IA** — aujourd'hui OpenAI, seul fournisseur implémenté dans
`src/lib/ai/providers/`. C'est un transfert de données personnelles vers un tiers, qui doit
être : mentionné à la politique de confidentialité, porté au registre, et couvert
contractuellement.

> **Tant que ce point n'est pas tranché, `FEATURE_AI_ENABLED` reste faux.** La porte est
> déjà *fail-closed* : variable absente ⇒ IA indisponible. C'est le bon défaut et il ne doit
> pas être inversé.

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
* **ne partager aucune origine avec l'application authentifiée** (décision D7). Une page
  publique atteignable par n'importe qui ne doit pas vivre sur le domaine qui porte les
  cookies de session de Gestion Pro.

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
| Image de carte conservée trop longtemps | moyen | D6 |
| Transfert d'images à un tiers IA | **élevé** | D5, drapeau fail-closed |
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
