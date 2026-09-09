# ELSATIA Gestion Pro — Backlog mobile des 141 pages

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

Ce document classe **la totalité** des 141 `page.tsx` de Gestion Pro. Il complète
`ELSATIA_GP_MOBILE_AUDIT_PHASE_A_V1.md` et sert de plan d'extension progressive du mobile
au-delà de la V1 terrain.

## Avertissement : ce classement a été corrigé en cours de lot

La première version de ce document, produite en phase A, **surestimait le travail restant**.
Son scanner comptait tout `<table>` comme hostile. Il classait donc `/planning`,
`/notes-frais` et `/chantiers` parmi les pages à refondre, alors que ces trois pages
embarquent **déjà** une vue mobile dédiée — cartes ou navigation par jour — le tableau étant
réservé au grand écran par `hidden md:block`.

L'erreur a été découverte en phase C, à la première lecture du code de `/chantiers`. Le
scanner a été repris (`scripts/mobile/scan-hostilite-mobile.mjs`) et le classement rejoué.

| Tranche | Première version | **Après correction** |
|---|---|---|
| Lourd (≥ 6) | 36 | **25** |
| Moyen (3–5) | 32 | **31** |
| Léger (1–2) | 32 | **10** |
| Aucun signal | 41 | **75** |

Le socle mobile de Gestion Pro est donc **nettement meilleur** que ce que la phase A
annonçait. Ce document fait foi ; la table de la phase A est périmée sur ce point.

## Méthode de classement

Un signal n'est retenu que s'il atteint réellement un écran de 375 px :

- un **tableau** ne compte pas si la page fournit une vue de repli `*:hidden` ;
- une **grille** ne compte que si son nombre de colonnes est posé **sans préfixe de palier** :
  `grid-cols-3` compte, `md:grid-cols-3` non — ce dernier ne s'applique qu'au-delà de 768 px ;
- une **largeur fixe** ne compte pas si son bloc est réservé au grand écran.

Poids : tableau sans repli 3, largeur fixe 3, canvas 3, éditeur 3, grille sans palier 2,
iframe 2. Les marqueurs `upload`, `capture`, `gps` et `repli_mobile_present` sont
**informatifs** et ne pèsent pas sur le score.

Le classement croise ce score avec un **jugement de destination d'usage** : un score élevé ne
condamne pas une page, il dit qu'elle ne tiendra pas sur 375 px sans transformation. Reste à
savoir si elle *doit* y tenir. Une grille de paie, un rapprochement bancaire ou la console
plateforme sont des gestes de bureau, rares et denses.

**Limite qui subsiste.** L'outil sait qu'une vue mobile de repli existe ; il ne sait pas si
elle est **bonne**. Seule la mesure navigateur le dira (phase H).

## Règles de portée héritées de la décision de cadrage

- Les six parcours V1 sont traités dans ce lot ; **aucune autre page n'est refactorisée ici**.
- Les fiches **clients** et **salariés** doivent rester **consultables** sur mobile si
  l'existant le permet ; leur refonte complète est reportée.
- **Réserves** reste une application autonome reliée à Gestion Pro : son moteur n'est pas
  dupliqué dans GP.


### Périmètre V1 terrain (traité dans ce lot) — 12 pages

| Route | Score | Signaux |
|---|---|---|
| `/chantiers/[id]/comptes-rendus` | 2 | grille_sans_palier, upload, capture |
| `/chantiers/nouveau` | 2 | grille_sans_palier, gps |
| `/dashboard` | 2 | grille_sans_palier, gps, repli_mobile_present |
| `/chantiers` | 0 | repli_mobile_present |
| `/chantiers/[id]` | 0 | — |
| `/chantiers/[id]/documents` | 0 | upload, capture |
| `/mes-travaux` | 0 | — |
| `/notes-frais` | 0 | repli_mobile_present |
| `/notes-frais/[id]` | 0 | upload, capture |
| `/planning` | 0 | repli_mobile_present |
| `/pointage` | 0 | gps |
| `/pointage/gestion` | 0 | — |

### Déjà utilisable sur mobile — 30 pages

| Route | Score | Signaux |
|---|---|---|
| `/clients/[id]/modifier` | 2 | grille_sans_palier |
| `/clients/nouveau` | 2 | grille_sans_palier |
| `/devis` | 2 | grille_sans_palier, repli_mobile_present |
| `/employes/[id]/modifier` | 2 | grille_sans_palier |
| `/employes/nouveau` | 2 | grille_sans_palier |
| `/aide` | 0 | — |
| `/chantiers/[id]/doe` | 0 | — |
| `/chantiers/[id]/emails` | 0 | — |
| `/chantiers/[id]/localisation` | 0 | gps |
| `/clients` | 0 | repli_mobile_present |
| `/conges` | 0 | — |
| `/depenses/[id]` | 0 | upload, capture |
| `/devis/[id]/creer-chantier` | 0 | — |
| `/employes` | 0 | — |
| `/employes/[id]/carte` | 0 | — |
| `/factures` | 0 | repli_mobile_present |
| `/flotte` | 0 | upload, repli_mobile_present |
| `/flotte/[id]` | 0 | — |
| `/flotte/nouveau` | 0 | — |
| `/fournisseurs/[id]` | 0 | — |
| `/grands-deplacements` | 0 | — |
| `/messagerie` | 0 | upload |
| `/mon-espace` | 0 | — |
| `/outillage` | 0 | upload, repli_mobile_present |
| `/outillage/[id]` | 0 | — |
| `/outillage/nouveau` | 0 | — |
| `/page.tsx` | 0 | — |
| `/sous-traitants/[id]` | 0 | — |
| `/stock/[id]` | 0 | upload |
| `/stock/borne` | 0 | — |

### Correction légère — 11 pages

| Route | Score | Signaux |
|---|---|---|
| `/clients/[id]` | 5 | table_sans_repli, grille_sans_palier |
| `/factures/[id]/modifier` | 5 | grille_sans_palier, editeur |
| `/commandes` | 3 | table_sans_repli |
| `/commandes/[id]` | 3 | table_sans_repli |
| `/commandes/nouveau` | 3 | editeur |
| `/devis/[id]` | 3 | table_sans_repli |
| `/devis/[id]/modifier` | 3 | editeur, upload |
| `/devis/nouveau` | 3 | editeur, upload |
| `/factures/[id]` | 3 | table_sans_repli |
| `/fournisseurs` | 3 | table_sans_repli |
| `/stock/reception` | 3 | table_sans_repli |

### Refonte nécessaire — 5 pages

| Route | Score | Signaux |
|---|---|---|
| `/depenses` | 6 | table_sans_repli, largeur_fixe |
| `/employes/[id]` | 6 | table_sans_repli, canvas, upload, capture |
| `/interventions` | 6 | table_sans_repli, largeur_fixe |
| `/sous-traitants` | 6 | table_sans_repli, largeur_fixe |
| `/stock` | 6 | table_sans_repli, largeur_fixe, upload |

### Administration à conserver principalement sur ordinateur — 59 pages

| Route | Score | Signaux |
|---|---|---|
| `/abonnement` | 8 | table_sans_repli, grille_sans_palier, largeur_fixe |
| `/facturation-avancee` | 8 | table_sans_repli, grille_sans_palier, largeur_fixe |
| `/connecteurs` | 6 | table_sans_repli, largeur_fixe |
| `/imprimer/paie/[id]` | 6 | table_sans_repli, largeur_fixe |
| `/inventaires` | 6 | table_sans_repli, largeur_fixe |
| `/inventaires/[id]` | 6 | table_sans_repli, largeur_fixe |
| `/paie` | 6 | table_sans_repli, largeur_fixe |
| `/paie/[id]` | 6 | table_sans_repli, largeur_fixe |
| `/paie/[id]/[dossierId]` | 6 | table_sans_repli, largeur_fixe, upload |
| `/paie/parametres` | 6 | table_sans_repli, largeur_fixe |
| `/parametres/relances` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/applications` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/boutique` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/entreprises/[entrepriseId]` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/facturation` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/stripe` | 6 | table_sans_repli, largeur_fixe |
| `/plateforme/tarification` | 6 | table_sans_repli, largeur_fixe |
| `/rentabilite` | 6 | table_sans_repli, largeur_fixe |
| `/parametres/acces/apercu/[id]` | 5 | grille_sans_palier, largeur_fixe |
| `/plateforme/roles-demo` | 5 | grille_sans_palier, largeur_fixe |
| `/tresorerie` | 5 | grille_sans_palier, largeur_fixe |
| `/abonnement/configurateur` | 3 | table_sans_repli |
| `/imprimer/commandes/[id]` | 3 | table_sans_repli |
| `/imprimer/devis/[id]` | 3 | table_sans_repli |
| `/imprimer/doe/[id]` | 3 | table_sans_repli |
| `/imprimer/factures/[id]` | 3 | table_sans_repli |
| `/imprimer/partage/[token]` | 3 | table_sans_repli |
| `/notes-frais/exports` | 3 | table_sans_repli |
| `/parametres/import` | 3 | table_sans_repli, upload |
| `/plateforme/assistance` | 3 | table_sans_repli |
| `/plateforme/remises` | 3 | table_sans_repli |
| `/prestations` | 3 | table_sans_repli |
| `/depot` | 2 | grille_sans_palier |
| `/abonnement/module-non-inclus` | 0 | — |
| `/appels-offres` | 0 | — |
| `/banque-paie` | 0 | — |
| `/boutique` | 0 | — |
| `/boutique/[produitId]` | 0 | — |
| `/boutique/commande/[id]` | 0 | — |
| `/boutique/panier` | 0 | — |
| `/charges` | 0 | — |
| `/crm` | 0 | — |
| `/exports` | 0 | — |
| `/ouvrages` | 0 | — |
| `/paie/profils/[employeId]` | 0 | upload |
| `/parametres` | 0 | upload |
| `/parametres/acces` | 0 | — |
| `/parametres/donnees` | 0 | — |
| `/parametres/notes-frais` | 0 | — |
| `/parametres/notifications` | 0 | — |
| `/parametres/securite` | 0 | — |
| `/parametres/version` | 0 | — |
| `/plateforme` | 0 | — |
| `/plateforme/communications` | 0 | upload |
| `/plateforme/entreprises` | 0 | repli_mobile_present |
| `/plateforme/entreprises/[entrepriseId]/applications` | 0 | — |
| `/plateforme/support` | 0 | — |
| `/prestations/[id]/modifier` | 0 | — |
| `/prestations/nouveau` | 0 | — |

### Hors périmètre (pages publiques, tunnels, légal, impression) — 24 pages

| Route | Score | Signaux |
|---|---|---|
| `/paiements-bancaires` | 6 | table_sans_repli, largeur_fixe, upload |
| `/tarifs` | 6 | table_sans_repli, largeur_fixe |
| `/cgu` | 3 | table_sans_repli |
| `/cgv` | 3 | table_sans_repli |
| `/confidentialite` | 3 | table_sans_repli |
| `/cookies` | 3 | table_sans_repli |
| `/document/[token]` | 3 | table_sans_repli |
| `/mentions-legales` | 3 | table_sans_repli |
| `/onboarding` | 2 | grille_sans_palier |
| `/abonnement-suspendu` | 0 | — |
| `/auth/confirm` | 0 | — |
| `/en-attente` | 0 | — |
| `/login` | 0 | — |
| `/mfa/challenge` | 0 | — |
| `/mot-de-passe-oublie` | 0 | — |
| `/nouveau-mot-de-passe` | 0 | — |
| `/offline` | 0 | — |
| `/onboarding/besoins` | 0 | — |
| `/onboarding/demarrage` | 0 | — |
| `/paiement/abonnement/annule` | 0 | — |
| `/paiement/abonnement/succes` | 0 | — |
| `/paiement/annule` | 0 | — |
| `/paiement/succes` | 0 | — |
| `/signup` | 0 | — |


**Total : 141 pages classées.**

## Cas particuliers à retenir

### Fiches clients et salariés — consultables, refonte reportée

| Page | Score | Décision |
|---|---|---|
| `/clients` | 0 | Repli mobile présent. Consultable. |
| `/clients/[id]` | 3 | Tableau d'historique sans repli. Consultable par défilement. Refonte reportée. |
| `/employes` | 0 | Déjà utilisable. |
| `/employes/[id]` | 6 | `canvas` de signature + tableau sans repli. **À vérifier en priorité au prochain lot** : un canvas de signature mal dimensionné est inutilisable au doigt. |
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

### Les deux seuls vrais défauts de grille du périmètre V1

Repérés par le scanner corrigé, puis vérifiés ligne à ligne :

| Emplacement | Code | Effet sur 375 px |
|---|---|---|
| `src/app/(app)/dashboard/page.tsx:347` | `grid grid-cols-3 gap-2` | Trois affectations côte à côte, ~110 px chacune, texte illisible |
| `src/app/(app)/chantiers/nouveau/page.tsx:92` | `grid grid-cols-3 gap-4` | Trois champs de formulaire côte à côte |

**Faux positif écarté** : `src/components/PhotosCompteRendu.tsx:46` utilise
`grid-cols-3 gap-2 sm:grid-cols-4` pour des **vignettes photo**. Trois vignettes de ~110 px
sur un téléphone sont un bon choix, pas un défaut. Elle n'est pas corrigée.
