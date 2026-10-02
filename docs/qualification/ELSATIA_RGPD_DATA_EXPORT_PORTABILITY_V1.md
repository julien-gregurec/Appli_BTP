# ELSATIA — RGPD : export des données, portabilité et droit d'accès V1

Date : 2026-09-28 · Branche : `claude/kind-mayer-w4wfy6` · Base : `integration/elsatia-canonical-train-v6` @ `9102ec80`

**Aucun déploiement, aucun projet distant, aucune clé réelle.** Tout est prouvé localement :

- PostgreSQL 16 et pgTAP ;
- PostgREST **v12.2.3** (binaire officiel), **deux fois** : un par « projet », secrets JWT distincts ;
- mock Storage du dépôt : métadonnées et RLS réelles, octets sur disque ;
- applications réelles : Vitest, `tsc`, `next build`.

Aucune durée de conservation des données n'a été choisie. Aucune règle de suppression n'a été
modifiée.

## Verdict

```
ELSATIA DATA EXPORT LOCALLY QUALIFIED
```

- **Deux exports, deux droits, jamais mélangés.**
  - L'**export entreprise** est réservé à un membre actif titulaire de `gerer_parametres`.
  - L'**export utilisateur** porte toujours sur `auth.uid()` : il n'existe aucun paramètre
    « utilisateur » à usurper.
  - Un export individuel qui porterait une entreprise est refusé.
- **Inventaire exhaustif et verrouillé.** Les 258 tables de `public` sont classées : OWN_DATA,
  SHARED, THIRD_PARTY, BUSINESS_DATA ou EXCLU.
  - Toute table ajoutée sans classement fait échouer pgTAP.
  - Une contrainte en base interdit qu'une donnée de tiers ou métier entre dans un export
    individuel.
- **Job asynchrone PENDING → RUNNING → READY | FAILED → EXPIRED.** Bail exclusif, reprise
  après interruption, rejeu sans duplication.
- **Cohérence.** Les données sont matérialisées en une seule instruction SQL, donc un seul
  instantané.
- **Archive ZIP structurée**, écrite en flux et **ZIP64** :
  - JSON versionné (`elsatia.rgpd-export/1`) et CSV par table ;
  - manifeste des fichiers avec SHA-256 ;
  - `SHA256SUMS` ;
  - classification des tables.
- **Complétude décidée en base.** Une archive n'est **jamais** déclarée complète si un fichier
  est absent, hors tenant, illisible ou altéré, ou si Studio n'a pas répondu.
- **Studio** passe par un contrat inter-projets signé (identité B + I1) : aucune table Studio
  n'est lue ni copiée dans le projet partagé.
- **Téléchargement** : droit relu à chaque fois, nombre borné, URL signée de 5 min vers un seul
  objet.
- **Journal immuable** de la demande, de la génération, du téléchargement et de l'expiration,
  sans aucun contenu.
- **Faille corrigée au passage.** L'export synchrone historique acceptait une **session
  d'assistance plateforme** (§10).
- **Tests, sans régression :**
  - pgTAP : 89/89 (GP) et 22/22 (Studio dédié) ;
  - suite complète : 144/153 fichiers propres, les 9 mêmes non propres qu'en V6 ;
  - Vitest GP : 2 346 passés ; Studio : 295 ;
  - pile réelle deux projets : 7/7 aux facteurs de volume 1 et 4.

Réserves (§19) : aucune UI (API seulement, donc pas de Playwright), 11 décisions ouvertes
(§18), et ce qui reste à prouver sur un vrai Supabase (Storage réel, téléversement d'archives au-delà
de la limite d'upload standard).

---

## 1. Deux types d'export

| | ENTREPRISE | UTILISATEUR |
|---|---|---|
| Droit exercé | réversibilité / portabilité du responsable de traitement (client ELSATIA) | accès (art. 15) et portabilité (art. 20) d'une personne |
| Demandeur | membre **actif** de l'entreprise, poste titulaire de `gerer_parametres`, compte actif | toute personne connectée, pour **elle-même** |
| Entreprise | tirée de la **session** (route) et revérifiée en base ; jamais du corps de la requête | **interdite** (`ENTREPRISE_INTERDITE_EXPORT_UTILISATEUR`) |
| Sujet | l'organisation | toujours `auth.uid()` : aucun paramètre « utilisateur » n'existe |
| Contenu | toutes les tables classées hors EXCLU, minimisées (§5) | OWN_DATA et SHARED rédigées par la personne, dans les entreprises où elle est **membre actif**, plus ses données hors entreprise (compte, Tools, droits, préférences) et Studio |
| Refusé à | autre entreprise, membre sans droit, **session d'assistance plateforme**, session révoquée | sessions révoquées, comptes inactifs |
| Entreprise suspendue ou résiliée | **autorisé** (restitution, CGV art. 10) : `DECISION_REQUIRED` | sans objet |

## 2. Inventaire

Catalogue `platform.rgpd_export_catalogue` (migration `20260929000101`). Chaque table y porte
son application, son domaine, sa catégorie, son prédicat de tenant et, s'il y a lieu, son
prédicat « personne » et ses colonnes exclues.

| Application | OWN_DATA | SHARED | THIRD_PARTY | BUSINESS_DATA | EXCLU |
|---|---|---|---|---|---|
| Gestion Pro | 41 | 7 | 7 | 82 | 2 |
| Plateforme (support, abonnement ELSATIA, droits, communications) | 6 | 1 | — | 14 | 37 |
| Tools (projets, magasin) | 5 | — | — | — | 1 |
| Relevé / métrés (Tools) | — | 1 | — | 11 | — |
| Colors | — | — | — | 5 | 1 |
| Réserves | 5 | 3 | 3 | 5 | 3 |
| Boutique | — | 1 | — | 1 | 1 |
| Identité (plomberie B + I1) | — | — | — | — | 2 |
| Studio : tables résiduelles du projet partagé | — | — | — | — | 13 |
| **Total : 258 tables** | **57** | **13** | **10** | **118** | **60** |

- **Export entreprise** : 190 tables, dont 12 tables enfants rattachées par leur parent
  (lignes d'avenants, contacts clients, paiements, tâches, lignes Boutique, lectures et envois
  Réserves, etc.).
- **Export utilisateur** : 70 tables + l'identité du compte (`auth.users`, 5 colonnes explicites).
- **Fichiers** : 26 colonnes de chemin Storage cataloguées, sur 14 buckets.
- **Motifs EXCLU**, toujours écrits :
  - catalogues globaux ;
  - technique (idempotence, ordonnancement Stripe, caches) ;
  - interne plateforme (personnel, remises internes) ;
  - sécurité (anti-abus, limitation de débit) ;
  - Studio du projet partagé.

L'annexe A donne la liste complète. Chaque archive embarque aussi `classification.json` (table,
catégorie, inclus ou non, motif).

**Gardes pgTAP** : toute table `public` est classée ; aucune entrée orpheline ; toute colonne de
chemin cataloguée existe ; toute colonne `*_storage_path` d'une table exportée figure au manifeste.

## 3. Export utilisateur : ce qui est inclus

| Rubrique demandée | Tables (catégorie) |
|---|---|
| profil | `utilisateurs` (sans `entreprise_active_id`), `auth.users` (e-mail, confirmation, création, dernière connexion) |
| membres | `utilisateurs_entreprises` (toutes ses adhésions, **statut compris**), `habilitations_applications_utilisateurs` |
| actions / historique / audit personnel | `journal_activite`, `journal_ia`, `journal_audit_notes_frais`, `reserves_historique`, `tools_releves_journal` (SHARED : ses actes) ; `tentatives_*`, `appareils_comptes`, `sessions_revoquees` (OWN) |
| pointages | `pointages`, `sessions_pointage`, `verifications_zone_pointage` (+ **ses** photos de pointage) |
| notes de frais | `notes_frais`, `documents_notes_frais`, `versions_documents_notes_frais`, `suggestions_ocr_notes_frais` (+ justificatifs) |
| paie et RH | `bulletins_paie` (+ fichiers), `dossiers_paie_salaries` et 7 tables de détail, `profils_paie_employes`, `pieces_jointes_paie`, `demandes_conges`, `grands_deplacements`, `ordres_virements`, `coordonnees_bancaires` (IBAN chiffré exclu) |
| messages | `messages_internes` (**ses** messages), `conversations_internes` (dont il est partie), `reserves_messages` (ses messages), `support_messages` |
| documents / photos | fiche `employes` (+ carte BTP, signature, photo), `signatures_documents` ; `reserves_photos` qu'il a prises (**métadonnées**, fichiers : `DECISION_REQUIRED`) |
| invitations | `reserves_invitations` = THIRD_PARTY (adressées à des tiers) : hors export individuel ; les adhésions, elles, y figurent |
| exports | ses propres jobs d'export : `rgpd_export_mes_demandes` (API) |
| notifications / préférences | `notifications_utilisateurs`, `preferences_notifications_push`, `push_abonnements` (point d'accès et clés exclus), `communications_lectures` / `_preferences`, `reserves_*notifications*` |
| Tools / droits | `tools_projects`, `tools_monetization_*`, `tools_demandes_suppression_compte`, `entitlements_utilisateurs_elsatia`, `historique_entitlements_elsatia` |
| Studio | projet dédié, contrat §9 |

**Adhésions non actives** (ancien employeur, adhésion désactivée) : elles sont **listées** dans
`export.json` avec `couvert: false`, et **aucune donnée** de cette entreprise n'est exportée.

L'employeur est responsable de traitement de ces données ; ELSATIA, sous-traitant, oriente vers
lui. Voir `DECISION_REQUIRED:EXPORT-UTILISATEUR-ANCIEN-EMPLOYEUR`.

## 4. Export entreprise : ce qui est inclus

- **Métier** : clients, contacts, chantiers, devis (+ lignes, modèles, avenants), factures (+
  lignes, paiements, situations, relances), planning, tâches, affectations.
- **Documents** : documents de chantier et DOE.
- **Opérations** : pointages, notes de frais, paie ; achats, stock, flotte, outillage.
- **Autres applications** :
  - Réserves : chantiers, réserves, plans, photos, intervenants, messagerie ;
  - Relevé : relevés, plans, métrés, pièces, médias, versions ;
  - Colors : seaux, mouvements, analyses.
- **Configuration** : postes, droits, modules, champs, paramètres.
- **Relation contractuelle avec ELSATIA** : abonnement, contrat, factures d'abonnement sans les
  liens hébergés.
- **Audit métier pertinent** :
  - `journal_activite` ;
  - audits paie, notes de frais et paiements bancaires ;
  - **accès plateforme et sessions d'assistance** sur l'organisation, sans l'e-mail du personnel
    ni les motifs internes ;
  - mutations faites par la plateforme.

## 5. Données de tiers — classification et minimisation

| Catégorie | Sens | Export individuel | Export entreprise |
|---|---|---|---|
| OWN_DATA | données sur la personne | ✅ | ✅ (l'entreprise en est responsable) |
| SHARED | contenu co-produit | ✅ **seulement ses contributions** (messages écrits, photos prises, actes journalisés) | ✅ |
| THIRD_PARTY | personnes tierces (clients, contacts, fournisseurs, intervenants, correspondance) | ❌ **interdit par contrainte** | ✅ (données du responsable) |
| BUSINESS_DATA | données de l'organisation | ❌ | ✅ |

Colonnes **jamais** exportées (motif global et listes par table), prouvé en pgTAP :

- mots de passe, secrets, jetons et empreintes (`*_hash`, dont le code de borne) ;
- IBAN et BIC chiffrés ;
- clés push (`endpoint`, `p256dh`, `auth`) ;
- adresses IP, agents utilisateur, identifiants de session ;
- liens de paiement, clés d'idempotence, signatures d'attestation ;
- `code` des codes d'accès et des QR (capacités) ;
- configuration des connecteurs ;
- e-mail du personnel plateforme et motifs internes d'assistance ;
- notes commerciales internes plateforme ;
- `entreprise_active_id` des membres (révèlerait une autre organisation).

**Export individuel** : jamais le message d'un collègue, jamais un client, jamais une ligne où la
personne n'est que valideuse ou décideuse d'un dossier d'autrui (catégorie THIRD_PARTY implicite
de ces colonnes : `valide_par`, `decide_par`…).

## 6. Format

Archive `rgpd-exports/<job>/<tentative>.zip` :

```
export.json                     format "elsatia.rgpd-export/1", job, type, entreprise, demandeur (individuel),
                                instantané, complet, motifs_incompletude[], index des sections, compteurs de
                                fichiers, statut Studio, périmètre (adhésions couvertes ou non)
donnees/<entreprise|compte>/<application>/<table>.json   tableau JSON d'objets (une table par fichier)
csv/<entreprise|compte>/<application>/<table>.csv        mêmes données, UTF-8 + BOM, séparateur « ; »,
                                                         injection de formules neutralisée (' préfixé)
fichiers/manifeste.json          chaque fichier référencé : source, section, ligne, colonne, bucket, chemin,
                                 statut, octets, sha256 calculé, sha256 attendu, chemin dans l'archive
fichiers/<bucket>/<chemin>       fichiers inclus (dédoublonnés)
studio/donnees.json              export individuel : données Studio du sujet
studio/fichiers/<bucket>/<clé>   fichiers Studio OWN_DATA
classification.json              catalogue (table, application, catégorie, inclus, colonnes exclues, motif)
LISEZMOI.txt                     guide de lecture
SHA256SUMS                       empreinte de chaque entrée
```

Statuts de fichier :

| Statut | Sens |
|---|---|
| `INCLUS` | fichier copié dans l'archive |
| `ABSENT` | référencé en base, absent du stockage |
| `HORS_TENANT` | chemin hors du tenant de la ligne : jamais lu |
| `EXCLU_POLITIQUE` | métadonnées seulement |
| `ILLISIBLE` | lecture impossible au moment de la copie |
| `EMPREINTE_DIVERGENTE` | copié, mais le SHA-256 diffère de l'empreinte enregistrée |

Tout autre statut qu'`INCLUS` ou `EXCLU_POLITIQUE` rend l'archive incomplète.

L'archive est relue par Python `zipfile` et `unzip -t` dans les tests, SHA256SUMS compris.

## 7. Pièces jointes

- **Manifeste** : calculé **en base**, à partir des lignes matérialisées (même instantané que
  les données), puis confronté à `storage.objects` (`ABSENT`).
- **Mémoire** : aucun binaire n'est chargé entier.
  - Lecture : URL signée de 120 s, puis corps HTTP lu en flux.
  - Écriture : CRC-32, SHA-256 et deflate (ou stockage brut pour les formats déjà compressés),
    puis écriture sur disque.
  - Prouvé : 256 Mio traversent l'écrivain avec un tas JS < 64 Mio. Pile réelle : 60 Mio de
    fichiers et 73 510 lignes avec un tas plafonné à 37 Mio.
- **Format ZIP** : ZIP64. `fflate`, déjà en dépendance, n'écrit pas ZIP64 : il aurait plafonné
  une grosse entreprise à 65 535 entrées et 4 Gio. Un écrivain dédié le remplace
  (`src/lib/rgpd-export/zip.ts`). Test : 65 600 entrées relues par Python et `unzip`.
- **Politique d'inclusion**, reprise de la décision antérieure de `manifeste_fichiers_entreprise` :
  - les preuves de pointage (biométrie / GPS) sont exclues de l'export **entreprise** ;
  - elles sont incluses dans l'export **individuel** de la personne concernée ;
  - les exports déjà dérivés (`notes-frais-exports`) sont exclus ;
  - les fichiers SHARED sont décrits sans être copiés.

## 8. Storage

| Contrôle | Mécanisme | Preuve |
|---|---|---|
| Droits | bucket `rgpd-exports` **privé, sans aucune policy** ; lecture de fichiers par la clé service **seulement** pour un job autorisé | pgTAP (aucune policy), HTTP (pas d'accès direct) |
| URL signées | lecture des sources 120 s ; téléchargement de l'archive `url_signee_secondes` (300 s) vers **un seul objet**, après autorisation en base | Vitest route, pile réelle |
| Cross-tenant | tenant du chemin = 1er dossier (`companies/<id>/…` pour les notes de frais), comparé à l'`entreprise_id` **de la ligne** ; différent, invalide ou contenant `..` → `HORS_TENANT`, **jamais lu** | pgTAP : une ligne de A pointant un objet de B, et une traversée `..` → HORS_TENANT ; le worker revalide le nom d'entrée |
| Fichiers manquants | `ABSENT` (pas d'objet) et `ILLISIBLE` (objet déclaré, octets perdus) | pgTAP + pile réelle (les deux cas) |
| Hash | SHA-256 calculé en flux pour chaque fichier ; comparé à l'empreinte enregistrée (bulletins, pièces de paie, versions de notes de frais, signatures) ; SHA-256 de l'archive vérifié en base et au téléchargement | Vitest (fichier altéré → `EMPREINTE_DIVERGENTE`), pile réelle (sha256 téléchargé = sha256 en base) |

**Faille évitée par construction.** Le worker lit avec la clé service. Sans contrôle, une ligne
de A dont le `storage_path` aurait été réécrit vers un fichier de B aurait fait sortir ce fichier
dans l'archive de A. Le contrôle de tenant par ligne ferme cette voie ; il est testé en pgTAP.

## 9. Studio (projet dédié, B + I1)

L'export central **ne lit aucune table Studio** : les 13 tables `studio_*` résiduelles du projet
partagé sont EXCLU. **Contrat inter-projets v1 :**

| Étape | Côté | Détail |
|---|---|---|
| 1 | GP | `elsatia_identity_subjects` indique si la personne est déjà venue sur Studio. Sinon : `NON_APPLICABLE`, export complet sans appel |
| 2 | GP | jeton **`elsatia-export-request+jwt`** : ES256, même clé d'identité et même JWKS que le passage ; `sub` = sujet opaque par audience ; `job`, `scope: "subject_data"`, `jti` à usage unique, TTL 60 s. Aucun identifiant plateforme ne sort |
| 3 | Studio | `POST /api/elsatia/export` : vérification avec la clé **publique** ; confusion de type refusée (un passage ou un événement n'est pas une demande d'export) |
| 4 | Studio | `studio_export_consume(jti)` **avant** toute lecture : un rejeu → 409 |
| 5 | Studio | `studio_export_subject(sujet, job)` : OWN_DATA = espaces dont il est propriétaire **et seul membre** (même périmètre que l'effacement) ; SHARED = ce qu'il a créé dans les espaces partagés ; jamais le contenu d'un autre membre, ni jeton de bail, clé d'idempotence ou instantané technique |
| 6 | Studio | URL signées de 600 s vers ses fichiers **OWN_DATA** seulement |
| 7 | GP | ne suit que les URL de l'origine Storage Studio configurée (défense SSRF) ; copie en flux dans `studio/` |

**Dans le projet dédié** : chemin système `rgpd_export` sous la garde d'écriture existante, et
journal `export_events` immuable sans contenu. L'export reste possible en mode lecture seule.

**Pannes** :

| Situation | Effet |
|---|---|
| Studio injoignable, 5xx, 429 ou réponse non conforme | réessai du job ; au-delà des tentatives, `FAILED`. Jamais « complet » |
| Contrat non configuré alors qu'un sujet existe | archive produite, **incomplète** (`EXPORT_STUDIO_NON_CONFIGURE`) |
| Aucun compte Studio | section vide, archive complète |

## 10. Sécurité

| Attaque | Défense | Preuve |
|---|---|---|
| **IDOR** (télécharger le job d'un autre) | `demandeur_id = auth.uid()` ; réponse `INTROUVABLE` **identique** à un job inexistant ; même un autre administrateur de la même entreprise est refusé | pgTAP ×2, pile réelle (HTTP), Vitest route (404) |
| **Org spoof** (exporter une autre entreprise) | droit `gerer_parametres` + membre actif, vérifiés en base à la demande, **à la génération** et **au téléchargement** ; la route prend l'entreprise dans la session | pgTAP (B → A refusé ; droit retiré avant la génération → `DEMANDEUR_NON_AUTORISE` ; retiré avant le téléchargement → `NON_AUTORISE`), pile réelle, Vitest route |
| **User spoof** | aucun paramètre « personne » : sujet = `auth.uid()` ; export individuel + entreprise → refus | pgTAP, Vitest route (un `utilisateur_id` dans le corps est ignoré) |
| **Mésusage de la clé service** | la clé service **ne peut pas** demander un export ni autoriser un téléchargement (EXECUTE retiré) ; les RPC worker dérivent tout du job et du bail ; aucune table lisible directement | pgTAP, pile réelle (`42501` via PostgREST) |
| **Session d'assistance plateforme** | refusée à la demande et au téléchargement | pgTAP |
| **Session révoquée** | refusée | pgTAP |
| Clé d'un projet sur l'autre | secrets JWT distincts : la clé service GP est refusée par le PostgREST Studio, et inversement | pile réelle |
| Demande Studio forgée ou rejouée | signature ES256, audience, émetteur, expiration, usage unique | Vitest ×2 (identité, Studio), pgTAP Studio |
| SSRF par une URL Studio | liste d'origines | Vitest |
| Injection CSV | préfixe `'` | Vitest |

**Constat corrigé (pré-existant).** `exporter_donnees_entreprise`, derrière le bouton actuel
`/api/rgpd/export`, s'appuie sur `a_permission`, qui retourne vrai pendant une **session
d'assistance plateforme** : le support pouvait télécharger l'intégralité des données d'un client.
Le corps de la fonction est inchangé, sauf un refus explicite de ce cas. Preuves :

- pgTAP (`42501`) ;
- les suites historiques `rgpd_export_tables_enfants_v3` (14/14) et
  `gp_pilot_rgpd_manifeste_fichiers` (9/9) restent vertes.

**Constat non corrigé (décision).** Ce même export historique est refusé à une entreprise
**suspendue** : `est_membre_actif` exige un abonnement non suspendu. Or la restitution est due
(CGV art. 10). Le nouvel export l'autorise (`DECISION_REQUIRED:EXPORT-ENTREPRISE-SUSPENDUE`).

## 11. Job asynchrone

```
PENDING ──réclamer (bail, SKIP LOCKED)──► RUNNING ──terminer──► READY ──échéance──► EXPIRED
   ▲                                        │  │                                  (archive supprimée,
   └──── échec transitoire (recul 2^n min) ─┘  └── échec définitif / tentatives ──► FAILED   constat en base)
         bail expiré (worker coupé) ─► repris par le suivant (tentative + 1)
```

- **Au plus un export en cours par périmètre** (index unique partiel). Deux demandes simultanées
  → un seul job.
- **Worker** : route cron `POST /api/cron/rgpd-export` (`CRON_SECRET`, budget de 240 s par
  appel), puis expiration dans le même passage. Elle n'est **pas** ajoutée à `vercel.json`
  (plan Hobby : une exécution quotidienne), à planifier à l'activation.
- **Politique technique** (`platform.rgpd_export_politique`, modifiable) :
  - mise à disposition 7 jours ;
  - 3 téléchargements ;
  - URL de 300 s ;
  - bail de 900 s ;
  - 3 tentatives.

  Ce sont des valeurs **techniques** de mise à disposition de l'archive, bornées par contrainte ;
  ce ne sont pas des durées de conservation des données (`DECISION_REQUIRED:EXPORT-ARCHIVE-DISPONIBILITE`).

## 12. Téléchargement

`GET /api/rgpd/exports/<id>/telechargement` :

1. la RPC `rgpd_export_autoriser_telechargement` relit tout :
   - le demandeur, le statut READY et l'échéance ;
   - le quota (verrou de ligne, compteur) ;
   - pour un export entreprise, le droit (sans session d'assistance) ;
2. la clé service signe une URL de **300 s** vers **ce seul objet** ;
3. la route répond par une redirection **303**, avec `Cache-Control: no-store` et
   `Referrer-Policy: no-referrer`.

Codes : 404 (IDOR ou inexistant), 410 (expiré), 429 (quota), 403 (droit retiré).

Usage contrôlé : chaque téléchargement est compté et journalisé. L'URL elle-même reste un lien
porteur pendant 300 s : c'est la limite de l'architecture Storage.

## 13. Journalisation

`platform.rgpd_export_evenements` est **append-only** (trigger d'immuabilité).

| Moment | Événements |
|---|---|
| Demande | `requested`, `deduplicated`, `refused` (sans l'entreprise visée) |
| Génération | `started`, `resumed_after_interruption`, `materialized` (compteurs), `ready` (octets, sha256, complétude), `retry_scheduled`, `failed` (code) |
| Téléchargement | `download_authorized` (numéro), `download_refused` (code) |
| Expiration | `expired`, `archive_deleted` |

- **Export entreprise** : la demande et le téléchargement figurent aussi dans `journal_activite`,
  visible par l'organisation.
- **Studio** : `export_events` (`served`, `replay_refused`, `no_account`, `refused_inactive`),
  compteurs seulement.
- **Worker** : il journalise des compteurs et des durées, jamais une ligne, un nom de fichier
  ou une URL.
- **Preuves** : pgTAP (aucun `TEST_*` ni e-mail dans le journal) et pile réelle (aucun nom
  client ni e-mail).
- La durée de conservation des journaux **n'est pas choisie** (`DECISION_REQUIRED`).

## 14. Idempotence

| Rejeu | Effet | Preuve |
|---|---|---|
| même demande (même clé) | même job (`rejoue: true`) | pgTAP |
| autre clé pendant un export en cours | même job, événement `deduplicated` | pgTAP, index unique |
| clé réutilisée pour un autre périmètre | refus `CLE_DEJA_UTILISEE` | pgTAP |
| matérialisation rejouée | préparation remplacée, aucune ligne dupliquée | pgTAP |
| worker interrompu | bail expiré → reprise en tentative 2 ; l'ancien bail ne peut plus écrire ; une seule archive au final | pgTAP, pile réelle |
| deux workers | `SKIP LOCKED` + bail : le second ne prend rien | pgTAP, pile réelle |
| fin rejouée | sans effet (`rejoue: true`) | pgTAP, pile réelle |
| génération rejouée (même tentative) | archive **identique octet pour octet** | Vitest |
| dépôt rejoué | `upsert` sur le même chemin de tentative ; les tentatives obsolètes sont supprimées | pile réelle |

## 15. Gros volume

Pile réelle : worker de production (adaptateurs supabase-js) → PostgREST v12.2.3 → PostgreSQL 16
(359 migrations). Mesures prises dans le processus Vitest, qui a sa propre base de mémoire.

| | Facteur 1 | Facteur 4 |
|---|---|---|
| Lignes métier de l'entreprise | **15 314** | **61 214** |
| Lignes exportées (190 tables) | 18 610 | 73 510 |
| Fichiers inclus | 307 (dont 4 × 15 Mio) | 1 207 (dont 4 × 15 Mio) |
| Entrées ZIP | 531 | 1 431 |
| **Taille de l'archive** | **66,2 Mo** | **75,8 Mo** |
| **Temps total** | **34,7 s** | **124,0 s** |
| · matérialisation (SQL) | 0,4 s | 1,6 s |
| · données (pagination + JSON + CSV) | 1,9 s | 5,2 s |
| · fichiers | 31,7 s | 116,4 s |
| · dépôt + fin | 0,7 s | 0,8 s |
| **Tas JS** (base → pic) | 20 → 39 Mo | 17 → 37 Mo |
| RSS du processus (base → pic) | 96 → 173 Mo | 95 → 225 Mo |

- **Données** : quasi linéaires (×4 lignes → ×2,8 de temps).
- **Fichiers** : le temps est dominé par le **mock Storage**, qui lance un `psql` par URL signée
  (≈ 95 ms par fichier). Ce chiffre ne représente pas le Storage réel : **aucun SLA n'en est
  tiré**.
- **Mémoire** : le **tas JS ne croît pas** avec le volume (×4). La RSS additionnelle est de la
  mémoire native (tampons fetch/zlib), sans rétention de données. Aucune donnée n'est gardée en
  mémoire au-delà d'une page (≤ 1 000 lignes) et de l'index du manifeste (quelques centaines
  d'octets par fichier).

## 16. Pannes simulées

| Panne | Où | Résultat |
|---|---|---|
| **Storage manquant** : métadonnée présente, octets perdus | pile réelle | `ILLISIBLE`, archive READY **`complet = false`** |
| **Fichier absent** : aucun objet | pile réelle + pgTAP | `ABSENT`, jamais complet (règle en base, même si le worker l'affirme) |
| Stockage en panne (5xx, réseau) | Vitest | réessai, **aucune archive** déposée |
| Fichier altéré | Vitest | `EMPREINTE_DIVERGENTE`, incomplet |
| **Studio indisponible** | pile réelle + Vitest | réessai (`PENDING`, aucune archive) ; au retour de Studio, READY complet |
| Studio non configuré | Vitest | READY **incomplet** |
| **Job interrompu** : coupure après 20 sections | pile réelle + Vitest | ni terminé ni échoué ; non repris tant que le bail court ; repris ensuite (tentative 2), une seule archive |
| Bail volé en cours de route | Vitest | arrêt, aucune écriture |
| Tentatives épuisées | pgTAP | FAILED, préparation purgée |
| Droit retiré entre la demande et la génération | pgTAP | FAILED `DEMANDEUR_NON_AUTORISE` |

**Garanties** : aucune archive n'est déposée si une copie échoue en cours d'entrée. Aucune n'est
déclarée complète si elle ne l'est pas. `terminer` exige l'objet dans le Storage **au chemin
imposé** par le job.

## 17. Tests

| Suite | Résultat |
|---|---|
| pgTAP `rgpd_data_export_portability_v1` (nouvelle) | **89/89** |
| pgTAP Studio dédié `studio_rgpd_export` (nouvelle) | **22/22** ; chaîne dédiée 15 migrations, toutes suites vertes ×3 (565 ok) ; gardes d'inventaire existantes respectées (triggers, chemins système) |
| pgTAP complet (base neuve, **359** migrations, `pgtap-run-v3.sh`) | **153 fichiers, 144 propres, 4 546 ok, 14 not ok** — V6 : 152 / 143 / 4 457 / 14 ; les 9 fichiers non propres sont **exactement ceux de V6** (7 Studio du projet partagé, `platform_stripe_state_attestation_r72`, `elsatia_tools_cloud_sync_entitlement_closure_v1`) : **0 régression** |
| Vitest `src/lib/rgpd-export` (ZIP, CSV, worker, client Studio) + routes + proxy | 7 + 3 + 13 + 7 + 6 + 15 |
| Vitest identité (`export-request.test.ts`, nouveau) | 4 ; contrat / broker inchangés |
| **Pile réelle** `real.test.ts` (deux projets) | **7/7**, facteur 1 **et** facteur 4 |
| Vitest GP (racine) | **2 346 passés**, 43 ignorés (V6 : 2 300 / 36 ; +7 ignorés = la suite réelle sans pile) |
| Tools / Réserves / Colors | 2 118 / 186 / 431 (inchangés) |
| Studio `npm test` | **295** (V6 : 291 ; +4) ; typecheck ✅, lint ✅ |
| `typecheck` (4 apps) / `lint` | ✅ / 0 erreur (15 avertissements, comme V6) |
| `verify:migrations` | 359 · Studio dédié 15 (9 gelées + 6 dédiées) |
| `verify:train-expectations` / `test:preview-pack` | ✅ (attendus régénérés) / 29/29 (48 RPC service-only) |
| `verify:env-manifest` / `test:env-manifest` / `verify:secrets` | ✅ / 67/67 / aucun secret |
| `next build` GP / Studio | voir §20 |
| Playwright | **sans objet** : aucune UI ajoutée (§19) |

## 18. Décisions ouvertes (aucune tranchée par ce lot)

| ID | Nature | Défaut appliqué (conservateur) |
|---|---|---|
| `EXPORT-ARCHIVE-DISPONIBILITE` | propriétaire | 7 j, 3 téléchargements, URL 300 s (technique, modifiable) |
| `EXPORT-UTILISATEUR-ANCIEN-EMPLOYEUR` | juridique | adhésion non active : listée, rien d'exporté (orientation vers l'employeur) |
| `EXPORT-ENTREPRISE-SUSPENDUE` | juridique / produit | export autorisé (restitution) |
| `EXPORT-PREUVES-POINTAGE-ENTREPRISE` | juridique | exclues de l'export entreprise (décision antérieure), incluses dans l'export individuel |
| `EXPORT-FICHIERS-SHARED` | juridique | photos de chantier prises par la personne (Réserves) et fichiers Studio en espace partagé : métadonnées seulement |
| `EXPORT-COUT-HORAIRE-INDIVIDUEL` | juridique | coût horaire hors export individuel (donnée de gestion restreinte) |
| `EXPORT-TRACES-RESEAU` | juridique | IP et agent utilisateur exclus partout |
| `EXPORT-CONTRIBUTIONS-AUTRES-ORGANISATIONS` | juridique | messages d'un intervenant dans le tenant d'une autre organisation (Réserves) : non exportés |
| `EXPORT-JOURNAL-CONSERVATION` | juridique | journaux d'export et de Studio conservés sans purge (aucune durée choisie) |
| `EXPORT-UI` | produit | pas d'UI ; le bouton actuel reste sur l'export synchrone historique |
| `EXPORT-PLANIFICATION` | exploitation | cron non planifié (`vercel.json` inchangé) |

## 19. Limites et ce qui reste à prouver

- **Pas d'UI.** L'API est complète (`POST` / `GET /api/rgpd/exports`, téléchargement), mais la
  page « Mes données » propose toujours l'export JSON synchrone historique :
  - il charge tout en mémoire (une seule réponse) ;
  - il ne contient ni fichiers ni Studio ;
  - il est refusé aux entreprises suspendues.

  Recommandation : basculer l'UI sur le nouvel export et retirer l'ancien. Playwright sera
  alors requis.
- **Storage réel non prouvé.** Le mock reproduit métadonnées, RLS et URL signées, pas le
  service `storage-api`.
  - **Téléversement de l'archive** : `upload` standard. Au-delà de la limite d'upload du projet
    (50 Mo par défaut sur certains plans), il faut l'upload résumable (TUS) : à prouver sur la
    Preview avec une grosse entreprise.
  - Bucket `rgpd-exports` sans `file_size_limit` (limite globale du projet).
- **Studio en production** : les variables `ELSATIA_STUDIO_EXPORT_URL` et
  `ELSATIA_STUDIO_STORAGE_ORIGIN` ne sont pas posées (Studio OFF sur la première Preview).
- **Temps réels du Storage** : non mesurés (le mock les domine).
- **Limites locales** : ZIP64 au-delà de 4 Gio non exécuté (seul le nombre d'entrées l'a été).
  GoTrue non utilisé : jetons utilisateurs signés HS256 et vérifiés par le **vrai** PostgREST.

## 20. Builds et reproduction

| Build | Résultat |
|---|---|
| `next build` Gestion Pro (routes `/api/rgpd/exports`, `/api/rgpd/exports/[id]/telechargement`, `/api/cron/rgpd-export`) | ✅ |
| `next build` Studio (route `/api/elsatia/export`) | ✅ |

```bash
git checkout claude/kind-mayer-w4wfy6 && npm ci && for a in tools colors reserves studio; do npm ci --prefix apps/$a; done
pg_ctlcluster 16 main start ; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
scripts/local-postgres-bootstrap/rebuild_db.sh v7_fresh                        # 359/359
scripts/qualification/pgtap-run-v3.sh v7_fresh                                 # 144/153 propres (= V6 + 1)
apps/studio/scripts/dedicated-db-check.sh                                      # 15 migrations, toutes suites vertes
# Pile réelle deux projets (PostgREST v12.2.3 : voir releve_e2e_stack.sh pour le téléchargement) :
createdb -T v7_fresh exp_real  # (ou une copie fraîche)
scripts/qualification/rgpd-export-stack.sh start exp_real studio_dedicated_check
source /var/tmp/rgpd-export-stack/env.sh
RGPD_STACK_SEED_N=1 npx vitest run src/lib/rgpd-export/real.test.ts            # 7/7 (mesures : /var/tmp/rgpd-export-stack/mesures-n1.json)
scripts/qualification/rgpd-export-stack.sh stop
npm run typecheck && npm run lint && npm test && npm --prefix apps/studio test
npm run verify:migrations && npm run verify:train-expectations && npm run test:preview-pack && npm run verify:env-manifest
```

La suite réelle charge `supabase/tests/fixtures/isolation_multitenant.inc` et
`scripts/qualification/rgpd-export-large-seed.sql` depuis `/var/tmp/exp/` (lisibles par
l'utilisateur `postgres`).

## 21. Fichiers

| Fichier | Rôle |
|---|---|
| `supabase/migrations/20260929000101_rgpd_data_export_portability_v1.sql` | catalogue, jobs, préparation, manifeste, journal, bucket, RPC ; correctif de l'export historique |
| `supabase/tests/rgpd_data_export_portability_v1.test.sql` | pgTAP 89 |
| `apps/studio/supabase/migrations/20260929100000_studio_rgpd_export.sql`, `apps/studio/supabase/tests/studio_rgpd_export.test.sql` | projet dédié : export du sujet, anti-rejeu, journal ; pgTAP 22 |
| `packages/elsatia-identity/src/{contract,issuer,verifier,index}.ts`, `tests/export-request.test.ts` | jeton `elsatia-export-request+jwt` |
| `src/lib/rgpd-export/{zip,csv,format,runner,supabase-ports,studio-client,service}.ts` (+ tests, `real.test.ts`) | worker, ZIP64 en flux, contrat Studio côté plateforme |
| `src/app/api/rgpd/exports/**`, `src/app/api/cron/rgpd-export/route.ts`, `src/lib/supabase/proxy.ts` | API utilisateur, téléchargement, cron |
| `apps/studio/src/lib/{rgpd-export,rgpd-export-service,identity}.ts`, `apps/studio/src/app/api/elsatia/export/route.ts` | route Studio |
| `scripts/qualification/rgpd-export-stack.sh`, `rgpd-export-large-seed.sql` | pile réelle, jeu volumineux |
| `apps/studio/supabase/migration-targets.json`, `scripts/preview/db-verify.mjs`, `preview-pack.test.mjs`, `config/env-manifest.json`, `.env*.example`, attendus générés | portes du train |

## Annexe A — classification complète (258 tables)

| Application | Catégorie | Tables |
|---|---|---|
| boutique | BUSINESS_DATA | boutique_lignes_commande |
| boutique | EXCLU | boutique_produits |
| boutique | SHARED | boutique_commandes |
| colors | BUSINESS_DATA | colors_analyses_ocr, colors_emplacements, colors_mouvements, colors_parametres, colors_seaux |
| colors | EXCLU | colors_nettoyages_photos |
| gestion_pro | BUSINESS_DATA | acces_applications_entreprises, acces_externes_documents, appels_offres, article_teintes, articles_stock, avenants, bons_livraison, categories_notes_frais, champs_personnalises, chantier_transferts, chantiers, charges_recurrentes, cles_api, codes_acces, codes_identification, commandes_fournisseurs, compteurs_reference, connecteurs_externes, connexions_bancaires, connexions_email, contrats_entretien, depenses_fournisseurs, devis, documents_chantier, doe_generations, ecritures_comptables_importees, elements_export_notes_frais, employes_cout_horaire, employes_taux_facture, entreprise_besoins, entreprise_feature_flags, entreprises, exports_notes_frais, facturation_comptes_mensuelle, factures, fiches_techniques_articles, historique_tarification, interventions, inventaires, journal_audit_paie, journal_paiements_bancaires, legal_holds_notes_frais, lignes_avenants, lignes_commande, lignes_devis, lignes_factures, lignes_inventaire, lignes_metres, lignes_modeles_devis, lignes_situations, lots_virements, metres, modeles_devis, modules_entreprises, mouvements_outillage, mouvements_stock, outils, paiements, parametres_paie_entreprise, parametres_relances, periodes_paie, permissions_poste, pieces_jointes_devis, planning_evenements, politiques_conservation_notes_frais, postes, prestations_catalogue, reglements_fournisseurs, releves_kilometrage, remises_banque, remises_banque_paiements, situations_travaux, sous_traitants_chantiers, taches, tarifs_fournisseurs, types_chantier, valeurs_champs_personnalises, validations_notes_frais, validations_paie, vehicules, zones_deplacement_paie, zones_depot |
| gestion_pro | EXCLU | entreprises_dashboard_cache, receptions_idempotence |
| gestion_pro | OWN_DATA | absences_paie, affectations, affectations_historique, affectations_vehicules, alertes_operationnelles_delegations, alertes_operationnelles_ignorees, anomalies_paie, appareils_comptes, bulletins_paie, coordonnees_bancaires, deductions_paie, demandes_conges, documents_notes_frais, dossiers_paie_salaries, employes, equipes_chantiers, grands_deplacements, habilitations_applications_utilisateurs, habilitations_employe, indemnites_deplacement_paie, notes_frais, notifications_utilisateurs, ordres_virements, pieces_jointes_paie, pointages, preferences_notifications_push, primes_paie, profils_paie_employes, push_abonnements, regularisations_paie, sessions_pointage, sessions_revoquees, signatures_documents, suggestions_ocr_notes_frais, temps_travail_paie, tentatives_acces_notes_frais, tentatives_borne_stock, utilisateurs, utilisateurs_entreprises, verifications_zone_pointage, versions_documents_notes_frais |
| gestion_pro | SHARED | comptes_rendus_chantier, conversations_internes, journal_activite, journal_audit_notes_frais, journal_ia, messages_internes, pieces_jointes_messages |
| gestion_pro | THIRD_PARTY | appels_contacts, clients, contacts_clients, emails_chantier, fournisseurs, relances_documents, relances_impayes |
| identite | EXCLU | elsatia_identity_outbox, elsatia_identity_subjects |
| plateforme | BUSINESS_DATA | abonnement_stockage_releves, abonnements_entreprises, acces_support_log, assistance_evenements, assistance_sessions, assistance_sessions_applications, contrats_abonnement, factures_abonnement, historique_capacite_personnes, historique_contrats_abonnement, historique_modules_entreprises, historique_mutations_plateforme, options_abonnement_entreprises, plateforme_acces_entreprises |
| plateforme | EXCLU | abonnement_evenements, applications_elsatia, assistance_actions_interdites, assistance_domaines_sensibles, assistance_motifs, assistance_perimetres, assistance_roles_correspondance, catalogue_options_abonnement, catalogue_services_mise_en_service, communications, communications_audiences, communications_journal, communications_pieces_jointes, generations_tarifaires, historique_acces_applications, historique_remises_commerciales, journal_abus_securite, modeles_roles_predefinis, modules_gestion_pro, modules_gestion_pro_tarifs, operations_capacite_stripe, permissions_disponibles, plans_abonnement, plateforme_admins, plateforme_journal_actions, plateforme_operations_remise, plateforme_operations_remise_historique, plateforme_verrous_remise_stripe, promotions_commerciales, rate_limits_applicatifs, remises_commerciales, roles_applications_elsatia, stripe_essai_ecarts, stripe_evenements_ordre, stripe_objets_ordre, stripe_subscriptions_remplacees, stripe_webhook_events |
| plateforme | OWN_DATA | assistance_notifications, communications_lectures, communications_preferences, entitlements_utilisateurs_elsatia, historique_entitlements_elsatia, plateforme_reinitialisations_mot_de_passe |
| plateforme | SHARED | support_messages |
| releve | BUSINESS_DATA | tools_releves, tools_releves_batiments, tools_releves_chantiers, tools_releves_elements, tools_releves_etages, tools_releves_exports_gp, tools_releves_medias, tools_releves_pieces, tools_releves_plans, tools_releves_versions, tools_releves_zones |
| releve | SHARED | tools_releves_journal |
| reserves | BUSINESS_DATA | reserves, reserves_annuaire_publication, reserves_chantiers, reserves_conversations, reserves_plans |
| reserves | EXCLU | reserves_mutations_appliquees, reserves_notifications_types, reserves_transitions |
| reserves | OWN_DATA | reserves_conversations_lectures, reserves_evenements_notifications, reserves_notifications_envois, reserves_notifications_lectures, reserves_preferences_notifications |
| reserves | SHARED | reserves_historique, reserves_messages, reserves_photos |
| reserves | THIRD_PARTY | reserves_contacts, reserves_intervenants, reserves_invitations |
| studio_partage | EXCLU | studio_media_analysis, studio_media_assets, studio_media_limits, studio_project_assets, studio_projects, studio_render_jobs, studio_render_outbox, studio_render_outputs, studio_signup_policy, studio_timeline_clips, studio_timelines, studio_workspace_members, studio_workspaces |
| tools | EXCLU | tools_offres_catalogue |
| tools | OWN_DATA | tools_demandes_suppression_compte, tools_monetization_customers, tools_monetization_events, tools_monetization_subscriptions, tools_projects |
