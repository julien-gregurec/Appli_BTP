# ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-CAPACITY-FIX-V1

Base technique : `996be15c136f09d9977375e700462b503a1720c3`
Branche : `fix/gp-trial-socle-access-capacity-v1`
Ledger migrations : **263** (inchangé — aucune migration ajoutée ni modifiée)

Ce lot ferme **P0-1** (routes du socle bloquées pendant l'essai) et rend **P0-2**
(plafond de 3 personnes) cohérent pour la première semaine d'essai, sans ouvrir la
commercialisation Stripe et sans toucher la base.

---

## 1. Définition du SOCLE

> **Le SOCLE ne dépend jamais d'une ligne `modules_entreprises`.**

Le SOCLE est **le périmètre fonctionnel de l'offre d'entrée de la grille canonique
(Mini)**, dérivé de `OFFRES_TARIFAIRES` — aucune liste codée en dur, aucune
divergence possible avec la grille commerciale.

Ce choix n'est pas arbitraire : la base fait déjà exactement cette normalisation
pour l'essai. `capacite_personnes_base` (migration `20260903000256`) traite une
entreprise sans `abonnement_offre` comme l'offre `mini`, et
`activeFeaturesForCompany` (`normalizePlan`) fait de même côté features. Le
correctif aligne le contrat d'accès du proxy sur ce contrat déjà en vigueur.

Source de vérité : [`src/lib/acces-socle-essai.ts`](../../src/lib/acces-socle-essai.ts).

### Permissions du SOCLE (10)

| Permission | Route gardée | Ouverte pendant l'essai |
|---|---|---|
| `acces_dashboard` | *(aucune garde)* | oui |
| `acces_messagerie` | `/messagerie` | oui |
| `acces_clients` | `/clients` | oui |
| `acces_chantiers` | `/chantiers` | oui |
| `acces_devis` | `/devis`, `/prestations`, `/imprimer/devis` | oui |
| `acces_factures` | `/factures`, `/imprimer/factures` | oui |
| `acces_facturation_avancee` | `/facturation-avancee` | oui |
| `acces_planning` | `/planning` | oui |
| `acces_employes` | `/employes`, `/api/employes` | oui |
| `acces_ia` | *(option IA, filtrée par `permissionsUtilisateur`)* | oui, si l'option IA est accordée |

Les permissions administratives (`acces_parametres`, `gerer_parametres`,
`gerer_utilisateurs`) n'ont jamais été des portes de module : `/abonnement`,
`/parametres` et `/parametres/acces` restaient et restent ouvertes.

### Permissions HORS SOCLE (modules optionnels / paliers supérieurs)

`acces_pointage`, `saisir_son_pointage`, `demander_ses_conges`,
`saisir_ses_notes_frais`, `acces_achats`, `acces_interventions`, `acces_crm`,
`voir_devis_chantier_sans_prix`, `acces_stock`, `utiliser_borne_stock`,
`acces_outillage`, `acces_flotte`, `acces_ouvrages`, `acces_rentabilite`,
`acces_exports`, `consulter_sa_paie`, `saisir_variables_paie`,
`controler_variables_paie`, `acces_connecteurs`, `acces_appels_offres`,
`acces_sous_traitants`, `acces_paiements_bancaires`, `gerer_paie`,
`exporter_paie`, `parametrer_paie`.

Leur accès reste gouverné **exactement comme avant** par le catalogue
`modules_gestion_pro` et l'entitlement `modules_entreprises`, via
`acces_module_pour_permission` (migrations `20260903000257` et `20260905000265`).

---

## 2. Cause racine de P0-1

`permissionEstPorteDEntreeModule` (`src/lib/tarification.ts`) classe en « porte
d'entrée de module » **toute** permission figurant dans la grille tarifaire —
donc aussi le SOCLE, puisque `PERMISSIONS_MODULES_LIMITEES` est l'union des
`fonctionnalites` de toutes les offres.

Depuis `ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1`, le proxy refuse une porte
d'entrée de module quand `abonnement_offre IS NULL` (l'état normal de toute
nouvelle entreprise), sauf si `acces_module_pour_permission` l'ouvre. Or **aucun
module `modules_gestion_pro` de statut `actif` ne couvre les permissions du
SOCLE**, hormis `acces_chantiers` (module `chantier`) et `acces_ia` (module `ia`).

Résultat mesuré sur la base 996be15 : 7 permissions du SOCLE n'avaient
**aucun chemin d'ouverture** pendant l'essai —
`acces_clients`, `acces_devis`, `acces_factures`, `acces_facturation_avancee`,
`acces_employes`, `acces_planning`, `acces_messagerie` — alors que la navigation
les affichait (elle est filtrée par `permissionsUtilisateur`, qui ne filtre rien
sans offre). D'où le symptôme « menu visible → module non inclus ».

---

## 3. Correction centrale

Une seule fonction décide, consommée par les deux gardes du proxy :

```
droitOuvertSansModule(droit, { abonnementOffre, abonnementStatut, essaiDebut, essaiFin })
```

1. **SOCLE + essai valide sans offre** → ouvert (correctif) ;
2. **offre souscrite** → règle de plan inchangée (`permissionIncluseDansOffre`) ;
3. **sans offre, hors SOCLE** → refusé : porte d'entrée de module, seul
   l'entitlement peut l'ouvrir.

Le proxy évalue ensuite `acces_module_pour_permission` **en OU** : la correction
n'enlève jamais un accès, elle en ajoute un. Aucune liste codée en dur dans les
pages : `src/lib/supabase/proxy.ts` est le seul point de garde modifié.

Fenêtre d'essai : `abonnement_essai_fin` fait autorité, à défaut
`abonnement_essai_debut + 30 jours` — même repli que la migration
`20260905000265` et que `getContexteEntreprise`.

---

## 4. Comportement par état d'abonnement

| État | SOCLE | Modules optionnels | Remarque |
|---|---|---|---|
| Essai valide, sans offre | **ouvert** | selon catalogue `actif` (branche essai) | correctif P0-1 |
| Essai expiré, sans offre | fermé | fermé | inchangé ; `getContexteEntreprise` redirige vers `/abonnement-suspendu?motif=essai_expire`, seule `/abonnement` reste accessible |
| Abonnement Mini | ouvert (périmètre Mini) | selon entitlement | inchangé |
| Abonnement Pro / Business / Entreprise / Sur mesure | ouvert (périmètre de l'offre) | selon entitlement | inchangé |
| Statut `suspendu` / `annule` | fermé | fermé | inchangé, redirection `/abonnement-suspendu` |
| Libellés historiques `essentiel` / `premium` | non filtrés | inchangé | inchangé |

---

## 5. Quota de personnes actives (P0-2)

### Ce qui n'a pas changé

Le plafond reste **intégralement porté par la base** :
`trg_capacite_personnes_actives` sur `public.employes` (migration
`20260903000256`), garde-fou infranchissable couvrant tous les chemins d'écriture.
Pendant l'essai, `capacite_personnes_base` normalise vers l'offre d'entrée : la
capacité de base vaut **3 personnes actives**. **Aucun contournement n'a été
introduit.**

### Ce qui a changé : le message

Sous `ABONNEMENTS_PUBLICS_OUVERTS=false`, « acheter maintenant », « changer
d'offre » et « ajouter de la capacité » ne mènent nulle part. Les messages de
quota sont désormais construits par
[`src/lib/quota-personnes-message.ts`](../../src/lib/quota-personnes-message.ts)
et ne proposent **que des actions réellement possibles** :

| Contexte | Actions proposées |
|---|---|
| Essai, souscription fermée | archiver une personne · contacter ELSATIA |
| Souscription ouverte, sans abonnement Stripe | archiver · choisir une offre · contacter ELSATIA |
| Abonné Stripe mensuel sur offre commercialisée | archiver · ajouter de la capacité · changer d'offre |

Surfaces corrigées : `/abonnement` (limite atteinte / dépassement), création
d'employé (`verifierCapacitePersonnes`), import en lot (`src/app/actions/import.ts`),
et le repli générique de `messageErreurUtilisateur` (module pur, sans contexte :
il ne propose plus que des actions toujours vraies).

### Chemin réel d'augmentation pendant l'essai

La RPC `plateforme_definir_capacite_personnes_supplementaire` existe **déjà au
ledger 263** (plateforme + AAL2, journalisée dans `historique_capacite_personnes`)
mais n'était câblée à aucun écran — d'où le recours au SQL manuel constaté.
Elle est désormais câblée sur la fiche entreprise de `/plateforme`
(`definirCapacitePersonnesSupplementaireAction`).

Un client pilote en essai peut donc dépasser 3 personnes **sans migration, sans
SQL manuel et sans Stripe**, par un geste plateforme tracé.

### Limite assumée

Il n'existe **pas** de chemin *autonome* (client seul) d'augmentation de capacité
pendant l'essai : cela exigerait soit Stripe (fermé), soit une migration modifiant
`capacite_personnes_base` pour l'essai. **P0-2 est donc fermé PARTIELLEMENT.**
Le lot d'ouverture self-service est à traiter après cutover, avec la
commercialisation.

---

## 6. Navigation

Pour toute fonction du SOCLE : **visible ⇒ accessible**. Vérifié par test sur
`NAVIGATION_APPLICATION` × `droitOuvertSansModule` (essai valide).

Pour les modules optionnels : visibilité inchangée, mais plus de faux CTA —
`/abonnement/module-non-inclus` explique désormais qu'il s'agit d'un module
optionnel hors essai, rappelle que les fonctions de base restent accessibles, et
n'affiche « Comparer les offres » que si `ABONNEMENTS_PUBLICS_OUVERTS=true`
(sinon : « Contacter ELSATIA »).

---

## 7. Parcours premier client (recette)

Sans `abonnement_offre`, sans ligne `modules_entreprises`, sans action plateforme,
sans Stripe, sans SQL :

`signup` → `onboarding` → `/dashboard` → `/clients` → `/chantiers` → `/devis` →
`/factures` → `/employes` → `/planning` → `/messagerie` → `/aide` → `/abonnement`

Chaque étape est couverte par un test (`§12 — parcours premier client`).

Limites explicitement attendues pendant l'essai :
- 3 personnes actives (au-delà : geste plateforme) ;
- modules optionnels (stock, pointage, achats, flotte, outillage, rentabilité,
  paie, connecteurs, appels d'offres, sous-traitants, CRM, interventions,
  ouvrages, banque) fermés sauf entitlement ;
- essai borné à 30 jours ;
- souscription payante fermée (`ABONNEMENTS_PUBLICS_OUVERTS=false`).

---

## 8. P0-3 / P0-4

**P0-3 (commercialisation)** — hors scope de ce lot, conformément à la consigne.
L'état `ABONNEMENTS_PUBLICS_OUVERTS=false` est **cohérent après le correctif** :
le premier client pilote utilise son essai complet sans abonnement et sans SQL
manuel ; le passage payant reste un chemin commercial hors ligne (contact
ELSATIA), et aucun écran ne prétend le contraire.

**P0-4 (RPC plateforme)** — deux RPC de déblocage existaient sans écran :

| RPC | Action serveur | Câblée ? |
|---|---|---|
| `plateforme_definir_capacite_personnes_supplementaire` | `definirCapacitePersonnesSupplementaireAction` | **oui** (nécessaire à P0-2) |
| `plateforme_definir_module_entreprise` | `definirModuleEntrepriseAction` (déjà présente) | non — volontairement |

`definirModuleEntrepriseAction` n'est pas câblée à un écran : P0-1 est résolu
centralement sans elle, et la câbler élargirait le scope sans nécessité. Son rôle
futur reste l'activation d'un **module optionnel** (achat, geste commercial,
essai module) pour une entreprise cliente, en attendant la reprise par le webhook
Stripe (R4).

---

## 9. Arbitrages

1. **SOCLE dérivé de Mini plutôt qu'une liste codée en dur** — évite toute
   divergence avec la grille commerciale, et reprend la normalisation déjà faite
   par `capacite_personnes_base` et `normalizePlan`.
2. **Correction dans le proxy, pas dans `permissionEstPorteDEntreeModule`** —
   cette fonction reste le contrat de `ELSATIA-TRIAL-MODULES-POLICY-CLOSURE-V1` ;
   la modifier aurait rouvert le SOCLE même pour un essai expiré, sur les routes
   d'API qui n'ont pas de Server Component pour les refermer.
3. **Ouverture conditionnée à l'essai en cours** — sans cette condition, un essai
   expiré aurait regagné l'accès API au SOCLE. La fenêtre de 30 jours est
   recalculée avec le même repli que la base.
4. **Pas de migration pour la capacité d'essai** — le plafond DB est respecté ;
   l'issue est un geste plateforme via une RPC existante, pas un contournement.
5. **Messages de quota contextuels plutôt qu'un texte unique** — le module pur
   `erreurs-utilisateur.ts` ne peut pas connaître l'état commercial ; il ne
   propose donc que des actions toujours vraies, et les appelants qui ont le
   contexte utilisent `messageLimiteAtteinte`.

---

## 10. Ce que ce lot ne touche pas

Aucune migration ajoutée ou modifiée · aucune écriture Supabase Production ·
aucun appel Stripe · aucun déploiement · aucune variable d'environnement de
Production · aucun runbook de cutover · cible de cutover inchangée · ledger 263.
