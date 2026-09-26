# Runbook — rationalisation des endpoints webhook Stripe

**Statut :** préparé, **non exécuté**. Aucun endpoint n'a été modifié.
**Portée :** Stripe **Test** uniquement. **Aucun endpoint Live ne doit être touché par ce runbook.**

---

## 1. Le problème

Deux endpoints Stripe **Test** livrent les **mêmes huit évènements** vers la
**même route applicative** `/api/stripe/abonnement/webhook` :

| | Endpoint A — domaine stable | Endpoint B — préversion |
|---|---|---|
| Identifiant | `we_1U9STn0bT5C0WG2avd2YaXMj` | `we_1Tziay0bT5C0WG2a4Ib2ncwB` |
| URL | `https://app.elsatia.fr/api/stripe/abonnement/webhook` | `https://elsatia-preview-…vercel.app/api/stripe/abonnement/webhook` |
| Statut | `enabled` | `enabled` |
| Créé | 2026-08-28 | 2026-08-01 |

Évènements communs : `checkout.session.completed`,
`customer.subscription.created` / `.updated` / `.deleted`, `invoice.created`,
`invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.

**Chaque endpoint porte son propre secret de signature.** Ce sont deux
déploiements distincts, chacun configuré avec le sien. Une livraison de l'un
n'est donc pas vérifiable par l'autre.

---

## 2. Pourquoi c'est un blocage de mise en Production

L'endpoint A porte la description *« ELSATIA Production — Billing webhook (Test
mode switch V1) »* et vise le domaine **stable** `app.elsatia.fr`. Le jour où le
compte bascule en Live, la même topologie sera reproduite : deux endpoints
concurrents, dont une préversion, sur des évènements de facturation réels.

Trois conséquences, par ordre de gravité :

1. **Un traitement de facturation ne doit dépendre d'aucune course.** Aujourd'hui
   la seule chose qui empêche un double traitement est le journal
   d'idempotence — voir § 3. C'est une protection, pas une architecture. Elle ne
   couvre que les déploiements partageant la même base.
2. **Deux déploiements peuvent viser deux bases.** Si la préversion pointe une
   base distincte, chaque évènement est traité **deux fois, dans deux états**.
   Le journal ne peut rien : il n'est pas partagé. C'est le scénario qui
   deviendrait grave en Live.
3. **Le diagnostic devient ambigu.** Toute livraison en échec doit être attribuée
   au bon endpoint avant d'être interprétée ; deux endpoints doublent le bruit et
   les tentatives de re-livraison.

**Conclusion : la duplication doit être résolue avant l'ouverture commerciale.**
Elle est consignée comme blocage dans ce runbook et dans le rapport du lot.

---

## 3. Ce qui protège aujourd'hui

Le journal `public.abonnement_evenements`, clé **`stripe_event_id text not null
unique`**, réservé par `reserver_evenement_abonnement_service` : un `insert` nu
qui capture `unique_violation` et renvoie `duplicate`. La déduplication est donc
**atomique en base**, pas applicative.

Le point qui la rend efficace entre deux endpoints : **Stripe envoie le même
identifiant `evt_` aux deux**. La seconde réservation échoue, la route renvoie
`{ received: true, duplicate: true }` sans prendre de verrou, sans relire Stripe,
sans rien synchroniser.

Démontré par `src/app/api/stripe/abonnement/webhook/double-livraison.test.ts`
(**7 tests**), où le journal est modélisé comme un **état réel** et non comme un
booléen figé :

| Démonstration | Résultat |
|---|---|
| Deux livraisons successives du même évènement | **1 seul traitement** |
| Deux livraisons **concurrentes** | **1 seul traitement**, un seul `duplicate` |
| La seconde livraison ne prend aucun verrou et ne relit pas Stripe | ✅ |
| La déduplication porte sur l'`evt_` id, pas sur l'expéditeur | ✅ |
| Deux évènements **distincts** restent tous deux traités | ✅ contre-épreuve |
| Livraison signée par l'autre endpoint | refusée en 400, **rien journalisé** |
| Échec de traitement | réservation **libérée**, évènement rejouable, pas de double traitement au rejeu |

---

## 4. Procédure de rationalisation

> **Ordre impératif.** Ne jamais désactiver un endpoint avant d'avoir prouvé le
> secret actif de celui qu'on garde. Le contraire coupe la facturation.

### Étape 1 — Vérifier les livraisons du domaine stable

Tableau de bord Stripe **Test** → *Développeurs → Webhooks* → endpoint
`we_1U9STn0bT5C0WG2avd2YaXMj`.

Relever, sur les 30 derniers jours :

- le nombre de livraisons et le taux de succès ;
- toute réponse `4xx` — une `400` signale une signature refusée, donc un secret
  qui ne correspond pas ;
- toute réponse `503` — attendue et bénigne : la route la renvoie sur état
  transitoire pour que Stripe re-livre ;
- la date de la dernière livraison réussie.

**Critère de passage :** au moins une livraison **récente et réussie**, et aucune
`400` non expliquée. Sans cela, **arrêter** : le domaine stable n'est pas prouvé
opérationnel, et l'on ne désactive rien.

### Étape 2 — Confirmer le secret de l'endpoint conservé

L'API Stripe ne renvoie le champ `secret` d'un `webhook_endpoint` **qu'à sa
création**. Il est donc impossible de prouver la correspondance par API : la
confirmation passe obligatoirement par le tableau de bord.

1. Sur l'endpoint A, *Signing secret* → **Reveal**.
2. Comparer à la variable **active** `STRIPE_WEBHOOK_ABONNEMENT_SECRET` du
   déploiement servant `app.elsatia.fr`. Comparer par **empreinte**, jamais en
   affichant les valeurs :

   ```bash
   printf %s "$STRIPE_WEBHOOK_ABONNEMENT_SECRET" | shasum -a 256 | cut -c1-16
   ```

3. Comparer aussi au **candidat périmé** conservé, commenté, dans `.env.local`.

**Critère de passage :** l'empreinte du secret révélé pour l'endpoint A est
**égale** à celle de la variable active. Si elle est égale à celle du candidat
périmé, ce sont les rôles qui sont inversés : corriger `.env.local` **avant**
toute désactivation, et ne rien supprimer.

**Si aucune des deux ne correspond : arrêter.** L'endpoint A n'est pas celui que
sert ce déploiement.

### Étape 3 — Évènement Test contrôlé

Sur une entreprise de recette uniquement.

1. Provoquer un `customer.subscription.updated` en Test — par exemple une
   modification de quantité sur un abonnement de recette.
2. Vérifier dans Stripe que l'évènement est livré à **A** en `200`.
3. Vérifier en base que `abonnement_evenements` porte **une seule** ligne pour
   cet `stripe_event_id`, et que `statut_resultant` est renseigné :

   ```sql
   select stripe_event_id, type, statut_resultant, created_at
   from public.abonnement_evenements
   where stripe_event_id = 'evt_…';
   ```

4. Si B est encore actif et partage la base, sa livraison doit apparaître comme
   **doublon sans effet** : toujours une seule ligne, un seul traitement.

**Critère de passage :** une ligne, un traitement, `200` côté A.

### Étape 4 — Désactiver l'endpoint de préversion

**Seulement si les étapes 1 à 3 sont toutes passées.**

Contrairement aux coupons, un endpoint Stripe **peut** être désactivé sans être
supprimé : le paramètre `disabled` est accepté en modification. **Désactiver, ne
jamais supprimer** — un endpoint supprimé perd son secret et son historique de
livraisons.

Tableau de bord Stripe Test → endpoint B → *Disable*. En désactivant plutôt qu'en
supprimant, le retour arrière tient en un clic.

### Étape 5 — Vérification après coup

1. Endpoint B : statut `disabled`.
2. Endpoint A : statut `enabled`, inchangé.
3. Rejouer l'étape 3 : l'évènement est livré **une seule fois**.
4. Aucun endpoint **Live** modifié — à vérifier explicitement.

### Retour arrière

Réactiver l'endpoint B depuis le tableau de bord. Son secret et son historique
sont intacts puisqu'il n'a pas été supprimé. Aucune donnée applicative n'est
concernée : le journal d'idempotence rend un rejeu inoffensif.

---

## 5. Interdits de ce runbook

- Ne **jamais** toucher un endpoint **Live**.
- Ne **jamais** supprimer un endpoint : désactiver.
- Ne **jamais** désactiver ou remplacer un secret dont la correspondance n'est
  pas prouvée à l'étape 2.
- Ne **rien** déployer dans le cadre de cette procédure.
