# ELSATIA Réserves — V3 « Collaboration et livrables »

Branche : `feat/reserves-v3-collaboration-livrables`
Migration : `20260907000270_reserves_v3_collaboration_livrables_v1.sql` (ledger **270**)
Base : V2 `feat/reserves-v2-terrain-capture` @ `9652189`

La V2 rendait Réserves utilisable **sur un chantier**. La V3 la rend utilisable **entre
entreprises** : inviter sans identifiant technique, être prévenu sans surveiller
l'application, et transmettre un document opposable à chaque corps d'état.

---

## 1. Ledger : audit avant migration

Le cadrage demandait de ne pas présumer que 270 était libre. Les **45 branches** du dépôt
(locales et distantes) ont été inventoriées :

| Constat | Détail |
|---|---|
| Numéro le plus haut existant | `00269` (V2 Réserves) |
| Collision détectée | `00266` porté par deux branches (`platform_global_owner_all_apps` et `support_reply_notification_recipient`) — **déjà réconciliée** sur la lignée V2, où support_reply est passé en `00267` |
| Numéro retenu | **`00270`**, libre sur toutes les branches |

`npm run verify:migrations` : 268 migrations valides, noms et horodatages uniques.

---

## 2. Annuaire des organisations

Le besoin : supprimer la saisie d'un `entreprise_id`. Le risque : transformer l'annuaire en
export du fichier client d'ELSATIA. Deux mécanismes **distincts** répondent aux deux :

- **SIRET exact (14 chiffres)** → interroge toutes les organisations. Un SIRET est une
  donnée publique du registre national : il se lit sur un devis, il ne s'énumère pas. Un
  préfixe ne cherche rien. La divulgation se limite au nom, à la ville et au fait que
  l'organisation utilise déjà Réserves.
- **Recherche par nom (≥ 3 caractères)** → uniquement parmi les organisations **publiées
  volontairement** (`reserves_annuaire_publication`, opt-in explicite, écran
  `/parametres/annuaire`).

Aucune policy n'ouvre la table de publication en lecture transverse : l'opt-in serait
sinon décoratif. La recherche exige le droit `inviter_entreprise` — chercher, ici, c'est
préparer une invitation.

## 3. Entreprise extérieure non ELSATIA

`reserves_intervenants` gagne `raison_sociale`, `siret`, `contact_nom` et
`onboarding_statut`. **Aucun tenant n'est créé** à la place du tiers : un tenant sans
titulaire porterait des données, une facturation potentielle et une responsabilité RGPD
sans personne pour les gouverner. L'organisation naît quand un humain rejoint.

## 4. Invitation par lien sécurisé

| Propriété | Mise en œuvre |
|---|---|
| Jeton | 32 octets aléatoires, base64url (256 bits) |
| Persistance | **empreinte SHA-256 uniquement** — convention des liens de partage de documents (00200) ; le clair n'existe que dans l'URL |
| Expiration | 30 jours par défaut, borné [1, 90] en base |
| Usage | **unique** — consommé, il est mort |
| Unicité | **une invitation vivante par intervention** (index unique partiel) ; réémettre révoque le précédent |
| Révocation | par l'hôte, et automatique à la révocation de l'intervenant |
| Nominativité | un lien émis depuis l'annuaire n'accepte **que** l'organisation désignée |

`reserves_invitation_consulter(text)` est **la seule fonction Réserves ouverte à `anon`** —
le destinataire n'a par définition pas encore de compte. Elle ne rend que ce qu'un jeton
valide justifie déjà, et **rien** pour un jeton inconnu, expiré, révoqué ou consommé : pas
d'oracle d'énumération. Cette exception est inscrite explicitement dans
`isolation_multitenant_surface.test.sql`, à côté de `document_commercial_par_token`.

L'identifiant d'organisation cesse d'être un mécanisme d'accès : à l'acceptation,
l'organisation retenue est **celle de la session**, jamais un champ du formulaire.

## 5. E-mail : le canal commun, pas un second

L'audit a trouvé un transport Brevo unique dans Gestion Pro (`src/lib/brevo.ts`), avec
`BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.

Il a été **déplacé** dans `packages/email` (`@elsatia/email`), avec la charte HTML commune
et l'échappement. `src/lib/brevo.ts` n'est plus qu'un réexport : une seule implémentation,
un seul jeu de secrets, deux applications. Réserves n'ajoute que ses **gabarits**
(invitation, notification).

## 6. Notifications réelles

La file de la V1 (`reserves_evenements_notifications`) était écrite et jamais consommée.
Le modèle V3 sépare trois objets, et c'est cette séparation qui rend la déduplication
possible :

1. **L'événement métier** — un par geste. `cle_evenement` (unique) pour les producteurs
   répétables, au premier rang desquels les échéances.
2. **La lecture in-app** — l'événement est adressé à une *organisation* ;
   `reserves_notifications_lectures` porte la lecture *par personne*.
3. **L'envoi e-mail** — `reserves_notifications_envois`, une ligne par
   (événement, canal, personne), avec une **clé d'idempotence UNIQUE**. Une action métier
   ne peut pas produire trois e-mails, même si le distributeur est rejoué.

Événements couverts : `reserve_creee`, `reserve_assignee`, `reserve_annulee`,
`reserve_reouverte`, `reserve_transferee`, `responsabilite_refusee`,
**`responsabilite_acceptee` (nouveau)**, `levee_demandee`, `levee_validee`, `levee_refusee`,
`message_recu`, `echeance_proche`, `invitation_envoyee`, `intervenant_revoque`.

Canaux V1 réels : **in-app** et **e-mail**. Push non implémenté (P1), SMS hors périmètre.

**Préférences** (`/parametres/notifications`) : e-mail activable/désactivable par catégorie
et par organisation. L'in-app n'est jamais coupable — couper un e-mail est un confort, se
rendre aveugle n'en est pas un.

Distribution : `apps/reserves/src/app/api/cron/notifications` (Bearer `CRON_SECRET`),
déclarée dans `apps/reserves/vercel.json`. Elle produit les échéances, prépare les envois,
puis expédie et statue chaque envoi individuellement.

> **Piège corrigé en cours de lot.** `reserves_notification_destinataires` utilisait
> d'abord `a_acces_application()`, qui répond pour l'**utilisateur courant**. Le
> distributeur s'exécutant sous le rôle de service, sans session, elle renvoyait toujours
> faux : **aucun e-mail ne serait jamais parti**. Le test de parcours l'a mis au jour ; la
> fonction vérifie désormais l'accès de l'organisation directement.

## 7. Échéances

`reserves_produire_echeances(integer[])`, paliers **J-7 / J-3 / J-1** (paramétrables).
Idempotent par construction : `echeance:<reserve>:J-<n>`. Destinataire = l'entreprise
**porteuse**, celle qui doit agir ; à défaut (réserve non attribuée), l'organisation hôte,
qui doit l'attribuer.

## 8. Plans PDF et pointage

Le contrat de coordonnées devient **(plan_id, page, x_norm, y_norm)**, x et y dans [0,1]
**relativement à la page**.

- `reserves.plan_page` + deux contraintes de cohérence ; les réserves pointées avant la V3
  l'ont été sur une image, donc rétro-remplies à la page 1.
- `reserves_plans.nb_pages`, renseigné par le client au premier rendu (PostgreSQL ne sait
  pas ouvrir un PDF).
- Visionneuse `VisionneusePlanPdf` (pdf.js) : **une seule page rasterisée à la fois** — un
  plan d'exécution pèse lourd et compte vingt pages ; les rendre toutes pour en afficher
  une serait payé par l'utilisateur, sur un téléphone de chantier.
- **Le zoom re-rasterise au lieu d'étirer** : une mise à l'échelle CSS d'un canvas rend un
  plan flou, exactement ce qu'on ne peut pas se permettre pour situer un désordre. Le
  déplacement est le défilement natif du cadre.
- La coordonnée est dérivée du rectangle rendu : **le zoom ne la modifie pas**. Prouvé en
  base (`x` inchangé après changement de pagination et de zoom).
- Toucher une pastille ouvre la réserve ; toucher le plan ouvre le constat, page comprise.

## 9. Révocation et transfert

Conséquences, énoncées sans ambiguïté :

- **Accès coupé immédiatement.** `reserves_intervenant_courant` exige `statut = 'active'` :
  l'entreprise révoquée ne voit plus rien du chantier. « Révoquer l'accès » veut dire cela.
- **Historique intact.** Aucune ligne d'historique, de photo, de message ni de transition
  n'est touchée. Le nom de l'entreprise reste nommément au dossier et à l'export.
- **Réserves en cours signalées.** La RPC renvoie leur nombre : c'est la liste de ce qu'il
  reste à transférer, connue **au moment** de la révocation.
- **Accès gratuit retiré** seulement s'il venait d'une invitation *et* qu'aucune autre
  intervention active ne le justifie. Un client qui paie Réserves n'est jamais coupé.
- **Réactivation** possible (`reserves_reactiver_intervenant`).

Le **transfert** ajoute trois arêtes à la matrice — réassignation depuis `acceptee`,
`levee_demandee` et `levee_refusee` — avec motif obligatoire. L'entreprise dessaisie est
notifiée : sans cela, elle découvrirait la perte de la charge en constatant la disparition
de la réserve, ce qui ressemble à un bug, pas à une décision.

## 10. Messagerie

Pointeur de lecture **par conversation** (`reserves_conversations_lectures`) plutôt qu'une
ligne par message : une conversation de deux cents messages coûte une ligne. Non-lus par
conversation et globaux, lien direct vers la réserve, et **pièce jointe photo** réutilisant
intégralement le stockage de la V2 (chemin composé par la base, vérifié contre la réserve
réelle) sous l'usage `echange` — qui ne satisfait **jamais** l'exigence de photo à la levée.
La conversation suit le porteur courant : après un transfert, l'entreprise dessaisie ne lit
plus la suite.

## 11. Exports et PDF

Moteur : **Chromium headless sur une page déjà rendue par Next.js**, moteur documentaire
canonique d'ELSATIA (identique à Gestion Pro). La page `/imprimer/chantier/[id]` est rendue
sous la session de l'appelant ; `/api/documents/chantier/[id]/pdf` la réémet avec le même
cookie. Conséquence : **il n'existe aucun chemin par lequel le PDF exposerait ce que
l'écran refuserait**.

- **PDF chantier** : entête (chantier, adresse, organisation, SIRET), synthèse chiffrée,
  entreprises intervenantes, fiche par réserve (statut, priorité, entreprise, localisation
  **avec page de plan**, chronologie), photos, pied horodaté.
- **PDF par entreprise** : filtré **en base**. Ce qui n'est pas dans le PDF n'a jamais
  quitté la base.
- **PDF filtré** : entreprise, statut, priorité, échéance, inclusion des levées.
- **Historique** : complet ou synthèse. La synthèse **ne charge pas** l'historique.
- **Horodatage** : date et heure serveur, auteur, chantier, organisation — sur tout export.

## 12. Tableau de bord

Réordonné par **geste appelé**, pas par état : à traiter, en retard, échéance sous 7 jours,
demandes de levée, refus de responsabilité, messages non lus, invitations en attente. Un
tableau de bord qui commence par le total ne dit pas quoi faire aujourd'hui.

---

## Ce qui n'a pas été fait, et pourquoi

| Élément | Statut | Raison |
|---|---|---|
| Synchronisation hors-ligne | **Hors périmètre** | Explicitement exclu du cadrage |
| QR chantier / zone | **P1** | Classé P1 par le cadrage ; le reste du périmètre a été priorisé |
| Signature électronique / PV | **P1** | Exclu du cadrage ; aucune structure documentaire mensongère n'a été posée |
| Canal push | **P1** | Le cadrage autorise le report ; in-app + e-mail sont réels |
| SMS | **Hors périmètre** | Explicitement exclu |
| E2E navigateur exécuté | **Écrit, non exécuté** | Voir ci-dessous |

**E2E navigateur.** `tests/e2e/reserves-v3-collaboration.spec.ts` et
`scripts/e2e/prepare-reserves-v3-recipe.sql` sont livrés et enregistrés dans la suite
Playwright (ignorés tant que `E2E_RESERVES_URL` n'est pas défini, donc sans effet sur la
recette existante). Ils **n'ont pas été exécutés** : la base de développement locale est au
ledger 265, ne contient donc aucune table Réserves, et l'amener au ledger 270 impose un
`npm run db:reset` qui détruirait le jeu de test multi-app local. Le parcours §29 est en
revanche **entièrement prouvé** au niveau base par
`supabase/tests/reserves_v3_parcours_bout_en_bout.test.sql` (41 assertions), joué sous
l'identité réelle de chaque acteur.

---

## Validation

| Contrôle | Résultat |
|---|---|
| `verify:migrations` | 268 migrations valides |
| `verify:secrets` | 1393 fichiers, aucun secret |
| pgTAP (60 fichiers) | **1603 assertions vertes, 0 échec** (V2 : 1414) |
| dont V3 | 148 (fonctionnel) + 41 (parcours) |
| Typecheck racine + Réserves | vert |
| Lint racine + Réserves | vert (3 avertissements préexistants) |
| Tests unitaires racine | 1006 / 1006 |
| Tests unitaires Réserves | 61 / 61 |
| Build racine + Réserves | vert |
