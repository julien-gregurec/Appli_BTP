# ELSATIA-COLORS-ACCES-COMPTE-PARTAGE-RUNBOOK-V2

Accès de `julien@elsatia.fr` à ELSATIA Colors avec le **compte ELSATIA commun** —
état vérifié le 2026-09-20, procédure du matin, et ce qui reste hors de portée d'une
session sans identifiants.

Complète `ELSATIA_COLORS_POSTCUTOVER_ACCESS_RUNBOOK_V1.md` (branche
`audit/colors-account-access-predeploy-v1`) sans le remplacer : ses signatures RPC et
son parcours d'octroi restent exacts. Trois de ses hypothèses sont **périmées** — §4.

| | |
|---|---|
| Base | `integration/colors-pilot-readiness-v1` @ `a3769840` (train V3, 279 migrations, dernière `20260909000281`) |
| Branche de travail | `fix/colors-shared-auth-access-night-v1` |
| Diagnostic SQL | `scripts/diagnostics/acces-application-compte.sql` (lecture seule) |
| Jeu de recette | `tests/e2e/fixtures/colors-compte-partage.sql` + `tests/e2e/colors-compte-partage.spec.ts` |

---

## 1. Ce qu'est « le même compte », dans le code

Colors n'a **aucune authentification propre**. Il appelle le Supabase Auth du projet
ELSATIA (`signInWithPassword` dans `apps/colors/src/app/actions.ts`) : c'est le même
`auth.users` que Gestion Pro et Tools, donc **le même mot de passe**. Rien n'est stocké
côté Colors, et il n'existe aucun second mot de passe à synchroniser.

Ce que Colors ajoute n'est pas un compte mais **deux droits**, lus par RPC
(`a_acces_application`, `contexte_application_courant`, `applications_autorisees`) :

```
auth.users (compte commun, e-mail confirmé, non banni)
  └─ public.utilisateurs        → entreprise_active_id
      └─ utilisateurs_entreprises statut = 'actif'
          └─ entreprises.abonnement_statut ∉ {suspendu, annule}      (est_membre_actif)
              ├─ acces_applications_entreprises  (org, 'colors', autorise, fenêtre)
              └─ habilitations_applications_utilisateurs (user, org, 'colors', rôle actif, fenêtre)
```

Chaque maillon est nécessaire ; un seul manquant refuse l'accès. Un administrateur
plateforme actif contourne les deux derniers (voie « catalogue actif »), mais
`julien@elsatia.fr` **n'en est pas un** aujourd'hui — voulu, voir §5.

**Les sessions ne sont pas partagées entre applications.** Les cookies sont des cookies
d'hôte, sans attribut `domain` : se connecter sur `app.elsatia.fr` n'ouvre pas
`colors.elsatia.fr`. Même identité, mais une connexion par application. C'est écrit sur
l'écran de connexion de Colors (« Les sessions de cette application restent isolées »)
et dans `auth-relais-colors.ts`. Un vrai SSO serait une décision de sécurité — Q3.

---

## 2. Ce qui est PROUVÉ (pile locale jetable, 2026-09-20)

Pile `colors-night` (Supabase local, 279 migrations), Colors construit depuis cet arbre
(`next build`, 27 routes) et servi en mode production sur `127.0.0.1:3141`. Compte
jumeau `partage-julien@recette.invalid` : compte Auth commun, membre ordinaire, **pas**
admin plateforme, `colors_admin_organisation`.

| Parcours demandé | Résultat |
|---|---|
| 1-2 ouverture, page de connexion (compte commun, « aucun second compte ») | ✅ |
| 3-6 connexion, session, redirection, arrivée dans Colors | ✅ `/dashboard`, « Bonjour Julien », raison sociale |
| 7 chargement des données | ✅ 4 cartes de métriques |
| 8-9 aucun 401 / 403 sur l'origine | ✅ (toutes les réponses écoutées) ; `/api/acces` → `200 {"autorise":true}` |
| 10 aucune boucle de connexion | ✅ |
| 11 rafraîchissement sans perte de session | ✅ |
| 12 navigation Colors (inventaire, activité, dépôts, catalogues, nuanciers, utilisateurs, paramètres) | ✅ toutes 200 ; `/mouvements` → `/activite` par conception |
| 13 aller sur une autre origine puis revenir | ✅ l'autre origine n'a pas la session (isolation voulue), le retour la retrouve intacte |
| 14-15 déconnexion, reconnexion | ✅ |

**Un seul maillon manquant** — refusé « pour la bonne raison » (message *Votre compte
ELSATIA ne dispose pas d'un accès actif à Colors*, jamais « Identifiants incorrects », et
la session non autorisée est refermée) : entreprise active absente · entreprise active
sans appartenance · organisation autorisée sans habilitation · habilitation sans
organisation autorisée · abonnement de l'organisation suspendu · habilitation expirée.

**Droit retiré pendant une session ouverte** — habilitation retirée ou entreprise active
effacée → `/acces-refuse`, page terminale (recharger la laisse en place), bouton
**Se déconnecter**, aucune boucle ; le droit rétabli, la même session retrouve Colors.

**E-mail non confirmé** — annoncé comme tel (défaut corrigé, commit `caed09bb`) : GoTrue ne
répond `email_not_confirmed` qu'après avoir vérifié le mot de passe, donc aucun oracle
d'existence de compte (vérifié : mauvais mot de passe → `invalid_credentials`).

**Recette complète** (même pile, Colors reconstruit) : desktop 66 verts / 1 ignoré / 0 rouge —
les 35 parcours existants, la surface publique et les 13 scénarios ci-dessus — puis iPhone,
Android et iPad **9/9**. Quatre défauts réels sont sortis de cette recette et sont corrigés dans
la branche (double envoi = deux seaux ; **aucune déconnexion sur téléphone** ; service worker
absent sur `127.0.0.1` ; e-mail non confirmé) : rapport `docs/audits/ELSATIA-COLORS-ACCES-COMPTE-PARTAGE-NUIT-2026-09-20.md` §E.

Ce que ces résultats **ne prouvent pas** : que `julien@elsatia.fr` existe, ni ses droits,
ni le mot de passe, ni l'état de Preview/Production. Voir §3.

---

## 3. Ce qui n'a PAS pu être fait, et pourquoi

| Point | Blocage |
|---|---|
| Connexion réelle avec le vrai mot de passe | Il n'est ni lu ni saisi par une session automatisée. **À faire par Julien** (§6, étape 4). |
| Lecture de l'état Auth / droits de `julien@elsatia.fr` en Preview | Lecture distante refusée par le contrôle d'accès de la session (aucune identification disponible). Le diagnostic SQL de §6 répond en une requête. |
| Lecture Production | Refusée, y compris la copie de restauration locale. Aucune tentative de contournement. |
| Configuration Vercel (variables, domaines, déploiements) | La session CLI Vercel de ce Mac a **expiré** (HTTP 403). `vercel login` requis. |
| Réglages Supabase Auth (Site URL, Redirect URLs, gabarit e-mail) | Non lisibles sans le tableau de bord. |

**Sondes publiques du 2026-09-20 (GET sans authentification, code HTTP seul) :**

| URL | Constat |
|---|---|
| `colors.elsatia.fr/login` | 200, mais **ancien build** : `/robots.txt`, `/mot-de-passe-oublie`, `/auth/confirm` répondent **404**, aucune CSP, seule en-tête = HSTS de Vercel |
| `app.elsatia.fr` | « ELSATIA Gestion Pro », CSP nonce, `/plateforme` existe (307 → `/login`), projet Supabase `exhvuzegsefmoguxoiak` |
| `tools.elsatia.fr` | 200 |
| `reserves.elsatia.fr`, `studio.`, `doe.`, `market.`, `boutique.` | ne résolvent pas |

Conclusion : **Colors n'est pas déployé dans l'état de ce dépôt.** Ce qui tourne en
Production est antérieur au train V3 : tout ce qui est prouvé au §2 n'y est pas encore
en ligne.

---

## 4. Corrections au runbook V1 — à appliquer avant tout déploiement

1. **Nom de la clé publique.** V1 (§6) exige `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Le code
   actuel lit **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, sans repli** (`apps/colors/src/lib/supabase/cles.ts`),
   car les clés JWT legacy `anon`/`service_role` sont désactivées sur le projet. Le
   `prebuild` (`scripts/verify-public-env.mjs`) **refuse le build** en Production si la
   variable est absente. Conséquence : déployer Colors avec seulement l'ancienne variable
   échoue au build. Poser `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (même valeur que Gestion Pro).
2. **Contrat de variables Colors** (par nom) : `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COLORS_URL`,
   `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`, `ELSATIA_APPLICATION_ENV=production`, plus
   `SUPABASE_SERVICE_ROLE_KEY` côté serveur (photos).
3. **Base de déploiement.** V1 vise `77c6f4c` (ledger 263). La base à déployer est
   désormais le train V3 (279 migrations) : le ledger Production doit d'abord atteindre
   ce niveau — `contexte_application_courant` n'existe qu'à partir de la migration 234.
   Sur un ledger 210, Colors répond « service indisponible » à toute connexion.
4. **Gabarit e-mail Reset Password** : inchangé — `{{ .SiteURL }}/auth/confirm?token_hash=…&type=recovery`,
   jamais `{{ .RedirectTo }}`.

---

## 5. Pourquoi `julien@elsatia.fr` n'est PAS administrateur plateforme (et ne doit pas l'être par SQL)

`plateforme_admins` porte cette adresse en attente, `actif = false` (migration 235/236),
jusqu'à vérification d'identité. L'activer exige un **autre** admin `total` en AAL2, ou la
RPC `plateforme_proprietaire_revendiquer` (migration 266) avec un facteur MFA vérifié —
**aucune interface ne l'appelle** (0 occurrence dans `src/` et `apps/*/src/`).

Pour « tester et administrer Colors », la voie retenue est celle du modèle existant :
membre actif d'une organisation, organisation autorisée à Colors, habilitation
**`colors_admin_organisation`**. Elle donne l'administration de Colors pour l'organisation,
sans droit plateforme et sans second modèle de rôles. Décision d'aller plus loin : Q2.

---

## 6. Procédure du matin (dans l'ordre)

1. **Diagnostic (lecture seule).** SQL Editor Supabase → projet **Preview** puis
   **Production** → coller `scripts/diagnostics/acces-application-compte.sql` (adresse
   `julien@elsatia.fr`, application `colors` déjà réglées en tête). Lire la ligne
   `99 VERDICT` : elle nomme la première étape en échec et l'action. Sur un ledger < 234
   la requête échoue sur la première table absente — c'est déjà le diagnostic.
2. **Réparer le premier maillon KO**, jamais par SQL d'octroi :
   compte absent → invitation Gestion Pro · entreprise active → basculer depuis Gestion
   Pro · organisation → `/plateforme/entreprises/<id>/applications` « Activer
   l'application » · habilitation → même écran, rôle « Administrateur ELSATIA Colors »
   (session AAL2 de `julien.gregurec@gmail.com`). Détail : runbook V1 §4-§5.
3. **Déployer** Colors depuis cet arbre (§4 pour les variables), puis relancer le
   diagnostic.
4. **Connexion réelle** sur `https://colors.elsatia.fr/login` avec le mot de passe
   habituel de la plateforme, en navigation privée : `/dashboard`, actualiser,
   naviguer, se déconnecter, se reconnecter. Sonde de contrôle : `/login?error=nimportequoi`
   ne doit rien afficher, `/robots.txt` doit répondre 200 (sinon l'ancien build est encore servi).

Rejouer la recette locale : voir `tests/e2e/colors-compte-partage.spec.ts` (en-tête) ;
variables `E2E_BASE_URL`, `MDP_RECETTE`, `COLORS_DB_CONTAINER`.

---

## 7. Rejouer la recette locale

La pile de la nuit (`ELSATIA-STACKS/colors-night`, hors dépôt) est **arrêtée** ; ses données sont
conservées dans des volumes Docker. Ports 64321-64329 (les 62xxx sont pris par une pile Studio).
Points d'attention de son `config.toml` : `[auth.email.template.*]` désactivés — Docker Desktop
refuse le montage d'un fichier du volume externe (`mkdir /host_mnt/Volumes/ELSATIA-DEV: file exists`),
donc le gabarit de réinitialisation n'y est pas rejoué.

```bash
cd /Volumes/ELSATIA-DEV/ELSATIA-STACKS/colors-night
W=/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/colors-pilot-readiness-v1
$W/node_modules/.bin/supabase start -x studio,realtime,vector,imgproxy,edge-runtime,logflare
rm -f ARRET && (nohup ./servir-colors.sh >/dev/null 2>&1 &)          # Colors sur 127.0.0.1:3141, relancé s'il est tué
set -a; . ./.cles.env; set +a; export MDP_RECETTE="$(cat .mdp)"       # mot de passe LOCAL des comptes .invalid
for f in colors-pilote colors-compte-partage; do
  docker exec -i -e MDP_RECETTE="$MDP_RECETTE" supabase_db_colors-night psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < $W/tests/e2e/fixtures/$f.sql
done
cd $W && E2E_BASE_URL=http://127.0.0.1:3141 COLORS_DB_CONTAINER=supabase_db_colors-night \
  E2E_SUPABASE_URL="$API_URL" E2E_SUPABASE_ANON_KEY="$PUBLISHABLE_KEY" E2E_SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  npx playwright test tests/e2e/colors-parcours-authentifies.spec.ts tests/e2e/colors-surface-publique.spec.ts tests/e2e/colors-compte-partage.spec.ts --project=desktop-chromium
```

Ne jamais lancer `pkill -f next…` sur cette machine : d'autres sessions y font tourner leurs propres
serveurs. Arrêter par port : `lsof -ti tcp:3141 -sTCP:LISTEN | xargs kill`.
