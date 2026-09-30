# ELSATIA — Login Rate Limit NAT / Agency Hardening V1

> Date : 2026-09-30 · Branche : `claude/gracious-curie-135pix`
> Base : `origin/integration/elsatia-canonical-train-v7` @ `547f0b6f` (« CANONICAL TRAIN V7 LOCALLY QUALIFIED »).
> Aucun appel réseau vers Supabase, Vercel ou une base hébergée. Le SQL a été exécuté sur un PostgreSQL 16 local jetable.

## Verdict

**ELSATIA LOGIN RATE LIMIT LOCALLY QUALIFIED**

Une agence de 10, 25 ou 50 salariés derrière une même box se connecte sans blocage, même avec deux fautes de frappe par personne. La protection anti-bruteforce est **plus forte** qu'avant : 5 essais réels sur un compte depuis une IP (au lieu de 10), et un plafond par compte qui tient face à une attaque répartie sur plusieurs IP (l'ancien schéma n'en avait aucun).

Deux actions restent à faire avant la production (§12). Aucune ne remet en cause la qualification locale :
- appliquer la migration `20260930000101` ;
- vérifier le rate limit par IP de **Supabase Auth hébergé**. Il voit l'IP des fonctions Vercel, pas celle de l'agence.

---

## 1. Reproduction (avant correctif)

| Scénario | Ancien comportement (`auth:login`, 10 POST / 600 s, clé = IP) |
|---|---|
| 15 salariés, même IP, bons identifiants | 10 connectés, **5 bloqués en 429** (test `1. reproduction`) |
| 25 / 50 salariés, même IP | 15 / 40 bloqués |
| 1 utilisateur, 20 échecs, 1 IP | 10 essais réels, puis 429 |
| Attaquant sur 10 IP, 100 tentatives sur 1 compte | **100 essais réels** : aucune limite par compte |
| Attaquant IPv6 qui change d'adresse dans son /64 | Illimité (une adresse = un bucket) |

Le test `src/app/actions/auth-login-rate-limit.test.ts › 1. reproduction` rejoue l'ancienne politique. Il reste dans la suite comme témoin.

## 2. Inventaire de l'existant

| Élément | Constat |
|---|---|
| Point de contrôle | `src/lib/supabase/proxy.ts` (proxy Next 16) → `politiquesRateLimitPour("/login", "POST")` |
| Clé | **IP seule** (`x-forwarded-for` 1er maillon, sinon `x-real-ip`), HMAC SHA-256 |
| Ce qui est compté | **Chaque** POST /login, succès compris |
| Email / compte / appareil | Non utilisés |
| Stockage | `rate_limits_applicatifs` via la RPC `consommer_rate_limit` (fenêtres fixes, service_role seul), journal `journal_abus_securite` à `maximum + 1` |
| Connexion | Server Action `loginAction` → `supabase.auth.signInWithPassword` (appel **serveur**) |

## 3–4. Stratégie retenue

L'IP n'est plus la seule clé. On compte les **échecs d'identification** dans trois dimensions, chacune avec une fenêtre courte et une fenêtre longue (refroidissement progressif) :

| Budget (`cle`) | Dimension | Max | Fenêtre | Rôle |
|---|---|---|---|---|
| `auth:login:echec:compte-ip` | email + IP | 5 | 15 min | Bruteforce d'un compte depuis un poste. Le titulaire ailleurs et les collègues sur la même IP ne sont pas touchés. |
| `auth:login:echec:compte-ip:jour` | email + IP | 20 | 24 h | Attaquant patient qui attend la fin des fenêtres de 15 min |
| `auth:login:echec:compte` | email | 30 | 1 h | **Attaque distribuée multi-IP** sur un compte |
| `auth:login:echec:compte:jour` | email | 100 | 24 h | Botnet patient |
| `auth:login:echec:ip` | IP | 150 | 15 min | Credential stuffing / password spraying depuis une IP (≈ 3 fautes par salarié pour 50 salariés) |
| `auth:login:echec:ip:jour` | IP | 1 500 | 24 h | Pulvérisation soutenue |
| `auth:login:ip-flot` (proxy) | IP | 300 POST | 10 min | Plafond anti-flot brut, succès compris (remplace `auth:login` 10/600) |

Déroulé dans `loginAction` (`src/app/actions/auth.ts`) :
1. Lecture **sans consommer** des 6 budgets. La nouvelle RPC `consulter_rate_limit` les lit en parallèle.
2. Si un budget est épuisé : refus **avant** Supabase Auth, avec un message unique. La tentative refusée est comptée sur les budgets bloquants, ce qui trace l'événement une fois dans `journal_abus_securite`.
3. Sinon `signInWithPassword`. Seul un refus d'identifiants (`invalid_credentials`) consomme une unité des 6 budgets.

Code : `src/lib/security/login-rate-limit.ts`. Migration : `supabase/migrations/20260930000101_rate_limit_consultation_connexion_v1.sql`.

## 5. En-têtes proxy et usurpation

`adresseIpClient()` (`src/lib/security/rate-limit.ts`) remplace l'ancienne lecture naïve :

| Contexte | Source retenue | Pourquoi |
|---|---|---|
| Vercel (`VERCEL` défini) | `x-vercel-forwarded-for` → `x-real-ip` → 1er maillon `x-forwarded-for` | Vercel **écrase** ces en-têtes avec l'IP de la connexion. Une valeur envoyée par le client n'est pas conservée. |
| Hors Vercel | `x-real-ip` → **dernier** maillon `x-forwarded-for` | Les maillons de gauche viennent du client et sont falsifiables. Seul le dernier a été ajouté par notre proxy inverse. |
| Valeur non-IP (injection, texte aléatoire par requête) | Ignorée | Empêche de fabriquer un bucket neuf à chaque requête |
| IPv6 | Regroupée par **/64** | Un abonné dispose d'un /64 entier. Compter par adresse lui donnerait un budget illimité. |
| IPv4 mappée `::ffff:a.b.c.d` | Ramenée à l'IPv4 | Même client, même bucket |

Même si l'IP était usurpée, les budgets **compte** ne dépendent pas de l'IP et continuent de protéger le compte.

## 6. Login réussi

Un succès ne consomme **aucun** budget d'échec. Il ne compte que dans le plafond anti-flot (300 POST / 10 min / IP). Test : 50 salariés × 3 vagues de connexion = 150 connexions depuis une IP, aucun blocage. Aucune clé `:echec:` n'est créée.

## 7. Anti-énumération

- Les compteurs sont indexés par l'email **saisi** (normalisé : minuscules, sans espaces), que le compte existe ou non.
- Le blocage est décidé **avant** Supabase Auth et affiche le même message quels que soient le budget et le compte : « Trop de tentatives de connexion. Réessayez dans quelques minutes. »
- Pendant un blocage, un **bon** mot de passe est refusé comme un mauvais, et Supabase n'est pas appelé. Sans cela, le blocage deviendrait un oracle.
- Test : un compte existant et un email inconnu produisent exactement la même séquence de 12 réponses.
- Inchangé et hors périmètre : « Confirmez votre adresse email » n'apparaît qu'avec le bon mot de passe. Ce n'est pas une fuite exploitable sans identifiants.

## 8. Attaque distribuée

- 10 IP × 100 tentatives sur un compte : **≤ 30** essais réels (budget compte horaire). Vérifié en mémoire **et** sur PostgreSQL réel.
- Attaque patiente sur 24 h : **≤ 100** essais réels par jour calendaire.
- IPv6 dans un même /64 : 5 essais réels.
- **Limite connue et assumée** : pendant une attaque distribuée, le compte ciblé est suspendu jusqu'à 1 h, même pour son titulaire. Les autres comptes de l'agence ne sont pas touchés (test dédié). C'est le compromis classique « verrouillage de compte vs bruteforce ». Pour le réduire plus tard, on pourrait exempter les appareils déjà connus (cookie d'appareil de confiance) : c'est hors V1.

## 9. Matrice de tests (résultats)

| Scénario | Résultat |
|---|---|
| 10 / 15 / 25 / 50 salariés, même IP, bons identifiants | ✅ 100 % connectés |
| 10 / 25 / 50 salariés, 2 fautes chacun (100 échecs pour 50), puis bon mot de passe | ✅ 100 % connectés |
| 50 salariés × 3 vagues (150 connexions) | ✅ aucun blocage |
| Un poste de l'agence bruteforce un compte (40 essais) | ✅ les 50 collègues se connectent |
| 1 utilisateur, 20 échecs, 1 IP | ✅ 5 essais réels, 15 blocages ; 20 au plus par jour |
| 1 attaquant, 1 IP, 100 tentatives | ✅ 5 essais réels |
| 1 attaquant, 10 IP, 100 tentatives | ✅ ≤ 30 essais réels |
| Credential stuffing, 1 IP, 1 000 comptes | ✅ 150 essais réels / 15 min |
| Flot brut, 1 IP, 310 POST | ✅ 429 au proxy au-delà de 300 |
| Titulaire attaqué depuis une IP étrangère | ✅ se connecte depuis l'agence |
| Limiteur en panne / clé HMAC absente en production | ✅ refus propre (fail closed), Supabase non appelé |
| Casse et espaces dans l'email | ✅ même compteur |

## 10. Observabilité

- Journal structuré `console.warn` en JSON (collecté par Vercel / Sentry). Événements : `auth.login.bloque` (avec `politique` et `reessayerApres`), `auth.login.limiteur_indisponible`, `auth.login.echec_non_enregistre`.
- Les identités ne sont visibles que par un **préfixe de 12 caractères du HMAC** (`compte`, `ip`), ce qui suffit à corréler les événements. Jamais d'email, d'IP en clair, de mot de passe, de jeton ni de clé. Un test vérifie cette absence.
- En base : `journal_abus_securite` reçoit une ligne par budget franchi et par fenêtre. Vérifié sur PostgreSQL réel : une ligne `compte-ip` et une ligne `compte`.

## 11. Tests exécutés

| Commande | Résultat |
|---|---|
| `npx vitest run` (suite complète) | ✅ 193 fichiers, 2 436 tests passés (36 ignorés, préexistants) |
| `src/app/actions/auth-login-rate-limit.test.ts` (nouveau) | Matrice complète : chaque tentative passe par le proxy réel et `loginAction`. Seuls Supabase Auth (annuaire en mémoire) et la base des compteurs (double fidèle des RPC) sont simulés. |
| `src/lib/security/login-rate-limit.test.ts` (nouveau) | Budgets, lecture sans consommation, journal, fail closed, logs sans PII |
| `src/lib/security/rate-limit.test.ts` (étendu) | Politique `/login`, résolution IP Vercel / hors Vercel, anti-usurpation, IPv6 /64 |
| `src/app/actions/auth.test.ts` (adapté) | Comportement de routage post-connexion inchangé |
| **Intégration PostgreSQL 16 réel** (local, jetable) | Migrations `…000193` + `…000101` appliquées, ACL de `acl_reconciliation` reproduite. La lecture ne consomme pas, blocage au 5e échec, `reessayer_apres` borné, paramètres invalides → `22023`, `anon` / `authenticated` refusés (`insufficient_privilege`), `security definer` + `search_path` figé. Le module TS a été exécuté contre cette base via un adaptateur `psql` temporaire (50 salariés NAT, 1 IP × 20, 10 IP × 100) : ✅ 3/3. |
| `supabase/tests/rate_limit_consultation_connexion.test.sql` (nouveau, pgTAP) | Écrit pour la CI Supabase. pgTAP n'est pas installé localement, donc non exécuté ici. Son contenu est couvert par l'intégration ci-dessus. |
| `npx tsc --noEmit`, `eslint` (fichiers touchés) | ✅ |
| `npm run verify:migrations`, `test:migration-targets` | ✅ 360 migrations |
| `npm run sync:train-expectations` puis `verify:train-expectations` | ✅ attendus régénérés (360, dernière `20260930000101`) |
| `npm run verify:env-manifest` | ✅ (`RATE_LIMIT_HMAC_KEY` déjà déclarée) |
| Playwright | Non exécuté : il faudrait une pile Supabase complète. La matrice Vitest traverse déjà les deux couches réelles (proxy et Server Action). Les specs pilotes existantes vident `rate_limits_applicatifs` avant usage et restent compatibles. |

## 12. Risques résiduels et actions avant production

| # | Sujet | Action |
|---|---|---|
| R-1 | **Migration** `20260930000101_rate_limit_consultation_connexion_v1.sql` | À pousser **avant** le déploiement du code, sinon `consulter_rate_limit` n'existe pas. En ce cas le limiteur refuse la connexion (fail closed) : ce n'est pas une faille, mais c'est une panne de connexion. |
| R-2 | **Rate limit propre à Supabase Auth** (`sign_in_sign_ups`, 30 / 5 min / IP par défaut) | `signInWithPassword` est appelé **depuis le serveur**. GoTrue voit donc l'IP de sortie Vercel, pas celle de l'agence. Un pic de connexions pourrait y buter, indépendamment de ce correctif. L'erreur n'est pas comptée comme échec d'identifiants (pas de verrouillage), mais l'utilisateur voit un message générique. **Vérifier / relever** la limite dans le tableau de bord Supabase (Auth → Rate Limits). Piste V2 : l'en-tête `Sb-Forwarded-For` (activé par `GOTRUE_SECURITY_SB_FORWARDED_FOR_ENABLED`). Son activation et ses conditions de confiance sur l'hébergé sont à confirmer avant tout usage. |
| R-3 | Verrouillage d'un compte ciblé (≤ 1 h) pendant une attaque distribuée | Assumé (§8). V2 possible : appareil de confiance. |
| R-4 | Fenêtres fixes | À la frontière de deux fenêtres, un budget peut être consommé jusqu'à 2 fois (ex. 10 essais en quelques secondes autour de :15). Comportement hérité de `consommer_rate_limit`. Borné, et couvert par les fenêtres journalières. |
| R-5 | Tentatives concurrentes | Des essais strictement simultanés peuvent passer la lecture avant l'enregistrement de l'échec. Le dépassement est borné par la concurrence et par le plafond anti-flot du proxy. |
| R-6 | `src/lib/expenses/audit.ts` lit encore le 1er maillon `x-forwarded-for` | C'est un journal d'audit, pas un contrôle de sécurité. Correct sur Vercel. Hors périmètre, à aligner sur `adresseIpClient` plus tard. |

## Fichiers

- `src/lib/security/login-rate-limit.ts` (nouveau), budgets d'échecs, journal sans PII
- `src/lib/security/rate-limit.ts`, `adresseIpClient`, `normaliserIpRateLimit`, `secretRateLimit`, politique `/login` → anti-flot
- `src/app/actions/auth.ts`, `loginAction` branché sur le limiteur
- `supabase/migrations/20260930000101_rate_limit_consultation_connexion_v1.sql`, RPC `consulter_rate_limit`
- `supabase/tests/rate_limit_consultation_connexion.test.sql`, pgTAP
- Tests : `src/app/actions/auth-login-rate-limit.test.ts`, `src/lib/security/login-rate-limit.test.ts`, `src/lib/security/__test-support__/rate-limit-memoire.ts`, `rate-limit.test.ts`, `auth.test.ts`
- Attendus de train régénérés : `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql`, `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`, `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md`

**ELSATIA LOGIN RATE LIMIT LOCALLY QUALIFIED**
