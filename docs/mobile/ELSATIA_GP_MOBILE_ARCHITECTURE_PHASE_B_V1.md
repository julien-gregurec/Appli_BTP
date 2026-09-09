# ELSATIA Gestion Pro — Architecture mobile retenue (phase B)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

## 1. Décision

> **La V1 mobile de Gestion Pro est une PWA. Une coque Capacitor est préparée localement,
> en mode `server.url`, réservée à un pilote interne — elle n'est ni publiée, ni proposée
> à la publication en l'état.**

Ce n'est pas « PWA + Capacitor » au sens d'une application native livrable. C'est
**PWA maintenant, coque native prête à être décidée**, parce que la preuve technique autorise
la première et impose des conditions à la seconde.

## 2. Ce que la preuve établit

### 2.1 `output: "export"` est hors d'atteinte pour Gestion Pro

`src/app/layout.tsx` :

```ts
// La CSP à nonce exige un rendu par requête pour que Next transmette le nonce
// aux scripts générés. Cette décision privilégie la sécurité au cache statique.
export const dynamic = "force-dynamic";
```

S'y ajoutent, tous incompatibles avec un export statique :

| Élément | Emplacement | Nature |
|---|---|---|
| CSP à nonce par requête | `src/proxy.ts` | `crypto.randomUUID()` par requête |
| Session Supabase SSR | `src/lib/supabase/server.ts` | `cookies()` côté serveur |
| 55 fichiers de Server Actions | `src/app/actions/` | exécution serveur |
| 47 routes d'API | `src/app/api/` | exécution serveur |
| PDF Chromium | `outputFileTracingIncludes` | binaire serveur |
| Exports ExcelJS | `serverExternalPackages` | 22 paquets chargés au runtime |

**La recette qui fonctionne pour `apps/tools` ne se transpose pas.** Tools bascule en statique
sous `ELSATIA_TOOLS_NATIVE=1` (`output: "export"`, `trailingSlash: true`) et Capacitor embarque
`out/`. Tools est une application de géométrie **entièrement côté client**. Gestion Pro est une
application serveur multi-locataire dont l'autorisation vit dans PostgreSQL. Il n'y a pas de
`out/` à embarquer, et il ne peut pas y en avoir sans réécrire le produit.

### 2.2 Le mode `server.url` fonctionne, et son coût est identifiable

Une coque Capacitor pointant sur `https://app.elsatia.fr` charge l'application réelle dans une
WebView. Les vérifications faites :

| Point de blocage possible | Vérification | Verdict |
|---|---|---|
| CSP `default-src 'self'` | L'origine de la page **est** `app.elsatia.fr` en mode `server.url` | Compatible |
| `frame-ancestors 'none'` / `X-Frame-Options: DENY` | Une WebView Capacitor n'est pas une iframe | Compatible |
| Cookies de session | `sameSite: "lax"`, `secure`, `path: "/"` — première partie sur l'origine chargée | Compatible |
| `Permissions-Policy: camera=(self), geolocation=(self)` | Même origine | Compatible |
| Service worker | Servi par l'origine distante, s'installe normalement | Compatible |

**Le coût, en revanche, est réel et doit être écrit noir sur blanc.**

En mode `server.url`, Capacitor injecte son pont natif dans une page **chargée depuis le
réseau**. Le code distant obtient donc l'accès aux interfaces natives déclarées (fichiers,
caméra, préférences). Or `src/lib/security/cookies.ts` pose délibérément :

```ts
// Les clients Supabase navigateur actuels lisent et rafraîchissent ce cookie.
// Le passer HttpOnly invaliderait leur session ; XSS est traité par la CSP.
httpOnly: false,
```

Ce choix est correct pour un navigateur — la CSP à nonce est une défense sérieuse contre
l'injection de script. Mais il change de portée dans une coque native : une injection réussie
n'atteindrait plus seulement la session, elle atteindrait **le système de fichiers de
l'appareil**. La CSP reste la seule barrière, et elle devient la barrière de trop de choses.

C'est la raison principale pour laquelle la coque Capacitor est préparée mais **pas proposée à
la publication** dans ce lot.

### 2.3 Ce que la PWA couvre déjà, sans coque

| Besoin terrain | Couvert par la PWA | Précision |
|---|---|---|
| Installation sur l'écran d'accueil | Oui | Android via `beforeinstallprompt`, iOS via Partager → Sur l'écran d'accueil |
| Plein écran sans barre de navigateur | Oui | `display: standalone` + `MobileBack` |
| Appareil photo, import de justificatif | Oui | `capture=` — ouvre l'appareil photo natif |
| Position GPS | Oui | `watchPosition`, déjà en service |
| Notifications push | Oui | VAPID complet ; iOS ≥ 16.4 **à condition d'être installée** |
| Stockage local durable | Oui | IndexedDB (livré en phase E) |
| Fonctionnement hors réseau | Oui | Service worker + file locale (phase E) |

**Le seul écart fonctionnel entre la PWA et une coque native, pour le périmètre V1 terrain,
est la présence sur les magasins.** Ce n'est pas un besoin technique : c'est un besoin
commercial, qui relève du calendrier de commercialisation, pas de ce lot.

## 3. Options écartées, et pourquoi

### Option A — PWA seule, sans préparation native

**Écartée.** Le lot demande explicitement une préparation iOS/Android, et la présence en
magasin est un objectif commercial connu. Ne rien préparer obligerait à tout découvrir plus
tard, alors que la configuration, les icônes, les permissions et les instructions de build se
font maintenant à faible coût.

### Option B — Application native distincte (Swift / Kotlin, ou React Native)

**Écartée.** Elle imposerait de réimplémenter l'autorisation, les contrats de données et les
règles métier hors de PostgreSQL et hors des Server Actions — exactement la duplication
permanente du moteur métier que le lot interdit. Le coût de maintien de deux vérités
d'autorisation est le risque le plus sérieux qu'une application multi-locataire puisse prendre.

### Option C — Capacitor avec un bundle statique embarqué

**Écartée sur preuve** : voir 2.1. Il n'existe aucun `out/` à embarquer.

### Option D — Un client « terrain » statique et distinct, embarqué dans Capacitor

Une petite application Next en `output: "export"`, limitée aux écrans de terrain, parlant
directement à Supabase, partageant les contrats de données mais pas les écrans.

**Non retenue pour ce lot, mais conservée comme la seule voie sérieuse vers une vraie
application de magasin.** Elle ne duplique pas le moteur métier — les RLS, les RPC et les
contrats restent la source unique de vérité — mais elle duplique l'interface des écrans de
terrain. C'est un arbitrage à faire en connaissance de cause, et il dépasse le cadre d'une
fondation. Il est consigné ici pour que la décision existe le jour où les magasins deviendront
une exigence ferme.

## 4. Architecture retenue, en clair

```
                    ┌──────────────────────────────────────────┐
                    │        PostgreSQL (Supabase)             │
                    │  RLS · RPC · contraintes · ledger 278    │
                    │      ── source unique de vérité ──       │
                    └────────────────────┬─────────────────────┘
                                         │
                    ┌────────────────────┴─────────────────────┐
                    │      Gestion Pro — Next.js (SSR)         │
                    │  Server Actions · routes API · CSP nonce │
                    │        ── un seul moteur métier ──       │
                    └────────────────────┬─────────────────────┘
                                         │  même code, même origine
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
      ┌───────┴────────┐        ┌────────┴────────┐        ┌────────┴────────┐
      │  Navigateur    │        │  PWA installée  │        │ Coque Capacitor │
      │   de bureau    │        │  (V1 mobile)    │        │  server.url     │
      │                │        │  SW + IndexedDB │        │  pilote interne │
      └────────────────┘        └─────────────────┘        └─────────────────┘
```

**Aucune duplication du moteur métier.** Les trois surfaces chargent le même code, sous les
mêmes RLS, avec les mêmes contrats. La coque native n'est qu'un contenant.

## 5. Synchronisation et stockage local (cadre posé ici, réalisé en phase E)

| Sujet | Décision |
|---|---|
| Emplacement | IndexedDB, une base par couple `(entrepriseId, utilisateurId)` |
| Portée | Uniquement les six besoins terrain justifiés — rien d'autre n'est stocké |
| Idempotence | Identifiant UUID **généré par l'appareil**, servant de clé primaire de la ligne |
| Rejeu | Route dédiée sous session normale, jamais de droit nouveau |
| Identité | Une mutation préparée par A est **refusée** si la session courante n'est pas A |
| Conflit | Jamais rejoué automatiquement — exige un geste humain |
| Purge | Effacement complet à la déconnexion |
| Réutilisation de Réserves | **Principes et vocabulaire d'états, pas le code.** Voir § 6 |

## 6. Position sur le moteur hors ligne de Réserves

`apps/reserves/src/lib/offline/` est de grande qualité et son `contrat.ts` est un module pur
(ni réseau, ni DOM, ni IndexedDB). La tentation d'en faire un paquet partagé est réelle.

**Elle est écartée, pour trois raisons.**

1. **Réserves reste une application autonome.** En extraire le cœur pour le partager
   modifierait Réserves — une application dont la V6 vient d'être livrée et recettée
   (`75b5c62`) — au bénéfice d'un lot qui ne la concerne pas. Le risque est asymétrique.
2. **Les charges utiles n'ont rien en commun.** Réserves synchronise des réserves de chantier
   avec photos et annotations de plan ; Gestion Pro synchronise des sessions de pointage GPS
   et des brouillons de notes de frais. Une abstraction commune serait une abstraction vide.
3. **Le lot l'interdit explicitement** : « ne généralise pas artificiellement le moteur hors
   ligne de Réserves ».

Ce qui est repris, en revanche, l'est délibérément et sera cité dans le code :

- les **sept états** et surtout la table de transitions, dont l'intérêt principal est ce
  qu'elle interdit — rien ne ramène `synchronise` ou `conflit` vers `en_attente`, ce qui rend
  impossible par construction qu'une boucle de reprise renvoie une mutation déjà acquittée ;
- les **trois principes de la route de rejeu** : aucun droit nouveau, identité déclarée
  vérifiée, rejeu normal ;
- la **distinction à trois issues** de la résolution d'identité (`ok` / `anonyme` /
  `indisponible`), qui évite d'annoncer « session expirée » à un utilisateur connecté dont le
  serveur a simplement mis trop de temps à répondre.

## 7. Sécurité — points ouverts renvoyés à la phase G

1. Session lisible en JS (`httpOnly: false`) : acceptable en navigateur sous CSP à nonce,
   **à réévaluer** avant toute publication d'une coque `server.url`.
2. Isolation stricte du stockage local par entreprise **et** par utilisateur, purge à la
   déconnexion, refus d'envoi sous une identité différente.
3. Aucun secret, jeton ou réponse appartenant à une autre entreprise dans le cache du
   service worker — la règle actuelle du service worker (réseau seul hors statiques) est
   conservée et **ne sera pas assouplie** pour les données métier.

## 8. Mises à jour

| Surface | Mécanisme | Délai |
|---|---|---|
| Navigateur | Déploiement — immédiat | Immédiat |
| PWA installée | Nouveau service worker, `VERSION` incrémentée, `skipWaiting` | Au rechargement suivant |
| Coque Capacitor `server.url` | **Le contenu se met à jour comme le web** : seule la coque exige une republication | Immédiat pour le contenu |

C'est un avantage réel du mode `server.url` : un correctif de terrain n'attend pas une revue
de magasin. Il ne compense pas le risque décrit en 2.2, mais il doit être porté au dossier.

## 9. Limites iOS et Android à connaître

| Sujet | iOS | Android |
|---|---|---|
| Installation PWA | Safari uniquement, geste manuel (Partager → Sur l'écran d'accueil) ; aucune invite automatique | Invite `beforeinstallprompt`, Chrome et dérivés |
| Push web | À partir d'iOS 16.4 **et seulement si installée** sur l'écran d'accueil | Disponible largement |
| Stockage | Quota par origine ; une application installée n'est pas soumise à l'éviction des sites simplement visités | Quota plus large |
| Arrière-plan | Pas de synchronisation en arrière-plan (`Background Sync` absent) : la reprise se fait **à l'ouverture** | `Background Sync` disponible, non utilisé en V1 pour garder un comportement unique |
| Magasin | Revue Apple : une coque web nue est exposée à la règle de fonctionnalité minimale | Play : plus permissif, exigences de confidentialité à respecter |

**Conséquence de conception, valable pour les deux plateformes** : la reprise de la file hors
ligne est déclenchée à l'ouverture de l'application et au retour du réseau, jamais par une
tâche d'arrière-plan. Le comportement est ainsi **identique** sur iOS et Android, ce qui évite
qu'un salarié iPhone et un salarié Android ne vivent pas la même règle.

## 10. Publication — ce qui reste humain

Aucun compte, certificat ou secret externe n'est créé dans ce lot. Restent, hors de portée
d'une session de développement :

1. Compte Apple Developer (99 $/an) et compte Google Play (25 $ une fois) — **absents**.
2. Certificats de signature, profils de provisionnement, clé de dépôt Android.
3. Compte de relecture pour les évaluateurs des magasins.
4. Fiches produit, captures, politique de confidentialité, déclarations de collecte.
5. **Un arbitrage explicite sur le mode `server.url`** au regard du § 2.2, ou la décision de
   financer l'option D.

Le lot `ELSATIA-MOBILE-STORES` a déjà défriché les points 1 à 3 pour Tools (`b3b91d8`) : les
mêmes gestes humains y sont documentés et restent les mêmes ici.
