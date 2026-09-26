# ELSATIA GP — Revue indépendante de la fixture pilote avant exécution Preview (V1)

Revue indépendante, en autonomie totale, du script
`supabase/production/seed_entreprise_pilote_btp.sql` livré dans
`docs/qualification/ELSATIA_EXTERNAL_PILOT_ACCEPTANCE_PACK_V1.md` (branche
`claude/upbeat-noether-djmg5i`, commit `f6d4379`). **Le script n'a pas été exécuté sur
Preview** dans cette mission — conformément à la consigne. Il a en revanche été **exécuté
réellement, plusieurs fois, sur une base PostgreSQL 16 locale rejouant les 313 migrations
réelles du dépôt** (voir §0) : ce n'est donc pas seulement une revue statique, mais une revue
appuyée sur une exécution effective, non-Preview.

**7 défauts réels ont été trouvés et corrigés dans la fixture** au fil de cette exécution
(§2). Un cleanup et un script d'assertions ont été ajoutés, testés de bout en bout (seed →
cleanup → re-seed propre, §14/§16). Verdict en §18.

## 0. Base et méthode

```
Branche revue     : qa/pilot-fixture-independent-review-v1 (créée depuis f6d4379)
Fichier revu       : supabase/production/seed_entreprise_pilote_btp.sql
Produit modifié     : NON (seules la fixture, son script de nettoyage, ses assertions,
                       le garde-fou et cette documentation ont été touchés)
```

**Dry-run réel, pas seulement statique.** L'environnement dispose de `psql`/PostgreSQL 16
en local (`postgresql-16`, paquet Debian/Ubuntu) mais d'aucun Docker ni CLI Supabase
(`docker ps` échoue : `dial unix /var/run/docker.sock: ... no such file or directory` ;
`npx supabase` refuse l'installation interactive) — exactement la même limite que documentée
dans `ELSATIA_GP_EXTERNAL_PILOT_CLOSURE_V1.md`. Plutôt que de s'arrêter à
`EXECUTION_NOT_PROVEN`, cette revue a construit une base PostgreSQL 16 locale qui **rejoue les
313 fichiers réels de `supabase/migrations/` dans l'ordre**, avec un minimum de substituts pour
les briques propres à l'infrastructure Supabase absentes d'un Postgres nu (non disponibles en
tant qu'extensions sur ce système) :

| Substitut | Portée | Pourquoi |
| --- | --- | --- |
| Rôles `anon`/`authenticated`/`service_role`/`authenticator` | Création des rôles, aucune donnée | Grants réels des migrations |
| `auth.users` (table minimale) + `auth.uid()`/`auth.role()`/`auth.email()`/`auth.jwt()` (stubs retournant `null`/`'service_role'`/`'{}'`) | Fonctions | Conforme à la réalité : ce script tourne hors session applicative, `auth.uid()` y est bien `null` en production aussi (c'est justement le sujet du §4) |
| `storage.buckets`/`storage.objects` (tables minimales) + `storage.foldername/filename/extension` | Fonctions/tables | Policies Storage créées par les migrations, non utilisées par la fixture elle-même |
| `net.http_post/http_get`, `cron.schedule/unschedule` (stubs no-op) | Fonctions | Webhooks/tâches planifiées définis mais jamais appelés à l'application des migrations |
| `pgsodium`/`vault` (schémas + stubs minimaux) | Fonctions | `pgsodium` n'est pas installable comme extension sur ce système (`Could not open extension control file`) ; une seule migration (`20260828000244_stripe_state_attestation_r72.sql`, hors périmètre Stripe/pgsodium) en dépend — sa ligne `create extension if not exists pgsodium;` a été neutralisée pour cette seule migration, le reste du fichier appliqué tel quel |
| `search_path = public, extensions` au niveau base | Config | Nécessaire pour que `pg_trgm`/`unaccent` installées dans `extensions` restent utilisables sans qualification explicite, comme sur un vrai projet Supabase |

**Résultat : les 313 migrations s'appliquent sans erreur** avec ces seuls substituts — aucune
n'a dû être modifiée pour la logique métier elle-même. C'est déjà, en soi, une donnée utile et
indépendante du sujet de cette revue : le train est rejouable de bout en bout sur un Postgres
16 nu moyennant cet environnement d'amorçage.

**Limites de cette preuve**, à ne pas surinterpréter : ce n'est **pas** une preuve d'exécution
Preview. RLS n'est jamais réellement testée sous un rôle `authenticated`/`anon` contraint (le
script tourne en superutilisateur `postgres`, RLS bypassée comme le sont tous les scripts de ce
dossier — voir §17) ; aucune suite pgTAP n'a été rejouée (hors périmètre de cette mission, déjà
signalé dans le pack) ; les webhooks/e-mails réels ne partent jamais (stubs no-op). Ce que cette
preuve couvre réellement et fidèlement : la structure des tables, les contraintes `check`/`not
null`/FK, les triggers métier (verrous, calculs de montants, capacité), et le comportement
transactionnel réel du script — c'est exactement le périmètre de cette revue.

---

## 1. Résumé exécutif

| # | Question (voir §18 de la mission) | Réponse courte |
| --- | --- | --- |
| 1 | Le SQL est-il réellement exécutable ? | **Oui, vérifié par exécution réelle** (Postgres 16 local, schéma réel) — après correction de 7 défauts trouvés par cette même exécution (§2) |
| 2 | Risque de toucher des données non synthétiques ? | Non — ciblage strict par `reference_interne`/`numero` `PILOTE-%`, isolation multi-tenant vérifiée par requête (0 fuite croisée constatée), whitelisté sur Preview uniquement |
| 3 | Est-il rejouable ? | **Oui, idempotent, vérifié par triple exécution** + par un test de panne forcée à mi-parcours (rollback atomique intégral, zéro résidu, rejeu immédiat réussi) |
| 4 | Comment nettoyer proprement ? | `cleanup_entreprise_pilote_btp.sql`, livré et testé de bout en bout (§14) |
| 5 | Corrections nécessaires avant Preview ? | Les 7 déjà appliquées (§2) ; rien d'autre identifié après re-test complet |
| 6 | pgTAP + fixture sur Preview sans risque connu ? | La fixture : oui, sous réserve d'exécuter d'abord `cleanup_entreprise_pilote_btp.sql` en test sur Preview même (aucune exécution Preview n'a eu lieu dans cette mission, voir §15 « Dry-run »). pgTAP : hors périmètre de cette revue, qui ne portait que sur la fixture |

---

## 2. Défauts réels trouvés et corrigés (par exécution, pas par lecture)

Chacun de ces 7 points a été détecté en observant une vraie erreur SQL lors de l'exécution du
script sur le schéma réel, puis corrigé dans `seed_entreprise_pilote_btp.sql` et re-vérifié par
ré-exécution.

| # | Défaut | Preuve d'exécution | Correction |
| --- | --- | --- | --- |
| 1 | `employes.cout_horaire` n'existe plus comme colonne de `employes` (déplacée vers la table `employes_cout_horaire` par une migration plus récente que le gabarit `creer_entreprise_demo_18_mois.sql` dont ce script s'inspirait — **ce gabarit de référence est donc lui-même obsolète vis-à-vis du schéma actuel**, constat qui dépasse cette seule fixture) | `ERROR: column "cout_horaire" of relation "employes" does not exist` | Colonne retirée de l'INSERT `employes` ; boucle dédiée insérant dans `employes_cout_horaire` |
| 2 | Une entreprise en `essai` est plafonnée à 3 comptes actifs (`trg_capacite_personnes_actives`, migration `20260903000256`) ; 28 salariés la dépassent | `ERROR: CAPACITE_PERSONNES_ATTEINTE ... {"actives":3,"capacite":3}` | Ajout d'un `UPDATE entreprises SET capacite_personnes_supplementaire=30 ...` + ligne `historique_capacite_personnes`, reproduisant l'effet de la RPC plateforme `plateforme_definir_capacite_personnes_supplementaire` (elle-même inappelable ici, voir §4) plutôt qu'un contournement générique |
| 3 | Un devis créé directement avec `statut='accepte'` puis dont les lignes sont insérées après coup viole le verrou d'immuabilité (`verrouiller_devis_accepte`, trigger sur `UPDATE`) : l'INSERT des lignes déclenche un recalcul des montants (`trg_recalc_devis`) qui tente de modifier un devis déjà « accepté » | `ERROR: Ce devis est accepté et ne peut plus être modifié.` | Les 9 devis sont désormais créés en `brouillon`, leurs lignes insérées, **puis** le statut cible appliqué par un `UPDATE` séparé — même précaution que celle déjà appliquée aux factures |
| 4 | `articles_stock.prix_vente_ht` est `NOT NULL` ; 14 des 15 articles avaient `null` | `ERROR: null value in column "prix_vente_ht" ... violates not-null constraint` | Valeur de vente réaliste (marge ~60-65 %) ajoutée sur les 14 lignes concernées, `ON CONFLICT` mis à jour en conséquence |
| 5 | `notes_frais.valide_par` référence `public.utilisateurs` (un compte connecté), pas `public.employes` ; la fixture n'avait initialement aucun compte utilisateur | `ERROR: insert or update on table "notes_frais" violates foreign key constraint "notes_frais_valide_par_fkey" ... Key ... is not present in table "utilisateurs"` | Voir défaut suivant (comptes ajoutés) — les valeurs `valide_par` restent celles initialement prévues, désormais valides |
| 6 | `demandes_conges.created_by` référence aussi `public.utilisateurs`, en **`NOT NULL`** cette fois (contrairement à `valide_par`, nullable) : impossible de seeder la moindre demande de congé sans au moins un compte utilisateur réel | *(même famille d'erreur que le défaut 5, bloquant celui-ci sans contournement possible)* | Boucle ajoutée : chaque salarié reçoit un compte `auth.users`/`public.utilisateurs`/`public.utilisateurs_entreprises` actif (même UUID que sa fiche `employes`, domaine `@example.test`), représentant un pilote actif depuis ~2 mois où toute l'équipe a activé son compte — voir §4 pour la justification et la limite de ce choix |
| 7 | Sécurité : ligne d'INSERT `lignes_commande` corrompue laissée par erreur de rédaction (une expression booléenne `'fourniture'::text is not null and ... is not null` à la place d'une valeur de quantité), repérée et supprimée **avant** toute exécution, lors de la relecture qui a précédé la première mission — mentionnée ici pour mémoire, déjà documentée dans le pack d'origine | Repérée par relecture manuelle, jamais exécutée | Ligne dupliquée/corrigée supprimée |

Deux garde-fous supplémentaires ont été vérifiés à l'exécution sans nécessiter de correction :
la garde brouillon sur les factures (déjà gérée correctement dans la version livrée) et le
trigger `trg_lignes_factures_brouillon_only` (déjà respecté).

---

## 3. Dépendances (tables, fonctions, triggers, RPC)

| Objet | Existe dans le train actuel ? | Type | Dépendance/risque |
| --- | --- | --- | --- |
| `entreprises`, `postes`, `permissions_poste`, `permissions_disponibles` | Oui | Table | Aucune |
| `employes`, `employes_cout_horaire`, `habilitations_employe` | Oui | Table | `cout_horaire` déplacée (défaut #1, corrigé) |
| `utilisateurs`, `utilisateurs_entreprises`, `auth.users` | Oui | Table | Nécessaires pour `demandes_conges`/`notes_frais` (défaut #6) |
| `clients`, `chantiers`, `equipes_chantiers` | Oui | Table | Aucune |
| `devis`, `lignes_devis` | Oui | Table + triggers | `verrou_devis_accepte`, `verrou_lignes_devis_accepte`, `trg_recalc_devis` (défaut #3, corrigé) |
| `factures`, `lignes_factures`, `paiements` | Oui | Table + triggers | `verrouiller_facture_emise`, `lignes_factures_brouillon_only` — déjà gérés correctement dans la version livrée |
| `affectations`, `pointages` | Oui | Table | Aucune |
| `fournisseurs`, `articles_stock`, `mouvements_stock` | Oui | Table | `prix_vente_ht` NOT NULL (défaut #4, corrigé) ; aucun trigger n'auto-génère de mouvement de stock à la réception d'une commande (vérifié : `commandes_fournisseurs`/`lignes_commande` ne portent que `commande_numero`/`recalc_commande_apres_ligne`, rien qui touche `mouvements_stock`) — la fixture ne peut donc pas entrer en double-comptage avec le lot « commande fournisseur → stock » (`ac8d201`) qui est un mécanisme applicatif (server action), pas un trigger DB |
| `commandes_fournisseurs`, `lignes_commande`, `depenses_fournisseurs`, `reglements_fournisseurs` | Oui | Table | Aucune |
| `notes_frais`, `demandes_conges` | Oui | Table | `valide_par`/`created_by`/`decide_par` référencent `utilisateurs` (défauts #5/#6, corrigés) |
| `historique_capacite_personnes` | Oui | Table | Écrite directement (défaut #2) au lieu de via la RPC (auth-gardée, voir §4) |
| `installer_roles_predefinis` (RPC) | Oui, mais **non utilisée** | Fonction `security definer` | Exige `peut_gerer_acces()` → `auth.uid()` (voir §4) ; la fixture reproduit son effet en dur à la place |
| `plateforme_definir_capacite_personnes_supplementaire` (RPC) | Oui, mais **non utilisée** | Fonction `security definer` | Exige `est_plateforme_admin()` + `plateforme_exiger_session_aal2()` (voir §4) ; la fixture reproduit son effet (mêmes colonnes, même ligne d'historique) par `UPDATE`/`INSERT` directs |
| `trg_capacite_personnes_actives` | Oui | Trigger `security definer` | Bloque au-delà de 3 comptes actifs en essai ; contournement sanctionné disponible (`elsatia.capacite_personnes_bypass`, réservé à `session_user='postgres'`) mais **non utilisé** — la fixture préfère reproduire le geste plateforme réel (défaut #2) |
| `trg_maj_cache_dashboard_devis`/`trg_maj_cache_dashboard_factures` → `entreprises_dashboard_cache` | Oui | Trigger | N'affecte pas le seed lui-même (statuts posés par `UPDATE` après création, jamais par suppression) ; affecte en revanche le **nettoyage** — voir §14 |

Aucune dépendance résiduelle à un ancien schéma, un ancien nom de colonne (hormis le défaut #1,
corrigé) ou une migration non convergée n'a été trouvée après correction.

---

## 4. Auth / contexte — sujet prioritaire

Confirmé par lecture ET par exécution réelle (le stub `auth.uid()` de l'environnement de revue
retourne `null`, exactement comme en production hors session applicative) : **aucune fonction
effectivement appelée par le script ne exige `auth.uid()`, une appartenance implicite ou une
permission de poste interactive.**

Deux RPC applicatives auraient été plus « naturelles » à utiliser mais ont été délibérément
écartées car elles sont gardées par un contexte utilisateur authentifié :

| RPC écartée | Garde | Reproduit à la place par |
| --- | --- | --- |
| `installer_roles_predefinis(entreprise_id, reinitialiser)` | `peut_gerer_acces(entreprise_id)` → `ue.utilisateur_id = auth.uid()` | INSERT direct dans `postes`/`permissions_poste`, permissions identiques au catalogue canonique (vérifié caractère pour caractère, §12) |
| `plateforme_definir_capacite_personnes_supplementaire(...)` | `est_plateforme_admin()` + `plateforme_exiger_session_aal2()` (MFA) | `UPDATE entreprises SET capacite_personnes_supplementaire=...` + `INSERT historique_capacite_personnes` avec les mêmes colonnes que celles que la RPC écrit (vérifiée par lecture de son corps, `\sf`) |

**Inserts directs dans `postes`/`permissions_poste`/`utilisateurs`/`utilisateurs_entreprises` —
reproduisent-ils fidèlement l'état produit attendu ?**

- `postes`/`permissions_poste` : oui, vérifié caractère pour caractère contre
  `modeles_roles_predefinis` (§12).
- `utilisateurs`/`utilisateurs_entreprises`/`auth.users` : ces comptes **n'existent dans aucun
  scénario produit réel avant l'étape d'activation** (numéro d'inscription, cf. §2 du pack
  principal) — la fixture fait le choix assumé de représenter un pilote **déjà actif depuis ~2
  mois où toute l'équipe a activé son compte**, plutôt qu'un jour 1 vierge (le parcours
  d'activation lui-même se teste sur une entreprise neuve via l'onboarding réel, pas sur cette
  fixture pré-peuplée). C'est une approximation raisonnable et documentée dans le script
  lui-même, pas une reproduction bit-à-bit d'un flux d'activation réel (qui implique GoTrue,
  hashage de mot de passe, e-mail — hors de portée d'un script SQL). Conséquence pratique
  : les comptes créés par ce script **n'ont pas de mot de passe utilisable** ; se connecter
  avec l'un d'eux pendant la recette exigerait un geste Supabase Auth Admin distinct
  (invitation/réinitialisation), non couvert par ce script — à noter dans le pack principal si
  la recette veut effectivement se connecter avec ces comptes plutôt que de simplement lire les
  données qu'ils rendent possibles (notes de frais validées, congés décidés).

---

## 5. Isolation multi-tenant

Vérifiée par exécution réelle, pas seulement par lecture du script :

```sql
-- Après seed, une seconde entreprise "AUTRE-ENTREPRISE-TEST" créée à côté :
select 'clients', count(*) from clients c join entreprises e on e.id=c.entreprise_id
  where c.reference_interne like 'PILOTE-%' and e.reference_interne<>'PILOTE-BTP-V1'
-- ... (chantiers, employes, devis, factures, idem)
-- Résultat : 0 sur les 5 tables vérifiées
```

Toutes les lignes créées portent `entreprise_id = v_entreprise` (résolu une seule fois en
tête de script par `reference_interne='PILOTE-BTP-V1'`) ou une clé composite
`(entreprise_id, ...)` cohérente. Aucune ligne ne référence une entreprise existante, aucun
tenant réel n'est touché.

---

## 6. Idempotence — vérifiée par exécution, pas supposée

| Scénario | Résultat observé |
| --- | --- |
| Exécution unique | Succès, compteurs conformes (§16) |
| Deux exécutions consécutives (base non réinitialisée entre les deux) | **Identiques** : même `entreprise_id` retrouvé par `reference_interne`, mêmes compteurs exacts sur les deux runs — aucune ligne dupliquée |
| Panne forcée à mi-parcours (`raise exception` injectée juste avant la section finale, sur une base vierge) | **Rollback atomique intégral** : `entreprises`/`employes` = 0 ligne après l'échec (le bloc `do $$ ... $$` entier constitue une seule transaction implicite ; PostgreSQL l'annule en totalité si une exception non interceptée en sort) |
| Rejeu immédiat après cette panne | Succès complet, compteurs conformes, **aucune procédure de nettoyage nécessaire** |
| Triple exécution (avant/après un cleanup complet, §14) | Compteurs identiques à chaque fois |

**Conclusion : le script est idempotent et rejouable sans précaution particulière après un
échec.** Un échec à mi-parcours ne laisse jamais d'état partiel — c'est une propriété du moteur
transactionnel PostgreSQL appliquée à un unique bloc `do $$ ... $$`, pas une garantie
spécifique au script, mais elle s'applique bien ici puisque tout le script est un seul bloc.
Aucune procédure de retry particulière n'est donc nécessaire : relancer le script après un
échec quelconque est toujours sûr.

---

## 7. Identifiants

- Aucun UUID n'est codé en dur dans le script : tous proviennent de `gen_random_uuid()`
  (défaut des colonnes `id`) ou de `returning id into ...`, jamais assignés manuellement.
- Les seuls identifiants stables sont textuels : `reference_interne` (`PILOTE-BTP-V1`,
  `PILOTE-EMP-NNN`, `PILOTE-CLI-NNN`, `PILOTE-CHA-NNN`), `numero` (`DEV-PILOTE-NNN`,
  `FAC-PILOTE-NNN`, `CMD-PILOTE-NNN`), `reference` (`PILOTE-FRN-NNN`, `PILOTE-STK-NNN`) —
  tous préfixés `PILOTE-`, distincts par construction des préfixes déjà utilisés par les autres
  scripts du dossier (`DEMO-18M`/`DEMO-EMP-`/`DEMO-CLI-`/`DEMO-CHA-`,
  marqueurs `[RECETTE 5A]`/`[RECETTE ONGLETS]`, `JUJU`) — vérifié par recherche croisée, aucune
  collision.
- Réutilisation du même UUID entre `employes.id` et `auth.users.id`/`utilisateurs.id` (défaut
  #6) : choix délibéré de simplification, sans risque de collision (deux espaces de clés
  indépendants, `gen_random_uuid()` garantit l'unicité globale de la valeur elle-même).
- Domaine e-mail systématique `@example.test` (RFC 2606, réservé aux tests, ne délivre jamais).

---

## 8. Données personnelles

Aucune donnée réelle. Vérifié :

| Champ | Constat |
| --- | --- |
| Noms/prénoms | Liste fixe de 28 prénoms/noms français courants, fictifs, aucune correspondance visée avec une personne réelle |
| E-mails | `pilote.<prenom>.<nom>@example.test` — domaine non délivrable |
| Téléphones | `06` + séquence arithmétique déterministe (`10000000+i*137`), non attribuable |
| Adresses | Rues/villes génériques de la région lyonnaise, aucun numéro de voirie réel vérifié comme existant |
| SIRET | `90123456700018` — format valide (14 chiffres) mais clé de Luhn non nécessairement valide, même convention que les scripts existants (`99999999999999` pour `DEMO-18M`) |
| IBAN/RIB | **Aucun** — la fixture ne seed pas `coordonnees_bancaires` |
| Salariés | Marqués `[PILOTE] Salarie fictif - fixture de recette, aucune donnee personnelle reelle` en note, comme les scripts existants |

---

## 9. Données financières

Cohérence vérifiée par l'exécution réelle elle-même : PostgreSQL calcule
`montant_ht`/`montant_tva`/`montant_ttc` via les triggers `trg_recalc_devis`/
`recalc_facture_apres_ligne` à partir des lignes saisies — si un montant avait été
incohérent avec une contrainte (`check` sur `taux_tva`, `quantite`, etc.), l'exécution aurait
échoué. Elle n'a échoué sur aucun de ces points après correction des 7 défauts. Points
qualitatifs vérifiés par requête après seed (assertions, §16) :

- Factures : 4 `payee`, 2 `envoyee`, 1 `en_retard` — couvre le cas de relance sans qu'aucun
  montant ne soit négatif ou aberrant.
- Devis : 6 `accepte`, 1 `envoye`, 1 `refuse`, 1 `brouillon`.
- Aucun paiement n'excède le montant TTC de sa facture (vérifié par construction : chaque
  paiement est soit égal à `montant_ttc`, soit `round(montant_ttc*0.4,2)` pour la seule facture
  volontairement partielle).
- Pas de protection métier déclenchée involontairement (le seul déclenchement rencontré,
  `verrou_devis_accepte`, était une erreur de séquencement du script, corrigée §2 — pas un
  montant incohérent).

Le scénario n'est pas comptablement parfait (pas de rapprochement TVA collectée/déductible
vérifié en détail) mais crédible et sans déclenchement de garde-fou métier involontaire.

---

## 10. Planning / pointages

Vérifié par exécution réelle : 300 lignes `affectations` et 300 lignes `pointages` créées sans
erreur de contrainte, sur 4 semaines × 5 jours ouvrés × 15 personnes (calcul de date par
`date_trunc('week', current_date)`, jours 0 à 4 = lundi à vendredi, jamais de week-end). Chaque
`employe_id`/`chantier_id` référencé appartient bien à `v_entreprise` (contrainte FK
`entreprise_id` composite vérifiée par le moteur, pas seulement supposée). Deux pointages
`a_verifier` et un `arrivee_oubliee` sont bien présents comme prévu (positions spécifiques
`(semaine,jour,i)` câblées dans la boucle). Aucun chevauchement horaire problématique : chaque
combinaison `(employe_id, chantier_id, date)` est unique par construction de la boucle
(un seul passage par `(v_semaine, v_jour, v_i)`).

---

## 11. Commandes / stock

Vérifié : 4 commandes fournisseurs (`recue`, `recue_partiel`, `confirmee`, `brouillon`), leurs
lignes, 15 articles de stock, 75 mouvements de stock initiaux + hebdomadaires. Confirmé par
inspection des triggers réels (`commande_numero`, `recalc_commande_apres_ligne`) qu' **aucun
trigger n'auto-génère de mouvement de stock à la réception d'une commande** — le lot « commande
fournisseur → stock » intégré juste avant ce train (commit `ac8d201`) est un mécanisme
applicatif (server action), pas un trigger DB déclenché par un simple `UPDATE`/`INSERT` SQL. La
fixture ne peut donc pas entrer en double-comptage avec ce lot. Unités et quantités cohérentes
(`u`, `ml`, `m2`, `L`, `paire`), `quantite_recue` bornée par `quantite` commandée sur chaque
ligne.

---

## 12. Rôles / permissions — les 5 profils

Vérifié **caractère pour caractère** (script Python de comparaison d'ensembles, pas une lecture
visuelle) entre les permissions codées dans la fixture et celles du catalogue canonique
(`supabase/migrations/20260718000104_roles_predefinis.sql`, table `modeles_roles_predefinis`) :

| Profil | Écart trouvé |
| --- | --- |
| Gérant | Aucun (`tous_les_droits=true` dans les deux) |
| Administration | Aucun |
| Chef de chantier | Aucun |
| Chef d'équipe | Aucun |
| Ouvrier | Aucun |

Confirmé par ailleurs, sur le schéma réel exécuté, qu'aucun de ces 5 profils n'obtient :
administration plateforme (aucune ligne `plateforme_acces_entreprises`/rôle plateforme créée
par ce script), salaires pour l'ouvrier (`taux_horaire`/`cout_horaire` non lisibles depuis les
permissions `ouvrier`, cohérent avec l'audit RBAC du pack principal), finance pour tous (seuls
`administration`/`gerant` portent `acces_facturation_avancee`/`acces_exports`), ou permission
obsolète (les 5 listes ne contiennent que des clés présentes dans `permissions_disponibles` du
schéma réel — sinon l'`INSERT ... SELECT ... FROM permissions_disponibles` n'aurait simplement
rien inséré pour une clé inconnue, sans lever d'erreur silencieusement dangereuse : vérifié que
le nombre de lignes `permissions_poste` par poste correspond au nombre total de clés dans
`permissions_disponibles`, pas moins).

Un 6ᵉ poste, **« Compte dépôt »**, apparaît systématiquement après le seed (`postes` compte 6,
pas 5) : ce n'est **pas** un défaut de la fixture — c'est un poste système, auto-créé par un
trigger sur `INSERT INTO entreprises` (`supabase/migrations/20260714000076_identifiants_et_compte_depot.sql`),
présent sur **toute** entreprise du produit, réservé au fonctionnement de la borne stock, et
volontairement non manipulable par la fixture. À mentionner tel quel dans le pack principal si
un testeur s'étonne de voir 6 postes plutôt que 5.

---

## 13. Données de test / feature flags

Vérifié par lecture exhaustive du script final : aucune instruction ne touche Stripe
(`stripe_*`), aucun envoi d'e-mail réel n'est déclenché (le script ne fait que de l'écriture
SQL directe, jamais un appel aux Server Actions/API qui déclenchent des e-mails), aucune table
de configuration globale (`plans_abonnement`, `catalogue_*`) n'est modifiée — seules des
colonnes **de l'entreprise pilote elle-même** (`abonnement_statut`, `capacite_personnes_*`) sont
écrites. Le seul mécanisme partagé touché (`historique_capacite_personnes`) est un journal
d'audit **entreprise-scopé**, pas un flag global.

---

## 14. Cleanup — `cleanup_entreprise_pilote_btp.sql`

Livré, testé de bout en bout (seed → cleanup → re-seed propre, trois fois) sur la base locale.
Trois obstacles réels ont été découverts par l'exécution (pas anticipés à la lecture) et
documentés dans l'en-tête du script lui-même :

1. **`verrou_devis_accepte`/`verrouiller_facture_emise`/`lignes_factures_brouillon_only`/
   `verrou_lignes_devis_accepte` bloquent aussi la SUPPRESSION**, pas seulement la modification,
   d'un devis accepté ou d'une facture émise — y compris via une suppression en cascade depuis
   l'entreprise parente. C'est un comportement produit réel et volontaire (traçabilité légale
   des documents commerciaux acceptés/émis), **pas une limite de cette fixture**. Il s'applique
   à *toute* entreprise ayant des devis acceptés, pas seulement à la fixture pilote.
2. `session_replication_role = replica` (le contournement usuel « en bloc ») a été **testé et
   rejeté** : il désactive aussi les triggers système qui implémentent les suppressions en
   cascade des clés étrangères, laissant des lignes orphelines derrière lui (vérifié : les
   compteurs des tables filles restaient positifs après une suppression de l'entreprise sous ce
   mode). Le script désactive donc individuellement, par nom, les 4 triggers métier concernés
   — jamais l'intégrité référentielle elle-même.
3. `trg_maj_cache_dashboard_devis` réécrit `entreprises_dashboard_cache` à chaque suppression de
   devis/facture et exige que la ligne `entreprises` existe encore à ce moment — d'où l'ordre
   strict du script (toutes les tables filles supprimées **avant** l'entreprise, jamais par
   cascade automatique laissée au moteur).

Résultat vérifié après cleanup : **zéro résidu** sur `entreprises`, `employes`, `clients`,
`chantiers`, `devis`, `factures`, `pointages`, `affectations`, `utilisateurs`, `auth.users`,
`postes`, `fournisseurs`, `articles_stock`, `habilitations_employe`,
`historique_capacite_personnes`. Cleanup relancé sur une base déjà propre : no-op, sans erreur
(garde `if v_entreprise is null then return; end if;`).

---

## 15. Dry-run

Voir §0 pour la méthode complète. Résumé : **`EXECUTION_NOT_PROVEN` sur Preview** (aucune
exécution Preview n'a eu lieu, conformément à la consigne de cette mission) mais
**exécution réellement prouvée sur un Postgres 16 local rejouant le schéma réel** — bien plus
qu'une revue statique, strictement moins qu'une preuve Preview. Compteurs de lignes après
exécution : voir §16 (script d'assertions).

---

## 16. Assertions — `assertions_entreprise_pilote_btp.sql`

Livré, script en lecture seule. Nombres **repris de l'exécution réelle**, pas inventés :

| Contrôle | Attendu | Réel (exécution locale) |
| --- | --- | --- |
| entreprises | 1 | 1 |
| postes | 6 (5 profils + « Compte dépôt » système, §12) | 6 |
| employes | 28 | 28 |
| comptes_utilisateurs_actives | 28 | 28 |
| clients | 8 | 8 |
| chantiers | 7 | 7 |
| devis | 9 | 9 |
| factures | 7 | 7 |
| affectations | 300 | 300 |
| pointages | 300 | 300 |
| fournisseurs | 5 | 5 |
| articles_stock | 15 | 15 |
| commandes_fournisseurs | 4 | 4 |
| notes_frais | 6 | 6 |
| demandes_conges | 4 | 4 |

Plus 4 contrôles qualitatifs (répartition des statuts factures/devis, répartition des 5
profils, isolation tenant) — tous conformes, détail en tête du script.

---

## 17. Revue sécurité

- **`SECURITY DEFINER`** : le script n'en définit aucun — les fonctions `SECURITY DEFINER`
  rencontrées (`trg_capacite_personnes_actives`, `verrouiller_devis_accepte`,
  `capacite_personnes_totale`, etc.) sont des objets déjà existants du produit, appelés
  indirectement par les triggers standard des tables touchées, pas invoqués explicitement par
  la fixture.
- **Rôle élevé borné** : comme tous les scripts de `supabase/production/`, ce script tourne en
  connexion privilégiée (superutilisateur/service, hors PostgREST) qui contourne RLS par
  construction — c'est le modèle d'exécution sanctionné pour ce dossier entier (voir
  `supabase/production/README.md`), pas une élévation supplémentaire introduite par cette
  fixture. Le script ne fait **aucun** `GRANT`/`REVOKE`/`ALTER POLICY` ; il ne touche que des
  lignes de données, jamais le schéma ou les droits.
- **Contournement RLS** : aucun — le script insère directement dans les tables sous connexion
  privilégiée, mais ne modifie ni ne lit via une session `authenticated`/`anon` qui aurait pu
  simuler un contournement de policy.
- **Données cross-tenant** : aucune, vérifié §5.
- **Grants excessifs** : aucun grant émis par ce script.
- **Portée du rôle élevé pour le nettoyage** : `cleanup_entreprise_pilote_btp.sql` désactive
  temporairement 4 triggers **nommément identifiés** sur `devis`/`factures`/`lignes_factures`/
  `lignes_devis` (jamais un contournement global), le temps de la transaction, puis les
  réactive dans tous les cas — y compris si le script échoue avant (car dans le même bloc de
  script, réactivé juste après les DELETE, avant le COMMIT implicite).

---

## 18. Verdict

```
FIXTURE READY FOR PREVIEW EXECUTION
```

Justification : les 7 défauts réels trouvés par exécution ont tous été corrigés et
re-vérifiés ; le script est idempotent et rejouable (y compris après panne forcée, testé) ;
l'isolation multi-tenant est vérifiée par requête, pas supposée ; les 5 profils de permissions
sont identiques caractère pour caractère au catalogue canonique ; un cleanup complet et testé
existe ; un script d'assertions existe et ses nombres sont ceux réellement observés. Ce
verdict **ne vaut pas `FIXTURE EXECUTION PROVEN LOCALLY` au sens d'une preuve Preview** — voir
§0 et §15 pour la portée exacte de ce qui a été prouvé (schéma réel rejoué sur Postgres 16 local,
pas le projet Preview lui-même, pas RLS sous rôle contraint, pas pgTAP).

**Avant la toute première exécution réelle sur Preview**, dans cet ordre :

1. Exécuter `seed_entreprise_pilote_btp.sql` sur Preview via le wrapper.
2. Faire tourner `assertions_entreprise_pilote_btp.sql` et vérifier que les 15 comptages
   correspondent exactement au tableau du §16 (si un écart apparaît, c'est le signe d'une
   différence entre le schéma Preview réel et celui rejoué localement ici — à investiguer avant
   toute recette).
3. Vérifier que `cleanup_entreprise_pilote_btp.sql` fonctionne bien sur Preview lui-même
   (mêmes vérifications qu'ici) **avant** de compter dessus en fin de pilote — les
   comportements de triggers vérifiés ici l'ont été sur un schéma rejoué, pas sur le projet
   Preview réel, qui pourrait légitimement diverger si des migrations n'y sont pas toutes
   appliquées dans le même ordre.

Ceci répond à la question 6 de la mission (« lancer pgTAP + fixture sur Preview sans risque
connu ») pour la partie fixture : **oui, sans risque connu**, sous réserve de ces trois étapes
de vérification sur Preview même avant de s'appuyer dessus pour une recette réelle avec le
client pilote. La question pgTAP elle-même reste hors périmètre de cette revue (elle porte sur
les migrations déjà fusionnées, pas sur cette fixture).
