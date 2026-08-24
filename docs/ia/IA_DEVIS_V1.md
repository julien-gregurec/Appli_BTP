# IA-DEVIS-V1 — Génération assistée d'un brouillon de devis

**Statut Production : activé le 24-08-2026 (`FEATURE_AI_DEVIS_ENABLED=true` sur `app.elsatia.fr`) — voir [IA_DEVIS_PROD_ACTIVATION_V1.md](IA_DEVIS_PROD_ACTIVATION_V1.md) pour le détail de l'activation, la recette Production réelle et le schéma WORKFLOW-DEVIS-V1 rattrapé au passage.**

## Bugs réels découverts et corrigés en recette live

Trois défauts réels ont été découverts en testant le flux complet contre un
vrai appel OpenAI (pas seulement via les tests unitaires) — tous corrigés et
reconfirmés avant la clôture du lot :

1. **Aucune mémoire de la proposition entre deux tours** — `proposer_devis`
   étant un outil terminal, la boucle agentique retourne immédiatement sans
   jamais ajouter la proposition à l'historique renvoyé au modèle au tour
   suivant (seul le texte qui précède l'appel outil, souvent vide, était
   conservé côté client). Constat concret : « passe la cloison à 130 m² et
   mets les portes à 280 € » ne modifiait rien, le modèle régénérait une
   proposition différente à partir de zéro. Corrigé en faisant porter au
   client un résumé textuel fidèle de la proposition (client, objet, lignes
   avec prix/source, hypothèses), distinct de ce qui est affiché dans la
   bulle, renvoyé comme contenu de ce message dans l'historique de la
   requête suivante. Le même défaut affecte probablement aussi les 4 autres
   propositions terminales existantes de l'assistant (affectation, congé,
   messages) — non corrigé pour elles, hors périmètre de ce lot, à traiter
   séparément.
2. **Recherche de prix historique/catalogue non symétrique** — un `ILIKE
   "%terme%"` directionnel ne matche que si la désignation enregistrée
   *contient* le terme cherché, jamais l'inverse. Constat concret : le
   modèle a cherché « Faux plafond fourni et posé » (reformulation
   naturelle), la ligne enregistrée s'appelait « Faux plafond » (plus
   courte) — aucun résultat alors que la donnée existait, le prix est
   ressorti "à renseigner" au lieu de "historique". Corrigé pour les deux
   outils de recherche de prix (`rechercher_prestations_devis` utilisait le
   même défaut avec `correspondTousLesMots`, qui exige que tous les mots du
   terme cherché soient présents) par un rapprochement par chevauchement
   d'au moins un mot significatif, dans un sens comme dans l'autre.
3. **Type de ligne sensible à la casse** — le paramètre `type` de l'outil
   n'est qu'indicatif côté API (`strict: false`, même limitation que pour
   tous les outils existants de l'assistant) : rien n'empêche le modèle de
   renvoyer une casse différente. Constat concret : le modèle a renvoyé
   « Fourniture » (majuscule) sur les trois lignes d'une même proposition,
   la comparaison stricte les a toutes fait retomber silencieusement sur le
   repli `"forfait"` — lui-même une valeur valide, donc invisible sans
   inspecter les données réellement créées. Corrigé par une comparaison
   insensible à la casse/aux espaces.

## Objectif

Permettre de demander à l'assistant IA (chat intégré) de préparer un devis à
partir d'une description en langage naturel — ex. « Prépare-moi un devis
pour 120 m² de cloison 72/48 avec laine de verre, 3 portes et 80 m² de faux
plafond. » L'IA propose une structure complète (client, objet, lignes,
hypothèses) ; **rien n'est jamais écrit en base sans confirmation manuelle**,
et le devis créé est **toujours un brouillon**.

## Existant réutilisé, rien de parallèle

Un mécanisme d'assistance IA pour les devis existait déjà partiellement :
`genererLignesDevisIA` (`src/lib/ai/devis.ts`), utilisé depuis le formulaire
d'édition de devis (`DevisEditor.tsx`, bouton « ✨ Assistant IA ») pour
proposer des lignes à partir d'un texte libre, catalogue en contexte. Ce
mécanisme reste en place, inchangé — il répond à un besoin différent
(compléter un devis déjà ouvert dans le formulaire).

IA-DEVIS-V1 étend le **chat assistant général** (`src/lib/ai/copilote.ts` /
`src/lib/ai/assistant.ts` / `AssistantIA.tsx`), qui a déjà un mécanisme
propose → confirme → écrit mature et audité (affectations, congés, messages
internes/support — AI-LAUNCH-V1/V1B). IA-DEVIS-V1 ajoute un cinquième outil
terminal à ce même mécanisme, `proposer_devis`, avec la même architecture
exactement :

1. Le modèle appelle `proposer_devis` avec une proposition structurée.
2. Le serveur revalide tout (`resoudrePropositionDevis`,
   `src/lib/ai/assistant.ts`) et renvoie un objet typé `PropositionDevis` —
   aucune écriture.
3. Le client affiche une carte de confirmation dans le chat
   (`AssistantIA.tsx`).
4. Au clic « Créer le brouillon », une Server Action dédiée
   (`creerDevisDepuisPropositionAction`, `src/app/actions/assistant.ts`)
   revalide à nouveau tout et écrit — en appelant le **même RPC
   `creer_devis_brouillon`** que la création manuelle de devis
   (`src/app/actions/devis.ts`, `creerDevisAction`). Aucune nouvelle table,
   aucun nouveau RPC, **aucune migration** pour ce lot.

## Sources de prix

Trois catégories, chacune affichée distinctement dans la carte de
proposition avant confirmation :

- **Fiable** (`source_prix: "catalogue"`) — prix venant de
  `prestations_catalogue`, via le nouvel outil de lecture
  `rechercher_prestations_devis`.
- **Historique** (`source_prix: "historique"`) — prix de la dernière ligne de
  devis correspondante trouvée dans l'historique de l'entreprise, via le
  nouvel outil `rechercher_prix_historique_devis` (lit `lignes_devis` +
  `devis`, filtré par `entreprise_id`, sans exposer le client ni le devis
  complet — minimisation, voir Confidentialité). Affiché « basé sur un devis
  précédent », jamais présenté comme un tarif certain.
- **Absent** (`source_prix: "absent"`) — aucune des deux sources n'a rien
  donné : `prixUnitaireHt` reste **`null`** dans toute la chaîne
  (résolveur → carte → action de confirmation), affiché « Prix à renseigner »
  dans la carte. Le modèle système interdit explicitement d'inventer un prix
  de marché. `resoudrePropositionDevis` requalifie aussi en `"absent"` toute
  ligne où le modèle aurait annoncé une source `catalogue`/`historique` sans
  fournir de prix réel — pour ne jamais afficher une fausse source sur un
  champ vide.

À l'écriture en base, `lignes_devis.prix_unitaire_ht` étant `numeric not
null`, un prix `null` est stocké comme `0` — seule représentation possible
dans le schéma actuel (déjà le cas pour toute ligne créée manuellement sans
prix). La distinction « à renseigner » n'existe qu'au niveau de la carte de
proposition, avant confirmation ; elle n'est pas conservée en base.

## Client

Résolu via l'outil de recherche déjà existant `rechercher` (fuzzy
multi-mots, jusqu'à 5 résultats) — pas de nouvel outil de recherche client.
Le prompt système instruit le modèle de demander explicitement lequel choisir
en cas d'homonymes, et de dire clairement « client non trouvé » sans
proposer de devis si aucun résultat.

**`client_id` est obligatoire** pour qu'une proposition soit résolue :
`devis.client_id` est `not null` dans le schéma — un devis sans client n'est
techniquement pas créable, quelle que soit l'origine (IA ou manuelle). Aucun
mécanisme de création automatique de client n'a été ajouté (hors périmètre
V1, conformément au §9 du cahier des charges) ; si le client n'existe pas,
l'assistant l'indique et laisse l'utilisateur le créer manuellement.

## Structure de la proposition

`PropositionDevis` (`src/lib/ai/assistant.ts`) : `clientId`, `clientNom`,
`objet`, `lignes[]` (désignation, description, type, quantité, unité,
`prixUnitaireHt: number | null`, `sourcePrix`, `tauxTva`, `remiseLigne`),
`hypotheses[]`, `notesClient`, `avertissement`.

Le schéma `devis` n'a pas de colonne « objet »/« titre ». `objet` (et
`notesClient` si fourni) sont écrits dans `devis.notes_client` (séparés par
une ligne vide) — le champ déjà utilisé pour ce type de texte libre côté
devis (également réutilisé tel quel par WORKFLOW-DEVIS-V1).

Aucun champ fictif n'a été ajouté à `lignes_devis` : `unite` est contraint à
la liste `UNITES` existante, `type` à `LIGNE_TYPES`, `taux_tva` à `TAUX_TVA`
— exactement les mêmes listes que le formulaire manuel
(`src/lib/devis.ts`). Une valeur hors liste envoyée par le modèle est
ramenée à une valeur par défaut sûre (`"u"`, `"forfait"`, `20`) plutôt que
rejetée — mais **jamais** pour le prix ou la quantité, qui sont soit valides,
soit la ligne est rejetée (voir Garde-fous).

## Décomposition et hypothèses

Le prompt système instruit explicitement le modèle à créer une ligne par
prestation distincte (jamais de fusion), et à isoler dans `hypotheses[]`
toute précision qu'il ajoute lui-même (finition, épaisseur non précisée…),
jamais présentée comme fournie par l'utilisateur. Affiché dans un encart
distinct de la carte de proposition.

## Carte de confirmation

Dans `AssistantIA.tsx`, cinquième type de carte de proposition (même style
que les quatre existantes) : client, objet, lignes **empilées** (pas de
`<table>` — le panneau assistant reste étroit quelle que soit la largeur
d'écran, donc la même mise en page convient au mobile comme au desktop),
prix ou « Prix à renseigner », mention « basé sur un devis précédent » le
cas échéant, hypothèses, boutons natifs « Créer le brouillon » / « Ignorer ».
Après création : confirmation + lien « Ouvrir le devis ».

Modification conversationnelle avant confirmation (« passe la cloison à
130 m² ») : le modèle rappelle `proposer_devis` avec l'ensemble des lignes
mises à jour (le prompt système le précise explicitement) — aucun nouveau
mécanisme d'édition, la proposition précédente reste simplement affichée à
côté de la nouvelle dans l'historique du chat (même comportement que les
propositions d'affectation existantes).

## Permissions

- `acces_ia` (accès général à l'IA), vérifié comme pour tout le reste de
  l'assistant.
- **`gerer_devis`** (et non `acces_devis`, lecture seule) — requis pour
  utiliser `proposer_devis`. Calculé en `peutGererDevis` dans la route
  (`src/app/api/assistant/chat/route.ts`), transmis au générateur, vérifié
  dans le résolveur (`if (!peutGererDevis) return null`) — même schéma que
  `peutGererPlanning` pour le planning. Les deux outils de lecture
  (`rechercher_prestations_devis`, `rechercher_prix_historique_devis`)
  requièrent `acces_devis` via `PERMISSION_REQUISE_OUTIL`
  (`src/lib/ai/copilote.ts`), retirés de la liste envoyée au modèle sinon.
  `proposer_devis` lui-même reste dans la liste (comme `proposer_affectation`)
  mais le résolveur refuse — défense en profondeur identique au reste de
  l'assistant.
- **Terrain** (aucun droit devis) : ni `acces_devis` ni `gerer_devis` par
  défaut — les deux outils de lecture disparaissent de la liste envoyée au
  modèle, et même en cas d'appel direct à `proposer_devis`, le résolveur
  refuse. Le prompt système le rappelle explicitement au modèle.
- **RLS en dernier rempart** : `devis`/`lignes_devis`/`prestations_catalogue`
  portent déjà une policy restrictive exigeant `gerer_devis` en écriture
  (migration `20260713000043`) — le RPC `creer_devis_brouillon` est
  `security invoker`, donc même un bug dans le code applicatif échouerait
  côté Postgres.

## Cross-tenant / IDOR

- `rechercher_prestations_devis` / `rechercher_prix_historique_devis` :
  filtrées par `entreprise_id` explicitement (le second via un filtrage
  applicatif après lecture, plutôt qu'un filtre embarqué PostgREST fragile —
  voir le code).
- `resoudrePropositionDevis` : le `client_id` fourni par le modèle est
  revérifié `.eq("id", clientId).eq("entreprise_id", entrepriseId)` — un
  identifiant d'une autre entreprise renvoie `null`, proposition refusée.
- `creerDevisDepuisPropositionAction` : revérifie **à nouveau** le client à
  la confirmation (§36, proposition obsolète — voir plus bas), jamais de
  confiance dans le snapshot du modèle.

## Prompt injection

Aucune défense textuelle nouvelle nécessaire : l'architecture reste
capability-based comme le reste de l'assistant — le modèle ne peut appeler
que `proposer_devis` (qui ne fait que renvoyer un objet structuré revalidé
côté serveur) et les deux outils de lecture scoping strictement à
l'entreprise. Rien ne permet au modèle de définir un `statut`, de contourner
`gerer_devis`, ou d'atteindre `service_role`.

## Prix/quantités invalides

- Quantité `<= 0` ou non numérique : la ligne est **rejetée** (jamais
  ramenée à `1` par défaut, contrairement à `genererLignesDevisIA` existant —
  décision volontaire pour ce nouvel outil : une quantité est une donnée
  métier, pas une donnée structurelle comme l'unité).
- Prix négatif : jamais conservé, requalifié en `null`/`"absent"`.
- Si toutes les lignes d'une proposition sont invalides, la proposition
  entière est refusée (`null`).

## Idempotence

Même principe que `creerAffectationDepuisPropositionAction` : un devis
brouillon identique (même entreprise, client, `notes_client`) créé dans les
10 dernières secondes est traité comme le résultat du même clic — l'action
renvoie l'identifiant existant sans réinsérer.

## Proposition obsolète (§36/§37)

`creerDevisDepuisPropositionAction` ne fait jamais confiance au snapshot
envoyé par le client : le client est revérifié à la confirmation. Les prix
de lignes, eux, ne référencent aucune prestation par identifiant — ce sont
des valeurs copiées au moment de la proposition, donc aucune re-lecture
« live » n'est possible ni nécessaire : le prix explicitement vu et validé
par l'utilisateur est celui qui est écrit, jamais recalculé silencieusement
à la confirmation.

## Confidentialité

`rechercher_prix_historique_devis` ne retourne jamais le nom du client ni le
devis complet — uniquement désignation, prix, unité, TVA, numéro et date du
devis source. Les deux outils de lecture limitent leurs résultats (10 et 5
lignes respectivement).

## Coûts, quota, rate-limit, timeout

Tous entièrement hérités de l'infrastructure existante de l'assistant —
aucun nouveau code : `proposer_devis` est un outil terminal de plus dans la
même boucle agentique, journalisé une fois par requête HTTP
(`fonctionnalite: "assistant_chat"`, `journal_ia`), soumis au même quota
mensuel (`verifierPlafondIA`, vérifié avant tout appel), au même rate-limit
(`/api/assistant/chat`, 20/min utilisateur, 100/h entreprise) et au même
timeout de 25 s.

## Erreur provider

Identique au reste de l'assistant : en cas d'échec/indisponibilité OpenAI,
aucun brouillon n'est créé, message générique
« L'assistant est temporairement indisponible. » — jamais de détail
technique exposé.

## Fallback manuel

Non affecté : `creerDevisAction` (création manuelle depuis le formulaire) et
`genererLignesDevisIA` (assistant de lignes dans l'éditeur) fonctionnent
exactement comme avant, indépendamment de ce lot.

## Trace IA

Chaque devis créé via ce chemin reçoit `notes_internes: "Brouillon préparé
avec l'assistant IA."` — jamais affiché sur le PDF client (`notes_client`
reste distinct), uniquement visible en interne sur la fiche devis.

## Compatibilité avec WORKFLOW-DEVIS-V1

Un devis créé par ce lot est un devis `brouillon` en tout point identique à
un devis créé manuellement — aucune marque d'origine dans le schéma en
dehors de `notes_internes`. Le CTA « Créer un chantier à partir de ce
devis » (WORKFLOW-DEVIS-V1) est gated uniquement sur
`peutGererDevis && devis.statut === "accepte"`, sans dépendance à l'origine
du devis : compatibilité garantie par construction, vérifiée par relecture
du code (`src/app/(app)/devis/[id]/page.tsx`) plutôt que par un nouveau
résidu de recette live (le cahier des charges préfère explicitement cette
option, §63, pour ne pas multiplier les devis acceptés définitivement
non supprimables — voir `verrouiller_devis_accepte()`,
[docs/commercial/WORKFLOW_DEVIS_V1.md](../commercial/WORKFLOW_DEVIS_V1.md)).

## Feature flag

**`FEATURE_AI_DEVIS_ENABLED`** — nouveau sous-flag de `FEATURE_AI_ENABLED`,
fail-closed (`iaDevisEstActive()`, `src/lib/preview-features.ts`), premier
du genre dans ce projet (jusqu'ici, seuls des flags de fonctionnalité
entière existaient). Vérifié indépendamment :
- dans `demanderAssistantIAStream` : les trois outils IA-devis sont retirés
  de la liste envoyée au modèle si le flag est désactivé, en plus du
  filtrage par permission ;
- dans `creerDevisDepuisPropositionAction` : revérifié à la confirmation.

Permet de couper uniquement cette capacité sans toucher au reste de
l'assistant (planning, congés, messages) — rollback isolé, §71. Non activé
par défaut ; à activer explicitement sur Preview pour la recette, jamais en
Production dans le cadre de ce lot (§69).

## Tests

- 24 tests Vitest (`src/lib/ai/assistant-devis.test.ts`) sur
  `resoudrePropositionDevis` (exporté pour ce test, seul résolveur du
  fichier à l'être — les autres suivent la convention existante de
  vérification par recette live plutôt que par export) : demande simple,
  multi-lignes, client trouvé/absent/autre-tenant, prix
  fiable/historique/absent, source incohérente requalifiée, unité/type/TVA
  hors liste (dont une régression réelle : type dans une casse différente),
  quantité invalide (ligne rejetée, puis proposition entière), remise hors
  bornes, hypothèses filtrées, objet vide, troncature à 40 lignes, prix
  négatif rejeté, commentaire transmis.
- 11 tests Vitest (`src/app/actions/assistant-devis.test.ts`) sur
  `creerDevisDepuisPropositionAction` : création valide, permission absente,
  sous-flag désactivé, flag global désactivé, objet vide, aucune ligne
  valide, client supprimé entre-temps, idempotence 10 s, prix null → 0 en
  base, concaténation objet/notes, erreur RPC.
- Pas de nouvelle migration ni de nouvelle table : pas de nouveau test
  pgTAP nécessaire pour ce lot (RLS déjà couverte par les tests existants
  sur `devis`/`lignes_devis`/`prestations_catalogue`).

## Recette Preview

`FEATURE_AI_DEVIS_ENABLED=true` activé sur `elsatia-preview` (reste activé
après ce lot, Preview uniquement) pour une recette manuelle réelle contre un
vrai appel OpenAI, fixture créée dans l'entreprise de test existante
`RECETTE-WORKFLOW-DEVIS-V1` (client `RECETTE-IA-DEVIS-V1`, une prestation
catalogue, une ligne de devis historique jetable) :

- Demande en langage naturel avec les trois sources de prix simultanément
  (« 120 m² de cloison 72/48 avec isolation, 3 portes et 80 m² de faux
  plafond ») → proposition correcte : cloison en catalogue (45 €), portes
  en absent (« Prix à renseigner », aucun prix inventé), faux plafond en
  historique (28 €, signalé « basé sur un devis précédent »).
- Modification conversationnelle avant confirmation (« passe la cloison à
  130 m² et mets les portes à 280 € ») → proposition correctement mise à
  jour, seules les deux valeurs demandées changent (bug réel trouvé et
  corrigé pour ce test, voir plus haut).
- Confirmation → exactement un devis brouillon créé, lignes/totaux/notes
  conformes, vérifié directement en base.
- Triple-clic sur « Créer le brouillon » → exactement un seul devis créé
  (idempotence, vérifié en base).
- Tentative d'injection de prompt réelle (devis accepté directement sans
  confirmation, prix de marché inventé, contournement explicite des
  instructions) → refusée intégralement par le modèle lui-même, aucun outil
  appelé, message clair expliquant les limites (brouillon uniquement, prix
  jamais inventé, validation manuelle requise).
- Nettoyage complet des fixtures après recette (client, prestation,
  devis de test) : aucun résidu permanent pour ce lot, tous les devis créés
  étant restés à l'état brouillon (jamais acceptés, donc jamais bloqués par
  `verrouiller_devis_accepte()`).

**Non testé en live, couvert par les tests unitaires + l'architecture RLS
déjà éprouvée dans les lots précédents** : cross-tenant réel (couvert par le
test unitaire « client d'une autre entreprise » + la policy restrictive
`gerer_devis` déjà vérifiée en conditions réelles lors de
WORKFLOW-DEVIS-V1) et un compte Terrain réel (aucun poste sans `gerer_devis`
disponible dans l'entreprise de test existante ; couvert par les tests
unitaires sur `peutGererDevis=false` et par le filtrage des outils de
lecture par `acces_devis`).

## Limites V1

Pas de génération autonome sans confirmation, pas de prix de marché
Internet, pas d'achat fournisseur automatique, pas d'envoi automatique, pas
de signature électronique, pas de création de facture automatique, pas
d'acceptation automatique, pas de workflow multi-étapes autonome. Le devis
créé est toujours un brouillon ; toute action ultérieure (envoi, changement
de statut, association à un chantier) reste manuelle, via les mécanismes
déjà existants.
