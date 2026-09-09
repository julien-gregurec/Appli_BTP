# ELSATIA-GP-MOBILE-APPLICATION-FOUNDATION-V1 — Rapport final

Date : 2026-09-09

## 1. Identification

| | |
|---|---|
| Dépôt | `git@github.com:julien-gregurec/Appli_BTP.git` |
| Branche livrée | `feat/gp-mobile-application-foundation-v1` |
| SHA de base | `52d3282bede2203eb41bf8caa530a2ca5d86aa8e` (SHA métier Train V3 testé) |
| SHA métier testé | `52d3282` — vérifié : ancêtre de la tête documentaire, **1 seul commit d'écart**, purement documentaire |
| SHA final poussé | `7a14849` |
| Ledger | **278 migrations — inchangé** |
| Worktree | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-mobile-foundation-v1` (volume externe, isolé) |
| Fichiers | **76 fichiers, +4 877 / −104** |

Aucun travail dans le worktree Train V3, aucun dans `elsatia-site`, aucune fusion dans `main`,
aucun déploiement.

## 2. Verdict

> ## PRÊT SOUS CONDITIONS
>
> La fondation mobile est en place et vérifiée par 55 tests unitaires, un typecheck, un lint et
> un build de production. Elle **n'est pas prête pour un pilote terrain** tant que la recette
> navigateur des six parcours authentifiés n'a pas été jouée.

Ce que cette réserve recouvre exactement : les modules purs sont éprouvés, les pages publiques
sont mesurées, mais **personne n'a encore vu Gestion Pro fonctionner sur un téléphone**. Trois
défauts ont été trouvés par la mesure des seules pages publiques ; il serait imprudent de
supposer que les pages authentifiées n'en cachent aucun.

## 3. Architecture mobile retenue

**PWA pour la V1. Coque Capacitor préparée en mode `server.url`, réservée à un pilote interne,
ni publiée ni proposée à la publication.**

Établi sur preuve, pas supposé : `output: "export"` est hors d'atteinte pour Gestion Pro — CSP
à nonce par requête, session SSR par cookies, 55 fichiers d'actions serveur, 47 routes d'API,
Chromium et ExcelJS chargés au runtime. La recette qui marche pour `apps/tools` (application
entièrement cliente) **ne se transpose pas**.

Le mode `server.url` fonctionne — CSP, `frame-ancestors`, cookies et permissions vérifiés un
par un — mais Capacitor injecte alors son pont natif dans une page chargée depuis le réseau,
alors que le cookie de session est délibérément lisible en JavaScript. **C'est ce qui retient
la publication**, pas un manque de temps.

Une quatrième voie est consignée sans être retenue : un client « terrain » statique distinct,
partageant les contrats mais pas les écrans. C'est la seule voie sérieuse vers les magasins.

## 4. Fonctionnalités opérationnelles

| Fonction | État | Vérifié par |
|---|---|---|
| PWA installable | Opérationnel | Manifeste servi et mesuré, `beforeinstallprompt`, guide iOS |
| Mode standalone | Opérationnel | `display: standalone`, `portrait-primary` |
| Écrans de lancement iOS | Opérationnel | **12 tailles générées**, 12 balises mesurées dans le HTML |
| Raccourcis d'écran d'accueil | Opérationnel | 3 raccourcis dans le manifeste servi |
| Service worker | Opérationnel | `/sw.js` mesuré 200 + `application/javascript` |
| Mise à jour contrôlée | Opérationnel | Bannière, `skipWaiting` sur geste seulement |
| Notifications push | Préexistant, inchangé | VAPID de bout en bout |
| Appareil photo, GPS | Préexistant, inchangé | `capture=`, `watchPosition` |
| Palier tablette 768–1023 | Livré | Mesuré : 0 débordement à 768 et 1024 px |
| Seuil tactile 44 px | Livré | Mesuré sur `/login` : **aucune commande sous 44 px** |
| Champs à 16 px | Livré | Mesuré : 16 px (contre 14 px avant) |
| États d'écran explicites | Livré | 4 états distincts, hors ligne traité comme état de plein droit |
| Barre d'action mobile | Livré | Branchée sur `/chantiers` |
| Conservation de brouillon | Livré | 10 tests, déclencheur `visibilitychange` |
| Purge à la déconnexion | Livré | Clé/valeur + caches SW + IndexedDB, deux déclencheurs |

## 5. Fonctions hors ligne

| Besoin | État |
|---|---|
| Pointage arrivée / départ | **Livré** — file idempotente, rejeu sur geste |
| Brouillon de note de frais | **Livré** — statut `brouillon`, jamais soumis |
| Consultation des chantiers récents | **Socle livré**, écrans non branchés |
| Documents choisis explicitement | **Socle livré**, écrans non branchés |
| Capture photo | Fonctionne hors réseau (le fichier reste dans le formulaire) |
| **Justificatif photo joint hors ligne** | **NON livré** — voir réserve R3 |

Chaque mutation dispose de : identifiant d'idempotence (UUID de l'appareil, servant de clé
primaire), file locale isolée par utilisateur **et** entreprise, statut visible, reprise sur
geste, stratégie de conflit, historique, refus d'envoi sous une autre identité.

**Aucune migration n'a été nécessaire.** Le schéma interrogé l'a montré : identifiants à
`gen_random_uuid()`, `cloturer_session_pointage` acceptant déjà l'heure de départ, aucun
déclencheur réécrivant `arrivee_at`. La traçabilité du différé tient à l'écart entre
`created_at` (horloge serveur) et `arrivee_at` (horloge appareil).

## 6. Différences iOS / Android

| Sujet | iOS | Android |
|---|---|---|
| Installation | Safari, geste manuel, aucune invite | Invite `beforeinstallprompt` |
| Écran de lancement | **Exige nos 12 images** — sans elles, rectangle blanc | Fabriqué depuis le manifeste |
| Push | iOS ≥ 16.4, **uniquement si installée** | Largement disponible |
| Reprise en arrière-plan | `Background Sync` absent | Disponible, **volontairement non utilisé** |
| Purge IndexedDB | Fonctionne | Fonctionne (**sauf Firefox**, voir R4) |

**Choix de conception** : la reprise se fait à l'ouverture et au retour du réseau, jamais en
tâche de fond — pour que deux salariés de la même équipe vivent la même règle quel que soit
leur téléphone.

## 7. Tests exacts

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit --incremental false` | **0** |
| `eslint src tests` | **0 erreur** |
| `vitest run src/lib/mobile` | **55 tests, 6 fichiers, verts** |
| `vitest run` (suite complète) | 1 780 tests — 3 échecs de **contention**, verts isolément (§ 9) |
| `next build` | **Compilé avec succès**, 4,4 min |
| `verify:migrations` | **278 migrations valides** |
| `verify:secrets` | **1 750 fichiers, aucun secret** |
| `git diff --check` | **Propre** |

**Tests E2E écrits, prêts, non exécutés** : `tests/e2e/mobile-v1-terrain.spec.ts` — 5 largeurs
× 6 parcours, cibles tactiles, isolation inter-entreprises, manifeste, fichiers d'association.

## 8. Largeurs et appareils vérifiés

**Mesuré au navigateur**, sur le build de production servi localement :

| Page | 375 | 390 | 430 | 768 | 1024 |
|---|---|---|---|---|---|
| `/login` | 0 px | 0 px | 0 px | 0 px | 0 px |
| `/offline` | 0 px | 0 px | 0 px | 0 px | 0 px |

**Non mesuré** : les six parcours authentifiés (voir R1).

## 9. Trois défauts trouvés par la mesure

Aucun n'aurait été trouvé par lecture de code. Ils justifient la campagne, même partielle.

1. **`/sw.js` répondait 307 vers `/login`** — le `matcher` du proxy excluait
   `manifest.webmanifest` mais pas `sw.js`. Un service worker qui reçoit une page HTML ne
   s'enregistre pas, et l'échec est **silencieux** (`register()` est entouré d'un `.catch()`).
   L'application perdait tout son hors-ligne sans le dire. **Préexistant.** Corrigé, gardé par
   un test.
2. **Les pages non authentifiées ne recevaient aucune règle mobile** — mes règles étaient
   portées par `.app-shell`, hors duquel vivent `/login`, `/signup`, `/mfa` et les pages de mot
   de passe. Mesuré à 375 px : **champs à 14 px** (zoom automatique de Safari iOS) et **11
   commandes sous 44 px**. L'écran de connexion, le premier que voit un salarié, était le moins
   bien traité. **Introduit par ce lot**, corrigé.
3. **La page hors ligne affichait « Gestion Pro*a* besoin »** — repéré sur une capture, puis
   **vérifié dans le DOM** plutôt que sur l'image (codes `P r o a`). **Préexistant**, corrigé.

## 10. Sécurité

Aucun droit nouveau : la route de rejeu n'utilise que le client de session ordinaire, donc les
mêmes RLS que l'écran. Passer par la clé service-role « pour éviter les problèmes de droits au
rejeu » aurait transformé la file en porte dérobée.

Trois barrières indépendantes séparent les entreprises : le **nom** de la base IndexedDB porte
l'identité (un mauvais compte ouvre une base **vide**), la route vérifie l'identité déclarée,
les RLS refusent en dernier ressort.

Aucune donnée métier privée dans le cache du service worker — protégé par 8 tests d'invariants,
dont l'exclusion explicite de `/_next/image`.

## 11. Dépendances humaines pour les magasins

| # | Geste |
|---|---|
| 1–2 | Comptes Apple Developer (99 $/an) et Google Play (25 $) |
| 3–4 | Certificat de distribution iOS, clé de dépôt Android |
| 5–6 | `TEAM_ID` et empreinte SHA-256 → fichiers d'association |
| 7 | Compte de relecture pour les évaluateurs |
| 8 | Fiches produit, captures, politique de confidentialité |
| 9 | **Arbitrage explicite sur le mode `server.url`** (§ 3) |

Les points 1 à 4 et 7 ont été défrichés pour Tools par `ELSATIA-MOBILE-STORES` (`b3b91d8`).

**Aucun compte, certificat ou secret n'a été créé. Rien n'a été publié.**

## 12. Réserves

| # | Réserve | Portée |
|---|---|---|
| **R1** | **Les six parcours authentifiés n'ont jamais été vus sur un téléphone.** Aucun `.env.local` dans le dépôt ; les clés du décor E2E n'ont pas été retrouvées. | **Bloquante pour le pilote** |
| **R2** | La suite complète n'a **jamais été verte en une seule passe** sur cette machine (contention à `load average` 14–24, 60 conteneurs). Verte fichier par fichier. | À rejouer au repos |
| **R3** | **Une note de frais préparée hors ligne part sans son justificatif photo.** Stocker des images demande un magasin de blobs, une gestion de quota et une purge — un lot en soi. | Limite fonctionnelle réelle |
| **R4** | `purgerBasesLocales()` est **inopérante sur Firefox** (`indexedDB.databases()` absente). Les bases survivent à la déconnexion ; elles restent inaccessibles à un autre compte mais occupent de la place. | Noté, non résolu |
| **R5** | Le stockage local **n'a aucun chiffrement applicatif** ; il repose sur celui du système. Même niveau que les brouillons du navigateur. | À déclarer |
| **R6** | En retirant le correctif global des 12 pages V1, on a retiré `.flex { flex-wrap: wrap }`, qui **masquait peut-être** des débordements. **Si la mesure en révèle un, la correction est de corriger la page — jamais de lui remettre le correctif.** | À vérifier en R1 |
| **R7** | Le défaut d'espace JSX (§ 9.3) existe sur ~10 autres pages, **authentifiées donc non mesurées**. Non corrigées à l'aveugle. | À vérifier en R1 |
| **R8** | La consultation hors ligne a son socle testé mais **aucun écran ne propose « emporter »**. | Fonction incomplète |
| **R9** | Le classement initial des 141 pages **surestimait** le travail restant ; corrigé en cours de lot (25 pages lourdes et non 36). L'audit de phase A porte l'avertissement. | Corrigé, consigné |

## 13. Décision en attente — nom court PWA

`short_name` vaut « ELSATIA Gestion Pro » (19 caractères). iOS et Android **tronquent autour de
12** : l'écran d'accueil affiche « ELSATIA Ges… », qui ne distingue plus Gestion Pro des autres
applications ELSATIA du même téléphone.

J'avais raccourci en « Gestion Pro », puis **annulé** : `brand.test.ts` et `brand-visible.test.ts`
verrouillent explicitement « les noms officiels », et le nommage de la marque relève d'un
arbitrage commercial — d'autant plus dans le contexte du dépôt INPI en cours.

| Option | Effet sous l'icône |
|---|---|
| Statu quo | « ELSATIA Ges… » |
| « Gestion Pro » | « Gestion Pro » — lisible, perd le préfixe de marque |
| « ELSATIA GP » | « ELSATIA GP » — garde la marque, abrège le produit |

**Décision à prendre par Julien.**

## 14. Pourcentage et estimation restante

**Lot livré : 100 % du périmètre arbitré**, réserves comprises.

| Jalon | Estimation |
|---|---|
| Lever R1 (recette des 6 parcours, poste au repos) | **1 h – 2 h** |
| Traiter ce que R1 révélera (R6, R7 compris) | **1 h – 4 h**, inconnu par nature |
| Brancher les écrans « emporter » (R8) | **1 h – 2 h** |
| Justificatif photo hors ligne (R3) | **3 h – 5 h** — lot dédié |
| **Sous-total avant PILOTE terrain** | **3 h – 8 h** |
| Arbitrage `server.url` + comptes Apple/Google | **humain, non chiffrable** |
| Signature, fiches produit, relecture des magasins | **2 – 6 semaines**, dont l'essentiel en attente des magasins |
| **Avant publication en magasin** | **dépend entièrement des gestes humains du § 11** |

## 15. Documents du lot

| Document | Objet |
|---|---|
| `ELSATIA_GP_MOBILE_AUDIT_PHASE_A_V1.md` | Audit mobile réel (section 4 périmée, avertissement porté) |
| `ELSATIA_GP_MOBILE_BACKLOG_141_PAGES_V1.md` | **Classement corrigé des 141 pages** |
| `ELSATIA_GP_MOBILE_ARCHITECTURE_PHASE_B_V1.md` | Décision d'architecture sur preuve |
| `ELSATIA_GP_MOBILE_EXPERIENCE_PHASE_C_V1.md` | Expérience mobile V1 |
| `ELSATIA_GP_MOBILE_PWA_PHASE_D_V1.md` | PWA et service worker |
| `ELSATIA_GP_MOBILE_HORS_LIGNE_PHASE_E_V1.md` | File hors ligne |
| `ELSATIA_GP_MOBILE_SECURITE_PHASE_G_V1.md` | Contrôles de sécurité |
| `ELSATIA_GP_MOBILE_TESTS_PHASE_H_V1.md` | Tests et mesures |
| `mobile/capacitor/README.md` | Coque native, permissions, build, gestes humains |
| `supabase/proposed/pointage-origine-hors-ligne.sql.proposed` | **Migration proposée, non appliquée, sans numéro** |
