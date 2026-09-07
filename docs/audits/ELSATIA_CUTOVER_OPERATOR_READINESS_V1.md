# ELSATIA — Cutover Production : préparation opérateur (V1)

- **Date** : 2026-09-07
- **Branche d'audit** : `audit/cutover-operator-readiness-v1`
- **Cible code annoncée** : `996be15`
- **Nature du lot** : audit + préparation + tests **locaux** uniquement

> **Aucune migration Production n'a été exécutée.** Aucune écriture Production, aucun
> déploiement, aucune modification Stripe Live, DNS, ou second admin. La totalité des
> tests a été rejouée sur une pile Supabase **locale et jetable** (`elsatia-cutover-t2t18`,
> ports 583xx), volontairement isolée de la pile de développement `btp-platform`.

---

## 1. Synthèse : les deux verdicts

| Verdict | Valeur | Motif |
|---|:--:|---|
| **OPERATOR READY** | **YES** | Poste utilisable ; suite T1→T18 verte (16 PASS, 1 SKIP non bloquant, 1 bloqué non bloquant) ; sentinelles écrites et testées ; outillage de sauvegarde prêt ; répétition 210→263 réussie. |
| **PRODUCTION CUTOVER READY** | **NO** | 5 bloquants externes non fermés, tous ACTION JULIEN (§9). |

Cette dissociation est conforme à l'attendu : le poste et la procédure sont prêts ;
ce qui manque relève de décisions et d'accès qui n'appartiennent pas à ce lot.

---

## 2. ⚠ Anomalie majeure : la cible `996be15` n'est pas sur la branche de release

C'est le point le plus important de ce lot. Il invalide l'hypothèse de départ.

| Constat | Valeur |
|---|---|
| `release/commercialisation-v1` (local) | `8fe737e` |
| `origin/release/commercialisation-v1` | `fcdd4e7` — **daté du 2026-08-26** |
| Retard local / origin | **3 commits**, fast-forward pur possible |
| `996be15` ancêtre de la branche release ? | **NON** (ni local, ni origin) |
| `996be15` ancêtre de `main` ? | **NON** |
| Branche dont `996be15` est le **tip** | `feat/elsatia-commercial-canonical-r1-r2-r3-v1` (et son origin) |
| `996be15` daté du | **2026-09-05** |

**Conséquence** : `release/commercialisation-v1` est en retard de **dix jours** sur la cible
et ne contient aucun des 53 correctifs du delta. Déployer la branche release livrerait
un code **antérieur** au schéma migré — incohérence applicative immédiate.

### 2.1 Incohérence auto-référentielle des documents

`996be15` porte le message `docs(ops): refresh cutover target to 1d15289`, et `1d15289`
est son **parent direct**. La chaîne complète suit ce motif :

```
996be15  docs(ops): refresh cutover target to 1d15289
1d15289  fix(email): align app url and credit note wording
ea26d97  docs(ops): refresh cutover target to b371641
b371641  fix(ai): disable response storage and align OpenAI RGPD docs
```

Autrement dit : **si l'opérateur checkout `996be15`, les runbooks qu'il y lit désignent
`1d15289` comme cible** — c'est-à-dire le commit précédent. Les documents ne peuvent
structurellement jamais se désigner eux-mêmes.

Les trois documents de l'arbre de travail courant référencent bien `996be15`
(12, 5 et 7 occurrences respectivement) — la cohérence est correcte **hors** de `996be15`.

**ACTION JULIEN — décision requise avant T0** : arbitrer la cible réelle
(`996be15` documentaire vs `1d15289` fonctionnel), et déterminer quelle branche
sera effectivement déployée.

---

## 3. Reconstruction du delta de migrations — **confirmée**

Les trois chiffres annoncés (ledger 210 / dernière `20260824000231` / delta 53) sont
**mutuellement cohérents**, ce qu'une lecture naïve ne montre pas : la borne
`20260824000231` est au **rang 223** du dépôt, pas au rang 210.

L'explication est une **application désordonnée** en Production :

| Rangs (ordre lexical, dépôt @ `996be15`) | Nombre | État Production |
|---|:--:|---|
| 1 → 194 | 194 | appliquées |
| **195 → 207** | **13** | **NON appliquées** (ligne TARIFS-V2 / admin / avenants) |
| 208 → 223 | 16 | appliquées (ligne terrain-mobile) |
| **224 → 263** | **40** | **NON appliquées** |
| **Total appliqué** | **210** | ✔ cohérent avec le ledger annoncé |
| **Total en attente** | **53** | ✔ cohérent avec le delta annoncé |

**Vérification indépendante** : la reconstruction du jeu de 53 donne
`20260815000200_reconciliation_pre_tarifs_v2.sql` en premier et
`20260818000205_securiser_cout_horaire_employe.sql` en **6ᵉ** position — ce qui
correspond **exactement** à la table d'ordre d'exécution du préflight (§2.3).
La reconstruction est donc juste.

**Preuve la plus forte de ce lot** : la baseline locale reconstruite affiche
`ledger = 210` et `max(version) = 20260824000231`, soit **exactement** l'état
Production annoncé. La répétition T17 est donc une vraie répétition, pas une simulation.

### 3.1 Fenêtre de risque entre #6 et #7

`…000219_terrain_mobile_v1d2_correction_valider_preuve_pointage` (rang 211) est
**déjà appliquée** en Production et référence `cout_horaire`. La migration #6
(`…000205`) supprime `employes.cout_horaire`. Entre #6 et #7 (`…000206`), une fonction
déjà présente en Production référence donc une colonne disparue.

En local, la séquence complète passe sans erreur (T17). Le risque est celui d'une
**interruption entre #6 et #7** : l'état intermédiaire n'est pas fonctionnel.
→ **#6 et #7 doivent être appliquées dans la même transaction / le même geste**,
sans point d'arrêt entre les deux.

---

## 4. Poste opérateur — outils et versions

| Outil | Version | État |
|---|---|:--:|
| `git` | 2.50.1 (Apple Git-155) | ✅ |
| `node` | v24.18.0 | ✅ |
| `npm` | 11.16.0 | ✅ |
| `npx` | 11.16.0 | ✅ |
| `docker` | 29.6.2 (démon actif) | ✅ |
| `openssl` | LibreSSL 3.3.6 | ✅ |
| `supabase` CLI | **2.109.1** (via `node_modules/.bin`) | ✅ |
| `vercel` CLI | **59.11.7** (via `npx vercel@latest`) | ✅ |
| `psql` | — | ❌ **absent du PATH** |
| `pg_dump` | — | ❌ **absent du PATH** |
| `pg_restore` | — | ❌ **absent du PATH** |

`supabase` et `vercel` ne sont pas dans le PATH global mais sont **disponibles et
fonctionnels** via `npx` — ce n'est pas un blocage.

### 4.1 libpq — blocage réel

Vérification effectuée : **aucun** `psql` sur le disque, **pas de Homebrew installé**,
pas de keg `libpq`/`postgresql`, pas de `Postgres.app`.

- **Contournement local (utilisé pour ce lot)** : `psql` **17.6** et `pg_dump` sont
  disponibles dans le conteneur Supabase via `docker exec`. Cela a suffi pour T2, T3,
  T17, T18 et les sentinelles.
- **Pour opérer sur Production, ce contournement ne suffit pas** : B2/B4/B7 exigent
  `pg_dump`/`pg_restore` sur l'hôte, pointant vers une URL distante.

**ACTION JULIEN** (installation Homebrew = `sudo`, hors de portée de ce lot) :

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc
```

Contrôle attendu ensuite : `psql --version`, `pg_dump --version`, `pg_restore --version`
doivent tous répondre en **17.x** (aligné sur le serveur, PostgreSQL 17.6).

---

## 5. Suite T1 → T18, rejouée sur `996be15`

Worktree détaché `…/.worktrees/cutover-operator-readiness` @ `996be15`,
`node_modules` clonés en copy-on-write APFS (`cp -Rc`) — coût disque ≈ 0.

| # | Test | Commande | Résultat | Verdict |
|:--:|---|---|---|:--:|
| T1 | Intégrité du ledger | `npm run verify:migrations` | `263 migrations valides, noms et horodatages uniques` | **PASS** |
| T2 | Base fraîche 263 | `supabase db reset` (pile isolée) | ledger `263`, max `20260905000265`, 0 erreur | **PASS** |
| T3 | pgTAP complet | `supabase test db` | `Files=54, Tests=1162` — `Result: PASS` | **PASS** |
| T4 | Typecheck | `npm run typecheck` | 0 erreur (racine + `apps/tools`) | **PASS** |
| T5 | Lint | `npm run lint` | 0 erreur, 3 warnings `<img>` | **PASS** |
| T6 | Tests unitaires | `npm run test` | 92 fichiers / **806 tests**, + tools 20 / **107** | **PASS** |
| T7 | Secrets | `npm run verify:secrets` | `1304 fichiers suivis contrôlés, aucun secret reconnu` | **PASS** |
| T8 | Prix Stripe | `npm run verify:stripe-prices` | aucune `STRIPE_PRICE_*` dans le shell → SKIP | **SKIP** (non bloquant) |
| T9 | Build | `npm run build` | succès racine + `apps/tools` | **PASS** |
| T10 | Multi-tenant | 3 suites `isolation_multitenant_*` | incluses dans T3 | **PASS** |
| T11 | Auth / AAL2 | `platform_aal2_role_integrity_v1` | incluse dans T3 | **PASS** |
| T12 | Entitlements Tools | `elsatia_tools_r8/r9/r10` | incluses dans T3 | **PASS** |
| T13 | Billing / capacité | 6 suites `capacity_stripe_r2*`, `modules_a_la_carte_r3`, `active_person_capacity_r1` | incluses dans T3 | **PASS** |
| T14 | Global owner / support | 3 suites `platform_support_*` | incluses dans T3 | **PASS** |
| T15 | Colors | `colors_canonical_integration_v1` | incluse dans T3 | **PASS** |
| T16 | E2E | `npm run test:e2e` | Playwright 1.62.1 présent, **aucun navigateur installé** | **BLOQUÉ** |
| T17 | **Restore → 263** | baseline 210 puis `supabase migration up --include-all` | 53 appliquées en **3 s**, ledger `263` | **PASS** |
| T18 | **Drift Fresh ↔ Restore** | `pg_dump -s -n public` des deux bases | **drift applicatif = 0** | **PASS** |

**Bilan : 16 PASS · 1 SKIP · 1 BLOQUÉ · 0 FAIL.**

### 5.1 Écarts par rapport au préflight

- **T3** : 54 fichiers de suites, là où le préflight annonce **55**. À réconcilier
  (suite retirée ou renommée) — sans impact sur le résultat, qui est `PASS`.
- **T18** : le `diff` brut affiche 30 lignes. Après neutralisation du jeton `\restrict`
  (aléatoire à chaque `pg_dump`) et tri, les deux schémas sont **strictement identiques**.
  Seul écart réel : la **position ordinale** de `entreprises.abonnement_essai_debut`
  (49 en base fraîche, 89 après restauration) — conséquence normale d'un
  `add column` tardif. Aucun objet, type, ACL ou contrainte ne diffère.
  → **P2** : à ne pas confondre avec du drift ; ne concerne que les `select *` /
  `insert` sans liste de colonnes.
- **T16** : l'installation des navigateurs Playwright est un téléchargement d'environ
  500 Mo. Non lancé — hors périmètre d'un lot d'audit, et nécessite votre accord.
  Commande : `npx playwright install --with-deps chromium`.

---

## 6. Sentinelles pré-migration

Fichier : **`scripts/cutover/sentinels-pre-migration.sql`** — strictement en lecture
seule (`to_regclass`, `to_regprocedure`, `information_schema`, `pg_proc`). Exécutable
tel quel sur Production sans aucun effet de bord.

Construit à partir d'un balayage des 53 migrations en attente, à la recherche des
objets créés **sans `if not exists`** : 21 tables et 3 index nus identifiés.

**Testé sur la baseline locale 210 : les 26 sentinelles sont VERTES.**

| Groupe | Codes | Attendu |
|---|---|---|
| Tables créées sans garde | S01 → S21 | absentes |
| Index créés sans garde | S22 → S24 | absents |
| Prérequis migration #6 | S30 `employes.cout_horaire` | **présente** |
| Effet migration #7 | S31 `pointages.cout_horaire_applique` | absente |
| Branche conditionnelle #14 | S40 signature `plateforme_entreprises()` | diagnostic |

**S40 n'est pas un test mais un diagnostic** : sur la baseline reconstruite depuis le
dépôt, la fonction **ne porte pas** `option_ia`, donc le `drop function` conditionnel de
`…000232` ne se déclencherait pas. La Production réelle peut différer — c'est
précisément la raison d'être de cette migration. **S40 doit être relevée en Production**
et le résultat consigné avant T0.

---

## 7. Point irréversible — gate G1

**Premier point irréversible** : migration **#6**,
`20260818000205_securiser_cout_horaire_employe.sql`
→ `alter table public.employes drop column cout_horaire;`

C'est le **seul `drop column`** des 53. La donnée est recopiée au préalable dans
`public.employes_cout_horaire` (pas de perte), mais l'opération n'est pas réversible
par simple `down`.

### GATE G1 — GO / STOP AVANT MIGRATION #6

Aucune des cinq conditions n'est optionnelle. Une seule case non cochée = **STOP**.

| # | Condition | Preuve exigée | Rôle | ✅ |
|:--:|---|---|:--:|:--:|
| G1.1 | Sauvegarde validée | B7 restauré dans une base jetable, `count = 210` vérifié | A | ☐ |
| G1.2 | Sentinelles vertes | sortie de `sentinels-pre-migration.sql` sur Production, 26/26 OK, S40 relevée | B | ☐ |
| G1.3 | Tests verts | présent rapport, T1→T18 sans FAIL | A | ☐ |
| G1.4 | Responsables présents | rôles A, B, **C** joignables et confirmés | C | ☐ |
| G1.5 | Décision rollback prête | `BACKUP_ID` noté, procédure B7 relue à voix haute, seuil d'abandon fixé | C | ☐ |

> **#6 et #7 sont indissociables** (§3.1) : ne jamais s'arrêter entre les deux.

**Le rôle C prononce le GO. En son absence, le cutover ne démarre pas.**

---

## 8. Sauvegardes — B1 → B7

Fichier : **`scripts/cutover/backup-commands.sh`** (syntaxe bash validée, blocs
volontairement inertes — chaque commande est `echo`).

### 8.1 `BACKUP_ID` canonique

```
ELSATIA-PROD-CUTOVER-YYYYMMDD-HHMM
```
Heure locale Europe/Paris. **Tous** les artefacts (B1→B7) portent ce même identifiant.

| Réf | Objet | Sortie |
|:--:|---|---|
| B1 | Snapshot managé Supabase | `B1_snapshot_id.txt` |
| B2 | Dump logique chiffré AES-256 + SHA-256 | `B2_<ID>.dump.enc` + `.sha256` |
| B3 | Inventaire / copie Storage (13 buckets) | `B3_storage_inventaire.txt` |
| B4 | Métadonnées Auth (`--schema=auth`), chiffrées | `B4_auth_<ID>.sql.enc` |
| B5 | État pré-migration : sentinelles + ledger | `B5_sentinelles_avant.txt`, `B5_ledger_avant.txt` |
| B6 | Manifeste du backup_id | `B6_manifest.txt` |
| B7 | **Restauration de test** en base jetable | `count = 210` **attendu** |

`PROD_DB_URL` est fourni par l'opérateur dans le shell au moment du cutover et n'est
**jamais** écrit dans un fichier versionné. Destination des artefacts :
`/Volumes/ELSATIA-DEV/backups/<BACKUP_ID>` (volume externe, jamais le SSD interne).

> **B7 n'est pas facultatif.** Une sauvegarde non restaurée n'est pas une sauvegarde.
> Si B7 ne rend pas exactement 210, B2 est invalide → **STOP**.

---

## 9. Blockers

### P0 — bloquants du cutover

| # | Blocage | Responsable |
|:--:|---|---|
| P0-1 | **Cible code non tranchée** : `996be15` absent de la branche release ; incohérence auto-référentielle `996be15` → `1d15289` (§2) | **JULIEN** |
| P0-2 | **Branche de déploiement non définie** : `release/commercialisation-v1` est 10 jours en retard et ne porte pas le delta | **JULIEN** |
| P0-3 | **libpq absent**, pas de Homebrew → B2/B4/B7 impossibles sur Production (§4.1, `sudo`) | **JULIEN** |
| P0-4 | **Statut Supabase Pro non vérifié** : `SUPABASE_ACCESS_TOKEN` absent du shell, impossible de contrôler sans modification. Si plan Free → B1 et PITR indisponibles | **JULIEN** |
| P0-5 | **Rôle C (décideur GO/ROLLBACK) non nommé** — obligatoire avant T0 | **JULIEN** |

### P1 / P2

| # | Point | Impact |
|:--:|---|---|
| P1-1 | T8 non exécutable hors environnement portant les `STRIPE_PRICE_*` | à rejouer en Preview |
| P1-2 | T16 E2E bloqué (navigateurs Playwright absents, ~500 Mo) | couverture E2E non prouvée |
| P1-3 | SPF/DKIM/DMARC non testés (DNS non modifié, hors périmètre) | §11 |
| P2-1 | T3 : 54 suites vs 55 annoncées au préflight | à réconcilier |
| P2-2 | Position ordinale `abonnement_essai_debut` (49 vs 89) | cosmétique, §5.1 |

---

## 10. Rôles du cutover

| Rôle | Fonction | Titulaire | Obligatoire avant T0 |
|:--:|---|---|:--:|
| **A** | Opérateur principal — exécute les commandes | **ACTION JULIEN** | oui |
| **B** | Observateur DB — sentinelles, ledger, logs | **ACTION JULIEN** | oui |
| **C** | **Décideur GO / ROLLBACK** | **ACTION JULIEN** | **oui — impératif** |
| **D** | Validation fonctionnelle post-migration | **ACTION JULIEN** | oui |
| **E** | Communication (clients, statut) | **ACTION JULIEN** | non (recommandé) |

En contexte solo, A/B/D peuvent être cumulés. **C ne peut pas être cumulé avec A** :
celui qui exécute ne peut pas être celui qui arbitre l'arrêt.

---

## 11. Second admin plateforme — checklist post-cutover (T+45)

**Non activé dans ce lot** — préparation uniquement.

| # | Prérequis | État |
|:--:|---|---|
| 1 | Identité de la personne | **ACTION JULIEN** |
| 2 | Adresse e-mail dédiée (domaine `elsatia.fr`) | **ACTION JULIEN** |
| 3 | Compte Auth Supabase créé et e-mail confirmé | à faire T+45 |
| 4 | TOTP enrôlé sur ce compte | à faire T+45 |
| 5 | Session **AAL2** active au moment de l'appel RPC | impératif |
| 6 | RPC de promotion exécutée par un admin déjà AAL2 | à faire T+45 |
| 7 | Contrôle : `plateforme_lister_admins()` retourne 2 entrées | preuve |

Le socle est en place côté schéma : `…000237_platform_aal2_role_integrity_v1` impose
AAL2 sur les mutations plateforme sensibles, et `…000251_platform_lister_admins_statut_identite_v1`
expose le statut d'identité. Les deux sont dans le delta — donc **indisponibles tant que
le cutover n'a pas eu lieu**. Le second admin est bien une action **post-cutover**.

---

## 12. Supabase Pro — checklist Julien

Statut **non vérifiable** dans ce lot (aucun `SUPABASE_ACCESS_TOKEN` en environnement,
et toute vérification via dashboard sort du périmètre non-modificateur).

☐ Confirmer le plan du projet Production
☐ Si **Free** → **BLOCKER externe** : pas de backup managé (B1), pas de PITR
☐ Passer en **Pro** si nécessaire, avant toute planification de T0
☐ Vérifier que le backup managé est visible et daté
☐ Décider si le **PITR** est retenu (et sur quelle fenêtre)
☐ Contrôler les quotas (connexions, taille, bande passante)
☐ Activer les alertes projet

---

## 13. SPF / DKIM / DMARC — test à exécuter après correction DNS

**Aucune modification DNS effectuée.** Protocole prêt à jouer une fois la configuration
corrigée par Julien.

| # | Parcours | Déclencheur | Preuve attendue |
|:--:|---|---|---|
| 1 | Inscription | signup d'un compte de test | en-têtes : `spf=pass` `dkim=pass` `dmarc=pass` |
| 2 | Réinitialisation de mot de passe | « mot de passe oublié » | idem |
| 3 | Invitation | invitation d'un membre | idem |
| 4 | E-mail devis / facture | émission d'un devis puis d'une facture | idem + pièce jointe intègre |

Méthode : envoyer vers une boîte externe (Gmail), puis « Afficher l'original » et
relever les trois verdicts dans `Authentication-Results`. **Les trois doivent être
`pass` pour les quatre parcours** — soit 12 contrôles. Consigner les en-têtes bruts.

---

## 14. Espace disque

| Contrôle | Valeur |
|---|---|
| Seuil GO opérateur | ≥ 30 Gi |
| Mesuré en début de lot | **49 Gi** |
| Mesuré en fin de lot | **46 Gi** |
| Verdict | ✅ **GO** |

Le worktree de test a été créé avec `cp -Rc` (clone APFS copy-on-write) pour les
1,1 Go + 556 Mo de `node_modules` : coût disque réel ≈ 0.

---

## 15. Scan de secrets

- `npm run verify:secrets` (T7) : **1304 fichiers suivis contrôlés, aucun secret reconnu**.
- Fichiers produits par ce lot relus : aucun secret. `PROD_DB_URL` est exigé depuis
  l'environnement (`: "${PROD_DB_URL:?…}"`) et n'est jamais écrit.
- Les clés visibles pendant la session (`ANON_KEY`, `SERVICE_ROLE_KEY` de la pile locale)
  sont les **clés de démonstration publiques** de Supabase local, identiques sur toute
  installation. Elles ne sont **pas** reportées ici et n'ont aucune valeur.

---

## 16. Livrables de ce lot

| Fichier | Rôle |
|---|---|
| `docs/audits/ELSATIA_CUTOVER_OPERATOR_READINESS_V1.md` | le présent rapport |
| `scripts/cutover/preflight-check.mjs` | préflight poste opérateur, lecture seule |
| `scripts/cutover/sentinels-pre-migration.sql` | 26 sentinelles, lecture seule |
| `scripts/cutover/backup-commands.sh` | B1→B7, commandes exactes, inertes |
| `docs/runbooks/ELSATIA_CUTOVER_OPERATOR_CHECKLIST_V1.md` | checklist opérateur cochable |

Sortie du préflight sur ce poste : **17 OK / 9 WARN / 0 STOP → GO OPÉRATEUR**.
Les 9 WARN sont : `psql`/`pg_dump`/`pg_restore` absents, 5 variables d'environnement
non définies dans le shell, et l'arbre de travail non propre — tous attendus hors
fenêtre de cutover.

---

## 17. Verdict final

```
OPERATOR READY           : YES
PRODUCTION CUTOVER READY : NO
```

Le poste et la procédure sont prêts : la répétition complète 210 → 263 a été jouée
localement, sans erreur, avec un drift applicatif nul. Ce qui manque n'est plus
technique mais décisionnel — cinq points P0, tous ACTION JULIEN, dont le plus
structurant est **l'arbitrage de la cible de code** (§2), qui doit être tranché avant
toute planification de T0.
