# TARIFS-V2 — Audit et plan de migration ELSATIA

Date de l'audit : 16 août 2026
Statut : audit uniquement — aucune migration ni action Production réalisée

## 1. Périmètre et verdict exécutif

Cet audit couvre la grille tarifaire ELSATIA, les limites de comptes, les droits fonctionnels, Stripe, les remises, la super-administration, le site public, l'application, la documentation commerciale et les livrables C2.

La nouvelle grille mensuelle peut être préparée, mais sa publication doit rester bloquée jusqu'à trois décisions ou corrections :

1. définir les nouveaux tarifs annuels, car la règle actuelle n'est pas uniforme ;
2. sécuriser les autorisations de la plateforme par rôle avant d'activer un nouveau super-administrateur ;
3. choisir une représentation technique sûre de l'offre « Sur mesure — Sur devis » sans prix public ni checkout automatique.

Aucune modification n'a été apportée à l'application, au site, à Supabase, à Stripe, à Vercel, aux rôles Production, aux prospects ou au pipeline C5-G.

## 2. État Git et dépôts audités

| Dossier | Rôle | Branche | HEAD audité | État |
|---|---|---|---|---|
| `/Users/juliengregurec/Projects/liria-codex` | Application principale, documentation commerciale | `codex/tarifs-v2-migration-globale` | `78c21fa45b9a32285b744893181b585ddaba6eb0` | Propre avant création du présent rapport |
| `/Users/juliengregurec/Projects/elsatia-site` | Site public | `c1e/formulaire-contact-production` | `692cb03d3cbc1858426c7c3b75e21a6be1109de9` | Propre |
| `/Users/juliengregurec/Projects/elsatia-production-bootstrap` | Baseline commerciale gelée | `release/commercialisation-v1` | `e521a12e515b7bf0cf14cc49f412c6aeb25384fd` | Propre, lecture seule |
| `/Users/juliengregurec/Projects/liria-claude` | Travail parallèle historique | `claude/developpement-parallele` | `c89730e6d198dcc89f0e3f73a7d0d588f92b59c4` | Propre, lecture seule |
| `/Users/juliengregurec/Documents/btp-platform` | Ancien worktree `main` | `main` | `7e488f89f2121dc6dd31e4044601f4f8be4e7d5d` | Sorties non suivies préexistantes ; exclu de toute écriture |

Les worktrees temporaires signalés comme élagables ne sont pas des sources actives. Aucun travail technique concurrent n'a été modifié. C5-G reste isolé et inchangé.

## 3. Sources de vérité actuelles

| Élément | Source actuelle | Consommateurs | Risque de divergence |
|---|---|---|---|
| Prix, comptes, administrateurs, quotas, stockage et modules | `src/lib/tarification.ts` (`OFFRES_TARIFAIRES`) | Tarifs, abonnement, onboarding, calculs, permissions, tests | Élevé : statique et indépendant de la base et du site |
| Alias fonctionnel des offres | `src/lib/plateforme.ts` | Routes et vues plateforme | Moyen : réexporte la source code |
| Catalogue commercial versionné | `plans_abonnement` | Super-administration, webhooks, contrats | Élevé : les écrans et droits courants ne lisent pas tous ce catalogue |
| Prix contractuel | `abonnements_entreprises` | Facturation et historique d'abonnement | Faible si la version est conservée ; fort si elle est écrasée |
| Prix Stripe | Variables d'environnement vers des Price Stripe immuables | Checkout, changement de plan, réconciliation | Élevé si les variables et la grille code divergent |
| Tarifs du site public | Constante locale dans `elsatia-site/src/app/solutions/gestion-pro/page.tsx` | Page Gestion Pro | Très élevé : copie indépendante |
| Tarifs commerciaux | Documents Markdown et slide 11 C2-C | Équipe commerciale et prospects | Élevé sans contrôle anti-régression |

### Recommandation minimale

Conserver une seule définition sérialisable et versionnée des offres dans l'application, puis :

- l'utiliser directement pour les écrans et droits applicatifs ;
- produire ou valider les versions de `plans_abonnement` à partir de cette définition ;
- fournir au site un export JSON contrôlé par checksum ou un endpoint public stable ;
- ajouter un contrôle CI qui compare code, base attendue, site et documentation ;
- vérifier séparément que chaque variable Stripe pointe vers un Price conforme.

Une refonte complète n'est pas nécessaire pour TARIFS-V2. Un manifeste partagé ou exporté avec tests de cohérence suffit.

## 4. Grilles actuelle et cible

### Grille mensuelle actuelle

| Offre | Prix HT/mois | Comptes inclus | Administrateurs | Statut checkout |
|---|---:|---:|---:|---|
| Mini | 79 € | 3 | 1 | Automatique |
| Pro | 249 € | 15 | 3 | Automatique |
| Business | 449 € | 30 | 6 | Automatique |
| Entreprise | 599 € | 50 au total | 10 | Automatique |
| Sur mesure | Dès 699 € | Base technique 50 | Non borné | Pas de checkout automatique |

### Grille mensuelle cible

| Offre | Prix HT/mois | Comptes inclus |
|---|---:|---:|
| Mini | 69 € | 3 |
| Pro | 199 € | 15 |
| Business | 399 € | 30 |
| Entreprise | 599 € | 40 salariés + 10 administrateurs |
| Sur mesure | Sur devis | Contractuel |

L'essai de 30 jours reste inchangé.

## 5. Audit des prix annuels

| Offre | Mensuel actuel | Annuel actuel | Mensuel × 12 | Écart annuel | Remise annuelle réelle |
|---|---:|---:|---:|---:|---:|
| Mini | 79 € | 948 € | 948 € | 0 € | 0 % |
| Pro | 249 € | 2 988 € | 2 988 € | 0 € | 0 % |
| Business | 449 € | 5 388 € | 5 388 € | 0 € | 0 % |
| Entreprise | 599 € | 6 468 € | 7 188 € | -720 € | 10,02 % environ |
| Sur mesure | 699 € | 8 388 € | 8 388 € | 0 € | 0 % |

La règle réelle est contradictoire : trois offres et l'ancien Sur mesure correspondent à 12 mensualités, tandis qu'Entreprise bénéficie d'une remise d'environ 10 %. Stripe Test possède bien un Price mensuel et un Price annuel distinct pour chacune des quatre offres commercialisées automatiquement.

Si les nouveaux prix mensuels étaient associés aux anciens annuels, Mini, Pro et Business deviendraient plus chers en annuel qu'en payant 12 mensualités :

| Offre | Nouveau mensuel × 12 | Ancien annuel conservé | Surcoût annuel |
|---|---:|---:|---:|
| Mini | 828 € | 948 € | +120 € / +14,49 % |
| Pro | 2 388 € | 2 988 € | +600 € / +25,13 % |
| Business | 4 788 € | 5 388 € | +600 € / +12,53 % |

**Décision humaine obligatoire :** définir la politique et les montants annuels avant toute exposition conjointe mensuel/annuel. À défaut, masquer ou désactiver temporairement l'annuel pour les nouvelles souscriptions. Aucun prix annuel n'est modifié dans ce lot.

## 6. Limites de comptes et fonctionnement réel

| Offre | Cible commerciale | Limite applicative réelle | Verdict |
|---|---|---|---|
| Mini | 3 comptes | 3 comptes, dont 1 administrateur prévu | Conforme sur le total |
| Pro | 15 comptes | 15 comptes, dont 3 administrateurs prévus | Conforme sur le total |
| Business | 30 comptes | 30 comptes, dont 6 administrateurs prévus | Conforme sur le total |
| Entreprise | 40 salariés + 10 administrateurs | 50 comptes au total, plafond administrateurs 10 déclaré | Conforme en volume, libellé à harmoniser |
| Sur mesure | Contractuel | Base technique 50, administrateurs non bornés | À rendre réellement contractuel |

Le comptage porte sur les salariés associés à un compte applicatif au statut `actif` ou `pause`. Un utilisateur est donc rattaché à un salarié ; un super-administrateur plateforme n'entre pas dans le quota tenant. Les appareils supplémentaires utilisent une logique distincte.

Le dépassement n'est pas un blocage strict : il peut être réconcilié et facturé par prix supplémentaire si les variables Stripe correspondantes sont configurées. Le plafond d'administrateurs est déclaré dans la grille mais son application stricte n'est pas démontrée partout. Des tests dédiés sont nécessaires avant commercialisation.

## 7. Matrice fonctionnelle actuelle

Légende : ✓ inclus ; — non inclus ; C contractuel/à configurer.

| Fonction ou quota | Mini | Pro | Business | Entreprise | Sur mesure |
|---|:---:|:---:|:---:|:---:|:---:|
| Tableau de bord, messagerie, clients, chantiers | ✓ | ✓ | ✓ | ✓ | ✓ |
| Devis, factures et facturation avancée | ✓ | ✓ | ✓ | ✓ | ✓ |
| Planning | ✓ | ✓ | ✓ | ✓ | ✓ |
| Assistant IA / quota mensuel | 100 | 500 | 1 500 | 3 000 | 3 000 actuellement |
| Pointages, salariés, absences, frais | — | ✓ | ✓ | ✓ | ✓ |
| Achats, interventions, CRM | — | ✓ | ✓ | ✓ | ✓ |
| Stock, matériel, flotte, ouvrages | — | — | ✓ | ✓ | ✓ |
| Rentabilité, exports, vues paie | — | — | ✓ | ✓ | ✓ |
| Connecteurs, appels d'offres, sous-traitants | — | — | — | ✓ | ✓ |
| Paiements bancaires, gestion complète de paie | — | — | — | ✓ | ✓ |
| Stockage | 10 Go | 50 Go | 150 Go | 300 Go | 500 Go actuellement |

Points de vigilance :

- l'onboarding présente le besoin « planning » comme un palier Pro alors que le code inclut le planning dans Mini ;
- l'IA figure dans les offres et quotas, mais sa disponibilité Production dépend d'un drapeau fonctionnel et était désactivée dans les contrôles C6-A ;
- les libellés support, accompagnement, automatisations et comptabilité ne disposent pas tous d'une matrice technique explicite : ne pas les promettre comme différenciants avant validation ;
- les droits runtime proviennent de la grille statique, pas systématiquement de la version contractuelle en base.

## 8. Offre Sur mesure

État actuel :

- prix statique « dès 699 € » et annuel 8 388 € dans le code, la base et les documents ;
- aucune paire de Prices Stripe dédiée et aucune variable de checkout automatique ;
- `devisObligatoire` empêche la commercialisation automatique ;
- le type TypeScript et la table imposent actuellement des montants numériques, ce qui représente mal « Sur devis » ;
- l'interface de versionnement ne sait pas correctement exprimer simultanément un prix absent et des administrateurs non bornés.

Cible sûre :

- afficher uniquement « Sur devis » et un CTA « Nous contacter » ou « Demander un devis » ;
- conserver l'exclusion du checkout automatique ;
- préserver l'ancienne version 699 €/8 388 € comme historique inactif ;
- introduire soit des prix nullables, soit un mode contractuel explicitement gardé dans tous les consommateurs ;
- ne jamais laisser un éventuel sentinel technique `0` s'afficher ou entrer dans un calcul public.

## 9. Stripe et abonnements

L'audit Stripe a été réalisé en lecture seule dans l'environnement Test. Aucun identifiant sensible n'est reproduit ici.

- quatre Products ELSATIA actifs : Mini, Pro, Business et Entreprise ;
- huit Prices actifs : un mensuel et un annuel par Product ;
- tous sont `livemode:false` et identifiés comme environnement de test ;
- les montants concordent avec la grille actuelle ;
- Sur mesure ne possède aucun Price ni mapping automatique ;
- les mappings applicatifs sont fournis par variables d'environnement distinctes ;
- aucun coupon ni code promotionnel n'existe actuellement dans Stripe Test ;
- trois abonnements de test existent, tous annulés ;
- la base Production contient zéro abonnement entreprise et zéro entreprise avec abonnement Stripe actif.

**Nombre d'abonnements clients réels identifié : 0.**

Plan Stripe : créer de nouveaux Prices immuables en Test, mettre à jour uniquement les mappings Preview, tester tous les parcours, puis reproduire en Production après validation humaine. Les anciens Prices doivent être conservés tant qu'ils peuvent référencer un contrat ou un historique. Aucun Price Sur mesure ne doit être créé.

## 10. Remises et promotions

| Capacité | Documentée | Implémentée | UI admin | Stripe relié | Testée fonctionnellement |
|---|:---:|:---:|:---:|:---:|:---:|
| Remise en pourcentage | Oui | Oui | Oui | Coupon | Non, hors mocks d'accès |
| Remise fixe | Oui | Oui | Oui | Coupon | Non, hors mocks d'accès |
| Durée limitée en mois | Oui | Oui | Oui | `repeating` | Non |
| Remise permanente | Oui | Oui | Oui | `forever` | Non |
| Remise ponctuelle | Oui | Oui | Oui | `once` | Non |
| Restriction à un client | Partielle | Oui, via son abonnement | Oui | Oui | Non |
| Code promotionnel | Partielle | Checkout les accepte | Non pour la création | Oui, manuel Stripe | Non |
| Offre pilote dédiée | Non | Non | Non | Émulable par coupon | Non |
| Prix contractuel spécifique | Partielle | Stockage/version en base | Pas de parcours complet | Partiel | Non |
| Date de début/fin explicite | Non | Durée Stripe seulement | Non | Partiel | Non |
| Justification interne auditée | Partielle | Description seulement | Partielle | Metadata possible | Non |
| Restriction explicite à une offre | Non | Non | Non | Possible | Non |

La plateforme sait créer et appliquer un coupon Stripe à l'abonnement d'une entreprise, puis le retirer. Une seule remise courante est gérée. Le checkout autorise les codes promotionnels, mais ELSATIA ne possède pas d'interface complète pour les créer ou les administrer.

Recommandation : conserver Coupons/Promotion Codes Stripe comme moteur, tout en ajoutant côté ELSATIA un enregistrement audité contenant type, valeur, durée, dates, motif interne, entreprise, offre et identifiants Stripe. Toute action doit être réservée au rôle facturation/total et testée en Stripe Test avant Production.

## 11. Super-administration et sécurité

La plateforme distingue les administrateurs tenant des membres de `plateforme_admins`. Les rôles déclarés sont `total`, `support`, `facturation` et `lecture`. Le contrôle serveur `est_plateforme_admin()` vérifie l'appartenance par l'e-mail authentifié, ce qui empêche un simple champ tenant modifiable côté client de conférer le rôle.

### Risque bloquant

La majorité des routes et actions sensibles vérifie seulement l'appartenance à `plateforme_admins`, sans imposer le rôle précis. En conséquence, un membre `lecture` ou `support` pourrait potentiellement atteindre des fonctions de tarification, remises, abonnements ou gestion d'autres administrateurs. Les rôles sont déclarés mais insuffisamment appliqués côté serveur.

L'entrée support dans une entreprise dispose d'un contrôle plus précis, d'un motif et d'un journal de session. L'accès bancaire est désactivé en mode support. En revanche, la journalisation des mutations de remises et d'administrateurs n'est pas complète.

**Classement : BLOQUANT AVANT ACTIVATION D'UN NOUVEAU SUPER-ADMIN.**

Corrections préalables :

1. créer un garde serveur par capacité (`total`, `facturation`, `support`, `lecture`) ;
2. l'appliquer à chaque route, action et RPC sensible ;
3. empêcher `support` et `lecture` de modifier tarifs, abonnements, remises ou administrateurs ;
4. journaliser les mutations sensibles ;
5. tester les refus par rôle et par tenant ;
6. vérifier que la lecture de la liste des administrateurs passe par le RPC protégé prévu.

## 12. Procédure pour `julien@elsatia.fr`

État observé en lecture seule :

- aucune entrée `julien@elsatia.fr` dans `plateforme_admins` Production ;
- aucun compte correspondant dans `auth.users` Production ;
- aucun `user_id` n'existe donc à communiquer ;
- un seul administrateur plateforme `total` existe actuellement, avec une autre adresse historique.

Procédure minimale, seulement après correction de sécurité et autorisation humaine :

1. créer ou confirmer le compte Auth Production avec l'adresse exacte `julien@elsatia.fr` ;
2. faire confirmer l'adresse et l'identité du compte ;
3. depuis l'administrateur `total` existant, appeler l'action/RPC protégée d'ajout avec le rôle `total` ;
4. vérifier l'accès aux routes plateforme autorisées et le refus des routes tenant non justifiées ;
5. tester la gestion multi-entreprises, la tarification, la facturation et le journal d'audit ;
6. documenter l'opération et sa révocation ;
7. révoquer par l'action/RPC protégée, avec protection du dernier administrateur total.

Aucun compte ni rôle n'a été créé ou modifié pendant cet audit.

## 13. Site public

La page `solutions/gestion-pro` contient une copie locale des quatre tarifs mensuels 79/249/449/599. Elle n'affiche ni annuel ni carte Sur mesure. Aucun tarif structuré dans les métadonnées SEO n'a été identifié.

Migration future :

- remplacer les trois premiers prix par 69/199/399 ;
- conserver 599 pour Entreprise et afficher « 40 salariés + 10 administrateurs » ;
- ajouter Sur mesure « Sur devis » sans montant ni checkout ;
- conserver « 30 jours d'essai » ;
- harmoniser les CTA et les limites de comptes ;
- vérifier FAQ, SEO, formulaire et liens vers l'application ;
- déployer seulement après validation globale et tests Preview.

## 14. Application et backend

Surfaces à migrer :

- `src/lib/tarification.ts` et les calculs associés ;
- page `/tarifs` ;
- page `/abonnement` et récapitulatifs ;
- onboarding, recommandation et besoins ;
- changement de plan, upgrade et downgrade ;
- checkout, webhook et réconciliation Stripe ;
- plateforme `/plateforme/tarification` et vues entreprise ;
- limites de comptes, administrateurs, stockage et quotas IA ;
- tests de tarification, permissions et facturation ;
- migration SQL créant de nouvelles versions, sans éditer l'historique.

Les plans historiques `Essentiel`, ancien `Pro` et `Premium` doivent rester comme compatibilité/historique, explicitement marqués comme tels. Le versionnement en base doit désactiver l'ancienne version active et créer une nouvelle version, jamais réécrire un contrat existant.

## 15. Documentation et occurrences

La recherche contextualisée a identifié :

- **139 occurrences tarifaires explicites pertinentes dans 19 fichiers ou livrables du dépôt/site**, réparties entre 12 documents, 4 fichiers applicatifs ou migrations, 1 fichier site et les 2 livrables C2-C ;
- **18 valeurs matérialisées supplémentaires dans les systèmes audités en lecture seule** : 10 champs de prix des plans actifs en base et 8 Prices Stripe Test ;
- soit **157 matérialisations pertinentes** si l'on inclut les systèmes externes, sans compter plusieurs fois leurs identifiants de mapping.

Ce comptage exclut les nombres sans contexte tarifaire. Certaines occurrences historiques doivent être conservées et annotées, non remplacées.

Documents futurs à mettre à jour :

- `docs/commercial/C3A_ARGUMENTAIRE_COMMERCIAL_ELSATIA.md` ;
- C3-B, C5-A, scripts et séquences C5-B ;
- checklists et pipeline C5-C ;
- préparation C5-D ;
- audit et checklist C6-A ;
- présentation C2-C PowerPoint et PDF.

Documents historiques à conserver avec une mention claire « historique / TARIFS-V1 » :

- `docs/RELAIS_TARIFICATION_2026-07-22.md` ;
- `docs/organisation/REGISTRE_CENTRAL.md`.

Les documents C4, les messages C5-F et le classeur C5-D ne contiennent pas d'ancienne grille fixe à corriger. Le classeur ne contient qu'une mention générique « Prix/offre adaptée ».

## 16. Livrables C2-C

La slide 11 de `ELSATIA-Presentation-commerciale.pptx` et de son PDF affiche l'ancienne grille, dont « Dès 699 € ». Neuf valeurs tarifaires visibles ont été relevées dans chacun des deux livrables.

Aucun générateur source maintenu n'a été retrouvé dans le dépôt. La procédure future est donc :

1. modifier la slide 11 du PowerPoint existant en préservant le masque et la mise en page ;
2. rendre et contrôler visuellement les 12 slides ;
3. exporter à nouveau le PDF avec LibreOffice ;
4. rendre et contrôler la page 11 du PDF ;
5. vérifier l'absence globale des anciennes valeurs hors mentions historiques autorisées.

## 17. Impact C5-G

Les messages envoyés à CARRELAGE DENNI, CRÉPI STYLE et STRASOL ne contiennent aucun prix. Aucun message correctif commercial n'est requis.

C5-G reste : trois prospects contactés et sept non contactés. Les sept prospects restants devront utiliser TARIFS-V2 après validation et migration. Aucun prospect, statut, relance ou fichier pipeline n'a été modifié.

## 18. Impact C6-A

Restent valides : essai de 30 jours, architecture Stripe, constats sur les quotas, mécanismes d'onboarding et contrôles généraux.

Deviendront obsolètes après TARIFS-V2 :

- matrices de prix mensuels et annuels ;
- ancien montant Sur mesure ;
- contrôles de concordance Stripe fondés sur les anciens Prices ;
- certains libellés d'offres dans l'onboarding et les checklists.

Les deux blocages C6-B déjà identifiés — privilège des lignes de devis et date d'essai — ne sont pas corrigés ici et demeurent indépendants de cet audit.

## 19. Plan de migration ordonné

### Phase 0 — décisions humaines

1. décider la règle et les montants annuels de Mini, Pro, Business et Entreprise ;
2. confirmer qu'aucun ancien client ne doit bénéficier d'un maintien contractuel particulier ;
3. valider le modèle technique « Sur devis » ;
4. confirmer les suppléments de comptes/appareils et les quotas IA ;
5. autoriser un lot séparé de sécurisation des rôles plateforme.

### Phase 1 — branche technique hors Production

1. créer le manifeste tarifaire V2 et adapter les types/consommateurs ;
2. mettre à jour les prix mensuels et le rendu Sur mesure ;
3. créer une nouvelle version SQL des plans sans modifier les versions historiques ;
4. mettre à jour le site public sur sa propre branche ;
5. actualiser la documentation future et annoter les documents historiques ;
6. modifier la slide 11 puis régénérer le PDF ;
7. ajouter les tests de cohérence multi-sources et anti-régression.

### Phase 2 — Stripe Test et Preview

1. créer de nouveaux Prices mensuels Test pour Mini, Pro et Business ;
2. créer les Prices annuels Test seulement après décision ;
3. conserver ou remapper Entreprise selon la décision annuelle ;
4. ne créer aucun Price Sur mesure ;
5. mettre à jour uniquement les variables Preview ;
6. tester checkout, webhooks, changement de plan, portail, essai et remises.

### Phase 3 — validation de bout en bout

1. tester l'application et le site en Preview ;
2. valider les limites et permissions par offre ;
3. contrôler les supports commerciaux ;
4. exécuter la recherche globale anti-ancienne grille ;
5. obtenir une validation humaine formelle.

### Phase 4 — Production séparée et autorisée

1. créer les nouveaux Prices Production ;
2. créer/activer les nouvelles versions de plans en base ;
3. mettre à jour les mappings Production ;
4. déployer application puis site ;
5. réaliser des contrôles sans paiement réel ou selon protocole autorisé ;
6. conserver les anciens Prices et contrats historiques ;
7. surveiller checkout, webhooks et facturation.

## 20. Plan de tests

- tests unitaires de la grille mensuelle, annuelle et du calcul de prix ;
- tests de sérialisation et concordance manifeste/base/site ;
- TypeScript, lint et builds Production locaux de l'application et du site ;
- limites salariés, utilisateurs, administrateurs, invitations et dépassements ;
- permissions et modules pour les cinq offres ;
- checkout Preview mensuel et annuel pour chaque offre automatique ;
- absence de checkout et CTA contact pour Sur mesure ;
- essai de 30 jours et transition vers abonnement ;
- webhooks, changement de plan, upgrade, downgrade et Customer Portal ;
- coupons en pourcentage, fixes, ponctuels, limités et permanents ;
- code promotionnel accepté/refusé et restriction attendue ;
- tests des rôles plateforme `total`, `facturation`, `support`, `lecture` ;
- refus d'auto-promotion d'un administrateur tenant ;
- journalisation des actions sensibles ;
- rendu visuel du site, du PowerPoint et du PDF ;
- recherche globale des anciennes valeurs, avec liste blanche limitée aux historiques, anciens Prices et tests de contrats anciens.

## 21. Actions nécessitant une validation humaine

1. nouveaux prix annuels et politique de remise annuelle ;
2. traitement contractuel d'éventuels anciens abonnés, même si aucun réel n'est présent aujourd'hui ;
3. représentation technique et commerciale de Sur mesure ;
4. grille des suppléments et quotas IA ;
5. correction des rôles plateforme ;
6. création du compte puis promotion de `julien@elsatia.fr` ;
7. création des Prices Stripe Test, puis Production ;
8. modification des variables Vercel Preview, puis Production ;
9. activation des nouveaux plans en base ;
10. déploiements application et site ;
11. publication des supports C2-C mis à jour ;
12. autorisation d'utiliser TARIFS-V2 avec les sept prospects non contactés.

## 22. Garanties de clôture de l'audit

- aucune action Stripe Production ;
- aucun déploiement ;
- aucune variable Vercel modifiée ;
- aucun rôle ou compte Production modifié ;
- aucun prospect contacté ;
- aucun abonnement réel modifié ;
- aucun travail C6-B, C6-C ou C6-D commencé ;
- seul ce rapport documentaire appartient au lot TARIFS-V2.
