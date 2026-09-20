# ELSATIA-GP-EXTERNAL-PILOT-CLOSURE-V1

Mission non commerciale : fermer le maximum de blockers techniques empêchant un
premier **pilote externe accompagné** de Gestion Pro. Pricing/Stripe/contrat
commercial/entitlements/catalogue commercial explicitement hors périmètre
(une autre conversation les traite). Colors/Tools-Atelier/Studio/Réserves
explicitement non touchés.

## Base

```
BASE_CANONIQUE = release/gp-v1-rc (branche de travail : integration/gp-external-pilot-closure-v1)
TIP DE DÉPART  = 8caef2189fafe5e4eaff5d1c375d7385a524d114
LEDGER DÉPART  = 240 migrations
STATUT         = BASE_FALLBACK_NON_CANONICAL
```

Aucune des ancres demandées en cours de mission (`integration/gp-v1.1-converged-train-v1`,
commit `428220b4`, `integration/gp-external-pilot-readiness-v1`, `f2917b54`,
rapport `a63f7f83`, un ledger à ~292/364 migrations) n'existe dans ce dépôt —
vérifié par `git fetch`/`git ls-remote` complets (207 branches distantes) **et**
par l'API GitHub (recherche de commit, recherche de code, liste des 4 PR
existantes). La branche la plus proche par nombre de migrations
(`feat/gp-v1-metier-devis-planning-references-v1`, 293 fichiers) est une lignée
**divergente** de `gp-v1-rc` (ancêtre commun `fcdd4e7`) qui réintègre ~157k
lignes de Réserves v3-v6 et de mobile terrain — hors périmètre de cette
mission, donc écartée. `release/gp-v1-rc` reste la base la plus qualifiée
disponible : c'est une RC explicitement isolée du reste de l'écosystème
(Colors/Réserves), condition que cette mission impose de toute façon.

**Conséquence** : aucun correctif de cette nuit ne doit être présenté comme
「 candidat final 」 avant comparaison avec un train `f2917b54` réel — cette
réserve reste permanente tant que ce train n'existe pas dans l'environnement
accessible à cette mission.

Cinq commits sur `integration/gp-external-pilot-closure-v1`, poussés au fur et
à mesure : `9d55fd7`, `9ffeb28`, `4f313e4`, `e109954`, `fb819f7`.

## Limite d'environnement — à lire avant les verdicts

**Aucun Docker, aucun `supabase` CLI n'est disponible dans cet environnement**
(`docker ps` échoue, `which supabase` ne renvoie rien). `npm run db:start`
(qui bootstrappe Postgres+GoTrue+PostgREST+Storage localement) est donc
inexécutable ici. Conséquence directe et assumée :

- **pgTAP n'a jamais tourné cette nuit.** 6 fichiers de tests pgTAP ont été
  écrits pour les nouvelles fonctionnalités (voir tableau), relus attentivement,
  mais **aucun n'a été exécuté**. Trois migrations SQL de cette nuit
  (`20260916000302`, `303`, `304`) n'ont pas de suite pgTAP dédiée du tout.
  Ce sont des tests rédigés, pas des tests verts.
- **Fresh / Upgrade / bancs de concurrence (§25-27) : non exécutables**, même
  raison.
- Ce qui a pu tourner réellement, et qui a effectivement tourné : `tsc --noEmit`
  (0 erreur), `eslint` sur tous les fichiers touchés (0 erreur), la suite
  **Vitest complète** (1150 tests passés, 3 skip, 0 échec), et **`next build`**
  (Turbopack, exit code 0 — voir plus bas, ce n'était PAS le cas au départ).

Ce que ça change concrètement : les migrations SQL de cette nuit ont été
relues ligne à ligne, comparées à leurs versions précédentes réelles (pas
supposées), et une revue de code indépendante (`/code-review`, effort élevé)
a été passée sur l'ensemble du diff — dont deux erreurs réelles corrigées
(voir §29). Mais sans pgTAP exécuté, aucune preuve d'exécution ne remplace la
lecture. **Faire tourner ces 7 suites pgTAP sur une pile Supabase locale est
la toute première chose à faire avant tout pilote réel.**

---

## Tableau des blockers

| Blocker | Avant | Correction | Preuve | Après |
| --- | --- | --- | --- | --- |
| **Partage public cassé** (lien client + PJ e-mail) — régression `20260911000297` qui retire tout privilège `service_role` sur devis/factures/lignes/clients | 404 systématique sur `/document/[token]` et `/imprimer/partage/[token]` ; e-mail envoyé **sans pièce jointe**, avec un lien menant à une 404 | Fonction `document_commercial_public_par_token()` SECURITY DEFINER résolue par le jeton, exécutable par `service_role` seul, aucune table rouverte | `20260915000300...sql` + `supabase/tests/document_partage_public_par_jeton_v1.test.sql` (42 assertions, non exécuté) | Logique revue ligne à ligne ; **non vérifié en exécution réelle** (pas de Postgres local) |
| **Photos/signatures cassées sur le partage public** (mission §9, confirmé pas seulement suspecté) | `<img>` pointait vers des routes authentifiées (`/api/devis/pieces-jointes/[id]`, `/api/employes/[id]/signature`) → 401/redirection `/login` sur la page publique sans session | RPC `document_partage_media_path()` scopée au jeton + route `/api/documents/partage/[token]/media` | `20260916000308...sql` + `supabase/tests/gp_pilot_document_partage_medias.test.sql` (9 assertions, non exécuté) | Logique revue ; **non vérifié en exécution réelle** |
| **Garde brouillon (P0)** | Un devis/une facture brouillon pouvait partir par e-mail, générer un PDF, obtenir un lien public (aucun test de statut dans `envoyerDocumentCommercialParEmail`) | Garde applicative dans `envoyerDocumentCommercialParEmail` + garde base dans `document_commercial_public_par_token`/`document_partage_media_path` (`statut <> 'brouillon'`) | `src/lib/documents-envoi.test.ts` — 2 tests dédiés, **exécutés, verts** (71/71 sur ce fichier) | **Fermé et vérifié réellement** (Vitest) |
| **`relance_auto_exclue` verrouillé sur facture émise** | `UPDATE factures SET relance_auto_exclue=true` sur une facture émise levait « déjà émise » — fonctionnalité inutilisable | Champ ajouté à la liste blanche de `verrouiller_facture_emise` | `20260915000299...sql` + test pgTAP (20 assertions, non exécuté) | Logique revue (diffée avec la version proposée déjà auditée sur une branche tierce, 5/20→20/20 documentés là-bas) ; **non ré-exécuté ici** |
| **Date d'échéance dérivante après émission** | `date_echeance` explicitement dans la liste blanche du verrou + aucune vérification de statut dans `modifierEcheanceFactureAction` | Retirée de la liste blanche (gel base) + garde applicative + UI (formulaire remplacé par affichage figé hors brouillon) | `tsc`/`eslint`/build verts ; pas de test pgTAP dédié écrit | **Fermé**, non testé en base |
| **Devis sans identité émettrice figée** | `factures.entreprise_snapshot` existait, `devis` non — logo/adresse/CGV d'un devis envoyé changeaient si l'entreprise modifiait sa fiche | Colonne + trigger de capture + verrou d'immuabilité, symétriques à ceux des factures ; rendu v2 et RPC de partage public mis à jour pour préférer le snapshot figé | `20260916000303...sql` | Logique revue ; **non testé en base** |
| **Paiement (encaissement) — course TOCTOU** | `enregistrerPaiementAction` : `select` puis `insert` direct, sans verrou ; double clic/deux sessions pouvaient dépasser `montant_ttc` | RPC `enregistrer_paiement_facture` avec `for update` sur la facture + **`revoke insert` sur `paiements` pour `authenticated`** (trouvé manquant en revue indépendante, corrigé) | `20260916000301...sql` (corrigé par `e109954` après revue) | Logique revue deux fois (dont une revue indépendante) ; **non testé en base** |
| **Avoir — double création possible** | Verrou pris sur le devis mais aucune règle anti-doublon pour `type='avoir'` : double clic = deux avoirs intégraux | Index unique partiel `factures_avoir_unique_par_origine` + pré-check + résolution `unique_violation` | Même migration | Logique revue ; **non testé en base**. ⚠️ Une régression a été introduite puis corrigée le même soir : la recréation de `creer_facture_avancee` avait par erreur repris la version *pré-avenants* (`20260818000211`) au lieu de la dernière réelle (`20260818000215`, plafond `montant_contractuel_devis`) — détecté par la revue indépendante, corrigé dans `e109954` |
| **Session support plateforme — persistance permanente** | `est_membre_actif`/`a_permission` traitent une session support active comme un membre actif PARTOUT, y compris sur `utilisateurs_entreprises`/`permissions_poste` (INSERT) : un support pouvait s'ajouter un siège ou une permission permanente, survivant à la fin de la session | Nouvelle fonction `est_membre_actif_reel` (sans le OU support) utilisée spécifiquement sur ces deux policies créatrices d'état permanent | `20260916000304...sql` | Logique revue ; **non testé en base**. Reste ouvert : l'auto-promotion de rôle plateforme (`plateforme_ajouter_admin`, lecture→total) — simplification V1 documentée, rôles non encore appliqués nulle part, jugé structurel, non touché |
| **`relance_finaliser` sans contrôle de droit** | N'importe quel membre actif (même sans `gerer_devis`/`gerer_factures`) pouvait forger le résultat d'une relance manuelle | Même contrôle `a_permission` que `relance_reclamer`, dérivé de `type_document` | Même migration (`20260916000304`) | Logique revue ; **non testé en base** |
| **`relances_documents` : SELECT retiré par erreur à `authenticated`** | Historique des relances invisible sur les pages devis/facture (échec silencieux, pas une fuite) | `grant select` restauré (INSERT/UPDATE/DELETE restent fermés, volontaire) | Même migration | Logique revue ; **non testé en base** |
| **Export RGPD sans manifeste de fichiers** | Données tabulaires exportées, mais aucun résumé « quels fichiers, où, à qui » | `manifeste_fichiers_entreprise()` (devis-medias, chantier-documents, notes-frais, bulletins-paie, cartes BTP, signatures) intégré à `exporter_donnees_entreprise` | `20260916000305...sql` + `supabase/tests/gp_pilot_rgpd_manifeste_fichiers.test.sql` (9 assertions, non exécuté) | Couvre les buckets métier principaux, **pas un ZIP** (hors périmètre assumé) ; non testé en base |
| **Anonymisation salarié — Storage non purgé (UI mensongère)** | La RPC vidait les colonnes `photo/signature/carte_btp_storage_path`, mais les FICHIERS restaient dans le bucket `documents-employes` alors que l'UI affirmait « effacées définitivement » | `anonymiserEmployeAction` capture les chemins avant l'appel RPC puis supprime les fichiers Storage (best effort, ne bloque jamais l'anonymisation déjà réussie en base) | `fb819f7` | **Fermé** côté trois colonnes connues ; pas de test dédié |
| **`employes` — sur-exposition en lecture** | N'importe quel membre actif lit `taux_horaire`/`cout_horaire`/e-mail/téléphone/notes de TOUS les employés (policy FOR ALL sans restriction de colonne) | Vue `employes_annuaire` (colonnes réduites, `security_invoker`) ajoutée comme fondation | `20260916000307...sql` | **Ouvert** : la policy SELECT de la table de base n'a volontairement pas été resserrée (trop de points de lecture non audités pour risquer de casser pointage/planning cette nuit) |
| **Suspension (non-billing) — expérience** | Redirection inconditionnelle vers `/abonnement-suspendu`, sans exception — RGPD et support inatteignables ; message toujours « règlement non confirmé » même pour un essai expiré ; bouton « Régulariser » visible à tous, y compris sans droit | Réutilisation de l'allow-list déjà existante pour l'essai expiré (`/aide`, `/parametres/donnees`, `/abonnement`, `/api/rgpd/export`) ; message contextualisé par `motif` ; bouton conditionné à `peutGererAbonnementSuspendu()` (nouvelle fonction partagée, dédupliquée entre la page et l'action après la revue indépendante) | `9d55fd7` puis `e109954` | **Fermé** côté code ; non testé en navigateur réel (pas d'environnement de recette) |
| **Notification acceptation devis** | Personne n'était notifié quand un devis passait à `accepte` ; aucune trace `journal_activite` | RPC `notifier_devis_accepte` (journal + notifications aux membres `gerer_devis`), appelée depuis `changerStatutDevisAction` | `20260916000306...sql` + `supabase/tests/gp_pilot_notification_devis_accepte.test.sql` (7 assertions, non exécuté) | **Fermé pour ce qui existe réellement** — voir ACCEPTATION ci-dessous pour la limite importante |
| **Dépendances manquantes cassant `next build`** | `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-virtual` utilisés par `GrilleDevis.tsx` (chemin `/devis/nouveau`) sans être dans `package.json` : **`next build` échouait intégralement**, pas seulement `tsc` | Ajoutées à `package.json`/lockfile | `9d55fd7` | **Fermé et vérifié réellement** : `npm run build` → exit 0, confirmé deux fois avant/après d'autres correctifs |

---

### DOCUMENTS

- Garde brouillon fermée (e-mail/PDF/partage/token) — vérifiée par Vitest.
- Séquence émission → e-mail : déjà correcte dans le code existant (deux
  actions séparées, mais l'échec d'envoi ne repasse jamais un document en
  brouillon — vérifié par lecture, confirmé par les tests Vitest existants).
  Le vrai risque n'était pas l'ordre mais l'absence de garde de statut,
  fermée ci-dessus.
- Rendu canonique : devis et factures partagent désormais le même mécanisme
  de snapshot figé (entreprise + client) sur les 5 surfaces (aperçu émetteur,
  PDF authentifié, PDF public, portail client, pièce jointe e-mail) — le
  moteur v1/v2 lui-même n'a **pas** été unifié (`chargerRenduParJeton`/
  `document_rendu_par_token` restent du code mort côté portail public,
  structurellement bloqué sur v1) : refonte plus large, hors périmètre d'une
  nuit.
- Logo historique / snapshot entreprise : fermé pour devis ET factures.
- Date d'échéance : gelée après émission.
- PDF public / images protégées : finding confirmé et fermé (voir tableau).

### ACCEPTATION

**Constat important, à ne pas manquer** : ce dépôt n'a **aucun** parcours
d'acceptation client en libre-service. Le lien public (`/document/[token]`)
permet de consulter un devis, jamais de l'accepter. `signatures_documents`
est un mécanisme interne (un salarié signe avec sa propre signature
enregistrée), pas une acceptation client. Le seul passage au statut
`accepte` se fait par `changerStatutDevisAction`, une action authentifiée
réservée à un membre de l'entreprise — c'est-à-dire que **toute** acceptation
aujourd'hui est une saisie administrative attestant d'un accord obtenu hors
ligne (oral, e-mail, papier), jamais un clic du client. Cette nuit a fermé ce
qui pouvait l'être sans construire un nouveau module public : journalisation
+ notification interne. Construire un vrai parcours client (bouton
« Accepter » sur `/document/[token]`, preuve IP/user-agent/texte accepté
serveur, séparée de la saisie interne) est un **chantier neuf**, plus
important que tout le reste de cette liste pour la valeur juridique du
produit, volontairement non entamé cette nuit (nouveau module public =
surface de risque, contraire à l'esprit “aucun nouveau gros module”).
`LEGAL REVIEW REQUIRED` sur la valeur probante de tout mécanisme
d'acceptation, existant ou futur.

### RGPD

- Export : déjà solide (dynamique par table, exclusion secrets/tokens/hash,
  contrôle par `gerer_parametres`, journalisé).
- Manifeste de fichiers : ajouté (voir tableau).
- Anonymisation salarié : Storage réellement purgé désormais (UI honnête).
  `LEGAL REVIEW REQUIRED` reste valable pour les données de paie/conservation
  légale (10 ans) — non modifié, comme demandé.
- Suppression de compte : **aucun code n'exécute de suppression automatisée**
  d'utilisateur ou d'entreprise (`grep` négatif sur tout appel
  `auth.admin.deleteUser`/`DELETE FROM auth.users`). Le seul mécanisme est
  `demander_suppression_entreprise` (délai de grâce 30 jours, réversible,
  journalisé, confirmation par re-saisie du nom) ; la purge réelle est
  manuelle et supervisée par la plateforme. Le risque que la mission demande
  d'éviter (`DELETE auth.users` naïf, un propriétaire détruisant son
  entreprise) n'existe pas comme chemin de code exécutable aujourd'hui —
  point déjà fermé par construction, rien à corriger.

### EXPORT

Voir RGPD ci-dessus — export de données et manifeste de fichiers traités
ensemble (même fonction, `exporter_donnees_entreprise`).

### SÉCURITÉ

- Cross-tenant relance/reclamer : déjà correctement isolé (vérifié par
  lecture des deux systèmes de relance, ancien et nouveau) ; deux failles
  adjacentes réelles trouvées et fermées (`relance_finaliser`, grant
  `relances_documents`).
- Session support plateforme : le risque concret (persistance permanente)
  fermé ; le risque structurel (auto-promotion de rôle plateforme) documenté,
  non fermé — `LEGAL REVIEW REQUIRED` / `DECISION_REQUIRED` sur la voie à
  choisir (implémenter le moindre privilège par rôle, ou accepter que
  `plateforme_admins` reste "tout ou rien" pour l'instant).
- `employes` : fondation posée (vue), fermeture complète non faite.
- Revue indépendante (`/code-review`, effort élevé) passée sur tout le diff :
  3 trouvailles, les 3 corrigées et re-vérifiées (tsc/eslint/vitest/build
  verts après correction). Détail en fin de document.

### IDEMPOTENCE

- Paiement (encaissement) : fermé, y compris le bypass PostgREST trouvé en
  revue indépendante.
- Avoir : fermé.
- Facture/situation classiques : déjà protégés avant cette nuit (vérifié,
  pas de régression).
- Entreprise, client, chantier (création manuelle) : **toujours ouverts**,
  confirmés sans garde (ni DB, ni verrou) par l'audit de recherche de cette
  nuit — non traités faute de temps, impact business jugé inférieur à
  paiement/avoir (risque = doublons visibles et corrigibles à la main, pas de
  double encaissement ni de double crédit).
- Invitations : aucune table `invitations` dédiée n'existe ; l'onboarding de
  collaborateurs (fiche employé + code d'adhésion) a déjà des contraintes
  uniques ou clés primaires composites qui empêchent le doublon en base —
  seule l'UX en cas de course est dégradée (erreur brute au lieu d'un message
  clair), non corrigée cette nuit.

### EMAIL/NOTIFICATIONS

- Aucun Mailpit/pile Supabase locale disponible dans cet environnement :
  **aucun envoi réel n'a été testé**. La garde brouillon et le contenu des
  e-mails sont couverts par les tests Vitest existants (transport Brevo
  mocké), qui passent tous.
- Notification acceptation devis : ajoutée (voir tableau), utilise
  `notifications_utilisateurs` (mécanisme interne déjà en place, pas de
  nouveau système).
- Cycle de vie des demandes de support : **non audité cette nuit** —
  `src/app/actions/support.ts` et la page plateforme existent déjà sur HEAD
  mais leur complétude (statuts, fermeture sur inactivité, notification)
  n'a pas été revérifiée dans le temps disponible.

### TESTS

| Gate | Statut |
| --- | --- |
| `tsc --noEmit` | ✅ Vert (0 erreur, projet entier) |
| ESLint (fichiers touchés) | ✅ Vert |
| Vitest (suite complète) | ✅ Vert — 1150 tests passés, 3 skip, 0 échec (120 fichiers) |
| `next build` (Turbopack) | ✅ Vert — cassé au départ (dépendances manquantes), corrigé et revérifié 4 fois au fil des changements |
| pgTAP (6 nouvelles suites + suites existantes) | ❌ **Non exécuté** — pas de Docker/Supabase CLI dans cet environnement |
| Fresh (base neuve → migrations → fixtures → tests) | ❌ Non exécuté, même raison |
| Upgrade (base antérieure réaliste → migration par migration) | ❌ Non exécuté, même raison |
| Bancs de concurrence | ❌ Non exécuté, même raison |
| Revue indépendante (`/code-review`, effort élevé) | ✅ Faite — 3 trouvailles réelles, 3 corrigées |

---

## Verdict

**`NOT READY`** — pas parce qu'un P0 technique connu reste ouvert dans le
code lui-même (tous les P0 identifiés et traités cette nuit ont une
correction en place), mais parce que **rien de tout cela n'a tourné sur une
vraie base Postgres/Supabase ce soir**. Une migration relue attentivement dix
fois reste une hypothèse tant que `supabase db reset` + les 7 suites pgTAP +
la matrice de rôles n'ont pas confirmé qu'elle s'applique proprement sur les
240+ migrations existantes et qu'elle isole bien A de B en pratique. Deux
erreurs réelles ont déjà été trouvées et corrigées uniquement grâce à une
relecture manuelle attentive et une revue de code indépendante (bypass
PostgREST sur `paiements`, régression du plafond avenants) — la probabilité
qu'il en reste d'autres, invisibles sans exécution réelle, n'est pas nulle.

## MINIMUM RESTANT AVANT PREMIER PILOTE EXTERNE

1. **Faire tourner les 7 suites pgTAP de cette nuit** (`document_partage_public_par_jeton_v1`,
   `factures_relance_auto_exclue_verrou_v1`, `gp_pilot_paiement_avoir_idempotence`,
   `gp_pilot_rgpd_manifeste_fichiers`, `gp_pilot_notification_devis_accepte`,
   `gp_pilot_document_partage_medias`, plus les suites pgTAP existantes non
   rejouées) sur une pile Supabase locale réelle (`supabase start` +
   `supabase test db`), et corriger ce qu'elles révèlent. Aucune migration de
   cette nuit n'a de test pgTAP dédié pour `20260916000302` (gel échéance),
   `20260916000303` (snapshot entreprise devis) et `20260916000304` (session
   support / relance_finaliser) — à ajouter avant de les considérer clos.
2. **Rejouer Fresh et Upgrade** (base neuve, puis base réaliste avec documents
   émis/paiements/salariés) pour confirmer que les 9 nouvelles migrations
   s'appliquent proprement sur les 240 existantes, dans les deux sens.
3. **Construire un vrai parcours d'acceptation client** (bouton sur
   `/document/[token]`, preuve serveur horodatage/IP/user-agent/texte
   accepté, séparé de la saisie administrative) — c'est le seul écart entre
   « le produit journalise les actions internes » et « le produit peut
   prouver qu'un client a dit oui », qui est probablement la première
   question du pilote et de son assureur/comptable.
4. **Décider (`DECISION_REQUIRED`)** de la voie pour `plateforme_admins` :
   implémenter réellement le moindre privilège par rôle (`lecture`/`support`/
   `facturation`/`total`), ou documenter formellement que c'est tout-ou-rien
   pour ce pilote. Voie réversible recommandée : documenter pour l'instant,
   ne pas construire un nouveau système de permissions cette semaine.
5. Fermer complètement `employes` (policy SELECT resserrée + migration des
   points de lecture identifiés vers `employes_annuaire` ou une RPC dédiée),
   idempotence entreprise/client/chantier, et un audit du cycle de vie des
   demandes de support — dans cet ordre de priorité décroissante.

---

## Annexe — trouvailles de la revue indépendante (§29)

Revue effectuée avec `/code-review` (effort élevé, une seule passe, sans
fan-out multi-agent) sur le diff `origin/release/gp-v1-rc..HEAD` :

1. **`paiements` restait ouvert en INSERT direct pour `authenticated`** —
   le verrou de la nouvelle RPC `enregistrer_paiement_facture` était
   contournable par un appel PostgREST direct. **Corrigé** :
   `revoke insert on table public.paiements from authenticated`.
2. **`creer_facture_avancee` recréée depuis une version obsolète** — la
   version reprise (`20260818000211`) ne connaissait pas encore
   `montant_contractuel_devis()` (ajouté par `20260818000215` pour les
   avenants) ; la recréer telle quelle aurait fait régresser le plafond
   d'acompte/finale sur un devis avec avenant accepté. **Corrigé** : base
   reprise depuis la version réellement en vigueur, seul l'ajout anti-doublon
   avoir est neuf.
3. **Logique d'autorisation dupliquée** entre
   `ouvrirPortailAbonnementSuspenduAction` et la nouvelle page
   `/abonnement-suspendu` (risque de divergence future). **Corrigé** :
   extraite dans `peutGererAbonnementSuspendu()` (`src/lib/acces-support-abonnement.ts`),
   utilisée aux deux endroits.

Les trois corrections ont été re-vérifiées : `tsc --noEmit`, ESLint, Vitest
(suite complète) et `next build` restent verts après application.
