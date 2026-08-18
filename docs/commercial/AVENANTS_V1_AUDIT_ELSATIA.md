# AVENANTS-V1 — Audit et cadrage avant développement

Audit réalisé en lecture seule, worktree `liria-codex`, branche `claude/avenants-v1-audit`, base `claude/commandes-fournisseurs-v1b-tests` (commit `d5009e8` — inclut RENTABILITÉ-V1/V1B/V1C, COMMANDES FOURNISSEURS V1/V1B). **Aucun code applicatif modifié, aucune migration créée, aucune action en Production.** Ce document est un audit et un cadrage : il ne contient aucune implémentation.

## 1. Résumé exécutif

Il n'existe **aucun concept d'avenant** dans ELSATIA aujourd'hui — ni table, ni colonne, ni RPC, ni statut, ni document. Le seul mécanisme informel pour un « travail supplémentaire » est de créer un **second devis indépendant** (par duplication ou de zéro), sans aucun lien structurel avec le devis initial. Ce contournement fonctionne pour la facturation basique mais casse le prévisionnel (RENTABILITÉ-V1C ne verrait qu'un CA prévu = somme des devis acceptés, sans savoir qu'un des devis est un complément du premier), et il repose sur un mécanisme d'acceptation de devis qui s'est révélé, pendant cet audit, **moins solide qu'attendu** (§8-9 ci-dessous).

**Verdict : ELSATIA peut être commercialisé sans AVENANTS-V1**, à condition d'accepter le contournement « devis séparé » comme pratique documentée pour le client pilote, et sous réserve de corriger séparément (hors périmètre de ce lot) la faille d'immuabilité découverte en §8. Aucun blocage P0 propre aux avenants n'a été trouvé — voir §37 pour le détail du GO/NO-GO.

## 2. Méthodologie

Recherche exhaustive (`grep -riE`) sur `supabase/migrations/*.sql`, `src/`, `docs/` pour les termes : `avenant`, `plus_value`, `moins_value`, `travaux_supplementaires`, `devis_complementaire`, `devis_parent`, `devis_origine`, `revision`, `version`, `variation`, `modification`, `ordre_de_service`, `supplement`. Complétée par la lecture intégrale des RPC de devis/facturation/situations et des policies RLS associées, et par deux tests SQL directs en Local (fixture `isolation_multitenant.inc`) pour vérifier empiriquement — pas seulement par lecture de code — le comportement de modification d'un devis accepté.

## 3. Recherche exhaustive — aucun concept d'avenant existant

Zéro occurrence réelle. Deux faux positifs écartés :

- **`avenant` en paie** (`src/app/(app)/paie/profils/[employeId]/page.tsx`, `<option value="avenant">Avenant</option>`) : type de document RH pour un « avenant au contrat de travail » — domaine complètement différent (droit du travail, pas commercial). **Point d'attention pour la nomenclature future** : si AVENANTS-V1 introduit une table/route `avenants`, prévoir un nom sans ambiguïté dans l'UI (ex. « Avenant chantier » vs « Avenant contrat de travail ») pour éviter toute confusion visuelle, notamment dans les résultats de recherche globale si elle existe.
- **`factures.devis_origine_id`** : lien FACTURE → devis dont elle est issue (utilisé par `creer_facture_avancee`/`facturer_situation_travaux`, voir §11), **pas** un lien devis → devis. Ne préfigure aucune notion de version ou de parenté entre devis.

Aucun `devis_parent_id` ni colonne équivalente sur `devis`. `dupliquer_devis` (RPC, migration `20260710000014`) copie un devis + ses lignes vers un nouveau devis `brouillon` totalement indépendant — aucune trace de filiation stockée. C'est la confirmation, déjà notée dans l'audit RENTABILITÉ-V1, que l'« avenant informel » actuel = devis séparé sans lien.

## 4. Audit des flux devis complémentaires actuels

Le seul chemin outillé est : `dupliquer_devis` → devis `brouillon` indépendant → édition manuelle → cycle normal (`brouillon`→`envoye`→`accepte`/`refuse`). Rien n'empêche de créer ce second devis pour le même chantier (voir §7), rien ne le relie visuellement au premier dans l'UI au-delà du fait qu'ils partagent le même `chantier_id`.

## 5. Verrouillage de modification après acceptation — attendu vs réel

**Attendu** (et ce que `modifier_devis_brouillon` fait correctement) : la RPC `modifier_devis_brouillon` (migration `20260710000013_modification_devis_atomique.sql`) vérifie explicitement `if v_devis.statut <> 'brouillon' then raise exception 'Seul un devis brouillon peut etre modifie';` — un devis accepté ne peut pas être modifié **via cette RPC**.

**Réel** — voir §8-9 : ce verrou n'existe qu'au niveau de cette seule fonction, pas au niveau de la table.

## 6. Versioning

Aucun. `dupliquer_devis` ne stocke aucune référence au devis source dans le nouveau devis — la « version suivante » d'un devis est indiscernable d'un devis totalement sans rapport, une fois créée. Aucun historique de modification n'existe non plus sur un devis `brouillon` (les éditions successives avant acceptation ne sont pas journalisées) — hors périmètre pour un brouillon, mais pertinent si un avenant devait un jour permettre plusieurs versions avant validation.

## 7. Cardinalité devis → chantier

`devis.chantier_id uuid references public.chantiers(id) on delete set null` — **aucune contrainte d'unicité**. Un chantier peut donc avoir plusieurs devis, y compris plusieurs devis `accepte` simultanément (rien dans la base ne l'empêche). Confirmé par lecture directe de `supabase/migrations/20260710000005_devis.sql`.

## 8. FAILLE CRITIQUE DÉCOUVERTE — un devis accepté n'est pas réellement immuable

**C'est le constat le plus important de cet audit**, et il concerne directement la notion de « source de vérité contractuelle » que les avenants devront exploiter.

Le verrou `statut='brouillon'` de `modifier_devis_brouillon` (§5) n'est appliqué **que dans cette fonction**. Il n'existe :
- **aucune contrainte au niveau table** (`check`, trigger `before update`) sur `devis`/`lignes_devis` empêchant une modification quand `statut='accepte'` ;
- **aucune policy RLS** conditionnée au statut — la policy RESTRICTIVE d'écriture sur `devis`/`lignes_devis` (migration `20260713000043_permissions_rls_gestion.sql`) vérifie uniquement `a_permission(entreprise_id,'gerer_devis')`, jamais le statut de la ligne modifiée.

**Vérifié empiriquement en Local** (pas seulement par lecture de code), avec une session authentifiée comme `admin-a` (utilisateur légitimement titulaire de `gerer_devis`, pas un attaquant) sur la fixture `isolation_multitenant.inc` :

```sql
-- devis a9000000-...-...001, statut='accepte' avant le test
update public.devis set montant_ht = 1 where id = 'a9000000-0000-0000-0000-000000000001';
-- → UPDATE 1 (réussi). Relecture : statut='accepte', montant_ht=1.
```

```sql
-- après insertion d'une ligne réelle sur ce même devis accepté :
update public.lignes_devis set prix_unitaire_ht = 999999 where devis_id = 'a9000000-...-001' and designation = '...';
-- → réussi.
delete from public.lignes_devis where devis_id = 'a9000000-...-001' and designation = '...';
-- → réussi.
```

**Conséquence** : n'importe quel utilisateur `gerer_devis` légitime peut aujourd'hui, via un appel Supabase direct (pas seulement via l'UI, qui ne propose pas ce chemin) modifier silencieusement un devis déjà accepté par le client — montant, lignes, quantités — **sans aucune trace**, puisque `lignes_devis`/`devis` ne sont couverts par aucun trigger de journalisation. Ce n'est pas une faille de sécurité multi-tenant (l'utilisateur agit dans son propre périmètre), mais une **faille d'intégrité contractuelle** : le devis « accepté » n'est en réalité qu'une convention d'affichage, pas un document figé.

## 9. Portée pour les avenants

Cette faille est **antérieure et indépendante** d'AVENANTS-V1, mais elle **conditionne** sa conception : si les avenants doivent modéliser « ce qui a changé par rapport au contrat initial », il faut d'abord que le contrat initial soit réellement figé, sinon la distinction avenant/modification-silencieuse-du-devis n'a pas de sens. Recommandation : traiter cette faille comme un correctif indépendant (P1, hors périmètre de ce lot d'audit — voir §36), à faire **avant ou en même temps** qu'AVENANTS-V1, pas après.

## 10. Moins-value / avoir

Pas de mécanisme dédié « moins-value ». Deux briques existantes exploitables :
- `creer_facture_avancee(..., p_type='avoir', ...)` : génère une facture négative (`v_signe:=-1`) à partir des lignes d'un devis accepté, **jamais bloquée par le garde-fou de surfacturation** (`if p_type<>'avoir' then ... end if;` — les avoirs sont volontairement exemptés du plafond, car ils réduisent toujours le total).
- Un devis avec des lignes à quantité/prix négatifs n'est **pas interdit** par les contraintes actuelles (`lignes_commande` interdit quantité≤0/prix négatif dans le contexte achats, mais je n'ai pas trouvé de contrainte équivalente sur `lignes_devis` — à vérifier précisément si un futur lot s'y appuie).

Aucun des deux n'est aujourd'hui relié à un concept d'avenant.

## 11. Facturation avec plusieurs devis

`creer_facture_avancee` et `facturer_situation_travaux` fonctionnent tous deux **par devis** (`p_devis_id` obligatoire, un seul devis à la fois). Rien n'agrège plusieurs devis d'un même chantier dans une facture unique. Si un chantier a un devis initial accepté + un second devis accepté (complément), il faut aujourd'hui **deux cycles de facturation avancée indépendants**, chacun plafonné à son propre devis (voir §12) — aucune vision consolidée « facturé sur ce chantier / montant contractuel total du chantier ».

## 12. Garde-fou anti-surfacturation — état réel, dans le contexte avenant

Lu intégralement : `supabase/migrations/20260724000172_garde_fou_surfacturation_devis.sql`. Contexte (commentaire du fichier) : avant ce correctif, `creer_facture_avancee` n'avait **aucun** garde-fou (un acompte 60% + un solde 100% pouvaient cumuler 160% sans alerte).

**Ce que le correctif fait** : dans `creer_facture_avancee`, pour tout type autre que `avoir`, calcule `v_deja_facture` = somme de **toutes** les `factures.montant_ht` (statut ≠ `annulee`) ayant `devis_origine_id = p_devis_id` — **ce qui inclut les factures de type `situation`** (elles portent aussi `devis_origine_id`, voir `facturer_situation_travaux`) — et refuse si `v_deja_facture + v_montant_nouveau > montant_ht + 0.01`.

**Ce que le correctif ne fait PAS** : la direction symétrique n'est pas protégée. `creer_situation_travaux` plafonne uniquement par rapport au cumul **des situations précédentes** (`avancement_cumule_pct` dans `lignes_situations`), **sans jamais consulter** ce qui a déjà été facturé via `creer_facture_avancee` (acomptes/finale) sur le même devis. Un chantier avec un acompte de 60% déjà facturé pourrait donc ensuite ouvrir une situation à 100%, sans alerte — la surfacturation croisée dans ce sens précis **existe toujours**. Le commentaire du fichier de migration le dit lui-même, de façon toujours exacte pour cette direction : « [situations_travaux] ignore totalement les acomptes/finales sur le même devis ».

**Dans le contexte avenant** : les deux mécanismes (acompte/finale et situations) plafonnent par rapport à `devis.montant_ht`, c'est-à-dire **le montant d'un seul devis**, jamais « devis initial + avenants ». Si un avenant est un devis séparé (contournement actuel), son propre plafond est indépendant — aucun risque de double-plafond incorrect, mais aucune vision consolidée non plus. Si un avenant devient une ligne rattachée au devis initial (option B/C, voir §26), **le plafond `devis.montant_ht` devrait alors inclure les avenants acceptés** — ce que le code actuel **ne sait pas faire**, puisqu'il ne connaît que `devis.montant_ht`. Toute implémentation d'AVENANTS-V1 qui touche à la facturation devra recalculer ce plafond comme `devis.montant_ht + somme(avenants acceptés)`, dans les deux RPC (`creer_facture_avancee` et `creer_situation_travaux`) — **ne pas corriger dans ce lot**, uniquement documenté ici.

## 13. Points d'intégration avec la rentabilité

`calculerPrevuRealiseChantiers` (RENTABILITÉ-V1C) calcule `caPrevuHt` = `budgetHt` du chantier (lui-même dérivé, via `calculerRentabiliteChantiers`, des devis `accepte` liés au chantier) et `heuresPrevues` = somme des lignes `main_oeuvre`/`h` de ces mêmes devis. **Un second devis accepté sur le même chantier serait déjà additionné automatiquement** aujourd'hui (aucun filtre n'exclut un devis parce qu'il en existe un autre) — donc le contournement « avenant = devis séparé » **fonctionne déjà correctement pour le CA prévu et les heures prévues**, sans aucun changement de code. C'est un point positif majeur pour le GO/NO-GO (§37) : le prévisionnel n'est pas cassé par un second devis, il l'absorbe naturellement.

Ce qui **ne** fonctionnerait **pas** sans traitement dédié : si un avenant devient un jour une entité séparée de `devis` (option B, §26), `calculerPrevuRealiseChantiers` devra explicitement l'agréger — actuellement, seule la table `devis` est lue.

## 14. Mécanisme d'acceptation — audit détaillé

`changerStatutDevisAction` (`src/app/actions/devis.ts`) fait un `update` direct sur `devis.statut`, gardé uniquement par la table `TRANSITIONS_DEVIS` côté client et par RLS (`gerer_devis`) côté serveur. **Aucune preuve d'acceptation n'est capturée** : pas de date d'acceptation dédiée (seul `updated_at` bouge), pas d'utilisateur signataire enregistré, pas de PDF figé au moment de l'acceptation, pas d'entrée `journal_activite` (contrairement à la quasi-totalité des autres RPC métier de l'application, qui journalisent systématiquement).

**Mécanisme disponible mais non câblé** : `signatures_documents` (migration `20260718000102`) supporte `type_document='devis'` dans sa contrainte `check`, avec hash SHA-256 du document et de la signature, horodatage, déclaration du signataire — une infrastructure de preuve d'acceptation existe réellement. Mais la seule action qui y insère (`signerDocumentMetierAction`, `src/app/actions/signatures-documents.ts`) **n'est appelée depuis aucune page de l'application** (recherche exhaustive : zéro résultat en dehors de son propre fichier). C'est donc une fonctionnalité construite mais jamais branchée à l'UI de devis — à signaler séparément, hors périmètre avenants.

## 15. Réutilisabilité du PDF pour un document « Avenant »

`src/app/imprimer/devis/[id]/page.tsx` existe et génère le PDF d'un devis à partir de `devis` + `lignes_devis`. Sa structure (en-tête entreprise/client, tableau de lignes, totaux, mentions légales) est directement réutilisable pour un PDF « Avenant » si les lignes d'avenant réutilisent le schéma de `lignes_devis` (option C, §26) — un nouveau gabarit `src/app/imprimer/avenants/[id]/page.tsx` pourrait dupliquer et adapter l'en-tête (« Avenant n°X au devis DEV-2026-XXX ») sans réinventer la mise en page. Si les avenants utilisent une table de lignes différente (option B), la réutilisation demande une adaptation du composant, pas seulement une copie.

## 16. Proposition de nomenclature (numérotation)

Suivre le motif `next_reference` déjà utilisé partout ailleurs (`DEV-2026-001`, `CMD-2026-001`, `FAC-2026-001`) : `next_reference(entreprise_id, 'avenant', 'AVT', 3, true)` → `AVT-2026-001`. Alternative pertinente vu le lien fort au devis : numéroter **par devis** plutôt que par entreprise (`AVT-DEV-2026-001-1`, `-2`, …), à trancher selon si la table stocke une séquence propre par devis (comme `situations_travaux.numero`, unique par `(entreprise_id, devis_id)`) — recommandation : suivre ce second motif, plus lisible pour l'utilisateur final (« avenant n°2 de ce devis » plutôt qu'un numéro global sans rapport visible avec le devis d'origine).

## 17. Proposition de machine à états

Calquée sur le motif déjà en place pour `commandes_fournisseurs`/`devis` (table de transitions autorisées, revalidée côté RPC) : `brouillon → propose → accepte / refuse`, avec `accepte` et `refuse` terminaux (comme `devis`). Pas de `envoyee` intermédiaire distincte de `propose` sauf besoin confirmé côté métier — à garder minimal en V1.

## 18. Types d'avenant

Trois types couvrant les scénarios connus : `plus_value` (ajoute des lignes/montant), `moins_value` (retire ou réduit, montant signé négatif), `mixte` (les deux dans le même avenant — ex. une ligne ajoutée, une autre réduite). Le signe global n'a pas besoin d'être stocké séparément si chaque ligne porte son propre montant signé — le total de l'avenant se déduit par somme, comme pour `lignes_devis`.

## 19. Proposition de champs de lignes

**Recommandation : réutiliser `lignes_devis` telle quelle** (mêmes colonnes : `designation`, `description`, `type`, `quantite`, `unite`, `prix_unitaire_ht`, `remise_ligne`, `taux_tva`, `ordre`), avec une clé de rattachement supplémentaire (`avenant_id`) en plus de (ou à la place de, selon l'option retenue en §26) `devis_id`. Bénéfice majeur : tout le code qui lit déjà `lignes_devis` pour le prévisionnel (RENTABILITÉ-V1C, §13) continue de fonctionner sans modification si un avenant est simplement un devis avec un flag, ou nécessite une extension mineure et prévisible si c'est une table séparée qui réutilise le même schéma de colonnes.

## 20. Trois options de modèle de données — comparaison

**Option A — `devis_parent_id` sur `devis`** : un avenant est un devis normal avec une colonne `devis_parent_id uuid references devis(id)`. *Avantages* : zéro nouvelle table, réutilise 100% du code devis existant (RPC, RLS, PDF, actions), le contournement actuel (§4) devient officiellement le mécanisme, juste tracé. *Inconvénients* : un avenant a alors son propre `statut` de devis complet (`brouillon/envoye/accepte/refuse`) — sémantiquement correct mais donne l'impression que c'est « un nouveau devis » plutôt qu'un complément, ce qui peut semer la confusion utilisateur (rentabilité, §12 sur le plafond) ; la distinction plus-value/moins-value n'est pas structurée nativement (à déduire du signe des montants).

**Option B — tables dédiées `avenants` + `lignes_avenants`** : modèle complètement séparé, propre schéma de statuts, propre numérotation. *Avantages* : sémantique la plus claire, isole totalement le risque de régression sur `devis`. *Inconvénients* : duplique une quantité significative de code (RLS, RPC, PDF, action serveur, prévisionnel) déjà écrit pour `devis`/`lignes_devis` — le lot le plus long à développer et le plus de surface à tester.

**Option C — table dédiée `avenants` (métadonnées : numéro, statut, type, devis_id, dates) + réutilisation de `lignes_devis`** (avec `avenant_id` nullable ajouté à `lignes_devis`, en plus de `devis_id` qui resterait obligatoire pour le devis d'origine, ou une jointure via une table de liaison) : *Avantages* : sémantique claire (un avenant est explicitement typé, pas un devis déguisé) tout en réutilisant le moteur de calcul de lignes existant (recalcul de totaux, PDF, prévisionnel) sans dupliquer son schéma. *Inconvénients* : nécessite malgré tout d'étendre `lignes_devis` (une colonne nullable, migration simple) et d'adapter légèrement les endroits qui lisent `lignes_devis` par `devis_id` pour explicitement inclure ou exclure les lignes d'avenant selon le besoin (le prévisionnel actuel, par exemple, devrait décider s'il agrège directement via `devis_id` du devis-parent, ce qui nécessite alors que les lignes d'avenant portent aussi le `devis_id` du devis d'origine en plus de `avenant_id`).

**Recommandation : Option C.** Elle donne la clarté sémantique de B sans sa duplication de code, et elle est plus honnête structurellement que A (un avenant n'a pas besoin d'un cycle de vie complet « devis », juste d'un cycle `brouillon/propose/accepte/refuse` plus simple). Le coût (une migration ajoutant une table `avenants` + une colonne nullable sur `lignes_devis`) est proportionné à un vrai lot de développement — **pas à faire dans ce lot d'audit**.

## 21. Source de vérité contractuelle

Proposition : le montant contractuel d'un chantier = `devis initial accepté.montant_ht` + `somme(avenants.montant_ht where statut='accepte')`. Ce montant devient le nouveau plafond de facturation (voir §12) et le nouveau `caPrevuHt` de référence pour la rentabilité (voir §13, actuellement déjà correct par construction grâce à l'option contournement, mais qui devra être recalculé explicitement si l'option C est retenue). **Précondition non négociable** : cette source de vérité n'a de sens que si le devis initial et les avenants acceptés sont réellement immuables — ce qui ramène à la faille du §8, à corriger avant ou avec ce lot.

## 22. Historique et immuabilité

Aucun mécanisme d'historisation n'existe aujourd'hui sur `devis`/`lignes_devis` (pas de table d'audit, pas de trigger de journalisation des modifications). Pour qu'un avenant ait un sens contractuel, il faudrait a minima : (1) corriger le §8 (verrouiller réellement l'écriture sur un devis `accepte`, par trigger `before update`/`before delete` au niveau table, pas seulement au niveau RPC) ; (2) envisager, pour les avenants eux-mêmes une fois acceptés, la même règle. Aucune historisation fine (type `audit_log` générique avec avant/après) n'est nécessaire en V1 si l'immuabilité post-acceptation est garantie — l'historique se lit alors simplement comme « devis initial + liste chronologique des avenants acceptés », sans besoin de rejouer des versions.

## 23. Règles de suppression

Proposition, calquée sur `devis` (`supprimerDevisAction` n'autorise la suppression que si `statut in ('brouillon','refuse','annule')`) : un avenant `brouillon` ou `refuse` est supprimable ; un avenant `accepte` ne l'est jamais — seule une annulation (nouveau statut `annule`, ou un avenant compensatoire inverse) est possible, pour préserver la trace contractuelle.

## 24. Options d'intégration à la facturation

Trois options envisageables, aucune implémentée : **(1)** ne rien changer à `creer_facture_avancee`/`creer_situation_travaux`, l'utilisateur facture sur le devis initial ET sur chaque avenant séparément (plusieurs cycles) — le plus simple, mais fragmente la facturation client en plusieurs documents distincts pour un même chantier. **(2)** modifier les deux RPC pour accepter un plafond calculé = devis + avenants acceptés (voir §12, §21), en conservant un `devis_id` unique comme point d'entrée — nécessite de faire relire aux deux RPC les avenants liés. **(3)** une RPC de facturation dédiée « au niveau chantier » qui agrège devis + avenants en une seule fois — le plus ambitieux, hors scope V1 recommandé. **Recommandation pour un futur lot AVENANTS-V1 : option 2**, la moins disruptive pour le code de facturation existant.

## 25. Intégration avec `situations_travaux`

`situations_travaux.montant_marche_ht` est figé à `devis.montant_ht` au moment de la création de **chaque** situation (`v_devis.montant_ht` copié tel quel dans `creer_situation_travaux`). Si un avenant est accepté **après** qu'une situation a déjà été créée sur ce devis, les situations suivantes devraient recalculer `montant_marche_ht` = devis + avenants acceptés à cette date — ce que le code actuel ne fait pas (il ne connaît que `devis.montant_ht`). À corriger dans un futur lot si l'option C/plafond consolidé (§12, §21) est retenue.

## 26. Base de calcul des acomptes

Un acompte (`creer_facture_avancee`, type `acompte`) est un pourcentage de `devis.montant_ht`. Même remarque qu'au §21/§25 : la base devrait devenir `devis.montant_ht + avenants acceptés` pour rester cohérente une fois AVENANTS-V1 en place.

## 27. Distinction avoir / moins-value

À formaliser clairement pour éviter la confusion déjà latente (§10) : un **avoir** (`creer_facture_avancee(p_type='avoir')`) est un document de facturation qui annule/réduit un montant déjà facturé — il s'applique après coup, sur ce qui a été émis. Une **moins-value** (avenant de type `moins_value`) est une réduction du montant contractuel **avant** toute facturation de la partie concernée — elle change la base de calcul future (§21, §26), pas un document déjà émis. Les deux peuvent coexister sur un même chantier sans se substituer l'un à l'autre ; ne pas les fusionner conceptuellement dans l'implémentation future.

## 28. Proposition de permissions

Réutiliser `gerer_devis` (pas de nouvelle permission) : un avenant est conceptuellement une extension du devis, porté par la même équipe commerciale, avec les mêmes garde-fous d'accès. Créer une permission dédiée (`gerer_avenants`) ajouterait de la complexité de gestion des rôles sans bénéfice clair identifié dans cet audit — à ne considérer que si un besoin métier réel de séparation des droits émerge plus tard.

## 29. Plan de réutilisation RLS

Suivre exactement le motif de `supabase/migrations/20260713000043_permissions_rls_gestion.sql` : policy permissive `est_membre_actif` + policy RESTRICTIVE `a_permission(entreprise_id,'gerer_devis')` sur la nouvelle table `avenants`, et si `lignes_devis` gagne une colonne `avenant_id` (option C), aucune policy supplémentaire n'est nécessaire — les policies existantes sur `lignes_devis` (déjà vérifiées via jointure sur `devis`) couvrent le cas par construction, à condition que la jointure de policy résolve bien le bon `entreprise_id` quel que soit le type de ligne.

## 30. Notes pour l'IA (non développé)

Le copilote IA (`src/lib/ai/copilote.ts`, `src/lib/ai/rentabilite.ts`) lit aujourd'hui `calculerPrevuRealiseChantiers`. Si les avenants deviennent une entité séparée (option C), il faudra étendre le contexte fourni à l'IA (comme cela a été fait pour `heuresPrevues`/`ecarts` en RENTABILITÉ-V1C) avec les mêmes garde-fous déjà en place (ne jamais laisser l'IA inventer un montant non fourni). Aucune action requise dans ce lot.

## 31. Notes pour le portail client (non développé)

Si un portail client existe ou est prévu, la même logique d'acceptation (§14) devrait s'appliquer aux avenants qu'aux devis — et bénéficierait directement d'une correction du mécanisme de signature déjà présent mais non câblé (`signatures_documents`, §14). Aucune action requise dans ce lot.

## 32. Scénario fictif de référence (conceptuel, non implémenté)

```
Devis initial DEV-2026-050, accepté, montant_ht = 10 000 €
  → 100 h main d'œuvre prévues (35 €/h) + fournitures forfait

Avenant 1 (plus-value), accepté, montant_ht = +2 000 €
  → +20 h main d'œuvre prévues supplémentaires

Avenant 2 (moins-value), accepté, montant_ht = -500 €
  → -5 h main d'œuvre (poste annulé)

Montant contractuel total = 10 000 + 2 000 - 500 = 11 500 €
Heures prévues totales = 100 + 20 - 5 = 115 h
```

**Impact rentabilité/prévisionnel attendu** (avec l'option C, RENTABILITÉ-V1C adapté pour agréger devis + avenants) : `caPrevuHt` passerait de 10 000 € à 11 500 € pour ce chantier, `heuresPrevues` de 100 h à 115 h, et l'écart réalisé/prévu se recalculerait automatiquement contre cette nouvelle base — **aucun changement de logique de calcul d'écart nécessaire** (`calculerEcart` reste correct quel que soit `prevu`), seule l'agrégation de la source `prevu` doit être étendue.

**Impact facturation attendu** : le plafond de `creer_facture_avancee`/`creer_situation_travaux` devrait passer de 10 000 € à 11 500 € une fois les deux avenants acceptés (voir §12) — non implémenté aujourd'hui, le plafond resterait figé à 10 000 € si aucune correction n'est apportée, ce qui **bloquerait à tort** une facturation complémentaire légitime au-delà de 10 000 €.

## 33. Ordonnancement multi-avenants

Numérotation séquentielle par devis (§16) suffit comme ordre de référence. Aucun besoin d'un ordre distinct du numéro — contrairement aux lignes de devis (`ordre`), qui servent à l'affichage, l'ordre des avenants a une portée contractuelle (l'avenant 2 s'applique après l'avenant 1) et doit donc rester strictement chronologique à la création, sans réordonnancement manuel possible après coup.

## 34. Stratégie d'annulation d'un avenant accepté

Ne jamais permettre une suppression physique (§23). Deux approches possibles : **(a)** un statut `annule` sur l'avenant original, qui exclut son montant du calcul du plafond contractuel (§21) mais conserve la ligne à des fins d'historique — cohérent avec le motif déjà utilisé pour `commandes_fournisseurs.statut='annulee'` et `sous_traitants_chantiers.statut='annulee'` (tous deux déjà exclus des agrégations pertinentes, motif éprouvé) ; **(b)** un avenant compensatoire explicite (type `moins_value` inverse) qui neutralise le précédent sans jamais changer son statut. **Recommandation : (a)**, plus simple, cohérent avec le reste de la base.

## 35. Verrouillage de modification post-acceptation (avenants)

Directement informé par le §8 : si un avenant devient une entité propre (option C), la même erreur ne doit **pas** être reproduite — le verrou `statut='accepte' → immuable` doit être posé **au niveau trigger de table**, pas seulement dans une RPC applicative, dès la conception initiale de la table `avenants` et de la colonne `avenant_id` sur `lignes_devis`. C'est l'occasion de corriger l'architecture plutôt que de reproduire le même défaut sur une nouvelle table.

## 36. Proposition UX minimale (non développé)

Un nouvel onglet « Avenants » sur la page chantier (`src/app/(app)/chantiers/[id]/page.tsx`, déjà enrichie par RENTABILITÉ-V1C), listant les avenants du/des devis liés au chantier avec leur statut, montant signé, et un lien vers leur PDF. Formulaire de création calqué sur celui des devis. Aucun développement dans ce lot.

## 37. Indicateurs de tableau de bord (non développé)

Sur la page rentabilité (`/rentabilite`) et sur la fiche chantier : un indicateur « Montant contractuel (devis + avenants) » distinct du « CA prévu (devis initial) » actuel, pour visualiser l'écart avant/après avenants. Aucun développement dans ce lot.

## 38. Classification P0–P3 des constats

| # | Constat | Priorité | Justification |
|---|---|---|---|
| §8 | Devis accepté modifiable sans trace (table/RLS) | **P1** | Nécessite une permission légitime (`gerer_devis`), pas une faille d'accès non autorisé — mais mine la notion de contrat figé. À corriger avant que le montant contractuel serve de plafond de facturation consolidé. |
| §12 | Garde-fou surfacturation : situations n'excluent pas les acomptes déjà facturés | **P2** | Risque réel mais partiel (une seule direction), déjà atténué par le fait que peu de chantiers combinent aujourd'hui situations ET acomptes sur le même devis. |
| §14 | Aucune preuve d'acceptation capturée (signature non câblée) | **P2** | Fonctionnalité de preuve déjà construite (`signatures_documents`) mais non utilisée — activation simple si un futur lot le juge nécessaire, pas un blocage. |
| Absence totale d'AVENANTS-V1 | **P1, pas P0** | Le contournement (devis séparé) fonctionne pour la facturation ET pour le prévisionnel (§13) sans aucun développement — voir §37 pour le raisonnement complet. |

## 39. Décision GO / NO-GO — commercialisation sans AVENANTS-V1

**GO.** ELSATIA peut être commercialisé sans AVENANTS-V1. Raisonnement : le contournement actuel (créer un second devis accepté pour tout travail supplémentaire) est fonctionnellement complet pour la facturation (chaque devis se facture indépendamment, chacun avec son propre plafond correct) et **s'intègre déjà correctement au prévisionnel** sans aucun changement de code (§13, vérifié par lecture directe de `calculerPrevuRealiseChantiers`). La seule perte est **cosmétique/organisationnelle** : pas de lien visuel entre les deux devis dans l'UI, pas de vision consolidée « montant contractuel total du chantier » en un coup d'œil, et le vocabulaire utilisateur doit être « créez un nouveau devis pour le complément » plutôt que « ajoutez un avenant ». Aucun de ces manques n'empêche une facturation correcte ni ne fausse la rentabilité.

**Condition explicite au GO** : documenter ce contournement pour l'utilisateur pilote (comment créer et accepter un second devis pour un complément de travaux) et traiter séparément, en parallèle ou juste après, la faille P1 du §8 — elle n'est pas spécifique aux avenants mais grandit en importance dès qu'on commence à construire une notion de « montant contractuel » dessus.

## 40. Portée minimale recommandée pour un futur AVENANTS-V1

Si/quand un lot de développement est lancé : **Option C** (§20) — table `avenants` (métadonnées) + `lignes_devis.avenant_id` nullable ; machine à états `brouillon/propose/accepte/refuse` (§17) ; numérotation par devis (§16) ; RLS calquée sur `gerer_devis` existant (§28-29) ; PDF dérivé du gabarit devis (§15) ; correction du plafond de facturation dans `creer_facture_avancee`/`creer_situation_travaux` pour inclure les avenants acceptés (§12, §24 option 2) ; onglet UX minimal sur la fiche chantier (§36). **Préalable recommandé** : corriger §8 avant ou avec ce lot.

## 41. Liste de tests à prévoir (préparation uniquement, non écrits)

pgTAP : RLS cross-tenant sur `avenants` et `lignes_devis.avenant_id` ; machine à états (transitions autorisées/refusées) ; immuabilité réelle d'un avenant `accepte` (au niveau table, pas RPC — pour ne pas reproduire §8) ; plafond de facturation consolidé (devis + avenants acceptés, refus au-delà) ; exclusion des avenants `annule` du plafond et du prévisionnel ; numérotation séquentielle par devis. Vitest : calcul du montant contractuel total ; formatage/agrégation des écarts prévu/réalisé étendus aux avenants. Non-régression : `rentabilite.test.ts`, `rentabilite_v1c_previsionnel.test.sql`, `commandes_fournisseurs_v1b.test.sql` inchangés.

## Non-régression de cet audit

Aucun fichier fonctionnel modifié (`git status` : uniquement les deux fichiers `.md` de ce lot). Aucune migration créée. Aucun déploiement Preview (non nécessaire, aucun code applicatif touché).
