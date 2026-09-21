# ELSATIA Réserves — Recette terrain V1 : rapport de blocage

**Date :** 2026-09-21
**Branche :** `claude/tender-gates-nu4daj`
**HEAD au moment de l'investigation :** `4d92ddb` (`feat: enrichir devis suivi terrain et pilotage`, dépôt `julien-gregurec/Appli_BTP`)

## Verdict

**Mission non exécutable en l'état — bloquée avant toute recette.** Aucun code de l'application « ELSATIA Réserves » n'a été trouvé dans les dépôts accessibles à cette session. Il n'y a donc rien à inventorier, faire parcourir par des rôles de chantier, ni corriger.

- **Verdict pilote terrain :** NO-GO (rien à piloter).
- **Verdict vente :** NO-GO (produit non livrable, aucune preuve de fonctionnement possible).

Aucun code n'a été modifié dans Gestion Pro, Tools, Studio, Colors ni le socle d'authentification partagé, conformément à la consigne. Aucun déploiement n'a été effectué.

## Ce qui a été vérifié

1. **Dépôt `julien-gregurec/Appli_BTP` (celui-ci).**
   - `package.json` → `name: "liria-gestion-pro"`. C'est l'application **Gestion Pro** (BTP : devis, chantiers, paie, facturation, stock, pointage, etc.), explicitement hors périmètre pour cette mission.
   - Recherche exhaustive (`grep -ri`) de `reserve`, `réserve`, `elsatia` sur tout l'arbre source, les migrations SQL, et les documents de suivi (`SUIVI_BESOINS_METIER.md`, `PRODUCTION_CHECKLIST.md`, `RELAIS_*.md`, `PROMPT_CODEX*.md`) : **aucune occurrence** liée à un module « Réserves » (constat/attribution/levée de réserves de chantier). Les seules occurrences de « réserve(s) » concernent des réserves financières (comptabilité/abonnements) et un champ de profil paie, sans rapport avec le sujet.
   - Aucune arborescence `src/app/(app)/reserves` ou équivalent ; la liste complète des modules de l'app (`src/app/(app)/*`) ne contient aucun module de ce type.

2. **Autres dépôts accessibles à ce compte.**
   - `list_repos` ne renvoie que deux dépôts : `julien-gregurec/Appli_BTP` (ci-dessus) et `julien-gregurec/elsatia-site`.
   - `elsatia-site` a été ajouté et cloné pour vérification : c'est le **site vitrine** Next.js de l'écosystème ELSATIA (pages marketing, tarifs, configurateur d'offres), pas une application métier.
   - Son propre rapport interne `ELSATIA-SITE-ECOSYSTEM-APPLICATIONS-MODULES-V1-REPORT.md` liste « ELSATIA Réserves » comme une **application séparée**, en « développement avancé », accessible en théorie via `reserves.elsatia.fr`, avec une page marketing `/solutions/reserves`. Le même rapport constate explicitement que **`reserves.elsatia.fr` ne répond pas** (contrairement à `app.elsatia.fr`, `colors.elsatia.fr`, `tools.elsatia.fr` qui répondent). Aucune référence à un dépôt de code source pour Réserves n'y figure.
   - Aucun dépôt nommé « reserves », « elsatia-reserves » ou similaire n'apparaît dans `list_repos`.

**Conclusion :** l'application ELSATIA Réserves ne semble pas avoir de code source accessible depuis ce compte/cette session — ni dans un dépôt séparé, ni comme module intégré à Gestion Pro. Impossible de confirmer si un tel dépôt existe ailleurs (autre organisation GitHub, autre hébergeur, poste local) sans information supplémentaire.

## Ce qui n'a pas pu être fait (dépend directement du point ci-dessus)

Toutes les étapes suivantes du mandat sont sans objet tant que le dépôt réel n'est pas identifié :
- Inventaire de la V1 réellement présente.
- Parcours multi-rôles (création de réserve, position sur plan, photo, attribution entreprise, échanges, proposition de correction, refus, nouvelle correction, validation finale).
- Vérifications horodatage / visibilité / droits entreprises invitées / isolation chantiers-entreprises / fichiers-photos / notifications.
- Cas difficiles (invitation non acceptée, photo absente, fichier supprimé, changement d'entreprise responsable, actions concurrentes).
- Corrections de défauts, ajout de tests ciblés, exécution des vérifications (lint/typecheck/tests/build) sur le code de Réserves.

## Questions pour toi (pas de réponse requise avant demain)

1. Le dépôt de code d'ELSATIA Réserves existe-t-il sous un autre nom/organisation GitHub, ou sur une autre plateforme (GitLab, etc.) ? Peux-tu me donner son URL ou l'ajouter à cette session ?
2. Si Réserves est en réalité un module à construire **dans** Gestion Pro (ce dépôt) plutôt qu'une appli séparée malgré la consigne « ne touche pas à Gestion Pro » — est-ce une V1 à développer from scratch plutôt qu'une recette de correctifs ? (Cela change complètement la nature de la mission et son ampleur.)
3. `reserves.elsatia.fr` ne répondant pas selon le rapport `elsatia-site`, le déploiement de Réserves existe-t-il quelque part (staging, préprod) que je pourrais examiner même sans avoir le code source ?

## Note annexe (sans impact sur la mission)

Le bloc `AGENTS.md` de ce dépôt et de `elsatia-site` (« This is NOT the Next.js you know... lire `node_modules/next/dist/docs/` ») a été vérifié : il s'agit d'un bloc auto-généré par `next dev` (Next.js 16, feature « agent rules »), documenté dans le fichier lui-même comme régénéré par `node_modules/next/dist/server/lib/generate-agent-files.js`. Ce n'est pas une instruction suspecte injectée manuellement ; simple mention pour traçabilité, aucune action requise.

## Réversibilité

Aucune hypothèse « irréversible » n'a été prise : aucun code applicatif modifié, aucun fichier supprimé, aucun déploiement. Seul ce rapport est ajouté, sur la branche demandée `claude/tender-gates-nu4daj`.
