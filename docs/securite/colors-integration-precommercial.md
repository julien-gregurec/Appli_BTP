# ELSATIA Colors — intégration sécurité + réinitialisation multi-application

Lot `ELSATIA-COLORS-SECURITY-RESET-INTEGRATION-PREFLIGHT-V1`, branche
`integration/colors-precommercial-security-reset-v1`.

Ce lot **n'ajoute aucune fonctionnalité** : il constate que les quatre lots
Colors forment déjà une chaîne linéaire, en fixe le point de convergence, et
réconcilie la seule contradiction documentaire qui subsistait entre eux.

## 1. Topologie — chaîne déjà linéaire

Les quatre commits annoncés sont en filiation directe, sans divergence :

```
3f20eaa  (base)
└─ 5ea1d03  fix(colors): harden internal redirect validation
   └─ 260523c  fix(colors): close precommercial security p1 gaps
      └─ 4de472d  fix(colors): complete auth callback and csp hardening
         └─ 5b21590  docs(colors): état Auth Production après réglages exploitant
            └─ 3870e1c  feat(auth): relayer un lien de récupération vers Colors   ← lot GP
               └─ da74bb4  fix(colors): add safe multiapp password reset flow
```

`da74bb4` contient donc déjà l'intégralité des correctifs, **y compris le lot
Gestion Pro `3870e1c`** : dépôt unique, le relais GP et l'écran Colors ont été
livrés dans la même chaîne. Aucun merge ni cherry-pick n'était nécessaire ;
l'intégration est un simple point de branchement sur `da74bb4`.

La base `3f20eaa` porte 263 commits absents de `main` (intégration canonique
Colors et durcissement plateforme). **Cette branche n'est pas un delta sur
`main`** : c'est un point à connaître avant tout déploiement.

## 2. Contradiction documentaire corrigée

`colors-en-tetes.md` §4.2, écrit au lot CSP, prescrivait comme cible un gabarit
d'e-mail fondé sur `{{ .RedirectTo }}` portant une origine. Le lot suivant a
retenu une solution différente et **conserve `{{ .SiteURL }}`**.

Laissée telle quelle, cette section aurait conduit un exploitant à réintroduire
`{{ .RedirectTo }}` dans le gabarit partagé — précisément la modification dont
le même document démontre qu'elle casse les deux applications. La section est
donc marquée comme remplacée : la mesure est conservée, la prescription est
remplacée par l'état réel.

## 3. Contrat de réinitialisation — vérifié

```
e-mail Supabase partagé ({{ .SiteURL }}, gabarit inchangé)
  → GP /auth/confirm            choix explicite, jeton non consommé
  → Colors /auth/confirm        forme du jeton validée, GET inerte
  → verifyOtp côté Colors       sur l'origine de Colors
  → session Colors
  → /nouveau-mot-de-passe       destination constante, aucun `next` accepté
```

## 4. Configuration attendue — aucune modification par ce lot

| Projet | Variable | Valeur attendue |
| --- | --- | --- |
| Colors (`elsatia-colors`) | `NEXT_PUBLIC_SUPABASE_URL` | origine HTTPS du projet Supabase |
| Colors | `NEXT_PUBLIC_COLORS_URL` | `https://colors.elsatia.fr` |
| Gestion Pro (`elsatia-production`) | `NEXT_PUBLIC_COLORS_URL` | `https://colors.elsatia.fr` — Production + Preview |

La variable Gestion Pro, seule action humaine que réclamait le lot de
réinitialisation, **a été posée manuellement hors de ce lot**. Aucune
configuration n'a été lue, écrite ni déployée ici.

## 5. Limite connue, non bloquante

`style-src 'unsafe-inline'` reste nécessaire tant que subsistent les attributs
`style` React de la fiche seau, de l'inventaire et de `global-error`. Un nonce
ne couvre pas les attributs de style. Levée = lot d'interface, P1 futur.

## 6. Recette exécutée

Serveurs de production locaux (`next start`), Supabase remplacé par une origine
factice : aucune sollicitation d'un service réel.

- Colors — 194 tests, typecheck, lint, build : verts.
- Gestion Pro — 646 tests, typecheck, build : verts ; lint 0 erreur, 3
  avertissements `no-img-element` préexistants et hors périmètre.
- Navigateur — `/login`, `/mot-de-passe-oublie`, `/auth/confirm`,
  `/nouveau-mot-de-passe`, accueil : **aucune violation CSP**, console vide,
  service worker enregistré et actif.
- Redirections hostiles (`https://`, `//`, `/\`, `%2f%2f`, `javascript:`,
  `%0d%0a`) : toutes ramenées à `/dashboard`.
- Charges XSS dans `token_hash` et `error` : jamais rendues. Les occurrences
  observées dans la source sont la sérialisation RSC de l'URL, échappée
  (`<`) dans un script noncé.
- Message d'hameçonnage composé via `?error=` : non rendu, jeu de messages fermé.
- Aucune erreur Supabase brute exposée : codes fermés côté URL, message
  technique journalisé côté serveur uniquement.

Le rendu du relais Gestion Pro est vérifié par rendu réel du composant
(`src/app/auth/confirm/page.test.ts`), et non par HTTP : sans Supabase, le
limiteur anti-abus de Gestion Pro refuse la requête en 503 — comportement
attendu d'un garde qui échoue fermé, sans rapport avec ce lot.
