# ELSATIA — Employee Personal Data Access Hardening (V1)

| | |
|---|---|
| Date | 2026-09-28 |
| Base | `integration/elsatia-canonical-train-v6` @ `9102ec80` (verdict `CANONICAL TRAIN V6 LOCALLY QUALIFIED`, 358 migrations) — **non modifiée** |
| Branche | `claude/magical-ritchie-36kz4o` (repartie de V6, commits de cette mission uniquement) |
| Migration | **1 nouvelle** : `20260928000701_employes_donnees_personnelles_acces_v1.sql` → train **359**, dernière `20260928000701` |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3 (amorce `scripts/local-postgres-bootstrap`, sans Docker) ; **PostgREST v12.2.3 réel** (binaire officiel) ; Node 22 ; Next.js 16.3.5 compilé ; Playwright 1.62.1 + Chromium 1194 |
| Actions distantes | **Aucune.** Aucune Preview, aucune Production, aucun merge. |

## 0. Verdict

**`ELSATIA EMPLOYEE DATA ACCESS LOCALLY QUALIFIED`**

Sur V6, tout membre actif d'une entreprise lisait, par simple appel REST, l'email, le téléphone,
les notes libres, le numéro d'inscription (secret d'activation), le **hash bcrypt du code stock**,
la carte BTP et le chemin de signature de **tous** ses collègues. Il pouvait aussi écrire des
habilitations, un coût interne et un taux facturé. L'export RGPD d'entreprise donnait au rôle
« Administration » la paie (NIR), le RIB et les notes RH, que ses écrans lui refusent.

La correction se fait **en base**, avec le RBAC existant (`acces_employes`, `gerer_employes`,
permissions de paie et de banque) et sans nouveau système de droits :

- privilèges de **colonne** PostgreSQL sur `employes` : l'annuaire reste lisible, 13 colonnes
  sensibles sont fermées ;
- vue **`employes_fiche`**, filtrée par ligne et masquée par colonne selon les permissions ;
- écritures sur les habilitations, le coût et le taux réservées à `gerer_employes` ;
- export RGPD **filtré par section**, les sections retirées étant déclarées.

L'isolation entre entreprises reste bloquée, l'accès au sein d'une entreprise est réduit au besoin, et les usages admin légitimes fonctionnent.
Preuves : pgTAP **rouge 43/65 sur V6 → vert 65/65**, suite complète **sans nouvelle régression**,
**PostgREST réel 24/24** avant/après, Playwright **15/15 (×2)** sur les écrans concernés, preuve
« avant » navigateur sur V6, DB verify **contrôle 30** (rouge V6 → vert), upgrade en place idempotent.

---

## 1. Inventaire des données salarié

Source : schéma réel après 358 migrations (`\d public.employes`, `information_schema`, `pg_policies`)
et inventaire applicatif exhaustif (~110 accès `employes` dans `src/` ; aucun dans `apps/*`, qui
passent par des RPC ; tous via le client utilisateur, aucun via `service_role`).

| Donnée | Où | Colonne(s) / table |
|---|---|---|
| Nom, prénom | `employes` | `prenom`, `nom` |
| Fonction, poste d'accès | `employes` | `poste`, `poste_id` |
| Email, téléphone | `employes` | `email`, `telephone` |
| Adresse, date/lieu de naissance, NIR, contact d'urgence, titre de séjour | `profils_paie_employes` | `adresse`, `date_naissance`, `lieu_naissance`, `numero_securite_sociale`, `contact_urgence_*`, `titre_sejour*` |
| Notes libres | `employes` | `notes` ; `profils_paie_employes.remarques_confidentielles` |
| Contrat | `employes` | `type_contrat`, `date_entree`, `date_sortie` ; `profils_paie_employes` (classification, coefficient, durée…) |
| Salaire, coût, taux | `profils_paie_employes` (`salaire_*`), `employes_cout_horaire`, `employes_taux_facture` |
| RIB | `coordonnees_bancaires` (`iban_chiffre` AES-256-GCM, `iban_hash`, `iban_quatre_derniers`, `bic_chiffre`, `titulaire`) ; `ordres_virements` (`iban_chiffre`) |
| Documents | `employes.carte_btp_*` (fichier + n° + expiration) ; bucket `documents-employes` ; `pieces_jointes_paie`, `bulletins_paie` (bucket `documents-paie` / `bulletins-paie`) |
| Pointages | `pointages`, `sessions_pointage`, `verifications_zone_pointage` |
| Absences | `demandes_conges`, `absences_paie` |
| Paie | `dossiers_paie_salaries` + variables (`primes_paie`, `deductions_paie`, `temps_travail_paie`, `indemnites_deplacement_paie`, `regularisations_paie`, `anomalies_paie`, `validations_paie`), `periodes_paie`, `bulletins_paie`, `journal_audit_paie` |
| Habilitations | `habilitations_employe` (`type`, `libelle`, `date_obtention`, `date_expiration`) |
| Signature | `employes.signature_storage_path`, `signature_at` ; `signatures_documents` (copies signées) |
| Photo | `employes.photo_*` |
| Secrets / technique | `numero_inscription` (code d'activation du compte), `identifiant_interne` (identifiant borne), `code_stock_hash` (bcrypt du mot de passe borne), `code_stock_active`, `utilisateur_id` |
| Suivi du compte | `compte_active_at`, `invitation_*`, `application_installee_at`, `premiere/derniere_connexion_at`, `compte_application_*` |
| Autres | notes de frais (`notes_frais` + documents), grands déplacements, véhicules/outils affectés, messagerie interne |

## 2. Classification

Classification opérationnelle (sensibilité d'accès), **pas une qualification juridique**. Le
caractère « donnée sensible » au sens de l'art. 9 RGPD n'est pas tranché ici.

| Classe | Champs |
|---|---|
| **BASIC_DIRECTORY** | `id`, `entreprise_id`, `prenom`, `nom`, `poste`, `poste_id`, `statut`, `reference_interne`, `photo_*`, `anonymise_at`, `created_at`, `updated_at` |
| **OPERATIONAL** | `email`, `telephone` (coordonnées de travail), `carte_btp_numero`, `carte_btp_expiration`, `identifiant_interne`, `habilitations_employe`, `type_contrat`, `date_entree`, `date_sortie`, pointages de l'équipe, planning/affectations, métadonnées de `signatures_documents` |
| **HR_PRIVATE** | `profils_paie_employes` (adresse, naissance, NIR, contact d'urgence, titre de séjour), `demandes_conges` d'autrui |
| **PAYROLL_PRIVATE** | `employes_cout_horaire`, `employes_taux_facture`, salaires, dossiers, bulletins et variables de paie |
| **BANKING_PRIVATE** | `coordonnees_bancaires`, `ordres_virements`, `lots_virements`, `connexions_bancaires`, `journal_paiements_bancaires` |
| **DOCUMENT_PRIVATE** | fichiers de carte BTP (`carte_btp_storage_path/nom/mime/taille`), `signature_storage_path`, `pieces_jointes_paie`, fichiers de bulletins |
| **MANAGER_NOTE** | `employes.notes`, `profils_paie_employes.remarques_confidentielles`, `dossiers_paie_salaries.commentaire_comptable` |
| **TECHNICAL** | `numero_inscription` (secret), `code_stock_hash` (secret), `utilisateur_id`, `code_stock_active/modifie_at`, suivi du compte (`invitation_*`, `*_connexion_at`, `compte_application_*`) |

## 3. Rôles et permissions réels

Il n'y a pas de rôle codé en dur. Les droits passent par `permissions_poste` et
`a_permission(entreprise, clé)`, ce dernier étant vrai aussi pendant une session de support
plateforme active. Chaque entreprise reçoit **9 postes canoniques** (`modeles_roles_predefinis`),
modifiables ensuite. Les permissions utiles ici, valeurs lues dans la base 359 :

| Poste canonique | acces_employes | gerer_employes | voir_cout_interne | acces_rentabilite | voir_taux_facture | gerer_paie | voir_paie_confid. | gerer_coord_bancaires | valider_virements | acces_paiements_bancaires | gerer_parametres |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Ouvrier | · | · | · | · | · | · | · | · | · | · | · |
| Chef d'équipe | · | · | · | · | · | · | · | · | · | · | · |
| Chef de chantier | ✔ | · | · | · | · | · | · | · | · | · | · |
| Conducteur de travaux | ✔ | · | · | ✔ | · | · | · | · | · | · | · |
| Directeur travaux | ✔ | ✔ | · | ✔ | · | · | · | · | ✔ | ✔ | · |
| Administration | ✔ | · | · | · | · | · | · | · | · | · | ✔ |
| RH | ✔ | ✔ | · | · | · | ✔ | · | ✔ | · | ✔ | · |
| Comptable | ✔ | · | · | ✔ | · | ✔ | · | ✔ | ✔ | ✔ | · |
| Gérant | ✔ (tous les droits) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

Tout ce qui suit s'appuie sur ces permissions : `acces_employes` ouvre le module Employés,
`gerer_employes` sert à gérer les fiches, et les permissions de paie et de banque sont celles
déjà en place. La mission n'ajoute **aucune permission et aucun rôle**. Elle n'utilise pas non
plus les clés `creer_employe`, `modifier_employe` et `desactiver_employe` : elles figurent au
catalogue, mais aucune policy ne les lit.

## 4. Avant (V6 @ 9102ec80)

| Chemin | Constat reproduit |
|---|---|
| `GET /rest/v1/employes?select=email,notes` (ouvrier) | **200**, email privé et note RH d'une collègue (PostgREST réel, §9 ; navigateur, §10) |
| `select=*` (ouvrier) | **200**, `numero_inscription`, `code_stock_hash` (`$2a$…`), carte BTP, signature |
| `POST /habilitations_employe`, `/employes_cout_horaire`, `/employes_taux_facture` (ouvrier) | **201** : un ouvrier peut s'ajouter une habilitation ou modifier un coût. Il peut aussi supprimer l'habilitation d'un collègue |
| `rpc/exporter_donnees_entreprise` (Administration) | **200** avec `profils_paie_employes` (NIR), `coordonnees_bancaires`, `employes_cout_horaire` et les notes RH |
| Manifeste de fichiers de l'export | liste les bulletins de paie et les cartes BTP à ce même rôle |
| Déjà correct en V6 (non-régression vérifiée) | écriture de la fiche `employes` (`role_gestion_*` → `gerer_employes`), paie/NIR (`voir_paie_confidentielle` ou `gerer_paie`), RIB, bulletins, storage des cartes/signatures (`gerer_employes` ou soi), inter-tenant |

Ce point était déjà noté **OUVERT** dans
`20260922000312_gp_pilot_employes_annuaire_vue_restreinte.sql`. La vue `employes_annuaire` avait été
ajoutée, mais la table elle-même n'avait jamais été fermée.

## 5. Correctif (`20260928000701`)

1. **Privilèges de colonne** : `revoke select on employes from anon, authenticated`, puis
   `grant select (<32 colonnes d'annuaire, opérationnelles et de suivi>)`. Les **13 colonnes
   fermées** en lecture directe sont `email`, `telephone`, `notes`, `numero_inscription`,
   `identifiant_interne`, `code_stock_hash`, `carte_btp_storage_path`, `carte_btp_nom`,
   `carte_btp_mime_type`, `carte_btp_taille_octets`, `carte_btp_numero`, `carte_btp_expiration` et
   `signature_storage_path`.
   - Les droits INSERT/UPDATE ne changent pas : les écritures restent gardées par `role_gestion_*`.
   - Les embeds `employe:employes(id,prenom,nom,…)`, les filtres `utilisateur_id` et les
     `count(*)` fonctionnent toujours.
   - Une **future colonne est fermée par défaut**, puisqu'il n'y a plus de grant de table.
2. **Vue `employes_fiche`** (`security_barrier`, droits du propriétaire, filtre explicite) :
   - **ligne** visible si l'appelant est membre actif de l'entreprise **et** a `acces_employes`,
     `gerer_employes`, ou regarde **sa propre fiche** ;
   - `notes` : visible seulement avec `gerer_employes` ;
   - `numero_inscription`, fichiers de carte BTP et `signature_storage_path` : `gerer_employes` ou soi-même ;
   - `code_stock_hash` : **jamais exposé** ;
   - accès : `authenticated` seulement (anon → 401).
3. **Écritures** sur `habilitations_employe`, `employes_cout_horaire` et `employes_taux_facture` :
   policies RESTRICTIVE `role_gestion_insert/update/delete` qui exigent `gerer_employes`. C'est le
   mécanisme de `20260713000043`, aligné sur les Server Actions.
4. **Export RGPD** (`exporter_donnees_entreprise`) :
   - `export_rgpd_section_autorisee(entreprise, table)` reprend les policies SELECT des tables
     paie, banque, coût et taux ;
   - une section non lisible est retirée et listée dans `sections_restreintes`, et le journal
     `journal_activite` la mentionne ;
   - sans `gerer_employes`, l'export `employes` perd les 12 colonnes privées, mais l'annuaire reste
     présent pour la portabilité ;
   - le manifeste de fichiers est filtré selon la même règle.
5. **`employes_annuaire`** reste la projection minimale d'annuaire, sans changement de colonnes.
   Ses colonnes sont toutes accordées.
6. **DB verify Preview, contrôle 30** (`docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`) :
   aucune colonne sensible lisible, `employes_fiche` fermée à anon, export filtré. Il est rouge sur
   V6 (« 9 colonnes sensibles lisibles, employes_fiche ABSENTE, export NON filtré ») et vert après
   correctif. Les attendus du train ont été régénérés (`sync:train-expectations` : 359 migrations,
   30 contrôles).

## 6. Matrice d'accès après correctif (champ × rôle × action)

Légende : **R** = lecture, **W** = écriture, **E** = export RGPD d'entreprise, **D** = suppression ; ✔ autorisé, ✖ refusé
**par la base**, « soi » = uniquement sa propre fiche. Les rôles sont les postes canoniques (§3). Un poste
personnalisé suit ses permissions.

### READ

| Champ / donnée | Ouvrier | Chef d'équipe | Chef chantier / Conducteur | Administration | Comptable | RH / Directeur travaux | Gérant |
|---|---|---|---|---|---|---|---|
| BASIC_DIRECTORY (nom, prénom, fonction, statut, photo) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| email, téléphone | soi | soi | ✔ (fiche) | ✔ (fiche) | ✔ (fiche) | ✔ | ✔ |
| n° / validité carte BTP, identifiant interne | soi | soi | ✔ (fiche) | ✔ (fiche) | ✔ (fiche) | ✔ | ✔ |
| fichier carte BTP, signature | soi | soi | ✖ | ✖ | ✖ | ✔ | ✔ |
| numéro d'inscription | soi | soi | ✖ | ✖ | ✖ | ✔ | ✔ |
| **notes RH** (MANAGER_NOTE) | ✖ (même soi) | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ |
| code_stock_hash | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ (RPC internes seulement) |
| habilitations | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| type de contrat, dates d'entrée/sortie | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| coût interne | ✖ | ✖ | ✖ / ✔ (conducteur : `acces_rentabilite`) | ✖ | ✔ | ✖ / ✔ (DT) | ✔ |
| taux facturé | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✔ |
| profil de paie (NIR, adresse, naissance) | soi | soi | ✖ | ✖ | ✔ (`gerer_paie`) | ✔ RH / ✖ DT | ✔ |
| RIB | ✖ | ✖ | ✖ | ✖ | ✔ | ✔ RH / ✔ DT (`valider_virements`) | ✔ |
| bulletins, dossiers de paie | soi | soi | ✖ | ✖ | ✔ | ✔ RH / ✖ DT | ✔ |
| inter-entreprises (toute donnée d'une autre entreprise) | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ | ✖ |

### WRITE / DELETE

| Donnée | Qui (base) |
|---|---|
| fiche `employes` (toutes colonnes, y compris notes et coordonnées), suppression | `gerer_employes` (inchangé, `role_gestion_*`) |
| `habilitations_employe` (W/D) | `gerer_employes` (**nouveau** ; V6 : tout membre) |
| `employes_cout_horaire`, `employes_taux_facture` (W/D) | `gerer_employes` (**nouveau** ; V6 : tout membre) |
| profil de paie, pièces de paie | `gerer_paie` (inchangé) |
| RIB | RPC dédiée (`gerer_coordonnees_bancaires`), inchangé |
| anonymisation RGPD d'un salarié | `anonymiser_employe` → `gerer_employes` (inchangé ; efface toujours les notes, qui restent sur `employes`) |

### EXPORT

| Export | Garde | Contenu salarié |
|---|---|---|
| RGPD d'entreprise (`/api/rgpd/export` → `exporter_donnees_entreprise`) | `gerer_parametres` | **filtré par section** (§5.4) ; Administration : annuaire sans colonnes privées, sans paie, RIB, coût ni notes ; Gérant : complet |
| Paie CSV/XLSX/ZIP (`/api/paie/periodes/[id]/export`) | droits paie | `prenom`, `nom`, `reference_interne`, `poste` : colonnes d'annuaire, **inchangé** |
| Impression paie (`/imprimer/paie/[id]`) | droits paie | idem, inchangé |
| Export notes de frais | droits notes de frais | `prenom`, `nom`, inchangé |
| PDF Réserves (`reserves_export_intervenants`) | Réserves | entreprises intervenantes, **aucune donnée salarié** |
| Export annuaire plateforme | admin plateforme | entreprises, aucune donnée salarié |

Aucun export ne lit une colonne fermée via le client utilisateur. Une tentative échouerait avec
42501 au lieu de contourner la restriction.

## 7. Notes managériales (§8)

- `employes.notes` n'apparaît dans aucune liste métier : les listes et embeds ne sélectionnent
  que l'annuaire. Elle ne s'affiche que sur la fiche détaillée, et seulement avec `gerer_employes`.
  La ligne « Notes » est désormais masquée côté écran aussi.
- Le salarié concerné ne voit pas la note dans l'application. Son droit d'accès passe par la
  procédure RGPD.
- `garantir_fiche_pointage_courante` (SECURITY DEFINER) écrit toujours une note technique à la
  création d'une fiche. Elle n'est pas affectée.
- `profils_paie_employes.remarques_confidentielles` est déjà restreint à la paie (inchangé).

## 8. Données bancaires (§9)

- Chiffrement **AES-256-GCM** côté serveur (`src/lib/banking.ts`), avec une clé hors base. La base
  ne stocke que `iban_chiffre`, `iban_hash` (recherche) et `iban_quatre_derniers`.
- **Un seul chemin de déchiffrement** : `transmettreLotPowensAction` (`paiements-bancaires.ts`),
  côté serveur, au moment de transmettre un lot.
- Lecture : `coordonnees_bancaires` avec `gerer_coordonnees_bancaires` ou `valider_virements` ;
  `ordres_virements` avec `acces_paiements_bancaires`. Inchangé et vérifié (chef de chantier : 0 ligne).
- Seul nouveau fait : l'export RGPD n'inclut plus le RIB chiffré pour un appelant qui ne peut pas le lire.
- Audit cryptographique complet : **non refait** (hors mission).

## 9. Preuves

### 9.1 pgTAP — rouge sur V6, vert après correctif

`supabase/tests/employes_donnees_personnelles_acces_v1.test.sql` (65 assertions) utilise le décor
`fixtures/employes_donnees_personnelles.inc` :

- deux entreprises ;
- des postes créés par les **vrais modèles canoniques** : gérant, RH, comptable, administration,
  chef de chantier, chef d'équipe, ouvrier (A) ; gérant et ouvrier (B) ;
- une salariée « Victime » porteuse de toutes les données sensibles, avec NIR, RIB, coût, taux
  et habilitation.

Chaque requête s'exécute sous `set local role authenticated` avec les claims JWT, comme le fait
PostgREST. La sonde `edp_val()` garde le fichier exécutable même sur V6.

| Base | Résultat |
|---|---|
| V6 (358) | **43/65 en échec** (5-20, 24-25, 27-38, 40, 45-46, 50-54, 56, 62-65). Seules les non-régressions passent (annuaire, écriture de fiche, export refusé à l'ouvrier, inter-tenant) |
| V6 + 701 | **65/65** |
| Base neuve 359 (`rebuild_db.sh`) | **65/65** |

### 9.2 Suite pgTAP complète

| Base | Fichiers | Tests | Échecs |
|---|---|---|---|
| V6 (référence) | 152 | 4 471 | **9 fichiers** : `platform_stripe_state_attestation_r72` (pgsodium réel absent), `studio_*` ×7 (projet Studio dédié), `elsatia_tools_cloud_sync_entitlement_closure_v1` (sortie 3 sans échec). Identique au rapport V6 (143/152 propres) |
| V6 + 701 | 153 | 4 536 | **les 9 mêmes**, 0 nouveau |
| Neuve 359 | 153 | 4 536 | **les 9 mêmes**, 0 nouveau |

`securiser_taux_horaire_facture_employe` passe toujours. Son assertion 6 (« un membre actif peut
écrire ») s'exécute en fait sous l'administrateur A, qui a toutes les permissions. Elle reste
donc vraie avec la nouvelle policy. Son libellé est trompeur ; le fichier n'a pas été touché.

### 9.3 PostgREST réel (REST direct, `select=*`, embed, vue, PATCH, POST, RPC)

`scripts/qualification/employes-donnees-personnelles-http.sh <base-V6> <postgrest>` construit deux
bases, V6 et V6 + 701, avec le décor committé. Il lance ensuite **PostgREST v12.2.3** sur chacune
et rejoue 24 scénarios HTTP avec des JWT HS256 signés.

| Attendu | Résultat |
|---|---|
| « v6 » (fuite reproduite : email, notes, `$2a$…`, `select=*`, écritures ouvrier 201, export Administration complet) | **24/24 conformes** |
| « corrige » (403/42501 sur colonnes privées et `select=*`, annuaire et embeds 200, `employes_fiche` filtrée et masquée, embed `employes_fiche → postes` 200, PATCH RH 204, `POST employes?select=id` 201 sans colonne privée renvoyée, écritures ouvrier 403, export Administration filtré, Gérant complet, B ↔ A 0, anon 401) | **24/24 conformes** |

### 9.4 API, routes et Server Actions

Toutes les routes et Server Actions utilisent le client utilisateur. Elles passent donc exactement
par les chemins PostgREST ci-dessus, et les écrans du §10 les exercent en vrai :

- création et modification de fiche (`creerEmployeAction`, `modifierEmployeAction`) ;
- carte BTP, photo, signature (`/api/employes/[id]/*`, `/api/mon-espace/carte-btp`) ;
- anonymisation (`rgpd.ts`) ;
- signature de documents (`signatures-documents.ts`) ;
- export RGPD (`/api/rgpd/export`).

La sonde RLS du DB verify Preview (`db-verify.mjs`, `count(*)` sous `authenticated`) reste
fonctionnelle : 0 ligne hors tenant, 8 visibles.

### 9.5 Upgrade en place et idempotence

La migration 701 a été appliquée **deux fois** sur deux bases V6 peuplées : `iso_v6` (décor
d'isolation) et `edp_e2e_v6` (décor de la mission). Résultat :

- 0 erreur ;
- empreinte md5 de `employes` identique avant et après (aucune donnée modifiée) ;
- privilèges de colonne, policies, vue et fonctions **identiques** à une base neuve 359
  (empreinte commune `25ab792d…`).

## 10. Écrans impactés (rétrocompatibilité)

Les écrans qui lisent une colonne désormais fermée ont été **migrés vers `employes_fiche`**. Aucune
casse silencieuse : une lecture oubliée échouerait en 42501, pas avec une valeur vide.

| Écran / chemin | Lecture avant | Après | Comportement |
|---|---|---|---|
| `/employes` (liste) | `employes` + email, téléphone, n° d'inscription | `employes_fiche` | identique pour `acces_employes` ; n° d'inscription non affiché ici |
| `/employes/[id]` | `employes select=*,postes(nom)` | `employes_fiche select=*,postes(nom)` | ligne « Notes » réservée à `gerer_employes`. Les autres sections sensibles l'étaient déjà |
| `/employes/[id]/modifier` | `employes select=*` | `employes_fiche` | `gerer_employes` seulement (inchangé), notes préremplies |
| `/employes/[id]/carte` | `employes` + coordonnées, carte BTP | `employes_fiche` | n° et validité de carte visibles. Le fichier n'était déjà pas servi hors gestionnaire/soi |
| `/mon-espace` | propre fiche | `employes_fiche` (ligne « soi ») | identique |
| `SignatureDocumentMetier` (devis, factures, interventions, commandes) | propre `signature_storage_path` | `employes_fiche` | identique |
| `signerDocumentMetierAction`, `anonymiserEmployeAction`, actions carte BTP / signature | chemins de fichiers | `employes_fiche` | identique pour leurs utilisateurs légitimes |
| `/api/employes/[id]/signature`, `/api/employes/[id]/carte-btp`, `/api/mon-espace/carte-btp` | chemins de fichiers | `employes_fiche` | identique |
| ~95 autres lectures (planning, pointage, messagerie, congés, notes de frais, paie, flotte, outillage, chantiers, dashboard, assistant IA…) | colonnes d'annuaire | **inchangées** | fonctionnent (vérifié) |
| Écritures (création, modification, import, statut, photo) | `employes` | **inchangées** | fonctionnent (PATCH et POST vérifiés) |

**Playwright** (`tests/e2e/employes-donnees-personnelles.spec.ts`) tourne sur une pile réelle
`tests/e2e/employes-pile-locale` : PostgreSQL 16 + train complet, **PostgREST réel** pour `/rest/v1`,
passerelle locale du dépôt pour l'auth, et **Gestion Pro compilé** (`next build` + `next start`).

| Passe | Résultat |
|---|---|
| Base corrigée | **15/15, deux exécutions consécutives** : `/employes` (chef de chantier), fiche d'un collègue sans note ni secret, carte BTP, 404 sur une fiche de B, fiche RH avec note puis **modification enregistrée**, `/mon-espace`, garde de route ouvrier, `/planning` `/pointage` `/messagerie` `/conges` `/notes-frais` (embeds) sans erreur, export RGPD Administration filtré, REST direct ouvrier 403 et annuaire 200 |
| Base V6 (`EDP_ATTENDU=v6`) | tests `@avant` **2/2** : la session réelle d'un ouvrier lit l'email d'un collègue (**200**) |
| Même assertion « corrigé » sur V6 | **rouge** (attendu 403, reçu 200) |

**Non-régression Playwright existante** : les specs sont rejouées sur le décor d'isolation avec
la base corrigée.

| Spec | Résultat |
|---|---|
| `isolation-rest.spec.ts` | **13/13** |
| `roles-and-direct-access.spec.ts` | **7/8** |
| `security.spec.ts` | **5/11** |

Les échecs restants n'ont **aucun lien avec les données salariés** et relèvent du harnais :

- `page.request` n'envoie pas les cookies de session `Secure` en http : 307 vers `/login` sur les
  routes `/api/assistant`, `/api/referentiels`, `/api/uuid` ;
- la MFA est obligatoire pour l'admin plateforme.

Ils n'ont **pas** été rejoués sur un build V6 : ce point est déclaré plutôt que prouvé.

**Application** : `npm run typecheck` (GP, Tools, Réserves, Colors) ✔ ; `npm run lint` ✔ (0 erreur ;
aucun avertissement sur les fichiers de la mission) ; Vitest ✔ 5 projets (§12) ; `next build` Gestion
Pro ✔ ; `verify:migrations` (359), `verify:train-expectations`, `test:preview-pack` (29/29),
`test:migration-targets` (7/7) et `verify:secrets` ✔.

## 11. Audit des lectures sensibles (§11)

Aucun nouveau système n'a été ajouté.

- Les exports sont déjà journalisés : `journal_activite` pour l'export RGPD, qui mentionne
  désormais les sections restreintes, et `journal_audit_paie` pour les exports de paie.
- Auditer chaque SELECT sur `employes_fiche` demanderait un déclencheur de lecture. PostgreSQL
  n'en offre pas ; il faudrait passer par une RPC par lecture. Ce serait disproportionné face au
  risque restant, désormais limité aux coordonnées professionnelles pour `acces_employes`.

## 12. Tests applicatifs

| Contrôle | Résultat |
|---|---|
| `npm run typecheck` (4 projets) | ✔ |
| `npm run lint` (4 projets) | ✔ (0 erreur) |
| `npm run test` — Gestion Pro | ✔ 186 fichiers, **2 300** tests (2 fichiers / 36 tests ignorés, préexistants) |
| `npm run test` — Tools / Réserves / Colors | ✔ **2 118** / **186** / **431** |
| `next build` Gestion Pro | ✔ |
| Builds Tools / Réserves / Colors | ✔ / ✔ / ✔ (Tools : `NEXT_PUBLIC_TOOLS_ENV=local`, mode prévu par sa garde pour un build de recette sur URL http) |

## 13. Risques résiduels

| # | Risque | Niveau | Traitement |
|---|---|---|---|
| R1 | Suivi du compte (`derniere_connexion_at`, `invitation_*`, `compte_application_*`) lisible par tout membre | faible (TECHNICAL) | laissé ouvert : `/plateforme` et `/abonnement` en dépendent. À fermer dans un lot dédié si le propriétaire le souhaite |
| R2 | `type_contrat`, `date_entree` et `date_sortie` lisibles par tout membre | faible | usage opérationnel (planning, apprentis) ; décision propriétaire |
| R3 | `gerer_paie` lit le profil de paie (NIR) via la policy FOR ALL `paie_profils_write` : `voir_paie_confidentielle` est en pratique inclus dans `gerer_paie` | moyen (conception) | inchangé. Un gestionnaire de paie doit lire ce qu'il saisit. L'export en tient compte. Décision propriétaire si une séparation stricte est voulue |
| R4 | Métadonnées de `signatures_documents` (nom, fonction, empreintes) lisibles par tout membre | faible | preuve de signature des documents métier. Les images ne sont pas lisibles |
| R5 | Photos lisibles par tout membre, sans consentement explicite par salarié | faible | comportement V6 conservé (« photo si autorisée » : aucun indicateur d'autorisation n'existe) |
| R6 | `employes_fiche` s'exécute avec les droits de son propriétaire : l'avertissement « security definer view » du linter Supabase est attendu | maîtrisé | filtre explicite (entreprise + permission), `security_barrier`, anon fermé, contrôle 30 |
| R7 | Session de support plateforme : `a_permission` est vraie pour tout, donc le support voit les notes | par conception | sessions de support temporaires et auditées (missions antérieures) |
| R8 | GoTrue, Storage et Kong réels non exercés (passerelle locale) | harnais | à rejouer en Preview : `/employes`, fiche, export RGPD |
| R9 | Clés de catalogue `creer_employe`, `modifier_employe` et `desactiver_employe` non appliquées en base | faible | inchangé : `gerer_employes` fait foi |

## 14. Reproduire

```bash
git checkout claude/magical-ritchie-36kz4o && npm ci
apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl && service postgresql start

# pgTAP (rouge V6 : base construite sans la migration 701 ; vert : train complet)
scripts/local-postgres-bootstrap/rebuild_db.sh fresh359
su postgres -c "psql -c 'alter database fresh359 set search_path = public, extensions'"
cd supabase/tests && su postgres -c "pg_prove -d fresh359 *.test.sql"            # 144/153, 9 échecs préexistants

# PostgREST réel (binaire officiel v12.2.3, release GitHub), bases V6 et V6+701
scripts/qualification/employes-donnees-personnelles-http.sh <base-v6-358> <chemin/postgrest>   # 24/24 ×2

# Playwright : variables PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service HS256,
# NEXT_PUBLIC_SUPABASE_URL=E2E_SUPABASE_URL=http://127.0.0.1:54321, E2E_SUPABASE_ANON_KEY,
# RATE_LIMIT_HMAC_KEY, ELSATIA_APPLICATION_ENV=local, PW_CHROME_PATH, POSTGREST_BIN
tests/e2e/employes-pile-locale/preparer-base.sh edp_e2e            # (--sans-701 → base V6)
tests/e2e/employes-pile-locale/demarrer-pile.sh edp_e2e /tmp/edp-logs
npx next build && npx next start -p 3100 &
E2E_BASE_URL=http://127.0.0.1:3100 npx playwright test tests/e2e/employes-donnees-personnelles.spec.ts --project=desktop-chromium --workers=1
```

## 15. Fichiers

- `supabase/migrations/20260928000701_employes_donnees_personnelles_acces_v1.sql` (nouveau)
- `supabase/tests/employes_donnees_personnelles_acces_v1.test.sql`, `supabase/tests/fixtures/employes_donnees_personnelles.inc` (nouveaux)
- `scripts/qualification/employes-donnees-personnelles-http.{sh,mjs}` (nouveaux)
- `tests/e2e/employes-donnees-personnelles.spec.ts`, `tests/e2e/employes-pile-locale/{preparer-base.sh,demarrer-pile.sh,routeur.mjs}` (nouveaux)
- 12 fichiers applicatifs : lectures basculées vers `employes_fiche` (§10)
- `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` (contrôle 30), pack et runbook Preview (attendus régénérés : 359 / 30)

## Annexe A — Scénarios PostgREST réels (sortie brute, base V6 puis V6 + 701)

```text
== PostgREST PostgREST 12.2.3 sur v6_base_edp_v6 (attendu : v6) ==
OK     | ouvrier GET employes?select=prenom,nom (annuaire) | observé: 200 Victime
OK     | ouvrier GET employes?select=email (REST direct) | observé: 200 victime.privee@edp.invalid
OK     | ouvrier GET employes?select=telephone,notes | observé: 200 NOTE_RH_SECRETE_A
OK     | ouvrier GET employes?select=code_stock_hash | observé: 200 $2a$
OK     | ouvrier GET employes?select=*  | observé: 200 EDP-A-VICTIME
OK     | ouvrier GET habilitations?select=libelle,employe:employes(prenom,nom) (embed) | observé: 200 Victime
OK     | ouvrier GET employes_annuaire | observé: 200 8
OK     | ouvrier GET employes_fiche (collègue) | observé: 404 42P01
OK     | ouvrier GET employes_fiche (soi-même, /mon-espace) | observé: 400 PGRST200 null -
OK     | ouvrier POST habilitations_employe | observé: 201
OK     | ouvrier POST employes_cout_horaire | observé: 201
OK     | ouvrier RPC exporter_donnees_entreprise | observé: 400
OK     | chef d'équipe GET employes_fiche (collègue) | observé: 404 42P01
OK     | chef de chantier GET employes_fiche (module Employés) | observé: 404 42P01
OK     | chef de chantier GET employes?select=email | observé: 200
OK     | RH GET employes_fiche?select=*,profil_acces:postes(nom) (/employes/[id]) | observé: 400 PGRST200
OK     | RH PATCH employes (notes, téléphone) return=minimal | observé: 204
OK     | RH POST employes?select=id (creerEmployeAction) | observé: 201 id false
OK     | RH POST habilitations_employe | observé: 201
OK     | administration RPC exporter_donnees_entreprise | observé: 200 profils:true rib:true notes:true
OK     | gérant RPC exporter_donnees_entreprise | observé: 200 profils:true rib:true notes:true B:false
OK     | gérant B GET employes (entreprise A) | observé: 200 0
OK     | gérant B GET employes_fiche (entreprise A) | observé: 404 B:42P01 A:42P01
OK     | anon GET employes_fiche | observé: 404

24/24 scénarios conformes à l'attendu « v6 »

== PostgREST PostgREST 12.2.3 sur v6_base_edp_corrige (attendu : corrige) ==
OK     | ouvrier GET employes?select=prenom,nom (annuaire) | observé: 200 Victime
OK     | ouvrier GET employes?select=email (REST direct) | observé: 403 42501
OK     | ouvrier GET employes?select=telephone,notes | observé: 403 42501
OK     | ouvrier GET employes?select=code_stock_hash | observé: 403 4250
OK     | ouvrier GET employes?select=*  | observé: 403 42501
OK     | ouvrier GET habilitations?select=libelle,employe:employes(prenom,nom) (embed) | observé: 200 Victime
OK     | ouvrier GET employes_annuaire | observé: 200 8
OK     | ouvrier GET employes_fiche (collègue) | observé: 200 0
OK     | ouvrier GET employes_fiche (soi-même, /mon-espace) | observé: 200 ouvrier-a@edp.invalid null Ouvrier
OK     | ouvrier POST habilitations_employe | observé: 403
OK     | ouvrier POST employes_cout_horaire | observé: 403
OK     | ouvrier RPC exporter_donnees_entreprise | observé: 400
OK     | chef d'équipe GET employes_fiche (collègue) | observé: 200 0
OK     | chef de chantier GET employes_fiche (module Employés) | observé: 200 victime.privee@edp.invalid|0611223344|||CBTP-VICTIME-123
OK     | chef de chantier GET employes?select=email | observé: 403
OK     | RH GET employes_fiche?select=*,profil_acces:postes(nom) (/employes/[id]) | observé: 200 NOTE_SUR_OUVRIER|EDP-A-OUV|Ouvrier|false
OK     | RH PATCH employes (notes, téléphone) return=minimal | observé: 204
OK     | RH POST employes?select=id (creerEmployeAction) | observé: 201 id false
OK     | RH POST habilitations_employe | observé: 201
OK     | administration RPC exporter_donnees_entreprise | observé: 200 profils:false rib:false notes:false
OK     | gérant RPC exporter_donnees_entreprise | observé: 200 profils:true rib:true notes:true B:false
OK     | gérant B GET employes (entreprise A) | observé: 200 0
OK     | gérant B GET employes_fiche (entreprise A) | observé: 200 B:3 A:0
OK     | anon GET employes_fiche | observé: 401

24/24 scénarios conformes à l'attendu « corrige »

```
