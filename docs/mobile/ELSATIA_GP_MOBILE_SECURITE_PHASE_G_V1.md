# ELSATIA Gestion Pro — Sécurité mobile (phase G)

Lot : `ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1` · Base `52d3282` (ledger 278) · 2026-09-09

## 1. Contrôles exécutés, avec leur résultat

| Contrôle | Commande / méthode | Résultat |
|---|---|---|
| Aucune clé service-role dans un composant client | Recherche sur `SUPABASE_SERVICE_ROLE_KEY` croisée avec `"use client"` | **Aucune** |
| Modules clients sans import serveur | `synchronisation.ts`, `FileHorsLigne.tsx`, `purge-locale.ts` | **0 occurrence** de `server-only`, `SERVICE_ROLE`, `createClient(` |
| Aucun secret versé dans Git | `npm run verify:secrets` | **1 750 fichiers, aucun secret** (1 exception nommée) |
| Ledger intact | `npm run verify:migrations` | **278 migrations valides**, noms et horodatages uniques |
| Aucune migration créée par ce lot | `git diff --name-only 52d3282..HEAD -- supabase/migrations` | **0 fichier** |
| Propreté du diff | `git diff --check` | **Propre** |
| Route de rejeu sans privilège | Lecture de `route.ts` | **Client Supabase normal uniquement** |

## 2. Aucun droit nouveau — le point le plus important

La route `/api/mobile/offline/mutations` n'utilise **que** `createClient()` de
`@/lib/supabase/server`, c'est-à-dire le client de session ordinaire. Elle ne touche jamais à
la clé service-role.

Conséquence directe, et voulue : **une mutation préparée hors ligne ne peut rien faire que son
auteur ne pourrait faire en ligne**. Les mêmes RLS s'appliquent, dans le même ordre. Une
permission révoquée entre la préparation et le rejeu fait échouer le rejeu.

C'est le contraire de ce qu'une file hors ligne « pratique » aurait fait : passer par la clé
service-role pour « éviter les problèmes de droits au rejeu ». Cela aurait transformé la file
en porte dérobée — un geste refusé à l'écran devenant possible en le préparant hors ligne.

## 3. Séparation des entreprises — trois barrières indépendantes

| Niveau | Mécanisme | Ce qu'il empêche |
|---|---|---|
| Appareil | Le **nom** de la base IndexedDB porte `(entrepriseId, utilisateurId)` | Un mauvais compte ouvre une base **vide**, jamais celle d'un autre |
| Transport | `peutPartirSous()` puis vérification de l'identité déclarée dans la route | Une saisie préparée par A ne part jamais sous B |
| Base | RLS : `cree_par_utilisateur_id = auth.uid()`, `peut_pointer_pour_employe(...)` | Le refus final, indépendant du client |

Les trois sont **indépendantes**. La troisième suffirait seule à garantir la sécurité ; les
deux premières existent pour que le refus soit **clair et précoce** plutôt qu'un refus de RLS
opaque que l'utilisateur lirait comme une panne — et pour qu'aucune donnée ne quitte l'appareil
en pure perte.

## 4. Cache du service worker — le risque le plus subtil du lot

Un cache de service worker est indexé par **origine**, pas par session. Y déposer une réponse
d'API, c'est offrir les données de l'entreprise A au compte de l'entreprise B qui se connectera
ensuite sur le même téléphone : **sans faute de RLS, sans trace côté serveur, et sans que
personne ne s'en aperçoive**.

Le service worker ne met donc en cache que des ressources versionnées, publiques et non
personnelles. **8 tests d'invariants** protègent cette règle, dont l'exclusion explicite de
`/_next/image` — qui sert des images privées depuis une URL de même origine.

Ces tests ne prouvent pas que le service worker se comporte bien : ils empêchent qu'on
« accélère l'application » dans six mois en y ajoutant les réponses d'API.

## 5. Purge à la déconnexion

| Support | Mécanisme | Portée |
|---|---|---|
| `localStorage` / `sessionStorage` | `purgerStockageCleValeur` | Clés de Gestion Pro **uniquement** |
| Caches du service worker | Message `PURGER_CACHES` | **Tous** les caches |
| IndexedDB | `purgerBasesLocales` → `deleteDatabase` | **Toutes** les bases GP, toutes identités |

**Deux déclencheurs, aucun ne suffit seul** : le bouton de déconnexion couvre la sortie
volontaire ; le montage de `/login` couvre l'**expiration de session et la révocation à
distance** — cas où l'utilisateur ne clique sur rien.

La purge clé/valeur **n'appelle pas `clear()`** : la même origine sert d'autres applications
ELSATIA, et tout balayer ferait perdre un travail sans rapport avec la session fermée. Un
effacement large paraît plus sûr et ne l'est pas — il est moins précis.

### Limite déclarée

`indexedDB.databases()` **n'existe pas sur Firefox**. `purgerBasesLocales()` rend alors `0` —
et le dit par sa valeur de retour plutôt que de laisser croire à une purge complète. Sur ce
navigateur, les bases d'une session précédente survivent à la déconnexion. Elles restent
inaccessibles à un autre compte (le nom porte l'identité) mais occupent de la place. **Noté,
non résolu.**

## 6. Appareil perdu et révocation de session

Ce qui fonctionne aujourd'hui : la révocation côté Supabase invalide le cookie ; la prochaine
ouverture aboutit sur `/login`, dont le montage **purge toutes les données locales**. C'est le
chemin de nettoyage d'un appareil perdu, et il ne demande aucun geste sur l'appareil.

Ce qui reste vrai malgré tout : tant que l'appareil n'est pas rouvert, les données préparées
hors ligne demeurent sur son disque. **Aucun chiffrement applicatif ne les protège** — elles
reposent sur le chiffrement du système (verrouillage par code, Data Protection iOS, chiffrement
Android). C'est le même niveau de protection que les brouillons du navigateur, et il faut le
dire plutôt que de le laisser supposer.

Le contenu concerné est borné : sessions de pointage et brouillons de notes de frais du seul
utilisateur. Ni jeton, ni secret, ni donnée d'une autre entreprise.

## 7. Réauthentification pour actions sensibles

Inchangé par ce lot. La MFA (`/mfa/challenge`) et les gardes existantes restent en place. La
file hors ligne ne transporte **aucune** action sensible : le périmètre est limité à trois
types (`pointage_arrivee`, `pointage_depart`, `note_frais_brouillon`), et `estTypeMutation()`
refuse tout le reste.

Une note de frais rejouée est toujours créée en statut **`brouillon`** — jamais soumise. La
file transporte un travail préparé, pas une validation. Le salarié rouvre la note, y joint son
justificatif et la soumet lui-même.

## 8. Journaux

Les motifs d'échec renvoyés à l'appareil viennent des messages PostgREST, qui ne contiennent ni
jeton ni donnée d'une autre entreprise. Aucun `console.log` n'a été introduit dans les modules
de ce lot.

## 9. Horodatage — refus par défaut

Une horloge d'appareil peut être fausse, par accident ou volontairement. `instantCapture()`
refuse ce qui est manifestement absurde : plus de 5 minutes dans le futur, ou plus de 30 jours
dans le passé. Une saisie hors de ces bornes est **refusée**, pas corrigée en silence — écrire
en base une date que personne ne pourra expliquer six mois plus tard serait pire que de la
rejeter.

## 10. Ce que ce lot ne change pas, et qui reste à surveiller

1. **`httpOnly: false` sur le cookie de session.** Choix délibéré et documenté : les clients
   Supabase navigateur doivent le rafraîchir. Correct sous CSP à nonce dans un navigateur.
   **À réévaluer impérativement avant toute publication d'une coque `server.url`** — voir la
   phase B et `mobile/capacitor/README.md`.
2. **Aucun chiffrement applicatif du stockage local** (§ 6).
3. **Aucune mesure d'exécution** : tout ce qui précède est vérifié par lecture de code, tests
   unitaires et outils du dépôt. Le comportement réel en navigateur relève de la phase H.

## 11. Interdictions du lot — respectées

| Interdiction | Vérification |
|---|---|
| Aucune migration créée | `git diff` sur `supabase/migrations` : **0 fichier** ; SQL livré en `.sql.proposed` hors du dossier |
| Aucun numéro de ledger réservé | Le fichier proposé n'en porte aucun |
| Aucun Stripe Live ou Test | Aucun fichier Stripe touché |
| Aucun déploiement | Aucun |
| Aucun secret dans Git | `verify:secrets` : **aucun** |
| Aucune publication magasin | Aucun compte, certificat ou secret créé |
| Aucun force-push, rebase, amend, `git clean` | Aucun ; branche créée depuis `52d3282` |
