# ELSATIA-STOCK-PRIX-CONFIDENTIALITÉ — CORRECTIF COHÉRENT V1

**Verdict : CORRECTIF COHÉRENT PRÉSERVÉ — PRÊT POUR INTÉGRATION DANS UN PROCHAIN TRAIN.**

- Fuite des prix d'achat et de vente **prouvée** sur base jetable (PostgREST 200 → 403) ; en Production elle est probable mais **non mesurée** (requête de lecture seule en § 13).
- D1, D2, D3 et D4 appliqués. Aucun défaut du lot relevé par les validations : pgTAP 71/71, suite proposée 69/69, typecheck, lint, build, migrations, secrets et `git diff --check` au vert.
- Seules réserves : 3 dépassements de délai préexistants dans deux fichiers de tests hors lot (§ 9), et la suppression de `stock/page 2.tsx`, qui dépend d'un autre lot (§ 11).
- Aucune migration numérotée, aucune fusion, aucun déploiement. À intégrer dans un même train que le code de cette branche : **d'abord le SQL, puis le code**.

| Élément | Valeur |
|---|---|
| Base | `integration/elsatia-ecosystem-train-v3-commercial-platform-v1` @ `59e960a` (= `52d3282` + documentation ; `git diff 52d3282 59e960a -- supabase` vide) |
| Branche du lot | `fix/stock-prix-confidentialite-colonnes-v1` (worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/stock-prix-colonnes-v1`) |
| Commits | `b02bf22` SQL V1 · `0de3ab4` rapport V1 · `dc64070` SQL V2 (D1/D2/D3) · `c803148` rentabilité · `219d91d` import · `6683cc0` garde statique · rapport V2 (ce fichier) |
| Ledger | **aucun numéro réservé**, **aucune migration modifiée** (`git diff --name-only 59e960a HEAD -- supabase` : 0 fichier) |
| Déploiement, fusion, Production | aucun |

## 1. Décisions définitives (2026-09-11) et mise en œuvre

| Décision | Règle | Mise en œuvre |
|---|---|---|
| **D1 — Analyse IA** | Toute analyse utilisant le coût du stock exige `acces_rentabilite` ; jamais de prix unitaire, de coût agrégé ni de 0 € ambigu sans ce droit ; refus ou indisponibilité explicites | `couts_stock_par_chantier` **refuse en 42501** (au lieu d'un vide) ; `analyserRentabiliteIAAction` contrôle `acces_rentabilite` **avant toute lecture** et s'arrête sans appeler l'IA si le coût stock est refusé ou illisible ; la page affiche « Indisponible » et ne calcule aucune marge |
| **D2 — Import du stock** | Prix de vente transmis et conservé ; prix réservés à `gerer_prix_stock` ; refus explicite sinon, sans rien modifier ; imports sans prix inchangés ; jamais de remise à 0 ou NULL | `importer_articles_stock[_interne]` réécrites (mêmes signatures) ; import générique → RPC ; import de l'écran Stock → `null` au lieu de 0 ; 22 assertions pgTAP dédiées |
| **D3 — Expert-comptable** | Pas d'`acces_rentabilite` par défaut ; s'il le reçoit explicitement : coûts agrégés seulement | Aucun SQL requis : le Train V3 n'a **aucun modèle de poste expert-comptable** (104 : neuf modèles, dont un « comptable » interne) et l'option `expert_comptable` (142) ne porte aucun droit ; la liste blanche proposée sur `feat/gp-expert-comptable-notes-frais-closure-v1` (`873dc32`) exclut rentabilité et prix. Verrouillé par 9 assertions pgTAP |
| **D4 — Copie Finder** | `stock/page 2.tsx` n'est pas touchée ici | Présente sur cette branche, non routée, non importée ; son `select("*")` échoue désormais en 42501 au lieu de fuir. Suppression : `chore/remove-finder-duplicate-copies-v1` @ `d896ce0` (sur origin, non fusionnée). La garde statique l'isole nommément |

## 2. Matrice des permissions finales

✔ autorisé · ✘ refusé explicitement (code) · — sans objet

| Poste / droits | Colonnes non tarifaires | Prix unitaires en lecture directe | Prix par `articles_stock_avec_prix` | Coût agrégé `couts_stock_par_chantier` | Page `/rentabilite` | Analyse IA rentabilité | Import stock sans prix | Import avec prix | Modifier un prix |
|---|---|---|---|---|---|---|---|---|---|
| Membre sans droit stock (ouvrier) | ✔ | ✘ 42501 | ✘ P0001 | ✘ 42501 | ✘ garde + refus | ✘ | ✘ « Accès refusé » | ✘ | ✘ |
| `voir_prix_stock` | ✔ | ✘ 42501 | ✔ | ✘ 42501 | ✘ | ✘ | — | — | ✘ |
| `gerer_stock` sans `gerer_prix_stock` (magasinier) | ✔ | ✘ 42501 | selon `voir_prix_stock` | ✘ 42501 | ✘ | ✘ | ✔ | ✘ 42501, rien modifié | ✘ trigger 00108 |
| `gerer_stock` + `gerer_prix_stock` | ✔ | ✘ 42501 | ✔ | ✘ sans `acces_rentabilite` | ✘ | ✘ | ✔ | ✔ | ✔ |
| `acces_rentabilite` (comptable interne) | ✔ | ✘ 42501 | ✘ P0001 | ✔ agrégat | ✔ | ✔ si option IA | — | — | ✘ |
| Option IA seule (`acces_ia`) | ✔ | ✘ 42501 | ✘ | ✘ 42501 | ✘ | ✘ refus avant toute lecture | — | — | ✘ |
| Expert-comptable (défaut : factures, achats, exports) | ✔ | ✘ 42501 | ✘ P0001 | ✘ 42501 | ✘ | ✘ | — | — | ✘ |
| Expert-comptable + `acces_rentabilite` **explicite** | ✔ | ✘ 42501 | ✘ P0001 | ✔ agrégat seulement | ✔ | ✔ si option IA | — | — | ✘ |
| Gérant (tous droits) | ✔ | ✘ 42501 (voie RPC uniquement) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |

La lecture **directe** d'un prix est refusée à **tout** `authenticated`, quel que soit le poste : le privilège colonne est porté par le rôle, pas par la permission. La seule voie est la RPC contrôlée.
L'import générique (`/parametres/import`) exige en plus `gerer_utilisateurs` ou `gerer_connecteurs` pour ouvrir l'écran (inchangé).

## 3. Analyse IA sans `acces_rentabilite` (D1)

| Situation | Résultat |
|---|---|
| Option IA, sans `acces_rentabilite` | `{ error: "L’analyse de rentabilité exige la permission « Consulter rentabilité et trésorerie » : aucun coût ni aucune marge n’est communiqué." }` — **aucun client Supabase créé, aucune requête, aucun appel IA** (test `rentabilite.test.ts`) |
| Habilité, RPC refusée (42501) | `{ error: "Coût du stock non communiqué : …" }`, pas d'appel IA |
| Habilité, RPC en échec ou réponse illisible | `{ error: "Coût du stock indisponible : … La marge n’est pas calculée …" }`, pas d'appel IA |
| Habilité, aucune sortie de stock | coût stock **0 € réel** transmis (état « disponible »), jamais un repli |
| Page `/rentabilite` si le coût stock manque | bandeau d'alerte, « Indisponible » pour Stock / Marge / Taux (cartes et tableau), classement des marges masqué |

Hors périmètre, non modifié : l'outil `rentabilite_chantiers` du copilote (`lib/rentabilite.ts`) exige déjà `acces_rentabilite` et ne lit aucun prix ; sa marge exclut toutefois stock, notes de frais et indemnités (§ 12).

## 4. Import avec et sans `gerer_prix_stock` (D2)

| Cas | Avec `gerer_prix_stock` | Sans `gerer_prix_stock` (avec `gerer_stock`) |
|---|---|---|
| Colonnes prix d'achat / de vente fournies | ✔ transmis et conservés (vente comprise) | ✘ **refus explicite de tout l'import avant écriture** : base 42501 « Import refusé : les prix du stock (achat ou vente) exigent la permission gerer_prix_stock ; aucun article n'a été modifié » ; écran : message dédié, aucune RPC appelée |
| Aucune colonne tarifaire | ✔ | ✔ |
| Cellule de prix vide / clé nulle | prix existant **inchangé** | accepté, prix inchangé |
| Nouvelle référence sans prix | créée à 0 (valeur par défaut de création, pas une remise à zéro) | idem |
| Prix négatif | ✘ 22023 « Prix négatif refusé pour la référence … » (base) ; ligne refusée avec message (écran) | refusé en amont (colonne prix) |
| Prix illisible | ligne refusée avec message ; import écran Stock : fichier refusé | idem |
| Retour de la RPC | un **nombre de lignes**, jamais un prix | idem |
| Sans `gerer_stock` | ✘ « Accès refusé » → message dédié | ✘ |

Défaut corrigé au passage : l'ancienne `importer_articles_stock_interne` remettait `prix_achat_ht` à 0 sur toute référence existante dès que la colonne manquait au fichier, et ignorait `prix_vente_ht` ; l'écran Stock transmettait 0 pour un prix absent ou illisible.

## 5. Expert-comptable (D3)

Confirmé : **aucun accès supplémentaire par défaut**.
- Aucun modèle de poste expert-comptable n'existe dans le Train V3 ; aucun modèle dont le nom ou la clé contient « expert » ne porte `acces_rentabilite` (pgTAP 16).
- L'option facturée `expert_comptable` ne mentionne ni rentabilité ni prix du stock (pgTAP 17).
- Si `droits_mandat_expert_comptable()` (branche `feat/gp-expert-comptable-notes-frais-closure-v1`) est intégrée, sa liste blanche ne doit porter ni `acces_rentabilite`, ni `voir_rentabilite`, ni `voir_prix_stock`, ni `gerer_prix_stock` : vérifié dès aujourd'hui sur son contenu, et verrouillé par pgTAP 18 le jour de l'intégration.
- Expert-comptable par défaut : coût 42501, prix 42501, catalogue avec prix P0001 (pgTAP 36-38). Avec `acces_rentabilite` explicite : coût agrégé ✔ (10 €), catalogue avec prix P0001, prix de vente direct 42501 (pgTAP 39-41).
- Le modèle **interne** `comptable` (104) accorde, lui, `acces_rentabilite` : il n'est pas un expert-comptable et obtient les agrégats, jamais les prix unitaires.

## 6. Preuve de la fuite, avant / après (PostgREST 14.14 réel)

Conteneur jetable `elsatia-stockprix-jetable`, 278 migrations du Train V3, décor `isolation_multitenant.inc`.
Bases : `avant` (sans correctif), `apres2` (copie exacte de `avant` + correctif V2 appliqué deux fois), `postgres` (correctif V2, chemins d'écriture).

| # | Persona | Requête | `avant` | `apres2` |
|---|---|---|---|---|
| L1 | ouvrier A | `GET /articles_stock?select=reference,prix_achat_ht,prix_vente_ht` | **200** `5.00 / 8.00` | **403** 42501 |
| L2 | ouvrier A | `GET /articles_stock` (`*`) | **200** prix compris | **403** 42501 |
| L3 | ouvrier A | embed `mouvements_stock → articles_stock(prix_achat_ht)` | **200** `5.00` | **403** 42501 |
| L4 | ouvrier A | colonnes non tarifaires | 200 | 200 |
| L5 | ouvrier A | `rpc/couts_stock_par_chantier` | — | **403** « Accès à la rentabilité refusé : le coût du stock n'est pas communiqué » |
| L6 | conducteur A (sans `acces_rentabilite`) | idem | — | **403** idem |
| L7 | comptable A (`acces_rentabilite`) | idem | — | 200 `[{"total":5.0000}]` |
| L8 | comptable A | `rpc/articles_stock_avec_prix` | — | 400 P0001 |
| L9 | comptable A | `GET /articles_stock?select=prix_vente_ht` | — | 403 42501 |

Import (base `postgres`, correctif V2 ; chef d'équipe A promu magasinier : `gerer_stock` + `voir_prix_stock`, sans `gerer_prix_stock`) :

| # | Persona | Action | Résultat |
|---|---|---|---|
| I1-I2 | admin A | import `prix_vente_ht = 13`, relecture | 200 `1` ; relu `6.00 / 13.00` |
| I3-I4 | admin A | import sans colonne tarifaire, relecture | 200 `1` ; désignation mise à jour, prix **intacts** `6.00 / 13.00`. (Premier passage : 500 `57014` délai dépassé sous charge 17–18 ; le même appel en SQL prend 99,7 ms ; rejoué à charge 13,8 : 200.) |
| I5 | magasinier | import d'un prix de vente | **403** 42501 « Import refusé : … aucun article n'a été modifié » |
| I6-I7 | magasinier | import sans prix, relecture | 200 `1` ; désignation mise à jour, prix intacts `6.00 / 13.00` |
| I8 | comptable A (sans `gerer_stock`) | import | 400 « Accès refusé » |
| I9 | admin A | prix négatif | 400 22023 « Prix négatif refusé pour la référence TEST_A_STK_001 » |

## 7. Consommateurs dans `src/` (état final)

| Emplacement | Avant | Après |
|---|---|---|
| `src/app/(app)/rentabilite/page.tsx` | embed `articles_stock(prix_achat_ht)` | `lireCoutsStockChantiers` → RPC ; refus / indisponibilité explicites |
| `src/app/actions/rentabilite.ts` | embed + garde `aAccesIA` seule | `acces_rentabilite` exigé avant lecture ; RPC ; pas d'IA sur coût inconnu |
| `src/app/actions/import.ts` (type `stock`) | upsert PostgREST (42501 après correctif ; remettait les prix à 0) | `rpc("importer_articles_stock", { p_type: "inventaire" })` par lots de 200 |
| `src/lib/import-stock.ts` (écran Stock) | prix absent = 0 ; prix de vente ignoré | prix absent = `null` ; prix de vente lu ; illisible / négatif refusé |
| `stock/page.tsx`, `stock/[id]/page.tsx`, `stock/reception`, `depot`, `inventaires`, `dashboard`, `copilote.ts`, `doe`, `imprimer/doe`, `api/inventaires/[id]/cloture` | colonnes sans prix ou RPC | inchangés, vérifiés |
| `src/app/(app)/stock/page 2.tsx` | `select("*")` (fuite) | inchangé (D4) : 42501, non routé, non importé |

Aucune vue ni fonction `security invoker` ne lit les prix (mesuré : `pg_proc`, `pg_views`, `pg_matviews`).

## 8. Correctif SQL proposé (`docs/migrations-proposees/*.proposed`, sans numéro)

1. Garde : échec si `articles_stock` ne porte pas exactement les 16 colonnes classées.
2. `revoke select on table` puis `grant select` sur les 14 colonnes non tarifaires (liste 00108).
3. `couts_stock_par_chantier(p_entreprise_id, p_chantier_id default null)` : plpgsql, `security definer`, `search_path=public`, **42501 sans `acces_rentabilite`** ou hors entreprise.
4. `importer_articles_stock` / `_interne` : mêmes signatures, règles D2, ACL réaffirmées (`_interne` fermée à `authenticated`).
5. `notify pgrst, 'reload schema'`.
Idempotence : appliqué deux fois de suite sur `postgres` et sur `apres2`, code 0.

## 9. Résultats des tests

| Contrôle | Résultat |
|---|---|
| Suite pgTAP proposée (69 assertions), base corrigée | **69/69** sur `postgres` et **69/69** sur `apres2` |
| Même suite, base non corrigée (`avant`) | `not ok 2, 3, 4, 5` (fuite), puis arrêt à l'assertion 8 (RPC absente) : la suite détecte la régression 00189 |
| Suite pgTAP complète du Train V3, `avant` | **70/70 fichiers, 1 902 assertions** |
| Suite pgTAP complète, `apres2` (+ suite proposée) | **71/71 fichiers, 1 971 assertions** (= 1 902 + 69) ; résultat identique fichier par fichier à `avant` ; correctif appliqué deux fois avant la suite |
| Tests applicatifs du lot (6 fichiers) | **58/58** |
| `vitest run` racine | **150/152 fichiers, 1 780/1 783 tests — 3 ÉCHECS, laissés tels quels.** Tous dans `src/lib/xlsx.test.ts` (1) et `src/app/api/stripe/boutique/webhook/route.test.ts` (2) : dépassement du délai de 5 s sous charge ≈ 17 (le 2ᵉ test Stripe échoue par effet de bord du premier). **Préexistants et indépendants du lot** : ces fichiers n'importent que `./xlsx` + `@excel.js/exceljs` et `./route` + `node:crypto`, aucun fichier du lot ; eux-mêmes et `vitest.config.ts` sont inchangés (`git diff 59e960a HEAD` vide). **Aucun délai n'a été modifié dans le dépôt** ; un rejeu isolé avec `--testTimeout=60000`, en ligne de commande et à titre de diagnostic seulement, donne 7/7 |
| Tests des applications Tools / Réserves / Colors | **Tools 20/20 fichiers, 108/108** · **Réserves 12/12, 154/154** · **Colors 27/27, 264/264** |
| Typecheck racine (`tsc --noEmit`) | **code 0** |
| Typecheck Tools / Réserves / Colors | **code 0** pour les trois (`npm run typecheck` s'était arrêté sur Tools faute de `node_modules` d'application dans le worktree : `@capacitor/*`, `jspdf` introuvables ; rejoué après clonage des dépendances à lockfile identique) |
| Lint (racine + 3 applications) | **0 erreur**, 4 avertissements préexistants hors lot (`<img>`, e2e) |
| Build racine + Tools | **code 0** — racine « ✓ Compiled successfully in 8.7min », 38/38 pages (dont `/rentabilite`, `/parametres/import`) ; Tools « ✓ Compiled successfully in 30.7s », 36/36 pages |
| `verify:migrations` | code 0 |
| `verify:secrets` | code 0 — 1 724 fichiers suivis, aucun secret |
| `git diff --check` | propre sur `59e960a..HEAD` et sur l'arbre de travail |

## 10. État du ledger

- Aucun fichier sous `supabase/` modifié ; aucun numéro réservé.
- Train V3 : 278 fichiers, dernier préfixe `20260909000280`. Numéro fonctionnel maximal connu : 281 (`integration/colors-pilot-readiness-v1`, non fusionnée, ne touche pas `articles_stock`).
- À l'intégration : renommer `stock-prix-confidentialite-colonnes-v1.sql.proposed` en migration numérotée depuis le train du moment, et `….pgtap.sql.proposed` en `supabase/tests/…test.sql`, **dans le même train que le code de cette branche** (ordre de déploiement : SQL puis code).

## 11. Dépendance restante : suppression de `stock/page 2.tsx`

- Présente sur cette branche (`git ls-files`), non modifiée (D4).
- Sûre en l'état : ni routée (Next ne sert que `page.tsx`), ni importée (vérifié par la garde statique), et son `select("*")` échoue en 42501 depuis le correctif — elle ne peut plus fuir.
- Suppression portée par `chore/remove-finder-duplicate-copies-v1` @ `d896ce0` (présente sur origin, non fusionnée). Aucun conflit attendu : cette branche ne touche pas le fichier.

## 12. Observations hors périmètre (non corrigées)

- `couts_indemnites_paie_par_chantier` (00147) renvoie encore un **vide** sans `acces_rentabilite`, au lieu d'un refus : même risque de 0 € ambigu que D1, sur les indemnités de paie. L'écran étant gardé par `acces_rentabilite`, le cas ne se présente pas aujourd'hui.
- La marge du copilote (`lib/rentabilite.ts`) exclut stock, notes de frais et indemnités : résultat partiel, sans fuite.
- ACL `service_role=Dxtm` sur `articles_stock` (00255) : les scripts `scripts/seed-*.mjs` écrivant `articles_stock` avec cette clé n'ont pas été rejoués.
- `articles_stock_avec_prix` court-circuite son contrôle pour `anon` ; branche morte depuis 00157.
- Deux tests racine dépassent 5 s sous forte charge (`xlsx`, webhook Boutique).

## 13. Production — mesure à faire (lecture seule, non faite)

```sql
select has_table_privilege('authenticated', 'public.articles_stock', 'select')                 as fuite_table,
       has_column_privilege('authenticated', 'public.articles_stock', 'prix_achat_ht', 'select') as fuite_prix_achat;
```

`t | t` = fuite confirmée en Production.

## 14. Environnement de recette (jetable)

- Conteneur `elsatia-stockprix-jetable` ; bases `postgres`, `avant`, `apres`, `apres2` ; PostgREST retiré en fin de lot.
- `node_modules` clonés en copy-on-write APFS depuis `train-v3-commercial` (racine) et `colors-pilot-readiness-v1` (applications, lockfiles identiques).
- Aucune autre pile touchée ; base locale au ledger 265 intacte.
- Retrait : `docker rm -f elsatia-stockprix-jetable`.
