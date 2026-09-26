# ELSATIA — DÉCISIONS PROPRIÉTAIRE ENCORE OUVERTES V1

**Objet** — Extraire les seules décisions que Julien doit encore prendre personnellement.
Aucun code, aucun merge, aucune recommandation d'arbitrage : la mission est de restituer le
choix, pas de le faire.

| | |
|---|---|
| Date | 2026-09-23 |
| Branche analysée | `origin/claude/zen-goodall-n3opdc` (`afd39126`) |
| Sources balayées | `config/env-manifest.json` (registre structuré, 11 entrées `decisions[]`), 23 rapports `docs/qualification/`, 5 runbooks `docs/runbooks/`, `ELSATIA_PREVIEW_GO_LIVE_CHECKLIST_V1.md` (lu via `git show` sur `serene-turing-ekxjoo`) |
| Marqueurs recherchés | `DECISION_REQUIRED`, `LEGAL_DECISION_REQUIRED`, `COMMERCIAL_DECISION_REQUIRED` |
| Brut trouvé | 17 décisions distinctes |
| Retenu après élimination et regroupement | **10** |

Le registre canonique est `config/env-manifest.json` → `decisions[]`. Il porte 11 entrées avec
`owner: Julien`. Les six autres décisions viennent de la prose des rapports (`D-PREFLIGHT`,
les cinq `LEGAL_DECISION_REQUIRED` RGPD, `STUDIO-AI-ANALYSIS-DEPLOYMENT`) et **ne sont pas
enregistrées structurellement** — elles n'apparaissent dans aucun contrôle CI.

## 0. Décisions éliminées

Retirées parce qu'un travail plus récent les a rendues caduques, ou parce qu'elles n'étaient
pas des décisions.

| Décision écartée | Motif |
|---|---|
| `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` | **Obsolète dans sa formulation.** Elle demande « open (actuel) ou closed ? ». Le lot `STUDIO RUNTIME CONFIG WIRING V1` (2026-09-21) a rendu `studioSignupMode()` fail-closed : absent ou inconnu vaut désormais `closed`, couvert par 17 assertions vertes. L'« actuel » décrit par la question n'existe plus. Le résidu réel — la garde reste contournable quelle que soit la valeur — est **entièrement absorbé par la décision P0-2**. |
| `DECISION_REQUIRED:STUDIO-AI-ANALYSIS-DEPLOYMENT` | **Conditionnelle, pas ouverte.** Elle ne se pose que si l'analyse IA entre dans le périmètre d'une Preview, ce qui suppose la décision P0-3 déjà prise. Fonctionnalité désactivée par défaut (`STUDIO_AI_ANALYSIS=0`). |
| `DECISION_REQUIRED:STRIPE-SUPPLEMENTARY-ACCOUNTS`, `STRIPE-IA-OPTIONS`, `STRIPE-LEGACY-GENERATIONS`, `STRIPE-STORAGE-BLOCK` | **Regroupées dans P2-9.** Ce sont quatre facettes d'un même arbitrage de grille tarifaire, avec une conséquence technique unique : combien de variables Stripe et de Price IDs créer. Les traiter séparément produirait quatre questions dont aucune ne peut être répondue sans les trois autres. |
| Colors P6 — « arbitrer la migration proposée » (`ELSATIA-COLORS-COMMERCIAL-READINESS-V1` §10) | **Obsolète.** La migration `20260909000281_colors_finition_reference_nuancier_v15.sql` a été écrite, auditée, fusionnée et couverte par 57 assertions pgTAP (lot du 2026-09-21). La finition et la référence de nuancier ne sont plus bloquées par une décision. |
| Colors P2 — « vérifier les cinq variables publiques en Production » | **Ce n'est pas une décision**, c'est une opération, et elle est déjà contrainte : `verify-public-env.mjs` interrompt le build à défaut (comportement prouvé dans les deux sens). |
| Colors P7 — « recetter les parcours authentifiés » | **Ce n'est pas une décision**, c'est un travail. Voir `ELSATIA_COLORS_GAP_ANALYSIS_V1.md`, actions 2 et 4. |

## 1. Décisions encore réellement ouvertes

Priorité **par niveau de blocage technique uniquement** — pas par urgence commerciale, pas par
effort.

---

### P0-1 — Inventaire des projets Preview existants

`DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` *(registre)*

| | |
|---|---|
| **QUESTION** | Un ou plusieurs projets Vercel / Supabase « Preview » existent-ils déjà côté plateformes réelles ? |
| **OPTIONS** | (a) aucun n'existe : provisionner à neuf — (b) un ou plusieurs existent : les inventorier avant toute action |
| **CONSÉQUENCE** | Aucun identifiant (project ref, domaine, variable déjà posée) n'est versionné dans ce dépôt : personne ne peut le constater depuis un bac à sable. Provisionner à neuf alors qu'un projet existe crée un doublon avec des données divergentes ; supposer qu'il existe alors que non fait échouer toute la séquence. **C'est la première action de tout go-live, et rien de distant ne peut démarrer avant.** |
| **DEFAULT ACTUEL** | Aucun. La séquence est simplement à l'arrêt. |
| **BLOCKS PILOT ?** | **OUI** |
| **BLOCKS PAID CLIENT ?** | **OUI** |
| **BLOCKS SELF-SERVICE ?** | **OUI** |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** |

---

### P0-2 — Projet Supabase dédié pour Studio, ou projet partagé

`DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` *(registre)*

| | |
|---|---|
| **QUESTION** | Studio rejoint-il le projet Supabase partagé (GP / Colors / Tools / Réserves) ou reçoit-il son propre projet dédié ? |
| **OPTIONS** | (a) projet dédié — et alors porter `fix/studio-signup-closed-v1` (table `studio_signup_policy`, hook Auth `before_user_created`, garde applicative en profondeur), déjà écrit, non porté — (b) projet partagé, en réconciliant autrement la fermeture d'inscription au niveau Auth |
| **CONSÉQUENCE** | La garde de signup Studio n'existe qu'au niveau de l'action serveur Next.js. Un `POST /auth/v1/signup` direct avec la clé publique crée un compte **sans la traverser** ; la personne se connecte ensuite normalement et obtient un espace de travail complet — `createPersonalStudioWorkspace()` ne revérifie pas la politique. Le correctif réel présuppose un projet dédié. Tant que le choix n'est pas fait, **Studio ne doit être exposé ni publiquement ni à des pilotes externes**. |
| **DEFAULT ACTUEL** | Projet partagé de fait, garde applicative fail-closed **mais contournable**. Le défaut dangereux (ouvert par défaut) est fermé ; le contournement architectural reste ouvert. |
| **BLOCKS PILOT ?** | **OUI** — pour Studio uniquement. Non bloquant pour GP, Colors, Tools, Réserves. |
| **BLOCKS PAID CLIENT ?** | **OUI** — pour Studio |
| **BLOCKS SELF-SERVICE ?** | **OUI** — le self-service *est* l'inscription ouverte |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** — pour Studio |

---

### P0-3 — Hébergeur du worker vidéo Studio

`DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER` *(registre)*

| | |
|---|---|
| **QUESTION** | Quel hébergeur de conteneurs à processus long pour `workers/studio-video` (Fly.io, Railway, Render, ECS/Fargate, Cloud Run, VM + systemd…) ? |
| **OPTIONS** | (a) choisir un hébergeur maintenant — (b) exclure le rendu vidéo Studio du périmètre de la première Preview |
| **CONSÉQUENCE** | Ce n'est pas une fonction serverless Vercel : il faut un hôte conteneur durable. Le `Dockerfile` livré est volontairement agnostique, le dépôt n'impose et ne suggère aucun fournisseur. La décision commande aussi le provisionnement de `STUDIO_REDIS_URL` (file de rendu) et conditionne `e2e-gate.mjs`, jamais exécuté avec Postgres et Redis réels. Sans elle, **le rendu vidéo n'a aucun runtime** — la fonction centrale de Studio ne tourne nulle part. |
| **DEFAULT ACTUEL** | Aucun. `docker build` n'a jamais été exécuté. |
| **BLOCKS PILOT ?** | **OUI** — pour Studio. Option (b) le débloque en réduisant le périmètre. |
| **BLOCKS PAID CLIENT ?** | **OUI** — pour Studio |
| **BLOCKS SELF-SERVICE ?** | **OUI** — pour Studio |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** — pour Studio |

---

### P1-4 — Garde `check-env-manifest` bloquante au build

`D-PREFLIGHT` *(prose — non enregistrée au registre)*

| | |
|---|---|
| **QUESTION** | Faire passer `scripts/check-env-manifest.mjs` en mode bloquant sur le build Vercel, ou le laisser en mode rapport ? |
| **OPTIONS** | (a) bloquant : un build s'arrête sur une variable manquante ou incohérente — (b) conserver le mode rapport |
| **CONSÉQUENCE** | En mode rapport, **un build Vercel ne serait pas arrêté par une variable manquante** : l'application partirait en Preview ou en Production silencieusement mal configurée. Colors a déjà sa propre garde bloquante (`verify-public-env.mjs`, 5 variables) et n'est donc pas concerné ; GP, Tools, Réserves et Studio n'ont aucun équivalent. Passer en bloquant impose de poser toutes les variables **avant** le premier déploiement, sous peine d'un premier build rouge. |
| **DEFAULT ACTUEL** | Mode rapport, non bloquant. Fail-open. |
| **BLOCKS PILOT ?** | Non — mitigeable par une vérification manuelle des gabarits |
| **BLOCKS PAID CLIENT ?** | Non |
| **BLOCKS SELF-SERVICE ?** | Non |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** — un déploiement public silencieusement mal configuré n'est pas acceptable |

---

### P1-5 — Repli `localhost` des invitations Réserves

`DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED` *(registre)*

| | |
|---|---|
| **QUESTION** | `apps/reserves/src/lib/invitations.ts` et `app/layout.tsx` retombent silencieusement sur `http://localhost:3020` quand `NEXT_PUBLIC_RESERVES_URL` est absente. Faut-il aligner ce comportement sur celui de Colors et Studio, qui échouent explicitement ? |
| **OPTIONS** | (a) échec explicite à l'absence de la variable — (b) conserver le repli `localhost` |
| **CONSÉQUENCE** | Un oubli de la variable en Preview ou en Production envoie **des liens d'invitation inaccessibles à de vrais destinataires**, sans faire échouer le build. C'est le seul des cinq replis cartographiés qui touche le contenu réel d'un e-mail envoyé, et non une métadonnée SEO. Le correctif modifierait une fonction déjà testée et utilisée en Production — d'où le refus délibéré de le porter sans arbitrage. |
| **DEFAULT ACTUEL** | Repli `localhost:3020` conservé. Mitigation opérationnelle : la variable figure dans le gabarit Preview livré. |
| **BLOCKS PILOT ?** | Non — si la variable est posée, ce qui est documenté |
| **BLOCKS PAID CLIENT ?** | Non |
| **BLOCKS SELF-SERVICE ?** | **OUI** — le self-service repose sur l'invitation, et personne ne vérifiera la variable à sa place |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** |

---

### P1-6 — Classification RGPD RETAIN / DELETE et durée de rétention

`LEGAL_DECISION_REQUIRED` n°1 et n°5 *(prose — non enregistrées au registre)*

| | |
|---|---|
| **QUESTION** | Quelle est la liste exacte des tables « RETAIN », la durée de rétention comptable exacte, et faut-il une fonction d'anonymisation au niveau `clients` (personne physique cliente), qui n'existe aujourd'hui pas du tout ? |
| **OPTIONS** | (a) valider la classification technique proposée au §7 du rapport RGPD, telle quelle — (b) la corriger table par table — (c) la restreindre à un premier périmètre et différer le reste |
| **CONSÉQUENCE** | La classification versionnée est **une proposition technique, pas un avis juridique**, et le rapport le dit explicitement. L'infrastructure de purge par entreprise est écrite et testée unitairement, mais **elle ne peut pas être activée sans cette liste** : une purge trop large détruit des pièces comptables, une purge trop étroite ne tient pas la promesse faite aux personnes. Les mentions légales publiées annoncent déjà une purge à 30 jours qui n'a **aucun job d'exécution en production**. |
| **DEFAULT ACTUEL** | Fail-closed **dans le sens de la conservation** : sans consigne, rien n'est détruit. Sûr pour les données, faux vis-à-vis du texte publié. |
| **BLOCKS PILOT ?** | Non — un pilote court ne déclenche aucune purge |
| **BLOCKS PAID CLIENT ?** | **OUI** — un contrat client engage la durée de rétention |
| **BLOCKS SELF-SERVICE ?** | **OUI** |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** — écart entre le texte légal publié et le comportement réel |

---

### P1-7 — GPS et photos de pointage à l'anonymisation d'un salarié

`LEGAL_DECISION_REQUIRED` n°2 et n°3 *(prose — non enregistrées au registre)*

| | |
|---|---|
| **QUESTION** | À l'anonymisation d'un salarié, faut-il purger les coordonnées GPS et les photos de pointage terrain (`sessions_pointage`, bucket `pointage-preuves` — visage + géolocalisation), ou les conserver comme preuve horaire ? Et faut-il pseudonymiser `utilisateur_id` dans `journal_activite` après purge ? |
| **OPTIONS** | (a) purger à l'anonymisation — (b) conserver comme preuve horaire, en le documentant — (c) conserver avec une durée bornée |
| **CONSÉQUENCE** | `anonymiser_employe` **ne touche aujourd'hui ni le GPS ni les photos de pointage**. L'historique de localisation et le visage d'un salarié anonymisé restent consultables et rattachables. Conserver protège en cas de litige prud'homal ; purger protège la personne. Le rapport refuse explicitement de trancher : ce n'est pas un arbitrage technique. `journal_activite` est par ailleurs append-only par conception (intégrité d'audit), ce qui rend la pseudonymisation structurante et non cosmétique. |
| **DEFAULT ACTUEL** | Conservation. Rien n'est purgé. |
| **BLOCKS PILOT ?** | Non |
| **BLOCKS PAID CLIENT ?** | **OUI** — dès le premier vrai salarié d'un vrai client |
| **BLOCKS SELF-SERVICE ?** | **OUI** |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** |

---

### P1-8 — Tâches planifiées : fail-open ou fail-closed

`DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN` *(registre)*

| | |
|---|---|
| **QUESTION** | Passer `FEATURE_CRONS_ENABLED` en fail-closed (valeur `true` exigée) ? |
| **OPTIONS** | (a) fail-closed, avec pose préalable de la variable en production — (b) conserver le fail-open, justifié |
| **CONSÉQUENCE** | En fail-open, une variable absente laisse les tâches planifiées s'exécuter — y compris dans un environnement où elles ne devraient pas (un Preview qui enverrait de vraies relances). En fail-closed, la production doit poser la variable **avant** le déploiement, faute de quoi les tâches planifiées s'arrêtent silencieusement. Les deux erreurs sont réelles, dans deux directions opposées. |
| **DEFAULT ACTUEL** | Fail-open. Comportement non modifié. |
| **BLOCKS PILOT ?** | Non |
| **BLOCKS PAID CLIENT ?** | Non |
| **BLOCKS SELF-SERVICE ?** | Non |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** — un Preview qui déclenche de vraies relances sur de vraies adresses est un incident |

---

### P2-9 — Grille tarifaire Stripe

`DECISION_REQUIRED:STRIPE-MODULE-PRICE-MODEL` + `STRIPE-SUPPLEMENTARY-ACCOUNTS` + `STRIPE-IA-OPTIONS` + `STRIPE-LEGACY-GENERATIONS` + `STRIPE-STORAGE-BLOCK` *(registre — 5 entrées liées)*

| | |
|---|---|
| **QUESTION** | Quatre arbitrages indissociables : (1) le prix d'un module dépend-il du forfait de départ (jusqu'à 40 variables) ou est-il unique par module et période (10 variables) ? (2) les comptes supplémentaires se facturent-ils par plan ou par rôle 5/9/15/0 ? (3) les paliers IA 100/300/illimité sont-ils remplacés par le pack ponctuel + IA intensive V4, et quand retirer les anciens ? (4) le bloc de stockage est-il un produit vendable ? Plus : quand retirer les Price IDs des offres historiques ? |
| **OPTIONS** | (1) plat / par forfait — (2) par plan / par rôle V4 — (3) V4 seule / cohabitation temporaire — (4) oui / non — (5) après épuisement des abonnements / date fixe |
| **CONSÉQUENCE** | Ces choix déterminent **combien de variables Stripe créer** : 10 ou 40. Le CI les signale à chaque exécution. Tant qu'ils ne sont pas tranchés, aucune variable de bloc de stockage n'est créée, et `verify:stripe-prices` ne peut pas être confronté à un vrai compte Stripe test. **Blocage technique limité** : le runtime actuel fonctionne sur le contrat existant ; c'est la facturation réelle qui est en attente, pas le produit. |
| **DEFAULT ACTUEL** | Contrat runtime en vigueur (10 variables) ; catalogue V3 et grille V4 coexistent dans le manifeste sans arbitrage. |
| **BLOCKS PILOT ?** | Non — un pilote ne facture pas |
| **BLOCKS PAID CLIENT ?** | **OUI** — on ne facture pas sans grille |
| **BLOCKS SELF-SERVICE ?** | **OUI** |
| **BLOCKS PUBLIC PRODUCTION ?** | **OUI** |

---

### P2-10 — Colors : nuancier sous licence et lecture d'étiquette

Conditions P4 et P5 de `ELSATIA-COLORS-COMMERCIAL-READINESS-V1` §10 *(prose — non enregistrées au registre)*

| | |
|---|---|
| **QUESTION** | Faut-il acquérir un nuancier fabricant sous licence, ou renoncer et n'offrir que le RAL ? Et faut-il activer la lecture d'étiquette (OCR), qui suppose un contrat de sous-traitance, une base légale et l'information des personnes ? |
| **OPTIONS** | (a) licencier un nuancier fabricant — (b) renoncer, de façon assumée et documentée — (c) activer l'OCR après contractualisation — (d) le laisser inactif |
| **CONSÉQUENCE** | Sans fichier de nuancier chargé, **aucune référence fabricant n'est proposée** : le produit reste cohérent mais la correspondance de teinte se limite au RAL. Il faut le savoir avant de présenter le produit, pas pendant une démonstration. L'OCR est inactif par refus délibéré : envoyer la photo d'un chantier à un tiers est un transfert de données vers un sous-traitant. Activer suppose les trois éléments, et rien d'autre ne manque techniquement — la RPC de confirmation humaine, la garde de build et la politique sont déjà écrites et testées. |
| **DEFAULT ACTUEL** | Fail-closed dans les deux cas : aucun nuancier fabricant chargé, OCR inactif, aucune image ne quitte l'infrastructure ELSATIA. |
| **BLOCKS PILOT ?** | Non — le fail-closed est démontrable et honnête |
| **BLOCKS PAID CLIENT ?** | Non — dégrade l'offre sans la bloquer |
| **BLOCKS SELF-SERVICE ?** | Non |
| **BLOCKS PUBLIC PRODUCTION ?** | Non — mais **rend la promesse commerciale plus étroite** qu'annoncé |

---

## 2. Lecture transversale

| Décision | P | PILOT | PAID | SELF-SVC | PUBLIC PROD |
|---|---|---|---|---|---|
| P0-1 Inventaire Preview | **P0** | ✖ | ✖ | ✖ | ✖ |
| P0-2 Supabase dédié Studio | **P0** | ✖ Studio | ✖ Studio | ✖ Studio | ✖ Studio |
| P0-3 Hébergeur worker vidéo | **P0** | ✖ Studio | ✖ Studio | ✖ Studio | ✖ Studio |
| P1-4 Garde env bloquante | P1 | — | — | — | ✖ |
| P1-5 Repli URL Réserves | P1 | — | — | ✖ | ✖ |
| P1-6 Classification RGPD | P1 | — | ✖ | ✖ | ✖ |
| P1-7 GPS / photos pointage | P1 | — | ✖ | ✖ | ✖ |
| P1-8 Crons fail-open | P1 | — | — | — | ✖ |
| P2-9 Grille Stripe | P2 | — | ✖ | ✖ | ✖ |
| P2-10 Nuancier / OCR Colors | P2 | — | — | — | — |

Trois constats.

**Une seule décision bloque tout, pour toutes les applications** : P0-1. Les deux autres P0 ne
concernent que Studio — GP, Colors, Tools et Réserves peuvent avancer vers un pilote sans
qu'elles soient tranchées.

**Aucune décision ne bloque un pilote hors Studio.** Ce qui reste devant un pilote GP/Colors/
Tools/Réserves est du travail d'environnement, pas de l'arbitrage. Ce qui compte pour la suite
de la mission : une décision non prise n'est pas ce qui retient Colors.

**Six des dix décisions ne sont pas enregistrées dans `config/env-manifest.json`** : P1-4,
P1-6, P1-7, P2-10 et les conditions Colors. Elles n'existent qu'en prose, donc aucun contrôle
CI ne les signale, et elles disparaîtront du champ de vision au prochain rapport qui ne les
recopiera pas. Les quatre entrées du registre, elles, sont rappelées à chaque exécution.

---

*Aucun code n'a été modifié, aucune branche fusionnée. Seul ce rapport a été ajouté.*
