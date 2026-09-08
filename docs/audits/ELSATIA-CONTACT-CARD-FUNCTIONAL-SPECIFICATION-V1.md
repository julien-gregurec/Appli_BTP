# ELSATIA Contact / Card — Spécification fonctionnelle V1

Base : `1fc1331842cdf5980b374169994587813bdee7b6`
Branche : `audit/elsatia-contact-card-architecture-v1`
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

Sans OCR, le chemin est direct : `reçue → à_vérifier`. `ocr_en_attente` n'apparaît que si
`FEATURE_AI_ENABLED` est vrai.

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

**Si `FEATURE_AI_ENABLED` est faux — ce qui est le cas par défaut — aucun OCR n'est proposé.**
L'écran passe directement en saisie manuelle assistée, avec la photo affichée à côté du
formulaire. C'est un parcours complet, pas un parcours dégradé : il est simplement honnête.

### P9 — Vérifier l'OCR

Chaque champ reconnu s'affiche avec sa confiance, sur trois niveaux visuels : **fiable**,
**à vérifier**, **incertain**. Un champ incertain est signalé, jamais pré-validé
silencieusement.

L'utilisateur peut corriger, supprimer un champ erroné, compléter, désigner les coordonnées
principales, confirmer l'entreprise, ou abandonner l'import.

Rien ne franchit cet écran sans un geste explicite. La forme est celle de
`colors_analyses_ocr` : `statut = 'confirmee'` exige `confirme_par` **et** `confirme_at`,
garanti par un `check` en base.

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
compréhensible. Des rôles secondaires sont possibles quand le modèle cible les autorise
réellement ; aujourd'hui il ne les autorise pas pour fournisseur/sous-traitant (décision D2
du rapport d'audit), et l'interface doit le dire plutôt que de faire semblant.

Le rôle n'est **jamais** déduit du texte de la carte. Une suggestion peut être affichée
(« cette entreprise ressemble à un fournisseur existant ») ; elle n'est jamais préappliquée.

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

À écrire au lot de réalisation. **Aucun n'est exécuté ici** : le produit n'existe pas.

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

### OCR
16. L'OCR ne déclenche aucune création automatique, quelle que soit la confiance.
17. Chaque champ incertain est signalé visuellement.
18. `FEATURE_AI_ENABLED` absent ou faux ⇒ aucun appel OCR n'est émis.
19. Une analyse ne peut pas passer en « confirmée » sans confirmateur ni date.

### Classement
20. La classification client crée ou rattache correctement le contact.
21. La classification fournisseur écrit dans `fournisseurs`, `type_tiers = 'fournisseur'`.
22. La classification sous-traitant écrit dans `fournisseurs`, `type_tiers = 'sous_traitant'`, et **n'écrit jamais** dans `sous_traitants_chantiers`.
23. La classification candidat ne crée jamais d'`employes`, ni de contrat, ni de donnée de paie.
24. Le rôle n'est jamais déduit du seul texte de la carte.
25. Une destination principale est obligatoire.

### Idempotence et doublons
26. Rejouer un transfert ne crée pas un second client ou fournisseur.
27. Un doublon n'est jamais fusionné automatiquement.
28. Une fusion validée conserve la provenance de chaque champ.
29. Un conflit `duplicate_identity` arrête le transfert.

### Notifications
30. La notification indique la bonne destination.
31. La notification n'est créée qu'une seule fois, y compris après rejeu.
32. L'utilisateur peut ouvrir la fiche depuis la notification.
33. Une notification externe ne contient pas les coordonnées reçues.

### Isolation
34. Les contacts restent isolés entre entreprises.
35. Une entreprise ne peut pas consulter les cartes reçues par une autre.
36. Un responsable ne peut pas lire le carnet non versé d'un collaborateur.
37. Le jeton public ne donne accès à aucune autre donnée de l'entreprise.

### Autonomie et mobile
38. Le parcours complet fonctionne sur mobile.
39. Le produit reste utilisable sans Gestion Pro.
40. L'activation ultérieure de Gestion Pro ne crée pas de doublon et ne perd pas d'historique.

---

## 9. Ce que cette spécification ne promet pas

* **L'OCR de carte papier.** Aucun code OCR n'existe dans le dépôt. Sous réserve de la
  décision D5, la V1 se limite aux entrées structurées et à la saisie manuelle.
* **Un fonctionnement hors ligne**, tant qu'aucune preuve E2E n'existe.
* **Une destination Gestion Pro** pour « partenaire », « candidat » et « contact général » :
  ces modèles n'existent pas (décisions D3 et D4).
* **Le multi-rôle fournisseur/sous-traitant**, interdit par la base (décision D2).
* **Toute donnée commerciale** — prix, délai, garantie, stock, remboursement : hors périmètre,
  et rien n'en est inventé ici.
