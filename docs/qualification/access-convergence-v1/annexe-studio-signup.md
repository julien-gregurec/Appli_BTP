# Annexe — Studio : signup fermé, patch isolé

Statut : livré en patch isolé, non fusionné. Branche `fix/studio-signup-closed-v1` @ `634651a0`, créée depuis le tip du train Studio `05c775d5` (worktree `/Users/juliengregurec/Projects/.worktrees/studio-signup-closed-v1`). Aucun push. Aucune commande sur le worktree Studio d'origine ni sur un Supabase distant. Patch : `studio-signup-closed.patch` (même dossier). Légende : [LU] lu dans le code, [EXÉCUTÉ] rejoué, [INFÉRÉ] déduit.

## 1. Isolation vérifiée [EXÉCUTÉ]

- `integration/studio-commercial-ready-v1` = `05c775d5` : n'a pas avancé. Les 11 branches `feat/studio-*` et `origin/feat/elsatia-studio-v1` sont toutes à 0 commit d'avance sur ce tip ; aucune ne touche `signup-gate`, `supabase/config.toml` ni une migration d'admission. Studio n'est pas dans `fix/app-access-convergence-v1` : le patch ne touche pas cette branche.
- Les migrations Studio vivent dans `supabase/migrations/` (racine) et sont référencées par des symlinks dans `apps/studio/supabase/migrations/` [LU]. La nouvelle migration suit ce schéma.

## 2. Le défaut [LU + EXÉCUTÉ]

`signup` (server action) consultait `registrationGate` (variable d'environnement `STUDIO_SIGNUP_MODE`, défaut `open`), puis appelait `auth.signUp`. Le filtre n'existait que dans Next : un `POST /signup` de GoTrue avec la clé publique créait le compte sans passer par lui. Reproduit sur un GoTrue v2.192.0 réel sans hook, politique `closed` : **HTTP 200, compte créé** (`sp_gotrue_proof.txt`, section AVANT).

## 3. Correctif (une décision, trois points d'application)

| Élément | Rôle |
|---|---|
| `studio_signup_policy` (singleton) | `mode` ∈ `open`/`allowlist`/`closed`, défaut **`closed`**, `allowlist text[]`. RLS active, **aucun GRANT, aucune policy** : illisible et non modifiable par l'API. |
| `studio_signup_permitted(email)` | Source unique. Ligne absente = refus ; `open` = admis ; sinon adresse valide requise, puis invitation en attente (`studio_pending_invitation_for`), puis liste (adresse exacte ou `@domaine`, casse ignorée, sans sous-domaine). Exécutable par `service_role` seulement (jamais `authenticated` : oracle sur invitations et liste). |
| `studio_hook_before_user_created(event)` | Hook Auth : `{}` = accepter, `{"error":{"http_code":403,"message":…}}` = refuser (message identique pour tous les refus). Exécutable par `supabase_auth_admin` seulement. |
| `studio_create_workspace` (`create or replace`) | Même prédicat, plus reconnaissance des comptes déjà propriétaires ou membres d'un espace (fermer n'expulse personne). Sinon `42501 Inscription fermée`. |
| Server action `signup` | `entitlement.ts` appelle `studio_signup_permitted` via la clé de service ; erreur, exception, `null` ou tout ce qui n'est pas `true` = refus. `STUDIO_SIGNUP_MODE` / `STUDIO_SIGNUP_ALLOWLIST` sont **retirées** (ignorées) ; `parseSignupMode` absent/inconnu = `closed`. |
| `apps/studio/supabase/config.toml` | `[auth.hook.before_user_created]` activé, `pg-functions://postgres/public/studio_hook_before_user_created`. |

Fichiers : migration `supabase/migrations/20260921070000_studio_signup_policy.sql` (+ symlink Studio), `supabase/tests/studio_signup_policy.test.sql`, `apps/studio/{src/lib/signup-gate.ts, src/lib/entitlement.ts, tests/signup-gate.test.ts, supabase/config.toml, scripts/local-test.mjs, README.md}`. Le SQL existant n'est pas modifié (le seul remplacement de fonction est un `create or replace` dans la nouvelle migration ; `boundaries.test.ts`, qui lit la migration de fondation, reste vert).

## 4. Preuves exécutées

**(a) Vitest** (`signup-gate.test.ts` + `boundaries.test.ts`) : 9/9 PASS ; `tsc --noEmit` exit 0 ; eslint des 3 fichiers sans message. Avant : `parseSignupMode(undefined)` valait `open` ; après : `closed`, et le garde échoue fermé sur erreur RPC, exception, `null`, `"true"`, `1`.

**(b) SQL sur base jetable (`dbd`, modèle `accessbase`)**, 15 migrations Studio + la mienne :
- pgTAP `studio_signup_policy` : 35/35 (modes ; liste sans sous-domaine ni suffixe trompeur ; hook avec événement vide, sans e-mail, ligne absente ; invitation en attente ; compte non admis sans espace ; invité et adresse listée admis ; propriétaire préexistant conservé ; idempotence du workspace personnel ; privilèges `authenticated`/`anon`/`service_role`/`supabase_auth_admin`).
- 15 pgTAP Studio existants : base témoin `dbd0` (sans ma migration) = tous PASS (plans 18 à 105, 0 `not ok`, 0 erreur). Sur `dbd` politique **`closed`** : les 15 échouent (erreurs `Inscription fermée`) parce que leurs fixtures insèrent des utilisateurs en SQL puis appellent `studio_create_workspace` : c'est la conséquence attendue du fail-closed. Sur `dbd` politique **`open`** : sortie identique au témoin, fichier par fichier.

**(c) GoTrue réel** (v2.192.0 sur un Postgres Supabase vierge dédié, hook activé par variables d'environnement ; conteneurs supprimés ensuite ; détail dans `sp_gotrue_proof.txt` du scratchpad). Appel direct au point d'entrée de signup de GoTrue : sans hook = 200, compte créé ; avec hook et politique `closed` = **403** « Les inscriptions à ELSATIA Studio sont fermées », 0 compte ; liste : hors liste 403, adresse listée 200, `@domaine` 200 ; fermé + invitation en attente 200, fermé sans invitation 403 ; ouvert 200 ; ligne de politique supprimée 403. Non rejoué : Playwright E2E (pile Supabase CLI complète, connue bloquée sur ce poste) ; l'ouverture de la pile jetable par `local-test.mjs` (docker exec `psql`, `supabase_db_<projet>`) est vérifiée syntaxiquement seulement.

## 5. Ce qui change pour les tests

- E2E Playwright : les ~14 specs qui font `auth.signUp` en direct restent inchangées ; c'est `local-test.mjs setup` (et `test-db`) qui **ouvre explicitement la politique de la pile jetable** (`update studio_signup_policy set mode='open'`, sans effet si la table est absente pour les baselines `--lot-x`). Rien n'ouvre une autre base. Le mode fermé reste à jouer en E2E (spec à ajouter sur une pile dédiée).
- pgTAP existants : à jouer avec la politique ouverte (le harnais le fait) ; sur une base fraîche livrée fermée, ils échouent, c'est voulu.

## 6. Limites

- **Hébergé** : `config.toml` n'est pas appliqué au projet distant. Régler le hook dans le tableau de bord (Authentication > Hooks > Before User Created > fonction Postgres `public.studio_hook_before_user_created`). Tant que ce n'est pas fait, le contournement direct reste ouvert en production, seul le second verrou (`studio_create_workspace`) tient.
- **Projet dédié uniquement** : le hook s'applique à tout le projet Auth. Ne jamais l'activer sur un projet partagé avec Gestion Pro ou une autre application (il refuserait leurs inscriptions). La migration reste inoffensive sur une base partagée sans hook, mais `studio_create_workspace` y devient fermé par défaut.
- **Invitation squattable** : la politique admet l'adresse invitée sans prouver qu'on la possède. Sans confirmation d'e-mail, un tiers peut s'inscrire avec l'adresse d'un invité et accepter l'invitation ; avec confirmation (`enable_confirmations = true`, déjà le cas dans la config Studio dédiée), il peut au mieux squatter l'adresse et empêcher l'invité de s'inscrire. La confirmation d'e-mail doit rester obligatoire.
- **Membre = admis** : un compte membre (par invitation acceptée) peut ensuite créer ses propres espaces en mode fermé. Choix conservateur pour ne pas expulser d'anciens comptes ; durcissable (restreindre aux propriétaires) sans changer le contrat.
- **Autres canaux** : le hook couvre tous les fournisseurs (e-mail, OAuth, anonyme). `enable_signup=false` + clé de service est écarté (décision antérieure). La politique se change en SQL par un opérateur ; il n'y a volontairement aucune API pour la modifier.
- Le document `ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md` et le rapport de finalisation V2 citent encore `STUDIO_SIGNUP_MODE` : à mettre à jour lors de la fusion.

## 7. Conflits de fusion attendus avec le train Studio

Le train n'a pas bougé depuis `05c775d5` : fusion sans conflit aujourd'hui. Futurs points de contact si le train avance : `signup-gate.ts`, `entitlement.ts`, `tests/signup-gate.test.ts` (réécrits), `supabase/config.toml` (bloc hook), `scripts/local-test.mjs`, `README.md` (une ligne), et **l'horodatage de migration** `20260921070000` (à renuméroter si le train en insère un intermédiaire ; il modifie `studio_create_workspace` par `create or replace`, donc à ordonner après toute autre redéfinition de cette fonction). Le raccordement futur à un jeton d'habilitation plateforme se fera derrière `EntitlementProvider`, sans toucher au hook.

## 8. DECISION_REQUIRED

- `DECISION_REQUIRED` : politique par défaut en production (`closed`, `allowlist` ou `open` au lancement) — défaut conservateur appliqué : `closed`, aucune ouverture publique ; l'ouverture est un `update` SQL explicite.
- `DECISION_REQUIRED` : contenu de la liste d'autorisation initiale (adresses/domaines, dont l'équipe ELSATIA et les testeurs) — défaut conservateur appliqué : liste vide.
- `DECISION_REQUIRED` : un membre invité peut-il créer ses propres espaces en mode fermé ? — défaut conservateur appliqué : oui (admis une fois, admis ensuite) ; restreindre aux propriétaires si Julien le souhaite.
- `DECISION_REQUIRED` : qui règle le hook sur le projet Studio hébergé, et quand (prérequis avant toute exposition publique) — défaut conservateur appliqué : aucune action distante.
