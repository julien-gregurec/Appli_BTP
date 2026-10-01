# ELSATIA — RENTABILITÉ & CHANTIER POINTAGES DATA CORRECTNESS V1

```
BASE          = origin/integration/elsatia-canonical-train-v7 @ 547f0b6f
BRANCHE       = claude/festive-turing-7zqcce
MIGRATIONS    = 359 → 360 (+ 20260930000301_rentabilite_agregats_chantiers_v1.sql)
DATE          = 2026-09-30
MOTEUR        = PostgreSQL 16.14 réel + pgTAP 1.3.3 (amorce scripts/local-postgres-bootstrap),
                PostgREST v12.2.3 réel (db-max-rows = 1000, comme supabase/config.toml),
                GoTrue compilé (pilot_acceptance_v3.sh), local_supabase_proxy.mjs, next dev, Chromium 1194
RÉFÉRENCE     = docs/qualification/ELSATIA_GP_POINTAGES_FACTURE_FIX_V1.md
                (branche claude/busy-ramanujan-cbyclu, § 9 « Hors périmètre, constaté » — lue seulement,
                 ni reprise comme base ni modifiée)
```

## 0. Verdict

**ELSATIA RENTABILITE DATA CORRECTNESS LOCALLY QUALIFIED**

Pour le périmètre de la mission : `/rentabilite`, analyse IA de rentabilité d'un chantier,
outil copilote « rentabilité des chantiers » (`src/lib/rentabilite.ts`) et section heures /
pointages de la fiche chantier. Les autres lectures tronquées trouvées par l'inventaire (§ 2)
sont documentées comme réserves, hors correctif (§ 11).

| | Avant (V7) | Après |
| --- | --- | --- |
| `/rentabilite`, 5 000 pointages, navigateur réel | CA 2 020 478,40 € / MO 153 646,55 € / marge **1 488 153,83 €** pour 2 030 246,76 / 517 692,20 / 1 133 201,12 en base | exact au centime |
| `/rentabilite`, 20 000 pointages, navigateur réel | CA **2 019 192,60 €** pour 6 427 270,16 € ; MO 152 452,21 € pour 1 868 520,50 € | exact au centime |
| Fiche chantier, 10 000 pointages validés sur un chantier | « 6 019,999999999999 h / 4 333,06 h » pour 60 200 h / 43 154,23 h ; 1 000 lignes (2,5 Mo HTML) | 60 200 h / 43 154,23 h ; liste paginée (50) |
| Chantiers faux (test d'échelle, 14 chantiers) | 2/14 à 1 462, **12/14** à 5 000 et 20 000 | 0/14 à tous les volumes |
| Temps DB (somme des requêtes de la page, 20 000) | 6,94 s — et le résultat reste faux | 0,14 s |
| Droits | — | **parité stricte avec la RLS** prouvée par pgTAP pour 6 profils ; rien de rouvert |

## 1. Cause

PostgREST plafonne toute réponse à `max_rows = 1000` (`supabase/config.toml`, même valeur
hébergée) **sans erreur** ; supabase-js ne signale rien (`Content-Range: 0-999/*`). Les écrans
de rentabilité lisaient en une requête chacune, sans pagination, toutes les lignes de
l'entreprise (ou du chantier) puis additionnaient côté Next :

| Écran / chemin | Lectures non bornées additionnées côté Next |
| --- | --- |
| `/rentabilite` (`src/app/(app)/rentabilite/page.tsx`) | chantiers, factures, devis acceptés, **pointages validés**, dépenses fournisseurs, sorties de stock (+ article), notes de frais validées, coûts horaires |
| Analyse IA (`src/app/actions/rentabilite.ts`, un chantier) | factures, devis, **pointages validés du chantier**, dépenses, sorties de stock, notes de frais, coûts horaires |
| Copilote `rentabilite_chantiers` (`src/lib/rentabilite.ts` via `src/lib/ai/copilote.ts`) | chantiers, factures, devis, **tous les pointages**, dépenses, coûts horaires |
| Fiche chantier (`src/app/(app)/chantiers/[id]/page.tsx`) | **affectations** (heures planifiées), **pointages du chantier** (heures validées + liste complète) |

Au-delà de 1 000 lignes, chaque réponse est coupée arbitrairement : heures et coût de
main-d'œuvre sous-estimés (marge surestimée), puis, quand factures / dépenses dépassent à leur
tour 1 000 lignes, CA et coûts sous-estimés (marge faussée dans l'autre sens). Les heures
étaient en plus additionnées en flottant (`6019.999999999999 h`).

## 2. Inventaire complet (Gestion Pro)

Recherche sur `src/` de toute lecture `.from(...)`/`.rpc(...)` sans pagination suivie d'un
agrégat JS, de tout calcul d'heures / coûts / marges, et de tout `count: "exact"`.

### 2.1 Corrigé ici

| Fichier | Table(s) | Risque >1 000 | Correctif |
| --- | --- | --- | --- |
| `rentabilite/page.tsx` | pointages, factures, devis, dépenses, stock, notes, chantiers, coûts | très élevé | RPC `rentabilite_chantiers_totaux` + `rentabilite_chantiers_page` |
| `actions/rentabilite.ts` | idem, un chantier | élevé (pointages) | RPC `rentabilite_chantier` |
| `lib/rentabilite.ts` (copilote) | idem | très élevé | RPC `rentabilite_chantiers_page` paginée (500) |
| `chantiers/[id]/page.tsx` | affectations, pointages | élevé | RPC `chantier_heures_synthese` + `chantier_pointages_valides_page` |

### 2.2 Constaté, non corrigé (réserves, § 11)

| Fichier | Table(s) | Calcul | Risque |
| --- | --- | --- | --- |
| `app/api/exports/comptabilite/route.ts` | **lignes_factures** (TVA ventes), dépenses (achats, TVA achats), factures, paiements | écritures et **totaux TVA** | très élevé (lignes de factures) |
| `tresorerie/page.tsx` | factures, dépenses | à encaisser / à payer, projection 90 j | élevé |
| `depenses/page.tsx` | dépenses | total TTC / réglé + liste | élevé |
| `stock/page.tsx`, `dashboard/page.tsx`, `lib/ai/copilote.ts` (`stockFaible`) | `articles_stock_avec_prix` (setof, plafonné aussi), articles_stock | valeur de stock, alertes | élevé si catalogue importé |
| `app/api/notes-frais/exports/route.ts` | notes, documents, versions, validations | ZIP / manifeste | moyen à élevé |
| `planning/page.tsx` | affectations, pointages validés de la période | heures par cellule / salarié | moyen (vue mois, 40+ salariés) |
| `chantiers/[id]/page.tsx` (autres sections) | devis du client, factures, dépenses, notes du chantier ; `documents_chantier` (compteur) | totaux devis / facturé / payé / dépenses | faible à moyen ; **poids** (§ 7.3) |
| `crm/page.tsx`, `sous-traitants/[id]`, `outillage/[id]` | factures / dépenses | totaux | faible à moyen |
| `paie/[id]/page.tsx` | lignes paginées | total **de la page seulement** présenté comme total | fonctionnel (pas max_rows) |
| `flotte/[id]` (`limit(12)`), `grands-deplacements` (`limit(200)`) | pointages / GD | totaux sur un échantillon | fonctionnel |
| `pointage/gestion/page.tsx` | pointages, sessions, contrôles du mois | totaux par salarié | **corrigé sur une autre branche** (`claude/busy-ramanujan-cbyclu`, migration 20260930000101) — à converger en V8 |

`count: "exact"` : `onboarding/demarrage` (dont `sessions_pointage` de toute l'entreprise, coûteux
sous RLS), `parametres/acces/apercu`, `actions/notes-frais`, `devis/…/pieces-jointes/finaliser`,
`relances-moteur`, `paie/[id]` : exacts (`head: true` ou `range`), coût seulement.
**Aucun** nouvel usage de `count=exact` dans ce correctif (les compteurs viennent des RPC).

RPC d'agrégat déjà présentes et sûres : `couts_indemnites_paie_par_chantier` (reprise dans le
calcul), `dashboard_indicateurs`, `*_liste_paginee`, `synchroniser_periode_paie`.

« Rentabilité salarié » et « rentabilité période » : **aucune surface ni règle produit n'existe**
aujourd'hui (pas d'écran, pas de filtre de période sur `/rentabilite`). Rien n'a été inventé :
DECISION_REQUIRED D3 (§ 10).

## 3. Reproduction (vérité PostgreSQL vs valeur affichée)

Jeu : `scripts/perf/rentabilite_charge.sql` sur la fixture `isolation_multitenant` (tests
d'échelle) ou la fixture pilote (navigateur) — 12 chantiers dont le n° 01 porte la moitié des
pointages, max(20, N/100) salariés (1 sur 7 sans coût horaire), N pointages sur 12 mois (75 %
validés), N affectations, N/5 factures (annulées, avoirs), N/10 devis acceptés, N/5 dépenses
(sous-traitance, annulées), N/10 sorties de stock, N/10 notes de frais. Montants et heures non
ronds : une ligne perdue se voit.

### 3.1 Vrai PostgREST (`db-max-rows = 1000`), chemin V7 rejoué à l'identique

`src/lib/rentabilite.integration.test.ts` (dirigeant A, JWT réel) : même `select`, mêmes filtres,
même addition que la page V7, comparés à la vérité superutilisateur.

| N | Vérité : marge / heures | V7 : marge / heures | Réponses au plafond | Chantiers faux | Après : marge / heures |
| ---: | --- | --- | ---: | ---: | --- |
| 500 | 52 234,99 € / 1 518,00 h | 52 234,99 / 1 518,00 | 0 | 0/14 | **identique à la vérité** |
| 1 000 | 117 640,33 / 2 997,53 | 117 640,33 / 2 997,53 | 0 | 0/14 | identique |
| **1 462** | **186 532,11 / 4 302,53** | 187 609,96 / 4 271,87 | 1 | **2/14** | identique |
| 5 000 | 633 852,42 / 14 824,96 | **960 557,45** / 4 271,87 | 3 | **12/14** | identique |
| 20 000 | 2 562 270,91 / 59 359,04 | **856 397,75** / 4 271,87 | 6 | **12/14** | identique |

Fiche chantier (chantier 01) — V7 → vérité : 5 000 : « 4 380,80 h validées / 6 020 h planifiées
(1 000 lignes) » pour 10 780,09 / 15 042 (2 500) ; 20 000 : « 4 334,02 / 6 020 (1 000) » pour
43 154,23 / 60 200 (10 000). Après : identique à la vérité à tous les volumes.

### 3.2 Navigateur réel (pile pilote, gérant)

`tests/e2e/gp-rentabilite-data-correctness-v1.spec.ts`, vérité lue en base par le test.

| N | Écran | V7 affiché | Vérité | Après |
| ---: | --- | --- | --- | --- |
| 1 000 | `/rentabilite` CA / MO / marge | 850 528,79 / 152 609,00 / 616 989,03 | 850 528,79 / 152 609,00 / 616 989,03 | identique |
| 1 000 | fiche : planifiées / validées | 3 001,999999999999 h / 2 152,19 h, 500 lignes | 3 002 / 2 152,19 | 3 002 / 2 152,19, 50 lignes |
| **5 000** | `/rentabilite` | **2 020 478,40 / 153 646,55 / 1 488 153,83** | 2 030 246,76 / 517 692,20 / 1 133 201,12 | identique à la vérité |
| **5 000** | fiche | **6 019,999999999999 / 4 380,80**, 1 000 lignes | 15 042 / 10 780,09 (2 500) | identique, 50 lignes/page |
| **20 000** | `/rentabilite` | **2 019 192,60 / 152 452,21 / 1 387 361,63** | 6 427 270,16 / 1 868 520,50 / 3 061 619,61 | identique |
| **20 000** | fiche | **6 019,999999999999 / 4 333,06**, 1 000 lignes | 60 200 / 43 154,23 (10 000) | identique, 200 pages |

(À 1 000 pointages, le pilote reste sous le plafond pour ces tables : valeurs V7 justes.)

## 4. Stratégie de correction

Pas de « 1 000 → 50 000 ». **Les totaux sont calculés par PostgreSQL ; Next ne reçoit que des
totaux ou des pages bornées** :

| RPC (migration 20260930000301) | Rôle | Taille de réponse |
| --- | --- | --- |
| `rentabilite_chantiers_totaux(entreprise)` | bandeau de `/rentabilite` (CA, MO, achats, stock, sous-traitance, notes, indemnités, marge, taux, nb chantiers, nb alertes coût horaire) | 1 ligne |
| `rentabilite_chantiers_page(entreprise, tri, limite ≤ 500, décalage, avec_activité)` | liste détaillée (`recent`), 8 meilleurs (`marge_desc`), copilote (`marge_asc`) | ≤ 500 lignes |
| `rentabilite_chantier(entreprise, chantier)` | analyse IA d'un chantier | 1 ligne |
| `chantier_heures_synthese(entreprise, chantier)` | fiche : heures planifiées, nb affectations, heures validées, nb pointages validés | 1 ligne |
| `chantier_pointages_valides_page(entreprise, chantier, limite ≤ 200, décalage)` | identifiants d'une page de pointages validés ; la page **relit ces lignes sous la RLS normale** (`.in("id", …)`) | ≤ 200 ids |
| `rentabilite_chantiers_calcul` (interne) | calcul commun, une ligne par chantier visible | non exécutable par les rôles applicatifs |

Les pages restent sous `max_rows` par construction (≤ 500). Côté Next (`src/lib/rentabilite.ts`) :
toute erreur RPC est **levée** — `/rentabilite` affiche un bandeau « aucun total partiel
n'est affiché », la fiche affiche « indisponible », l'IA et le copilote renvoient un message
d'erreur : jamais de zéros ou de totaux partiels présentés comme exacts.

`/rentabilite` : liste paginée (`?page=`, 50 chantiers), totaux sur **tous** les chantiers ;
seules les fiches des chantiers affichés (≤ 58) sont relues sous RLS pour le nom / client.
Fiche chantier : `?page_pointages=` (50, plus récents d'abord), en-tête « N pointage(s)
validé(s), X h au total — page p/n ».

## 5. Rentabilité : règles de calcul (inchangées)

Reprises **à l'identique** de l'écran `/rentabilite` V7 (aucune règle nouvelle) :

- CA = Σ factures HT hors statuts `annulee`, `avoir_emis` ;
- budget = Σ devis `accepte` HT ;
- heures / MO = pointages `valide` (règle produit 14f1112), MO = heures × coût horaire **actuel**
  (`employes_cout_horaire`, 0 si absent ou non visible) ; alerte si une heure validée n'a pas de
  coût (absent ou 0) ;
- achats = dépenses non annulées hors `sous_traitance` ; sous-traitance à part ;
- stock = sorties × prix d'achat HT de l'article ;
- notes de frais = TTC des statuts validés (`valide`, `exporte_comptabilite`, `verrouille`,
  `archive`, `validee`, `remboursee`) ;
- indemnités = règle de `couts_indemnites_paie_par_chantier` (acces_rentabilite) ;
- marge = CA − MO − achats − sous-traitance − indemnités − stock − notes ; taux = marge / CA.

Calcul en `numeric` exact (plus d'addition flottante). Copilote : sa règle historique est
conservée (CA **hors avoirs**, marge = CA − MO − achats − sous-traitance), la RPC exposant la part
d'avoirs (`facture_ht_avoirs`) ; seule différence volontaire : heures validées uniquement
(DECISION_REQUIRED D1).

## 6. Sécurité (entreprise, permissions, RLS, accès chantier, accès pointages)

Toutes les fonctions : `SECURITY DEFINER`, `search_path = public`, `EXECUTE` à `authenticated`
**seul** (retiré à `public`, `anon`, `service_role`) ; le calcul interne n'est exécutable par
aucun rôle applicatif. Refus `42501 RENTABILITE_ACCES_REFUSE` sans identité (`auth.uid()` nul)
ou si `est_membre_actif(entreprise)` est faux (autre tenant, membre désactivé, entreprise
suspendue, session révoquée). Fiche chantier : chantier **appartenant à l'entreprise** et
`peut_consulter_chantier` (le contrôle d'appartenance manquait dans la 1re version :
`peut_consulter_chantier` répond vrai pour tout id à un poste `acces_chantiers` — trouvé par le
test 37, corrigé ; aucune donnée ne fuitait, la somme étant filtrée par entreprise).

Visibilité : **mêmes prédicats que les policies**, évalués une fois par appel (permissions) ou
par salarié au lieu d'une fois par ligne :

| Donnée | Policy actuelle | Dans la RPC |
| --- | --- | --- |
| chantiers | `peut_consulter_chantier` | acces_chantiers ∨ gerer_chantiers ; sinon voir_chantiers_assignes ∧ salarié du compte affecté aujourd'hui (équipe ou affectation du jour) |
| factures / devis / dépenses | est_membre_actif ∧ acces_factures / acces_devis / acces_achats | idem, une fois |
| pointages | est_membre_actif ∧ `peut_consulter_pointage_employe` | voir_pointages_equipe ∨ gerer_pointage ∨ valider_pointages ; sinon salariés actifs du compte |
| coûts horaires | voir_cout_interne_employe ∨ acces_rentabilite | idem ; sinon coût 0 (et alerte), comme l'écran V7 |
| notes de frais | 3 policies permissives | (verifier ∨ gerer ∨ comptabiliser ∨ administrer_archivage) ∨ salarié du compte ∨ (preparer_virements ∧ statut valide/validee/exporte_comptabilite) |
| sorties de stock / article | est_membre_actif | idem |
| affectations | est_membre_actif ∧ `peut_consulter_affectation_employe` | gerer_planning ∨ voir_pointages_equipe ∨ voir_heures_chantiers ; sinon ses affectations |

**Garde anti-dérive** : pgTAP compare, pour chaque profil, la RPC au **même calcul exécuté sous
`authenticated` avec la RLS réelle** (fonction `pg_temp.parite_rentabilite`) : si une policy
change, ces tests échouent.

| Profil (fixture isolation) | Voit | Parité RLS |
| --- | --- | --- |
| Dirigeant A (tous droits) | tout | ✅ (18) + vérité DB (9–17) |
| Admin A | tout | ✅ (19, 20) |
| Ouvrier A | son chantier assigné, ses heures, ses notes ; ni CA ni coûts | ✅ (21–25, 57) ; chantier non assigné refusé (26, 58) |
| Chef d'équipe A | chantier assigné, heures de l'équipe, coût invisible (0 + alerte) | ✅ (28–30) |
| Conducteur A | tous chantiers, devis, heures ; ni factures ni coûts | ✅ (31, 32) |
| Comptable A (+ acces_chantiers, preparer_virements) | CA, achats, coûts ; aucune heure ; notes « sources bancaires » seulement | ✅ (33–36) |
| Dirigeant B (autre entreprise) | ses seuls totaux ; A refusé | ✅ (44–47, 59, 60) |
| Sans identité / anon / membre désactivé / entreprise suspendue | refusé | ✅ (49–52) |

Navigateur (pilote) : gérant autorisé ; chef de chantier (voir_heures_chantiers, gerer_pointage,
gerer_planning) : fiche exacte, `/rentabilite` refusée (`/dashboard?acces=refuse`, règle
inchangée) ; ouvrier : `/rentabilite` refusée, chantier non affecté 404 ; autre entreprise
(gérant du tenant B) : chantier du pilote 404 ; `/rentabilite` ouverte pour B, CA affiché = vérité
de **B**, aucun chantier du pilote listé.

## 7. Performance

### 7.1 Temps DB (dirigeant, `authenticated`, RLS réelle)

Somme des requêtes de `/rentabilite` (les 9 lectures V7 sont lancées en parallèle par la page :
charge DB = somme ; elles restent **fausses** au-delà de 1 000).

| N | Avant : somme (dont factures / devis / pointages / dépenses / notes) | Après : totaux + page + 8 meilleurs |
| ---: | --- | --- |
| 1 000 | 1 854 ms (245 / 129 / 1 041 / 253 / 91) | 57 ms (22 + 19 + 16) |
| 5 000 | 4 970 ms (1 204 / 598 / 1 216 / 1 198 / 500) | 70 ms (26 + 23 + 21) |
| 20 000 | 6 939 ms (1 178 / 1 287 / 1 251 / 1 224 / 1 481) | 136 ms (49 + 43 + 44) |

Cause du coût « avant » : la RLS évalue ses fonctions (`a_permission`, `est_membre_actif`,
`peut_consulter_*`) **par ligne** (~1–1,5 ms/ligne). 3 014 chantiers : la seule lecture
`chantiers` sous RLS prend **5,1 s** ; la RPC calcule tout en 81 ms (dirigeant) / 33 ms (chef
d'équipe, chantiers assignés).

Fiche chantier, dernière page de 10 000 pointages validés : lecture PostgREST sous RLS
(`order=date.desc&offset=9950`) **15,6 s** ; RPC d'identifiants 9 ms + relecture de 50 lignes
sous RLS (≈ 110–150 ms par l'API). `chantier_heures_synthese` : 20–25 ms à 10 000 pointages et
10 000 affectations.

### 7.2 Serveur (API, vrai PostgREST) — test d'échelle

| N | Avant : ms / octets reçus | Après (totaux + page 50 + 8 meilleurs) : ms / octets | Fiche : dernière page (ms) |
| ---: | --- | --- | ---: |
| 500 | 961 / 97 733 | 325* / 8 227 | 152 |
| 1 000 | 1 373 / 190 609 | 134 / 8 320 | 144 |
| 1 462 | 1 961 / 275 194 | 56 / 8 356 | 110 |
| 5 000 | 2 150 / 537 585 | 57 / 8 456 | 104 |
| 20 000 | 2 668 / 719 514 | 93 / 8 562 | 139 |

\* premier passage à froid. « Avant » plafonne à ~720 Ko **parce qu'il est tronqué**.

### 7.3 Navigateur réel (`next dev`, gérant pilote)

| N | Écran | Avant : durée / serveur (TTFB) / HTML / DOMContentLoaded | Après |
| ---: | --- | --- | --- |
| 1 000 | `/rentabilite` | 3,6 s / 3,0 s / 142 Ko / 3,2 s | 1,8 s / 1,1 s / 142 Ko / 1,2 s |
| 1 000 | fiche chantier | 5,0 s / 4,0 s / 646 Ko / 4,8 s | 2,5 s / 1,7 s / 239 Ko / 1,9 s |
| 5 000 | `/rentabilite` | 9,1 s / 7,9 s / 142 Ko / 8,4 s | 1,7 s / 1,1 s / 142 Ko / 1,5 s |
| 5 000 | fiche chantier | 14,4 s / 13,0 s / 1 438 Ko / 13,8 s | 4,1 s / 3,2 s / 572 Ko / 3,5 s |
| 20 000 | `/rentabilite` | 4,5 s / 3,8 s / 142 Ko / 4,3 s (faux) | 1,5 s / 0,8 s / 143 Ko / 1,0 s |
| 20 000 | fiche chantier | 18,2 s / 16,6 s / 2 523 Ko / 17,6 s (faux) | 10,1 s / 8,7 s / 1 656 Ko / 9,5 s |

`next dev` : durées absolues non représentatives de la Production ; ratios et volumes
significatifs. **Fiche à 20 000** : le poids restant ne vient plus des pointages (50 lignes) mais
des autres listes non paginées de la fiche, gonflées par le jeu (le client de charge porte
2 000 devis → sélecteur « devis du client » plafonné à 1 000 ; ~330 factures, ~330 dépenses,
~500 notes sur le chantier 01) — réserve R6 (§ 11). La dernière page de pointages coûte le même
temps que la première (10,5 s vs 10,1 s) : la pagination n'est plus le facteur.

## 8. Index

**Aucun index ajouté.** EXPLAIN ANALYZE (20 000 pointages, 3 014 chantiers) : les agrégats
utilisent `pointages_chantier_date_idx`, `affectations_chantier_idx`, `notes_frais_chantier_idx`,
les index `entreprise_id` existants ; le planner ne choisit un parcours séquentiel que lorsque le
chantier ou l'entreprise représente l'essentiel de la table (chantier 01 = 50 % des pointages),
ce qui est le bon choix. La page d'identifiants la plus profonde s'exécute en 9 ms. Aucun
index n'était justifié par une mesure.

## 9. Tests

| Niveau | Test | RED (base V7) | GREEN |
| --- | --- | --- | --- |
| pgTAP | `supabase/tests/gp_rentabilite_agregats_v1.test.sql` (60) | échec : fonctions absentes | **60/60** |
| Vitest (sans base) | `src/lib/rentabilite-lectures.test.ts` (10) : gardes de source (plus de `.from()` de tables volumineuses dans les 3 chemins de rentabilité ; fiche en RPC + relecture par ids), chargeurs, erreurs levées, pagination sans perte, règle copilote | 10/10 échecs | **10/10** |
| Vitest (vrai PostgREST, 5 volumes) | `src/lib/rentabilite.integration.test.ts` : vérité DB vs V7 rejoué vs corrigé (totaux, page, 8 meilleurs, toutes les lignes, IA, fiche, dernière page) ; garde « le jeu déclenche la troncature » | 5/5 échecs | **6/6** |
| Playwright (navigateur réel) | `tests/e2e/gp-rentabilite-data-correctness-v1.spec.ts` (5) : gérant `/rentabilite`, gérant fiche + dernière page, chef de chantier, ouvrier, autre entreprise | valeurs fausses (§ 3.2) | **5/5** à 1 000, 5 000, 20 000 |

Profils couverts : admin, dirigeant / gérant (autorisés) ; chef d'équipe, chef de chantier
(autorisés selon les règles existantes) ; ouvrier, comptable restreint (non autorisés / partiels) ;
autre entreprise ; sans identité, anon, désactivé, suspendu ; gros volume (1 462 en pgTAP,
jusqu'à 20 000 via PostgREST et navigateur).

## 10. DECISION_REQUIRED (choix conservateurs, documentés)

| # | Question | Choix retenu |
| --- | --- | --- |
| D1 | Le copilote comptait **tous** les pointages (validés ou non) alors que 14f1112 a fixé la règle produit « pointages validés » pour `/rentabilite` et l'IA (chemin oublié). | Règle produit appliquée (validés) ; le reste de la formule copilote inchangé. |
| D2 | `/rentabilite` et l'IA incluent les factures de type `avoir` dans le CA ; le copilote les exclut. | Chaque chemin garde sa règle ; la RPC expose `facture_ht_avoirs`. À arbitrer par le produit (signe des avoirs). |
| D3 | « Rentabilité salarié » / « rentabilité période » demandées : aucune surface ni règle n'existe. | Rien inventé ; les RPC n'ont pas de paramètre de période. |
| D4 | Le sélecteur d'analyse IA listait tous les chantiers (lus sous RLS, plafonnés à 1 000, 1,7 ms/ligne). | Il liste les chantiers affichés (page + 8 meilleurs). |
| D5 | `pointages.cout_horaire_applique` (coût figé par pointage) existe ; l'écran utilise le coût **actuel**. | Règle de l'écran conservée. |
| D6 | Erreur RPC | Bandeau / « indisponible » / message — jamais de total partiel. |

## 11. Limitations et réserves

- **R1 — Exports comptables** (`api/exports/comptabilite`) : écritures et **totaux TVA** tronqués
  au-delà de 1 000 lignes (`lignes_factures` en premier). P0 comptable recommandé, même motif.
- **R2 — Trésorerie, dépenses, CRM** : totaux sur lectures non bornées.
- **R3 — Stock** : `articles_stock_avec_prix` (setof) plafonnée ; alertes et valeur de stock.
- **R4 — Planning** (vue mois) et **exports notes de frais**.
- **R5 — `pointage/gestion`** : corrigé sur `claude/busy-ramanujan-cbyclu` (hors de cette branche).
- **R6 — Fiche chantier, autres sections** : devis du client, factures, dépenses, notes du
  chantier et compteur de documents non paginés (totaux devis / facturé / payé / dépenses faux
  au-delà de 1 000 lignes par chantier — improbable — et poids HTML, § 7.3).
- **R7 — Paie** : total de page présenté comme total (pas un problème de `max_rows`).
- La suite pgTAP de parité prend ~90 s : l'oracle de parité s'exécute **sous RLS**, c.-à-d. au
  coût par ligne que ce correctif supprime côté application.
- Mesures en `next dev` ; PostgREST / GoTrue locaux (pas l'hébergement Supabase).
- `apps/tools`, `apps/reserves`, `apps/colors` : non modifiés, non relancés (dépendances non
  installées dans ce bac à sable).

## 12. Migrations

Une seule : `supabase/migrations/20260930000301_rentabilite_agregats_chantiers_v1.sql` (360
migrations ; `verify:migrations` OK ; attendus Preview resynchronisés par
`npm run sync:train-expectations`, `verify:train-expectations` OK). Idempotente
(`create or replace`, `revoke`/`grant` rejouables), aucune donnée modifiée, aucune table ni
policy touchée.

**Collisions potentielles pour V8** (branches post-V7 sur `origin`, relevé du 2026-09-30) :

| Horodatage | Branche(s) | Risque |
| --- | --- | --- |
| 20260929000101 | `kind-mayer-w4wfy6` (rgpd_data_export_portability) | — |
| 20260929000801 | `kind-tesla-0i0818` (per_app_commercial_suspension) | — |
| 20260929001301 | `blissful-thompson-ipjcxl`, `compassionate-volta-cnbzjs` (même fichier) | — |
| **20260930000101** | `busy-ramanujan-cbyclu` (pointages_gestion_totaux_mois) **et** `gracious-curie-135pix` (rate_limit_consultation_connexion) | **collision entre elles** : même préfixe, deux fichiers → renuméroter l'une en V8 |
| 20260930000102 | `busy-ramanujan-cbyclu` (modifier_facture_brouillon) | — |
| **20260930000301** | **cette branche** | aucune collision relevée |
| 20260930001401 | `blissful-thompson-ipjcxl` (tools_releve_metre_estimation) | — |

Ordre relatif sans dépendance : 20260930000301 ne dépend que d'objets V7 (`a_permission`,
`est_membre_actif`, `peut_consulter_chantier`, tables métier) et n'en redéfinit aucun ;
compatible avec 20260930000101 (fonctions de noms distincts). Si V8 converge les deux
correctifs pointages, garder leurs fonctions séparées (pas de redéfinition croisée).

## 13. Non-régression

| Contrôle | Résultat |
| --- | --- |
| pgTAP, suite complète (154 fichiers, base reconstruite avec les 360 migrations) | **145 propres, 4 582 tests** ; les 9 non propres sont exactement ceux de V7 (7 suites Studio, `platform_stripe_state_attestation_r72` — pgsodium réel absent, `elsatia_tools_cloud_sync_entitlement_closure_v1` — `permission denied for table tools_projects`), **identiques sur la base V7 sans cette migration**. Factures, devis, pointages, planning, comptabilité / notes de frais, chantiers (CH-08), RGPD : propres. **0 régression.** |
| Recette backend pilote (`pilot_acceptance_v3.sh`, 360 migrations, vrai GoTrue + PostgREST) | **70 PASS / 0 FAIL** (+ 1 MANUAL_EXPECTED) |
| Playwright pilote v2 + v3 (connexion 5 profils, gardes d'URL, chantier / devis / facture / planning / pointage) | voir § 13.1 |
| Vitest racine | 192 fichiers, **2 409 tests** passés (3 fichiers d'intégration ignorés sans pile) |
| typecheck (`tsc --noEmit`, racine) | 0 erreur |
| lint (`eslint`, racine) | 0 erreur ; 15 avertissements préexistants, aucun dans les fichiers modifiés |
| build GP (`npm run build:gestion-pro`) | ✅ exit 0 |
| `verify:migrations`, `verify:train-expectations` | OK |

### 13.1 Playwright pilote

`pilot-acceptance-v2.spec.ts` + `pilot-acceptance-v3.spec.ts` (pile pilote de cette mission,
mock Storage compris, 360 migrations, PostgREST `db-max-rows = 1000`, jeu de charge purgé
avant la passe) : **32/32 passés** (3,5 min). Puis `gp-rentabilite-data-correctness-v1.spec.ts`
rejoué sur la même pile après ces parcours : 5/5 (la vérité de marge avait bougé de
1 133 201,12 € à 1 132 992,32 € du fait des données créées par la recette pilote — l'écran
suit, au centime).

## 14. Reproduire

```bash
# Base + pgTAP (pgTAP 1.3.3 et pg_prove installés à part)
scripts/local-postgres-bootstrap/rebuild_db.sh gp_green
cd supabase/tests && pg_prove -d gp_green gp_rentabilite_agregats_v1.test.sql

# Échelle, vrai PostgREST (db-max-rows = 1000) : une base par volume
createdb -T <base V7 + fixture isolation_multitenant> rent_20000
psql -d rent_20000 -v entreprise=a0000000-0000-0000-0000-000000000001 -v n=20000 < scripts/perf/rentabilite_charge.sql
scripts/perf/postgrest_local.sh rent_20000 3015
GP_RENTABILITE_VOLUMES="20000=http://localhost:3015=rent_20000" npx vitest run src/lib/rentabilite.integration.test.ts

# Navigateur réel : pile pilote (GoTrue + PostgREST max-rows 1000 sur :3001 + proxy :54321 + next dev :3100)
scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh pilot_gp
scripts/perf/postgrest_local.sh pilot_gp 3001 "$(cat /tmp/gotrue-build/jwt_secret.txt)"   # ajoute db-max-rows = 1000
npx next dev -p 3100   # .env.local : URL :54321, clés signées par jwt_bridge.mjs
PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome E2E_BASE_URL=http://localhost:3100 \
  GP_RENT_DB=pilot_gp GP_RENT_POINTAGES=5000 \
  npx playwright test tests/e2e/gp-rentabilite-data-correctness-v1.spec.ts --project=desktop-chromium --workers=1
psql -d pilot_gp < scripts/perf/rentabilite_charge_purge.sql   # avant de changer de volume
```

Gestes de test uniquement : report de fin d'essai de la fixture pilote, purge du limiteur de
connexion, `max_locks_per_transaction = 1024` sur le serveur local (le trigger
`trg_verifier_heures_affectation` prend un verrou consultatif par affectation insérée : 20 000
en une transaction de fixture).
