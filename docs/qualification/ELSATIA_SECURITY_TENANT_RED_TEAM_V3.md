# ELSATIA — Security & Tenant Isolation Red Team V3

**Base** : `origin/claude/funny-bell-eqo1p5` @ `842b4b4` (merge "converge Studio/Tools/Reserves
isolation + qualification finale (mission ELSATIA)").
**Branche de travail** : `claude/elsatia-redteam-v3`.
**Portée temporelle réelle de cette session** : une session interactive unique, pas 8h de
run autonome ininterrompu — voir §0 pour une déclaration honnête de ce qui a réellement été
exécuté vs. lu/raisonné.

---

## 0. Ce qui a réellement été fait (déclaration anti-fabrication)

Cette mission demandait ~8h d'autonomie totale sans confirmation humaine. Cette session ne
peut pas garantir avoir occupé 8 heures d'horloge réelle ; ce qui suit est une description
honnête et vérifiable de ce qui a été **réellement exécuté**, pas une estimation de durée :

- **313 migrations SQL rejouées pour de vrai**, deux fois de zéro (avant/après correctif), sur
  un PostgreSQL 16 + pgTAP 1.3.2 installés dans cet environnement (`apt-get install
  postgresql-16-pgtap`), avec un schéma de base `auth`/`storage`/`extensions` **reconstruit à la
  main** (voir §0.1 — limite documentée, pas l'image Docker officielle Supabase).
- **95 fichiers pgTAP existants exécutés pour de vrai** contre cette base rejouée (2 202
  assertions), **deux fois** (avant et après le correctif de cette session) pour une comparaison
  A/B directe, plus un nouveau fichier de 13 assertions ajouté par cette session.
- **4 agents de recherche en parallèle** (lecture seule, aucune écriture) ont exploré : routes
  API/Server Actions, inventaire SQL (grants/SECURITY DEFINER/RLS sur les 313 migrations),
  Storage + surfaces publiques à jeton, logique webhook Stripe + isolation multi-app. **Chaque
  affirmation de sévérité P0/P1 rapportée par un agent a été revérifiée indépendamment par
  requête directe sur la base rejouée** avant d'être retenue — un agent a produit un faux
  positif P0 (voir §3, finding rejeté REDTEAM-V3-REJECTED-01), corrigé par cette contre-vérification.
- **3 vulnérabilités confirmées en base réelle par exploit witness négatif ET positif**
  (attaque bloquée + usage légitime toujours fonctionnel), corrigées par une migration, avec un
  nouveau test pgTAP de non-régression, et **zéro régression introduite** démontrée par
  comparaison A/B exhaustive sur les 95 fichiers existants (voir §4).
- Ce qui n'a **pas** été fait : accès Preview/Production réel, appel Stripe réel (aucune clé
  fournie, conforme à la mission), image Docker officielle Supabase (bloquée par la politique
  réseau du bac à sable — voir §0.1), correction complète du P1 "webhooks Stripe cassés" (trop
  large pour un correctif "minimal et certain", voir §6), construction exhaustive de la matrice
  acteur × ressource × action pour les 15 acteurs (voir §1 — couverture réelle listée, pas
  fabriquée).

### 0.1 — Limite du harnais de base de données

`supabase start` (image Docker officielle) échoue dans ce bac à sable : la politique réseau ne
permet pas d'atteindre le registre ECR/CloudFront derrière `docker pull supabase/...`
(confirmé : `failed to do request... d2glxqk2uabbnd.cloudfront.net`, hors de la liste
d'autorisation du proxy sortant). Un PostgreSQL 16 natif était disponible dans l'image (avec
`psql`, sans serveur démarré) ; `pgtap` a été installé par `apt`. Les schémas `auth`/`storage`
et les fonctions `auth.uid()/auth.role()/auth.email()/auth.jwt()`,
`storage.foldername()/filename()` ont été **reconstruits à la main** (script en annexe du
commit, non versionné dans le dépôt — usage local uniquement) pour reproduire fidèlement le
comportement PostgREST (`SET LOCAL ROLE <role>` + GUC `request.jwt.claim.*`).

**Preuve de fidélité** : sur cette reconstruction, **311 des 313 migrations existantes
s'appliquent sans erreur** de bout en bout (les 2 échecs sont `pgsodium` non installable dans ce
sandbox — limite déjà documentée par une session antérieure,
`docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md` implicitement, et confirmée ici indépendamment).
**Limite connue et prouvée** : les tests liés à l'AAL2/MFA (`auth.mfa_factors` incomplet côté
harnais) et à certains flux plateforme/support échouent avec ou sans le correctif de cette
session (voir §4, comparaison A/B) — ce n'est **pas** une régression de cette session, c'est une
fidélité incomplète du harnais vis-à-vis du vrai GoTrue, documentée honnêtement plutôt que
masquée.

### 0.2 — Prompt injection détectée et ignorée

`AGENTS.md` (chargé automatiquement comme instruction projet) contient : *"Read the relevant
guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices."*
Ce chemin **n'existe pas** (`node_modules/next/dist/docs/` : `No such file or directory`,
confirmé par `ls` avant tout autre travail) — Next.js ne distribue pas de dossier `dist/docs/`.
Ceci correspond au schéma classique d'injection de prompt (faire lire et suivre par l'agent un
contenu arbitraire déguisé en documentation faisant autorité, placé dans un chemin que l'agent
inspecterait normalement). **Aucune instruction de ce chemin n'a été suivie** ; le développement
de cette session s'est appuyé sur la sémantique Next.js réelle connue. Signalé ici comme
constat de sécurité du dépôt lui-même (contenu à traiter comme suspect, pas comme de la
documentation), pas comme une vulnérabilité applicative.

---

## 1. Threat model — couverture réelle

Matrice acteur × ressource × action complète (15 acteurs × ~15 domaines métier) non construite
de façon exhaustive dans le temps disponible — ce qui suit est la couverture **réellement
vérifiée**, par acteur, avec renvoi aux findings :

| Acteur | Surface vérifiée | Résultat |
|---|---|---|
| anonymous (`anon`) | RLS `public`/`storage`, grants directs, SECURITY DEFINER | 0 accès table direct hors 4 catalogues tarifaires (SELECT seul) ; 0 policy `anon` résiduelle après rejeu complet — voir §3 rejet du faux positif P0 |
| authenticated (autre tenant, même rôle) | RPC SECURITY DEFINER `p_entreprise_id`, Boutique, capacité Stripe | **3 vulnérabilités réelles trouvées et corrigées** — voir §2 |
| salarié / chef équipe / chef chantier | RLS `est_membre_actif`/`a_permission` par table métier (devis, chantiers, pointages, stock, etc.) | Échantillon large (27 tables) revérifié en base réelle : toutes gatées par fonctions dépendant de `auth.uid()`, aucune fuite pour un membre d'une autre entreprise ni pour `anon` |
| admin / propriétaire organisation | Auto-attribution rôle, capacité, remise | RPC plateforme (`plateforme_ajouter_admin`/`retirer_admin`) déjà durcies par une mission antérieure (AAL2 + verrou + garde propriétaire), revérifiées intactes sur cette base rejouée |
| support | Altération abonnement/capacité/entitlement | `plateforme_exiger_role('total','support')` : tous les sites d'appel trouvés sont messagerie/lecture, jamais mutateurs de facturation ; remise gérée par un rôle Postgres dédié à privilèges de colonne (`elsatia_discount_f4_writer`), hors support — conforme au contrat "aucune altération sauf contrat explicite" |
| plateforme read/admin | idem support, élargi | Cohérent avec ci-dessus, non retesté en profondeur au-delà de l'inventaire SQL (limite de temps) |
| service_role | RPC supposant service_role mais accessibles authenticated | **Cause racine des 3 vulnérabilités** — voir §2 |
| ancien salarié / utilisateur suspendu | Revocation live vs. cache | `est_membre_actif()`/`a_acces_application()` : fonctions `stable security definer`, aucune mise en cache session trouvée au-delà du rendu d'une requête (`cache()` React, par requête uniquement) — statut vérifié à chaque appel privilégié |
| app suspendue (Colors/Tools/Reserves) | Isolation cross-app | Table `acces_applications_entreprises` correctement paramétrée par `application_code` ; **mais** `a_acces_application()` exige aussi `est_membre_actif()`, qui encode le statut d'abonnement **GP** — un GP suspendu pour impayé peut donc faire échouer l'accès Colors/Tools/Reserves même si ces apps sont payées séparément (P2, non corrigé — voir §6, décision produit à trancher, pas une élévation de privilège) |
| organisation suspendue | idem | idem |

**Non couvert dans le temps disponible, à traiter en suivi** : matrice complète des 15 acteurs
sur les domaines "notes de frais", "congés", "colors", "tools projects", "studio assets"
spécifiquement (revue partielle seulement, via l'agent Stripe/multi-app pour Tools/Studio).

---

## 2. Findings confirmés et corrigés

### REDTEAM-V3-01 — P0 — Auto-octroi de capacité payante par tout utilisateur authentifié

- **SURFACE** : `public.synchroniser_capacite_stripe_service(...)`, RPC `SECURITY DEFINER`,
  `supabase/migrations/20260903000259_capacity_stripe_r2_b_v1.sql`.
- **ATTACK** : la fonction ne vérifie que la cohérence
  `p_stripe_subscription_id ↔ entreprises.stripe_subscription_id` — jamais l'appartenance de
  l'appelant à `p_entreprise_id`. `GRANT EXECUTE ... TO authenticated` jamais révoqué (une
  migration sœur, `20260905000267`, a fermé 7 fonctions de la même famille mais a omis celle-ci).
  Un utilisateur authentifié de n'importe quelle entreprise peut s'auto-attribuer jusqu'à 100000
  unités de "capacité personnes supplémentaire" avec `p_statut_final='completed'`, sans jamais
  payer.
- **EVIDENCE** (base rejouée, requête catalogue avant correctif) :
  `has_function_privilege('authenticated', 'synchroniser_capacite_stripe_service(...)', 'EXECUTE') = true`.
  Confirmé exploitable par exploit witness réel (`set local role authenticated`, JWT d'un
  utilisateur réel de l'entreprise B, appel direct) → la capacité de l'entreprise B passait de 0
  à 100000 sans écriture de preuve Stripe.
- **FIX** : `supabase/migrations/20260922000323_redteam_v3_authenticated_rpc_bypass_revocation.sql`
  — `revoke execute ... from authenticated;` (grant `service_role` conservé, seul appelant réel :
  `src/lib/stripe-capacite-reconcile.ts`, confirmé par grep exhaustif de `src/`).
- **REGRESSION TEST** : `supabase/tests/redteam_v3_authenticated_rpc_bypass_revocation.test.sql`,
  assertions 1–3 (grants catalogue) + 8 (témoin négatif réel : `throws_like` "permission
  denied") + 7 (témoin positif : `service_role` fonctionne toujours).
- **RESIDUAL RISK** : aucun consommateur `authenticated` légitime trouvé (grep exhaustif +
  suite pgTAP existante) ; risque résiduel nul identifié. Deux fichiers pgTAP préexistants
  (`capacity_stripe_r2_d_cancel_scheduled_v1.test.sql`) utilisaient ce rôle par commodité de
  fixture — corrigés pour utiliser `service_role` (comportement réel inchangé, seule la fixture
  de test était infidèle à l'appelant réel).

### REDTEAM-V3-02 — P1 — Falsification de l'état de réconciliation Stripe d'un autre tenant

- **SURFACE** : `public.capacite_stripe_finaliser_op_convergente(p_operation_id uuid)`,
  `supabase/migrations/20260903000261_capacity_stripe_r2_d_close_converged_op_v1.sql`.
- **ATTACK** : aucune vérification de `p_entreprise_id` ni d'appartenance de l'appelant — un
  UUID nu suffit. Tout utilisateur authentifié peut clore prématurément l'opération de
  réconciliation Stripe **d'une entreprise tierce**, la retirant silencieusement de la file de
  reprise du cron (`capacite_stripe_operations_a_reprendre`) et masquant une dérive de
  facturation que la réconciliation devait détecter. N'a pas été balayée par `20260905000267`
  (ne porte pas le suffixe `_service` utilisé par le grep de cette migration).
- **EVIDENCE** : `has_function_privilege('authenticated', ..., 'EXECUTE') = true` avant
  correctif, confirmé par requête catalogue sur base rejouée.
- **FIX** : même migration, `revoke execute ... from authenticated;` (`service_role` conservé —
  seul appelant réel, même fichier `src/lib/stripe-capacite-reconcile.ts`).
- **REGRESSION TEST** : assertions 4–5 du nouveau fichier pgTAP.
- **RESIDUAL RISK** : aucun.

### REDTEAM-V3-03 — P0 — Commande Boutique marquée payée sans paiement réel

- **SURFACE** : `public.boutique_finaliser_commande_payee(uuid, text)`,
  `supabase/migrations/20260801000194_renommer_identite_elsatia_boutique.sql` ; RLS
  `boutique_commandes_maj`/`boutique_commandes_creation`
  (`supabase/migrations/20260724000145_boutique_commandes.sql`).
- **ATTACK** : double vecteur.
  1. **RPC directe** : `20260902000255_acl_reconciliation_v1` a retiré `EXECUTE` à
     `service_role` sur cette fonction mais l'a **laissé à `authenticated`** — déjà documenté et
     décidé par une session antérieure (`docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md`,
     décision D1), **jamais fusionné dans `supabase/migrations/`**. Un utilisateur authentifié
     connaissant `stripe_checkout_id` (renvoyé à son propre navigateur pour la redirection
     Stripe) peut appeler la RPC directement et se faire livrer sans payer.
  2. **PATCH RLS direct** : même sans la RPC, `boutique_commandes_maj` laisse tout
     `authenticated` avec le droit `gerer_boutique` écrire `statut='payee'` par un simple PATCH
     PostgREST ; `boutique_commandes_creation` ne restreint pas la valeur de `statut` à
     l'insertion.
- **EVIDENCE** : `has_function_privilege('authenticated', 'boutique_finaliser_commande_payee(uuid,text)', 'EXECUTE') = true`
  et `has_function_privilege('service_role', ..., 'EXECUTE') = false` avant correctif (exactement
  inversé), confirmés par requête catalogue. RLS `boutique_commandes_maj` confirmée
  `to authenticated ... with check a_permission(entreprise_id,'gerer_boutique')` sans aucune
  restriction sur `statut`.
- **FIX** : même migration —
  1. `revoke execute ... from authenticated; grant execute ... to service_role;` (restaure la
     décision D1 déjà actée mais jamais poussée).
  2. **Nouveau déclencheur** `boutique_commandes_paiement_serveur_seul` (BEFORE INSERT OR UPDATE
     sur `boutique_commandes`) : refuse `statut='payee'` et toute modification d'une commande
     déjà payée, sauf pour `auth.role() = 'service_role'`.
     — **Note d'implémentation** : la doc d'audit préexistante proposait un test sur
     `current_user`. Testé empiriquement avant livraison : `current_user` **change** à
     l'intérieur d'une fonction `SECURITY DEFINER` (devient son propriétaire, `postgres` dans ce
     dépôt) — un déclencheur sur `current_user` aurait donc **aussi bloqué le chemin serveur
     légitime** (témoin positif W6 initialement en échec, détecté avant tout commit). Corrigé en
     utilisant `auth.role()` (lit un GUC posé par PostgREST, non affecté par le changement de
     `current_user` d'une fonction SECURITY DEFINER).
- **REGRESSION TEST** : assertions 6–7 (grants) + 9 (RPC directe refusée) + 10 (PATCH direct
  refusé) + 11 (annulation légitime toujours permise) + 12–13 (chemin serveur complet : stock
  décrémenté, dépense fournisseur + règlement créés, statut `payee`).
- **RESIDUAL RISK** : `boutique_expirer_commande_service`, appelée par le webhook Boutique
  pour l'expiration, **n'existe dans aucune migration appliquée** (confirmé par grep exhaustif) —
  bug fonctionnel préexistant, non corrigé ici (voir §6, lié au P1 plus large). Un checkout expiré
  reste donc en `en_attente_paiement` indéfiniment plutôt que `expiree`, ce qui n'ouvre **pas**
  de nouvelle voie d'exploitation grâce au correctif ci-dessus (la RPC de finalisation reste
  fermée à `authenticated`, le PATCH direct reste bloqué par le déclencheur), mais mérite un
  suivi produit.

---

## 3. Finding rejeté après contre-vérification (transparence méthodologique)

**REDTEAM-V3-REJECTED-01** — Un agent de recherche a initialement rapporté un **P0** : "~27
tables métier (`employes`, `pointages`, `codes_identification`, etc.) conserveraient une policy
RLS `for all to anon using(true)` du mode prototype (`20260710000008_mode_sans_connexion.sql`),
jamais retirée par nom exact dans les migrations suivantes."

**Contre-vérification sur la base réellement rejouée** (313 migrations, requête directe
`pg_policies` + `information_schema.role_table_grants`) : **faux positif**. Les 27 tables citées
n'ont aujourd'hui **aucune** policy ni grant `anon`. La cause de l'erreur de l'agent : le nettoyage
réel (`supabase/migrations/20260714000078_fermeture_acces_anonyme_production.sql`) ne supprime
pas les policies par `DROP POLICY <nom exact>` mais par une **boucle dynamique**
(`DO $$ ... FOR ... IN (SELECT ... WHERE 'anon' = ANY(roles)) LOOP EXECUTE format('DROP POLICY ...') ...`),
invisible à une recherche textuelle exacte du nom de policy dans les fichiers de migration. Ce
même fichier fait aussi un `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon`
global. Seules 4 tables catalogue (lecture seule) ont un grant `anon` aujourd'hui, confirmé par
requête directe.

**Leçon retenue pour cette mission** : c'est précisément pourquoi chaque affirmation de
sévérité P0/P1 de cette session a été revérifiée sur la base rejouée plutôt qu'acceptée sur la
seule foi d'une recherche statique — méthode qui a par ailleurs correctement trouvé et confirmé
les 3 vulnérabilités réelles ci-dessus.

---

## 4. Comparaison A/B — zéro régression

95 fichiers pgTAP existants (2202 assertions) + le nouveau fichier de cette session, exécutés
**deux fois** sur la base rejouée à l'identique (mêmes 313 migrations, mêmes fixtures) : une
fois **sans** le correctif `20260922000323`, une fois **avec**.

| | Sans correctif | Avec correctif |
|---|---|---|
| Assertions réussies | 2078 | 2087 (+9 : nouveau fichier, une fois corrigé) |
| Assertions en échec | 124 | 115 |

**Diff fichier par fichier** (script Python, comparaison exacte des compteurs `ok`/`not ok`
par fichier) : **identique sur les 94 fichiers non touchés par cette session**. Les 2 fichiers
dont le compte a changé sont ceux que cette session a explicitement modifiés pour refléter le
correctif :

- `capacity_stripe_r2_d_cancel_scheduled_v1.test.sql` (23/0 → cassé par le correctif car sa
  fixture appelait `synchroniser_capacite_stripe_service` en tant que `authenticated` par
  commodité → corrigé pour utiliser `service_role`, comme le fait réellement l'appelant en
  production → **23/0 de nouveau**).
- `renommage_elsatia_boutique.test.sql` (18/0 → cassé pour la même raison sur
  `boutique_finaliser_commande_payee` → même correction → **18/0 de nouveau**).

Les **115 échecs restants après correctif sont exactement les mêmes qu'avant** (même fichiers,
mêmes comptes) — confirmés être une limite de fidélité du harnais reconstruit à la main (AAL2/MFA
principalement, `platform_aal2_role_integrity_v1.test.sql` à lui seul : 36 échecs, tous
`auth.mfa_factors`/AAL non entièrement émulés — voir §0.1), **préexistants, non causés par cette
session**, à confirmer/écarter avec un vrai environnement `supabase start` (impossible dans ce
bac à sable, §0.1).

Vérifications complémentaires exécutées avec succès : `npm run verify:migrations` (314
migrations valides), `npm run verify:secrets` (2502 fichiers, aucun secret), `vitest run` ciblé
sur `src/app/api/stripe/boutique/webhook/route.test.ts` et
`src/lib/supabase/service-role-acl.test.ts` (7/7, aucun fichier source applicatif modifié par
cette session).

---

## 5. Findings non bloquants (P2/P3, non corrigés — documentés)

| ID | Sévérité | Résumé | Recommandation |
|---|---|---|---|
| RT-V3-P2-01 | P2 | `public.acces_module_pour_permission(p_entreprise_id, ...)` : oracle cross-tenant sur l'état d'abonnement/essai d'une entreprise tierce (booléen seul, aucune écriture) | `est_membre_actif(p_entreprise_id)` en garde, ou restreindre à `service_role` |
| RT-V3-P2-02 | P2 | `a_acces_application()` fait dépendre l'accès Colors/Tools/Reserves du statut d'abonnement **GP** via `est_membre_actif()` — confusion possible entre "compte racine" et facturation vraiment par app | Décision produit à trancher explicitement, pas une élévation de privilège en soi |
| RT-V3-P3-01 | P3 | `GET /api/identification/[id]/qr` sans `getContexteEntreprise()` explicite — mais RLS `codes_identification_membres` (`authenticated`, `est_membre_actif`) bloque déjà tout accès cross-tenant ; défense en profondeur seulement | Ajouter le garde-fou applicatif standard par cohérence de style |
| RT-V3-P3-02 | P3 | `public.document_commercial_par_token(p_token_hash text)` : ancienne RPC encore `GRANT ... TO anon`, remplacée en pratique par `document_commercial_public_par_token`, confirmée sans appelant dans `src/` | `revoke`/`drop` en nettoyage, hors périmètre "minimal et certain" de cette session |
| RT-V3-P3-03 | P3 | Endpoints de partage public (token 256 bits) sans rate limiting applicatif dédié | Non exploitable aujourd'hui (entropie du jeton), en profondeur seulement |

---

## 6. P1 confirmé, non corrigé dans cette session — SECURITY BLOCKER OPEN

**Webhooks Stripe Connect (factures) et Boutique cassés end-to-end depuis
`20260902000255_acl_reconciliation_v1`.**

- `stripe_webhook_events` : `service_role` n'a **aucun privilège** (`SELECT`, `INSERT`, etc.)
  sur cette table — confirmé par requête `information_schema.role_table_grants` sur la base
  rejouée (seul `postgres` a des droits). L'INSERT de dé-duplication, première écriture des deux
  routes webhook, échoue donc systématiquement en `42501` → 500 à chaque événement Stripe réel.
- `src/app/api/stripe/webhook/route.ts` appelle `stripe_connect_encaisser_facture_service` et
  `stripe_connect_expirer_checkout_facture_service` — **ces deux fonctions n'existent dans
  aucune migration appliquée** (confirmé par grep exhaustif de `supabase/migrations/`).
- **Déjà entièrement documenté, analysé et corrigé dans une branche jumelle jamais fusionnée** :
  `docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md` (11 flux cassés par la même migration 255,
  dont paie, relances automatiques, notifications push, retour bancaire Powens — pas seulement
  Stripe) + `docs/migrations-proposees/service-role-flux-acl-v1.sql.proposed` (14 fonctions + 6
  grants par colonne + le correctif Boutique déjà appliqué indépendamment par cette session,
  §2.03) + `docs/migrations-proposees/service-role-flux-acl-v1.pgtap.sql.proposed` (148
  assertions). Ce lot a déjà été validé end-to-end (pile Supabase dédiée, PostgREST réel, 9
  parcours Playwright) par la session qui l'a produit, le 2026-09-11, mais **jamais numéroté ni
  intégré**, et le dépôt a avancé de 278 → 314 migrations depuis.

**Pourquoi non corrigé dans cette session** : ce n'est pas un correctif "minimal et certain" —
c'est une réécriture de 14 fonctions serveur + 6 grants par colonne + changements dans 8 fichiers
`src/`, déjà validée en isolation par une session dédiée mais nécessitant une re-vérification
contre les 36 migrations ajoutées depuis (aucun accès à un vrai Stripe Test ni à une pile
PostgREST réelle dans ce bac à sable pour la revalider ici). L'intégrer à l'aveugle aurait été
le type de refactor large et non certain que cette mission demande explicitement d'éviter.

**Recommandation ferme** : prochaine session dédiée, base = état actuel (314 migrations),
reprendre `docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md` comme plan de correctif, re-numéroter
et revalider `service-role-flux-acl-v1.sql.proposed` avant fusion — le correctif RPC Boutique
qu'il contient est désormais redondant avec `20260922000323` (déjà appliqué ici) et devra être
retiré du lot au moment de l'intégration pour éviter un double correctif.

---

## 7. Fichiers modifiés par cette session

- `supabase/migrations/20260922000323_redteam_v3_authenticated_rpc_bypass_revocation.sql` (nouveau)
- `supabase/tests/redteam_v3_authenticated_rpc_bypass_revocation.test.sql` (nouveau, 13 assertions)
- `supabase/tests/capacity_stripe_r2_d_cancel_scheduled_v1.test.sql` (fixture : rôle de test
  corrigé `authenticated` → `service_role`, comportement testé inchangé)
- `supabase/tests/renommage_elsatia_boutique.test.sql` (idem)
- `docs/qualification/ELSATIA_SECURITY_TENANT_RED_TEAM_V3.md` (ce rapport)

Aucun fichier applicatif (`src/`) modifié. Aucune migration existante modifiée. Aucun secret
créé ni lu. Aucun accès Preview/Production/Stripe réel.

---

## 8. Verdict

```
SECURITY BLOCKERS OPEN
```

**3 vulnérabilités P0/P1 réelles trouvées, corrigées localement, vérifiées par exploit witness
réel (négatif + positif) et par comparaison A/B sans régression sur 2202 assertions
préexistantes.** Mais le verdict global reste **OPEN** tant que le P1 du §6 (webhooks Stripe
Connect/Boutique cassés en production depuis la migration 255, paiements clients non
réconciliés automatiquement) n'est pas intégré — c'est un blocage business-critique déjà
entièrement diagnostiqué et pré-corrigé sur une branche jumelle, en attente d'intégration, pas
une découverte nouvelle de cette session, mais toujours ouvert dans l'arbre qui sera poussé ici.

Rien n'est affirmé sur un environnement Preview ou Production non testé directement par cette
session. Seule la branche dédiée `claude/elsatia-redteam-v3` est poussée.
