# ELSATIA Contact / Card — Spécification fonctionnelle V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
Branche : `audit/elsatia-contact-card-architecture-v1`
Révision : **R3** — O1 à O4, E4 et E5 arbitrées. R2 = `0fd1e32`.
Statut : **spécification**. Rien de ce document n'est implémenté.

Ce document se lit après `ELSATIA-CONTACT-CARD-ARCHITECTURE-AUDIT-REPORT.md`, qui établit ce
qui existe déjà. Il ne redémontre pas les constats d'audit ; il décrit le produit.

---

## 1. Ce qu'est le produit

Une carte de visite professionnelle ELSATIA, dans laquelle **la carte physique n'est qu'un
porteur d'URL**. Toute l'information vit dans le profil, en ligne, modifiable.

Trois gestes, et rien d'autre :

1. **je donne** mes coordonnées, sans que l'autre installe quoi que ce soit ;
2. **je reçois** les coordonnées de l'autre, s'il le veut bien ;
3. **je range** ce que j'ai reçu, au bon endroit, après l'avoir vérifié.

Le troisième geste est celui qui a de la valeur et que les cartes concurrentes traitent mal :
une carte reçue n'est utile que si elle finit dans le bon registre, sans doublon, sans
ressaisie, et sans qu'un automatisme ait décidé à la place de l'utilisateur.

## 2. Principe directeur

> **Aucune information reçue ne devient une fiche métier sans qu'un humain l'ait vue,
> corrigée et validée.**

Ce n'est pas une précaution rédactionnelle : c'est déjà la règle de l'écosystème, écrite dans
`@elsatia/client-contracts` (portée `client:propose`, résolution `manual` par défaut) et dans
le `check` de `colors_analyses_ocr` qui refuse un statut « confirmée » sans confirmateur ni
date de confirmation. Contact / Card l'applique, il ne l'invente pas.

---

## 2 bis. Le parcours réciproque, de bout en bout

C'est le parcours central du produit. Les neuf étapes, dans l'ordre, avec **ce qui est
automatique** et **ce qui exige un geste humain** — la distinction est le produit lui-même.

| # | Étape | Qui agit | Automatique ? |
|---|---|---|---|
| 1 | **Je transmets ma carte** — NFC approché, QR scanné, lien envoyé | moi | l'ouverture de la page, oui |
| 2 | **Le destinataire enregistre ma vCard**, sans installer d'application | lui | le fichier est construit à la demande, à partir des seuls champs autorisés |
| 3 | **Il reçoit une proposition facultative** de transmettre ses coordonnées en retour | lui | la proposition s'affiche ; **rien n'est présélectionné, rien n'est forcé** |
| 4 | **Je reçois sa carte dans ma boîte de réception** | — | oui, avec notification idempotente |
| 5 | **Je vérifie les informations** | **moi — obligatoire** | **non.** Si l'OCR a tourné, chaque champ est confirmé **individuellement** |
| 6 | **Je sélectionne la destination** : client, prospect, fournisseur, sous-traitant, partenaire, candidat ou contact général | **moi — obligatoire** | **non.** Jamais déduite du texte de la carte |
| 7 | **Gestion Pro détecte les doublons** | — | oui — la *détection* est automatique, **la décision ne l'est pas** |
| 8 | **Je confirme la création ou le rattachement** | **moi — obligatoire** | **non** |
| 9 | **Je reçois une notification** indiquant précisément où la carte a été rangée | — | oui, **une seule fois** |

Trois écrans humains — étapes 5, 6 et 8 — que **rien ne peut contourner**, quelle que soit
la confiance de la reconnaissance. C'est l'application directe de D3 et D9 : Contact / Card
propose, Gestion Pro confirme.

Aux étapes 6 et 8, la destination affichée est celle qui existe réellement : les sept
catégories ont désormais toutes un registre cible (décisions D4, D5 et D6), et l'écran de
confirmation nomme la fiche qui sera créée ou rattachée avant de l'écrire.

---

## 3. Objets du produit

| Objet | Rôle | Propriétaire |
|---|---|---|
| **Carte** | Support émis par l'entreprise : jeton public, état, historique | l'entreprise |
| **Profil** | Ce qui s'affiche : identité, coordonnées, liens, visuels | le titulaire |
| **Lien public** | Jeton révocable qui résout vers une carte active | l'entreprise |
| **Carte reçue** | Ce qu'on a récupéré de quelqu'un, non encore rangé | le titulaire |
| **Analyse** | Suggestions OCR + confiance par champ (si activé) | rattachée à la carte reçue |
| **Contact du carnet** | Contact rangé, utilisable sans Gestion Pro | le titulaire, puis l'entreprise si versé |
| **Proposition** | Demande de versement vers Gestion Pro, idempotente | l'entreprise |

### 3.1 États d'une carte

`brouillon → active → suspendue → révoquée`

`active ↔ suspendue` est réversible. **`révoquée` est terminal** : le jeton ne résout plus
jamais, et un nouveau jeton implique une nouvelle carte. C'est ce qui rend la perte d'une
carte physique sans conséquence.

### 3.2 États d'une carte reçue

Les dix états exigés au §9 de la mission :

`reçue → ocr_en_attente → à_vérifier → à_classer → doublon_possible → classée →
synchronisation_en_cours → synchronisée`, plus `erreur` et `archivée`.

### 3.2 bis États de l'image — un cycle distinct de celui de la carte

`statut` décrit la **carte**, `image_statut` décrit l'**image**. Les confondre rendrait
impossible l'état qui est précisément le but de la politique de conservation : *carte
classée, données conservées, image supprimée*.

```
image :  absente → présente → à_supprimer → supprimée
                        ↘ conservation_exceptionnelle ↗
                        ↘ erreur_suppression ↻ (reprise)
```

| Règle | Traduction |
|---|---|
| Carte reçue jamais traitée | image purgeable à **30 jours** |
| Carte vérifiée et confirmée | image supprimée sous **7 jours** |
| Suppression anticipée | possible à tout moment, à la demande |
| Conservation prolongée | **action manuelle uniquement**, avec motif, auteur et date d'expiration |
| Conservation illimitée | **impossible** — l'expiration est obligatoire, et une conservation échue redevient purgeable d'elle-même |
| Suppression de l'image | **ne supprime jamais** les données structurées légitimement conservées |
| Image ayant échoué à l'OCR | reste purgeable — aucun état d'erreur ne bloque la purge |
| Purge | **idempotente** : la rejouer ne produit aucun effet supplémentaire |
| Durées | **configurables sans migration**, par entreprise |

La purge marque, elle n'efface pas : l'effacement du stockage appartient à l'application,
qui confirme ensuite. C'est cette séparation qui rend la reprise sûre après une coupure —
une image marquée mais non effacée est reprise au passage suivant, sans double effet.

Sans OCR, le chemin est direct : `reçue → à_vérifier`. `ocr_en_attente` n'apparaît que si
**les deux interrupteurs** sont fermés (D1) : `FEATURE_AI_ENABLED` côté plateforme **et**
`contact_parametres.ocr_actif` côté entreprise. Les deux sont *fail-closed* ; l'entreprise
peut couper l'OCR sans perdre le produit.

Transitions interdites, à faire respecter par la base et non seulement par l'interface :

* `reçue → classée` — on ne classe pas ce qu'on n'a pas vérifié ;
* `doublon_possible → synchronisée` — on ne synchronise pas un doublon non arbitré ;
* toute transition sortant de `archivée`.

---

## 4. Parcours

### P1 — Créer une carte

Responsable des cartes ou administrateur. Choix du titulaire parmi les membres actifs de
l'entreprise, saisie du profil, sélection des champs publics. La carte naît en `brouillon` :
**son jeton n'est émis qu'à l'activation**, pour qu'un brouillon abandonné ne laisse jamais
d'URL vivante.

### P2 — Partager par NFC

La puce contient **une seule chose** : `https://<domaine>/c/<token>`.
Pas de vCard embarquée, pas de nom, pas de téléphone, pas de clé. Une puce lue par un tiers
malveillant ne donne rien de plus que l'URL publique — que le titulaire peut révoquer.

Le jeton est écrit en NFC et **repris à l'identique** dans le QR code : c'est ce qui garantit
le test « le QR et le NFC désignent la même carte ».

### P3 — Partager par QR code

QR généré à la demande, jamais stocké en image. `qrcode` est déjà une dépendance du dépôt et
`src/app/api/identification/[id]/qr/route.ts` fournit le patron exact, y compris ses
en-têtes : `Cache-Control: private, no-store, max-age=0` et `X-Content-Type-Options: nosniff`.

### P4 — Ouvrir sans application

Une page publique, légère, sans authentification, sans navigation vers l'application, avec
`robots: { index: false, follow: false }`.

Elle affiche **exactement** les champs que le titulaire a autorisés, et rien d'autre. Le
jeton résout une carte et une seule : il n'est pas un chemin vers l'entreprise.

Si la carte est suspendue ou révoquée : une page neutre. **Pas de « cette carte a été
révoquée par Sophie Martin » — qui serait déjà une fuite d'information.**

### P5 — Enregistrer dans ses contacts

Bouton unique « Ajouter à mes contacts » → fichier vCard 3.0 construit **au moment de la
demande**, uniquement à partir des champs autorisés. Un champ masqué dans le profil est
absent du fichier ; il n'est pas masqué à l'affichage puis réintroduit dans le fichier.

Les actions appeler / écrire / e-mail / site ne sont proposées que pour les canaux autorisés.

### P6 — Proposer l'échange réciproque

Sous les coordonnées, jamais en interstitiel, jamais bloquant :

> **Souhaitez-vous partager vos coordonnées en retour ?**
> *Facultatif. Vos informations seront transmises à `<Prénom Nom>` — `<Entreprise>`.*

Deux réponses possibles :

* **« J'ai une carte ELSATIA »** → il choisit sa propre carte ; l'échange est carte à carte,
  sans ressaisie, avec les données déjà structurées ;
* **« Je remplis mes coordonnées »** → formulaire minimal : prénom, nom, fonction,
  entreprise, e-mail, téléphone, mobile, site, adresse professionnelle, contexte de la
  rencontre, **case de consentement explicite non cochée par défaut**.

Le bouton d'envoi est inactif tant que le consentement n'est pas coché. Le formulaire dit
nommément à qui les données sont transmises. Il est plafonné par `rate_limits_applicatifs`,
et les dépassements sont écrits dans `journal_abus_securite` — deux tables existantes.

### P7 — Recevoir une réponse

La carte reçue arrive dans la boîte de réception du **titulaire** en `à_vérifier` (une
réponse de formulaire est déjà structurée : elle ne passe pas par l'OCR). Une notification
est créée, avec une clé d'idempotence.

### P8 — Photographier une carte papier

Photo ou import (image, PDF). L'original va dans un bucket **privé**. Validation MIME et
taille avant tout traitement.

**Si l'un des deux interrupteurs est ouvert — ce qui est le cas par défaut — aucun OCR n'est
proposé.** L'écran passe directement en saisie manuelle assistée, avec la photo affichée à
côté du formulaire. C'est un parcours complet, pas un parcours dégradé : il est simplement
honnête.

**Si l'OCR est actif**, l'utilisateur en est informé **avant** que la première image ne
parte (D2) : ce qui est envoyé, à qui, pourquoi, et comment couper la fonction. L'information
est donnée une fois par entreprise, pas à chaque carte — un bandeau répété n'est plus lu.

**Les deux interrupteurs sont ordonnés** (O3) : l'entreprise ne peut pas activer l'OCR si
la plateforme ne l'a pas autorisé. L'ordre est porté par la base, pas par l'interface — une
règle d'ordre qui ne vivrait que dans du TypeScript se contournerait par un appel direct.

**Le fournisseur est remplaçable.** Le domaine Contact / Card parle à une interface, jamais
à OpenAI directement — sur le modèle de `ProviderIA` (`src/lib/ai/provider.ts`), dont le
commentaire prévoit déjà « un futur `providers/anthropic.ts` ou `providers/gemini.ts` »
sans changement ailleurs. Changer de fournisseur doit rester une décision d'exploitation,
pas une réécriture du produit.

### P9 — Vérifier l'OCR

Chaque champ reconnu s'affiche avec sa confiance, sur trois niveaux visuels : **fiable**,
**à vérifier**, **incertain**. Un champ incertain est signalé, jamais pré-validé
silencieusement.

**La confirmation est champ par champ (D2), jamais globale.** Il n'existe pas de bouton
« tout accepter » : c'est précisément le geste qui vide la vérification de son sens. Chaque
champ retenu porte son propre confirmateur et son propre horodatage, dans
`contact_analyses_ocr_champs`. Un champ non confirmé n'est **pas repris**, même s'il est
donné comme fiable.

L'utilisateur peut corriger, supprimer un champ erroné, compléter, désigner les coordonnées
principales, confirmer l'entreprise, ou abandonner l'import.

Rien ne franchit cet écran sans un geste explicite, et l'analyse ne peut pas passer en
« confirmée » tant qu'un seul champ retenu reste non confirmé — garanti en base, sur la
forme de `colors_analyses_ocr` (`confirme_par` **et** `confirme_at` obligatoires).

### P9 bis — Ranger la bonne donnée au bon endroit

Une carte de visite mélange **les coordonnées de l'organisation** et **celles de la
personne**. Les verser au même endroit produit des fiches fausses : une SARL qui a un
mobile, un commercial qui a un standard.

Le scanner **propose** donc une cible par champ :

| Donnée reconnue | Cible proposée |
|---|---|
| Site Internet | organisation |
| Standard téléphonique | organisation |
| Adresse postale | organisation |
| Ligne directe | **interlocuteur** |
| Mobile personnel | **interlocuteur** |
| Fonction | **interlocuteur** |

**Toute proposition reste modifiable avant validation.** Une suggestion qu'on ne peut pas
contredire est une décision déguisée.

Deux règles qui ne se négocient pas :

* on n'attribue **pas** de mobile à une personne morale — la base le refuse ;
* un **client particulier** est une personne physique : son mobile va bien sur sa fiche.

### P10 — Détecter un doublon

Avant tout classement, comparaison via `@elsatia/client-contracts` (§8 du rapport d'audit).
Les correspondances s'affichent avec leur degré de confiance et **ce qui a déclenché la
correspondance** — « même SIRET », « même e-mail » — parce qu'un utilisateur ne peut pas
arbitrer un rapprochement dont il ignore la cause.

Six choix, aucun par défaut : rattacher à une entreprise existante · ajouter comme nouvel
interlocuteur · compléter une fiche existante · fusionner après validation · conserver
séparément · laisser en attente.

**Aucune fusion destructive n'est automatique.** Une fusion validée conserve la provenance de
chaque champ : ce qui vient de la carte reste identifiable comme tel.

### P11 — Classer

Neuf catégories : prospect · client · fournisseur · sous-traitant · partenaire · candidat ·
contact professionnel général · à classer plus tard · autre catégorie configurable.

**Une destination principale est obligatoire** — c'est elle qui rend la navigation
compréhensible.

**Les rôles multiples sont autorisés (D4)** là où le modèle cible les porte réellement.
Le cas nommé — fournisseur **et** sous-traitant — devient possible : une seule fiche tiers,
deux rôles, aucun doublon. Le cumul inter-registres (« client et partenaire ») passe par un
lien déclaré entre les deux fiches, sans fusion et sans fiche principale imposée.

Deux garde-fous qui ne bougent pas :

* « Candidat / futur employé » crée **uniquement une proposition de candidat** (D5). Jamais
  un salarié, jamais un contrat, jamais une donnée de paie. L'écran le dit.
* Le rôle n'est **jamais** déduit du texte de la carte (D3). Une suggestion peut être
  affichée — « cette entreprise ressemble à un fournisseur existant » — elle n'est jamais
  préappliquée.

### P12 — Confirmer le classement

Écran de confirmation qui montre, avant écriture : la destination, ce qui sera créé ou
rattaché, ce qui sera écrasé — **rien ne doit être écrasé sans être montré** — et l'état du
lien avec Gestion Pro.

Si Gestion Pro n'est pas lié, le contact est rangé dans le carnet Contact / Card, et l'écran
le dit clairement plutôt que de laisser croire à un versement.

### P13 — Être notifié

Notification immédiate, et notification non lue visible à la connexion suivante
(`notifications_utilisateurs.lue_at`). Chaque notification porte la personne, l'entreprise si
connue, l'origine de la carte, la destination choisie, l'état de synchronisation, et un lien
d'ouverture.

Modèles :

* « Nouvelle carte reçue : Sophie Martin — Bâtiment Martin. Elle est en attente de classement. »
* « La carte de Sophie Martin a été ajoutée aux clients de Gestion Pro. »
* « La carte de Pierre Dupont a été rattachée au fournisseur Dupont Matériaux. »
* « Un doublon possible a été détecté. Vérification nécessaire. »

**Clé d'idempotence obligatoire**, construite sur `(carte_recue_id, type_evenement,
destinataire)` — jamais sur l'horodatage. L'index existant de `notifications_utilisateurs`
inclut `created_at` et ne protège donc de rien ; le patron correct est
`reserves_notifications_envois.cle_idempotence unique`.

Les notifications externes (e-mail, push) ne portent **pas** les coordonnées reçues : elles
disent qu'une carte est arrivée et renvoient vers l'application.

### P14 — Ouvrir la fiche dans Gestion Pro

Lien direct vers `/clients/<id>` ou `/fournisseurs/<id>`. Si la synchronisation a échoué, le
lien est remplacé par la cause et une action de reprise — jamais par un lien mort.

### P15 — Gérer les cartes d'une équipe

Liste des cartes : titulaire, état, date d'activation, dernière activité.
Actions : créer, attribuer, suspendre, révoquer, remplacer, historique.

**Ce que le responsable ne voit pas : les contacts non versés d'un collaborateur.** Il voit
qu'une carte a reçu des contacts, pas lesquels. C'est la frontière du §10 de la mission, et
elle doit être portée par les politiques RLS, pas seulement par l'interface.

Départ d'un salarié : révocation de la carte, et **choix explicite** sur le carnet personnel —
versé à l'entreprise, ou conservé par la personne. Un choix, pas un défaut silencieux.

### P15 bis — Plusieurs cartes du même fournisseur

Recevoir la carte de deux commerciaux de « Dupont Matériaux » doit produire **un
fournisseur et deux interlocuteurs**, jamais deux fournisseurs.

L'écran de classement le montre explicitement : quand la détection de doublon reconnaît
l'organisation, le choix par défaut proposé est « ajouter comme nouvel interlocuteur », et
la création d'un second tiers demande un geste délibéré assorti d'un avertissement.

Un interlocuteur qui quitte l'entreprise passe **inactif** : il n'est pas supprimé, le
fournisseur n'est pas touché, et l'historique reste lisible. La place d'interlocuteur
principal se libère alors pour son remplaçant.

### P16 — Révoquer une carte perdue

Un geste, immédiat, irréversible. Dans la seconde qui suit, l'ancienne URL ne renvoie plus
rien — garanti par le filtre `revoque_le is null` **dans la fonction de résolution**, donc
avant tout accès aux données, et non par un contrôle d'affichage.

---

## 5. Fonctionnement sans Gestion Pro

Contact / Card est autonome. Sans Gestion Pro, il offre : carnet de contacts, boîte de
réception, classement local, recherche, notes, export, gestion des doublons, gestion des
cartes.

L'activation ultérieure de Gestion Pro déclenche une **migration contrôlée** : l'utilisateur
choisit ce qu'il verse, contact par contact ou par lot ; chaque versement passe par la
détection de doublon ; rien n'est versé sans validation ; l'historique du carnet est
conservé. La liaison est optionnelle, explicite, et **révocable** — la révoquer ne supprime
rien de ce qui a déjà été versé, elle arrête les versements futurs.

---

## 6. Hors ligne

Cible : terrain et salons. Photo conservée localement chiffrée, brouillon de contact, file de
synchronisation, état visible en permanence, reprise idempotente, gestion des conflits,
suppression locale après synchronisation selon la politique retenue.

L'implémentation de référence existe : `apps/reserves/src/lib/offline/` et
`apps/reserves/public/sw-reserves.js`.

> **Aucun fonctionnement hors ligne ne sera annoncé sans preuve E2E.** Réserves a déjà connu
> ce piège : le hors-ligne V4 était annoncé et mesuré inexistant ; il n'est devenu réel qu'en
> V5. Contact / Card n'annonce rien avant la même preuve.

---

## 7. Interface

Priorité au téléphone. Le parcours le plus fréquent — recevoir une carte dans un couloir de
salon, la vérifier, la ranger — doit tenir sur un écran de téléphone, à une main, debout.

Règles : une action principale par écran ; le vocabulaire du métier (« fournisseur »,
« sous-traitant », « chantier »), jamais le vocabulaire technique (« entité », « payload »,
« synchronisation ») ; aucune abréviation ; les états dits en français
(« en attente de classement », pas « PENDING ») ; contraste et cibles tactiles suffisants ;
toute action destructive confirmée et montrant ce qu'elle détruit.

Des wireframes fonctionnels isolés accompagnent ce document :
`docs/audits/contact-card-wireframes/index.html` — fichier autonome qui ne touche aucun
produit existant.

---

## 8. Tests attendus

À écrire au lot de réalisation. **Aucun test de produit n'est exécuté ici** : le produit
n'existe pas.

En revanche, **neuf recettes de schéma ont bien été exécutées** en R2 sur un conteneur
jetable — application du SQL proposé sur les 272 migrations, puis huit tests négatifs
d'invariants. Voir §10.1 du rapport d'audit. Les tests ci-dessous portent sur le
comportement du produit, que cette recette ne couvre pas.

### Carte et lien public
1. Un lien NFC ouvre le bon profil.
2. Le QR code et le NFC désignent la même carte (même jeton).
3. La carte reste fonctionnelle après modification du profil (téléphone, e-mail, poste, entreprise, photo, logo, liens).
4. Une carte révoquée n'expose plus aucune coordonnée.
5. Une ancienne URL ne révèle rien après révocation.
6. Une carte suspendue puis réactivée retrouve le même jeton.
7. Aucun secret ni donnée personnelle n'est présent dans le NFC ou le QR — seule une URL.
8. Un brouillon jamais activé n'a aucun jeton résoluble.

### vCard
9. La vCard ne contient que les champs autorisés.
10. Un champ masqué dans le profil est absent de la vCard.

### Échange réciproque
11. Le partage réciproque est facultatif : refuser n'empêche pas d'enregistrer la carte.
12. Un formulaire ne peut pas être envoyé sans consentement coché.
13. Le formulaire nomme le destinataire des coordonnées.
14. Le plafond de soumissions est appliqué et l'abus journalisé.
15. Un contact reçu apparaît dans la boîte du bon titulaire, et d'aucun autre.

### OCR — D1, D2, D3
16. L'OCR ne déclenche aucune création automatique, quelle que soit la confiance.
17. Chaque champ incertain est signalé visuellement.
18. `FEATURE_AI_ENABLED` absent ou faux ⇒ aucun appel OCR n'est émis.
19. `contact_parametres.ocr_actif` faux ⇒ aucun appel OCR n'est émis, **même si la plateforme l'autorise**.
20. Les deux interrupteurs sont vrais ⇒ l'OCR est proposé, et **reste refusable** carte par carte.
21. Couper l'OCR au niveau de l'entreprise ne casse aucun parcours : la saisie manuelle reste complète.
22. L'information sur le traitement OCR est présentée **avant** le premier envoi d'image.
23. Un champ non confirmé individuellement n'est **jamais** repris dans le contact.
24. Il n'existe **aucun** geste de confirmation globale (« tout accepter ») dans l'interface.
25. Une analyse ne peut pas passer en « confirmée » tant qu'un champ retenu reste non confirmé.
26. Chaque champ confirmé porte son propre confirmateur et son propre horodatage.

### Classement — D4, D5, D6
27. La classification client crée ou rattache correctement le contact.
28. La classification fournisseur crée le rôle `fournisseur` sur le tiers.
29. La classification sous-traitant crée le rôle `sous_traitant`, et **n'écrit jamais** dans `sous_traitants_chantiers`.
30. **Un même tiers peut porter les deux rôles simultanément**, sans créer de seconde fiche.
31. Retirer un rôle à un tiers qui en porte deux ne supprime pas la fiche.
32. La classification partenaire écrit dans `partenaires`.
33. La classification contact général écrit dans `contacts_professionnels`.
34. La classification candidat crée une **proposition de candidat**, et rien d'autre.
35. Aucun chemin, quel qu'il soit, ne crée un `employes`, un contrat de travail ou une donnée de paie.
36. Un lien inter-registres (client **et** partenaire) n'entraîne aucune fusion des deux fiches.
37. Le rôle n'est jamais déduit du seul texte de la carte.
38. Une destination principale est obligatoire.

### Versement et contrat — D9
39. Rejouer un transfert ne crée pas un second client, fournisseur ou partenaire.
40. Contact / Card n'émet **jamais** une enveloppe en portée `client:write`.
41. Une enveloppe en `client:propose` ne produit aucune écriture avant confirmation humaine.
42. `prenom` et `telephone_mobile` d'une carte scannée arrivent intacts dans `contacts_clients` (D7).

### Doublons
43. Un doublon n'est jamais fusionné automatiquement.
44. Une fusion validée conserve la provenance de chaque champ.
45. Un conflit `duplicate_identity` arrête le transfert.

### Notifications — D8
46. La notification indique la bonne destination et la fiche exacte où la carte a été rangée.
47. La notification n'est créée qu'une seule fois, y compris après rejeu.
48. **Deux exécutions de la même action métier à des horodatages différents ne produisent qu'une notification.**
49. L'utilisateur peut ouvrir la fiche depuis la notification.
50. Une notification externe ne contient pas les coordonnées reçues.

### Isolation
51. Les contacts restent isolés entre entreprises.
52. Une entreprise ne peut pas consulter les cartes reçues par une autre.
53. Un responsable ne peut pas lire le carnet non versé d'un collaborateur.
54. Le jeton public ne donne accès à aucune autre donnée de l'entreprise.

### Conservation des images — O2
60. Une carte reçue et jamais traitée voit son image purgée après **30 jours**.
61. L'image d'une carte confirmée est supprimée **sept jours** après la confirmation.
62. Les données structurées survivent intégralement à la suppression de l'image.
63. Une suppression anticipée à la demande fonctionne à tout moment.
64. Une conservation exceptionnelle exige motif, auteur **et** date d'expiration.
65. Une conservation exceptionnelle échue redevient purgeable automatiquement.
66. Aucune conservation ne peut être illimitée, y compris par erreur de saisie.
67. Une image dont l'OCR a échoué reste purgeable.
68. **La purge est idempotente** : deux exécutions consécutives ne produisent pas deux effets.
69. Une purge interrompue est reprise au passage suivant, sans double suppression.
70. Modifier les durées de conservation ne demande aucune migration.
71. Chaque transition d'image écrit une ligne de journal, et une seule.

### Fournisseur OCR et domaine public — O3, O4
72. Une entreprise ne peut **pas** activer l'OCR si la plateforme ne l'a pas autorisé.
73. Aucune requête n'est émise vers le fournisseur quand l'OCR est désactivé, à l'un ou l'autre niveau.
74. Changer de fournisseur OCR ne modifie aucun code du domaine Contact / Card.
75. La page `card.elsatia.fr` ne reçoit **aucun cookie de session** Gestion Pro.
76. La page publique n'accède à aucun stockage authentifié.
77. Une carte révoquée est **immédiatement** inaccessible sur son ancienne URL.
78. Modifier l'URL publique ne donne accès à aucune donnée supplémentaire.
79. Le plafond de requêtes est appliqué sur l'ouverture de carte et sur l'envoi du formulaire.
80. L'anti-indexation est actif par défaut et configurable par entreprise.
81. Les journaux de la page publique ne contiennent ni IP, ni agent, ni référent.

### Interlocuteurs de tiers — E4, E5
82. **Deux cartes du même fournisseur produisent deux interlocuteurs et un seul fournisseur.**
83. Fournisseur et sous-traitant se cumulent **sans dupliquer l'organisation**.
84. Un interlocuteur devient inactif sans supprimer ni modifier le tiers.
85. Un seul interlocuteur principal actif par tiers ; l'inactiver libère la place.
86. Le mobile reconnu est affecté à l'**interlocuteur**, le site Internet à l'**organisation**.
87. Un standard téléphonique est affecté à l'organisation, une ligne directe à l'interlocuteur.
88. Toute cible proposée par le scanner est modifiable avant validation.
89. Un **client particulier** conserve son mobile sur sa fiche personnelle.
90. Une personne morale ne peut pas se voir attribuer un mobile.
91. `public.contacts_clients` n'est ni lue, ni écrite, ni modifiée par Contact / Card.
92. Un interlocuteur ne peut pas être rattaché à un tiers d'un **autre locataire**.

### Autonomie et mobile — D10
55. Le parcours complet fonctionne sur mobile.
56. Le produit reste utilisable sans Gestion Pro : carnet, réception, recherche, classement, doublons, export.
57. L'export du carnet autonome est complet et relisible.
58. L'activation ultérieure de Gestion Pro ne crée pas de doublon et ne perd pas d'historique.
59. Révoquer la liaison Gestion Pro n'efface rien de ce qui a déjà été versé.

---

## 9. Ce que cette spécification ne promet pas

* **Un calendrier.** L'OCR (D1), les rôles multiples (D4), le vivier (D5), les registres
  (D6), `prenom`/`telephone_mobile` (D7) et l'idempotence des notifications (D8) sont au
  périmètre cible et **suspendus à la réouverture du train** : aucune migration ne peut
  entrer aujourd'hui.
* **Un taux de reconnaissance OCR.** Aucun code OCR n'existe encore dans le dépôt ; aucun
  chiffre ne sera annoncé avant mesure.
* **Un fonctionnement hors ligne**, tant qu'aucune preuve E2E n'existe.
* **La création automatique d'une fiche**, quelle qu'elle soit : c'est un refus de
  conception, pas une limite temporaire (D3, D9).
* **Le passage automatique d'un candidat au statut de salarié** : le vivier ne touche jamais
  la paie (D5).
* **Toute donnée commerciale** — prix, délai, garantie, stock, remboursement : hors périmètre,
  et rien n'en est inventé ici.
