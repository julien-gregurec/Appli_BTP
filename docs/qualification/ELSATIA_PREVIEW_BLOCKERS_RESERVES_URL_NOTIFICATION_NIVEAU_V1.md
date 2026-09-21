# ELSATIA — Fermeture de deux blockers Preview indépendants (Reserves URL / notification devis accepté)

**Mission** : fermer, et fermer uniquement, les deux blockers suivants identifiés par l'audit final
(`docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md` et le contre-audit qui l'a suivi) :

- **BLOCKER 1** — Reserves : repli silencieux vers `http://localhost:3020` quand
  `NEXT_PUBLIC_RESERVES_URL` est absente.
- **BLOCKER 3** — Gestion Pro : `notifier_devis_accepte()` insère `niveau = 'info'`, une valeur qui
  viole `notifications_utilisateurs_niveau_check`.

Aucun autre blocker traité (Studio légal/RGPD, partage public documents, manifeste RGPD,
performance, `situations_travaux`, `next_reference`, tarification Stripe, Preview hébergée,
Production — tous hors périmètre, non touchés).

```
Branche de travail   = fix/preview-blockers-reserves-notif-v1
SHA initial          = e0a83eb (HEAD distant réel de claude/compassionate-euler-5j6avr au
                        démarrage de cette mission — vérifié par git fetch avant toute
                        branche, inchangé depuis l'audit qui a identifié ces deux blockers)
SHA final             = voir dernier commit de cette branche (poussée après ce rapport)
```

Aucun travail effectué directement sur `claude/compassionate-euler-5j6avr` : la branche dédiée a
été créée depuis son HEAD distant réel, puis détachée de son suivi (`--unset-upstream`) pour
garantir qu'aucun push accidentel ne puisse atteindre le train principal.

---

## BLOCKER 1 — Reserves / `NEXT_PUBLIC_RESERVES_URL`

### 1.1 — Inspection des gardes existantes (avant toute écriture)

Les implémentations actuelles de Tools et Colors ont été lues intégralement avant toute décision :

- `apps/tools/scripts/verify-public-env.mjs` + `apps/tools/src/lib/public-env-guard.test.ts` —
  indicateur de mode propre à Tools (`NEXT_PUBLIC_TOOLS_ENV`), absent/inconnu ⇒ `production`.
- `apps/colors/scripts/verify-public-env.mjs` + `apps/colors/src/lib/public-env-guard.test.ts` —
  indicateur de mode `ELSATIA_APPLICATION_ENV` (avec `VERCEL_ENV` comme fait de plateforme
  prioritaire), même absence/inconnu ⇒ `production`.

Constat déterminant le choix de gabarit : Reserves ne lit **aucun** indicateur d'environnement
applicatif aujourd'hui (ni `ELSATIA_APPLICATION_ENV`, ni un équivalent `NEXT_PUBLIC_RESERVES_ENV`
propre) — contrairement à Gestion Pro/Colors (`ELSATIA_APPLICATION_ENV`) et à Tools
(`NEXT_PUBLIC_TOOLS_ENV`). `ELSATIA_APPLICATION_ENV` est cependant déjà l'indicateur **canonique**
de l'écosystème (`config/env-manifest.json`, `scripts/lib/env-manifest-core.mjs`,
`scripts/lib/env-manifest-preflight.mjs`) : la garde de Reserves reprend donc exactement la
logique de résolution de mode de Colors (`resoudreMode`/`niveauApplication`, même précédence
`VERCEL_ENV=production` > `ELSATIA_APPLICATION_ENV` déclaré > `VERCEL_ENV=preview/development` >
défaut `production`), **sans** modifier le code applicatif de Reserves pour lire cette variable —
elle n'est utilisée que par le script de garde lui-même. Aucun nouveau système inventé.

### 1.2 — Cause exacte

- `apps/reserves/src/lib/invitations.ts:31` (`urlApplicationReserves()`) —
  `process.env.NEXT_PUBLIC_RESERVES_URL ?? "http://localhost:3020"`.
- `apps/reserves/src/app/layout.tsx:6` (`metadataBase`) — même repli.
- `apps/reserves/package.json` ne déclarait **aucun** script `prebuild` : contrairement à
  `apps/tools` et `apps/colors`, rien n'interrompait `next build` en l'absence de ces variables.

Next fige `process.env.NEXT_PUBLIC_*` au moment du build : un `next build` Production lancé sans
`NEXT_PUBLIC_RESERVES_URL` réussissait silencieusement et chaque invitation envoyée par e-mail
contenait un lien mort (`http://localhost:3020/invitation/...`).

### 1.3 — Correctif

Le repli du code (`invitations.ts:31`, `layout.tsx:6`) est **conservé tel quel** — c'est le
comportement de confort en local que le pattern existant (Colors : `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`
replie sur `http://localhost:3000/abonnement`) prévoit déjà et ne supprime pas. Ce qui change :
un build destiné au déploiement ne peut plus l'atteindre.

**Fichiers créés :**
- `apps/reserves/scripts/verify-public-env.mjs` — jumelle de `apps/colors/scripts/verify-public-env.mjs`.
  Contrat réellement relevé dans `apps/reserves/src` : `NEXT_PUBLIC_SUPABASE_URL` (requis),
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` (requis — nom legacy réellement lu par ce code, pas
  `PUBLISHABLE_KEY`), `NEXT_PUBLIC_RESERVES_URL` (requis), `ELSATIA_APPLICATION_ENV` (requis,
  indicateur de mode de la garde uniquement).
- `apps/reserves/scripts/verify-public-env.d.mts` — jumelle de `apps/colors/scripts/verify-public-env.d.mts`
  (types pour `tsc`, `allowJs` désactivé).
- `apps/reserves/src/lib/public-env-guard.test.ts` — 24 tests, jumeaux de ceux de Colors, adaptés
  au contrat de Reserves.

**Fichiers modifiés :**
- `apps/reserves/package.json` — ajout de `"verify:public-env": "node scripts/verify-public-env.mjs"`,
  `"prebuild": "npm run verify:public-env"`, et `scripts` de `scripts/` dans la commande `lint`
  (mêmes noms de scripts que Colors/Tools).
- `apps/reserves/.env.example` — ajout de `ELSATIA_APPLICATION_ENV` documentée (lue uniquement par
  la garde).
- `config/env-manifest.json` — réconciliation minimale (§1.5).
- `scripts/verify-secrets.mjs` — une exception nommée ajoutée pour
  `apps/reserves/src/lib/public-env-guard.test.ts` (mêmes valeurs factices de test — clé privée
  PEM, JWT `service_role` — que l'exception déjà nommée pour le fichier jumeau de Colors ;
  nécessaire pour que `verify:secrets` reste à 0 faux positif).

**Non modifié** : `apps/reserves/src/lib/invitations.ts`, `apps/reserves/src/app/layout.tsx` —
le repli lui-même n'est pas supprimé (pattern déjà établi par Colors), seul un garde-fou de build
l'entoure désormais.

### 1.4 — Comportement sans `NEXT_PUBLIC_RESERVES_URL` — avant / après

| | Avant | Après |
|---|---|---|
| `npm run build` (Reserves, sans variables, sans mode déclaré) | **PASS** silencieux — invitations pointant vers `http://localhost:3020` | **FAIL explicite**, exit 1, avant `next build` — voir §1.6 |
| `npm run build` (Reserves, `ELSATIA_APPLICATION_ENV=local`) | PASS (inchangé) | **PASS** (inchangé — confort local préservé) |
| `npm run build` (Reserves, toutes variables valides, mode production) | PASS | **PASS** (revérifié, §1.6) |

### 1.5 — Réconciliation `config/env-manifest.json`

Deux ajustements, strictement pour refléter le correctif réellement implémenté :

1. `ELSATIA_APPLICATION_ENV.applications` : ajout de `"reserves"` (la garde de Reserves lit
   désormais cette variable — pas le reste du code applicatif).
2. `scan.dynamic_access_allowed` : ajout de `apps/reserves/scripts/verify-public-env.mjs`, même
   justification que l'entrée jumelle `apps/tools/scripts/verify-public-env.mjs` (« itère sur la
   liste de variables publiques déclarées par ce même script pour construire son rapport ; ne lit
   jamais une variable applicative arbitraire »).
3. `findings[F-URL-LOCALHOST-FALLBACK].next_step` : mis à jour pour indiquer que Colors **et**
   Reserves ont désormais une garde de pré-build bloquante ; `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL`
   (Gestion Pro) reste explicitement hors périmètre de ce correctif (encore sur `preflight --auto`).

`node scripts/check-env-manifest.mjs` : revenu exactement à l'état préexistant après réconciliation
— **37 erreurs**, toutes rattachées à Studio (continuation non portée, hors périmètre de cette
mission — état documenté et inchangé depuis le lot Studio du train principal). **Zéro erreur liée à
Reserves.** Trois occurrences `ENV-DEPRECATED-USED` (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) restent,
attendues : la garde cite ce nom dans son propre contrat, exactement comme `proxy.ts`/`server.ts`
le font déjà — sujet `F-SUPABASE-PUBLIC-KEY-NAME`, explicitement hors périmètre.

### 1.6 — Preuves (exécutées directement, pas seulement testées en unitaire)

```
$ ELSATIA_APPLICATION_ENV=production node scripts/verify-public-env.mjs
ERREUR  NEXT_PUBLIC_SUPABASE_URL : absente
ERREUR  NEXT_PUBLIC_SUPABASE_ANON_KEY : absente
ERREUR  NEXT_PUBLIC_RESERVES_URL : absente
exit=1

$ ELSATIA_APPLICATION_ENV=production NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_x NEXT_PUBLIC_RESERVES_URL=http://localhost:3020 \
  node scripts/verify-public-env.mjs
ERREUR  NEXT_PUBLIC_RESERVES_URL : doit être en https sur un build publié
exit=1

$ ELSATIA_APPLICATION_ENV=production <toutes variables valides, https> node scripts/verify-public-env.mjs
exit=0

$ ELSATIA_APPLICATION_ENV=local node scripts/verify-public-env.mjs
« mode local, contrôle non bloquant, rien à signaler »
exit=0

$ npm run build   # sans aucune variable, sans mode déclaré (défaut = publié)
> prebuild : verify:public-env
ERREUR × 4 (dont ELSATIA_APPLICATION_ENV elle-même)
Build interrompu avant `next build`.
exit=1   (next build n'a jamais démarré)

$ ELSATIA_APPLICATION_ENV=local NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run build
exit=0, next build complet (23 routes)

$ ELSATIA_APPLICATION_ENV=production NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co \
  NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_x NEXT_PUBLIC_RESERVES_URL=https://reserves.elsatia.fr \
  npm run build
exit=0, next build complet
```

L'origine produite par `urlInvitation()`/`urlApplicationReserves()` avec une variable valide est
couverte par les tests préexistants de `invitations.test.ts` (non modifiés, toujours 100 % verts) :
`https://reserves.elsatia.fr` sans barre oblique finale, jeton encodé. Le comportement http(s)
localhost interdit sur un build publié est couvert par `public-env-guard.test.ts` (« refuse
`http://localhost:3020` sur un build publié, et l'accepte en local »).

### 1.7 — Tests Reserves (garde) — couverture demandée

| Critère demandé | Vérifié |
|---|---|
| variable présente + URL valide → PASS | §1.6, + `public-env-guard.test.ts` (« passe quand l'environnement est complet ») |
| variable absente en contexte déployable → FAIL explicite | §1.6 (CLI + `npm run build`), + `it.each` sur chaque variable requise |
| localhost interdit en contexte déployable | §1.6 (`http://localhost:3020` refusé en production, accepté en local) |
| build Reserves, environnement valide → PASS | §1.6 (`npm run build`, `npm run build:reserves`) |
| invitations produisent la bonne origine | `invitations.test.ts` (préexistant, inchangé, toujours vert) |

**Verdict : `PREVIEW BLOCKER 1 CLOSED`.**

---

## BLOCKER 3 — Notification « devis accepté »

### 2.1 — Localisation exacte (avant tout correctif)

| Élément | Localisation |
|---|---|
| RPC en cause | `public.notifier_devis_accepte(p_devis_id uuid)` — `supabase/migrations/20260922000311_gp_pilot_notification_devis_accepte.sql:19-59` |
| Table | `public.notifications_utilisateurs` |
| Contrainte CHECK | `notifications_utilisateurs_niveau_check`, définie par `supabase/migrations/20260715000081_securite_terrain_alertes_personnalisation.sql:28` : `niveau text not null default 'information' check(niveau in ('information','attention','critique'))` — **jamais modifiée depuis**, vérifié sur les 10 migrations touchant cette table/colonne entre 081 et 311 |
| Valeur litigieuse | `'info'`, ligne 50 de la migration 311 (dans la clause `select` du deuxième `insert into notifications_utilisateurs`) |
| Appelant applicatif | `src/app/actions/devis.ts:198` (`supabase.rpc("notifier_devis_accepte", …)`) |
| Autres émetteurs de `niveau` (exhaustif) | `notifier_permission()`/`notifier_utilisateur()` (migration 081, valeurs `'critique'`/`'attention'`), `notifications_planning` (migration 135, `p_niveau` passé par l'appelant), `alertes_pointage_manquant_et_a_valider` (migration 162), `deleguer_alerte_operationnelle` (migration 220, `alerte_niveau in ('critique','attention')`) — **aucun** n'utilise jamais `'info'` |
| Usages TypeScript/UI | `src/app/(app)/dashboard/page.tsx:294` — rendu conditionnel sur `niveau==="critique"`/`"attention"`, tout le reste (dont `'information'` et `'info'`) retombe sur le même style par défaut : l'UI ne masquait donc pas la divergence, mais ne la révélait pas non plus |
| Test pgTAP concerné | `supabase/tests/gp_pilot_notification_devis_accepte.test.sql` (7 assertions) |

### 2.2 — Quelle partie a divergé

**Option B retenue** : la contrainte représente le contrat actuel ; la RPC de la migration 311 a
introduit une valeur incorrecte.

Preuve, pas déduction : la contrainte `('information','attention','critique')` est définie depuis
la toute première migration créant cette table (081) et n'a **jamais** été modifiée par aucune des
9 autres migrations qui touchent `notifications_utilisateurs`/`niveau` jusqu'à 311 elle-même.
Chacun des quatre autres émetteurs de notifications, répartis sur plus de deux mois de migrations
(081, 135, 162, 220), utilise exclusivement les trois valeurs canoniques. Aucun n'utilise jamais
`'info'`. La migration 311 est la seule à s'écarter — et c'est la plus récente des cinq, pas la
plus ancienne. Rien dans le code TypeScript/UI ne dépend de la forme abrégée `'info'` : le rendu du
tableau de bord ne discrimine que `'critique'`/`'attention'`, donc `'information'` produit
exactement le même rendu que `'info'` l'aurait produit s'il avait pu être inséré.

### 2.3 — Correctif appliqué

`supabase/migrations/20260922000318_correctif_notification_devis_accepte_niveau.sql` :
`create or replace function public.notifier_devis_accepte(p_devis_id uuid)` — **un seul
caractère du corps change** (`'info'` → `'information'`, ligne correspondant à 311:50). Tout le
reste — signature, garde `a_permission(v_devis.entreprise_id, 'gerer_devis')`, filtre
`ue.statut = 'actif'`, jointure sur `permissions_poste`/`pp.autorise`, exclusion de l'auteur du
changement (`ue.utilisateur_id is distinct from auth.uid()`), écriture dans `journal_activite` —
repris à l'identique de 311.

### 2.4 — Sécurité SQL, avant / après

| Propriété | Avant (migration 311) | Après (migration 318) |
|---|---|---|
| Signature | `notifier_devis_accepte(uuid) returns void` | **inchangée** |
| Owner | `postgres` | **inchangé** (`postgres`, vérifié par requête `pg_proc`/`pg_get_userbyid`) |
| `SECURITY DEFINER` | oui | **inchangé** (`prosecdef = t`, vérifié) |
| `search_path` | `public` (fixé) | **inchangé** (`proconfig = {search_path=public}`, vérifié) |
| Grants | `revoke all ... from public, anon; grant execute ... to authenticated;` | **inchangés** (`proacl` vérifié après migration : `{postgres=X/postgres, authenticated=X/postgres}` — identique à avant, aucun rôle ajouté, `anon`/`public`/`service_role` toujours sans `EXECUTE`) |
| Validation entreprise/utilisateur | `a_permission(entreprise_id, 'gerer_devis')` + `statut='actif'` + `pp.autorise` | **inchangée**, byte pour byte |
| RLS | Fonction `SECURITY DEFINER` (contourne RLS par construction, comme avant) ; aucune table touchée par ce lot ne change de policy | **inchangée** |

**Aucun élargissement de privilège.**

### 2.5 — Isolation multi-tenant — vérifié explicitement

En plus des 3 assertions pgTAP dédiées (§2.6), vérification manuelle directe sur la base Fresh
(harnais décrit en §3) :

```
Gérant A (gerer_devis) déclenche la notification sur son propre devis :
  2 notifications créées, entreprise_id = A dans les deux cas (0 fuite vers B)
  niveau = 'information' dans les deux cas (contrat canonique respecté)
  auteur du changement (gérant A) absent des destinataires
  cross_tenant_leak (count des notifications type=devis_accepte hors entreprise A) = 0
```

Le test pgTAP préexistant couvre en outre explicitement le cas d'attaque direct : un gérant de
l'entreprise B appelant la fonction sur un devis de l'entreprise A échoue avec « Accès refusé »
(la garde `a_permission` est évaluée sur `v_devis.entreprise_id`, jamais sur l'entreprise de
l'appelant).

### 2.6 — Test `gp_pilot_notification_devis_accepte.test.sql` — avant / après

| # | Assertion | Avant | Après |
|---|---|---|---|
| 1 | la fonction existe | ok | ok |
| 2 | membre sans `gerer_devis` refusé | ok | ok |
| 3 | gérant d'une autre entreprise refusé | ok | ok |
| 4 | gérant `gerer_devis` autorisé (`lives_ok`) | **échoue** (violation CHECK) | **ok** |
| 5 | entrée `journal_activite` créée | **échoue** (transaction annulée par l'échec de 4) | **ok** |
| 6 | au moins un responsable notifié | **échoue** | **ok** |
| 7 | l'auteur n'est pas notifié | ok (incidentellement — rien n'était inséré) | ok |

**7/7 PASS** après correctif (rejoué directement via `pg_prove`, voir §3).

**Verdict : `PREVIEW BLOCKER 3 CLOSED`.**

---

## 3 — Non-régression

### 3.1 — Harnais local (pas d'accès Docker/Supabase distant dans cette session)

Docker (`docker ps`) indisponible (`dial unix /var/run/docker.sock: ... no such file or
directory`, `service docker start` refuse — `ulimit: Operation not permitted`), donc
`supabase start` indisponible — identique à toutes les sessions précédentes de ce train.
PostgreSQL 16 (apt) + `postgresql-16-pgtap` installés et utilisés en local. Harnais reconstruit
selon la même méthode que les rapports précédents (§6.2/§17.1/§18.3 de
`ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md`) : schémas `auth`/`storage`/`extensions`, rôles
`anon`/`authenticated`/`service_role`, `auth.uid()/role()/jwt()/email()` simulés par GUC de
session (`request.jwt.claim.*`), `storage.foldername()`, `pgcrypto`/`pg_trgm` préinstallées dans
`extensions` (comme sur un vrai projet Supabase), extension `pgsodium` factice (stub local,
`crypto_sign_verify_detached` renvoie `false` — capacité de signature réelle non fournie,
`platform_stripe_state_attestation_r72.test.sql` reste hors de portée, comme documenté par toutes
les sessions précédentes). Fidélité du harnais vérifiée par comparaison directe avec les
dénombrements déjà publiés : 232 tables publiques (232/232 RLS active) et 549 policies —
**identiques** aux chiffres du §18.3 du rapport de convergence, avant même d'exécuter un seul
test pgTAP. Aucun fichier de ce harnais ne fait partie du dépôt.

### 3.2 — Baseline établie sur le HEAD de départ (`e0a83eb` + rien d'autre)

Avant tout correctif, Fresh (308 migrations) + pgTAP complet rejoués sur ce harnais pour établir
un baseline **mesuré dans cette session**, pas seulement recopié des rapports précédents :

```
Fresh : 308/308 migrations, 0 erreur SQL
pgTAP : Files=90, Tests=2403
5 fichiers non entièrement verts :
  document_partage_public_par_jeton_v1.test.sql      10/42 exécutés (hors périmètre de cette mission)
  gp_pilot_notification_devis_accepte.test.sql        4/7 (3 échecs)  ← BLOCKER 3
  gp_pilot_plateforme_admin_role_total.test.sql        0/6 exécutés (hors périmètre)
  gp_pilot_rgpd_manifeste_fichiers.test.sql            1/9 exécutés (hors périmètre)
  platform_stripe_state_attestation_r72.test.sql       hors de portée du harnais (hors périmètre)
```

Concorde exactement avec le baseline documenté au §18.4 du rapport de convergence (même 5
fichiers, mêmes comptes précis) — confirmé indépendamment dans cette session, pas supposé.

### 3.3 — Après les deux correctifs (migrations 309 : les 308 + `20260922000318`)

```
Fresh   : 309/309 migrations, 0 erreur SQL
pgTAP   : Files=90, Tests=2403
4 fichiers non entièrement verts (tous confirmés identiques au baseline, cause inchangée) :
  document_partage_public_par_jeton_v1.test.sql      10/42 exécutés — hors périmètre, inchangé
  gp_pilot_plateforme_admin_role_total.test.sql        0/6 exécutés — hors périmètre, inchangé
  gp_pilot_rgpd_manifeste_fichiers.test.sql            1/9 exécutés — hors périmètre, inchangé
  platform_stripe_state_attestation_r72.test.sql       hors de portée du harnais — hors périmètre, inchangé
gp_pilot_notification_devis_accepte.test.sql : sorti de la liste, 7/7 PASS
```

**0 nouvel échec. 1 fichier résolu (celui du BLOCKER 3). Les 4 autres, strictement hors périmètre
de cette mission, restent identiques au baseline — non touchés, non tentés.**

### 3.4 — Le reste de la checklist demandée

| Contrôle | Résultat |
|---|---|
| `verify:migrations` | **PASS** — 309 migrations valides, horodatages uniques |
| `verify:secrets` | **PASS** — 2483 fichiers suivis, 0 secret réel (2 exceptions nommées : Colors préexistante + Reserves ajoutée §1.3) |
| `typecheck` (GP + Tools + Reserves + Colors) | **PASS**, 0 erreur, 4/4 apps |
| `lint` (GP + Tools + Reserves + Colors) | **PASS**, 0 erreur, 6 avertissements préexistants (aucun dans un fichier touché par cette mission) |
| `test` — GP | **PASS** 1786/1786 (inchangé) |
| `test` — Tools | **PASS** 1992/1992 (inchangé) |
| `test` — Reserves | **PASS** 178/178 (154 préexistants + 24 nouveaux, garde publique) |
| `test` — Colors | **PASS** 427/427 (inchangé) |
| `build` GP (`next build`) | **PASS**, compilation complète |
| `build` Tools (chaîné par `npm run build`) | bloqué par son propre garde-fou `verify:public-env` préexistant (variables absentes du bac à sable) — **inchangé, sans rapport avec cette mission** |
| `build:reserves` | **PASS**, avec variables valides (production **et** local, les deux vérifiés §1.6) |
| `node scripts/check-env-manifest.mjs` | 37 erreurs, **toutes Studio, identiques au préexistant** — 0 erreur Reserves après réconciliation §1.5 |
| `node --test scripts/check-env-manifest.test.mjs` | 57/58 (1 échec préexistant, confirmé identique en comparant à l'état non modifié via `git stash`, sans rapport avec cette mission) |

---

## 4 — Blockers restants (hors périmètre de cette mission, non touchés)

Repris tels quels de l'audit final : Studio légal/RGPD, partage public de documents
(`document_partage_public_par_jeton_v1.test.sql`), manifeste RGPD
(`gp_pilot_rgpd_manifeste_fichiers.test.sql`), `gp_pilot_plateforme_admin_role_total.test.sql`
(défaut de fixture, hors périmètre), Fresh/pgTAP jamais rejoués sur un vrai projet Supabase
hébergé, gate CI Stripe non confirmé avec un vrai secret, 5 `DECISION_REQUIRED` commerciales/produit
pour Julien. **Aucun de ces points n'est concerné par cette mission et aucun n'a été modifié.**

---

## 5 — Sortie

```
PREVIEW BLOCKER 1 CLOSED
PREVIEW BLOCKER 3 CLOSED
```

Ces deux fermetures **ne font pas** du train `PREVIEW READY` : les blockers du §4 restent ouverts,
et aucun déploiement Preview/Production réel n'a eu lieu ni n'a été tenté dans cette session
(aucun credential `SUPABASE_*`/`VERCEL_*`/`STRIPE_*` dans ce bac à sable).

```
VERDICT = RESERVES + NOTIFICATION BLOCKERS QUALIFIED
```
