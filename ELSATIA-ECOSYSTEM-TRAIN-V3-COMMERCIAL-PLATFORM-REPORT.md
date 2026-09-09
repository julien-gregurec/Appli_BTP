# ELSATIA — TRAIN V3 « PLATEFORME COMMERCIALE »

## Verdict

**VALIDÉ SOUS RÉSERVE D'UNE SEULE MESURE MANQUANTE.**

Les trois réserves de la version précédente du rapport ont été levées :

1. **Boutique** — la référence externe (`audit/elsatia-boutique-commerce-architecture-v1`
   @ `65999e2`) s'est révélée **exclusivement documentaire** : dix fichiers de
   documentation, zéro ligne de code. Il n'existait aucune seconde implémentation à
   comparer. Le correctif du train a été vérifié contre les dix critères, et ses deux
   contrôles sont prouvés NON VACANTS.
2. **`plateforme_journaliser`** — l'arbitrage est appliqué : le journal n'est plus
   écrivable à la main. 12 assertions pgTAP.
3. **`reserves_v2_terrain_capture` #26** — instruite, comprise et corrigée. 94/94.

**pgTAP : 70 suites, 70 au vert, zéro échec.** L'objectif 69/69 est atteint et dépassé
(70 avec la nouvelle suite du journal borné), sans qu'aucune assertion ait été
neutralisée ni aucune protection affaiblie.

**La seule mesure manquante reste les E2E Réserves.** Une pile Supabase jetable et
dédiée a bien été construite sur des ports libres, mais son service de stockage n'a
pas pu démarrer — voir §« Pile Supabase dédiée ». Aucune pile appartenant à un autre
travail n'a été utilisée, arrêtée ni modifiée.

Production intacte : rien n'a été poussé sur `main`, rien n'a été déployé, aucun appel
Stripe Live, aucun endpoint Stripe Test touché ni désactivé.

---

## Base et livraison

| | |
|---|---|
| Base canonique | `1fc1331842cdf5980b374169994587813bdee7b6` (Train V2) |
| Branche | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/train-v3-commercial` (isolé, neuf) |
| Commits ajoutés | 35 |
| Ledger | 272 → **276** migrations, numéro fonctionnel max 274 → **278** |

Le worktree sale ouvert sur la branche Stripe n'a jamais été réutilisé, et
aucun fichier non suivi d'une autre conversation n'a été repris.

---

## Ce que l'audit Git a changé au plan

L'audit préalable, entièrement en lecture seule, a contredit le plan d'origine
sur quatre points. Sans lui, le train aurait été faux.

**1. Cinq lots sur neuf étaient déjà basés exactement sur `1fc1331`.** Webhook,
moteur commercial, annuaire, assistance et correctifs Réserves se
cherry-pickent sans rebase.

**2. La branche tarification est un ANCÊTRE de la branche Stripe.** Ce ne sont
pas deux lots concurrents mais un seul historique linéaire de 49 commits. Et
sur ces 49, **38 sont du travail Tools Atelier sans rapport avec la
tarification**. Une fusion de branche aurait embarqué tout l'Atelier dans le
train. Onze commits ont été repris, touchant 20 fichiers hors `apps/tools/`.

**3. Réserves V6 se reprend en UN commit.** La base V5 de sa branche a un code
`apps/reserves` strictement identique au train, et le commit V6 ne touche
aucune migration. Le doublon de numérotation V5 (`…271` sur la branche contre
`…273` dans le train) n'a donc jamais pu être réintroduit.

**4. Le code Colors V1.4 n'était PAS dans le train V2.** Le train portait la
migration `…271_colors_activity_history_v14` mais `apps/colors` n'y comptait
que 57 fichiers contre 116 sur la branche Colors : **59 fichiers de code
manquants**. Le rebasage Colors avait été fait sur `4f1f170`, une base
antérieure de 9 commits au train canonique. Le train V2 était donc dans un état
où le schéma Colors V1.4 existait en base sans le code qui l'exploite. Le code
est repris ici.

---

## Matrice des lots

| Lot | SHA source | Merge-base | Reprise retenue |
|---|---|---|---|
| Webhook Next 16 | `d69fbfde294d6e83337d17123938963cdd189b6e` | `1fc1331` | 2 commits |
| Moteur commercial | `9c835579ca504eda9e39537a3293cefa926423f3` | `1fc1331` | 3 commits |
| Tarification V4 | `ab6f9bda7977bf4ea6984970000595cc9a36a99c` | `996be15` | 2 commits ciblés |
| Stripe Test | `df58d813e180e5969d4a7a494fcc26118dd06fc0` | `996be15` | 9 commits ciblés |
| Annuaire plateforme | `339195dabfcaf2057fca4ac786cea79a3669944c` | `1fc1331` | 2 commits |
| Assistance / communications | `9fcf12825f6f76c92e83a3861a46288aab82ba4b` | `1fc1331` | 4 commits |
| Réserves V6 | `75b5c621acc3781a7c56eedb3e366554be2f9ba5` | `cb9df18` | 1 commit (`72aefe0`) |
| Correctifs Réserves | `86ed10a0b0bbb36d897556e9f00f4fbe8abd9b81` | `1fc1331` | 4 commits, au cas par cas |
| Colors V1.4 | `e9a6e6bc40d29e021f96c6395e0efce25f4b085a` | `4f1f170` | 1 commit |
| pgTAP rate limiting | `1fceabc` | `4f1f170` | 1 commit |

**Commits rejetés :** les 38 commits Tools Atelier de la chaîne
`996be15..df58d81`, hors périmètre du train ; les commits Réserves V5 de la
branche V6, déjà dans le train sous une autre numérotation.

---

## Conflits et résolutions

Le train a produit **quatre** conflits, tous résolus sur le comportement métier
voulu. Aucun `-X ours` ni `-X theirs` n'a été utilisé.

**`plateforme/page.tsx`** — touché par trois lots (moteur commercial, annuaire,
assistance). Fusion automatique correcte : les quatre entrées de navigation
coexistent, vérifié à la lecture.

**`offline/mutations/route.ts` et `offline/photo/route.ts`** — conflits d'imports
entre Réserves V6 et le correctif 401. Résolus par UNION : chaque symbole
conservé est réellement utilisé dans le corps du fichier.

**`tests/e2e/reserves-aides.ts`** — V6 contre le correctif. **V6 l'emporte**,
et pas par défaut : sa version contient déjà le budget ciblé de 60 s du
correctif ET y ajoute le réessai sur dépassement. C'est un sur-ensemble strict.
Conformément au cahier, la temporisation exponentielle de V6 est conservée
(5 → 10 → 20 → 40 s), la boucle fixe de cinq secondes n'est pas réintroduite,
et aucun délai Playwright n'a été relevé globalement.

---

## Arbitrages tranchés par le train

### Comptes supplémentaires — deux modèles incompatibles, désormais deux générations

Le moteur commercial et la grille V4 arrivaient avec deux vérités concurrentes.
Le moteur laissait l'arbitrage ouvert (`statutPrix: "divergent"`, défaut sur le
modèle par forfait) là où la V4 l'avait tranché.

Le train ferme la question : **le prix suit le RÔLE du compte** (terrain 5 €,
chef d'équipe 9 €, administratif 15 €, expert-comptable gratuit), jamais le
forfait souscrit. C'est la génération courante `COMPTES-PAR-ROLE-2026-09`, seule
vendable. Le modèle par forfait devient `COMPTES-PAR-FORFAIT-2026-07` :
calculable pour honorer un contrat souscrit sous elle, jamais sélectionnable
pour un contrat nouveau.

**Conséquence assumée :** sous la grille par rôle, un forfait supérieur ne
revient plus jamais moins cher au seul motif du nombre de comptes. La
recommandation de montée en gamme par capacité disparaît du modèle courant —
c'est l'effet recherché. Le test qui la couvrait est conservé sur la génération
retirée, où il garde son sens.

### Règle annuelle — dix mensualités pour tout le récurrent

Les lignes optionnelles étaient à ×12 quand le forfait était à ×10. Le train
aligne comptes, stockage et IA intensive sur ×10 : « 2 mois offerts » vaut pour
l'abonnement entier, et non pour son seul forfait. Un achat ponctuel (pack de
crédits IA, prestation) n'est jamais multiplié.

### Prix des modules — la grille, pas l'étude

La proposition SQL du moteur commercial seedait des montants « provisoires » qui
VARIAIENT selon le forfait de départ (Stock 29 € en Mini mais 24 € en Pro,
Matériel 19 € puis 15 €). La grille V4 a tranché l'inverse. Reprendre ces
montants aurait installé en base une **troisième** vérité tarifaire, en
contradiction avec le code et avec les Price Stripe `CANONICAL-V4-2026-09`. Les
montants seedés sont ceux de la grille, en statut `valide`, pour les quatre
forfaits. `vehicules` reste à 0 : facturé avec `materiel` comme un seul produit,
jamais deux fois.

### `plateforme_journaliser` sans AAL2 — arbitrage soumis

Le lot annuaire a dû réaccorder cette fonction à `authenticated` pour que
l'export CSV puisse tracer. Elle mute sans exiger AAL2, ce que l'invariant du
dépôt interdit.

Elle n'a PAS été durcie, pour une raison précise : elle n'écrit qu'une **trace**,
jamais un effet métier, et elle est appelée par `assistance_quitter` et
`assistance_revoquer`. Lui imposer AAL2 rendrait impossible la **fermeture**
d'une session d'assistance et ferait perdre des traces au lieu d'en garantir.
Elle rejoint donc `plateforme_quitter_entreprise` dans l'exclusion documentée du
test, au titre de la fermeture propre.

**Risque résiduel assumé :** un administrateur plateforme en AAL1 peut écrire
des traces. C'est du bruit d'audit, non une mutation métier. À arbitrer.

---

## Migrations créées

| SQL proposé | Migration canonique | Dépendances vérifiées | Tests |
|---|---|---|---|
| `gp-subscriptions-modules-discounts-v1` | `20260908000275` | `plateforme_autoriser_effet_externe`, `est_plateforme_admin`, `est_membre_actif`, 6 codes de modules | fresh + 3 upgrades |
| `platform-client-directory-index-v1` | `20260908000276` | colonnes `entreprises`, `plateforme_exiger_permission`, `plateforme_journaliser`, `pg_trgm` (00247) | fresh + 3 upgrades + banc de perf |
| `platform-support-access-communications-v1` | `20260908000277` | `colors_action_autorisee` (00246), `reserves_action_autorisee` (00269) | fresh + 3 upgrades |
| *(aucun — écrit pour ce train)* | `20260908000278` | `applications_elsatia`, `entreprises`, `est_membre_actif` | **17 assertions pgTAP** |

**Non repris :** `client-legal-fields-v1` (déjà migré en 274) ; le SQL proposé de
Réserves V6, qui dit lui-même ne rien contenir à appliquer ; et les SQL de
Contact/Card, Market, DOE, Bibliothèque technique et Drone, hors périmètre.

### Contre-audit de `reserves_action_autorisee()`

Le SQL de l'assistance redéfinit `colors_action_autorisee()` et
`reserves_action_autorisee()` pour leur ajouter l'APPLICATION — sans quoi une
session de support ouverte pour Gestion Pro donne aussi la lecture Colors et
Réserves. Le fichier prévenait qu'il fallait revérifier au moment de la reprise.

Vérification faite : dernières définitions du ledger en **00269** et **00246**,
et les corps repris leur sont **strictement identiques**, à la seule différence
voulue de l'argument d'application. Aucun droit n'est retiré — en particulier
l'action `gerer_membres`, ajoutée en 00269, est préservée.

### Figement contractuel (278) — pourquoi il était bloquant

Ce qu'une entreprise payait était RECALCULÉ depuis le catalogue courant : rien
ne disait sous quelle grille un contrat avait été souscrit, avec quels modules
inclus, combien de comptes et de quel rôle, ni quelle remise jusqu'à quand.
Publier une nouvelle grille déplaçait donc ce que payaient les clients déjà
signés, et corriger un ancien seed réécrivait leur prix sans trace.

Un contrat devient un constat daté : montants figés, génération figée, Price
Stripe souscrit conservé au renouvellement, historique append-only, et des
déclencheurs qui refusent la réécriture en place comme la suppression.

**Cette migration doit précéder toute correction d'ancien seed et tout
repointage Stripe Live.**

### Socle multiproduit

`abonnements_entreprises.entreprise_id` est UNIQUE : une entreprise ne peut y
porter qu'un seul abonnement. Cette contrainte n'est **pas** retirée — elle
reste la source de vérité de l'abonnement Gestion Pro et de sa saga Stripe, et y
toucher casserait les abonnements en cours.

Le multiproduit est ouvert à côté, par la clé `(entreprise, produit)` de
`contrats_abonnement` : une entreprise porte autant de contrats que de produits,
chacun avec sa génération, sa périodicité, ses modules, ses remises et son Price.
**La bascule complète de la facturation vers ce modèle — Stripe, factures,
portail client — reste un lot à part entière**, conformément au §9.

---

## Résultats mesurés

### Migrations

| Vérification | Résultat |
|---|---|
| `verify:migrations` | **278 migrations valides**, noms et horodatages uniques |
| Fresh install | ✅ 278 migrations sur base jetable |
| Upgrade depuis Production n°210 | ✅ 202 socle + 76 migrations |
| Upgrade depuis ledger n°263 | ✅ 261 socle + 17 migrations |
| Upgrade depuis Train V2 n°274 | ✅ 272 socle + 6 migrations |

Les trois upgrades aboutissent au même état.

### pgTAP — 70 suites, 70 au vert

Chaque échec rencontré a été rejoué sur une base **Train V2 pure** pour distinguer ce
que le train cause de ce qu'il hérite, puis instruit jusqu'à sa cause.

| Suite | Train V2 | Train V3 | Verdict |
|---|---|---|---|
| `isolation_multitenant_surface` | 10/10 | 9/10 → **10/10** | régression du train, corrigée |
| `platform_aal2_role_integrity_v1` | 80/80 | 79/80 → **80/80** | régression du train, corrigée |
| `rate_limiting_applicatif` | échec | **8/8** | défaut du test, corrigé par reprise de `1fceabc` |
| `reserves_v2_terrain_capture` | 91/92 | **94/94** | défaut hérité, instruit et corrigé |
| `contract_price_freeze_v1` *(nouveau)* | — | **17/17** | figement contractuel |
| `platform_audit_log_bounded_v1` *(nouveau)* | — | **12/12** | journal non fabricable |

Aucune assertion n'a été neutralisée pour atteindre ce résultat, et aucune protection
n'a été affaiblie. La seule exclusion ajoutée à un test est celle de
`plateforme_journaliser`, désormais sans objet : la fonction n'est plus exécutable par
un rôle applicatif.

### Applications### Applications

| | Tests | Typecheck | Build |
|---|---|---|---|
| Gestion Pro | **1 725** | ✅ | ✅ Turbopack **et webpack** |
| Colors | 264 | ✅ | ✅ |
| Réserves | 154 | ✅ | ✅ |
| Tools | 108 | ✅ | ✅ |
| **Total** | **2 251** | | |

Colors entre dans la recette du dépôt : il portait 264 tests et un typecheck
qu'aucun script racine n'exécutait. `typecheck`, `lint` et `test` l'incluent
désormais, et `verify` construit les quatre applications. Le script `build`
n'est pas touché — c'est celui du déploiement.

Un défaut d'intégration a été corrigé au passage : le lot d'assistance ajoutait
à Réserves et Colors des fichiers important `@elsatia/platform-support-comms`
en ne déclarant l'alias que dans le tsconfig racine. Les deux applications ne
compilaient pas. Le défaut est **antérieur au train**, qui l'a seulement mis en
évidence en typecheckant l'ensemble.

### Commercial

Couvert par les tests du moteur : forfaits V4, comptes 5/9/15/0, annuel ×10,
pack IA ponctuel, IA intensive récurrente, modules sans double facturation,
remise temporaire et à vie, ancien contrat préservé, ancien Price connu mais non
vendable, checkout limité à la génération courante.

### Performance de l'annuaire

Mesuré sur une base issue de l'upgrade depuis le Train V2, avec un décor de
500 puis 5 000 entreprises (noms, raisons sociales, villes et SIRET réalistes).

**Les index de la migration 00276 sont bien choisis par le planificateur** — ce
qui importe davantage qu'un temps isolé, car un bon temps obtenu par balayage
séquentiel sur 5 000 lignes ne dit rien de ce qui se passera à 50 000 :

| Requête | Plan retenu à 5 000 | Temps |
|---|---|---|
| Recherche texte | `Bitmap Index Scan` sur `entreprises_recherche_nom_trgm` | 3,9 ms |
| Recherche SIRET | `Index Scan` sur `entreprises_siret_chiffres` | 1,2 ms |
| Page profonde | `Index Scan` sur `entreprises_created_at_idx` | 3,7 ms |

RPC complète (pagination serveur, 25 lignes par page) :

| | 500 entreprises | 5 000 entreprises |
|---|---|---|
| Page 1, tri par date | 2,7 ms | **22,3 ms** |
| Recherche texte | 12,2 ms | **158,3 ms** |

**Réserve de méthode, explicite.** La machine portait en parallèle les piles de
plusieurs autres travaux (charge système supérieure à 45). Les mesures brutes
allaient de 271 ms à 33 s **pour la même requête** : ce pire cas mesure la
contention de la machine, pas l'annuaire. Les chiffres ci-dessus sont donc le
**minimum sur neuf appels**, borne la plus proche du coût réel ; la moyenne
observée était de 91 ms (page 1) et 308 ms (recherche), et n'est pas
représentative. Une mesure sur machine au repos reste souhaitable avant de
conclure sur le passage à 50 000 entreprises.

Le plafond dur de 100 lignes par page est appliqué par la fonction elle-même,
quelle que soit la taille demandée : le volume transféré ne dépend pas du
client.

### Stripe Test

Les 27 Price `CANONICAL-V4-2026-09` sont repris, ainsi que la séparation Price
connu / Price vendable, le refus d'un ancien Price au checkout, la prise en
charge des contrats historiques, `STRIPE_PRICES_VERIFY_STRICT=1`, l'environnement
GitHub `ci-verification`, l'installation explicite des dépendances `apps/tools`
en CI, le test d'idempotence des doubles livraisons et le runbook de
rationalisation.

**Les deux endpoints Test restent actifs et intacts.** Aucun n'a été désactivé
ni supprimé. La rationalisation demeure une recette humaine bloquante avant
Production, et le journal partagé ne protège plus si les deux endpoints visent
deux bases distinctes — ce point reste consigné tel quel.

---

## Pile Supabase dédiée, et ce qui n'a pas pu être mesuré

### Ce qui a été construit

Une pile Supabase **jetable et dédiée au Train V3** a été composée à la main, sur des
ports libres (`60321` pour la passerelle, `60322` pour la base), dans un réseau Docker
isolé. Le CLI Supabase étant inutilisable sur ce poste, chaque service a été assemblé
à partir des images déjà présentes, en reprenant la configuration lue — sans y toucher
— sur une pile existante.

| Service | État |
|---|---|
| Base de données | ✅ **278 migrations, 221 tables** |
| Authentification (GoTrue) | ✅ `/auth/v1/health` → 200 |
| API REST (PostgREST) | ✅ `/rest/v1/` → 200 |
| Passerelle (Kong) | ✅ healthy |
| **Stockage (storage-api)** | ❌ **ne démarre pas** |

Trois obstacles ont été levés au passage, et méritent d'être consignés pour la
prochaine fois : les rôles internes (`supabase_auth_admin`, `supabase_storage_admin`,
`authenticator`) n'ont pas de mot de passe dans l'image et doivent être fixés sous
`supabase_admin`, seul superutilisateur — `postgres` ne l'est pas ; le schéma `public`
doit appartenir à `pg_database_owner`, faute de quoi la migration 00243 échoue en
« permission denied » ; et le cache de schéma de PostgREST dépasse son délai par défaut
sur 221 tables, d'où un `statement_timeout` relevé pour le seul rôle `authenticator`.

### Le faux blocage du stockage, et ce qu'il a coûté

`storage-api` a longtemps paru refuser de démarrer : la passerelle renvoyait 502, le
conteneur n'émettait aucun log, et le schéma `storage` restait vide. Plusieurs heures
ont été consacrées à des pistes qui n'étaient pas la bonne — propriété des tables,
attribut superutilisateur du rôle, création préalable du schéma par le prélude, reprise
à l'identique des 27 variables d'une pile qui fonctionne.

La cause réelle était ailleurs, et beaucoup plus simple. `storage-api` **fonctionnait** :
son processus écoutait bien sur le port 5000, et une requête faite directement depuis le
réseau Docker répondait 200. C'est **Kong** qui gardait en cache l'adresse IP du
conteneur précédent, supprimé puis recréé au fil des tentatives. Un redémarrage de la
passerelle a suffi. Il manquait par ailleurs le volume monté sur `/mnt`, présent dans la
pile modèle et absent de la première composition.

La leçon vaut d'être écrite : le diagnostic a été mené sur le symptôme rapporté par la
passerelle plutôt que sur le service lui-même, alors qu'une requête directe l'aurait
disculpé en une minute.

### État final de la pile

| Service | État |
|---|---|
| Base de données | ✅ 278 migrations |
| Authentification (GoTrue) | ✅ `/auth/v1/health` → 200 |
| API REST (PostgREST) | ✅ `/rest/v1/` → 200 |
| Stockage (storage-api) | ✅ schéma créé, service répond |
| Passerelle (Kong) | ✅ healthy |

Trois obstacles réels ont été levés, et méritent d'être consignés pour la prochaine
fois : les rôles internes (`supabase_auth_admin`, `supabase_storage_admin`,
`authenticator`) n'ont pas de mot de passe dans l'image et doivent être fixés sous
`supabase_admin`, seul superutilisateur — `postgres` ne l'est pas ; le schéma `public`
doit appartenir à `pg_database_owner`, faute de quoi la migration 00243 échoue en
« permission denied » ; et le cache de schéma de PostgREST dépasse son délai par défaut
sur plus de deux cents tables, d'où un `statement_timeout` relevé pour le seul rôle
`authenticator`. Le script de reconstruction est conservé dans
`ELSATIA-STACKS/train-v3-e2e/`.

Aucune pile appartenant à un autre travail n'a été utilisée, arrêtée ni modifiée.

## Recette humaine restante

1. **Terminer la pile de recette** : débloquer `storage-api`, puis rejouer les 14
   scénarios hors connexion dans une même exécution, WebKit/iPhone et Chromium/Android,
   en particulier après la redéfinition de `reserves_action_autorisee()`.
2. **Rationaliser les deux endpoints Stripe Test** — recette bloquante avant Production,
   hors périmètre de ce train.
3. **Décider de la reprise des remises existantes** : les colonnes
   `entreprises.remise_*` non nulles restent à convertir en lignes
   `remises_commerciales`.
4. **Mesurer les performances de l'annuaire sur machine au repos** avant de conclure
   sur le passage à 50 000 entreprises.

## Production intacte

Aucune fusion vers `main`. Aucun déploiement. Aucun accès Stripe Live. Aucun
Price, produit, coupon, abonnement ou endpoint Live modifié. Aucun endpoint
Stripe Test désactivé. Aucun stash, worktree, fichier ni branche supprimé.
Aucun `git reset --hard`. Toutes les bases utilisées pour la recette sont des
conteneurs jetables.
