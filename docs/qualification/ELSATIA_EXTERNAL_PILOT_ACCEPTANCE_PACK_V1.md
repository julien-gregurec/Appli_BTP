# ELSATIA GP — PACK DE RECETTE PILOTE EXTERNE (V1)

Mission autonome longue : préparer tout ce qui est nécessaire pour faire tester Gestion Pro à
une **vraie entreprise pilote accompagnée**. Aucune fonction majeure ajoutée. Ce document est le
pack de recette pilote lui-même — fixture, parcours d'onboarding, checklists par profil,
scénario 30 jours, procédures support/RGPD/incident/facturation, ~130 contrôles terrain, et le
verdict GO/NO-GO.

Rédigé en autonomie totale (aucune question bloquante — toute incertitude a été tranchée par une
hypothèse conservatrice, marquée `DECISION_REQUIRED` quand elle mérite une confirmation humaine
avant le pilote réel).

## 0. Base

```
Branche de travail : claude/upbeat-noether-djmg5i
Base réelle utilisée : train claude/compassionate-euler-5j6avr (fast-forward, 551 commits,
  0 divergence — la branche désignée était en retard sur ce train, alignée avant tout travail)
```

Aucun défaut produit n'a été corrigé dans cette mission : la recette (lecture de code + agents
d'exploration en lecture seule) n'a fait remonter aucun bug reproduit en conditions réelles
justifiant une exception P0/P1 à la règle « ne pas modifier le produit ». Les constats ouverts
(RBAC `employes`, absence de parcours d'acceptation client, exécution pgTAP jamais faite) sont
**déjà documentés par les missions précédentes** (`ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1.md`,
migration `20260922000312`) — ce pack les reprend, les qualifie pour la recette pilote et ne les
referme pas en code, conformément au périmètre demandé.

### État réel du train à la date de rédaction (2026-09-21)

Contrairement au rapport de clôture précédent (`ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1.md`, rédigé
sur une base plus ancienne sans `node_modules` installés), cette mission a pu installer les
dépendances (`npm ci`, 805 paquets) et exécuter réellement les vérifications rapides :

| Gate | Résultat | Preuve |
| --- | --- | --- |
| `npm run typecheck` (app principale Gestion Pro) | ✅ 0 erreur | `tsc --noEmit` |
| `npm run typecheck` (`apps/tools`, hors périmètre — Tools Atelier) | ❌ erreurs `@capacitor/*`/`jspdf` manquants | dépendances mobiles non installées dans cet environnement ; hors périmètre de cette mission (Colors/Tools-Atelier/Studio/Réserves explicitement non touchés par les missions précédentes et par celle-ci) |
| `npm run lint` (app principale) | ✅ 0 erreur, 6 avertissements mineurs préexistants (`<img>` non optimisé, etc.) | ESLint |
| `npx vitest run` | ✅ **153 fichiers, 1786 tests, 0 échec** | Vitest — supérieur aux 1150 tests du rapport de clôture précédent (train enrichi depuis) |
| `npm run build` (app principale, Turbopack) | ✅ « Compiled successfully » | `next build` — l'échec global de `npm run build` vient uniquement du sous-projet `apps/tools` qui refuse de builder sans variables `NEXT_PUBLIC_TOOLS_*` (garde-fou volontaire, hors périmètre Gestion Pro) |
| pgTAP (suites existantes + 7 suites de la nuit du rapport de clôture) | ❌ **toujours non exécuté** | **Aucun Docker, aucune CLI Supabase dans cet environnement** (`docker ps` échoue : `dial unix /var/run/docker.sock: connect: no such file or directory` ; `npx supabase` refuse l'installation interactive) — même limite que le rapport de clôture précédent, non levée par cette mission |
| Fresh / Upgrade / bancs de concurrence | ❌ Non exécutés, même raison | — |

**Conséquence directe pour ce pack** : la fixture pilote (§1) et les correctifs SQL déjà fusionnés
dans ce train n'ont **jamais tourné sur un vrai Postgres**. C'est la même réserve que le rapport de
clôture précédent, elle n'a pas changé. Le point 1 du GO/NO-GO (§12) en dépend directement.

---

## 1. Entreprise pilote synthétique

Fixture livrée : **`supabase/production/seed_entreprise_pilote_btp.sql`** (script SQL idempotent,
whitelisté dans `scripts/garde-scripts-production.mjs`, réservé au projet Preview
`pgvvpqyjziyapbbkydmc` — voir `supabase/production/README.md`). Exécution :

```bash
node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql
```

**Non exécuté** au moment de la rédaction (même limite d'environnement que ci-dessus). Le script a
été relu ligne à ligne, construit sur le gabarit déjà vérifié en conditions réelles
(`creer_entreprise_demo_18_mois.sql`) et sur les schémas de table confirmés dans les migrations
(`devis`, `factures`, `commandes_fournisseurs`, `notes_frais`, `demandes_conges`, `pointages`,
etc., avec leurs contraintes `check` exactes). **À exécuter sur Preview et à vérifier visuellement
avant tout usage réel en recette pilote** — c'est le premier item du GO/NO-GO (§12).

Point d'attention corrigé pendant l'écriture : la fonction RPC `installer_roles_predefinis` a été
volontairement **écartée** au profit d'un insert direct dans `postes`/`permissions_poste` — cette
RPC exige un appelant authentifié disposant du droit `gerer_utilisateurs`
(`peut_gerer_acces` → `auth.uid()`), qui n'existe pas dans une exécution SQL directe hors session
applicative ; l'appeler aurait fait échouer tout le script avec « Accès refusé ». Les 5 postes
créés reproduisent néanmoins exactement les intitulés et permissions du catalogue canonique
(`modeles_roles_predefinis`).

### Entreprise

« SARL Bâti-Rhône Construction » — SIRET fictif, 12 rue des Artisans, 69200 Vénissieux,
`abonnement_statut='essai'` (reflète le mode pilote réel décrit en §9 : pas d'abonnement
self-service, capacité étendue à la main par la plateforme). Toutes les données portent la marque
`[PILOTE]` en base et un domaine e-mail `@example.test` (RFC 2606, ne délivre jamais réellement).

### Effectif — 28 salariés sur les 5 profils demandés

| Profil (poste) | Effectif | Exemples |
| --- | --- | --- |
| Gérant | 1 | Karim Haddad |
| Administratif (poste « Administration ») | 2 | Nadia Ferreira (assistante de gestion), Yasmine Roy (comptable) |
| Chef de chantier | 3 | Bruno Castellani, Farid Amrani, Olivier Ngoma |
| Chef d'équipe | 4 | Kevin Lefebvre, Rachid Belkacem, Antoine Girard, Steven Duval |
| Ouvrier | 18 | maçons, coffreurs, électriciens, plaquistes, peintres, carreleurs, charpentiers, couvreurs, plombiers, menuisier, conducteur d'engins |

### Autres données

- **8 clients** : 5 particuliers, 1 promoteur (SCI), 1 syndic de copropriété, 1 professionnel
  (logistique) — dont un client sans chantier (Mme Blanchard) pour tester le cas « prospect en
  cours de qualification ».
- **7 chantiers**, statuts variés : `termine`, `facture`, `en_cours` ×3, `accepte`, `devis_envoye`
  — les 3 chantiers `en_cours` portent l'essentiel du planning/pointage.
- **9 devis** : `brouillon`, `envoye`, `accepte` ×6, `refuse` (variante non retenue).
- **7 factures** : simple soldée, simple **en retard** (test relance), 2 acomptes soldés, 2
  situations d'avancement (dont une récente non payée), 1 situation payée partiellement en cascade
  d'acompte. Volontairement **aucun avoir pré-seedé** : la création d'un avoir depuis une facture
  existante est un test d'acceptation à part entière (§13, AV-*), plus fidèle en le faisant
  vraiment plutôt qu'en injectant une ligne déjà faite.
- **Planning + pointages** : 4 semaines d'historique sur les 3 chantiers actifs, avec 2 pointages
  volontairement laissés `a_verifier` (validation chef de chantier à tester) et 1 pointage
  `arrivee_oubliee` (cas de régularisation).
- **5 fournisseurs**, **15 articles de stock** (dont plusieurs sous leur seuil d'alerte),
  mouvements d'entrée/sortie.
- **4 commandes fournisseurs** (`brouillon`, `confirmee`, `recue_partiel`, `recue`) avec 2 dépenses
  fournisseurs liées et 1 règlement partiel.
- **6 notes de frais** (`soumise` ×2, `validee` ×2, `refusee`, `remboursee`) et **4 demandes de
  congés** (`approuvee` ×2, `refusee`, `soumise`).

Aucune donnée réelle. Aucun nom, SIRET, adresse ou montant ne correspond à une entreprise, un
salarié ou un client existant.

---

## 2. Onboarding — parcours réel et frictions identifiées

Cartographié à la lecture du code (pages, actions serveur, RPC), pas supposé. Un wizard guidé
existe déjà : `src/app/onboarding/demarrage/page.tsx` (« Préparez votre espace de travail »),
6 étapes cochées automatiquement par comptage Supabase — mais il **ne couvre pas** les rôles, la
fiche salarié détaillée, ni l'envoi du premier document. La recette pilote doit combler ces trous
à la main (facilitateur).

| # | Étape | Route(s) / action | Obligatoire | Friction identifiée |
| --- | --- | --- | --- | --- |
| 1 | Création organisation | `src/app/onboarding/page.tsx` → `createEntrepriseAction` → RPC `creer_entreprise_bootstrap` | `nom` | La même page mélange 3 formulaires (activer une fiche employé / rejoindre par code / créer une entreprise) — risque de clic sur le mauvais bloc. |
| 2 | Paramètres entreprise | `/parametres` → `modifierEntrepriseAction` | `nom` | Pas de champ CGV dédié (seulement `texte_pied_page`/conditions du devis) ; SIRET non validé bloquant côté serveur ; logo importé par une action séparée. |
| 3 | Utilisateurs / invitation | `/employes/nouveau` puis activation par l'employé sur `/onboarding` (numéro d'inscription) | prénom, nom | **Friction majeure** : créer une fiche employé ne crée pas de compte — l'employé doit lui-même activer via un numéro d'inscription généré. Deux parcours parallèles (fiche employé vs code d'entreprise général) peuvent créer de la confusion. |
| 4 | Rôles (9 prédéfinis) | `/parametres/acces` → `installerRolesPredefinisAction` | — | **Friction majeure** : les rôles ne sont **pas installés automatiquement** à la création de l'entreprise — seul un rôle « Admin/Gérant » existe. Sans passage explicite par `/parametres/acces`, la liste des postes reste vide dans la fiche employé. |
| 5 | Fiche salarié | `/employes/nouveau`, `/employes/[id]` | prénom, nom | Le coût horaire interne est stocké dans une table séparée (`employes_cout_horaire`) — risque d'échec silencieux partiel. Un plafond d'abonnement peut bloquer la création sans que ce soit anticipé. |
| 6 | Fiche client | `/clients/nouveau` | — | `delai_paiement_jours` plafonné silencieusement (0-365) sans message si hors bornes. |
| 7 | Premier chantier | `/chantiers/nouveau` | `client_id` | **Ordre imposé** : impossible de créer un chantier sans client existant. Rayon de géofencing par défaut 300 m — dépendance cachée avec le pointage (étape 11). |
| 8 | Premier devis | `/devis/nouveau` | `client_id` | `chantier_id` optionnel — un devis peut exister sans chantier alors que le wizard suggère l'inverse ; le lien devis→chantier se fait ensuite par un second chemin (« créer le chantier depuis le devis »), peu évident. |
| 9 | Premier document (email/PDF/partage) | Bouton d'envoi sur `/devis/[id]` → `envoyerDevisEmailAction` (permission `gerer_devis` requise) | — | **Absente du wizard** `/onboarding/demarrage` — aucune coche automatique ne la valorise ; seul un testeur averti la découvre. |
| 10 | Planning (1ʳᵉ affectation) | `/planning` → `creerAffectationAction` | type d'activité, ≥1 employé, date, heures>0 | Échoue silencieusement (« Activité ou ouvrier invalide ») si l'employé n'est pas encore « actif » (bloqué par l'étape 3 non finalisée). |
| 11 | Pointage (1ᵉʳ pointage) | `/pointage` → `enregistrerArriveeAction` | employé, chantier | GPS obligatoire sauf motif explicite ; dépend implicitement des étapes 4 (poste avec pointage activé) et 7 (chantier avec coordonnées). |

**Résumé des 4 frictions transverses à traiter par le facilitateur pilote** (reprises dans le
top 10 frictions, §12) :
1. Les rôles prédéfinis ne s'installent pas seuls → premier réflexe à donner au gérant pilote.
2. L'invitation d'un salarié est un processus en deux temps déconnectés (fiche, puis activation
   par le salarié lui-même) → à expliquer avant le jour 1.
3. Le wizard d'onboarding est incomplet (rôles et premier document non suivis) → le facilitateur
   doit fournir sa propre checklist (celle-ci) en complément.
4. Pas de champ CGV dédié dans les paramètres → à clarifier avec le pilote avant le premier devis
   envoyé (voir aussi §10 RGPD/juridique).

---

## 3. Recette GÉRANT

Compte : Karim Haddad (poste « Gérant », tous droits). Checklist réelle, à dérouler sur la fixture
§1.

| # | Contrôle | Résultat attendu |
| --- | --- | --- |
| G1 | Connexion + dashboard | KPI visibles (CA, chantiers actifs, alertes), aucune erreur console |
| G2 | Alertes opérationnelles | Alertes du dashboard actionnables (ignorer / rétablir / déléguer — `app/actions/alertes.ts`) |
| G3 | Clients | Créer, modifier, consulter les 8 clients de la fixture, filtrer par type/statut |
| G4 | Chantiers | Voir les 7 chantiers, changer un statut, ouvrir DOE/documents/comptes-rendus/localisation |
| G5 | Devis | Créer, dupliquer, envoyer par e-mail, générer le PDF, ouvrir le lien public `/document/[token]` |
| G6 | Acceptation devis | Faire passer un devis `envoye` → `accepte`, vérifier la notification interne (`notifier_devis_accepte`) et l'entrée `journal_activite` |
| G7 | Factures | Créer une facture depuis un devis accepté, l'envoyer, enregistrer un paiement partiel puis total |
| G8 | Avoir | Créer un avoir sur la facture soldée `FAC-PILOTE-001`, vérifier qu'un second avoir sur la même origine est refusé (anti-doublon) |
| G9 | Relance | Déclencher une relance manuelle sur `FAC-PILOTE-002` (en retard), prévisualiser l'e-mail |
| G10 | Commandes/fournisseurs | Consulter les 4 commandes, réceptionner la commande `confirmee`, vérifier la mise à jour du stock |
| G11 | Dépenses | Consulter les dépenses fournisseurs, rapprocher un règlement |
| G12 | Personnel | Consulter les 28 fiches salariés, voir taux/coût horaires (accès gérant uniquement, cf. §5 restrictions ouvrier) |
| G13 | Paie | Ouvrir `/paie`, créer/consulter une période, vérifier la synchronisation des heures pointées |
| G14 | Planning | Réaffecter un employé, supprimer une affectation groupée |
| G15 | Validation pointages | Valider les 2 pointages laissés `a_verifier` par la fixture, régulariser le pointage « arrivée oubliée » |
| G16 | Congés | Approuver/refuser la demande `soumise` de la fixture |
| G17 | Stock | Constater les articles sous seuil d'alerte, ajuster un prix |
| G18 | Exports comptables | Générer un export TVA/ventes/achats sur la période de la fixture |
| G19 | Export RGPD | Lancer un export de données entreprise (`/parametres/donnees`), vérifier le manifeste de fichiers |
| G20 | Paramètres/accès | Installer les rôles prédéfinis sur une entreprise neuve (test du point de friction #1, §2), créer un rôle personnalisé |
| G21 | Utilisateurs | Inviter un nouvel utilisateur, changer son poste, désactiver un compte |
| G22 | Messagerie | Ouvrir une conversation chantier, envoyer un message avec pièce jointe photo |

---

## 4. Recette ADMINISTRATIF

Comptes : Nadia Ferreira / Yasmine Roy (poste « Administration » — `acces_clients`, `gerer_clients`,
`acces_devis`, `gerer_devis`, `acces_factures`, `gerer_factures`, `acces_achats`, `gerer_achats`,
`acces_employes` en lecture, `gerer_notes_frais`, `gerer_conges`, `gerer_parametres`,
`gerer_utilisateurs` — **pas** `acces_rentabilite`/`voir_ca`, contrairement au gérant).

| # | Contrôle | Résultat attendu |
| --- | --- | --- |
| A1 | Connexion | Menu limité aux modules autorisés par le poste (pas de rentabilité/trésorerie) |
| A2 | Clients | Créer un 9ᵉ client, modifier les conditions de paiement |
| A3 | Devis | Créer un devis pour le client sans chantier (Mme Blanchard), l'envoyer par e-mail |
| A4 | Factures | Émettre la 2ᵉ situation du chantier `PILOTE-CHA-004`, vérifier le calcul TTC |
| A5 | Paiement | Enregistrer un paiement sur une facture en retard, vérifier le changement de statut automatique |
| A6 | Commandes | Créer une nouvelle commande fournisseur, l'envoyer |
| A7 | Notes de frais | Valider la note de frais `soumise` de Youssef Benali (`NF` sur `PILOTE-CHA-004`) |
| A8 | Congés | Traiter la demande `soumise` (sans_solde) |
| A9 | Employés | Consulter une fiche salarié (lecture), tenter de modifier le taux horaire (doit fonctionner si `gerer_employes` accordé au poste — sinon message clair, pas une erreur brute) |
| A10 | Exports | Générer l'export comptable de la période |
| A11 | RGPD | Ouvrir `/parametres/donnees`, vérifier l'accès à l'export et à la demande de suppression |
| A12 | Utilisateurs | Créer un compte pour un nouveau chef d'équipe, l'affecter au bon poste |
| A13 | Messagerie | Répondre à un message chantier, utiliser la suggestion de réponse IA si activée |

---

## 5. Recette CHEF DE CHANTIER

Comptes : Bruno Castellani / Farid Amrani / Olivier Ngoma (poste « Chef de chantier » —
`acces_chantiers`, `gerer_chantiers`, `acces_planning`, `gerer_planning`, `gerer_pointage`,
`valider_pointages`, `acces_stock`, `gerer_stock`, `acces_achats`, `gerer_doe` — **prix des devis
masqués** : `voir_devis_chantier_sans_prix` seulement).

| # | Contrôle | Résultat attendu |
| --- | --- | --- |
| CC1 | Connexion | Accès direct par URL à `/employes` (fiche complète), `/paie`, `/rentabilite`, `/parametres` → redirection `/dashboard?acces=refuse` (middleware `src/proxy.ts`) |
| CC2 | Chantier assigné | Voir le détail du chantier dont il est responsable (`equipes_chantiers`), pas le budget chiffré du devis |
| CC3 | Devis sans prix | Ouvrir `/mes-travaux` sur son chantier : quantités/tâches visibles, **aucun prix** (RPC dédiée `mes_devis_chantiers_sans_prix`) |
| CC4 | Planning | Créer/modifier une affectation sur son chantier pour son équipe |
| CC5 | Pointage — saisie | Pointer son propre temps (arrivée/départ) |
| CC6 | Pointage — validation | Valider ou rejeter (avec preuve) les pointages `a_verifier` de son équipe |
| CC7 | Stock | Effectuer une entrée/sortie de stock depuis la borne, consulter l'état des articles |
| CC8 | Outillage | Consulter/affecter un outil à un membre de l'équipe |
| CC9 | Documents chantier | Ajouter une photo de compte-rendu, générer le DOE |
| CC10 | Commandes | Créer une commande de réapprovisionnement pour son chantier (`acces_achats`, pas de création de fournisseur) |
| CC11 | Notes de frais | Saisir sa propre note de frais |
| CC12 | Congés | Demander un congé pour lui-même |
| CC13 | Employés | Vérifier l'accès en lecture (`acces_employes`) : ne doit **pas** afficher `taux_horaire`/`cout_horaire` des autres salariés sur les écrans qu'il utilise (planning/pointage n'exposent que `id,prenom,nom` — vérifié en lecture de code, à confirmer par capture réseau réelle, voir §5bis CE-9 et le risque RBAC en §12) |

---

## 5bis. Recette CHEF D'ÉQUIPE

Comptes : Kevin Lefebvre / Rachid Belkacem / Antoine Girard / Steven Duval (poste « Chef d'équipe »
— mêmes droits qu'un ouvrier + `voir_heures_chantiers`, `acces_stock`, `acces_flotte`,
`acces_outillage`, `acces_interventions` ; **pas** `gerer_chantiers`/`gerer_pointage`/
`valider_pointages`).

| # | Contrôle | Résultat attendu |
| --- | --- | --- |
| CE1 | Connexion | Menu plus large qu'un ouvrier (stock, flotte, outillage, interventions) mais pas de gestion chantier/planning |
| CE2 | Chantiers | Consulter son chantier, sans les prix des devis |
| CE3 | Heures chantier | Voir le cumul d'heures de son équipe (`voir_heures_chantiers`), sans validation |
| CE4 | Planning | Consulter son planning, pas de création d'affectation pour autrui |
| CE5 | Pointage | Saisir son propre pointage ; **pas** d'accès à l'écran de validation (`/pointage/gestion`) |
| CE6 | Stock/outillage | Entrée/sortie stock via borne, consultation flotte/outillage |
| CE7 | Notes de frais / congés | Saisir les siens uniquement |
| CE8 | Messagerie | Accès à la conversation de son chantier |
| CE9 | Fuite employés (risque structurel documenté) | Vérifier par capture réseau (onglet Network du navigateur) qu'aucun appel déclenché par ce compte ne retourne `taux_horaire`/`cout_horaire`/notes RH d'un autre salarié — voir le constat RBAC en §12 : la policy RLS de la table `employes` autorise en théorie la lecture complète par tout membre actif, un correctif (`employes_annuaire`) existe en base mais **n'est utilisé nulle part côté UI** (confirmé par `grep`). Aucune fuite constatée dans les écrans actuels, mais le risque est structurel, pas un cas déjà exploité. |

---

## 6. Recette OUVRIER

Comptes : les 18 ouvriers de la fixture (poste « Ouvrier » — `acces_chantiers`,
`voir_devis_chantier_sans_prix`, `acces_planning`, `acces_pointage`, `saisir_son_pointage`,
`saisir_ses_notes_frais`, `demander_ses_conges`, `utiliser_borne_stock`,
`effectuer_entree_stock`, `effectuer_sortie_stock`, `acces_messagerie`).

| # | Contrôle | Résultat attendu |
| --- | --- | --- |
| O1 | Connexion | Menu réduit au strict nécessaire terrain |
| O2 | Chantiers | Voir uniquement les chantiers où il est affecté (`equipes_chantiers`/`affectations`) |
| O3 | Planning | Consulter son planning personnel |
| O4 | Pointage | Pointer arrivée/départ avec GPS ; déclarer un pointage oublié |
| O5 | Notes de frais | Saisir une note de frais avec justificatif photo |
| O6 | Congés | Déposer une demande de congé |
| O7 | Stock (borne) | Entrée/sortie de stock via la borne dédiée (code personnel) |
| O8 | Messagerie | Lire/écrire dans la conversation de son chantier |
| O9 | **Accès refusé — salaires** | URL directe `/paie`, `/paie/[id]` → redirection, aucune donnée de paie affichée |
| O10 | **Accès refusé — RH** | URL directe `/employes`, `/employes/[id]/modifier` d'un collègue → redirection |
| O11 | **Accès refusé — finances** | URL directe `/rentabilite`, `/tresorerie`, `/exports` → redirection |
| O12 | **Accès refusé — devis chiffrés** | `/devis`, `/devis/[id]` → redirection ; seul `/mes-travaux` (sans prix) reste accessible |
| O13 | **Accès refusé — factures** | `/factures` → redirection |
| O14 | **Accès refusé — paramètres/utilisateurs** | `/parametres`, `/parametres/acces` → redirection |
| O15 | Défense en profondeur | Une tentative de mutation directe (ex. appel réseau reconstruit à la main vers une action serveur RH) doit être bloquée côté serveur même si l'UI était contournée — vérifié en lecture de code (`src/app/actions/employes.ts` revérifie `permissions.includes("gerer_employes")` indépendamment du middleware) |

Tous les contrôles « accès refusé » ci-dessus sont couverts, côté code, par un garde-fou
**centralisé** dans `src/lib/supabase/proxy.ts` (middleware), pas page par page — cohérent avec
`src/lib/acces-socle-essai.test.ts`. Le seul point structurel encore ouvert (pas un accès UI, un
risque RLS) est documenté en O9bis ci-dessous et repris au GO/NO-GO :

| O9bis | Fuite RLS `employes` (à ne pas confondre avec O10) | Cf. CE9 ci-dessus — même constat, applicable à tout profil qui n'est pas RH/gérant/comptable. Non exploité par l'UI actuelle, risque structurel en base. |

---

## 7. Scénario 30 jours

| Période | Activités | Profils impliqués | Points de friction à surveiller |
| --- | --- | --- | --- |
| **Jour 1** | Configuration : paramètres entreprise, **installation des rôles prédéfinis** (friction #1, §2), création des comptes gérant + administratif | Gérant | Sans l'étape rôles, la suite bloque silencieusement (liste de postes vide) |
| **Jour 2** | Invitation des chefs de chantier/d'équipe, activation de leurs comptes (processus en 2 temps, friction #2) | Gérant, Administratif | Le salarié doit activer lui-même son compte — communiquer la procédure à l'avance |
| **Jours 2-5** | Saisie des premiers clients (5-8), premier chantier, premier devis, **premier document envoyé** (étape 9 absente du wizard, friction #3) | Gérant/Administratif | Vérifier que l'e-mail part réellement (pas de Mailpit/pile locale disponible en recette — dépend de l'environnement Preview réel) |
| **Jours 6-9** | Invitation des ouvriers, premiers pointages, premier planning | Chef de chantier, Ouvriers | Pointage GPS obligatoire — préparer les ouvriers à autoriser la géolocalisation sur mobile |
| **Semaine 2** | Planning complet, pointages quotidiens, première note de frais, première demande de congé | Tous profils | Validation des pointages par le chef de chantier — vérifier qu'aucun pointage ne reste bloqué en `a_verifier` plus de 48h |
| **Semaine 3** | Facturation (acompte, situation), première commande fournisseur, réception partielle | Gérant/Administratif, Chef de chantier | Vérifier le calcul TTC et la cohérence des situations avec l'avancement réel du chantier |
| **Semaine 4** | Reporting (dashboard, exports comptables), premier export RGPD à blanc (test, pas une vraie demande), bilan avec le pilote | Gérant | C'est le moment de dérouler le GO/NO-GO (§12) avec le client pilote lui-même |

---

## 8. Support pilote

Un processus déjà mature existe et **doit être réutilisé tel quel**, pas réinventé :

- **Canal** : `support@elsatia.fr`, catégories P0-P3 définies dans
  `docs/commercial/SUPPORT_PREMIERS_CLIENTS.md` (délais internes **non contractuels** — à rappeler
  explicitement au pilote, voir `DECISION_REQUIRED` ci-dessous).
- **Perte d'accès** (mot de passe, MFA, administrateur unique bloqué) :
  `docs/commercial/SUPPORT_PERTE_ACCES_V1.md` — vérification d'identité en 4 points, jamais de
  demande de mot de passe/TOTP/secret.
- **Cycle technique** : `src/app/actions/support.ts` (`envoyerMessageSupportAction`,
  `repondreSupportPlateformeAction`, notification e-mail best-effort non bloquante) — fil in-app
  `/plateforme/support`.
- **Référentiels transverses** : `docs/operations/MATRICE_EMAILS_V1.md` (quels e-mails partent),
  `docs/operations/AUDIT_LOG_OPERATEUR_V1.md` (traces).

`DECISION_REQUIRED` (tranché conservateur) : aucun SLA contractuel n'existe aujourd'hui pour un
pilote. Ce pack **ne invente pas** d'engagement de délai — le facilitateur pilote doit annoncer au
client un délai indicatif à l'oral/par écrit hors contrat (ex. « réponse sous 1 jour ouvré, best
effort »), sans le présenter comme un SLA. Si le pilote exige un SLA contractuel, c'est une
question commerciale/juridique hors périmètre de cette mission technique.

Catégorisation à utiliser pendant le pilote (reprise de `SUPPORT_PREMIERS_CLIENTS.md`) :

| Catégorie | Exemple | Action |
| --- | --- | --- |
| Bug critique (P0) | Impossible de se connecter, facture bloquée, perte de données | Escalade immédiate, voir §11 Incident |
| Bug bloquant (P1) | Une fonction ne marche pas mais un contournement existe | Ticket + contournement documenté au client |
| Question | « Comment fait-on pour... » | Réponse directe, éventuellement ajout à une FAQ pilote |
| Demande d'évolution | Fonction manquante | Collectée, **jamais développée en urgence pendant le pilote** (hors périmètre mission) |

---

## 9. Facturation pilote

Élément déjà en place mais jamais formalisé comme procédure — **c'est le vrai trou comblé ici**.

L'entreprise pilote reste en `abonnement_statut='essai'` (voir fixture §1) : pas d'abonnement
self-service actif. `docs/organisation/ELSATIA_GP_TRIAL_SOCLE_ACCESS_V1.md` (§5) confirme le mode
actuel — `ABONNEMENTS_PUBLICS_OUVERTS=false`, capacité de base à 3 personnes, extension possible
**sans Stripe et sans SQL manuel** via la RPC plateforme `plateforme_definir_capacite_personnes_supplementaire`
(geste tracé dans `historique_capacite_personnes`). Pour une entreprise pilote de 28 salariés
(comme la fixture), **ce geste plateforme est obligatoire dès le jour 1** — sans lui, l'onboarding
bloquera dès l'ajout du 4ᵉ compte utilisateur.

**Procédure de facturation pilote (formalisée ici)** :

1. Le pilote est facturé **manuellement, hors Stripe self-service**, sur devis/facture classique
   émis par ELSATIA elle-même (pas par le produit Gestion Pro).
2. La capacité de comptes est étendue par un opérateur plateforme via la RPC ci-dessus, jamais par
   une manipulation SQL directe.
3. Stripe reste en **mode Test** (`docs/operations/DIAGNOSTIC_STRIPE_WEBHOOKS_V1.md`,
   `docs/organisation/STRIPE_LIVE_CHECKLIST.md`) — aucun paiement carte réel ne doit être demandé
   au pilote pendant cette phase.
4. Aucune règle juridique nouvelle n'est inventée ici (délais de paiement, conditions
   contractuelles) : `LEGAL_REVIEW_REQUIRED` sur les conditions commerciales pilote elles-mêmes
   (à rédiger séparément par la personne habilitée, hors périmètre technique).

---

## 10. RGPD

Déjà très complet côté produit — repris et qualifié pour l'usage pilote, pas dupliqué :

- **Export** : `exporter_donnees_entreprise` (RPC), déclenché depuis `/parametres/donnees` ou
  `api/rgpd/export/route.ts` — export dynamique par table, exclusion des secrets/tokens/hash,
  journalisé. Manifeste de fichiers (devis-médias, documents chantier, notes de frais, bulletins
  de paie, cartes BTP, signatures) intégré à l'export depuis le correctif documenté dans
  `ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1.md`.
- **Suppression** : `demander_suppression_entreprise` (délai de grâce 30 jours, réversible,
  journalisé, confirmation par re-saisie du nom) — **aucune purge automatisée n'existe** ; la
  purge réelle reste manuelle et supervisée par la plateforme. Procédure complète :
  `docs/commercial/SUPPORT_SUPPRESSION_RGPD_V1.md` (qualification du demandeur, vérification
  d'identité, déroulé en 9 étapes, limites assumées en §9 de ce document).
- **Anonymisation salarié** : `anonymiser_employe` (RPC) + purge best-effort des fichiers Storage
  orphelins (photo/signature/carte BTP), corrigée dans le train déjà fusionné.
- **Registres** : `docs/juridique/rgpd-registre-des-traitements.md` (référence juridique, art. 30)
  et `docs/organisation/REGISTRE_TRAITEMENTS_RGPD.md` (vue opérationnelle, explicitement non
  validée juridiquement, renvoie au premier en cas de divergence) — **ne pas créer un 3ᵉ
  registre**.

**Procédure pilote (déroulé pour le facilitateur)** :

1. **Export manuel** : à la demande du pilote (test ou réel), le gérant du pilote déclenche
   lui-même l'export depuis `/parametres/donnees` — aucune intervention plateforme nécessaire.
2. **Demande de suppression** : si le pilote demande l'arrêt (fin d'essai, insatisfaction), utiliser
   `demander_suppression_entreprise` (délai de grâce 30 jours) — **jamais** une suppression directe
   en base.
3. **Fichiers** : couverts par le manifeste d'export ; pas de ZIP téléchargeable en un clic (hors
   périmètre assumé par la mission précédente).
4. **Support RGPD** : toute question d'un salarié ou client final du pilote (pas de l'entreprise
   pilote elle-même) doit être **redirigée vers l'entreprise pilote**, qui est responsable de
   traitement — ELSATIA n'a pas de relation directe avec les salariés/clients de ses clientes.

Manque réel, à signaler au pilote sans le combler ici : pas de registre applicatif des demandes
RGPD (suivi = tickets support uniquement), pas de script de purge validé après le délai de grâce.
`LEGAL_REVIEW_REQUIRED` reste valable sur les durées de conservation légale (paie : 10 ans) et sur
toute promesse faite au pilote au-delà de ce que le produit fait réellement aujourd'hui.

---

## 11. Checklist incident

Pas de procédure dédiée « incident pilote » dans le dépôt — synthèse construite à partir des
runbooks existants (`docs/runbooks/ELSATIA_RELEASE_GOVERNANCE_V1.md` §6-7,
`docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`, `docs/commercial/SUPPORT_PERTE_ACCES_V1.md` §6)
et adaptée au contexte d'un pilote accompagné (un facilitateur humain est toujours disponible,
contrairement à un self-service).

| Symptôme | Premier réflexe | Escalade si non résolu |
| --- | --- | --- |
| **Application injoignable (down)** | Vérifier le statut Vercel/Supabase (tableaux de bord), vérifier si l'incident touche uniquement le pilote ou tous les environnements | `ELSATIA_PRODUCTION_ROLLBACK_V1.md` — rollback si lié à un déploiement récent |
| **Connexion impossible** | Suivre `SUPPORT_PERTE_ACCES_V1.md` (vérification identité en 4 points) ; distinguer mot de passe oublié / MFA bloqué / administrateur unique bloqué | Escalade support technique si le compte lui-même semble corrompu (pas juste un oubli) |
| **Facture bloquée** (ex. impossible à modifier après émission) | Comportement **attendu** dans la majorité des cas — les factures émises sont volontairement verrouillées (`verrouiller_facture_emise`) ; vérifier si c'est un avoir/une situation qu'il faut créer à la place, pas une modification directe | Si le blocage est visiblement anormal (message d'erreur inattendu, pas juste un verrou métier) → ticket P0/P1 support |
| **Donnée incorrecte** (montant, statut, affectation) | Vérifier si l'erreur vient de la saisie (cas le plus fréquent en pilote — erreur de manipulation) avant de suspecter un bug produit | Si reproductible avec des données précises → ticket avec étapes de reproduction exactes (gabarit dans `SUPPORT_PREMIERS_CLIENTS.md`) |
| **E-mail non envoyé** | Vérifier le statut du document (un document `brouillon` ne peut pas être envoyé — garde volontaire) ; vérifier `docs/operations/MATRICE_EMAILS_V1.md` pour savoir quel e-mail est censé partir dans ce cas | Escalade si le document n'est **pas** en brouillon et l'envoi échoue quand même — remonter avec le transporteur (Brevo) et l'horodatage exact |

**Règle transverse pour le pilote accompagné** : tout incident touchant potentiellement plusieurs
entreprises (pas seulement le pilote) doit être traité comme un incident plateforme normal, hors
processus « pilote » — ce pack ne couvre que ce qui est spécifique à l'expérience du client pilote.

---

## 12. GO / NO-GO PILOTE

### Classification

- **P0** — bloque le pilote (doit être fermé avant le premier jour réel).
- **P1** — pilote possible uniquement avec contournement/documentation (facilitateur obligatoire).
- **P2** — acceptable pour un pilote accompagné, à traiter avant une extension au-delà du pilote.

| ID | Constat | Sévérité | Statut |
| --- | --- | --- | --- |
| P0-1 | **Aucune suite pgTAP n'a jamais tourné sur un vrai Postgres** pour les correctifs déjà fusionnés dans ce train (partage public, paiement TOCTOU, avoir anti-doublon, session support, etc.) — ni pendant la mission qui les a écrits, ni pendant celle-ci (même limite d'environnement : pas de Docker/CLI Supabase) | **P0** | **Ouvert** — à faire sur Preview avant le jour 1 du pilote : `supabase start` + `supabase test db`, puis exécuter la fixture §1 et vérifier visuellement les compteurs retournés |
| P0-2 | La fixture pilote (`seed_entreprise_pilote_btp.sql`) elle-même n'a jamais été exécutée | **P0** | **Ouvert** — même action que P0-1, à faire dans la même session Preview |
| P1-1 | Rôles prédéfinis non installés automatiquement à la création d'une entreprise (friction #1, §2) | **P1** | Contournement documenté : le facilitateur installe les rôles depuis `/parametres/acces` dès le jour 1 |
| P1-2 | Invitation salarié en 2 temps déconnectés (fiche + activation par le salarié) | **P1** | Contournement documenté : communiquer la procédure au pilote avant les invitations |
| P1-3 | Wizard `/onboarding/demarrage` incomplet (rôles, premier document non suivis) | **P1** | Contournement : ce pack (§2-§7) sert de checklist complémentaire |
| P1-4 | **Aucun parcours d'acceptation client en libre-service** — le lien public `/document/[token]` permet de consulter un devis, jamais de l'accepter en ligne avec preuve (IP/horodatage/texte accepté) ; toute acceptation aujourd'hui est une saisie administrative attestant d'un accord obtenu hors ligne | **P1** | Accepté pour un pilote accompagné (déjà la pratique BTP courante — devis signé papier/e-mail) ; `LEGAL_REVIEW_REQUIRED` sur la valeur probante si le pilote veut s'appuyer dessus juridiquement |
| P1-5 | Policy RLS `employes` autorise en théorie la lecture complète (dont `taux_horaire`/`cout_horaire`) par **tout membre actif**, y compris un ouvrier — vue de remplacement `employes_annuaire` créée en base mais **non utilisée par l'UI** (confirmé, `grep -r "employes_annuaire" src` ne retourne rien) | **P1** | Non exploité dans les écrans actuels (planning/pointage ne sélectionnent que `id,prenom,nom`) — risque structurel à surveiller (capture réseau pendant la recette CE9/O9bis), à fermer avant une extension au-delà d'un pilote accompagné et de confiance |
| P2-1 | Pas de SLA contractuel support (délais P0-P3 internes uniquement) | **P2** | Documenté §8, à annoncer sans le présenter comme contractuel |
| P2-2 | Pas de registre applicatif des demandes RGPD (suivi = tickets uniquement) | **P2** | Acceptable pour un pilote de taille réduite ; à industrialiser avant un déploiement plus large |
| P2-3 | Pas de champ CGV dédié dans les paramètres entreprise | **P2** | Contournement : utiliser le texte de pied de page du devis en attendant |
| P2-4 | `apps/tools` (hors périmètre Gestion Pro) ne build pas dans cet environnement faute de variables — n'affecte pas Gestion Pro | **P2** | Sans impact pilote, à surveiller si le pilote utilise aussi Tools Atelier (hors périmètre déclaré de cette mission) |

### Top 10 frictions utilisateur (pour le facilitateur pilote)

1. Rôles prédéfinis à installer manuellement dès le jour 1 (P1-1).
2. Invitation salarié en 2 étapes déconnectées (P1-2).
3. Wizard d'onboarding incomplet — utiliser ce pack en complément (P1-3).
4. Capacité de comptes plafonnée à 3 en essai — geste plateforme obligatoire avant d'inviter toute
   l'équipe pilote (§9).
5. GPS obligatoire pour le pointage — à anticiper avec les ouvriers (autorisation mobile).
6. Coût horaire salarié stocké séparément du reste de la fiche — vérifier qu'il est bien enregistré
   après création.
7. `delai_paiement_jours` plafonné silencieusement sans message (0-365).
8. Pas de champ CGV dédié — clarifier où les mentionner avant le premier devis envoyé.
9. Lien devis→chantier à double sens (chantier depuis devis, ou devis rattaché après coup) — pas
   évident sans explication.
10. Aucun SLA support contractuel — à clarifier avec le pilote avant le jour 1 pour éviter toute
    attente déçue.

### Blockers réels avant le premier pilote

Seuls **P0-1** et **P0-2** sont de vrais blocages techniques (absence de preuve d'exécution, pas un
défaut de code connu) — tout le reste a un contournement documenté compatible avec un pilote
**accompagné**. Les deux P0 partagent la même cause et la même action : obtenir un accès
Docker/CLI Supabase (ou équivalent Preview) et exécuter `supabase test db` + la fixture avant le
jour 1.

### Verdict

```
PILOT READY WITH WORKAROUNDS
```

Valable **uniquement pour un pilote externe accompagné** (facilitateur présent à chaque étape
critique), à la condition suspensive que **P0-1 et P0-2 soient levés avant le premier jour réel**
(exécution pgTAP + fixture sur Preview). Ce verdict ne concerne pas la commercialisation
self-service (Stripe reste en mode Test, capacité de comptes non autonome, aucun SLA contractuel).

---

## 13. Acceptance tests terrain

Voir **`docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`** — 143 contrôles terrain
(ID, profil, action, résultat attendu, criticité), organisés par module, dérivés de l'inventaire
réel des routes/actions serveur du produit (pas une liste générique).

---

## 14. Documents livrés par ce pack

- Ce rapport : `docs/qualification/ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md`.
- Fixture synthétique : `supabase/production/seed_entreprise_pilote_btp.sql` (whitelistée dans
  `scripts/garde-scripts-production.mjs`, documentée dans `supabase/production/README.md`).
- Acceptance tests : `docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`.

Aucun autre fichier produit/modifié en dehors de la documentation et de la fixture ci-dessus —
conformément à la consigne « ne pas modifier le produit sauf défaut P0/P1 évident reproduit
pendant la recette » (aucun tel défaut n'a été reproduit dans cette mission).
