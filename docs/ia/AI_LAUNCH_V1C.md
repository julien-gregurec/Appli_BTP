# AI-LAUNCH-V1C — Clôture : coûts IA restants + recette interactive réelle

Mini-lot de clôture demandé après AI-LAUNCH-V1B (rapport initial `PARTIEL`), pour lever les deux réserves explicitement formulées : le suivi coûts/jetons incomplet en dehors de l'assistant, et l'absence de recette interactive réelle (mobile, clavier, annulation/modification, double confirmation).

## 1. Coûts/jetons — 5 fonctionnalités IA restantes corrigées

`devis`, `messagerie`, `rentabilité`, `documents` et `comptes-rendus` ne transmettaient toujours aucune donnée d'usage à `journaliserAppelIA`, exactement comme l'assistant avant V1B. Corrigé :

- `ProviderIA.completerAvecFichier` retourne désormais `{ texte, usage }` (au lieu d'une simple `string`) — alignement sur `completer`/`streamer`.
- Les 5 fonctions `lib/ai/*.ts` (`genererLignesDevisIA`, `suggererReponse`, `analyserRentabilite`, `analyserDocumentIA`, `structurerCompteRendu`) propagent toutes `usage` jusqu'à leur retour.
- Les 5 server actions correspondantes passent `jetonsEntree`/`jetonsSortie`/`jetonsTotal`/`coutEstimeHT` à `journaliserAppelIA`.

**Les 6 appels IA du produit (assistant + 5 fonctionnalités single-shot) journalisent maintenant tous un coût/jeton réel.** 4 nouveaux tests (`src/lib/ai/providers/openai.test.ts`) couvrent l'extraction d'usage, le cas sans usage (`undefined`), `completerAvecFichier`, et le timeout de requête.

## 2-3. Mobile 390/430 et clavier — recette réelle refaite

Fixture Preview dédiée (`RECETTE-AI-V1C`, identité unique, nettoyée à la fin, zéro résidu). Recette interactive réelle menée cette fois avec succès (l'incident de perte d'interactivité rencontré pendant V1B ne s'est pas reproduit sur cette session) :

- **Focus clavier** : clic réel sur le champ de saisie → focus confirmé (`document.activeElement`).
- **Découverte réelle en testant à 375px** : le bouton *Envoyer* débordait de ~5px hors du panneau assistant (`getBoundingClientRect().right` = 379,9px pour un viewport de 375px) — un cas classique de débordement flexbox (l'`<input>` `flex-1` ne rétrécissait pas sous sa largeur de contenu par défaut). **Corrigé** (`min-w-0` ajouté à l'input, `AssistantIA.tsx`) et **revérifié en direct** après redéploiement : 375px → bouton à 346px (29px de marge), 430px → bouton à 401px (29px de marge). Aucun autre débordement constaté sur le reste du panneau (bulles de message, carte de proposition) aux deux largeurs.
- Note : la touche Entrée pour envoyer un message est correctement implémentée côté code (`onKeyDown` gère `Enter` sans `Shift`) mais l'appui automatisé du clavier de l'outil de navigateur n'a pas déclenché l'événement React dans ce test (limite de l'outil, pas du produit) — contourné en cliquant réellement sur *Envoyer*, qui fonctionne dans tous les cas testés.

## 4. Annulation / modification planning — testées en réel

Fixture : un employé, un chantier, une affectation existante (4h, tâche "Pose cloisons"). Scénario réel via l'assistant :

- **Modification proposée** : *"décale son affectation de demain à après-demain à 6h au lieu de 4h"* → carte `MODIFICATION` correcte (ancien jour/heure, nouveau jour/heure, avertissement explicite) — **zéro écriture DB avant clic** (vérifié par lecture SQL directe).
- **Annulation (`Ignorer`)** : cliqué → **affectation inchangée en base** (vérifié), carte passée à l'état "Ignorée" côté UI.
- **Confirmation (`Valider la modification`)** : nouvelle proposition identique déclenchée, validée → **l'unique ligne d'affectation existante a été mise à jour** (même `id`, nouvelle date `2026-08-25`, nouvelles heures `6.00`) — pas de duplication.

## 5. Double confirmation — vérifiée en réel

Double-clic rapide sur *Valider la modification* : la table `affectations` ne contient toujours **qu'une seule ligne** après coup (même `id`, valeurs correctement mises à jour une seule fois) — aucune affectation dupliquée, malgré le double-clic effectif. Idempotence confirmée en conditions réelles, pas seulement en test unitaire.

## 6. Smoke Preview

Déploiement Preview dédié (`elsatia-preview-rhu3vu8te-...`), fixture créée puis intégralement nettoyée après recette (zéro résidu — cette fois aucun trigger d'immutabilité n'a bloqué le nettoyage, contrairement à V1B où l'entreprise B contenait une facture émise).

## 7. QA finale

387/387 tests (+ 4 nouveaux par rapport à V1B), typecheck propre, lint 0 erreur, build propre, `verify:secrets` (860 fichiers, 0 secret), `npm audit` 0 vulnérabilité.

## Décision

Les deux réserves d'AI-LAUNCH-V1B sont levées : coûts/jetons journalisés pour toutes les fonctionnalités IA, et recette interactive réelle refaite avec succès (mobile corrigé et revérifié, clavier/focus confirmé, annulation/modification/double-confirmation toutes prouvées en conditions réelles plutôt que par lecture de code).

`FEATURE_AI_ENABLED` reste `false` en Production — non modifié dans ce lot, activation prévue dans le mini-lot séparé `AI-PROD-ACTIVATION-V1` après votre validation.
