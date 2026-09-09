# ELSATIA Gestion Pro — Backlog mobile des 141 pages

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

Ce document classe **la totalité** des 141 `page.tsx` de Gestion Pro. Il complète
`ELSATIA_GP_MOBILE_AUDIT_PHASE_A_V1.md` et sert de plan d'extension progressive du mobile
au-delà de la V1 terrain.

## Méthode de classement

Le classement croise deux critères :

1. **Un score d'hostilité mobile mesuré** par analyse statique du code de la page et de ses
   composants importés — tableau 3, largeur fixe en pixels 3, canvas 3, éditeur 3,
   grille ≥ 3 colonnes 2, iframe 2, en-têtes de tableau 1, dialogue 1.
2. **Un jugement de destination d'usage.** Un score élevé ne condamne pas une page : il dit
   qu'elle ne tiendra pas sur 375 px sans transformation. Reste à savoir si elle *doit* y
   tenir. Une grille de paie, un rapprochement bancaire ou la console plateforme sont des
   gestes de bureau, rares, longs, à forte densité — les rendre confortables sur téléphone
   coûterait cher pour un usage qui n'existe pas.

**Limite déclarée** : ce classement est statique. Il n'a pas été confronté au rendu réel aux
cinq largeurs (mesure reportée en phase H). Il indique où regarder, pas ce qu'on verra.

## Règles de portée héritées de la décision de cadrage

- Les six parcours V1 sont traités dans ce lot ; **aucune autre page n'est refactorisée ici**.
- Les fiches **clients** et **salariés** doivent rester **consultables** sur mobile si
  l'existant le permet ; leur refonte complète est reportée.
- **Réserves** reste une application autonome reliée à Gestion Pro : son moteur n'est pas
  dupliqué dans GP.


### Périmètre V1 terrain (traité dans ce lot) — 12 pages

| Route | Score | Signaux |
|---|---|---|
| `/planning` | 7 | table, thead_lourd, largeur_fixe, overflow_x, formulaire |
| `/dashboard` | 6 | grid_3plus, largeur_fixe, formulaire, gps, dialog |
| `/notes-frais` | 6 | table, thead_lourd, grid_3plus, overflow_x, formulaire |
| `/chantiers` | 4 | table, thead_lourd, overflow_x, formulaire |
| `/chantiers/[id]` | 2 | grid_3plus, formulaire |
| `/chantiers/[id]/comptes-rendus` | 2 | grid_3plus, formulaire, upload, capture |
| `/chantiers/[id]/documents` | 2 | grid_3plus, formulaire, upload, capture |
| `/chantiers/nouveau` | 2 | grid_3plus, formulaire, gps |
| `/notes-frais/[id]` | 2 | grid_3plus, formulaire, upload, capture |
| `/pointage` | 2 | grid_3plus, formulaire, gps |
| `/pointage/gestion` | 2 | grid_3plus, formulaire |
| `/mes-travaux` | 0 | — |

### Déjà utilisable sur mobile — 24 pages

| Route | Score | Signaux |
|---|---|---|
| `/chantiers/[id]/doe` | 2 | grid_3plus, formulaire |
| `/clients/[id]/modifier` | 2 | grid_3plus, formulaire |
| `/clients/nouveau` | 2 | grid_3plus, formulaire |
| `/conges` | 2 | grid_3plus, formulaire |
| `/depenses/[id]` | 2 | grid_3plus, formulaire, upload, capture |
| `/employes` | 2 | grid_3plus |
| `/employes/[id]/modifier` | 2 | grid_3plus, formulaire |
| `/employes/nouveau` | 2 | grid_3plus, formulaire |
| `/flotte/[id]` | 2 | grid_3plus, formulaire |
| `/grands-deplacements` | 2 | grid_3plus, formulaire |
| `/outillage/[id]` | 2 | grid_3plus, formulaire |
| `/page.tsx` | 2 | grid_3plus |
| `/sous-traitants/[id]` | 2 | grid_3plus, formulaire |
| `/stock/[id]` | 2 | grid_3plus, formulaire, upload |
| `/aide` | 0 | overflow_x, formulaire |
| `/chantiers/[id]/emails` | 0 | formulaire |
| `/chantiers/[id]/localisation` | 0 | formulaire, gps |
| `/devis/[id]/creer-chantier` | 0 | formulaire |
| `/employes/[id]/carte` | 0 | formulaire |
| `/flotte/nouveau` | 0 | formulaire |
| `/fournisseurs/[id]` | 0 | formulaire |
| `/messagerie` | 0 | formulaire, upload |
| `/mon-espace` | 0 | formulaire |
| `/outillage/nouveau` | 0 | formulaire |

### Correction légère — 14 pages

| Route | Score | Signaux |
|---|---|---|
| `/clients/[id]` | 5 | table, grid_3plus |
| `/commandes/[id]` | 5 | table, thead_lourd, formulaire, dialog |
| `/devis/[id]` | 5 | table, thead_lourd, formulaire, dialog |
| `/factures/[id]` | 5 | table, thead_lourd, formulaire, dialog |
| `/factures/[id]/modifier` | 5 | grid_3plus, editeur |
| `/clients` | 4 | table, thead_lourd, overflow_x, formulaire |
| `/commandes` | 4 | table, thead_lourd |
| `/flotte` | 4 | table, thead_lourd, overflow_x, formulaire, upload |
| `/outillage` | 4 | table, thead_lourd, overflow_x, formulaire, upload |
| `/stock/reception` | 4 | table, thead_lourd, overflow_x |
| `/commandes/nouveau` | 3 | editeur |
| `/devis/[id]/modifier` | 3 | upload, camera, editeur |
| `/devis/nouveau` | 3 | upload, camera, editeur |
| `/stock/borne` | 3 | grid_3plus, formulaire, camera, dialog |

### Refonte nécessaire — 8 pages

| Route | Score | Signaux |
|---|---|---|
| `/stock` | 10 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire, upload, camera, dialog |
| `/depenses` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/sous-traitants` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/interventions` | 7 | table, thead_lourd, largeur_fixe, overflow_x, formulaire |
| `/devis` | 6 | table, thead_lourd, grid_3plus, overflow_x, formulaire |
| `/employes/[id]` | 6 | table, formulaire, upload, capture, canvas |
| `/factures` | 6 | table, thead_lourd, grid_3plus, overflow_x, formulaire |
| `/fournisseurs` | 6 | table, thead_lourd, grid_3plus, formulaire |

### Administration à conserver principalement sur ordinateur — 59 pages

| Route | Score | Signaux |
|---|---|---|
| `/abonnement` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/connecteurs` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/facturation-avancee` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/inventaires/[id]` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/paie/[id]` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/paie/[id]/[dossierId]` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire, upload |
| `/paie/parametres` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/parametres/relances` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/plateforme/applications` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x |
| `/plateforme/boutique` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/plateforme/entreprises` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/plateforme/entreprises/[entrepriseId]` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/plateforme/facturation` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/plateforme/stripe` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x |
| `/plateforme/tarification` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/rentabilite` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x |
| `/imprimer/paie/[id]` | 7 | table, thead_lourd, largeur_fixe |
| `/inventaires` | 7 | table, thead_lourd, largeur_fixe, overflow_x, formulaire |
| `/paie` | 7 | table, thead_lourd, largeur_fixe, overflow_x, formulaire |
| `/abonnement/configurateur` | 6 | table, thead_lourd, grid_3plus |
| `/notes-frais/exports` | 6 | table, thead_lourd, grid_3plus, overflow_x, formulaire |
| `/parametres/import` | 6 | table, thead_lourd, grid_3plus, overflow_x, formulaire, upload |
| `/plateforme/remises` | 6 | table, thead_lourd, grid_3plus, formulaire |
| `/parametres/acces/apercu/[id]` | 5 | grid_3plus, largeur_fixe, overflow_x |
| `/plateforme/roles-demo` | 5 | grid_3plus, largeur_fixe, overflow_x, formulaire |
| `/tresorerie` | 5 | grid_3plus, largeur_fixe, overflow_x |
| `/imprimer/commandes/[id]` | 4 | table, thead_lourd |
| `/imprimer/devis/[id]` | 4 | table, thead_lourd |
| `/imprimer/factures/[id]` | 4 | table, thead_lourd |
| `/imprimer/partage/[token]` | 4 | table, thead_lourd |
| `/plateforme/assistance` | 4 | table, thead_lourd, overflow_x, formulaire |
| `/prestations` | 4 | table, thead_lourd, formulaire |
| `/imprimer/doe/[id]` | 3 | table |
| `/parametres` | 3 | grid_3plus, formulaire, upload, dialog |
| `/appels-offres` | 2 | grid_3plus, formulaire |
| `/boutique` | 2 | grid_3plus |
| `/charges` | 2 | grid_3plus, formulaire |
| `/crm` | 2 | grid_3plus, formulaire |
| `/depot` | 2 | grid_3plus, formulaire |
| `/ouvrages` | 2 | grid_3plus, formulaire |
| `/paie/profils/[employeId]` | 2 | grid_3plus, formulaire, upload |
| `/parametres/acces` | 2 | grid_3plus, formulaire |
| `/plateforme` | 2 | grid_3plus, formulaire |
| `/plateforme/communications` | 2 | grid_3plus, formulaire, upload |
| `/abonnement/module-non-inclus` | 0 | — |
| `/banque-paie` | 0 | — |
| `/boutique/[produitId]` | 0 | — |
| `/boutique/commande/[id]` | 0 | formulaire |
| `/boutique/panier` | 0 | formulaire |
| `/exports` | 0 | formulaire |
| `/parametres/donnees` | 0 | formulaire |
| `/parametres/notes-frais` | 0 | formulaire |
| `/parametres/notifications` | 0 | — |
| `/parametres/securite` | 0 | formulaire |
| `/parametres/version` | 0 | — |
| `/plateforme/entreprises/[entrepriseId]/applications` | 0 | formulaire |
| `/plateforme/support` | 0 | formulaire |
| `/prestations/[id]/modifier` | 0 | formulaire |
| `/prestations/nouveau` | 0 | formulaire |

### Hors périmètre (pages publiques, tunnels, légal, impression) — 24 pages

| Route | Score | Signaux |
|---|---|---|
| `/paiements-bancaires` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x, formulaire, upload |
| `/tarifs` | 9 | table, thead_lourd, grid_3plus, largeur_fixe, overflow_x |
| `/cgu` | 4 | table, thead_lourd, overflow_x |
| `/cgv` | 4 | table, thead_lourd, overflow_x |
| `/confidentialite` | 4 | table, thead_lourd, overflow_x |
| `/cookies` | 4 | table, thead_lourd, overflow_x |
| `/document/[token]` | 4 | table, thead_lourd |
| `/mentions-legales` | 4 | table, thead_lourd, overflow_x |
| `/onboarding` | 2 | grid_3plus, formulaire |
| `/abonnement-suspendu` | 0 | formulaire |
| `/auth/confirm` | 0 | formulaire |
| `/en-attente` | 0 | formulaire |
| `/login` | 0 | formulaire |
| `/mfa/challenge` | 0 | formulaire |
| `/mot-de-passe-oublie` | 0 | formulaire |
| `/nouveau-mot-de-passe` | 0 | formulaire |
| `/offline` | 0 | — |
| `/onboarding/besoins` | 0 | formulaire |
| `/onboarding/demarrage` | 0 | — |
| `/paiement/abonnement/annule` | 0 | — |
| `/paiement/abonnement/succes` | 0 | — |
| `/paiement/annule` | 0 | — |
| `/paiement/succes` | 0 | — |
| `/signup` | 0 | formulaire |


**Total : 141 pages classées.**

## Cas particuliers à retenir

### Fiches clients et salariés — consultables, refonte reportée

| Page | Score | Décision |
|---|---|---|
| `/clients` | 4 | Liste avec tableau — consultable via le défilement horizontal du shell. Refonte en cartes reportée. |
| `/clients/[id]` | 5 | Fiche + tableau d'historique. Consultable. Refonte reportée. |
| `/employes` | 2 | Déjà utilisable. |
| `/employes/[id]` | 6 | Contient un `canvas` (signature) et une capture photo. **À vérifier en priorité au prochain lot** : un canvas de signature mal dimensionné est inutilisable au doigt. |
| `/employes/[id]/carte` | 0 | Déjà utilisable. |

Aucune de ces cinq pages n'est modifiée dans ce lot. Elles sont vérifiées comme
*consultables* lors de la campagne de mesure de la phase H, et tout blocage constaté est
consigné en réserve plutôt que corrigé ici.

### Pages d'impression

Les six routes `/imprimer/*` produisent des documents A4 destinés au PDF serveur
(`puppeteer-core` + `@sparticuz/chromium`). Leurs largeurs fixes sont **voulues** : ce sont des
gabarits de page imprimée, pas des écrans. Elles sont classées en administration de bureau et
ne doivent **pas** être rendues responsives — le faire dégraderait le PDF produit.

### Console plateforme

Les 14 pages `/plateforme/*` sont réservées à l'exploitant ELSATIA. Elles restent des écrans
de bureau assumés. Aucun effort mobile n'est justifié avant que l'exploitation courante ne
l'exige.
