# ELSATIA-UI-V2 — Refonte visuelle et ergonomique avant commercialisation

**État : décisions de pilotage enregistrées le 01-09-2026. Lot NON démarré.**
Le cadrage détaillé (inventaire exact des écrans, maquettes, design system) est à produire
**au lancement du lot**, sur autorisation explicite de Julien. Ce document ne fait que fixer
la direction et le périmètre pour ne pas perdre les décisions.

Ne pas mélanger ce lot avec les migrations de sécurité ni avec des opérations Production
sensibles. Prévoir des sous-lots séparés pour limiter les régressions.

---

## 1. Motif

Julien juge l'apparence actuelle de la plateforme trop brouillonne. Une refonte visuelle
**complète** est ajoutée à la liste des travaux obligatoires avant commercialisation
(`CHECKLIST_LANCEMENT.md` § 11).

La refonte commence par **ELSATIA Gestion Pro** (application maîtresse), puis est déclinée
sur **ELSATIA Colors** et **ELSATIA Tools**.

## 2. Invariants — la refonte ne doit rien remettre en cause

- fonctionnalités validées ;
- règles métier ;
- sécurité ;
- rôles et habilitations ;
- isolation multi-entreprise ;
- données ;
- parcours Stripe ;
- accès multi-applications ;
- architectures PWA et natives ;
- autonomie métier de Colors et Tools (interfaces, navigations, données, PWA séparées).

L'objectif n'est pas seulement de changer les couleurs : améliorer réellement l'ergonomie,
la compréhension et la rapidité d'utilisation.

## 3. Direction visuelle retenue

- interface professionnelle, moderne, adaptée aux entreprises du BTP ;
- zone de travail principalement claire ;
- menu latéral bleu nuit ELSATIA ;
- cartes et panneaux blancs ;
- typographie sombre, très lisible ;
- bleu ELSATIA réservé aux actions principales ;
- vert / orange / rouge réservés aux statuts et alertes ;
- davantage d'espacement ; moins de bordures ; moins de cartes visibles simultanément ;
  moins de couleurs concurrentes ;
- hiérarchie visuelle beaucoup plus nette ; informations principales immédiatement
  identifiables ; actions importantes clairement mises en avant.

## 4. Navigation à revoir

Simplifiée et regroupée par grands domaines métier :

- éviter les menus trop longs ; limiter les niveaux imbriqués ; regrouper les fonctions
  proches ; identifier clairement la page active ; rendre la recherche accessible ;
- affichage adapté bureau / tablette / mobile ;
- intégrer clairement le **sélecteur d'applications ELSATIA** (passage Gestion Pro ↔ Colors
  ↔ Tools) ; n'afficher que les applications autorisées pour l'utilisateur ; conserver une
  session commune sécurisée ; **revérifier les droits lors du changement d'application**.

## 5. Écrans prioritaires — Gestion Pro (phase 1 de maquettes)

1. tableau de bord principal
2. navigation générale
3. liste des chantiers
4. fiche chantier
5. clients
6. devis et factures
7. équipes et pointages
8. alertes opérationnelles
9. achats et stock
10. matériel et véhicules
11. abonnement
12. paramètres
13. administration
14. sélecteur d'applications
15. assistant IA et aide

**Tableau de bord** — ne pas surcharger. Prioriser : alertes réellement importantes ;
tâches du jour ; chantiers en cours ; chiffres essentiels ; raccourcis vers les actions
fréquentes ; une synthèse claire plutôt qu'une accumulation de cartes.

## 6. Déclinaison ELSATIA Colors

Identité métier autonome, déclinaison cohérente du design ELSATIA. Navigation métier :
tableau de bord · inventaire · ajout par photo · dépôts · mouvements · nuanciers ·
catalogues · imports · utilisateurs · paramètres · sélecteur d'applications.

Colors peut employer davantage de couleurs pour représenter peintures et teintes, mais
l'interface générale reste sobre et lisible.

## 7. Déclinaison ELSATIA Tools

Conserver l'approche : mobile-first, simple, rapide, adaptée au chantier, utilisable hors
ligne. Parcours principal préservé : **Saisie → Calcul → Résultat → Schéma → Instructions**.

Accueil préservé et amélioré : recherche · catégories · favoris · outils récents · outils
populaires · section « Je veux faire… » · accès rapide « Calculer » et « Tracer ».

Pas de fenêtres publicitaires, d'interstitiels ni de promotions gênantes. Les promotions
vers Colors ou Gestion Pro restent discrètes et contextuelles, après les résultats.

## 8. Méthode de validation (obligatoire, dans l'ordre)

Ne pas appliquer un nouveau design à toute la plateforme d'un coup.

1. auditer les principaux écrans actuels ;
2. identifier les problèmes de densité, de navigation, de hiérarchie ;
3. créer une mini-charte ELSATIA ;
4. préparer 2 ou 3 propositions de tableau de bord ;
5. préparer les variantes bureau / tablette / mobile ;
6. **faire valider la direction par Julien** ;
7. créer les composants communs ;
8. appliquer progressivement le design aux écrans prioritaires ;
9. vérifier qu'aucune fonctionnalité ni permission n'a régressé ;
10. tests d'accessibilité, de responsive et de lisibilité ;
11. décliner ensuite sur Colors et Tools ;
12. refaire les captures commerciales et App Store / Google Play **uniquement après**
    validation de la nouvelle interface.

🔴 **Julien doit valider la maquette finale avant son déploiement général.**

## 9. Estimation et sous-lots

Estimation initiale : **≈ 3 à 5 semaines** pour une refonte sérieuse des trois applications,
**à recalculer après l'inventaire exact des écrans** (sous-lot R1).

| Sous-lot | Périmètre |
| --- | --- |
| UI-V2-R1 | Audit de l'existant |
| UI-V2-R2 | Charte et design system |
| UI-V2-R3 | Maquettes Gestion Pro |
| UI-V2-R4 | Composants communs |
| UI-V2-R5 | Migration des écrans Gestion Pro |
| UI-V2-R6 | Responsive et accessibilité |
| UI-V2-R7 | Déclinaison Colors |
| UI-V2-R8 | Déclinaison Tools |
| UI-V2-R9 | Tests de non-régression |
| UI-V2-R10 | Captures commerciales et stores |

## 10. Place dans l'ordre des travaux — séquencement parallèle

- N'est **pas** un prérequis technique du GO-Live Stripe / juridique.
- **Est** un prérequis de l'**ouverture commerciale publique** : les captures du site et des
  stores ne sont refaites qu'après validation de l'interface V2
  (`CHECKLIST_LANCEMENT.md` § 8 et § 11).

**Décision de pilotage (01-09-2026) — avancer en parallèle, ne pas attendre le 21-10-2026 :**

- **R1 (audit) et R2 (charte / design system) peuvent commencer avant le 21-10-2026.**
- **Les premières maquettes de tableau de bord Gestion Pro (R3) peuvent aussi être
  préparées avant cette date.**
- Le **jalon INPI du 21-10-2026** (fin du délai d'opposition) reste **indépendant** du
  travail préparatoire UI.
- **Aucune mise en Production ni généralisation** du nouveau design **sans validation de
  Julien** (direction après R3, puis maquette finale avant déploiement général).
- Objectif : éviter de repousser inutilement l'ouverture publique à décembre 2026.
- La **date commerciale** reste conditionnée à **l'ensemble** des prérequis juridiques,
  techniques, financiers, de sécurité **et** d'interface.

**Séquencement d'ensemble (voies parallèles) :**

| Voie | Peut avancer dès maintenant | Jalon / dépendance |
| --- | --- | --- |
| Suivi INPI | oui | fin du délai d'opposition **21-10-2026**, puis revérification du dossier |
| Préparation Stripe / Production | oui | dépend de l'immatriculation EI (SIRET), KYC, banque |
| Audit et conception UI-V2 (R1–R3) | **oui, avant le 21-10** | — |
| **Validation de Julien** (direction, puis maquette finale) | après R3 | bloquant pour la généralisation |
| Migration progressive des écrans (R4–R6, R9) | après validation direction | non-régression obligatoire |
| Tests bureau/tablette/mobile + non-régression | après migration | bloquant pour R10 |
| Nouvelles captures commerciales / stores (R10) | après validation interface V2 | — |
| **GO commercial public final** | après **tous** les points ci-dessus + revérification INPI post-21-10 sans opposition | GO **unique**, cohérent entre `CHECKLIST_LANCEMENT.md`, `REGISTRE_CENTRAL.md`, `P15_GO_LIVE_CHECKLIST.md`, `docs/commercial/GO_LIVE_COMMERCIAL_CHECKLIST.md` |
