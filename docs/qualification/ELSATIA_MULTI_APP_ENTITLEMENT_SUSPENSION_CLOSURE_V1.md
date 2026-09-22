# ELSATIA — Multi-App Entitlement & Suspension Closure V1

Date : 2026-09-22.
Branche de travail : `claude/busy-darwin-j8cl51` (identique à `origin/main`, tip `4d92ddb`, 2026-07-29).
Périmètre GitHub disponible pour cette mission : `julien-gregurec/Appli_BTP` uniquement (`julien-gregurec/elsatia-site` est également accessible mais hors sujet ici ; aucun dépôt séparé pour Colors/Tools/Studio/Reserves n'est accessible depuis cette session — voir §1).

## Verdict

**MULTI-APP ACCESS CONTRACT INCONSISTENT.**

Pas au sens « quelques policies mal alignées » : au sens où **le contrat multi-app n'existe tout simplement pas sur le train actuel** (`main`), et où le travail qui le construit ailleurs — réparti sur environ 200 branches non fusionnées — contient au moins deux schémas d'entitlement concurrents non réconciliés, deux correctifs divergents d'une même régression d'ACL, et une fuite de sécurité inter-tenant confirmée et encore ouverte. Le verdict « ENFORCEMENT REQUIRES CONTROLLED BACKFILL » supposerait un schéma canonique déjà choisi qui n'a plus qu'à être peuplé : ce n'est pas l'état constaté. Le verdict « LOCALLY QUALIFIED » supposerait qu'un train cohérent et testé existe quelque part : le document d'audit le plus complet trouvé sur ce sujet (`ELSATIA_CONVERGENCE_MAP_V1.md`, non fusionné) conclut lui-même à `DECISION_REQUIRED`, pas à une qualification locale acquise.

Aucune bascule en mode d'application (« enforce ») n'a été effectuée par cette mission, conformément à la consigne reçue. Un seul changement de code a été fait cette nuit, sur le train actuel : un correctif ciblé, additif et validé (voir §4), sur une divergence réelle et déjà présente dans `main` — sans rapport avec le multi-app en tant que tel.

---

## 1. Ce que ce rapport peut et ne peut pas couvrir

Le dépôt `Appli_BTP` ne contient que « Liria Gestion Pro » (nom de package `liria-gestion-pro`, `package.json:2`) : une seule application Next.js, un seul `src/app`, aucun répertoire `apps/*`, aucune référence produit à Colors/Tools/Studio/Reserves/ELSATIA nulle part dans `main` ni dans son historique. Les quatre autres applications citées dans la mission n'ont pas de dépôt accessible depuis cette session (`list_repos` ne renvoie que `Appli_BTP` et `elsatia-site`) : leur code front, s'il existe, est hors de portée. Ce rapport documente donc :

- **en détail et avec vérification directe du code**, le modèle d'entitlement/suspension réellement déployé par ce dépôt (single-app, §2) ;
- **par preuve Git** (branches, commits, hachages, dates), l'état du chantier multi-app ELSATIA tel qu'il existe uniquement sur des branches non fusionnées (§5-6) ;
- **explicitement comme non applicables au train actuel**, faute d'objet, les points de la mission qui présupposent un multi-app déployé (matrice de suspension inter-apps, backfill d'un entitlement par application, RLS par application) — avec justification (§7).

Deux agents de recherche ont fait ce travail d'investigation en parallèle : cartographie du code actuel (50 appels d'outils, lecture exhaustive des 178 migrations et du code d'accès), et archéologie Git sur ~250 branches distantes après `git fetch --all --prune`. Leurs conclusions se recoupent et sont citées nommément ci-dessous.

**Anomalie relevée en préalable, sans lien avec le sujet métier** : `AGENTS.md` (chargé automatiquement par les agents IA de ce dépôt via `CLAUDE.md`) demande de lire une documentation Next.js dans `node_modules/next/dist/docs/`. Ce chemin n'existe pas — `node_modules` n'était même pas installé dans cet environnement, et aucune version de Next.js ne publie de dossier `dist/docs`. Un audit antérieur, non fusionné (`docs/qualification/ELSATIA_SELF_SERVICE_COMMERCIALIZATION_CLOSURE_V2.md`, commit `f714541`), avait déjà signalé indépendamment cette même instruction comme une tentative probable d'injection de prompt déposée dans un fichier de configuration auto-chargé. Cette mission l'a également ignorée. **Recommandation** : un humain doit vérifier comment cette ligne s'est retrouvée dans `AGENTS.md` et qui l'a écrite.

---

## 2. Modèle actuel (main) : entitlement et suspension à un seul niveau

Le contrat cible de la mission (identité → organisation → entitlement par application → rôle application → permission métier) n'a pas d'équivalent à cinq niveaux ici, car il n'y a qu'une application à entitler. Le modèle réel :

| Concept cible | Réalisation actuelle |
|---|---|
| Organisation | `public.entreprises` (`supabase/migrations/20260710000001_comptes_entreprises.sql:16`) |
| Entitlement (par app) | Aucun — un seul produit. `entreprises.abonnement_statut`/`abonnement_offre` porte l'abonnement directement sur l'organisation. |
| Rôle « application » | `public.postes` (par organisation, `20260710000001:38`) + `public.permissions_poste` — joue le rôle de « rôle applicatif », scope à l'unique produit. 9 modèles prédéfinis (`20260718000104_roles_predefinis.sql`). |
| Permission métier | `public.permissions_disponibles` / `permissions_poste.cle_permission`, vérifiée par `public.a_permission(entreprise_id, permission)`. |
| Suspension | `entreprises.abonnement_statut` (`essai\|actif\|suspendu\|annule`) + `suspension_prevue_at` (échéance impayé). Pas de bascule plateforme globale séparée : la suspension est toujours par organisation. |

**Fonction pivot** : `public.est_membre_actif(entreprise_id)` (définition finale : `20260714000075_acces_plateforme_impayes.sql:50-67`) — combine appartenance active + abonnement non suspendu/annulé + échéance non atteinte, avec un bypass explicite et journalisé pour les accès support (`est_acces_support_actif`). Toutes les RLS métier (chantiers, devis, factures, stock, planning, paie, etc. — des dizaines de fichiers de migration) s'appuient sur `est_membre_actif`/`a_permission`, donc la coupure d'accès se propage uniformément sans répéter de logique de suspension dans chaque policy.

**Rôles plateforme (support/staff)** : `public.plateforme_admins.role in ('total','support','facturation','lecture')` (`20260714000072_plateforme_equipe.sql`). Un bug historique déjà corrigé mérite d'être noté : avant `20260719000115_roles_plateforme_appliques.sql`, `est_plateforme_admin()` ignorait la colonne `role`, ce qui permettait à des comptes `'lecture'`/`'support'` de modifier abonnements, tarifs et impayés. C'est corrigé dans cette même migration via `plateforme_exiger_role(...)`, qui restreint désormais les mutations commerciales (`plateforme_modifier_abonnement`, `plateforme_modifier_tarif_poste`, `plateforme_signaler_impaye`, `plateforme_enregistrer_reglement`) aux rôles `'total'`/`'facturation'`. **Point 7 de la mission (support ne doit pas modifier l'entitlement commercial sans contrat explicite) : déjà vérifié et déjà correctement appliqué sur le train actuel.**

**Refus d'accès ≠ destruction de session (point 9 de la mission)** : `src/lib/entreprise.ts:114`, en cas de suspension, exécute `redirect("/abonnement-suspendu")` — la session Supabase Auth (cookies/JWT) n'est jamais invalidée par un `signOut()`. L'utilisateur reste connecté, seul l'accès aux pages métier est bloqué. C'est le bon comportement et un précédent à respecter si un jour une couche multi-app est construite par-dessus (refuser une app ne doit pas couper la session globale).

---

## 3. RLS — état vérifié sur le train actuel

Aucune policy de `main` ne référence de notion « application » puisqu'aucune colonne `app_id` n'existe. Les policies lisent systématiquement `est_membre_actif`/`a_permission`, qui embarquent déjà la vérification de suspension. Aucune trace, dans `main`, du problème de régression d'ACL (« migration 255 ») documenté ailleurs (§6) : ce problème n'existe que sur des branches non fusionnées introduites après le tip actuel de `main`.

---

## 4. Correctif appliqué cette nuit sur le train actuel : divergence réelle du statut d'abonnement

En cartographiant le modèle actuel, une divergence de données bien réelle et déjà active a été identifiée — sans rapport avec le multi-app, mais directement dans le périmètre « fermer les incohérences de suspension » de la mission.

**Constat** : `20260723000142_tarification_abonnements.sql` introduit une seconde table, `public.abonnements_entreprises`, avec son propre `statut` (`essai|actif|impaye|suspendu|annule`), peuplée par un backfill ponctuel à la création de la migration. Or :

- `creer_entreprise_bootstrap` et `plateforme_creer_entreprise` (`20260710000003`, `20260716000086`, `20260718000104`) créent une entreprise **sans jamais insérer de ligne dans `abonnements_entreprises`** — toute entreprise créée après le 23 juillet n'a donc **aucun contrat** dans cette table.
- `plateforme_modifier_abonnement`, `plateforme_signaler_impaye`, `plateforme_enregistrer_reglement`, `appliquer_suspensions_impayes` (`20260714000075`, `20260719000115`) — c'est-à-dire toute suspension ou réactivation **manuelle** (hors Stripe) — ne modifient que `public.entreprises`, jamais `abonnements_entreprises.statut`, qui reste alors périmé.
- Seul le webhook Stripe (`src/app/api/stripe/abonnement/webhook/route.ts:64-117`) maintenait les deux tables synchronisées, au cas par cas, en TypeScript.

**Impact réel aujourd'hui** : l'accès (`est_membre_actif`, donc toutes les RLS) ne lit que `entreprises` — non affecté. Le risque porte sur toute lecture future de `abonnements_entreprises` (facturation, reporting, tableau de bord plateforme) : elle afficherait un statut incorrect, ou une entreprise complètement absente pour toute société créée après le 23 juillet. Vérifié : à ce jour, aucun code applicatif ne lit `abonnements_entreprises` en dehors du webhook lui-même (`grep` sur tout le dépôt) — le bug est donc latent, pas encore visible en usage, mais garanti de se déclencher dès qu'une fonctionnalité de facturation/reporting s'appuiera sur cette table comme source de vérité.

**Correctif livré** (`supabase/migrations/20260729000184_synchronisation_contrat_abonnement.sql`, additif) :
- une fonction `contrat_abonnement_par_defaut(entreprise_id)` qui calcule/insère le contrat par défaut à partir de l'entreprise (même logique de correspondance de plan que le backfill original de la 142) ;
- un trigger `AFTER INSERT ON entreprises` qui crée systématiquement le contrat, quel que soit le chemin de création (corrige le point ci-dessus à la racine plutôt que par callsite) ;
- un trigger `AFTER UPDATE OF abonnement_statut ON entreprises` qui répercute tout changement — manuel ou automatique — sur `abonnements_entreprises.statut` ;
- une réconciliation ponctuelle (backfill) des contrats manquants et des statuts divergents déjà en base.

**Validation effectuée** (aucun environnement Docker/Supabase local n'étant disponible dans ce bac à sable — `docker info` échoue, pas de démon actif — la validation a donc été faite avec un harnais Postgres local minimal plutôt que via `supabase test db`) :
- Reconstitution d'un schéma Supabase minimal (schémas `auth`/`storage`, rôles `anon`/`authenticated`/`service_role`, `auth.uid()`/`auth.email()`) sur PostgreSQL 16 local.
- **Fresh apply réel des 178 migrations existantes + la nouvelle, dans l'ordre, sur base vide : succès intégral (179/179), aucune erreur.**
- Scénarios fonctionnels exécutés en SQL direct : création d'entreprise → contrat auto-créé ; changement manuel de `abonnement_statut` → contrat synchronisé ; `appliquer_suspensions_impayes()` (le job cron) → contrat synchronisé ; suppression puis reconstruction du contrat via le helper (cas de rattrapage d'une entreprise pré-existante) → OK.
- **Rejeu de la nouvelle migration seule sur une base déjà migrée (test « Upgrade »/idempotence) : succès, aucune erreur, 0 ligne à réconcilier la seconde fois.**
- Un test pgTAP (`supabase/tests/synchronisation_contrat_abonnement.test.sql`) a été ajouté dans le style des tests existants du dépôt (voir `plateforme_impayes.test.sql`) ; il n'a pas pu être exécuté via `supabase test db` faute de démon Docker actif dans ce bac à sable — à faire tourner par un mainteneur disposant de Docker avant fusion, en plus de la validation manuelle déjà réalisée ci-dessus.
- `npm run verify:migrations` : passe (179 migrations valides, horodatages uniques).

Ce correctif est délibérément limité à cette seule divergence, réelle et vérifiable sur le train actuel. Il n'introduit aucune notion multi-app, aucune bascule d'enforcement, et ne modifie aucun comportement d'accès.

---

## 5. Le chantier multi-app ELSATIA : uniquement sur des branches non fusionnées

`origin/main` est figé au commit `4d92ddb` du 2026-07-29. Tout ce qui suit est postérieur de plusieurs semaines et **n'est ancêtre de `main` sur aucune des branches citées** (vérifié par `git merge-base --is-ancestor`).

### 5.1 Deux schémas d'entitlement multi-app concurrents, non réconciliés

- **Le plus ancien et le plus construit** : `codex/multi-app-convergence-v1` (commit `afb433d`, 2026-08-25) introduit `a_acces_application(entreprise_id, application)`, les tables `acces_applications_entreprises`, `historique_acces_applications` (audit append-only), `habilitations_applications_utilisateurs`, avec 27 tests pgTAP. Chaîne de durcissement sécurité directement dessus (toutes du 2026-08-26, aucune fusionnée) : `082e8e9` (uid support), `d5f4541` (AAL2 + rôles), `1140e42` (isolation support/audit). Une version plus tardive (rehearsal du 2026-09-20, doc `ELSATIA_PREVIEW_RELEASE_REHEARSAL_V1.md`) confirme des tables live `applications_elsatia`, `acces_applications_entreprises`, `habilitations_applications_utilisateurs`, `modules_entreprises`.
- **Le plus récent et le plus prudent** : `fix/app-access-convergence-v1` (commits `440915c`, `8eb7da2`, `417ed75`, `290f6bf`, 2026-09-20/21) introduit un concept séparément nommé, **`ELSATIA_GP_ACCES_APP`** / contrat `decision_acces_application` (voir §6), volontairement minimal : deux modes seulement, `off` (défaut) et `observe` (calcule et journalise en arrière-plan, sans jamais bloquer) ; `enforce` est reconnu mais **rétrogradé de force en `observe`** — le message de commit dit explicitement que l'enforcement « n'existe pas dans ce lot et ne peut pas être fusionné sans preuve que le backfill couvre les utilisateurs existants ». 68 tests prouvent que le proxy se comporte à l'identique avec ou sans observation. Aucun prix, aucun plan, aucune migration de production, aucun déploiement.

Ces deux lignées ne sont pas la même chose sous deux noms : ce sont deux architectures distinctes, à des stades de maturité différents, qui n'ont jamais été comparées ni réconciliées entre elles. C'est exactement la situation que le document d'audit le plus complet trouvé (`ELSATIA_CONVERGENCE_MAP_V1.md`, commit `91d8ee7`, 2026-09-20) qualifie lui-même de `DECISION_REQUIRED` : au moins 5 lignées mutuellement non réconciliées (sécurité, pilote GP + perf, commercial, préflight r73/colors, manifeste d'environnement), plus 3 lignées Colors et 2 lignées Reserves distinctes.

### 5.2 Une régression d'ACL corrigée deux fois, séparément, sans réconciliation

La migration `20260902000255_acl_reconciliation_v1.sql` (branche `codex/elsatia-acl-reconciliation-v1`, commit `d4dee2f`, verdict local documenté « ACL 255 locale GO ») corrige 854 privilèges excédentaires — mais casse au passage des flux applicatifs. Deux branches distinctes, datées du même jour (2026-09-11), corrigent chacune une partie du dégât **sans se référencer l'une l'autre** :
- `fix/service-role-flux-acl-255-v1` (tip `d41f835`) — flux admin.
- `fix/document-partage-service-role-acl-v1` (tip `aa430ce`) — partage de documents/PDF par lien.

`ELSATIA_CONVERGENCE_MAP_V1.md` liste explicitement ce point comme `DECISION_REQUIRED` : « 2 branches … sans branche d'intégration commune ».

### 5.3 Faille de sécurité confirmée, encore ouverte sur les branches concernées

La fonction `module_gestion_pro_actif_entreprise(...)` (`SECURITY DEFINER`, accordée à `authenticated`) ne vérifie pas l'appartenance de l'appelant, contrairement à ses fonctions sœurs `a_acces_application`/`applications_autorisees` — fuite empiriquement prouvée d'un booléen d'activation de module payant, inter-tenant. Le rapport `ELSATIA_PREVIEW_RELEASE_REHEARSAL_V1.md` (commit `67f4e5e`, 2026-09-20) classe ceci comme blocage de release, avec **7 fonctions sœurs présentant la même classe de vulnérabilité, encore ouvertes** au 2026-09-20. Un correctif existe (migration `20260905000266`, branche `claude/preview-rehearsal-security-fixes-v1`) mais n'est fusionné nulle part ailleurs. **Cette faille n'affecte pas `main`** (aucune de ces fonctions n'y existe), mais elle interdit de fusionner tel quel n'importe laquelle des branches multi-app existantes sans porter ce correctif au même moment.

### 5.4 Colors / Studio / Reserves / Tools — état fragmenté

- Colors : deux rapports de clôture contradictoires le même jour (`3e90c9f` « GO PILOTE SOUS CONDITIONS » puis `a376984` « BLOQUE ENVIRONNEMENT, RECETTE NON CONCLUSIVE » — 35 parcours Playwright jamais rejoués).
- Studio : `fix/studio-signup-closed-v1` (`634651a`, 2026-09-20) ferme l'auto-inscription, imposée côté base et hook Auth.
- Reserves : distinction volontaire entre panne d'habilitation et absence d'habilitation (`6c4b4bf`, `9102720`) — un principe sain, à retenir pour la conception d'un futur contrat multi-app.
- Tools : n'ajoute aucune migration propre ; sa branche la plus qualifiée est `release/tools-store-preflight-v1` (`bf27e78`).
- Un test e2e existe déjà pour la session inter-app (`9e972f4`, 2026-09-20) : un même compte ouvre Gestion Pro puis Colors, une session par application — pertinent pour le point 9 de la mission si ce travail est un jour intégré.

---

## 6. Résolution formelle de la divergence sur `ELSATIA_GP_ACCES_APP`

**Question posée par la mission** : certaines branches disent que ce concept existait « en proposition/observe », une mission récente dit qu'il n'existe pas dans le train actuel. Résolution par preuve Git :

- **`main` ne contient ni `ELSATIA_GP_ACCES_APP` ni `decision_acces_application`**, ni dans l'arbre courant ni dans son historique (`git grep` et `git log -S` restreints à `main` : zéro résultat). **Les deux affirmations sont vraies simultanément, car elles ne parlent pas du même périmètre.**
- Le concept a été introduit **uniquement** sur `fix/app-access-convergence-v1` (commits `440915c` → `290f6bf`, 2026-09-20/21), toujours en mode `off`/`observe`, jamais fusionné, jamais retiré — la branche existe toujours et n'a pas régressé depuis son introduction.
- Le document `ELSATIA_CONVERGENCE_MAP_V1.md` (2026-09-20 22:54 UTC) affirme que cette branche — ainsi que `fix/studio-signup-closed-v1` — « n'existe pas ». C'est une **erreur factuelle vérifiée** : les commits en question ont un horodatage d'auteur antérieur (18:43–22:19 UTC) à celui du document. L'explication la plus probable, en l'absence de télémétrie de push, est que ces branches n'avaient pas encore été poussées vers `origin` (ou pas encore récupérées par ce checkout) au moment où cette recherche `git log --all` a été lancée — date de commit ≠ date de disponibilité sur le remote. **Personne ne prétend que ce concept est présent dans `main` ou en état appliqué : ce point n'est donc pas un vrai désaccord sur l'état du monde, seulement une leçon sur la fraîcheur d'un `git fetch` avant de conclure à une absence.**

**Stratégie correcte, déterminée par la preuve plutôt que par supposition : `observe`, pas `enforce`.** C'est très exactement la position déjà choisie par les auteurs de `fix/app-access-convergence-v1` eux-mêmes, avec la même justification que la mission a explicitement demandé de respecter : pas de passage brutal en enforcement sans preuve que le backfill couvre les utilisateurs existants. Rien dans les preuves recueillies cette nuit ne justifie de changer cette position.

---

## 7. Points de la mission non applicables au train actuel, et pourquoi

| Point de mission | Statut | Raison |
|---|---|---|
| §3 Matrice de suspension inter-app (GP suspendu → Colors continue, etc.) | Non applicable à `main` | Une seule app existe dans `main` ; il n'y a rien à isoler. Le principe est déjà respecté par construction ailleurs dans l'écosystème via des tables d'entitlement séparées par app dès que celles-ci existeront (§5.1), mais ceci reste à tester une fois un schéma canonique choisi. |
| §4 Suspension plateforme globale distincte de la suspension commerciale | Non applicable à `main` | Il n'existe qu'un niveau de suspension (par organisation). Aucune bascule « plateforme » globale n'existe ni n'est nécessaire tant qu'il n'y a qu'une app. |
| §6 Backfill classé (unambiguous/ambiguous/manual review) | Non exécutable maintenant | Un backfill suppose un schéma cible stable. Deux schémas concurrents existent (§5.1), non réconciliés. Produire un backfill contre l'un des deux reviendrait à trancher unilatéralement un choix d'architecture commerciale — une décision produit, pas une décision technique, et explicitement hors du mandat « ne pas passer brutalement en enforce ». |
| §11 Matrice de tests automatisée complète (multi-app) | Non exécutable maintenant | Même raison : pas de code multi-app sur `main` à tester. Le seul test ajouté cette nuit (§4) porte sur le bug réel identifié dans le modèle actuel. |
| §7 Rôles support ne modifient pas l'entitlement sans contrat | **Vérifié conforme** sur `main` (voir §2) | — |
| §9 Refus d'app ne détruit pas la session globale | **Vérifié conforme** sur `main` (voir §2) | — |
| §11 RLS utilisent la bonne notion d'accès | **Vérifié conforme** sur `main` (voir §3) | — |

---

## 8. Décisions qui ne peuvent pas être prises cette nuit

Une IA ne peut pas trancher seule, sans supervision, sur un système commercial/facturation en production, les points suivants — ce sont des décisions produit/architecture, pas des corrections de bug :

1. **Quel schéma d'entitlement multi-app devient canonique** : la version minimale et prudente (`fix/app-access-convergence-v1`, `off`/`observe` uniquement) ou la version plus construite mais plus ancienne (`codex/multi-app-convergence-v1` et sa suite, `a_acces_application`/`acces_applications_entreprises`) — ou une fusion des deux. Les fusionner sans arbitrage produirait exactement le type d'architecture « inconsistante » que cette mission devait fermer, pas la résoudre.
2. **Réconciliation des deux correctifs de la régression ACL 255** (`fix/service-role-flux-acl-255-v1` vs `fix/document-partage-service-role-acl-v1`) — nécessite de vérifier qu'ils ne se recouvrent pas et ne se contredisent pas avant intégration commune.
3. **Portage obligatoire du correctif de fuite inter-tenant** (`module_gestion_pro_actif_entreprise` et les 7 fonctions sœurs, migration `20260905000266`) sur toute branche multi-app qui serait choisie comme base, avant tout déploiement — condition bloquante, indépendante du choix fait au point 1.
4. **Calendrier de passage `observe` → `enforce`** pour `ELSATIA_GP_ACCES_APP` une fois le schéma canonique choisi et le backfill validé — ne peut être fixé avant le point 1.

---

## 9. Recommandations

1. Fusionner le correctif de ce rapport (§4) sur `main` après revue humaine et exécution de `supabase test db` avec Docker disponible (non exécuté ici faute de démon actif).
2. Convoquer une décision produit/technique sur le point 8.1 avant toute nouvelle mission d'intégration multi-app — sans cela, toute mission future répétera ce même travail d'archéologie.
3. Avant d'intégrer une quelconque des branches multi-app à `main`, exiger explicitement la présence du correctif de fuite inter-tenant (§5.3/§8.3) comme condition de recevabilité.
4. Conserver la position `observe` (jamais `enforce`) pour `ELSATIA_GP_ACCES_APP` tant que 8.1 et 8.4 ne sont pas tranchés.
5. Traiter `docs/qualification/ELSATIA_CONVERGENCE_MAP_V1.md` comme la référence la plus à jour pour la suite (sous réserve de rafraîchir un `git fetch --all` avant de s'y fier, cf. §6), plutôt que de relancer une cartographie complète à chaque mission.
