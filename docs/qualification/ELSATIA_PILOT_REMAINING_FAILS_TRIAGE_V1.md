# ELSATIA — Pilot 10 FAIL Triage (V1)

Mission courte (~30 min). Analyse technique des 10 cas `FAIL` de la matrice finale
(143 contrôles) du rapport source. **Aucun correctif appliqué, aucun merge,
aucune donnée inventée** — chaque case ci-dessous cite le root cause exact déjà
établi par exécution réelle dans le rapport source, ou le signale explicitement
comme non tranché quand c'est le cas (NF-01, PE-06).

## Source et baseline

- Document analysé : `docs/qualification/ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md`
- **Non présent sur `main` ni sur la branche de travail de cette mission**
  (`claude/eager-ptolemy-ro5m59`). Trouvé uniquement sur `origin/claude/loving-turing-aaopod`,
  HEAD `4056c5f3ccf5af545c477af1c071f27afddeaa47`, vérifié par
  `git fetch --all --prune` puis `git show <ref>:<chemin>`.
- Matrice source (§9) : 143 contrôles → 125 `PASS`, 10 `FAIL`, 5 `MANUAL_EXPECTED`,
  3 `REMOTE_ONLY`. Les 10 `FAIL` listés en §10 du rapport source sont repris
  intégralement ci-dessous — aucun cas ajouté ni omis.
- Ce document reste sur la branche courante de cette mission ; il ne modifie,
  ne merge et ne rebase rien depuis `claude/loving-turing-aaopod` (qui porte
  par ailleurs le correctif déjà appliqué pour `PL-02`, hors périmètre ici
  puisque `PL-02` est `PASS` dans la matrice V3).
- Note de traçabilité : le rapport source signale en son §0 avoir trouvé, dans
  `AGENTS.md` à la racine du dépôt, un bloc d'instructions ressemblant à une
  injection de prompt (renvoi vers un chemin `node_modules/next/dist/docs/`
  inexistant, avec incitation à le committer sans vérification) — non suivi
  par cette mission source, et non suivi non plus par la présente triage.

---

## 1. CH-08 — Ouvrier accède au détail d'un chantier non affecté

- **DESCRIPTION** : Un ouvrier authentifié mais non affecté (`equipes_chantiers`)
  à un chantier peut consulter `/chantiers/[id]` — réponse 200 normale, sans
  redirection ni message de refus. Contraire au critère P0 du pack (« Accès
  refusé ou liste vide »). Trouvé par exécution réelle (Playwright), pas
  seulement par lecture de code.
- **ROOT CAUSE CONNUE** : `src/app/(app)/chantiers/[id]/page.tsx` ne vérifie
  que l'appartenance à l'entreprise (tenant), jamais l'affectation
  `equipes_chantiers`.
- **APP / MODULE** : Chantiers (page détail)
- **CATÉGORIE** : UI + DB (contrôle d'accès en lecture manquant)
- **SÉVÉRITÉ** : Élevée — même classe de lacune d'isolation que `PL-02` avant
  son correctif. Atténuant confirmé par exécution : sections financières
  (budget/marge) restent gatées par permission, pas de fuite de données
  financières observée.
- **BLOCKER PILOTE ?** Non (verdict explicite du rapport source)
- **BLOCKER COMMERCIALISATION ?** Oui, probable — exposition de données de
  chantier (adresse, contacts, photos, documents) à un utilisateur non
  affecté, à corriger avant élargissement client.
- **EFFORT ESTIMÉ** : 30–90 min
- **DÉPENDANCES** : Clarifier qui doit rester exempté (gérant, chef de
  chantier avec droit global, admin) avant de bloquer l'accès à tout le monde.
- **CORRECTIF PROBABLE** : Vérification serveur en tête de page —
  `SELECT 1 FROM equipes_chantiers WHERE chantier_id=... AND employe_id=...`
  (ou permission "voir tous chantiers" équivalente) — redirection/404 sinon.
  Même patron que le garde-fou DB déjà posé pour `PL-02`.
- **TEST DE NON-RÉGRESSION À AJOUTER** : Faire passer le cas `CH-08` de
  `tests/e2e/pilot-acceptance-v3.spec.ts` (déjà écrit, actuellement `FAIL`) à
  `PASS`, + test ciblé (pgTAP/vitest) couvrant le cas "chef de chantier avec
  droit global" pour ne pas casser un accès légitime existant.

## 2. NF-01 — Note de frais + justificatif photo (ouvrier) redirige vers /login

- **DESCRIPTION** : Le formulaire `<form action={creerNoteFraisAction}>`
  soumet bien (log serveur `POST /notes-frais 303` confirmé) mais le serveur
  redirige vers `/login` — `getContexteEntreprise()` ne retrouve pas
  l'utilisateur pour cette requête précise, alors que la même session
  authentifie tous les GET de la même page et une autre Server Action
  (`ON-02`) avec le même helper `login()`.
- **ROOT CAUSE** : **Non identifiée** par la mission source (« Cause racine
  non identifiée dans le budget de cette mission »). Hypothèse la plus
  probable à vérifier en premier : traitement du corps multipart (upload
  photo) qui consomme/altère le flux avant que `getContexteEntreprise()` ne
  lise les cookies, ou middleware traitant différemment une requête
  multipart vs urlencoded.
- **APP / MODULE** : Notes de frais
- **CATÉGORIE** : AUTH + API (Server Action)
- **SÉVÉRITÉ** : Élevée — fonctionnalité entièrement bloquée pour le rôle
  ouvrier, cas d'usage terrain quotidien.
- **BLOCKER PILOTE ?** Non selon la classification du rapport source (pas
  nommé P0), mais à re-vérifier : un ouvrier ne peut littéralement pas
  soumettre de note de frais.
- **BLOCKER COMMERCIALISATION ?** Oui — fonctionnalité cassée pour un rôle
  utilisateur entier.
- **EFFORT ESTIMÉ** : 2–4 h (investigation à cause racine inconnue ; la
  correction elle-même sera probablement <30 min une fois la cause trouvée)
- **DÉPENDANCES** : Reproduire en local avec logs détaillés sur
  `getContexteEntreprise()` (cookies reçus, type de corps de requête, taille) ;
  comparer précisément avec le chemin `ON-02` qui fonctionne.
- **CORRECTIF PROBABLE** : À déterminer après investigation — suspect n°1 :
  ordre de lecture du corps de requête (upload) vs lecture des cookies/session
  dans `creerNoteFraisAction`.
- **TEST DE NON-RÉGRESSION À AJOUTER** : Faire passer le cas `NF-01` de
  `tests/e2e/pilot-acceptance-v3.spec.ts` (déjà écrit, actuellement `FAIL`) à
  `PASS` + test ciblé sur `creerNoteFraisAction` avec upload photo réel sous
  JWT ouvrier.

## 3. PE-06 — Signature électronique employé

- **DESCRIPTION** : Le test Playwright échoue après clic sur « Enregistrer »
  — aucune requête n'atteint le serveur.
- **ROOT CAUSE PROBABLE (non confirmée comme défaut produit)** : Le
  `PointerEvent` synthétique dispatché par Playwright sur le `<canvas>` ne
  fait pas passer `vide.current` à `false` comme le ferait un vrai tracé,
  donc `enregistrer()` s'arrête côté client avant même d'appeler l'action
  serveur. Identifié par lecture de `SignatureEmploye.tsx` + absence totale
  de log serveur après le clic. **Jamais testé manuellement dans un vrai
  navigateur** — pourrait être un faux positif d'automatisation.
- **APP / MODULE** : Personnel (signature employé)
- **CATÉGORIE** : UI (interaction canvas)
- **SÉVÉRITÉ** : Indéterminée tant que non vérifiée manuellement — nulle si
  faux positif de test, potentiellement élevée si bug réel (signature =
  valeur probante RH).
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Indéterminé — à trancher en premier (c'est
  la vérification la moins chère de toute cette liste).
- **EFFORT ESTIMÉ** : <30 min (vérification manuelle dans un vrai navigateur,
  idéalement sur un appareil tactile, geste de signature réel)
- **DÉPENDANCES** : Accès à un navigateur réel (pas seulement Chromium
  headless), idéalement tactile.
- **CORRECTIF PROBABLE** : Si faux positif confirmé → corriger le test
  Playwright (séquence d'événements pointer réaliste, ou `page.mouse` natif
  au lieu d'un `PointerEvent` synthétique unique). Si bug réel confirmé →
  corriger la détection de tracé dans `SignatureEmploye.tsx` (mise à jour de
  `vide.current` sur `pointermove`, pas seulement sur un événement isolé).
- **TEST DE NON-RÉGRESSION À AJOUTER** : Selon la conclusion de la
  vérification manuelle — test Playwright corrigé avec séquence d'événements
  réaliste, ou test unitaire sur la logique de détection de tracé.

## 4. CH-09 — Pas de carte réelle sur /chantiers/[id]/localisation

- **DESCRIPTION** : Aucun composant carte (Leaflet/Mapbox/iframe) — seulement
  un relevé texte lat/lng. Inchangé depuis le rapport d'origine.
- **ROOT CAUSE** : Fonctionnalité jamais implémentée — gap de fonctionnalité,
  pas une régression.
- **APP / MODULE** : Chantiers (localisation)
- **CATÉGORIE** : UI (feature manquante)
- **SÉVÉRITÉ** : Faible/Moyenne (UX, aucun risque sécurité/données)
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Dépend de la promesse commerciale (« carte »
  annoncée ou non) — à valider hors de ce document technique.
- **EFFORT ESTIMÉ** : >4 h (intégration lib de carte, éventuelle clé API,
  composant, tests)
- **DÉPENDANCES** : Choix fournisseur (Leaflet+OSM gratuit vs Mapbox payant),
  gestion clé API/quota le cas échéant.
- **CORRECTIF PROBABLE** : Intégrer Leaflet + tuiles OpenStreetMap (pas de
  clé API requise) pour afficher les lat/lng déjà stockés sur une carte
  interactive.
- **TEST DE NON-RÉGRESSION À AJOUTER** : Test e2e vérifiant la présence du
  composant carte rendu avec les coordonnées correctes.

## 5. CM-06 — Suppression de commande fournisseur non-brouillon non protégée

- **DESCRIPTION** : Une commande non-brouillon (envoyée, reçue partiellement)
  peut être supprimée sans contrainte DB, seule la Server Action filtre —
  contournable par appel direct. Même schéma que `PL-02` avant son fix.
- **ROOT CAUSE** : Absence de contrainte/trigger DB équivalent au garde-fou
  déjà posé pour `PL-02`.
- **APP / MODULE** : Commandes fournisseurs
- **CATÉGORIE** : DB (contrainte manquante) + API (seule barrière actuelle)
- **SÉVÉRITÉ** : Moyenne — décision produit déjà documentée de ne pas
  corriger (règle « correctif minimal et certain uniquement »), reconfirmée
  par la mission source.
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Faible en l'état (pas d'accès API externe
  exposé) — à réévaluer si un accès API/partenaire est commercialisé un jour.
- **EFFORT ESTIMÉ** : 30–90 min (techniquement rapide, malgré la décision
  actuelle de ne pas le faire)
- **DÉPENDANCES** : Aucune technique ; dépend uniquement d'une décision
  produit à revalider.
- **CORRECTIF PROBABLE** : Trigger `BEFORE DELETE` sur la table des commandes
  interdisant la suppression hors statut brouillon — réplique exacte du
  principe `trg_affectation_employe_actif` (PL-02).
- **TEST DE NON-RÉGRESSION À AJOUTER** : pgTAP dédié (suppression brouillon
  autorisée / non-brouillon refusée, contournement SQL direct bloqué).

## 6. FA-08 — Aucune facture ne bascule `en_retard` automatiquement

- **DESCRIPTION** : Aucune tâche planifiée ne fait basculer une facture au
  statut `en_retard` par le seul passage du temps.
- **ROOT CAUSE** : Aucune tâche planifiée (cron/scheduled function) n'existe
  pour réévaluer le statut des factures selon la date d'échéance.
- **APP / MODULE** : Factures
- **CATÉGORIE** : DB/API (tâche planifiée manquante)
- **SÉVÉRITÉ** : Moyenne — fonctionnalité métier attendue pour le suivi de
  trésorerie et les relances (`FA-09` existe déjà mais reste manuel).
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Oui, probable — bascule automatique
  attendue en gestion de facturation BTP.
- **EFFORT ESTIMÉ** : 2–4 h
- **DÉPENDANCES** : Disponibilité de `pg_cron` (ou équivalent) en production ;
  vérifier la cohérence avec le mécanisme de relance déjà existant (`FA-09`).
- **CORRECTIF PROBABLE** : Fonction `marquer_factures_en_retard()` planifiée
  quotidiennement (pg_cron), basculant `envoyee`/`payee_partiel` →
  `en_retard` quand `date_echeance` est dépassée et le solde > 0.
- **TEST DE NON-RÉGRESSION À AJOUTER** : pgTAP simulant une échéance dépassée
  et vérifiant la bascule automatique, plus non-régression sur les factures
  déjà soldées/payées qui ne doivent pas basculer.

## 7. PL-03 — Aucun historique de modification des affectations planning

- **DESCRIPTION** : Une modification d'affectation est une simple UPDATE
  sans trace (qui, quand, ancienne valeur). Inchangé depuis le rapport
  d'origine.
- **ROOT CAUSE** : Aucune table/trigger d'audit pour `affectations`.
- **APP / MODULE** : Planning
- **CATÉGORIE** : DB
- **SÉVÉRITÉ** : Faible/Moyenne — traçabilité/audit, pas un risque d'accès
  ou de perte de données.
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Possible si un client exige une
  traçabilité RH/planning (litiges horaires) — à valider.
- **EFFORT ESTIMÉ** : 2–4 h
- **DÉPENDANCES** : Vérifier s'il existe déjà un patron de table d'audit
  réutilisable ailleurs dans le produit (ex. pointages) avant d'en créer un
  nouveau.
- **CORRECTIF PROBABLE** : Trigger `AFTER UPDATE OR DELETE` sur
  `affectations` insérant une ligne dans une table d'historique dédiée
  (ancienne/nouvelle valeur, auteur, horodatage).
- **TEST DE NON-RÉGRESSION À AJOUTER** : pgTAP vérifiant qu'une
  modification/suppression d'affectation génère une ligne d'historique
  correcte (valeurs avant/après, auteur).

## 8. PL-05 — Planning complet visible par tout membre actif

- **DESCRIPTION** : Un ouvrier voit le planning de toute l'entreprise, pas
  seulement ses propres affectations. La RLS (`est_membre_actif` seul) et la
  requête de page ne filtrent pas par rôle.
- **ROOT CAUSE** : La policy RLS de lecture sur `affectations` (ou la requête
  de la page planning) n'applique aucun filtre par rôle/permission — seul le
  critère « membre actif de l'entreprise » est vérifié.
- **APP / MODULE** : Planning
- **CATÉGORIE** : DB (RLS) + UI (requête de page)
- **SÉVÉRITÉ** : Moyenne — fuite d'information interne entre collègues
  (qui travaille où, absences), pas de données financières exposées.
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Oui, probable — cohérent avec le
  cloisonnement RH déjà appliqué ailleurs (`PE-02`/`PE-03`), attente
  raisonnable de confidentialité du planning entre collègues.
- **EFFORT ESTIMÉ** : 30–90 min (si la permission de vue globale existe déjà,
  ex. `voir_heures_chantiers` de `PL-06`) — jusqu'à 2–4 h si la matrice de
  permissions doit être étendue.
- **DÉPENDANCES** : Vérifier la permission `voir_heures_chantiers` (`PL-06`)
  ou équivalente pour ne pas casser l'usage légitime de vue globale par
  chef de chantier/gérant.
- **CORRECTIF PROBABLE** : Filtre par rôle/permission dans la policy RLS de
  lecture (ou la requête de page) : sans permission de vue globale, restreindre
  aux lignes où l'employé correspond à l'utilisateur courant.
- **TEST DE NON-RÉGRESSION À AJOUTER** : pgTAP/e2e vérifiant qu'un ouvrier ne
  voit que ses propres affectations, et qu'un chef de chantier/gérant avec
  permission adéquate voit toujours le planning complet (non-régression sur
  `CH-07`/`PL-01`/`PL-04`/`PL-06`).

## 9. PE-07 — Révoquer un appareil n'invalide aucune session réelle

- **DESCRIPTION** : Révoquer l'appareil mobile d'un salarié parti ne marque
  qu'une ligne de facturation — n'invalide aucune session. Le contournement
  documenté reste : désactiver le compte entier.
- **ROOT CAUSE** : Absence de mécanisme d'invalidation de session/JWT liée à
  l'appareil — la « révocation » actuelle n'agit que sur un enregistrement de
  comptage d'appareils facturés, pas sur l'authentification.
- **APP / MODULE** : Personnel / Sécurité (gestion des appareils)
- **CATÉGORIE** : AUTH
- **SÉVÉRITÉ** : Élevée — un ex-salarié conserve un accès actif via un
  appareil « révoqué » jusqu'à expiration naturelle du token ou désactivation
  complète du compte.
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Oui — lacune de sécurité device management,
  sensible pour un client BTP avec fort turnover terrain.
- **EFFORT ESTIMÉ** : >4 h (nécessite un modèle de session par appareil et
  une invalidation ciblée — travail d'architecture auth)
- **DÉPENDANCES** : Modèle de session Supabase Auth (GoTrue) — capacité à
  invalider un refresh token/session spécifique sans déconnecter tous les
  appareils du même utilisateur.
- **CORRECTIF PROBABLE** : Associer chaque session/refresh token à un
  `appareil_id` en base ; à la révocation, invalider ce refresh token précis
  via l'API admin GoTrue (ou vérifier `appareil_id` actif à chaque requête
  via middleware, sur le même principe que les contrôles de session live déjà
  en place pour le statut employé/entreprise, §5 du rapport source).
- **TEST DE NON-RÉGRESSION À AJOUTER** : Scénario de session live (même
  patron que ceux déjà écrits) : appareil révoqué en session active →
  requête suivante bloquée immédiatement, sans reconnexion nécessaire pour
  observer le blocage.

## 10. PT-08 — Pas de création de pointage par un administrateur

- **DESCRIPTION** : Aucune fonctionnalité ne permet à un administrateur de
  créer un pointage au nom d'un salarié (oubli répété, salarié sans
  smartphone ce jour-là).
- **ROOT CAUSE** : Fonctionnalité jamais implémentée — seule la déclaration a
  posteriori par le salarié lui-même existe (`PT-04`).
- **APP / MODULE** : Pointage
- **CATÉGORIE** : UI + API (nouvelle Server Action)
- **SÉVÉRITÉ** : Faible/Moyenne — gap fonctionnel, largement contournable
  via `PT-04` dans la plupart des cas.
- **BLOCKER PILOTE ?** Non
- **BLOCKER COMMERCIALISATION ?** Possible — fonctionnalité RH courante
  attendue par les gérants/administratifs BTP, mais contournable.
- **EFFORT ESTIMÉ** : 2–4 h
- **DÉPENDANCES** : Réutiliser le moteur de calcul d'heures existant (`PT-03`)
  et le workflow de validation (`PT-05`/`PT-06`) pour rester cohérent.
- **CORRECTIF PROBABLE** : Nouvelle Server Action `creerPointageAdminAction`,
  réservée aux rôles avec permission RH/admin, créant un pointage au nom du
  salarié avec motif obligatoire et statut `a_verifier` par défaut (cohérent
  avec `PT-04`/`PT-05`).
- **TEST DE NON-RÉGRESSION À AJOUTER** : pgTAP/vitest vérifiant la création
  par un admin, le motif obligatoire, le statut initial, et le refus pour un
  rôle non autorisé.

---

## Ordre de traitement technique

Ordre basé uniquement sur dépendances, risque et rapport effort/certitude du
root cause — aucune notation commerciale.

1. **PE-06** — vérification manuelle <30 min, lève l'ambiguïté avant tout
   effort de correction (peut-être un faux positif de test).
2. **CH-08** — root cause connu avec certitude, patron de correctif déjà
   éprouvé (`PL-02`), gain de sécurité immédiat pour un coût faible.
3. **CM-06** — même patron exact que CH-08/PL-02, cohérence à appliquer au
   même moment si la décision produit est révisée.
4. **PL-05** — root cause connu, effort faible à modéré, sécurité/confidentialité.
5. **NF-01** — root cause **inconnu** : à investiguer avant les correctifs à
   effort connu ci-dessous, car bloque une fonctionnalité coeur pour un rôle
   entier.
6. **FA-08** — gap fonctionnel bien délimité, effort connu, aucune dépendance
   bloquante autre que la dispo de `pg_cron`.
7. **PL-03** — audit/traçabilité, effort connu, risque faible.
8. **PT-08** — nouvelle fonctionnalité admin, effort connu, réutilise
   l'existant (PT-03/05/06).
9. **PE-07** — travail d'architecture auth/session, effort le plus élevé
   avec risque de régression sur l'authentification globale — à traiter
   après les correctifs plus contenus.
10. **CH-09** — feature build pure (carte), aucune implication sécurité,
    priorité technique la plus basse malgré l'effort réel.

---

## QUICK WINS (<30 min – 90 min)

- **PE-06** — vérification manuelle de la signature en navigateur réel (<30 min)
- **CH-08** — check d'affectation `equipes_chantiers` en tête de page (30–90 min)
- **CM-06** — trigger `BEFORE DELETE`, réplique de `PL-02` (30–90 min)
- **PL-05** — filtre par rôle/permission sur la lecture du planning (30–90 min)

## MEDIUM FIXES (2–4 h)

- **NF-01** — investigation + correction de la perte de contexte session sur
  la Server Action note de frais
- **FA-08** — fonction planifiée de bascule `en_retard`
- **PL-03** — table + trigger d'historique des affectations
- **PT-08** — nouvelle Server Action de création de pointage par un admin

## STRUCTURAL FIXES (>4 h)

- **PE-07** — modèle de session par appareil + invalidation ciblée
  (architecture auth)
- **CH-09** — intégration d'un composant carte réel (feature build complète)
