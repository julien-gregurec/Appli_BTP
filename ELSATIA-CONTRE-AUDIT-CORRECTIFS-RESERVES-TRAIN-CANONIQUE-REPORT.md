# CONTRE-AUDIT — EXTRACTION DES CORRECTIFS RÉSERVES VERS LE TRAIN CANONIQUE

## Verdict

**VALIDÉ.**

Les quatre correctifs sont **absents du train canonique**. Ils ont été repris
sélectivement — code applicatif et tests uniquement — sur une branche dédiée issue de
`1fc1331`, **sans aucune migration** et sans aucun rapport ou artefact ancien. Les
**14 scénarios hors-ligne passent dans une même exécution**.

La cause réelle de l'instabilité attribuée jusqu'ici à la charge machine a été trouvée :
ce n'était pas la contention, mais un **compte du décor inutilisable** (§5). Une fois
corrigé, les 14 scénarios passent à charge moyenne **60**.

---

## 1. Branche et SHA

| | |
|---|---|
| Branche dédiée | `fix/reserves-offline-resilience-train-v2` |
| Base | `1fc1331842cdf5980b374169994587813bdee7b6` (train canonique) |
| SHA final complet poussé | voir §9 |

**Aucune fusion, aucun déploiement, aucune modification de Production.**
La branche isolée `50c50ff…` n'a **jamais** été fusionnée : seuls des correctifs ciblés
en ont été extraits.

---

## 2. Tableau de comparaison

| Correctif | Train canonique `1fc1331` | Réserves V6 `75b5c62` | Branche isolée `50c50ff` |
|---|---|---|---|
| **1 — 401 d'un service expiré lu comme session expirée** | **ABSENT** | **ABSENT** | PRÉSENT |
| **2 — reprise après coupure exigeant un clic** | ABSENT | **SUPERSÉDÉ** (mieux) | PRÉSENT |
| **3 — coquille ne relançant jamais après un échec** | ABSENT | **SUPERSÉDÉ** (mieux) | PRÉSENT |
| **4 — fixture `request` affectée par `setOffline`** | ABSENT | **PARTIEL** | PRÉSENT |

Les fichiers cibles existent dans les trois références (le code V5 y est) : l'absence
porte sur les correctifs, pas sur les fichiers.

### Ce que V6 apporte, et pourquoi cela change la suite

**V6 traite déjà — et mieux — les correctifs 2 et 3.** Son module
`apps/reserves/src/lib/offline/reprise.ts` critique explicitement la reprise toutes les
cinq secondes que j'avais introduite, et lui substitue une **temporisation exponentielle
plafonnée avec bruit**, un arrêt franc quand il n'y a plus rien à tenter, et une remise en
file bornée des échecs. Son diagnostic est juste : ma boucle interrogeait le réseau toutes
les cinq secondes sur un téléphone sans couverture — exactement ce qui vide une batterie
en fin de journée — et tournait à vide sur les mutations en `echec`, jamais éligibles à
l'envoi.

**Conséquence opérationnelle, à retenir pour l'intégration de V6 :** au moment où V6
rejoindra le train, **la version V6 doit l'emporter** sur les correctifs 2 et 3 repris ici.
Il ne faut pas fusionner les deux approches — ce serait cumuler deux boucles de reprise.
Les correctifs 1 et 4, eux, restent nécessaires : V6 ne les porte pas.

**Correctif 4, partiel dans V6** : V6 ajoute bien le budget de 60 s et la reprise sur
délai dépassé dans `tests/e2e/reserves-aides.ts`, mais **pas** `contexteAutreAppareil` —
le contexte d'API indépendant sans lequel les actions d'un « autre appareil » pendant une
coupure ne testent que l'émulation Playwright.

---

## 3. Détail des quatre correctifs

Tous proviennent d'un commit unique de la branche isolée :
`0fda7d23e2105fef9fba19ce69cec1c6c1682100`.

### Correctif 1 — un service d'authentification injoignable n'est pas une session expirée

- **Fichiers** : `apps/reserves/src/lib/offline/identite.ts`,
  `app/api/offline/mutations/route.ts`, `app/api/offline/photo/route.ts`,
  `lib/offline/synchronisation.ts`
- **Avant** : `identiteCourante()` rendait `IdentiteSession | null`. Toute défaillance —
  y compris un 500/504 de GoTrue — donnait `null`, les routes répondaient **401**, et la
  file affichait « Session expirée : reconnectez-vous pour envoyer » à un utilisateur dont
  la session était parfaitement valide. Il se reconnectait pour rien, et sa file restait
  en échec alors qu'un simple réessai suffisait.
- **Après** : `resoudreIdentite()` rend trois issues — `ok`, `anonyme`, `indisponible`.
  Les routes répondent **503** sur indisponibilité ; le client la classe en `reseau`,
  donc transitoire, avec le message « Serveur momentanément indisponible ».
- **Non-régression** : `reserves-v5-offline.spec.ts` §6 « une file rejouée plusieurs fois
  ne duplique rien » tolère explicitement le 503 et le rejoue — il échouerait si un 401
  était rendu à sa place.
- **Dépendances** : aucune. Autonome.
- **Compatibilité migration 273** : totale — aucun objet SQL touché.
- **Cherry-pick isolé** : oui, appliqué sans conflit.

### Correctif 2 — une coupure réseau ne doit pas exiger un geste humain

- **Fichiers** : `lib/offline/contrat.ts`, `lib/offline/synchronisation.ts`
- **Avant** : toute panne plaçait la mutation en `echec`, état que la file ne renvoie
  jamais d'elle-même — seul un clic « Réessayer » la débloquait. Une coupure de trente
  secondes immobilisait donc une saisie de terrain.
- **Après** : `etatApresReponse(reponse, tentatives)` renvoie une panne `reseau` en
  `en_attente` tant que le plafond de tentatives n'est pas atteint ; un **refus métier**
  reste en `echec` et attend une décision. La machine à états gagne la transition
  `en_cours → en_attente`.
- **Non-régression** : `contrat.test.ts` — « remet en file une coupure réseau, qui se
  répare toute seule », « cesse d'insister au plafond de tentatives », « laisse un refus
  métier en échec », « laisse un envoi interrompu retourner en file ».
- **Dépendances** : aucune.
- **Compatibilité 273** : totale.
- **Cherry-pick isolé** : oui. ⚠️ **Sera supersédé par V6** (§2).

### Correctif 3 — la coquille applicative ne relançait jamais après un premier échec

- **Fichier** : `components/offline/AtelierOffline.tsx`
- **Avant** : synchronisation au montage et à l'événement `online` seulement. Si la
  première tentative échouait, plus rien ne la relançait tant que l'utilisateur restait
  sur la page : sa saisie restait « en attente » sous ses yeux, réseau revenu.
- **Après** : reprise périodique tant qu'il reste du travail non transmis.
- **Non-régression** : `reserves-v5-offline.spec.ts` §14 « le bandeau annonce le travail
  non transmis, y compris en ligne » — il exige la disparition du bandeau *après* vidage
  réel de la file, ce qui n'arrive pas sans reprise.
- **Dépendances** : aucune.
- **Compatibilité 273** : totale.
- **Cherry-pick isolé** : oui. ⚠️ **Sera supersédé par V6** (§2).

### Correctif 4 — la fixture `request` de Playwright subit `setOffline`

- **Fichiers** : `tests/e2e/reserves-aides.ts`, `tests/e2e/reserves-v5-offline.spec.ts`
- **Avant** : les vérifications serveur faites *pendant* une coupure simulée ne testaient
  que l'émulation réseau, pas l'application — la fixture `request` est soumise au
  `setOffline` du contexte. Le constat « rien n'est encore parti » était donc vide de sens.
- **Après** : le constat d'absence est fait **avant** la coupure ; la preuve que rien n'est
  parti est **locale** (la file affiche la saisie comme non transmise) ; et les actions
  d'un **autre appareil** passent par `contexteAutreAppareil()`, un contexte d'API
  indépendant de l'émulation.
- **Non-régression** : §3 « une réserve saisie hors ligne arrive en base au retour du
  réseau » et §8 « une levée validée pendant la coupure n'est JAMAIS écrasée par la file ».
- **Dépendances** : `contexteAutreAppareil` doit être exporté par `reserves-aides.ts`
  (inclus dans la reprise).
- **Compatibilité 273** : sans objet (tests).
- **Cherry-pick isolé** : oui.

---

## 4. Commits repris et rejetés

| Commit | Décision |
|---|---|
| `0fda7d23e2105fef9fba19ce69cec1c6c1682100` | **repris**, partiellement (voir ci-dessous) |
| `80093c2` — rapport d'intégration train V2 | **rejeté** (artefact) |
| `50c50ff` — consigne du SHA final | **rejeté** (artefact) |

**Repris de `0fda7d2` : 9 fichiers sur 10.**

| Fichier | |
|---|---|
| `apps/reserves/src/lib/offline/identite.ts` | ✅ |
| `apps/reserves/src/lib/offline/contrat.ts` | ✅ |
| `apps/reserves/src/lib/offline/contrat.test.ts` | ✅ |
| `apps/reserves/src/lib/offline/synchronisation.ts` | ✅ |
| `apps/reserves/src/app/api/offline/mutations/route.ts` | ✅ |
| `apps/reserves/src/app/api/offline/photo/route.ts` | ✅ |
| `apps/reserves/src/components/offline/AtelierOffline.tsx` | ✅ |
| `tests/e2e/reserves-aides.ts` | ✅ |
| `tests/e2e/reserves-v5-offline.spec.ts` | ✅ |
| `playwright.config.ts` | ❌ **écarté** |

**Pourquoi `playwright.config.ts` est écarté.** Il portait un relèvement **global** des
budgets (`actionTimeout` 15 → 30 s, `navigationTimeout` 30 → 60 s). C'est précisément la
forme contre laquelle le cadrage met en garde : augmenter tous les délais masque la
contention au lieu de la mesurer. La configuration reste donc à ses valeurs d'origine. Ne
sont conservés que des budgets **ciblés, par opération** : 60 s sur l'authentification et
sur les appels qui **écrivent** en base, justifiés par mesure — et, comme la suite l'a
montré, ils n'étaient pas la vraie cause (§5).

---

## 5. La vraie cause de l'instabilité — un compte de décor inutilisable

Le contre-audit a mis au jour un défaut **déterministe**, jusqu'ici attribué à tort à la
charge machine.

`prepare-local-recipe.sql` normalise les colonnes de jetons d'`auth.users`, que GoTrue ne
sait pas lire à NULL. Or `prepare-reserves-v3-recipe.sql` crée le gérant de l'entreprise
extérieure **après** cette normalisation. Son compte conservait donc des jetons NULL, et
toute connexion renvoyait :

```
500 — error finding user: sql: Scan error on column index 3,
      name "confirmation_token": converting NULL to string is unsupported
```

Constaté en base : **`gerant-b@invalid.local` était le seul compte à jetons NULL**, tous
les autres `@invalid.local` étant normalisés.

L'instabilité n'était intermittente qu'en apparence : elle frappait **systématiquement**
l'entreprise invitée, donc uniquement les scénarios qui la font agir — conflit de levée,
cloisonnement des identités, parcours mobile. D'où l'illusion d'un poste saturé, alors
qu'un compte du décor était simplement inutilisable.

**Correction** (`414d8c4`) : la normalisation Auth est rejouée après la création du décor
V3. Le script étant idempotent, elle couvre tout compte créé par une étape ultérieure.
Vérifié : **0 compte à jeton NULL**.

---

## 6. Preuve qu'aucune migration n'a changé

**Empreinte du blob de la migration 273**, identique dans les deux références :

```
train canonique 1fc1331 : 3d6d62cf2e449777286a304430da7294e3f07072
branche isolée  50c50ff : 3d6d62cf2e449777286a304430da7294e3f07072
```

→ **identiques octet pour octet.** Le SQL de la 273 de la branche isolée est strictement
celui du train canonique. Aucune reprise, aucune renumérotation.

**Sur la branche dédiée** : `git diff 1fc1331 HEAD -- supabase/migrations` ne rend
**aucune ligne**. Le ledger reste à **272 fichiers**, numéro fonctionnel maximal **274**.

Pour mémoire, l'état des trois références :

| Référence | Migrations | Dernière |
|---|---|---|
| Train canonique `1fc1331` | 272 | `20260908000274_client_legal_fields_v1` |
| Branche isolée `50c50ff` | 271 | `20260908000273_reserves_v5_offline_idempotence_v1` |
| Réserves V6 `75b5c62` | 269 | `20260907000271_reserves_v5_offline_idempotence_v1` (candidate d'origine, non renumérotée) |

---

## 7. Résultat exact des 14 scénarios

**Exécution de référence — 14/14 dans une même exécution**, charge moyenne **60**,
base au ledger canonique (272 migrations, max `20260908000274`).

| # | Scénario | Résultat |
|---|---|---|
| 1 | s'ouvre et se consulte SANS réseau | ✅ 49,1 s |
| 2 | rechargement hors ligne : ni cache ni file perdus | ✅ 2,6 s |
| 3 | réserve saisie hors ligne arrive en base au retour | ✅ 58,3 s |
| 4 | commentaire et demande de levée transmis | ✅ 25,2 s |
| 5 | photo conservée puis déposée, sans doublon | ✅ 5,3 s |
| 6 | file rejouée plusieurs fois : aucune duplication | ✅ 57,6 s |
| 7 | mutation interrompue repart au démarrage suivant | ✅ 18,5 s |
| 8 | levée validée pendant la coupure : jamais écrasée | ✅ 48,5 s |
| 9 | file d'A jamais envoyée sous l'identité de B | ✅ 8,5 s |
| 10 | après déconnexion, rien de l'organisation précédente | ✅ 11,5 s |
| 11 | deux identités, deux bases locales | ✅ 4,6 s |
| 12 | @responsive socle hors-ligne sur le moteur du terrain | ✅ 37,9 s |
| 13 | @responsive saisie sans réseau conservée puis transmise | ✅ 21,8 s |
| 14 | bandeau annonce le travail non transmis | ✅ 3,9 s |

**Mobile** : 4/4 sur WebKit/iPhone et Chromium/Android (les deux scénarios `@responsive`).

**Exécution de confirmation, rapportée telle quelle** : 6 réussis, **1 échec
d'infrastructure** — `57014 : canceling statement due to statement timeout`, le plafond
Postgres de 8 s dépassé sur une lecture qui prend habituellement quelques millisecondes,
à charge ~50. **Aucun scénario n'a échoué sur son objet** ; les scénarios suivants n'ont
pas été exécutés, `mode: "serial"` interrompant la suite.

Distinction demandée :
- **échecs réels de scénario** : **0** ;
- **échecs d'infrastructure** : 1 sur la seconde exécution (plafond `statement_timeout`
  de Postgres, sous une charge machine de 50 due à sept piles Supabase concurrentes).

Aucun délai n'a été relevé pour obtenir ce résultat : le relèvement global a au contraire
été **écarté** (§4), et la correction qui a rendu la suite stable est un défaut de décor
(§5), pas un assouplissement.

---

## 8. Autres vérifications

| | |
|---|---|
| Typecheck Réserves | **PASS** |
| Lint Réserves | **PASS**, 0 erreur 0 avertissement |
| Unitaires Réserves | **109 tests — PASS** |
| Build Réserves | **PASS** (98 s) |
| Installation du ledger canonique | **PASS** — 272 migrations, max `20260908000274` |
| Migrations modifiées | **aucune** |

---

## 9. Livraison

| | |
|---|---|
| Branche dédiée | `fix/reserves-offline-resilience-train-v2` |
| Base | `1fc1331842cdf5980b374169994587813bdee7b6` |
| Commits | `52e8ac2` (correctifs 1-4), `414d8c4` (décor Auth) |
| SHA du contenu (code + décor + rapport) | `ec5ab22906b6fc31a8111ff7606d34bd91d8a304` |
| SHA final complet poussé | tête de `origin/fix/reserves-offline-resilience-train-v2`, relevée par `git rev-parse` |

**À l'intégration de V6, rappel du §2 :** les correctifs **1 et 4** restent nécessaires ;
les correctifs **2 et 3** doivent céder la place à `reprise.ts` de V6, sans fusion des
deux approches.

**Aucune fusion. Aucun déploiement. Aucune modification de Production.**
