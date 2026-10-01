# ELSATIA — Chiffrement bancaire : versionnement et rotation des clés (V1)

| | |
|---|---|
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc7` (train canonique V8) |
| Branche | `claude/dazzling-turing-2q77nn` |
| Blocker fermé | constat manifeste **P0 `F-DR-BANK-KEY-VERSIONING`** (« format v1 sans identifiant de clé : aucune rotation, perte = IBAN illisibles ») |
| Migration | `20260930000813_banking_encryption_key_rotation_v1.sql` (additive, idempotente) — train **372** migrations |
| Données | **test uniquement** : IBAN fictifs (code banque `99999`, clé RIB calculée), clés générées pour chaque test, jamais de vraie coordonnée bancaire |
| Moteur | PostgreSQL 16 réel + pgTAP 1.3 (`scripts/local-postgres-bootstrap`), Node 22.22, Vitest 4.1 |
| Verdict | **ELSATIA BANKING ENCRYPTION LOCALLY QUALIFIED** (§14) |

---

## 1. Audit

### 1.1 Données bancaires sensibles

| Donnée | Emplacement | Protection avant V1 | Après V1 |
|---|---|---|---|
| IBAN salariés et fournisseurs | `coordonnees_bancaires.iban_chiffre` | AES-256-GCM, format `v1:` sans clé | trousseau versionné, `v2:<clé>:A256GCM:` |
| BIC | `coordonnees_bancaires.bic_chiffre` | idem | idem |
| Copie IBAN/BIC figée dans un ordre de virement | `ordres_virements.iban_chiffre`, `bic_chiffre` | idem (copie du chiffré au moment du lot) | idem, rechiffrée par le même job |
| Empreinte IBAN (doublons) | `coordonnees_bancaires.iban_hash` | **SHA-256 non salé** (voir §1.3, constat A3) | index aveugle **HMAC** sous la clé active, versionné (`iban_hash_cle`) |
| 4 derniers caractères | `iban_quatre_derniers` (2 tables) | clair (affichage « •••• 0189 ») | inchangé (pas un IBAN) |
| Titulaire | `titulaire` (2 tables) | clair | inchangé (hors périmètre : nom, pas une coordonnée bancaire) |
| Coordonnées bancaires de l'entreprise | aucune colonne dédiée ; `remises_banque.compte_bancaire` (texte libre) | **clair** | inchangé — constat résiduel R1 (§13) : aucun chemin d'écriture applicatif |
| Salariés | via `coordonnees_bancaires` (`type_beneficiaire = 'employe'`) | — | — |
| Stripe | `entreprises.stripe_customer_id`, `stripe_account_id`, `abonnements_entreprises.stripe_customer_id` | identifiants opaques, non secrets ; cartes / SEPA chez Stripe uniquement | hors périmètre (aucune donnée bancaire en base) |
| Powens | aucune coordonnée stockée ; IBAN déchiffré en mémoire à la transmission du lot | — | inchangé |

### 1.2 Chaîne de chiffrement (avant V1)

| Élément | Constat |
|---|---|
| Algorithme | AES-256-GCM, iv 12 octets aléatoire, tag 16 octets — correct |
| Clé | une seule, `BANK_DATA_ENCRYPTION_KEY` (32 octets hex/base64), secret Vercel |
| Format | `v1:<iv>:<tag>:<ct>` (base64url) — **aucun identifiant de clé** |
| Chiffrement / déchiffrement | côté serveur applicatif (`src/lib/banking.ts`), jamais en base |
| Écritures | `enregistrerRibAction` → RPC `enregistrer_coordonnees_bancaires` ; `creer_lot_virements` copie le chiffré dans `ordres_virements` (comparaison **par égalité de chiffré**) |
| Lectures | `transmettreLotPowensAction` déchiffre `ordres_virements.iban_chiffre` |
| Sauvegarde / restauration | dumps base (DR V2) : chiffrés + empreintes ; la clé n'est que dans Vercel / coffre DR |
| Autre usage de la clé | **même valeur** utilisée comme secret HMAC de l'état de retour Powens (constat `F-HMAC-BANK-STATE-FALLBACK`) |

### 1.3 Constats de l'audit

| # | Gravité | Constat | Traitement |
|---|---|---|---|
| A1 | P0 | Pas d'identifiant de clé dans le chiffré : changer la clé rend tout illisible, aucune rotation possible | §3-§5 |
| A2 | P0 | Pas de registre : impossible de prouver qu'une clé présentée (déploiement, restauration) est la bonne | §3, §9 |
| A3 | P1 | `iban_hash` = SHA-256 **non salé** de l'IBAN : avec les 4 derniers caractères en clair et le code banque/guichet connu, l'espace restant (~10¹¹) se parcourt hors ligne → l'empreinte révélait l'IBAN à quiconque lit la base | index aveugle HMAC-SHA256 (sous-clé HKDF de la clé active) |
| A4 | P1 | Clé de chiffrement réutilisée comme secret HMAC de l'état Powens | clé dédiée `BANK_OAUTH_STATE_HMAC_KEY`, replis conservés à la vérification |
| A5 | P1 | Sentry : `exception.values[].value` et `extra` non nettoyés ; aucun masquage IBAN / chiffré | §8 |
| A6 | P2 | Seeds de démonstration avec chiffrés factices `DEMO_NON_DECHIFFRABLE_…` | tolérés, comptés « illisibles » par l'inventaire |
| A7 | info | `service_role` n'a **aucun** droit direct sur les deux tables (ACL réconciliation V1) | le job passe par des RPC `SECURITY DEFINER` dédiées |

---

## 2. Exigences → couverture

| Exigence | Mécanisme |
|---|---|
| key version | identifiant `kN` dans chaque valeur (`v2:k2:…`) ; `v1` ≡ `k1` |
| rotation | ajout d'une clé, activation, rechiffrement par lots (`npm run bank-keys`) |
| migration progressive | lecture multi-clés ; job reprenable ; écritures concurrentes autorisées |
| rollback | réactivation de l'ancienne clé + rechiffrement inverse ; format `v1` pour un retour arrière du code |
| audit | journal append-only `journal_cles_chiffrement_bancaire` (compteurs uniquement) |

## 3. Key ring

```
BANK_DATA_ENCRYPTION_KEYS          = "k2:<32 o base64|hex>,k1:<32 o>"   (secret)
BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID = "k2"                                 (non secret)
BANK_DATA_ENCRYPTION_KEY           = clé historique k1                    (secret, existant)
BANK_DATA_ENCRYPTION_WRITE_FORMAT  = v1 | v2                              (optionnel)
```

- **Active** : seule clé qui chiffre ; **précédentes** : déchiffrement uniquement.
- `BANK_DATA_ENCRYPTION_KEY` seule ⇒ trousseau `{k1}`, écriture **v1** : comportement octet pour octet identique à l'avant-V1 (déploiement neutre, retour arrière du code sûr).
- Échec fermé (`src/lib/banking-keyring.ts`, `lireTrousseauBancaire`) : aucune clé ; clé ≠ 32 octets ; identifiant invalide ; doublon ; deux identifiants pour la même clé ; `k1` du trousseau ≠ `BANK_DATA_ENCRYPTION_KEY` ; plusieurs clés sans `ACTIVE_KEY_ID` ; active absente ; format `v1` avec une active ≠ `k1`. Aucun message ne contient de clé (test dédié).
- **Aucune clé en base.** Le registre `public.cles_chiffrement_bancaire` ne porte que : identifiant, algorithme, statut (`preparee` → `active` → `dechiffrement` → `compromise` / `retiree`), dates, motif et une **empreinte de contrôle** `HMAC-SHA256(clé, "ELSATIA-BANK-KCV-v1:<id>")` (publiable : ne permet ni de retrouver la clé ni de déchiffrer). Une seule `active` (index unique partiel). RLS activée, **aucun** droit pour `anon`, `authenticated`, `service_role` : accès par RPC uniquement.
- Le registre et l'environnement sont confrontés (`controlerTrousseau`) : active divergente, empreinte différente, clé nécessaire aux données mais absente, données sous clé retirée / non enregistrée ⇒ refus.

## 4. Format des données

| Format | Forme | Clé | AAD |
|---|---|---|---|
| v1 (historique) | `v1:<iv>:<tag>:<ct>` | toujours `k1` | aucune |
| v2 | `v2:<kN>:A256GCM:<iv>:<tag>:<ct>` | `kN` | `"v2:<kN>:A256GCM"` |

iv 12 octets, tag 16 octets, base64url sans remplissage. L'en-tête (version, clé, algorithme) est **public** et **authentifié** (AAD GCM) : le modifier (autre clé, rétrogradation `v2`→`v1`, autre algorithme) fait échouer le déchiffrement — testé. SQL : `chiffre_bancaire_format()` / `chiffre_bancaire_cle()` lisent l'en-tête sans rien déchiffrer.

**Garde d'écriture** (trigger `garde_chiffres_bancaires`, 2 tables) : refuse (`22023`, `BANK_KEY_NOT_WRITABLE`) toute valeur lisible dont la clé est inconnue du registre, `retiree` ou `compromise` ; dérive `iban_hash_cle` du chiffré ; refuse un changement de clé ou de format de l'IBAN sans recalcul de l'index aveugle. Les valeurs hors format (démo) restent tolérées comme avant.

## 5. Rotation K1 → K2 (procédure opérateur)

Outil : `npm run bank-keys -- <commande>` (`scripts/bank-keys/bank-keys.mjs`). Cible base : `--psql-db <base locale>` ou `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Trousseau lu dans l'environnement du processus, jamais en argument, jamais affiché. Sortie JSON sans secret ; codes `0` succès, `1` incomplet, `2` usage, `3` refus.

| Étape | Action | Effet |
|---|---|---|
| 0 | Déployer cette version **sans changer l'environnement** | écritures v1 inchangées ; registre `k1 active` créé par la migration |
| 1 | `bank-keys register --key-id k1` (env historique) | atteste l'empreinte de k1 (`attestee`) |
| 2 | Générer K2 (`openssl rand -base64 32`), la déposer au **coffre DR** (2 dépositaires) | — |
| 3 | Vercel : `BANK_DATA_ENCRYPTION_KEYS=k2:<K2>` (k1 reste fournie par `BANK_DATA_ENCRYPTION_KEY`), `BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID=k2` ; `bank-keys register --key-id k2` | k2 `preparee` (écritures sous k2 déjà acceptées par la garde) |
| 4 | Redéployer GP | **nouvelles écritures : `v2:k2`** ; anciennes : lues avec k1 |
| 5 | `bank-keys activate --key-id k2 --yes` | registre : k2 `active`, k1 `dechiffrement` ; journal `activation` |
| 6 | `bank-keys status` | doit être vert (un pod resté sur l'ancien env est signalé `ACTIVE_DIVERGENTE`) |
| 7 | `bank-keys rotate [--batch 200]` | rechiffre K1 → K2 (2 tables × IBAN/BIC), index aveugle recalculé ; relançable à volonté |
| 8 | `bank-keys verify --strict` | déchiffre **tout** sans écrire ; `RESTAURATION_DECHIFFRABLE` attendu |
| 9 | Après la période de rétention des sauvegardes contenant k1 : `bank-keys retire --key-id k1 --yes` puis retirer `BANK_DATA_ENCRYPTION_KEY` | refusé tant qu'une valeur dépend de k1 (`BANK_KEY_STILL_IN_USE`) |

Job de rechiffrement (`src/lib/banking-rotation.ts`, `executerRechiffrement`) :
1. contrôle du trousseau contre le registre (refus fermé `TROUSSEAU_REFUSE`) ;
2. `chiffres_bancaires_a_rechiffrer(cible, format, curseur, limite)` : valeurs lisibles **pas encore** sous (clé active, format), curseur stable `ressource/id/colonne` ;
3. déchiffrement en mémoire, chiffrement sous la cible, index aveugle si IBAN de RIB ;
4. `chiffres_bancaires_rechiffrer_lot(cible, format, lot)` : **une transaction**, chaque ligne en **compare-and-swap** (`where colonne = ancien`), cible re-vérifiée (`active` du registre), une ligne de journal par lot ;
5. une valeur indéchiffrable n'est **jamais** réécrite : listée dans `echecs`, run `incomplet` (code 1) ;
6. seconde passe automatique pour les conflits (ligne modifiée entre lecture et écriture).

Interaction métier : `creer_lot_virements` compare le chiffré lu par l'application à celui du RIB. Si un lot est préparé pendant que son RIB est rechiffré, la RPC répond « RIB absent, modifié ou non vérifié » : **échec fermé**, une nouvelle tentative réussit (le RIB n'a pas changé). Aucun ordre n'est créé avec un chiffré périmé.

## 6. Interruption

Garanties : chaque valeur est **à tout instant** soit l'ancien chiffré, soit le nouveau, tous deux lisibles par le trousseau (k1 reste disponible jusqu'au retrait, qui exige 0 valeur restante). La reprise repart du début : la base ne renvoie que ce qui reste.

| Scénario (90 valeurs, lots de 9) | Vitest (magasin mémoire) | PostgreSQL réel (CLI) |
|---|---|---|
| arrêt à **10 %** (1 lot) | 81 restantes, tout lisible, reprise → `termine` | idem ; `verify` = `{k1: 81, k2: 9}` ; `retire k1` refusé |
| arrêt à **50 %** (5 lots) | 45 restantes, idem | idem (`{k1: 45, k2: 45}`) |
| arrêt à **90 %** (9 lots) | 9 restantes, idem | idem (`{k1: 9, k2: 81}`) |
| panne **avant** validation d'un lot | lot annulé en bloc, reprise complète | — |
| panne **après** validation (réponse perdue) | aucun double chiffrement, reprise complète | — |
| **SIGKILL** du processus au 30ᵉ lot (lots de 1) | — | 90 valeurs intactes, `verify` vert, reprise → `{k2: 90}` |
| deux jobs **simultanés** | somme des rechiffrements = 90, aucune corruption | idem (lots de 3 et 5) |
| écriture concurrente pendant un lot | 1 conflit, ligne intacte, reprise à la 2ᵉ passe | — |

## 7. Mauvaise clé

| Cas | Résultat |
|---|---|
| clé k2 de l'environnement ≠ clé enregistrée | `status`/`rotate`/`verify` : refus `EMPREINTE_DIFFERENTE` (code 3) ; `register` refusé par la base ; **aucun octet réécrit** (empreinte md5 des chiffrés identique avant/après) |
| k1 fausse **non attestée** | déchiffrement refusé (`AUTHENTIFICATION_ECHOUEE`) pour chaque valeur ; aucune réécriture ; run `incomplet` |
| clé absente du trousseau | `CLE_INCONNUE` ; contrôle `CLE_MANQUANTE` |
| en-tête / iv / tag / contenu altéré, rétrogradation de format | exception — jamais de clair partiel (GCM authentifie tout, en-tête compris) |
| valeur hors format | `FORMAT_INVALIDE` |

Aucun chemin ne renvoie un clair non authentifié.

## 8. Logs / Sentry

- Moteur et CLI : rapports réduits à identifiants de clé, compteurs et identifiants de ligne ; `resumer()` retire `chiffre`, `ancien`, `nouveau`, `iban_hash` de toute sortie ; erreurs psql réduites au message PostgreSQL (jamais l'entrée).
- Journal SQL : `details` = compteurs ; pgTAP vérifie l'absence de tout motif de chiffré.
- Sentry (`src/lib/sentry-nettoyage.ts`, serveur / edge / client) : **nouveau** masquage des IBAN complets (avec ou sans espaces), des chiffrés `v1:` / `v2:kN:A256GCM:` et des entrées de trousseau `kN:<clé>` dans `message`, **`exception.values[].value`** et **`extra`** (non nettoyés auparavant), URL, en-têtes, fils d'Ariane. Les 4 derniers caractères (« •••• 0189 ») restent lisibles.
- Preuves : Vitest « journaux : aucun secret » (console espionnée, rapports, progression, journal) ; intégration : toutes les sorties stdout/stderr de toutes les invocations CLI des 11 scénarios analysées — aucune clé (base64 et hex), aucun IBAN de test, aucun BIC en clair, aucun fragment de chiffré.

## 9. Backup / Restore

**Dépendance** : une sauvegarde de la base contient les chiffrés, l'index aveugle et le **registre** (identifiants, statuts, empreintes) — **jamais** les clés. Les clés vivent dans Vercel et le coffre DR. Une restauration n'est exploitable qu'avec **toutes** les clés référencées par les données restaurées, y compris des clés retirées depuis.

Règles :
1. toute clé (active, déchiffrement, compromise, **retirée**) reste scellée au coffre DR tant qu'une sauvegarde qui en dépend est dans la période de rétention ;
2. après toute restauration et avant de rouvrir les paiements : `npm run bank-keys -- verify --strict` contre la base restaurée (ajouté au runbook DR V2) ;
3. le contrôle DB verify n° **38** (pack Preview) exige registre, une active, gardes, RPC fermées et 0 donnée sous clé interdite.

Preuve PostgreSQL réelle (`pg_dump -Fc` pris à **50 %** de rotation, rotation terminée ensuite, `pg_restore` dans une base neuve) :

| Trousseau présenté à la base restaurée | Verdict |
|---|---|
| k1 + k2 corrects | `RESTAURATION_DECHIFFRABLE` ; reprise de rotation → `{k2: 90}` |
| k2 seule (k1 détruite après rotation) | **détecté** : `CLE_MANQUANTE : k1`, code 3 |
| k2 fausse | **détecté** : `EMPREINTE_DIFFERENTE` |
| clé d'un autre environnement (k3) | **détecté** : refus (code 3) |

## 10. Incident : compromission de clé

Déclencheur : fuite suspectée d'une valeur de clé (`BANK_DATA_ENCRYPTION_KEY[S]`), d'un export Vercel, du coffre, ou d'un poste dépositaire. **SEV1** (DR V2 §1).

| # | Action | Commande / lieu | Preuve |
|---|---|---|---|
| 1 | Ouvrir l'incident, figer les virements si nécessaire | mode sûr (`docs/runbooks/incident/`) ; ne PAS supprimer la clé compromise (elle seule relit les données) | — |
| 2 | **Nouvelle clé** kN+1, coffre DR | `openssl rand -base64 32` | — |
| 3 | Trousseau = nouvelle + toutes les existantes, active = nouvelle ; `register` ; redéployer ; `activate --yes` | Vercel + `bank-keys` | `status` vert |
| 4 | **Désactiver l'ancienne** | `bank-keys compromise --key-id kN --reason "<ticket>" --yes` | registre `compromise` ; la base **refuse** désormais toute écriture sous kN (testé) ; réactivation impossible |
| 5 | **Re-chiffrement** | `bank-keys rotate` puis `verify --strict` | `restants: 0` |
| 6 | Retrait | `bank-keys retire --key-id kN --yes` puis retrait de kN de l'environnement | refusé tant qu'une valeur dépend de kN |
| 7 | **Audit** | `journal_cles_chiffrement_bancaire` (activation, compromission avec nombre de valeurs exposées, chaque lot, retrait) + `journal_paiements_bancaires` (ordres transmis pendant la fenêtre) | export joint au ticket |
| 8 | Sauvegardes antérieures | elles restent chiffrées sous kN (compromise) : traiter leur accès comme exposé ; kN reste scellée au coffre jusqu'à leur expiration | — |
| 9 | Post-mortem, `npm run verify:secrets`, état Powens : poser/rotater `BANK_OAUTH_STATE_HMAC_KEY` | — | — |

Si la clé **active** est compromise, l'étape 3 précède obligatoirement l'étape 4 (la base refuse de déclarer compromise la clé active).

## 11. Tests

| Suite | Contenu | Résultat |
|---|---|---|
| pgTAP `banking_encryption_key_rotation_v1` | objets, RLS, droits (anon / authenticated / service_role), lecture d'en-tête, registre (attestation, mauvaise clé, empreinte dupliquée, une seule active), garde d'écriture, index aveugle, inventaire, activation, curseur, CAS, compromission, retrait, retour arrière, journal append-only sans chiffré, garde du mode sûr | **75/75** |
| pgTAP suite complète (V8 + migration) | 164 fichiers | **155 propres, 8 134 ok** ; base V8 sans migration : 154 propres, 8 059 ok ; **0 écart** sur les 163 suites existantes (comparaison fichier par fichier) ; les 9 non propres sont ceux déjà connus en V8 (stub pgsodium, Studio dédié, Tools cloud sync) |
| Vitest `banking-keyring` | configuration (10 cas d'échec fermé), compatibilité avec le code d'avant V1, format, iv aléatoire, mauvaise clé, clé absente, 5 altérations, 6 formats invalides, KCV, index aveugle | ✅ |
| Vitest `banking-rotation` | rotation complète, interruptions 10/50/90 %, pannes avant/après validation, conflit concurrent, deux jobs simultanés, mauvaise clé (2 cas), restauration sans clé, empreinte différente, active divergente, retour arrière K2→K1→v1 relu par l'ancien code, compromission/retrait, journaux | ✅ |
| Vitest `banking`, `sentry-nettoyage` | API applicative (v1 inchangé, bascule v2, échec sans clé, état Powens clé dédiée + replis), masquage Sentry | ✅ |
| Vitest racine | 208 fichiers | **2 638 passés**, 36 ignorés (préexistants), 0 échec |
| Intégration PostgreSQL réelle `npm run test:bank-keys` (`BANK_KEYS_IT_BASE=<V8>`) | **upgrade** (données v1 écrites par le code d'avant V1 puis migration), procédure complète, 10/50/90 %, SIGKILL, concurrence, mauvaise clé, **rollback**, **DR** (dump/restore), journaux | **12/12, ×3** |
| DB verify Preview | contrôle 38 | vert sur V8 + migration ; échec propre sur V8 seul (« registre absent ») |
| `typecheck` / `eslint` / `build:gestion-pro` | | 0 erreur / 0 erreur (15 avertissements préexistants, aucun dans les fichiers modifiés) / ✅ |
| `verify:migrations`, `verify:train-expectations`, `test:preview-pack`, `test:seeds`, `verify:env-manifest`, `test:env-manifest`, `verify:secrets` | | ✅ 372 · ✅ · 31/31 · 48/48 · OK · 67/67 · aucun secret |

**Upgrade** : prouvé sur données réelles du schéma V8 (90 valeurs v1 + parents réels lots / notes de frais) : migration appliquée sans réécrire une ligne, `iban_hash_cle` NULL partout, ancien code toujours capable de tout relire, inventaire `{k1/v1: 90}`.

**Rollback** :
- *code* : tant que l'environnement n'a pas `BANK_DATA_ENCRYPTION_KEYS`, les écritures restent v1 + SHA-256 : revenir au code d'avant V1 est sans effet. Après bascule v2 : `ACTIVE_KEY_ID=k1`, `activate k1`, `rotate`, puis `WRITE_FORMAT=v1`, `rotate` → tout redevient v1/SHA-256, relu par l'ancien code (testé) ;
- *clé* : une clé `dechiffrement` se réactive (`activate`) et le job rechiffre en sens inverse (testé) ; une clé `compromise` ou `retiree` ne peut pas être réactivée ;
- *migration* : additive ; elle ne réécrit aucune donnée existante.

**DR** : §9.

Reproduire :

```bash
pg_ctlcluster 16 main start; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
createuser -s root; createdb root                                       # psql local sans su (harnais d'intégration)
git worktree add /tmp/v8 53b4bc7 && /tmp/v8/scripts/local-postgres-bootstrap/rebuild_db.sh bk_base   # V8 seule : 371/371
scripts/local-postgres-bootstrap/rebuild_db.sh bk_full                  # V8 + migration : 372/372
scripts/qualification/pgtap-run-v3.sh bk_full                           # 155/164 propres, 8 134 ok
scripts/qualification/pgtap-run-v3.sh bk_base                           # 154/164, 8 059 ok (nouvelle suite en échec : attendu)
BANK_KEYS_IT_BASE=bk_base npm run test:bank-keys                        # 12/12
npx vitest run src/lib/banking-keyring.test.ts src/lib/banking-rotation.test.ts src/lib/banking.test.ts src/lib/sentry-nettoyage.test.ts
psql -At -F'|' -d bk_full -f docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql   # contrôle 38 vert
```

## 12. Manifeste d'environnement

| Variable | Statut | Secret | DR |
|---|---|---|---|
| `BANK_DATA_ENCRYPTION_KEY` | requise (clé historique k1) ; description et note DR mises à jour | oui | critique |
| `BANK_DATA_ENCRYPTION_KEYS` | **nouvelle**, requise dès la première rotation ; motif de valeur contrôlé (valeur jamais affichée) | oui | **critique** (ajoutée au registre DR) |
| `BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID` | **nouvelle**, obligatoire si plusieurs clés ; motif `^k[1-9][0-9]{0,5}$` | non | — |
| `BANK_DATA_ENCRYPTION_WRITE_FORMAT` | **nouvelle**, optionnelle (`v1`/`v2`) — retour arrière du code | non | — |
| `BANK_OAUTH_STATE_HMAC_KEY` | **nouvelle**, recommandée si paiements bancaires | oui | — |

Constats : `F-DR-BANK-KEY-VERSIONING` (P0) → **fixed** ; `F-HMAC-BANK-STATE-FALLBACK` reste *detected* (clé dédiée disponible ; replis à retirer 7 jours après sa pose). `.env.example`, `.env.local.example`, `.env.preview.example` : variables vides, aucune valeur. Inventaire Preview régénéré.

## 13. Risques résiduels et décisions

| # | Sujet | État |
|---|---|---|
| R1 | `remises_banque.compte_bancaire` : texte libre en clair, **aucun chemin d'écriture** dans l'application ni les RPC | P2 — à supprimer ou chiffrer si un écran l'alimente un jour |
| R2 | Replis de vérification de l'état Powens (`BANK_DATA_ENCRYPTION_KEY`, `POWENS_CLIENT_SECRET`) | P1 existant, chemin de sortie documenté (§12) |
| R3 | Rotation exécutée par un opérateur (pas de cron) | choix volontaire : opération sensible, journalisée ; politique de fréquence à fixer par le propriétaire |
| R4 | Débit à grand volume via PostgREST non mesuré (lots ≤ 1 000, une transaction par lot) | les volumes réels (quelques milliers de RIB) restent très en deçà ; à mesurer en Preview |
| R5 | Préparation d'un lot pendant le rechiffrement de son RIB | échec fermé « RIB modifié », nouvelle tentative OK (§5) |
| R6 | Exécutions Preview / Production | **NOT PROVEN** ici (aucun accès distant) : étapes §5.0-§5.1 à jouer en Preview avant Production |
| R7 | Le mode sûr « lecture seule » bloque aussi la rotation | voulu ; contournement opérateur tracé existant (`elsatia.incident_contournement`) |

## 14. Verdict

Toutes les exigences (key version, rotation, migration progressive, rollback, audit, format, interruption 10/50/90 %, mauvaise clé fermée, logs, backup/restore détecté, procédure de compromission, tests pgTAP / Vitest / intégration / upgrade / rollback / DR, manifeste) sont implémentées et prouvées sur PostgreSQL réel, sans régression sur le train V8.

**ELSATIA BANKING ENCRYPTION LOCALLY QUALIFIED**

Réserve : exécution Preview / Production non prouvée (R6) — la qualification est locale, comme son nom l'indique.
