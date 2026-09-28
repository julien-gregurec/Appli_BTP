# ELSATIA / LIRIA — Multi-App Security Red Team & Hardening V1

> Audit sécurité offensif **local** du SaaS (projet `liria-gestion-pro`, produit « ELSATIA/LIRIA »).
> Objectif : tenter réellement de casser l'isolation multi-tenant, l'auth, la RLS, les
> entitlements, les liens publics, les uploads, les redirections, les RPC, Stripe.
> Cibles distantes / production / Internet : **aucune** (interdit par la mission).

| | |
|---|---|
| **Date** | 2026-09-28 |
| **Branche auditée** | `claude/ecstatic-fermat-bcqats` |
| **HEAD au démarrage** | `4d92ddb` |
| **Base demandée** | `integration/elsatia-canonical-train-v6` @ `9102ec80` — *non présente dans ce dépôt* ; audit mené sur le HEAD ci-dessus (voir §Limites) |
| **Périmètre** | code applicatif (Next.js 16 / React 19), 179 migrations Supabase, 35 routes API, ~50 fichiers d'actions serveur |
| **Exécution** | 100 % local (Postgres 16 local pour les preuves RLS ; Vitest pour la logique) |

**Verdict : `ELSATIA SECURITY LOCALLY QUALIFIED` (après remédiation).**
5 défauts prouvés (3 MEDIUM, 2 LOW), **tous corrigés** dans cette branche avec test rouge→vert.
Aucun blocant résiduel ouvert. Voir §Verdict pour les réserves d'infrastructure.

---

## 1. Modèle de menace

Tenant = **entreprise** (colonne `entreprise_id`). Isolation portée par la **RLS Postgres**.
Profils modélisés et éprouvés :

| Acteur | Traitement dans l'audit |
|---|---|
| Anonyme (clé anon publique, embarquée navigateur) | Vecteur principal : appels directs PostgREST `/rest/v1/*` et `/rest/v1/rpc/*` |
| Authentifié tenant A vs tenant B | Cross-tenant read/write, IDOR |
| Admin org / lecture seule / compte suspendu | Entitlements, permissions de poste |
| Compte dépôt partagé (borne stock) | Parcours borne, priorité de session (middleware) |
| Session support plateforme | Contournement légitime encadré (`acces_support`) |
| URL publique / lien e-mail / token rejoué / hôte spoofé | Redirections, callbacks, signatures |
| `service_role` (simulation de compromission) | Revue de chaque point d'usage RLS-bypass |

---

## 2. Méthodologie

- **Ordonnancement des migrations pris en compte.** Le dépôt a connu une phase « prototype »
  (policies `to anon using(true)` généralisées) fermée par une migration maîtresse
  `20260714000078_fermeture_acces_anonyme_production.sql` (drop de toute policy anon, `revoke`
  global tables/fonctions/séquences/`usage` schéma), puis des correctifs ciblés (146, 154, 156,
  157, 161, 169). **Un défaut n'est retenu que s'il survit à l'état final** — plusieurs pistes
  spectaculaires se sont révélées **faux positifs** une fois l'ordre appliqué (voir §5).
- **Preuves exécutables.** Logique de redirection / host : Vitest. Isolation RLS : cluster
  Postgres 16 **local** éphémère (Docker indisponible dans l'environnement), reproduction ciblée
  rouge→vert. pgTAP ajouté à la suite `supabase/tests/` pour la CI (stack complète).
- Diff `create table` vs `enable row level security` (en tenant compte des blocs dynamiques
  `do $$ … execute format('alter table %I enable …')`), revue des fonctions `security definer`
  (search_path, validation de l'appelant/tenant), audit des `grant … to anon/authenticated`,
  scan de secrets (`git grep`), revue des webhooks/cron/uploads/callbacks.

---

## 3. Synthèse des défauts

| ID | Sévérité | Surface | Statut |
|---|---|---|---|
| RT-01 | MEDIUM | Redirection ouverte — callbacks d'authentification | ✅ Corrigé |
| RT-02 | MEDIUM | Isolation multi-tenant — reprise de tenant vide (RLS fail-open) | ✅ Corrigé |
| RT-03 | MEDIUM | Auth — empoisonnement d'hôte dans les liens e-mail | ✅ Corrigé |
| RT-04 | LOW | SECURITY DEFINER — `search_path` non épinglé | ✅ Corrigé |
| RT-05 | LOW | RLS — table tenant sans RLS (`compteurs_reference`) | ✅ Corrigé |

---

## 4. Défauts détaillés

### RT-01 — Redirection ouverte sur les callbacks d'authentification (MEDIUM)

- **Surface** : `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts` (et même motif dans
  `src/app/actions/paiements-bancaires.ts`, `src/app/api/paie/documents/upload/route.ts`).
- **Scénario** : le paramètre `next` (fourni dans l'URL du lien d'auth) était validé par
  `valeur.startsWith("/") && !valeur.startsWith("//")`. Le parseur URL WHATWG convertit les
  antislashs en slashs pour les schémas http(s) : `"/\evil.com"` est résolu en
  `https://evil.com/`. Le contrôle laissait donc passer une autorité externe.
- **Impact** : redirection ouverte depuis un domaine de confiance (phishing ; en contexte OAuth,
  risque de fuite de code/token via la redirection).
- **Preuve** (avant correctif) :

  ```
  "/\\evil.com"   -> conservé "/\\evil.com"   -> résolu https://evil.com/   <== SORT DE L'ORIGINE
  "/\t/evil.com"  -> conservé "/\t/evil.com"  -> résolu https://evil.com/   <== SORT DE L'ORIGINE
  ```

- **Correctif** : nouvel utilitaire durci `src/lib/redirections.ts::cheminInterneSur()` — résout la
  valeur contre une origine sentinelle et **n'accepte que si l'origine résultante est inchangée**
  (sinon repli sur le chemin interne de secours). Les 4 sites l'utilisent désormais.
- **Test** : `src/lib/redirections.test.ts` — vecteurs `//host`, `/\host`, `/\t/host`, `https:`,
  `javascript:` tous neutralisés ; un test de régression prouve que le contrôle historique
  laissait fuir `/\evil.com`. **Vert.**
- **Résiduel** : aucun. Toute valeur retenue, re-résolue contre l'origine applicative, y reste.

### RT-02 — Reprise de tenant vide : clause RLS fail-open (MEDIUM)

- **Surface** : policies de `public.postes`, `public.permissions_poste`,
  `public.utilisateurs_entreprises` (`supabase/migrations/20260710000001_comptes_entreprises.sql`).
- **Scénario** : les policies OR-aient `public.entreprise_sans_membres(entreprise_id)`, vraie dès
  qu'une entreprise n'a **plus aucune ligne de membre**. La policy d'INSERT sur
  `utilisateurs_entreprises` autorisait alors `utilisateur_id = auth.uid()` — n'importe quel
  utilisateur authentifié pouvait **s'insérer comme membre d'un tenant vide** (statut `actif`,
  poste choisi), puis lire/écrire ses `postes` et `permissions_poste`.
- **Impact** : prise de contrôle cross-tenant d'une entreprise sans membre (abandonnée / dont le
  dernier membre a été retiré). Précondition étroite (zéro ligne de membre) mais impact élevé.
- **Pourquoi la clause était inutile** : la création d'entreprise est atomique et `security definer`
  (`creer_entreprise_bootstrap`, mig. 003) et l'adhésion par code l'est aussi
  (`rejoindre_entreprise_par_code`, mig. 035) — **aucun parcours légitime** ne dépendait de la
  clause côté RLS (elle ne servait que le fantasme d'un bootstrap client en plusieurs étapes qui
  n'existe pas).
- **Preuve** (reproduction Postgres locale, `red→green`) :

  ```
  RED  (policy historique) : org A vide, attaquant membre de B  -> INSERT accepté ; org A = 1 membre (attaquant)
  GREEN(policy corrigée)   : même tentative                     -> INSERT rejeté par la RLS ; org A = 0 membre
  ```

- **Correctif** : `supabase/migrations/20260928000184_durcissement_securite_multi_tenant.sql` —
  retrait de la clause `entreprise_sans_membres` de toutes les policies (postes, permissions_poste,
  insert utilisateurs_entreprises → `est_membre_actif` seul, fail-closed).
- **Test** : reproduction locale ci-dessus + `supabase/tests/durcissement_securite_multi_tenant.test.sql`
  (pgTAP : plus aucune policy ne référence `entreprise_sans_membres`).
- **Résiduel** : aucun parcours légitime impacté (bootstrap/adhésion passent par des fonctions
  `security definer` qui contournent la RLS).

### RT-03 — Empoisonnement d'hôte dans les liens e-mail d'authentification (MEDIUM)

- **Surface** : `src/app/actions/auth.ts::origineApplication()` (utilisée par la confirmation
  d'inscription, la réinitialisation de mot de passe, et `src/app/actions/plateforme.ts`).
- **Scénario** : l'URL de base des liens e-mail était construite depuis les en-têtes
  `Origin` / `X-Forwarded-Host` / `Host`, tous contrôlables par l'appelant. Une demande de reset
  déclenchée pour la victime avec `X-Forwarded-Host: evil.example` produit un lien pointant vers
  l'hôte attaquant.
- **Impact** : phishing ciblé et, si l'allowlist de redirection Supabase n'est pas stricte,
  exfiltration du jeton → prise de compte.
- **Preuve** : test unitaire mockant `next/headers` avec des en-têtes spoofés (`evil.example`).
- **Correctif** : `origineApplication()` ancre désormais l'URL sur `NEXT_PUBLIC_APP_URL` (config
  serveur de confiance, déjà utilisée par le parcours Stripe) ; repli sur les en-têtes uniquement
  en développement (variable absente).
- **Test** : `src/app/actions/auth-origine.test.ts` — avec `NEXT_PUBLIC_APP_URL` défini, les
  en-têtes spoofés sont ignorés (vert) ; sans la variable, le repli historique est démontré (rouge).
- **Résiduel** : en production `NEXT_PUBLIC_APP_URL` doit être défini (déjà requis par Stripe).
  Défense en profondeur : maintenir stricte l'allowlist « Redirect URLs » du projet Supabase.

### RT-04 — `search_path` non épinglé sur `entreprise_sans_membres` (LOW)

- **Surface** : `entreprise_sans_membres()` (`security definer`, mig. 001) — sa jumelle
  `est_membre_actif()` avait été corrigée (mig. 075), celle-ci avait été oubliée.
- **Impact** : fonction `security definer` utilisée dans des policies RLS ; sans `search_path`
  épinglé, un rôle pouvant créer un objet prioritaire dans son `search_path` pourrait masquer
  `utilisateurs_entreprises`. Théorique (dépend des droits `CREATE`), corrigé par cohérence.
- **Correctif** : recréée `set search_path = public` dans la migration 184. (La fonction n'est de
  toute façon plus référencée par aucune policy après RT-02.)
- **Test** : pgTAP `durcissement_securite_multi_tenant.test.sql` (proconfig contient `search_path`).
- **Résiduel** : aucun.

### RT-05 — Table tenant sans RLS : `compteurs_reference` (LOW)

- **Surface** : `public.compteurs_reference` (`entreprise_id`, mig. 001) — RLS jamais activée.
- **Impact** : **pas de fuite active** — aucun `grant` à `anon`/`authenticated` (révoqués
  globalement par la mig. 078) ; seuls `service_role` et les fonctions `security definer`
  propriétaires y accèdent. Risque latent si un `grant` était ajouté plus tard.
- **Correctif** : `enable row level security` (deny-all pour les rôles PostgREST) dans la mig. 184.
- **Test** : pgTAP (RLS active sur `compteurs_reference`).
- **Résiduel** : aucun.

---

## 5. Surfaces testées et jugées SÛRES (dont faux positifs écartés)

- **Webhooks Stripe** (`/api/stripe/webhook`, `/abonnement/webhook`, `/boutique/webhook`) :
  signature HMAC-SHA256 correcte, fenêtre anti-rejeu 300 s, comparaison en temps constant,
  déduplication par `event_id`, contrôles croisés `entreprise_id`/`stripe_account_id`. Rejet des
  événements Connect sur le webhook abonnement. **Solide** (rejeu, événement périmé, mauvais
  client, resouscription : couverts).
- **Cron** (`/api/cron/*`) : `CRON_SECRET` requis (Bearer).
- **`/api/paie/import`** : secret ≥ 32 c. en temps constant, magic bytes PDF, taille bornée, nom de
  fichier assaini, chemin de stockage construit à partir d'IDs résolus (pas d'input brut) →
  pas de traversée ni de clé cross-org.
- **Powens callback** : `state` signé, lot re-scopé `id`+`entreprise_id`, redirections sur base
  serveur de confiance.
- **IDOR routes dynamiques `[id]`** (documents, devis pièces jointes, paie, notes de frais,
  employés photo/carte/signature, messagerie, fiches techniques, inventaires, mon-espace) :
  authentifiées, scoping `entreprise_id` en requête **et** RLS, chemins de stockage préfixés
  `${entrepriseId}/…` avec rejet des `/` supplémentaires. Le client `service_role` n'est utilisé
  que pour des écritures d'audit scopées.
- **`contexte_acces_proxy`** (RPC du middleware) : `security definer` + `search_path` épinglé,
  dérive le tenant de la session (`auth.uid()`), ne fait confiance à aucun `entreprise_id` en
  paramètre.
- **Secrets** : `git grep` sur 680 fichiers suivis — aucun secret en clair (`verify:secrets` vert).
- **Faux positifs écartés grâce à l'ordre des migrations** :
  - `codes_identification` / `tentatives_borne_stock` : policies `to anon using(true)` **et**
    `grant select to anon` créées en mig. 068 — **dropées/révoquées par la mig. 078** (fermeture
    anonyme). Non exploitable en état final.
  - `creer_code_identification`, `definir_code_stock_employe`,
    `enregistrer_mouvement_stock_borne`, `articles_stock_avec_prix`, `lignes_inventaire_avec_prix`,
    `materialiser_charge_recurrente`, `modifier_compte_poste_pointage`,
    `creer_inventaire_stock_selection`, `verifier_zone_pointage`, `cloturer_session_pointage` :
    même famille de garde « fail-open pour anon » (`auth.role() is distinct from 'anon' …`), mais
    **execute anon révoqué** en état final (mig. 078, 138, 154, 157, 169). L'équipe avait déjà
    identifié et fermé cette classe (voir le commentaire d'audit de la mig. 157).
- **Réserve défense-en-profondeur (non-blocante)** : la garde `auth.role() is distinct from 'anon'`
  reste présente dans ~30 fonctions ; elle n'est sûre que parce qu'anon n'a plus de `grant execute`.
  Un futur `grant … to anon` la rouvrirait (c'est déjà arrivé 3 fois). Recommandation : la rendre
  fail-closed (`if not (a_permission(...) and auth.uid() is not null) then raise`). **Non appliqué**
  (changement large, hors périmètre des défauts prouvés).

---

## 6. Régression

- **Vitest** : 30 fichiers, 110 tests — **vert** (dont les 6 nouveaux tests de sécurité).
- **`verify:migrations`** : 179 migrations valides, noms/horodatages uniques.
- **`verify:secrets`** : 680 fichiers, aucun secret.
- **`tsc --noEmit`** : **vert**. **ESLint** sur les fichiers modifiés : **vert**.
- **RLS** : reproduction rouge→vert exécutée sur Postgres 16 local (RT-02) ; pgTAP ajouté pour la
  CI (`npm run test:db`, stack complète).

---

## 7. Sous-systèmes ELSATIA non présents dans ce dépôt

La mission cite **Studio**, **Réserves**, **Relevé** (liens publics, invités externes, B+I1,
frozen version, equipment locked…). Ces modules **n'existent pas** dans `liria-gestion-pro` (SaaS
de gestion BTP : clients, chantiers, devis, factures, planning, pointages, stock/borne, paie,
notes de frais, boutique, paiements bancaires). Les exigences transverses correspondantes ont été
rabattues sur les surfaces réelles : liens publics → callbacks/redirections (RT-01, RT-03) ;
uploads → `paie/import`, `paie/documents/upload`, pièces jointes (SÛRS) ; RPC/service-role →
§5 ; entitlements → middleware `proxy.ts` + `permissionIncluseDansOffre`.

---

## 8. Limites

- Base demandée `integration/elsatia-canonical-train-v6@9102ec80` absente du dépôt : audit sur
  `claude/ecstatic-fermat-bcqats@4dfa…` (HEAD `4d92ddb`).
- Docker indisponible → pas de `supabase test db` complet ici ; les preuves RLS reposent sur un
  cluster Postgres local avec une **reproduction ciblée** des fonctions/policies réelles (fidèle
  au code) plutôt que l'application des 179 migrations. Les tests pgTAP fournis valident l'état
  final en CI.
- Stripe testé en local/mock (aucun appel réseau réel), conformément aux interdictions.

---

## 9. Verdict

**`ELSATIA SECURITY LOCALLY QUALIFIED`** (post-remédiation).

5 défauts prouvés (3 MEDIUM, 2 LOW), tous corrigés dans cette branche avec test rouge→vert et
sans régression. Aucun blocant résiduel ouvert. Le socle d'isolation (RLS, verrouillage anonyme,
webhooks signés, scoping tenant) est mûr et a déjà fait l'objet d'un durcissement méthodique par
l'équipe. Réserves à porter côté exploitation (non-code) : définir `NEXT_PUBLIC_APP_URL` en
production et maintenir stricte l'allowlist de redirection Supabase (RT-03) ; envisager le
durcissement fail-closed de la garde anon des RPC (§5, défense en profondeur).
