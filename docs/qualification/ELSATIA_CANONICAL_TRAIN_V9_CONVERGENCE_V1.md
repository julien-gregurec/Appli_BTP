# ELSATIA — Train canonique V9 — Préparation de la convergence — V1

| | |
|---|---|
| Date | 02/10/2026 |
| Base obligatoire | `integration/elsatia-canonical-train-v8` @ `53b4bc76` — 371 migrations, dernière `20260928000812` |
| Preview hébergée (déclarée) | 372/372, dernière `20261002000813_plateforme_annuaire_lecture_pure.sql` |
| Dépôt inspecté | 362 branches distantes, 4 `refs/pull/*`, tags, `git log --all`, disque du conteneur |
| Branche `integration/elsatia-canonical-train-v9` | **non créée** (voir verdict) |
| Preview / Production / Vercel | **aucune action** |

## Verdict

# ELSATIA CANONICAL TRAIN V9 BLOCKED

**Cause unique et bloquante : la migration `20261002000813_plateforme_annuaire_lecture_pure.sql`
est introuvable.** L'ordre obligatoire est V8 → 813 → 901 → nouvelles migrations, et aucune
migration ≤ 813 ne peut être ajoutée après coup. Sans le fichier 813, la V9 ne peut donc pas
démarrer. Construire une V9 sans elle produirait un train **divergent de la Preview hébergée**,
et l'insertion ultérieure de 813 serait précisément l'« ajout après coup » interdit.

Recherches effectuées (toutes négatives) :

| Source | Résultat |
|---|---|
| 362 branches distantes (`git ls-tree` par nom et par horodatage `2026100200081*`) | absente |
| `refs/pull/1..4`, tags | absente |
| `git log --all` (messages, contenus `-S`) et `git grep` sur toutes les branches (`annuaire_lecture_pure`, `lecture_pure`) | seules occurrences : deux rapports qui constatent son absence (`ELSATIA_LEGAL_CONSENT_TRAIN_INTEGRATION_PREP_V1`, `ELSATIA_STRIPE_READINESS_PORT_PLAN_V1`) |
| Disque du conteneur (`/`, `*.sql`) | absente |
| Preview hébergée (`supabase_migrations.schema_migrations.statements` contient le SQL appliqué) | **inaccessible** : aucun identifiant Supabase/Vercel dans la session, réseau Supabase refusé (`api.supabase.com` → 000) — et la mission interdit toute action sur la Preview |

Les trois commits sources désignés par la mission sont également **absents du dépôt** (aucun
objet, aucune ref ne les contient) :

| Candidat | SHA | État |
|---|---|---|
| Onboarding fix | `c73adf98` | **introuvable** |
| Annuaire hotfix B | `4cd9bec4` | **introuvable** — très probablement la source de la 813 (même domaine « annuaire ») |
| Security Residual V2 | `71c5291` | **introuvable** |

### Condition de levée

Pousser sur le dépôt distant, depuis le poste ou la session qui les a produits, une branche
contenant **au minimum** `4cd9bec4` (annuaire hotfix B, avec `20261002000813`), et idéalement
`c73adf98` et `71c5291`. Le plan du §3 est alors exécutable mécaniquement.

---

## 1. Étape 1 — Inventaire

Légende : **KEEP** = intégrer tel quel par merge (lignée V8 ou train antérieur inclus dans V8) ;
**PORT** = portage sémantique obligatoire (base `main` ou conflit de fond) ; **DROP** = sans valeur
pour le train (remplacé ou obsolète) ; **ALREADY_IN_V8** ; **MISSING** = introuvable.

Bases : `main` = `4d92ddbe` (29/07/2026, 178 migrations — **jamais de cherry-pick aveugle**) ;
V5 `f6399f15`, V6 `9102ec80`, V7 `547f0b6f` = trains antérieurs **contenus dans V8**.

### 1.1 Candidats nommés par la mission

| Candidat | Branche | SHA | Base | Migrations | Chevauchements / conflits | Valeur ajoutée réelle | Décision |
|---|---|---|---|---|---|---|---|
| Migration 813 | — | — | — | `20261002000813` | inconnu (fichier absent) ; même domaine que `optimistic-hopper` (`…000403` fonctions plateforme, `plateforme-fiche-entreprise.ts`) | appliquée sur la Preview : **obligatoire** | **MISSING — BLOQUANT** |
| Onboarding fix | — | `c73adf98` | — | ? | `createEntrepriseAction` est aussi modifiée par Legal Consent | inconnue | **MISSING** |
| Annuaire hotfix B | — | `4cd9bec4` | — | probablement 813 | idem 813 | inconnue | **MISSING** |
| Legal Consent | `claude/bold-allen-7mx7xz` | `d17177b4` | V8 | `20261002000901` | aucun conflit propre (préparation du 02/10) ; attendus du train volontairement à l'état V8 | preuve d'acceptation CGU/CGV/DPA, identité vendeur unique, `/dpa` | **KEEP** — immédiatement après 813 |
| Security Residual V2 | — | `71c5291` | — | ? | — | — | **MISSING** |
| Résiduel sécurité identifié (indépendant de 71c5291) | `claude/ecstatic-fermat-bcqats` | `375b35dd` | `main` | `20260928000184` (à ne pas reprendre) | point 1 (`entreprise_sans_membres` sans `search_path`) **déjà corrigé en V8** (`20260729000185`) ; point 3 (RLS `compteurs_reference`) **déjà actif en V8** | point 2 **toujours ouvert en V8** : 5 politiques gardent la clause fail-open `entreprise_sans_membres` (`postes` ALL/SELECT, `permissions_poste` ALL/SELECT, `utilisateurs_entreprises` INSERT « bootstrap ou invitation »), vérifié par `pg_policies` sur une base V8+901 reconstruite | **PORT** sémantique (nouvelle migration après 901), **à rapprocher de 71c5291** pour ne pas le dupliquer |
| Stripe readiness | `claude/elegant-turing-b4ewbp` | `254a3703` (code `b9eb1bfb`) | `main` | `20261002000184` | 13 conflits avec V8 ; ~80 % déjà en V8 ; plan de portage déjà rédigé sur la branche | P1 prix contractuel au changement de périodicité ; P2 aucune facture finale Live sans identité/TVA ; P4 compatibilité API Stripe basil ; P3 règle d'ouverture (à greffer sur `abonnementsPublicsOuverts()`) ; P5 rattrapage d'abonnement sans webhook ; P7 vérification essai 0 € | **PORT** P1, P2, P3, P4, P5, P7 uniquement ; **DROP** migration 184 (doublon de `…0802`), `LIRIA_VENDEUR_*`, `LIRIA_TVA_*`, moteur de synchro concurrent, catalogue Stripe, `abonnement/page.tsx` |
| Relevé Lot 8 | `claude/great-mendel-w9qt6c` | `0ec193e3` | — | `…001201` | fusionné en V8 (`ebda59a2`) | — | **ALREADY_IN_V8** |
| Relevé Lot 9 | `claude/compassionate-volta-cnbzjs` | `a6225400` | — | `…001301` | fusionné en V8 (`d1f14db7`) | — | **ALREADY_IN_V8** |
| Billing lifecycle | — | — | — | `…0801`–`…0803` | — | — | **ALREADY_IN_V8** (ne pas dupliquer) |
| Incident Response | — | — | — | `…0807`, `…0811` | — | — | **ALREADY_IN_V8** |
| Security Red Team V2 | `claude/elsatia-v6-security-redteam-v2` | `8307d5be` | — | `…0805` | fusionné en V8 (`34651619`) | — | **ALREADY_IN_V8** |
| Per-app suspension | `claude/kind-tesla-0i0818` | `58944daf` | — | `…0804` | ancêtre de V8 | — | **ALREADY_IN_V8** |

### 1.2 Autres branches post-V8 (actives depuis le 28/09/2026)

| Branche | SHA | Base | Migrations ajoutées | Chevauchements / conflits | Valeur ajoutée | Décision |
|---|---|---|---|---|---|---|
| `optimistic-hopper-0ytout` (GP residual data correctness) | `f77966f2` | V8 | 11 : `20260928000813_finance_exports_agregats_exactitude_v1`, `…0814`, `…0815`, `…0816`, `20260930000101_pointages_gestion_totaux_mois_v1`, `…000102`, `…000301`, `…000401`–`…000404` | **contient** `confident-brown`, `busy-ramanujan`, `festive-turing` ; conflits avec `beautiful-albattani` (`dashboard`, `planning`, `pointage/gestion`) et `beautiful-tesla` (`ouvrages`) ; `…000403` redéfinit des fonctions plateforme → **à comparer avec la 813** | exactitude des agrégats finance, pointage, rentabilité, fiches, pilotage ; annuaires `/fournisseurs` `/sous-traitants` paginés par curseur | **KEEP** (après 813, comparaison obligatoire) ; 11 migrations à renuméroter |
| `confident-brown-sndsqb` | `592fb321` | V8 | 4 (incluses ci-dessus) | ⊂ `optimistic-hopper` | — | **DROP** (via `optimistic-hopper`) |
| `busy-ramanujan-cbyclu` | `7797e8f7` | V7 | 2 (incluses) ; `…000101` **en collision** avec `gracious-curie` | ⊂ `optimistic-hopper` | — | **DROP** (via `optimistic-hopper`) |
| `festive-turing-7zqcce` | `442c3fca` | V7 | 1 (incluse) | ⊂ `optimistic-hopper` | — | **DROP** (via `optimistic-hopper`) |
| `beautiful-albattani-gbd2h7` (capacité pages lourdes & PDF) | `89820bd4` | V8 | — | conflits applicatifs avec `optimistic-hopper` (3 pages) ; porte le harnais de `nice-goodall` | diagnostic mémoire au démarrage, harnais de capacité | **KEEP** (résolution manuelle des 3 pages) |
| `nice-goodall-3fk873` | `6b4ef990` | V7 | — | remplacé par `beautiful-albattani` | — | **DROP** |
| `dazzling-turing-2q77nn` (rotation des clés bancaires) | `2b7e3671` | V8 | `20260930000813_banking_encryption_key_rotation_v1` | aucun conflit de code avec les autres candidats (seuls les attendus générés) | trousseau versionné IBAN/BIC, rotation ; pgTAP 75/75, Vitest 2 638 (message de commit) | **KEEP** ; renuméroter |
| `fervent-bell-1tbhc5` (Relevé Lot 10, porté sur V8 + coefficients) | `0dc3a656` | V8 | `…001401`, `…001402` | conflits add/add avec `beautiful-tesla` sur le Lot 10 (`estimation.ts`, `estimation.test.ts`, `index.ts`, `ReleveEstimationWorkspace.tsx`, `supabase-estimation-repository.ts`, `plan-lot10.test.ts`) | estimation simplifiée + coefficients, contrat `elsatia.tools.estimation 1.1.0` | **KEEP** (référence du Lot 10) |
| `beautiful-tesla-grj0pu` (Relevé Lot 11 Tools → GP) | `9ac7fbfc` | V8 | `…001401` (identique à `fervent-bell`, même empreinte), `…001501` | même Lot 10 porté **indépendamment** → conflits ci-dessus ; conflit `ouvrages/page.tsx` avec `optimistic-hopper` | import Tools → GP (snapshot immuable, idempotence, versions, devis brouillon) | **PORT** : ne reprendre que les commits Lot 11 (`aed3b666`, `27076064`, `6daeb647`, `3f8f905a`) sur le Lot 10 de `fervent-bell`, vérifier la compatibilité du contrat 1.1.0 |
| `blissful-thompson-ipjcxl` | `14fe2a3d` | Lot 9 | `…001401` | Lot 10 version pré-V8 | — | **DROP** (remplacé par `fervent-bell`) |
| `gracious-curie-135pix` (rate limit de connexion par échecs) | `2385345f` | V7 | `20260930000101_rate_limit_consultation_connexion_v1` | **collision de version** avec `busy-ramanujan` (`…000101`) ; 3 conflits sur les attendus | fin du blocage d'agence derrière un NAT, plafonds par compte | **KEEP** (merge depuis V7) ; renuméroter |
| `kind-mayer-w4wfy6` (export RGPD / portabilité) | `040ca1e2` | V6 | `20260929000101_rgpd_data_export_portability_v1` | 7 conflits avec V8 (`proxy.ts` — conserver `/dpa` —, `apps/studio/supabase/migration-targets.json`, `scripts/preview/db-verify.mjs`, attendus) ; **catalogue d'export exhaustif sur `public`** → doit couvrir toutes les tables créées par les autres lots V9 | export ZIP asynchrone, catalogue, worker | **KEEP** (merge depuis V6, résolution manuelle) ; **à placer après toutes les migrations qui créent des tables `public`** |
| `brave-carson-cj8ofz` (performance) | `48064a60` | V5 | `…000401`, `…000402` | C2-C4 portés en V8 (`6ce4143`, `…0812`), C1 refusé | — | **ALREADY_IN_V8** |
| `blissful-volta-eee359` | `53c3f880` | V8 | — | docs seules | rapport « GP commercialization readiness gate » | **KEEP** (docs) |
| `gifted-cori-vv7scp` | `b7a534fa` | V6 | — | outillage `scripts/commercialization/*` absent de V8 | portes du gate de commercialisation | **KEEP** (à vérifier contre `blissful-volta`) |
| `modest-shannon-uhp2ic` | `27f42417` | V8 | — | scripts Preview (`backup-preview.mjs`, `v8-gate.mjs`, `pilot-subscription.mjs`) | handoff Preview V2 | **KEEP** (outillage ops, sans migration) |
| `cool-gauss-wjvmd8` (Studio Preview V4.1) | `64ddf593` | V7 | — | contient `charming-allen`, `studio-preview-live-deploy-v2`, `vigilant-fermi` ; workflow Studio déjà en V8 | outillage Studio Preview | **KEEP** (optionnel, sans migration) |
| `charming-allen`, `studio-preview-live-deploy-v2`, `vigilant-fermi`, `vibrant-allen` | — | V7 | — | ⊂ `cool-gauss` (sauf `vibrant-allen`, rapport d'échec) | — | **DROP** |
| `wizardly-keller-3gz8nv`, `zen-davinci-xn6m3m`, `adoring-planck-2us9x5` | — | V5 / V4 / `main` | — | packs Preview d'anciens trains | — | **DROP** |
| `awesome-franklin-se2s33` | `13b1d7fb` | `main` | — | 64 conflits ; remplacé par V8 + Legal Consent | — | **DROP** |
| `elegant-turing` migration `20261002000184` | — | `main` | — | doublon de `20260928000802` | — | **DROP** (numéro à ne jamais réutiliser) |

### 1.3 Collisions de versions relevées

| Version | Fichiers | Résolution prévue |
|---|---|---|
| `20260930000101` | `pointages_gestion_totaux_mois_v1` (`busy-ramanujan` / `optimistic-hopper`) et `rate_limit_consultation_connexion_v1` (`gracious-curie`) | renumérotation des deux (§3) |
| `…000813` (suffixe) | `20260928000813_finance_…`, `20260930000813_banking_…`, `20261002000813_plateforme_annuaire_…` | pas de collision de version, mais toutes les migrations < `20261002000813` venant de branches doivent être **renumérotées au-delà de 901** |
| `…001401` | identique (même empreinte) dans `fervent-bell`, `beautiful-tesla`, `blissful-thompson` | une seule copie |

---

## 2. Identité vendeur — règle pour la V9

Une seule source : `src/lib/identite-vendeur.ts` (Legal Consent), alignée sur `@elsatia/email`
et sur les variables existantes `NEXT_PUBLIC_LEGAL_SIRET` / `NEXT_PUBLIC_LEGAL_TVA`. Le portage
Stripe P2 (pied de facture, garde Live) doit lire les champs `PROUVE` de cette source ;
**`LIRIA_VENDEUR_*` et `LIRIA_TVA_*` ne sont pas portés**. La confirmation du régime de TVA
reste une décision propriétaire distincte.

---

## 3. Étape 2 — Plan de convergence (à exécuter dès que 813 est disponible)

Branche à créer : `integration/elsatia-canonical-train-v9` depuis `53b4bc76`.

| Ordre | Apport | Mode | Version finale proposée |
|---|---|---|---|
| 1 | Annuaire hotfix B (`4cd9bec4`) | merge/port selon sa base | **`20261002000813`** (inchangée, déjà hébergée) |
| 2 | Onboarding fix (`c73adf98`) | selon sa base ; rapprocher de `createEntrepriseAction` (Legal Consent) | migrations éventuelles > 901 |
| 3 | Legal Consent (`d17177b4`) | merge | **`20261002000901`** (inchangée) |
| 4 | GP residual data correctness (`optimistic-hopper`) — **après comparaison avec 813** | merge | `…0928000813` → `20261002001001`, `…0814` → `…1002`, `…0815` → `…1003`, `…0816` → `…1004`, `…0930000101` → `…1005`, `…000102` → `…1006`, `…000301` → `…1007`, `…000401` → `…1008`, `…000402` → `…1009`, `…000403` → `…1010`, `…000404` → `…1011` |
| 5 | Capacité (`beautiful-albattani`) | merge, 3 pages à résoudre | — |
| 6 | Rotation des clés bancaires (`dazzling-turing`) | merge | `…0930000813` → `20261002001012` |
| 7 | Rate limit de connexion (`gracious-curie`) | merge depuis V7 | `…0930000101` → `20261002001013` |
| 8 | Relevé Lot 10 (`fervent-bell`) | merge | `…001401` → `20261002001014`, `…001402` → `…1015` |
| 9 | Relevé Lot 11 (`beautiful-tesla`, commits Lot 11 seulement) | port | `…001501` → `20261002001016` |
| 10 | Security Residual V2 (`71c5291`) + point 2 de `ecstatic-fermat` si non couvert | port | `20261002001017` |
| 11 | Stripe readiness P1 (+ P5/P7 si migration) | port sémantique | `20261002001018`… |
| 12 | Export RGPD (`kind-mayer`) — **en dernier** (catalogue exhaustif `public`) | merge depuis V6 + extension du catalogue aux tables des étapes 4–11 | `20261002001019` |
| 13 | Docs / outillage (`blissful-volta`, `gifted-cori`, `modest-shannon`, `cool-gauss`) | merge | — |
| 14 | `npm run sync:train-expectations` — **une seule fois, à la fin** | — | — |

Règles appliquées au plan : les renumérotations conservent l'ordre relatif d'origine ; chaque
migration renumérotée garde son corps (en-tête de traçabilité ajouté, comme en V8) ; aucune
définition V8 n'est écrasée par une version issue de `main` (Stripe et sécurité sont réécrits sur
le code V8) ; toute nouvelle table `public` doit rappeler `incident_installer_gardes()` (test
`incident_safe_mode_v1`).

Points de vigilance à l'exécution :

1. **813 × `optimistic-hopper` `…000403`** : si 813 redéfinit les mêmes fonctions plateforme,
   la définition 813 (plus récente côté Preview) prévaut, sauf preuve contraire.
2. **Lot 10 en double** : garder `fervent-bell` comme référence, reconstruire le Lot 11 dessus
   et requalifier le contrat `elsatia.tools.estimation` 1.1.0 côté import GP.
3. **Export RGPD** : étendre le catalogue aux tables créées par les étapes 4–11, sans quoi son
   contrôle d'exhaustivité échoue.
4. **Onboarding fix × Legal Consent** : les deux touchent la création d'entreprise ; conserver
   `creer_entreprise_avec_acceptation`.

## 4. Étape 3 — Qualification

**Non exécutée pour la V9** : sans 813, ni la base fraîche ni la montée V8 → V9 ne peuvent
reproduire la Preview. Qualification à rejouer après convergence : fresh, montée V8(+813) → V9,
ledger, pgTAP complet, Security, Billing, Legal Consent, RLS, grants, Auth, Storage, typecheck,
lint, Vitest, build Gestion Pro et apps concernées (Tools pour les Lots 10-11, Studio pour
l'export RGPD), `verify:migrations`, `verify:secrets`, puis `sync:train-expectations`.

Contrôles réellement effectués pendant cet inventaire :

| Contrôle | Résultat |
|---|---|
| Base V8 + 901 reconstruite (PostgreSQL 16 local) | 372 migrations ; pgTAP Legal Consent 45/45 ; suite complète : seuls les 9 échecs préexistants de V8 |
| Simulations `git merge-tree` entre candidats | conflits listés au §1.2 |
| `pg_policies` sur V8 + 901 | 5 politiques fail-open `entreprise_sans_membres` encore actives |

## 5. Ce qui débloque, dans l'ordre

1. Pousser la branche source de `4cd9bec4` / `20261002000813` (annuaire hotfix B).
2. Pousser `c73adf98` (onboarding) et `71c5291` (Security Residual V2), ou confirmer qu'ils sont abandonnés.
3. Relancer cette mission : le §3 s'exécute sans nouvelle décision, à l'exception des décisions Stripe et légales déjà inventoriées (TVA, adresse, conservation…), qui conditionnent l'ouverture commerciale et pas le train.
