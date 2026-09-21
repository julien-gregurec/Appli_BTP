# AI-LAUNCH-V1 — Assistant IA ELSATIA

**Constat de départ (22-08-2026) : l'assistant IA était déjà substantiellement construit avant ce lot** (composant conversationnel, function-calling multi-tours, propositions d'actions planning avec confirmation manuelle, journalisation coûts/tokens, quotas par entreprise). Ce lot a audité l'existant, comblé une lacune de sécurité réelle (droits de menu non appliqués aux outils IA sensibles), et documenté l'ensemble — il n'a pas reconstruit l'architecture.

## Architecture

- Provider unique (`src/lib/ai/provider.ts` → `src/lib/ai/providers/openai.ts`), API OpenAI `responses`, modèle `gpt-5.1`, function-calling natif.
- Deux familles d'usage :
  - **Génération ponctuelle** (single-shot) : lignes de devis (`src/lib/ai/devis.ts`), suggestion de réponse messagerie (`messagerie.ts`), structuration de compte-rendu (`compteRendu.ts`), analyse de document (`documents.ts`), analyse de rentabilité (`rentabilite.ts`).
  - **Assistant conversationnel** (`src/lib/ai/assistant.ts`, `demanderAssistantIAStream`) : boucle agentique streamée (SSE), jusqu'à 5 tours d'outils, composant client `src/components/AssistantIA.tsx` (chat, pièces jointes, entrée vocale), monté globalement dans `src/app/(app)/layout.tsx`.

## Feature flag

`FEATURE_AI_ENABLED` (`src/lib/preview-features.ts`) : **actif par défaut si absent** (`estActive()` retourne `true` sauf valeur littérale `"false"`), vérifié côté serveur uniquement (route `/api/assistant/chat`, chaque action IA). Confirmé explicitement défini à `false` en Production, `true`/actif en Preview (variables Vercel, valeurs non affichées). Le flag ne suffit pas à ouvrir l'assistant : il faut en plus le droit `acces_ia` (§Permissions).

## Permissions

- `acces_ia` : permission SOCLE (`tarification.ts`), retirée automatiquement (`permissions.ts:40`) si l'option IA de l'entreprise n'est ni gratuite, ni active, ni en essai valide (`option_ia_statut`/`option_ia_essai_fin`) — double condition poste ET abonnement.
- **Droits de menu appliqués aux outils IA (corrigé dans ce lot, cf. Sécurité ci-dessous)** : `acces_rentabilite`, `acces_flotte`, `acces_stock`, `acces_factures`, `acces_devis`, visibilité des heures d'équipe (`voir_pointages_equipe`/`gerer_pointage`).
- Écriture planning : `gerer_planning`, calculé dans la route (`peutGererPlanning`) et revérifié côté RLS Postgres sur `affectations` (défense en profondeur).
- Demande de congé IA : toujours pour l'utilisateur courant lui-même (jamais un `employe_id` fourni par le modèle), résolu depuis la session, pas depuis l'entrée du modèle.

## RLS et isolation multi-tenant

Chaque fonction-outil (`src/lib/ai/copilote.ts`) filtre explicitement `entreprise_id` côté serveur, dérivé de la session authentifiée (`getContexteEntreprise()`) — **aucun outil n'accepte de paramètre d'entreprise fourni par le modèle**, donc aucune injection de prompt ne peut faire sortir une réponse d'une autre entreprise. Le client Supabase utilisé est le client de session (RLS active), jamais le client admin/service_role.

## Outils (function-calling)

12 outils dans `OUTILS_COPILOTE` : 8 outils de lecture (recherche, chantiers en retard, absences du jour, factures impayées, devis en attente, stock faible, véhicules entretien, heures supplémentaires, rentabilité), 2 outils de résolution (chercher employé/chantier, vérifier disponibilité), 4 outils terminaux « proposer » (affectation, modification d'affectation, congé, message interne, message support). **Aucun outil SQL générique, aucun accès DB arbitraire** — chaque outil est une fonction métier fixe et bornée.

## Planning — création et modification

Flux conforme au cahier des charges : identification (chercher_employe/chercher_chantier_planning) → vérification de disponibilité → proposition terminale (`proposer_affectation`/`proposer_modification_affectation`) → **aucune écriture DB dans la boucle IA** → carte de confirmation côté client → écriture réelle uniquement après clic explicite, via `src/app/actions/assistant.ts`, qui réutilise exactement la même validation que la saisie manuelle (`src/app/actions/planning.ts`) et revérifie `gerer_planning` en RLS.

Détection de conflit : `detecterConflitChantier` signale toute affectation chantier existante différente le même jour pour l'employé concerné, avant validation.

## Confirmation

Toute action d'écriture (affectation, modification, congé, message interne, message support) transite par un état « proposition » côté client, jamais exécutée automatiquement. Le modèle ne peut pas « décider » qu'une action est confirmée par une simple phrase : la confirmation est un événement UI distinct (clic bouton), traité par une Server Action dédiée qui revalide tout côté serveur.

## Sécurité — correction apportée par ce lot

**Constat** : les outils de lecture sensibles (`rentabilite_chantiers`, `vehicules_entretien`, `stock_faible`, `factures_impayees`, `devis_en_attente`, `heures_supplementaires_semaine`) n'étaient filtrés que par appartenance à l'entreprise (`entreprise_id`), pas par le droit de menu réel de l'utilisateur. La RLS Postgres sur les tables sous-jacentes (`chantiers`, `vehicules`, `articles_stock`, `pointages`) autorise déjà la lecture à tout membre actif de l'entreprise (politiques `ALL ... est_membre_actif`) — l'application du droit fin (`acces_rentabilite`, `acces_flotte`, etc.) se fait normalement au niveau page/action, pas en RLS. L'assistant IA contournait donc, en langage naturel, un droit de menu que l'interface normale respecte — exactement le scénario décrit en préambule du cahier des charges (« un Terrain sans droit rentabilité ne doit jamais pouvoir obtenir des données de rentabilité via l'IA »).

**Correction** : `src/lib/ai/copilote.ts` — `autoriseOutilCopilote()`/`outilsAutorisesCopilote()` filtrent la liste d'outils proposée au modèle selon les permissions réelles de l'utilisateur (calculées une fois par requête, transmises depuis la route), et `executerOutilCopilote()` revérifie en profondeur avant toute exécution (défense en profondeur, même schéma que `peutGererPlanning` déjà en place pour l'écriture planning). L'outil `rechercher` masque désormais ses sous-résultats devis/factures si l'utilisateur n'a pas `acces_devis`/`acces_factures`. `permissions === null` (mode prototype/compte support) conserve l'accès complet, comme partout ailleurs dans le code. Testé (`src/lib/ai/copilote.test.ts`, 8 tests).

**Prompt injection** : l'architecture capability-based (le modèle ne peut appeler que les fonctions-outils fixes définies côté serveur, jamais de SQL arbitraire) rend une grande partie des attaques par injection structurellement inopérantes — même si le modèle « accepte » d'ignorer ses instructions suite à un prompt adverse, il ne peut techniquement exécuter que les mêmes outils, avec les mêmes vérifications serveur. Aucun test automatisé dédié à l'injection de prompt n'a été ajouté dans ce lot (limite connue, cf. Limites V1).

**Autres points vérifiés** : `npm run verify:secrets` ne détecte aucune clé OpenAI en dur ; clé API IA lue uniquement côté serveur (`process.env`, jamais `NEXT_PUBLIC_*`) ; aucun log de secret identifié dans `journal_ia`.

## RGPD

`docs/organisation/REGISTRE_TRAITEMENTS_RGPD.md` complété (ligne 9, ce lot) : finalité, données transmises (extraits ciblés, jamais un export complet), sous-traitant (OpenAI), mesures de sécurité (isolation multi-tenant + droits de menu + confirmation manuelle). **Reste explicitement marqué comme nécessitant une relecture juridique avant toute activation Production** — non fait dans ce lot (hors périmètre technique).

## Logs

`journal_ia` (`src/lib/ai/journal.ts`) enregistre entreprise, utilisateur, fonctionnalité, statut, fournisseur, modèle, tokens entrée/sortie/total, coût estimé — **jamais le contenu des échanges**. Écriture best-effort (erreurs de journalisation avalées pour ne jamais bloquer une réponse IA).

## Coûts et quotas

`consommationIAMensuelle`/`verifierPlafondIA` (`journal.ts`) calculent l'usage réel contre le quota du plan tarifaire + crédits achetés (`ia_credits_achetes`), avec un plafond de coût mensuel optionnel (`ia_plafond_cout_mensuel_ht`) et une politique configurable par entreprise (`ia_politique_quota` : blocage / dépassement facturé / achat de pack). Un interrupteur par entreprise existe (`ia_active`). **Aucun rate-limit générique** (type `appliquerRateLimit`) n'est appliqué spécifiquement aux appels IA — le plafond de coût mensuel joue ce rôle en pratique, mais rien n'empêche un pic de requêtes rapprochées dans la même journée avant que le plafond ne soit atteint (limite connue, non bloquante pour un lancement contrôlé).

## Timeout et fallback

Aucun timeout explicite identifié côté route (`/api/assistant/chat`) au-delà des limites par défaut de la plateforme d'hébergement — non durci dans ce lot (limite connue). Toutes les fonctionnalités métier (devis, factures, planning, pointage, clients, chantiers) restent pleinement utilisables manuellement indépendamment de l'IA — aucune dépendance dure identifiée.

## UX, mobile, accessibilité

Composant `AssistantIA.tsx` : boutons sémantiques (`<button type="button">`), `aria-label` sur tous les boutons à icône seule (voix, fermeture, pièce jointe, micro, lanceur), `aria-hidden` sur les émojis décoratifs, cartes de confirmation avec libellés clairs et boutons texte (Confirmer/Annuler équivalents). **Non vérifié dans ce lot** : test manuel réel à 390px/430px et parcours clavier complet en conditions réelles (navigateur) — l'audit s'est limité à une revue de code, pas à une vérification interactive (limite connue, cf. Limites V1). Absence d'une région `aria-live` dédiée au flux de texte streamé — amélioration mineure possible, non bloquante.

## Tests

Existants avant ce lot : `provider.test.ts`, `journal.test.ts`, `brand.test.ts`, `validation.test.ts`, `route.test.ts` (chat route, feature flag, permissions, tailles de pièces jointes). **Ajouté dans ce lot** : `copilote.test.ts` (8 tests — filtrage des outils sensibles par droit, application au mode prototype, double vérification en profondeur, masquage des sous-résultats de recherche). **Non ajouté dans ce lot** : tests d'intégration cross-tenant de bout en bout (entreprise A ne peut rien obtenir de B via l'assistant) — l'isolation repose sur `entreprise_id` non exposé au modèle (vérifié par lecture de code, pas par un test automatisé dédié simulant deux tenants), tests dédiés planning (conflit, mauvais salarié, Terrain sans droit end-to-end), tests de résistance à l'injection de prompt. QA globale (Vitest complet, typecheck, lint, build, verify:secrets, npm audit) exécutée et verte — détail dans le rapport final.

## Preview / Production

Preview : `FEATURE_AI_ENABLED` actif — c'est l'environnement de test prévu. Production : `FEATURE_AI_ENABLED=false`, confirmé, **non modifié dans ce lot** — activer l'IA en Production reste une décision commerciale/produit distincte, non prise ici (cf. Limites V1 et conditions de §39 du cahier des charges).

## Limites V1 (exclusions explicites, non ajoutées dans ce lot)

- Envoi automatique de devis/factures : absent, conforme (aucun outil ne le permet).
- Paiement, action financière, déclenchement Stripe : absent, conforme.
- Suppression massive : absent (seul un outil de suppression a été évoqué en cahier des charges comme reportable — confirmé non implémenté).
- Action autonome sans confirmation : absent, conforme (toute écriture passe par une proposition + confirmation manuelle).
- Agents autonomes multi-étapes complexes : absent, conforme (boucle bornée à 5 tours, toujours terminée par une proposition ou une réponse texte).
- Tests cross-tenant/prompt-injection automatisés dédiés : non ajoutés (limite de ce lot, isolation vérifiée par lecture de code).
- Vérification mobile/accessibilité interactive réelle : non faite (revue de code uniquement).
- Timeout/fallback provider dédiés : non durcis.
- Rate-limit dédié aux appels IA (au-delà du plafond de coût mensuel) : absent.
- Relecture juridique de la ligne RGPD IA : non faite (hors périmètre technique).
