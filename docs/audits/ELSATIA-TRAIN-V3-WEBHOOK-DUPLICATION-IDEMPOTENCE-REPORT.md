# ELSATIA — TRAIN V3 · DUPLICATION WEBHOOK ET IDEMPOTENCE

**Suite de :** `ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-V1` @ `9261214917438dbefb67b5311e512dd5a0f0180d`
**Date :** 2026-09-08
**Environnement :** Stripe **Test** uniquement. **Aucun endpoint touché**, aucun déploiement, aucune migration.

---

## 1. Verdict

La duplication des endpoints webhook est documentée comme **blocage de mise en
Production**, et la protection d'idempotence est **démontrée** : deux livraisons
du même évènement — successives ou concurrentes — ne produisent qu'**un seul
traitement**.

La procédure de rationalisation est **préparée et non exécutée**, dans
`docs/runbooks/ELSATIA_STRIPE_WEBHOOK_ENDPOINTS_RATIONALISATION_V1.md`.

**Aucun endpoint n'a été supprimé ni désactivé** : la consigne l'interdisait sans
preuve du secret actif, et cette preuve reste impossible par API.

---

## 2. Acquis conservés — vérifiés

| Acquis | État mesuré |
|---|---|
| Secret GitHub **uniquement** dans `ci-verification` | ✅ `ci-verification` : `STRIPE_TEST_SECRET_KEY` · niveau dépôt : **vide** |
| Job CI déclaré sur cet environnement | ✅ `ci.yml:23` — `environment: ci-verification` |
| `STRIPE_PRICES_VERIFY_STRICT=1` | ✅ `ci.yml:29` |
| Installation `apps/tools` avant le typecheck | ✅ `ci.yml:52` — `npm ci --prefix apps/tools` |
| Trois coupons V2 marqués `[RETIRE]` | ✅ les trois, `elsatia_statut=retire`, `times_redeemed=0` |
| Deux codes promotionnels inactifs | ✅ `PROMOV1PRO50` et `PROMOV1MINI10`, `actif=false`, non réactivés |

Aucune régression : rien n'a été modifié sur ces six points.

---

## 3. La duplication, et pourquoi elle bloque la Production

Deux endpoints **Test** livrent les mêmes huit évènements vers la **même route** :

| | A — domaine stable | B — préversion |
|---|---|---|
| Identifiant | `we_1U9STn0bT5C0WG2avd2YaXMj` | `we_1Tziay0bT5C0WG2a4Ib2ncwB` |
| URL | `https://app.elsatia.fr/api/stripe/abonnement/webhook` | `https://elsatia-preview-…vercel.app/…` |
| Statut | `enabled` | `enabled` |

**Un fait structurant, découvert en analysant le cas** : chaque endpoint porte
**son propre secret de signature**. A et B sont deux **déploiements distincts**,
chacun configuré avec le sien. Une livraison destinée à B n'est donc pas
vérifiable par A — elle serait refusée en `400`. La duplication ne se matérialise
pas *dans un déploiement*, mais **entre deux déploiements**.

D'où la formulation exacte du blocage, en trois degrés :

1. **Deux déploiements partageant la même base** : le journal d'idempotence
   dédoublonne. C'est le cas aujourd'hui, et c'est une protection, pas une
   architecture.
2. **Deux déploiements visant deux bases** : chaque évènement est traité **deux
   fois, dans deux états**. Le journal ne peut rien — il n'est pas partagé.
   **C'est le scénario qui deviendrait grave en Live**, et rien dans le code ne
   l'empêche.
3. **Diagnostic ambigu** : toute livraison en échec doit être attribuée au bon
   endpoint avant d'être interprétée.

L'endpoint A est décrit *« ELSATIA Production — Billing webhook (Test mode switch
V1) »* et vise le domaine **stable**. La bascule en Live reproduirait cette
topologie sur des évènements de facturation réels. **La duplication doit être
résolue avant l'ouverture commerciale.**

---

## 4. Protection d'idempotence — démontrée

### Ce qui existait

`public.abonnement_evenements`, clé **`stripe_event_id text not null unique`**,
réservée par `reserver_evenement_abonnement_service` : un `insert` nu qui capture
`unique_violation` et renvoie `duplicate`. La déduplication est donc **atomique
en base**, pas applicative — sous concurrence, la seconde transaction attend puis
échoue proprement.

Ce qui la rend efficace **entre deux endpoints** : Stripe envoie le **même**
identifiant `evt_` aux deux. Le journal ne connaît que cet identifiant, jamais
l'expéditeur.

### Ce qui manquait, et qui est ajouté

Aucun test ne démontrait qu'une **double livraison** ne produit pas deux
traitements. Le seul test existant vérifiait qu'un doublon ne prend pas de
verrou, à partir d'un drapeau `duplicate: true` **codé en dur** — ce qui ne
distingue pas la première livraison de la seconde et ne prouve donc rien de la
séquence.

`src/app/api/stripe/abonnement/webhook/double-livraison.test.ts` — **7 tests**,
où le journal est modélisé comme un **état réel** (un ensemble d'identifiants
déjà vus, une réservation qui échoue sur doublon comme le fait la contrainte
`unique`).

| Démonstration | Résultat |
|---|---|
| Deux livraisons **successives** du même évènement | **1 seul traitement**, second appel `duplicate: true` |
| Deux livraisons **concurrentes** (`Promise.all`) | **1 seul traitement**, exactement un `duplicate` |
| La seconde livraison ne prend **aucun verrou** et **ne relit pas** Stripe | ✅ |
| La déduplication porte sur l'`evt_` id, **pas sur l'expéditeur** | ✅ une seule réservation |
| **Contre-épreuve** : deux évènements distincts | **2 traitements** — la protection n'avale rien de légitime |
| Livraison signée par l'**autre** endpoint | `400`, **rien journalisé**, la livraison légitime reste traitable ensuite |
| Échec du traitement | réservation **libérée**, évènement rejouable, **un seul** traitement au rejeu |

Ce dernier point compte autant que les autres : sans lui, un incident transitoire
perdrait silencieusement l'évènement, et « pas de double traitement » serait
obtenu au prix d'un traitement manquant.

**856 tests au total (95 fichiers), contre 849. `tsc` propre.**

---

## 5. Procédure de rationalisation — préparée, non exécutée

`docs/runbooks/ELSATIA_STRIPE_WEBHOOK_ENDPOINTS_RATIONALISATION_V1.md`.

Cinq étapes, dans un ordre impératif :

1. **Vérifier les livraisons du domaine stable** — succès récents, aucune `400`
   inexpliquée. Sans cela : **arrêt**.
2. **Confirmer le secret de l'endpoint conservé** — par le tableau de bord, seule
   source possible, en comparant les **empreintes** et jamais les valeurs. Si
   c'est le candidat périmé qui correspond, les rôles sont inversés : corriger
   `.env.local` **avant** toute désactivation. Si rien ne correspond : **arrêt**.
3. **Évènement Test contrôlé** sur une entreprise de recette : une seule ligne
   dans `abonnement_evenements`, un seul traitement, `200` côté A.
4. **Désactiver l'endpoint de préversion** — `disabled`, **jamais** supprimé : un
   endpoint supprimé perd son secret et son historique de livraisons.
5. **Vérification après coup** + retour arrière en un clic.

> **Pourquoi l'étape 2 ne peut pas être automatisée.** L'API Stripe ne renvoie le
> champ `secret` d'un `webhook_endpoint` **qu'au moment de sa création**. Aucune
> lecture ultérieure ne l'expose. La correspondance secret ↔ endpoint est donc
> **hors d'atteinte par API** : elle exige le tableau de bord. C'est la raison
> pour laquelle aucun endpoint n'a été désactivé dans ce lot.

---

## 6. Stripe Live et Production : intacts

- **Aucune mutation Stripe dans ce lot**, ni Test ni Live. Les seuls appels
  Stripe ont été des lectures de contrôle (`balance`, `coupons`,
  `promotion_codes`).
- `balance.livemode = false` revérifié.
- Aucun endpoint créé, modifié, désactivé ou supprimé.
- Aucun secret de webhook supprimé ni remplacé ; le candidat périmé reste
  conservé, commenté et étiqueté dans `.env.local`, hors Git.
- Aucune migration SQL — le journal d'idempotence exploité existait déjà
  (`20260718000100`, `20260904000262`).
- Aucune fusion, aucun déploiement.

---

## 7. Réserves

1. **La duplication n'est pas résolue**, seulement documentée et rendue
   inoffensive dans le cas « base partagée ». Le runbook attend une exécution
   manuelle.
2. **Le cas « deux bases distinctes » reste non couvert par le code.** Aucune
   protection n'existe à ce niveau ; seule la rationalisation le supprime.
3. **La correspondance secret ↔ endpoint reste inconnue**, donc l'étape 2 du
   runbook est un préalable strict.
4. **Le second secret de webhook n'est toujours pas arbitré.**
5. La démonstration d'idempotence s'appuie sur un journal **modélisé**. Elle
   prouve le comportement de la route et la clé de déduplication ; elle ne
   remplace pas la contrainte `unique` réelle, qui, elle, est déjà en base et
   vérifiée par lecture de la migration.

---

## 8. Traçabilité

| | |
|---|---|
| **Branche** | `feat/stripe-test-canonical-prices-p0-v1` |
| Base intégrée | `9261214917438dbefb67b5311e512dd5a0f0180d` |
| **SHA final** | *(dernière ligne ci-dessous)* |

**Non fusionné. Non déployé.**
