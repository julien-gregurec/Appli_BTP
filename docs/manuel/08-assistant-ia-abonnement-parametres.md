# Chapitre 8 — Assistant IA, abonnement et paramètres

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

Ce chapitre couvre trois parties distinctes de l'application : l'assistant intelligence artificielle (A), la gestion de l'abonnement (B), et les paramètres de l'entreprise (C).

### Objectif

Permettre d'utiliser l'assistant IA dans ses usages validés avec un regard critique sur ses réponses, de comprendre l'état de son abonnement, et de configurer les paramètres de l'entreprise qui concernent réellement le client.

### Utilisateurs concernés

- **A. Assistant IA** : tout utilisateur disposant de la permission d'accès à l'IA, dans la limite de son offre.
- **B. Abonnement** : dirigeant ou personne disposant de la permission de gestion des paramètres.
- **C. Paramètres** : dirigeant ou gestionnaire habilité selon le paramètre concerné.

### Permissions nécessaires

- `acces_ia` — utiliser l'assistant IA et les fonctionnalités IA associées (devis, documents, dictée, messagerie, rentabilité)
- `gerer_parametres` — gérer l'abonnement et les paramètres de l'entreprise
- `acces_parametres` — consulter les paramètres de l'entreprise
- `gerer_utilisateurs` — matrice des droits par poste, import de données

### Procédure

**A. Assistant IA**
1. Ouvrir l'assistant IA depuis l'écran où il est proposé (il est intégré à plusieurs endroits de l'application : devis, documents, rentabilité, messagerie, dictée vocale — pas dans un module unique séparé).
2. Saisir sa demande en langage naturel.
3. Vous pouvez joindre une photo ou un document PDF jusqu'à 6 Mo à votre demande. Formats acceptés : JPEG, PNG, GIF, WebP, PDF.
4. L'assistant répond ou propose une action ; **toute action ayant un effet réel sur les données (créer, modifier, envoyer) doit être validée explicitement par l'utilisateur** — l'assistant ne doit jamais agir seul sur les données métier sans confirmation humaine.
5. L'usage de l'assistant est soumis à une limite quotidienne d'appels par entreprise, propre à l'offre souscrite (voir « Limites connues »).

**B. Abonnement**
1. Depuis l'écran Abonnement, consulter le statut courant (essai, actif, suspendu, etc.) et l'offre souscrite.
2. Si l'entreprise est en période d'essai, l'échéance de fin d'essai est affichée.
3. Un changement d'offre ou de périodicité (mensuelle/annuelle) peut être initié depuis cet écran.
4. Une fois un abonnement actif souscrit, un portail sécurisé (fourni par le prestataire de paiement) permet de gérer le moyen de paiement, télécharger les factures et gérer la résiliation.
5. En cas d'impayé, l'accès peut être suspendu ; un écran dédié explique la situation et propose d'accéder au portail de paiement pour régulariser.

**C. Paramètres**
1. Depuis Paramètres, un dirigeant renseigne les informations de l'entreprise, les horaires de travail utilisés pour le calcul des heures, et peut activer le suivi de zone chantier (voir chapitre 4) avec sa fréquence.
2. La matrice des droits par poste définit précisément qui peut faire quoi dans l'application — c'est le réglage central des permissions évoquées dans ce manuel.
3. Les préférences de notifications (dont les notifications push) se règlent depuis un écran dédié.
4. Un import de données (migration depuis un autre logiciel) est disponible pour les entreprises qui démarrent avec des données existantes.
5. Un écran dédié permet l'export ou la suppression des données de l'entreprise (démarche RGPD).

### Résultat attendu

L'utilisateur obtient une réponse ou une proposition de l'assistant IA qu'il valide lui-même avant toute action réelle ; le statut de l'abonnement est clair et compréhensible ; les paramètres utiles au client (horaires, droits, notifications, import, RGPD) sont configurés.

### Erreurs fréquentes

**A. Assistant IA**
- Message indiquant qu'une limite quotidienne d'appels est atteinte : l'entreprise a dépassé le nombre d'appels inclus dans son palier pour la journée — inviter à réessayer le lendemain ou à revoir le palier depuis l'abonnement, jamais à contourner la limite.
- Réponse refusée ou absente sans explication claire : peut correspondre à une limite de fréquence à court terme (trop d'appels en peu de temps) — voir « Limites connues » sur le blocage temporaire 429.

**B. Abonnement**
- Bouton de changement d'offre inactif : le paiement en ligne n'est peut-être pas encore configuré pour l'entreprise — ne pas présenter ceci comme un défaut si la configuration est en cours côté éditeur.
- Portail de gestion inaccessible : nécessite un abonnement déjà actif avec un moyen de paiement enregistré.

**C. Paramètres**
- Modification de paramètres refusée : vérifier la permission `gerer_parametres`, distincte du simple accès en lecture (`acces_parametres`).

### Limites connues

- **L'IA peut se tromper.** Ses réponses et propositions doivent toujours être vérifiées par une personne avant d'être considérées comme fiables, en particulier sur des sujets chiffrés ou réglementaires.
- **L'assistant ne remplace jamais une décision humaine** : il ne doit jamais être présenté comme prenant une décision finale à la place de l'utilisateur.
- **Ne pas transmettre à l'assistant des données sensibles sans nécessité réelle** — même si l'isolation par entreprise est assurée côté application, la prudence sur ce qui est partagé avec un service d'IA externe reste une bonne pratique à rappeler à l'utilisateur.
- **Un blocage temporaire (réponse technique « trop de requêtes ») peut survenir** en cas d'appels très rapprochés à l'assistant — reprendre l'usage après une courte attente plutôt que d'insister.
- Les fonctions IA dépendent à la fois des permissions du poste et de l'offre souscrite par l'entreprise.
- **Les prix et paliers de l'offre IA ne sont pas définitifs** et ne doivent pas être annoncés dans le manuel tant qu'ils ne sont pas confirmés commercialement.
- **Les paiements réels doivent être validés avant toute publication** du manuel : ce chapitre décrit le fonctionnement prévu de l'écran d'abonnement, pas une garantie que chaque paiement aboutit correctement en conditions réelles.
- Les paramètres décrits ici sont ceux utiles au client. Les réglages internes réservés à l'équipe éditrice (back-office, page technique de version, secrets, clés d'intégration) ne font pas partie de ce chapitre et ne doivent jamais être exposés dans le manuel client.

### Fonctions non documentées comme finalisées dans ce chapitre

- Automatisations IA non validées, actions autonomes de l'assistant sans confirmation humaine.
- Facturation automatique des paliers IA (mécanique construite, mais dépendante de la configuration tarifaire finale côté paiement).
- Fonctions IA futures ou expérimentales, prompts internes et détails techniques de fonctionnement de l'assistant — ces éléments restent confidentiels et hors du manuel client.
- Paramètres réservés à la plateforme interne de l'éditeur, secrets, clés d'intégration, page technique de version.

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/api/assistant/chat/route.ts`, `src/lib/ai/journal.ts` (plafond quotidien par palier), `src/app/(app)/abonnement/page.tsx`, `src/app/(app)/parametres/page.tsx`. Le blocage temporaire (429) sur l'assistant IA est confirmé par lecture directe de `release/commercialisation-v1` (comparaison documentée le 31 juillet 2026), pas encore présent sur `main`. Le comportement réel de Stripe (paiement, portail, gestion d'impayé) n'a pas été vérifié en exécution — validation manuelle requise avant publication.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code. Validation manuelle encore requise, en particulier pour : le statut réel de la configuration Stripe en production, les prix et offres définitifs, le comportement exact en cas d'impayé, les permissions précises de chaque paramètre sensible.

**Pièces jointes de l'assistant IA — vérifiées et validées** sur `release/commercialisation-v1` : la formulation et les formats acceptés documentés ci-dessus sont confirmés par tests unitaires (`src/lib/ai/validation.test.ts`), tests d'intégration (`src/app/api/assistant/chat/route.test.ts`) et tests Playwright en navigateur réel (`tests/e2e/security.spec.ts`, exécutés en environnement isolé). Le point précédemment signalé (incohérence entre le plafond générique de requête et la limite de pièce jointe) est résolu — voir `docs/audits/phase-3-addendum-regression-assistant-ia.md`.
