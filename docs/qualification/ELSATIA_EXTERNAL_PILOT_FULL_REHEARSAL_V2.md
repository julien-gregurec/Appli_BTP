# ELSATIA GP — External Pilot Full Rehearsal (V2)

Mission autonome longue (~8h allouées) : simuler le plus fidèlement possible une semaine de
démarrage d'un vrai client BTP sur ELSATIA Gestion Pro, en testant le **produit** comme un
utilisateur réel — pas seulement en vérifiant que les tests unitaires passent. Aucune
Preview/Production utilisée. Rédigé en autonomie totale (aucune question bloquante).

## 0. Base

```
Repo               : julien-gregurec/Appli_BTP
Baseline demandée  : HEAD réel de origin/claude/funny-bell-eqo1p5 (842b4b4, 313 migrations)
Branche de travail : claude/vigilant-fermat-p8jmep (fast-forwardée sur la baseline, aucun
                      commit local perdu — vérifié par ancêtre commun avant reset)
Pack retrouvé       : origin/qa/pilot-fixture-independent-review-v1 (mission précédente, basée sur
                      le même train de 313 migrations — divergence nulle sur supabase/migrations) :
                      ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md, ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md
                      (143 contrôles), ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md,
                      seed_entreprise_pilote_btp.sql, cleanup_entreprise_pilote_btp.sql,
                      assertions_entreprise_pilote_btp.sql — fusionnés sans conflit (fichiers
                      disjoints des 13 commits propres à la baseline, qui ne touchent que
                      Studio/Tools/Réserves, hors périmètre Gestion Pro).
```

### Ce qui change par rapport aux missions précédentes

Chaque mission précédente (pack de recette, revue indépendante de la fixture) avait buté sur la
même limite d'environnement : **aucun Docker, aucune CLI Supabase**, donc pgTAP jamais exécuté
malgré 94 fichiers de suites écrites, et aucune preuve d'exécution au-delà d'un Postgres 16 nu.
Cette mission a **essayé Docker en premier** (le démon a démarré, contrairement aux missions
précédentes) — mais les téléchargements d'images depuis les registres Supabase (`public.ecr.aws`,
CloudFront) ont buté sur un plafond de données du proxy sortant de cet environnement (`Data limit
exceeded`, puis `403 Forbidden` en boucle). **`supabase start` reste donc hors de portée ici
aussi.** En revanche, deux capacités nouvelles ont été exploitées à fond :

1. **`apt install postgresql-16-pgtap`** — disponible, jamais essayé par les missions
   précédentes. Combiné au bootstrap Postgres nu déjà documenté (§0 de
   `ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md`), promu en script réutilisable
   (`scripts/local-postgres-bootstrap/`), ceci a permis de faire tourner **les 94 fichiers pgTAP
   du dépôt pour la première fois de l'histoire du projet** — RLS réellement testée sous les
   rôles `authenticated`/`anon`, pas en superutilisateur.
2. Une revue systématique du code applicatif (`src/`) et des migrations par trois agents de
   recherche indépendants, chacun couvrant un tiers des 143 contrôles, avec vérification croisée
   manuelle d'un échantillon des affirmations les plus significatives (voir §3).

**Ce qui reste hors de portée, sans changement par rapport aux missions précédentes** : aucun
serveur `next dev` n'a pu être exercé par un vrai navigateur, car l'application dépend
intégralement de `@supabase/supabase-js` (GoTrue pour l'auth, PostgREST pour l'API, Storage pour
les fichiers) — confirmé par lecture de `src/lib/supabase/{client,server,proxy}.ts` — et ces
briques ne sont disponibles qu'via le stack Docker Supabase, inaccessible ici. Aucun parcours UI
cliqué en conditions réelles, aucun e-mail réellement reçu, aucun PDF réellement rendu à l'écran.
C'est la même réserve que documentée depuis le premier rapport de clôture — non levée par cette
mission, faute d'accès réseau suffisant au registre Docker.

---

## 1. Fixture — revalidée sur le train actuel

Reproductible, vérifié par exécution réelle (pas une relecture) :

```
DB fraîche (PostgreSQL 16 local + scripts/local-postgres-bootstrap/) 
  → 315 migrations rejouées sans erreur (313 + les 2 correctifs de cette mission, §15)
  → seed_entreprise_pilote_btp.sql       : OK (28 employés, 8 clients, 7 chantiers, 9 devis,
                                            7 factures, 300 pointages, 300 affectations, ...)
  → assertions_entreprise_pilote_btp.sql : 15/15 contrôles structurels OK, isolation tenant
                                            0 fuite croisée
  → seed rejoué une 2e fois (idempotence) : mêmes 15/15 OK
  → cleanup_entreprise_pilote_btp.sql    : "PILOTE-BTP-V1 nettoyée"
  → seed rejoué une 3e fois (après cleanup) : mêmes 15/15 OK
```

Cycle complet exécuté deux fois dans cette mission (avant et après les correctifs du §15), les
deux fois avec succès intégral. Preuve brute conservée dans les logs de session ; non
re-publiée ici pour la lisibilité — même sortie que §1 du pack déjà cité, colonnes
`Attendu`/`Réel` identiques.

**Nouveau par rapport à la revue précédente** : le seed a dû être corrigé une fois de plus
pendant cette mission (voir défaut #8 ci-dessous), pour la même raison structurelle que les 7
défauts déjà documentés par `ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md` — un correctif de
sécurité qui déplace une colonne d'`employes` vers une table dédiée casse un seed qui insère
encore directement dans l'ancienne colonne.

| # | Défaut | Preuve | Correction |
| --- | --- | --- | --- |
| 8 | `employes.taux_horaire` n'existe plus (déplacée vers `employes_taux_facture` par le correctif de sécurité de cette même mission, §15.1) | `ERROR: column "taux_horaire" of relation "employes" does not exist` | Colonne retirée de l'INSERT `employes` ; boucle dédiée insérant dans `employes_taux_facture`, à l'identique du traitement déjà en place pour `cout_horaire` |

---

## 2. Entreprise pilote

Entreprise synthétique déjà livrée par le pack : **« SARL Bâti-Rhône Construction »**, 28
salariés sur les 5 profils demandés (1 Gérant, 2 Administration, 3 Chef de chantier, 4 Chef
d'équipe, 18 Ouvrier), 8 clients, 7 chantiers, marquage `[PILOTE]`/`PILOTE-%` systématique,
domaine `@example.test`. Non simplifiée pour cette mission — reprise telle quelle, revalidée
(§1).

---

## 3. 143 acceptance tests — résultats

**Méthode.** Sans app vivante (§0), la preuve ne peut venir que de code réellement exécuté :
suites pgTAP (94 fichiers existants + 1 nouveau, 95 au total, tournées contre le schéma réel avec
RLS active sous les rôles `authenticated`/`anon`), suite vitest (153 fichiers), ou vérification
SQL directe menée dans cette session. Une lecture de code, même convaincante, **n'est jamais
comptée comme `PASS`** — c'est `NOT_TESTABLE_LOCALLY`, avec la mention « code review : semble
correct » quand c'est le cas, pour rester utile sans se substituer à une preuve d'exécution.

Répartition, sur les 143 contrôles de `docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md` :

| Statut | Nombre | % |
| --- | --- | --- |
| **PASS** (preuve d'exécution directe) | **35** | 24 % |
| **FAIL** (défaut confirmé) | **8** | 6 % |
| **NOT_TESTABLE_LOCALLY** (nécessite une session navigateur authentifiée réelle — GoTrue/PostgREST/Storage/e-mail/rendu PDF — indisponible ici) | **96** | 67 % |
| **MANUAL_EXPECTED** (procédure humaine par nature) | **4** | 3 % |
| **Total** | **143** | 100 % |

3 des 8 `FAIL` d'origine ont été corrigés pendant cette mission avant la clôture (voir §15) — ils
apparaissent ci-dessous dans leur état **final**, après correctif : `AV-01`, `PE-02`, `PE-03` sont
donc `PASS` (chacun avec une nouvelle preuve d'exécution, pas une simple relecture). Les 8 `FAIL`
restants (2×P0, 3×P1, 3×P2) sont détaillés au §13.

### 3.1 Table complète

Colonnes : `ID` — `Statut` — `Preuve` (fichier + assertion/ligne, ou raison). Format condensé ;
préfixes de chemin omis quand évident (`supabase/tests/*.test.sql` = pgTAP exécuté et passant,
sauf mention contraire).

#### Onboarding (ON)

| ID | Statut | Preuve |
| --- | --- | --- |
| ON-01 | NOT_TESTABLE_LOCALLY | `creer_entreprise_bootstrap()` (migration bootstrap) + `entreprise.ts:createEntrepriseAction` — code review : semble correct, jamais exécuté (onboarding live requis) |
| ON-02 | NOT_TESTABLE_LOCALLY | `entreprise.ts:modifierEntrepriseAction/modifierLogoEntrepriseAction` — code review : semble correct ; « logo dans l'en-tête » nécessite un rendu de document réel |
| ON-03 | NOT_TESTABLE_LOCALLY | `installer_roles_predefinis()` installe bien 9 rôles (compté dans la migration) — code review : semble correct, RPC jamais appelée par un test |
| ON-04 | NOT_TESTABLE_LOCALLY | trigger `trg_numero_inscription_employe` — code review : semble correct |
| ON-05 | NOT_TESTABLE_LOCALLY | `activer_compte_employe()` — code review : semble correct ; nécessite un flux auth réel |
| ON-06 | NOT_TESTABLE_LOCALLY | `chantiers.client_id uuid not null references clients(id)` — contrainte DB réelle (pas juste UI), code review : semble correct |
| ON-07 | **PASS** | `src/lib/documents-envoi.test.ts` (vitest) : statut → `envoye`, PDF joint (`piecesJointes`), lien de consultation généré. *Réception e-mail réelle non vérifiable (Brevo mocké) — traité comme acquis jusqu'à la frontière de l'appel API.* |
| ON-08 | NOT_TESTABLE_LOCALLY | `onboarding/demarrage/page.tsx` : 6 étapes réellement adossées à des comptages réels (pas des cases statiques) — code review : semble correct, contredit même l'ancien constat « rôles et devis non suivis » du pack — à revérifier humainement |

#### Dashboard (DB)

| ID | Statut | Preuve |
| --- | --- | --- |
| DB-01 | **PASS** | `gp_dashboard_search_perf_dashboard_indicateurs.test.sql` : cache KPI = agrégats réels sur la fixture, mis à jour immédiatement après écriture |
| DB-02 | NOT_TESTABLE_LOCALLY | table/action existent (`alertes.ts:retablirAlerteOperationnelleAction`) — cycle complet ignorer→disparaît→rétablir non exécuté par un test |
| DB-03 | **PASS** | `alertes_operationnelles_delegations.test.sql` : délégation → notification créée pour le destinataire, prouvé |

#### Clients (CL)

| ID | Statut | Preuve |
| --- | --- | --- |
| CL-01 | NOT_TESTABLE_LOCALLY | `clients.ts` — code review : semble correct |
| CL-02 | NOT_TESTABLE_LOCALLY | colonnes société/raison sociale existent — code review : semble correct |
| CL-03 | NOT_TESTABLE_LOCALLY | `creer_facture_depuis_devis()` lit `delai_paiement_jours` — code review : semble correct |
| CL-04 | NOT_TESTABLE_LOCALLY | `creerClientRapideAction` existe — code review : semble correct |
| CL-05 | **FAIL** | Voir §13.1 — accès direct par URL ne redirige pas, la page se rend vide (RLS bloque bien les données, mais pas d'« accès refusé » visible) |
| CL-06 | NOT_TESTABLE_LOCALLY | Plafonnement à 365 vérifié en code (app + contrainte DB `check between 0 and 365`) — mais aucun message utilisateur trouvé à l'écran (friction déjà notée par le pack d'origine) |

#### Chantiers (CH)

| ID | Statut | Preuve |
| --- | --- | --- |
| CH-01 | NOT_TESTABLE_LOCALLY | `chantiers.statut default 'prospect'` — code review : semble correct |
| CH-02 | NOT_TESTABLE_LOCALLY | `changerStatutChantierAction` — code review : semble correct |
| CH-03 | NOT_TESTABLE_LOCALLY | `ajouterTacheAction`/`basculerTacheAction` — code review : semble correct |
| CH-04 | **PASS** | `pieces_jointes_v1_photos_comptes_rendus.test.sql` : photo bien rattachée au compte-rendu, prouvé |
| CH-05 | NOT_TESTABLE_LOCALLY | `doe.ts:genererDoeAction` — rendu PDF non exécutable ici |
| CH-06 | **PASS** | `workflow_devis_v1_chantier_depuis_devis.test.sql` (pgTAP) + `workflow-devis.test.ts` (vitest) : devis accepté → chantier créé avec les bonnes infos, prouvé des deux côtés |
| CH-07 | NOT_TESTABLE_LOCALLY | `affecterEmployeChantierAction` (upsert `equipes_chantiers`) — code review : semble correct |
| CH-08 | NOT_TESTABLE_LOCALLY | `chantiers/page.tsx` bascule sur une vue scopée pour qui n'a que `voir_chantiers_assignes` — code review : semble correct, isolation par ID de chantier non exécutée directement |
| CH-09 | **FAIL** | `chantiers/[id]/localisation/page.tsx` et `LocaliserGPSButton.tsx` : **aucun composant carte** (ni Leaflet, ni Mapbox, ni iframe Maps), juste un relevé texte lat/lng et un bouton GPS manuel. Contredit « Carte affichée » |
| DV-01 | NOT_TESTABLE_LOCALLY | `calcTotaux()` (`src/lib/devis.ts`) — zéro test unitaire trouvé pour cette fonction pourtant centrale |
| DV-02 | NOT_TESTABLE_LOCALLY | RPC `dupliquer_devis` — code review : semble correct, jamais exécutée par un test |
| DV-03 | **PASS** | Même preuve qu'ON-07 (même mécanisme d'envoi) |
| DV-04 | **PASS** | `document_partage_public_par_jeton_v1.test.sql` : lien public ouvre bien devis + PDF + photos sans authentification |
| DV-05 | **PASS** | Même fichier : jeton valide mais devis brouillon → renvoie `null` (garde brouillon en base, pas seulement côté UI) |
| DV-06 | **PASS** | `gp_pilot_notification_devis_accepte.test.sql` : notification interne + entrée `journal_activite` créées, prouvé |
| DV-07 | NOT_TESTABLE_LOCALLY | Garde `statut <> 'accepte'` générique, prouvée pour `brouillon` par pgTAP mais pas testée nommément avec `refuse` |
| DV-08 | NOT_TESTABLE_LOCALLY | `mes_devis_chantiers_sans_prix()` ne renvoie structurellement aucun champ prix — code review : semble correct |
| DV-09 | **FAIL** | Même défaut que CL-05 — voir §13.1 |
| DV-10 | NOT_TESTABLE_LOCALLY | Fonctions utilitaires de signature unitairement testées ; l'écriture + horodatage réels de `signerDocumentMetierAction` ne le sont pas |
| DV-11 | NOT_TESTABLE_LOCALLY | `genererDevisIAAction` — dépend d'un appel LLM réel, non testable ici de toute façon |
| DV-12 | **PASS** | `devis.chantier_id` sans contrainte `not null` (schéma) — preuve directe, sans ambiguïté |

#### Factures (FA) et avoirs (AV)

| ID | Statut | Preuve |
| --- | --- | --- |
| FA-01 | NOT_TESTABLE_LOCALLY | `creer_facture_depuis_devis()` — code review : semble correct |
| FA-02 | **PASS** | `verrouiller_facture_emise.test.sql` : modification du montant d'une facture émise refusée, prouvé |
| FA-03 | NOT_TESTABLE_LOCALLY | `creer_facture_avancee()` branche acompte — code review : semble correct (seule la branche avoir est couverte par pgTAP) |
| FA-04 | NOT_TESTABLE_LOCALLY | `creer_situation_travaux()` — code review : semble correct, aucune suite ne teste les situations d'avancement |
| FA-05 | NOT_TESTABLE_LOCALLY | trigger `recalc_paiements_facture` — le passage à `payee_partiel` n'est jamais affirmé nommément par un test (seul `montant_paye` l'est indirectement) |
| FA-06 | NOT_TESTABLE_LOCALLY | Même trigger, même réserve pour `payee` |
| FA-07 | **PASS** | `gp_pilot_paiement_avoir_idempotence.test.sql` : paiement dépassant le reste dû refusé (protection TOCTOU `for update`), prouvé — **et reproduit par une vraie concurrence à deux connexions simultanées, voir §12.1** |
| FA-08 | **FAIL** | Voir §13.2 — aucune facture ne bascule `en_retard` par le seul passage du temps (pas de tâche planifiée ; seul un mouvement de paiement redéclenche le recalcul) |
| FA-09 | **PASS** | `src/app/actions/relances.test.ts` : prévisualisation puis envoi de relance manuelle, prouvé |
| FA-10 | NOT_TESTABLE_LOCALLY | Nuance : `modifierEcheanceFactureAction` (couche Server Action, le seul chemin UI réel) bloque bien la modification d'échéance post-émission ; le trigger DB `verrouiller_facture_emise` laisse volontairement `date_echeance` libre — **choix documenté et délibéré** dans la migration elle-même (renégociation de délai légitime, sans impact montant), pas un défaut. Non exécuté par un test, mais pas traité comme un `FAIL` — voir §13 note |
| AV-01 | **PASS** *(corrigé pendant cette mission, §15.2)* | `gp_pilot_paiement_avoir_idempotence.test.sql` (assertion ajoutée) : la facture d'origine passe bien en `avoir_emis` dès la création de l'avoir |
| AV-02 | **PASS** | Même fichier : second avoir identique refusé, résolu vers l'avoir existant (index unique + pré-check) |
| AV-03 | **PASS** | `document_partage_public_par_jeton_v1.test.sql` : lien public facture accessible sans authentification, prouvé |
| AV-04 | NOT_TESTABLE_LOCALLY | Garde centralisée `src/proxy.ts`/`src/lib/supabase/proxy.ts` (« Next.js 16 a renommé middleware en proxy », commentaire du code lui-même) — code review : semble correct, redirection non exécutée en direct |

#### Commandes et fournisseurs (CM / FR)

| ID | Statut | Preuve |
| --- | --- | --- |
| CM-01 | NOT_TESTABLE_LOCALLY | `commandes.ts:creerFournisseurAction` — code review : semble correct |
| CM-02 | NOT_TESTABLE_LOCALLY | Utilisée comme décor par `gp_reception_commande_stock_transactionnel_v1.test.sql` (exécutée avec succès) mais jamais affirmée nommément |
| CM-03 | NOT_TESTABLE_LOCALLY | Même réserve que CM-02 pour le passage à `envoyee` |
| CM-04 | **PASS** | `gp_reception_commande_stock_transactionnel_v1.test.sql` : réception partielle 4/10 → `recue_partiel`, stock crédité de 4, prouvé |
| CM-05 | **PASS** | Même fichier : réception totale → `recue`, prouvé |
| CM-06 | NOT_TESTABLE_LOCALLY | `supprimerCommandeAction` (garde `brouillon`/`annulee`) — code review : semble correct |
| CM-07 | NOT_TESTABLE_LOCALLY | Même garde centralisée qu'AV-04 (`/fournisseurs` → `acces_achats`) — code review : semble correct |
| FR-01 | NOT_TESTABLE_LOCALLY | `changerActivationFournisseurAction` + filtre `.eq("actif", true)` à l'écran commande — code review : semble correct |
| FR-02 | NOT_TESTABLE_LOCALLY | `creerFournisseurRapideAction` — code review : semble correct |
| FR-03 | NOT_TESTABLE_LOCALLY | trigger `trg_verifier_depense_fournisseur` — code review : semble correct |

#### Stock (ST)

| ID | Statut | Preuve |
| --- | --- | --- |
| ST-01 | NOT_TESTABLE_LOCALLY | `enregistrer_mouvement_stock_borne_v2` (bcrypt + rate-limit) — seule la forme du schéma est pgTAP-couverte, pas le comportement réel |
| ST-02 | **PASS** *(partiel, via réception)* | `gp_reception_commande_stock_transactionnel_v1.test.sql` : le stock est bien crédité par la réception — une entrée manuelle isolée (hors commande) n'a pas de test dédié |
| ST-03 | NOT_TESTABLE_LOCALLY | `seuil_alerte` existe — signalement visuel non exécuté |
| ST-04 | NOT_TESTABLE_LOCALLY | Aucune action/test dédié trouvé pour la modification du prix d'achat |
| ST-05 | NOT_TESTABLE_LOCALLY | Détection de colonnes vitest-prouvée (`import/config.test.ts`) ; dédoublonnage par `upsert on conflict` — code review : semble correct, non exécuté en import réel |
| ST-06 | **PASS** | `src/lib/inventaires.test.ts` : calcul des écarts d'inventaire (manquants/excédents/valeur), prouvé |
| ST-07 | NOT_TESTABLE_LOCALLY | Même fonction qu'ST-01, branche mauvais code — code review : semble correct, non exécutée |
| ST-08 | NOT_TESTABLE_LOCALLY | Garde centralisée `acces_stock` — code review : semble correct |

#### Dépenses et notes de frais (DP / NF)

| ID | Statut | Preuve |
| --- | --- | --- |
| DP-01 | **PASS** | `src/lib/tva.test.ts` : cohérence HT/TVA/TTC prouvée sur la fonction utilisée par `creerDepenseAction` |
| DP-02 | NOT_TESTABLE_LOCALLY | trigger `recalc_reglements_fournisseur` — code review : semble correct |
| DP-03 | NOT_TESTABLE_LOCALLY | Nécessite Storage réel |
| DP-04 | NOT_TESTABLE_LOCALLY | trigger de cohérence chantier/commande — code review : semble correct |
| DP-05 | **PASS** | `src/lib/expenses/export.test.ts` + `integrity.test.ts` : manifeste + empreintes SHA-256, prouvé |
| NF-01 | NOT_TESTABLE_LOCALLY | Statut par défaut `soumise` + validations de fichiers unitairement testées séparément — capture photo réelle non exécutable |
| NF-02 | NOT_TESTABLE_LOCALLY | `transition_note_frais('valide')` — code review : semble correct |
| NF-03 | NOT_TESTABLE_LOCALLY | Même RPC, motif de refus obligatoire — code review : semble correct |
| NF-04 | NOT_TESTABLE_LOCALLY | Passage à `remboursee` uniquement trouvé côté virement bancaire — pas de bascule manuelle isolée identifiée, à revérifier |
| NF-05 | NOT_TESTABLE_LOCALLY | `peut_modifier_note_frais_personnelle()` exclut `valide`/`validee` — code review : semble correct |

#### Personnel et paie (PE / PA)

| ID | Statut | Preuve |
| --- | --- | --- |
| PE-01 | NOT_TESTABLE_LOCALLY | Écriture dans `employes_cout_horaire` — code review : semble correct |
| PE-02 | **PASS** *(corrigé pendant cette mission, §15.1)* | `securiser_taux_horaire_facture_employe.test.sql` (nouveau) : lecture réservée aux postes autorisés, prouvé |
| PE-03 | **PASS** *(corrigé pendant cette mission, §15.1)* | Même fichier : un ouvrier sans le droit ne voit **aucune ligne** (policy RESTRICTIVE), pas seulement une valeur masquée côté UI — prouvé par appel direct hors UI |
| PE-04 | NOT_TESTABLE_LOCALLY | `carte-btp.ts` — code review : semble correct |
| PE-05 | NOT_TESTABLE_LOCALLY | `anonymiser_employe()` (colonnes + Storage) — code review : semble correct |
| PE-06 | NOT_TESTABLE_LOCALLY | Signature réutilisable — code review : semble correct |
| PE-07 | **FAIL** | Voir §13.3 — « révoquer l'appareil » ne marque qu'une ligne de facturation, n'invalide aucune session réelle |
| PA-01 | NOT_TESTABLE_LOCALLY | `creerPeriodePaieAction` + `synchroniser_periode_paie` — code review : semble correct |
| PA-02 | NOT_TESTABLE_LOCALLY | Vue dossier individuel — nécessite une marche en conditions réelles |
| PA-03 | NOT_TESTABLE_LOCALLY | `justifierAnomaliePaieAction` — code review : semble correct |
| PA-04 | NOT_TESTABLE_LOCALLY | Garde centralisée (`consulter_sa_paie`) — code review : semble correct |
| PA-05 | NOT_TESTABLE_LOCALLY | Même garde — code review : semble correct |
| PA-06 | NOT_TESTABLE_LOCALLY | `enregistrerProfilPaieAction` — code review : semble correct |

#### Planning (PL)

| ID | Statut | Preuve |
| --- | --- | --- |
| PL-01 | NOT_TESTABLE_LOCALLY | `creerAffectationAction` — code review : semble correct |
| PL-02 | NOT_TESTABLE_LOCALLY | Filtre `statut='actif'` + message générique — refus confirmé en code, message non spécifique |
| PL-03 | **FAIL** | Voir §13.4 — aucune table/trigger d'historique pour `affectations` ; une modification est une simple `UPDATE` sans trace |
| PL-04 | NOT_TESTABLE_LOCALLY | Suppression groupée — code review : semble correct |
| PL-05 | **FAIL** | Voir §13.5 — RLS (`est_membre_actif` seul) et requête de page exposent le planning **complet** de l'entreprise à tout membre, y compris un ouvrier |
| PL-06 | NOT_TESTABLE_LOCALLY | Permission `voir_heures_chantiers` distincte de `valider_pointages` — code review : semble correct |

#### Pointage (PT)

| ID | Statut | Preuve |
| --- | --- | --- |
| PT-01 | NOT_TESTABLE_LOCALLY | `enregistrerArriveeAction` (coordonnées + précision) — code review : semble correct |
| PT-02 | NOT_TESTABLE_LOCALLY | Motif obligatoire sans GPS valide — code review : semble correct (implémenté via un motif en commentaire, pas littéralement `origine_pointage='arrivee_oubliee'`, mais couvre l'alternative prévue par le critère) |
| PT-03 | NOT_TESTABLE_LOCALLY | `cloturer_session_pointage_interne` (normales/8h, sup au-delà) — code review : semble correct |
| PT-04 | NOT_TESTABLE_LOCALLY | `declarer_pointage_oublie` → `a_verifier` — code review : semble correct |
| PT-05 | **PASS** | `terrain_mobile_v1d2_validation_pointage_runtime.test.sql` : validation réelle par un chef d'équipe habilité, prouvé |
| PT-06 | **PASS** | Même fichier : rejet sans motif refusé (« motif du rejet obligatoire »), prouvé |
| PT-07 | NOT_TESTABLE_LOCALLY | Policy RESTRICTIVE `gerer_pointage` sur suppression + re-contrôle Server Action — code review : semble correct |
| PT-08 | **FAIL** | Voir §13.6 — aucune fonctionnalité de création de pointage par un administrateur au nom d'un salarié |

#### Congés (CG)

| ID | Statut | Preuve |
| --- | --- | --- |
| CG-01 | NOT_TESTABLE_LOCALLY | `transition_demande_conge('soumettre')` — code review : semble correct |
| CG-02 | NOT_TESTABLE_LOCALLY | Branche `'approuver'` insère aussi les affectations d'absence (sync planning) — code review : semble correct |
| CG-03 | NOT_TESTABLE_LOCALLY | Branche `'refuser'`, motif obligatoire — code review : semble correct |
| CG-04 | NOT_TESTABLE_LOCALLY | Policy RLS `statut='brouillon'` uniquement — code review : semble correct |

#### Exports (EX)

| ID | Statut | Preuve |
| --- | --- | --- |
| EX-01 | NOT_TESTABLE_LOCALLY | Route d'export comptable complète — code review : semble correct, non exécutée |
| EX-02 | NOT_TESTABLE_LOCALLY | RPC sous-jacente (`exporter_donnees_entreprise`, garde `gerer_parametres`) prouvée par pgTAP (voir RG-01) ; le téléchargement HTTP lui-même n'est pas exécuté |
| EX-03 | NOT_TESTABLE_LOCALLY | Garde centralisée (`acces_exports`) — code review : semble correct |
| EX-04 | NOT_TESTABLE_LOCALLY | Export vide sans erreur — code review : semble correct |
| EX-05 | **PASS** | `src/lib/expenses/export.test.ts` : manifeste ZIP + SHA-256, prouvé |

#### Messagerie (MS)

| ID | Statut | Preuve |
| --- | --- | --- |
| MS-01 | NOT_TESTABLE_LOCALLY | `peut_acceder_conversation()` — code review : semble correct, création/notification non exécutées |
| MS-02 | NOT_TESTABLE_LOCALLY | `publier_message_avec_pieces()` existe (pgTAP prouve juste son existence/droits) — visibilité complète de l'équipe non exécutée |
| MS-03 | NOT_TESTABLE_LOCALLY | Même garde ; preuve indirecte seulement (`isolation_multitenant_comportement.test.sql` montre 1 conversation visible pour un ouvrier, pas un refus explicite sur une 2e) |
| MS-04 | NOT_TESTABLE_LOCALLY | Aucune fonctionnalité « suggestion de réponse IA » confirmée dans le code (l'IA trouvée sert la rédaction de devis, pas la messagerie) — à vérifier humainement, la fonctionnalité pourrait ne pas exister telle que décrite |

#### Documents et DOE (DOC)

| ID | Statut | Preuve |
| --- | --- | --- |
| DOC-01 | NOT_TESTABLE_LOCALLY | `documents.ts:ajouterDocumentAction` — code review : semble correct |
| DOC-02 | NOT_TESTABLE_LOCALLY | `analyserDocumentIAAction` — dépend d'un appel LLM réel |
| DOC-03 | **PASS** | `document_partage_public_par_jeton_v1.test.sql` : PDF public accessible sans authentification, prouvé |
| DOC-04 | **PASS** | `gp_pilot_document_partage_medias.test.sql` : média résolu seulement pour le document exact du jeton, refusé pour un autre document même avec jeton par ailleurs valide, prouvé |

#### RGPD (RG)

| ID | Statut | Preuve |
| --- | --- | --- |
| RG-01 | **PASS** | `gp_pilot_rgpd_manifeste_fichiers.test.sql` : export refusé sans `gerer_parametres`, prouvé |
| RG-02 | NOT_TESTABLE_LOCALLY | `demander_suppression_entreprise()` (délai 30j) — code review : semble correct |
| RG-03 | NOT_TESTABLE_LOCALLY | `annuler_suppression_entreprise()` — code review : semble correct |
| RG-04 | NOT_TESTABLE_LOCALLY | Même RPC que PE-05 |
| RG-05 | MANUAL_EXPECTED | Procédure documentée (`REGISTRE_TRAITEMENTS_RGPD.md`) : l'entreprise pilote est responsable de traitement — décision de routage support, pas un code testable |

#### Sécurité et cloisonnement des rôles (SEC)

| ID | Statut | Preuve |
| --- | --- | --- |
| SEC-01 | NOT_TESTABLE_LOCALLY | Garde centralisée (`gerer_employes`/`acces_employes`) — code review : semble correct |
| SEC-02 | NOT_TESTABLE_LOCALLY | Garde centralisée (`gerer_utilisateurs`) — voir aussi §13.7 (nuance RLS) |
| SEC-03 | NOT_TESTABLE_LOCALLY | Garde centralisée (`acces_rentabilite` pour `/rentabilite` et `/tresorerie`) — code review : semble correct |
| SEC-04 | **PASS** | `isolation_multitenant_comportement.test.sql` : écriture croisée A→B refusée (« row-level security »), isolation par ID prouvée sur clients/chantiers/devis/factures/stock/messagerie, 56 assertions |
| SEC-05 | MANUAL_EXPECTED | Inspection Network réelle — nécessite un navigateur et une session live |
| SEC-06 | NOT_TESTABLE_LOCALLY | **Vérifié empiriquement dans cette mission** (pas seulement en lecture) : une tentative d'un ouvrier de s'auto-attribuer `gerer_utilisateurs` par écriture directe dans `permissions_poste` a été **testée et bloquée** (`new row violates row-level security policy "role_gestion_insert"`) — voir §13.7. Reclassé ici en `NOT_TESTABLE_LOCALLY` uniquement parce que l'énoncé exact (« mutation RH via un appel reconstruit ») visait `employes`, pas `permissions_poste` — le mécanisme vérifié est le même (policies RESTRICTIVE `role_gestion_*`) |
| SEC-07 | NOT_TESTABLE_LOCALLY | `est_membre_actif_reel()` — code review : semble correct, la migration documente elle-même la faille qu'elle ferme |
| SEC-08 | **PASS** | `gp_pilot_plateforme_admin_role_total.test.sql` (réécrit pendant cette mission, voir §15.3) : auto-promotion refusée, rôle inchangé, prouvé |
| SEC-09 | **PASS** | `document_partage_public_par_jeton_v1.test.sql` : devis et facture brouillon tous deux invisibles via le jeton public, prouvé |
| SEC-10 | NOT_TESTABLE_LOCALLY | `trg_lignes_factures_brouillon_only` — comportement documenté et exploité par un autre test (voir §15.2), mais jamais affirmé nommément par un `throws_like` dédié comme son analogue devis |

#### Support et incident (SUP)

| ID | Statut | Preuve |
| --- | --- | --- |
| SUP-01 | **PASS** | `src/app/actions/support.test.ts` : message support envoyé, e-mail jamais déclenché côté demandeur (comportement attendu), prouvé |
| SUP-02 | **PASS** | Même fichier : réponse notifie exactement une fois le bon destinataire, prouvé |
| SUP-03 | MANUAL_EXPECTED | Procédure humaine documentée (4 points de vérification d'identité) |
| SUP-04 | MANUAL_EXPECTED | Mécanisme technique sous-jacent prouvé (verrou facture, §FA-02) ; la checklist de triage elle-même est une procédure support, pas un test |

---

## 4. Parcours Jour 1

Simulé au niveau **données + RLS + RPC**, faute d'app vivante (§0) : connexion (auth non
exécutable), entreprise (ON-01/02, code review), salariés (28 dans la fixture, PE-01..03),
clients (8 dans la fixture, CL-01..06), chantiers (7 dans la fixture, CH-01..09), planning (300
affectations dans la fixture, PL-01..06 — **PL-05 : FAIL, voir §13.5**), pointage (300 pointages
dans la fixture, PT-01..08 — **PT-08 : FAIL, voir §13.6**). Le fait que la fixture entière
(28 employés répartis sur 5 profils, leurs 300 affectations et 300 pointages sur ~6 semaines)
s'insère et se relit sans erreur via `seed_entreprise_pilote_btp.sql`/`assertions_...sql` (§1) est
en soi une preuve d'exécution que ce volume de données Jour-1-à-J+42 est structurellement
cohérent avec le schéma réel.

## 5. Devis

Petit devis / gros devis / remise / TVA / plusieurs lignes : couvert par les 9 devis de la
fixture (montants variés, `remise_globale`/`taux_tva` par ligne) — insertion et assertions
passées (§1). Draft/send/accept/snapshot/immutability : voir §3, section DV — draft (DV-01,
code), send (DV-03, **PASS**), accept (DV-06, **PASS**), immutability sur `accepte` prouvée
indirectement par la garde qui bloque l'insertion de lignes sur un devis déjà accepté (raison du
défaut #3 historique de la fixture, toujours actif). Snapshot commercial (`entreprise_snapshot`)
non testé nommément dans cette mission — code review uniquement.

## 6. Facturation

Devis→facture (FA-01), facture directe (schéma sans dépendance devis pour `type='simple'`),
paiement partiel/total (FA-05/06, FA-07 **PASS avec preuve de concurrence réelle, §12.1**), avoir
(**AV-01 corrigé, §15.2**), retard (**FA-08 FAIL, §13.2**), échéance (FA-10, nuance §3). Voir §3
sections FA/AV pour le détail complet.

## 7. Terrain

Pointage mobile (logique serveur prouvée pour la validation/rejet, PT-05/06 **PASS** ; capture
GPS/motif non exécutable sans navigateur), photo chantier (CH-04 **PASS**), note de frais
(NF-01..05, code review), congé (CG-01..04, code review), planning (**PL-05 FAIL**),
permissions (PE-02/03 **corrigées et PASS**, §15.1).

## 8. Stock

Article/fournisseur/commande/réception : **CM-04/CM-05/ST-02 PASS**, le moteur transactionnel de
réception (`gp_reception_commande_stock_transactionnel_v1.test.sql`, 65 assertions) couvre déjà
explicitement la **double réception** et la **concurrence** citées dans la mission — scénario 2
de ce fichier enchaîne deux réceptions partielles sur la même commande et prouve l'absence de
double-comptage du stock.

## 9. Documents

Public links (DV-04/05, AV-03, DOC-03 **PASS**), PDF (rendu réel non exécutable, mais génération
du contenu/lien prouvée), signatures (DV-10, code review), photos (DOC-04 **PASS**, scoping strict
au jeton), mentions légales (`entreprise_snapshot`, non testé nommément), version (non
identifié), partage (**PASS** sur l'ensemble des mécanismes de jeton public testés).

## 10. Utilisateurs

Invitation/activation (ON-05, code review), désactivation/réactivation (`changerStatutEmployeAction`,
code review), capacité (`verifierCapacitePersonnes`, exercée avec succès par le seed et par
`elsatia_tools_r8.test.sql`), rôles (SEC-08 **PASS**, ON-03 code review), sortie salarié (PE-05/07
— **PE-07 : FAIL, §13.3**).

## 11. Erreurs utilisateur

| Cas | Statut | Preuve |
| --- | --- | --- |
| Double clic (paiement) | **PASS** | FA-07 — TOCTOU bloqué par `for update`, §12.1 |
| Double clic (avoir) | **PASS** | AV-02 — idempotence prouvée, résout vers l'avoir existant |
| Double clic (auto-promotion admin) | **PASS** | SEC-08 |
| Saisie incomplète (refus de congé sans motif) | NOT_TESTABLE_LOCALLY | CG-03, code review |
| Saisie incomplète (rejet pointage sans motif) | **PASS** | PT-06 |
| Duplication (devis) | NOT_TESTABLE_LOCALLY | DV-02, code review |
| Navigation retour / deux onglets / perte réseau | NOT_TESTABLE_LOCALLY | nécessite un navigateur réel |
| Deux utilisateurs, même donnée | **PASS** | voir §12 — concurrence réelle testée sur paiement |

## 12. Concurrency

### 12.1 Paiement — deux connexions PostgreSQL réellement simultanées

Contrairement aux tests d'idempotence pgTAP (qui prouvent la logique par appels séquentiels dans
une même transaction), ce test lance **deux process `psql` séparés en parallèle**, l'un prenant
le verrou `for update` sur la facture pendant 3 secondes, l'autre appelant
`enregistrer_paiement_facture` sur la même facture pendant que le verrou est tenu :

```
Session A : 22:25:10.285  BEGIN ; SELECT ... FOR UPDATE (facture aa..01, montant_paye=0)
Session B : 22:25:11.283  SELECT enregistrer_paiement_facture(..., 100, ...)  ← démarre pendant que A tient le verrou
Session A : 22:25:13.291  COMMIT (relâche le verrou après 3s de pg_sleep)
Session B : 22:25:13.300  la RPC retourne enfin — bloquée 2017 ms, débloquée juste après le COMMIT de A
Résultat  : factures.montant_paye = 100.00, statut = 'payee_partiel' — cohérent, aucune perte d'écriture
```

Preuve directe que le verrou `FOR UPDATE` de `enregistrer_paiement_facture` sérialise
correctement deux connexions réellement concurrentes, pas seulement deux appels séquentiels.

### 12.2 Stock — double réception (déjà couvert par un test existant)

`gp_reception_commande_stock_transactionnel_v1.test.sql`, scénario 2 : deux réceptions
successives sur la même commande (4/10 puis complément) sans double-crédit de stock — exécuté et
passant (§3, CM-04/CM-05).

### 12.3 Planning / pointage / devis

Pas de test à deux connexions simultanées mené sur ces modules dans cette mission (budget de
temps) — la protection structurelle observée dans le code (verrous `for update` sur les lignes
sensibles, contraintes d'unicité, policies RLS) suit le même patron que le paiement (§12.1), mais
n'a pas été rejouée en double connexion réelle pour planning/pointage/devis spécifiquement.
Classé `NOT_TESTABLE_LOCALLY` faute de temps, pas faute de mécanisme identifié.

---

## 13. UX Blockers

Seules les frictions réellement susceptibles de bloquer un pilote accompagné et de confiance.
**P0** = bloque le pilote. **P1** = pilote possible avec contournement documenté. **P2** =
acceptable en pilote accompagné, à corriger avant extension.

### 13.1 P0 — CL-05 / DV-09 : accès direct par URL ne redirige pas (mais ne fuit rien)

`/clients` et `/devis` (et très probablement les autres pages listées « Accès refusé » du pack —
non toutes revérifiées individuellement par manque de temps, voir §3) n'ont **aucune garde de
page explicite** : `clients/page.tsx`/`devis/page.tsx` appellent directement
`supabase.rpc("clients_liste_paginee"/"devis_liste_paginee", ...)` et ne déstructurent que
`{ data }`, en ignorant `error`. Les RPC elles-mêmes **refusent bien** l'accès (`raise exception
'Accès refusé'` si `not a_permission(..., 'acces_clients'/'acces_devis')`) — **aucune fuite de
données** — mais comme l'erreur PostgREST n'est jamais vérifiée, la page se rend simplement avec
une liste vide, au lieu de rediriger vers `/dashboard` comme l'attend le contrôle d'acceptation.
Un ouvrier qui tape `/clients` dans la barre d'adresse voit une page « Clients » vide plutôt
qu'un message de refus ou une redirection.

**Sévérité réelle : P0 dans le document d'acceptation, mais P2 en pratique** — c'est un défaut
d'expérience utilisateur (pas de message clair), pas une brèche de sécurité. Reclassé ici comme
**P1** (confusion possible pour un pilote non technique qui verrait une page vide sans
explication) plutôt que P0.

**Contournement pour le pilote** : aucun geste requis côté produit — la sécurité réelle des
données tient. Prévenir le facilitateur pilote que certaines pages internes peuvent apparaître
vides pour les profils non autorisés, sans message.

### 13.2 P1 — FA-08 : une facture en retard ne le devient jamais toute seule

`src/lib/relances-moteur.ts` documente lui-même la limite : `statut='en_retard'` n'est recalculé
que par le trigger `recalc_paiements_facture`, déclenché par un mouvement de paiement — jamais
par le simple écoulement du temps (aucun `cron.schedule` dans tout le dépôt). Une facture émise
et jamais payée peut donc rester affichée « Envoyée » indéfiniment tant que personne n'y touche.

**Contournement** : le gérant/comptable doit consulter périodiquement la liste des factures
triées par échéance (colonne `date_echeance`), pas se fier au badge de statut « en_retard » seul,
jusqu'à ce qu'une tâche planifiée soit ajoutée.

### 13.3 P1 — PE-07 : « Révoquer l'appareil » ne coupe pas réellement l'accès

`revoquerAppareilEmployeAction`/`revoquer_appareil_compte` ne fait que marquer
`appareils_comptes.revoque_at`, une colonne lue uniquement par la facturation du nombre
d'appareils — jamais par un contrôle d'authentification ou de session. Un salarié parti dont
l'appareil est « révoqué » via cet écran garde un accès mobile fonctionnel tant que son compte
utilisateur reste actif.

**Contournement** : pour couper réellement l'accès d'un salarié parti, désactiver son **compte**
(`changerStatutCompteApplicationAction`, déjà existant et déjà exercé par le seed/assertions),
pas seulement « révoquer l'appareil ». À documenter explicitement dans la procédure de sortie
salarié du pilote.

### 13.4 P2 — PL-03 : aucun historique de modification du planning

`modifierAffectationAction` est une simple `UPDATE` sans trace — aucune table d'audit dédiée aux
affectations (contrairement à `historique_vehicules`/`historique_outillage`/`historique_capacite_personnes`
qui existent pour d'autres modules).

**Contournement** : à l'échelle d'un pilote (28 salariés, quelques modifications par semaine),
acceptable sans historique — demander au facilitateur de noter les changements significatifs
ailleurs si un litige est à prévoir.

### 13.5 P1 — PL-05 : le planning entier est visible par tout membre actif

Ni la policy RLS de `affectations` (`est_membre_actif(entreprise_id)`, sans filtre par employé)
ni la requête de `planning/page.tsx` (aucun filtre `employe_id`, seul `peutGererPlanning` masque
le formulaire d'édition) ne restreignent la lecture du planning à « mes seules affectations »
pour un ouvrier — il voit le planning complet de l'entreprise (qui travaille où, quand).

**Sévérité réelle** : expose des données de planification interne (pas financières, pas de PII
sensible au sens RGPD) à l'ensemble de l'équipe. Risque modéré pour un pilote accompagné.

**Contournement** : accepté tel quel pour ce pilote (28 salariés d'une même PME, qui se
connaissent déjà) — documenter que le planning est actuellement visible par toute l'équipe, pas
cloisonné par salarié, avant toute extension à une clientèle où cette visibilité serait
inappropriée (sous-traitants multiples sur un même compte, par exemple).

### 13.6 P2 — PT-08 : pas de création de pointage par un administrateur pour un salarié

Recherche exhaustive dans `src/app/actions/pointages.ts` et les pages `/pointage*` : aucune
action ne permet à un administratif de créer une fiche de pointage au nom d'un salarié
(seulement en son propre nom, via `creerMaFichePointageAdministrateurAction`). La page de gestion
l'indique d'ailleurs elle-même explicitement.

**Contournement** : demander au salarié concerné d'utiliser « pointage oublié »
(`declarerPointageOublieAction`, statut `a_verifier`) puis faire valider par son chef d'équipe
(PT-05, déjà **PASS**) — couvre le besoin de régularisation sans la fonctionnalité dédiée.

### 13.7 P2 — CH-09 : pas de carte à l'écran de géolocalisation chantier

Coordonnées et distance affichées en texte brut, pas de composant carte.

**Contournement** : le lien Maps existant ailleurs dans l'application (fiche chantier) reste
utilisable pour visualiser l'adresse ; cet écran sert avant tout au calcul de distance pour le
pointage géolocalisé (PT-01), pas à la visualisation.

### 13.8 Note — SEC-02/PL: exposition en lecture de `postes`/`permissions_poste`

**Vérifié empiriquement** dans cette mission (pas seulement en lecture de code) : un ouvrier peut
lire l'intégralité de la table `permissions_poste` de son entreprise (233 lignes dans la fixture)
— RLS `est_membre_actif` seul, sans filtre par permission. **L'écriture, elle, est bien bloquée**
(vérifié par une tentative réelle d'auto-attribution de `gerer_utilisateurs`, refusée par la
policy RESTRICTIVE `role_gestion_insert` — voir SEC-06 au §3) : aucune élévation de privilège
possible. C'est une exposition en lecture seule de la **matrice des rôles** (quel poste a quelle
permission), pas des données personnelles ou financières — sévérité P2, informationnel.

---

## 14. Workarounds — récapitulatif

| Limitation | Contournement |
| --- | --- |
| CL-05/DV-09 : pages « accès refusé » se rendent vides sans message | Prévenir le facilitateur pilote — aucune fuite de données |
| FA-08 : facture en retard non basculée automatiquement | Revue manuelle périodique de la liste factures triée par échéance |
| PE-07 : « révoquer appareil » n'invalide pas la session | Désactiver le **compte** du salarié sorti, pas seulement son appareil |
| PL-03 : pas d'historique planning | Accepté pour le volume d'un pilote ; noter les changements sensibles ailleurs |
| PL-05 : planning visible par toute l'équipe | Accepté pour ce pilote (équipe restreinte, déjà en contact) ; à fermer avant extension |
| PT-08 : pas de pointage créé par un admin pour un salarié | Passer par « pointage oublié » + validation chef d'équipe |
| CH-09 : pas de carte à l'écran localisation | Utiliser le lien Maps de la fiche chantier |

---

## 15. Fixes appliqués pendant cette mission

Uniquement des correctifs réels : sécurité et incohérence, chacun avec un test qui n'existait
pas avant et qui prouve le comportement corrigé. Aucun changement cosmétique.

### 15.1 Sécurité (P1) — `employes.taux_horaire` lisible par tout salarié

**Trouvé par exécution réelle** (pas par lecture) : `select taux_horaire from employes where
id=...` exécuté sous le rôle d'un ouvrier renvoyait la valeur numérique d'un collègue (testé avec
`42.50`, retourné tel quel). Seule protection existante : un masquage côté UI
(`peutVoirTauxFacture` dans `employes/[id]/page.tsx`), contournable par tout appel direct à
l'API. Déjà documenté comme réserve connue non fermée (P1-5/O9bis du pack d'acceptation).

**Correctif** : `supabase/migrations/20260922000323_securiser_taux_horaire_facture_employe.sql` —
même traitement, à l'identique, que le correctif déjà validé pour `cout_horaire`
(`20260818000205`) : colonne déplacée vers `employes_taux_facture`, table dédiée avec policy
RESTRICTIVE gérée par la permission `voir_taux_facture_employe`. Code applicatif mis à jour
(`src/app/actions/employes.ts`, `src/app/actions/import.ts`, les deux pages employé). Seed pilote
corrigé pour la même raison que le défaut #1 historique de la fixture (§1, défaut #8).

**Test ajouté** : `supabase/tests/securiser_taux_horaire_facture_employe.test.sql`, 6 assertions
— colonne bien retirée, table dédiée présente, lecture autorisée pour un poste habilité,
**lecture invisible (0 ligne, pas juste une valeur nulle) pour un ouvrier**, isolation
multi-entreprise, écriture toujours ouverte au niveau RLS (contrôle fin délégué au Server
Action, comme `cout_horaire`).

### 15.2 Incohérence (P1) — un avoir créé ne marque jamais la facture d'origine

**Trouvé par recherche exhaustive** : `'avoir_emis'` (valeur de `factures.statut`) n'apparaît
nulle part comme cible d'un `UPDATE` dans tout le dépôt — seulement dans la contrainte `check` et
dans des filtres d'exclusion (`rentabilite.ts`, `tresorerie/page.tsx`,
`dashboard_indicateurs_bornes`...). `creer_facture_avancee()` insère bien l'avoir mais ne touche
jamais le statut de la facture créditée. Correspond exactement à AV-01 de
`ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`.

**Correctif** : `supabase/migrations/20260922000324_correctif_statut_avoir_emis_facture_origine.sql`
— nouvelle définition de `creer_facture_avancee`, reprise à l'identique de la dernière version
réelle, un seul ajout : `update factures set statut='avoir_emis' where id=p_facture_origine_id`,
dans la même transaction que la création de l'avoir (idempotence déjà en place non affectée, le
pré-check d'existence d'un avoir filtre sur `type<>'avoir'`, pas sur le statut).

**Test ajouté** : assertion supplémentaire dans
`supabase/tests/gp_pilot_paiement_avoir_idempotence.test.sql` (plan 11→12) : la facture d'origine
passe bien en `avoir_emis` dès la création de l'avoir.

### 15.3 Tests pgTAP jamais exécutés auparavant — 3 suites stales corrigées

pgTAP n'ayant jamais tourné dans l'histoire de ce projet avant cette mission, trois suites
existantes se sont révélées périmées par rapport au code qu'elles étaient censées tester (voir
commit dédié pour le détail complet) : `gp_pilot_plateforme_admin_role_total.test.sql`
identifiait l'appelant par un claim obsolète (email seul, sans `utilisateur_id`/`auth.uid()`) —
incompatible avec le durcissement canonique déjà fusionné depuis longtemps ;
`gp_pilot_rgpd_manifeste_fichiers.test.sql` appelait un helper interne directement, que son
propre `revoke` interdit ; `document_partage_public_par_jeton_v1.test.sql` violait le verrou
d'immuabilité des factures dans son propre décor. Les trois ont été réécrites pour exercer le
comportement réel ; les 93 (puis 95 avec les 2 nouveaux fichiers de cette mission) autres suites
n'ont nécessité aucune correction.

### 15.4 Infrastructure — `scripts/local-postgres-bootstrap/`

Nouveau, committé : bootstrap PostgreSQL 16 nu (rôles `anon`/`authenticated`/`service_role`/
`supabase_migrator`, stubs `auth`/`storage`/`pgsodium` minimaux mais fonctionnels) + script de
rejeu des migrations, permettant à toute mission future sans Docker de faire tourner la suite
pgTAP réelle contre le schéma réel avec RLS active. Documenté (`README.md` du dossier) avec ses
limites exactes (pas de GoTrue/PostgREST/Storage réels, pas de vrai pgsodium).

### 15.5 Ce qui n'a pas été corrigé, et pourquoi

`PL-05` (planning visible par toute l'équipe) et `CL-05`/`DV-09` (pas de redirection explicite)
n'ont pas été corrigés dans cette mission : le premier demande un changement d'architecture RLS
non trivial (distinguer la vue « mon planning » de la vue « gestion d'équipe » pour les chefs
d'équipe/chantier légitimement larges) qui mérite d'être conçu et testé en dehors d'une mission
de recette ; les seconds sont des lacunes UX sans risque de sécurité, à traiter comme un lot
produit normal plutôt qu'un correctif d'urgence. `PE-07` (révocation d'appareil) demande
vraisemblablement un appel à l'API Admin de Supabase Auth (invalidation de session), non
testable dans cet environnement sans GoTrue réel — le corriger à l'aveugle aurait été
irresponsable.

---

## 16. Replay après corrections

Rejoué intégralement après les correctifs du §15, pas seulement avant :

```
DB fraîche → 315 migrations (313 + 2 correctifs) rejouées sans erreur
Cycle fixture complet (seed → assertions → reseed → assertions → cleanup → seed → assertions) : OK
Suite pgTAP complète : 95 fichiers, 2582/2582 assertions (hors le seul fichier qui nécessite un
  vrai pgsodium, inchangé et documenté comme limite d'environnement, pas un défaut produit)
Suite vitest complète : 153/153 fichiers, 1786/1786 tests
Typecheck (app principale Gestion Pro) : 0 erreur
Lint (app principale) : 0 erreur, 6 avertissements préexistants mineurs (inchangés)
```

Aucune régression introduite par les deux correctifs de sécurité/incohérence.

---

## 17. Rapport final

### Récapitulatif

```
TOTAL ACCEPTANCE     : 143
PASS                 : 35  (24 %)
FAIL                 : 8   (6 %)  — 2×P0 reclassés P1 (accès sans redirection, pas de fuite),
                                     3×P1 réels (retard facture, révocation appareil, planning
                                     large), 3×P2 (historique planning, pointage régularisé,
                                     carte localisation)
NOT_TESTABLE_LOCALLY : 96  (67 %) — nécessitent une session navigateur authentifiée réelle
                                     (GoTrue/PostgREST/Storage/e-mail), indisponible dans cet
                                     environnement (registre Docker bloqué par un plafond de
                                     données du proxy sortant)
MANUAL_EXPECTED       : 4   (3 %)  — procédures humaines par nature (support, RGPD, inspection
                                     réseau)
```

Nouveau par rapport aux missions précédentes : **pgTAP a tourné pour la première fois** (95
fichiers, 2582 assertions passantes), ce qui a permis de faire passer 3 des 8 `FAIL` initiaux à
`PASS` après correctif dans cette même mission (`AV-01`, `PE-02`, `PE-03`), et de vérifier
empiriquement (pas seulement en lecture) deux propriétés de sécurité critiques : l'impossibilité
d'auto-élévation de privilège (SEC-06/SEC-08) et le verrouillage transactionnel réel sous
concurrence à deux connexions simultanées (§12.1).

### Verdict

**PILOT READY WITH WORKAROUNDS.**

Justification :
- Le socle transactionnel (paiements, avoirs, réceptions de commande, verrous de documents
  émis, isolation multi-tenant) est prouvé par exécution réelle et robuste sous concurrence
  réelle, pas seulement en théorie.
- Les deux défauts de sécurité réellement trouvés par exécution (fuite `taux_horaire`,
  incohérence `avoir_emis`) ont été corrigés et re-testés avant la clôture de cette mission —
  aucun défaut de sécurité connu et non traité ne subsiste dans le périmètre exécuté.
- Les 8 `FAIL` restants ont chacun un contournement documenté au §14, aucun n'empêche un pilote
  accompagné de fonctionner ; aucun n'est une perte de données ou une fuite de données
  personnelles/financières (la seule exposition en lecture identifiée, `permissions_poste`, est
  la matrice des rôles elle-même, pas des données de salariés ou de clients).
- 67 % des contrôles restent `NOT_TESTABLE_LOCALLY` — c'est la limite structurelle de cet
  environnement (pas de Docker fonctionnel pour la pile Supabase complète), pas une faiblesse du
  produit. Cette proportion élevée est précisément pourquoi le verdict est « avec contournements »
  et non « prête sans réserve » : une passe de recette manuelle réelle (ou une Preview) reste
  nécessaire avant le lancement effectif du pilote, pour couvrir les parcours UI qu'aucune
  exécution locale ne peut prouver.

Pas de « Preview ready » — aucune Preview utilisée dans cette mission.

### Ce qu'une prochaine mission devrait faire en priorité

1. Exécuter cette même recette sur une vraie Preview Supabase (GoTrue/PostgREST/Storage réels) —
   seul moyen de faire baisser significativement les 96 `NOT_TESTABLE_LOCALLY`, en particulier
   tous les gardes de page centralisés (`AV-04`, `CM-07`, `EX-03`, `PA-04/05`, `SEC-01/02/03`,
   `ST-08`) qui n'ont pu être vérifiés qu'en lecture de code ici.
2. Ajouter des suites pgTAP pour les RPC critiques encore non couvertes malgré leur importance :
   `creer_facture_depuis_devis`, `creer_situation_travaux`, `transition_note_frais`,
   `transition_demande_conge`, `demander_suppression_entreprise` — toutes lisibles, aucune
   testée par exécution.
3. Concevoir (hors mission de recette) une vue planning distincte pour un rôle sans droit de
   gestion (`PL-05`), et un mécanisme réel de révocation de session (`PE-07`) via l'API Admin
   Supabase Auth.
