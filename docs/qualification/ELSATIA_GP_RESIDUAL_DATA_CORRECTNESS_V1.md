# ELSATIA GP — Residual Data Correctness > 1 000 (V1)

| | |
|---|---|
| Mission | Dernier audit ciblé Gestion Pro : éliminer toute lecture non bornée qui rend encore des données fausses ou tronquées au-delà de 1 000 lignes (`max_rows` PostgREST) |
| Base | `integration/elsatia-canonical-train-v8` @ `53b4bc7` |
| Lots intégrés (§1) | Finance `claude/confident-brown-sndsqb` @ `592fb32`, Rentabilité `claude/festive-turing-7zqcce` @ `442c3fc`, Data Correctness `claude/busy-ramanujan-cbyclu` @ `7797e8f` |
| Branche | `claude/optimistic-hopper-0ytout` |
| Train | **382 migrations**, dernière `20260930000404` (V8 : 375 → +3 des lots → +4 de ce lot) ; `verify:migrations` ✅, `verify:train-expectations` ✅ |
| Moteur de preuve | PostgreSQL 16.14 réel + train complet (`rebuild_db.sh`), **PostgREST v12.2.3 réel avec `db-max-rows = 1000`**, pgTAP 1.3, Vitest 4, Playwright + Chromium 1194, Gestion Pro compilé (`next build` + `next start`) |
| Règle | `max_rows` **jamais** relevé ; corrections par RPC / agrégats en base / pagination / exports servis en base |
| Verdict | **ELSATIA GP DATA CORRECTNESS COMPLETE** (§12) |

---

## 1. Intégration des lots qualifiés (pas de cherry-pick aveugle)

Les trois lots n'étaient pas dans V8. Ils ont été fusionnés (`--no-ff`) dans l'ordre Finance → Rentabilité →
Data Correctness, chaque conflit tranché sur le fond :

| Conflit | Lots | Décision |
|---|---|---|
| `chantiers/[id]/page.tsx` | Finance (RPC `chantier_donnees_chiffrees` : listes complètes) × Rentabilité (`chantier_heures_synthese` + pointages paginés) | Heures : Rentabilité (agrégat + pagination, plus robuste). Factures / dépenses / notes : Finance au moment de la fusion, **puis remplacé par ce lot** (§4.5) : la lecture complète rendait 11 Mo et 74 s pour un chantier de 20 000 pièces. |
| `pointage/gestion/page.tsx` | Finance (mois entier en jsonb) × Data Correctness (totaux en base + pagination) | Data Correctness : coût indépendant du volume. `pointages_equipe_periode` (Finance) reste en base, testée par son pgTAP. |
| Docs du train (pack, runbook, DB verify) | les trois | Version V8 conservée puis recomptée par `npm run sync:train-expectations` (382 / `20260930000404` / 37 contrôles). |

Les numéros de migration des lots sont conservés (`…0813-816`, `…0930000101/102/301`) : monotones après V8 et rejoués
sans erreur (§9). Les suites des lots restent vertes sur le train final : Finance 237/237, Rentabilité 60/60,
Pointages 43/43, Facture brouillon 34/34 (§9).

## 2. Inventaire complet

Méthode : (1) balayage outillé de **289** chaînes `.from(...).select(...)` sans `range` / `limit` / `single` /
`head` / filtre `id` dans `src/` ; (2) lecture humaine des écrans nommés par la mission (fiches client,
sous-traitant, véhicule, outil, chantier et ses sections, notes de frais, paie, plateforme) ; (3) deux audits
indépendants (exports ; écrans secondaires paie / banque / plateforme / CRM / tableau de bord / listes) ;
(4) **recette navigateur à 20 000 lignes**, qui a révélé la classe « listes de choix » et deux défauts de plan
(§7.3). Classement : **DÉFAUT** = total / compte / liste présentée complète, faux ou tronqué en silence ;
**BORNÉ** = limite volontaire et annoncée à l'écran ; **OK** = lecture complète ou petite par construction.

### 2.1 Défauts trouvés et corrigés (tous prouvés RED puis GREEN, §3)

| # | Chemin | Valeur fausse avant | Cause | Correctif |
|---|---|---|---|---|
| F1 | Fiche client `/clients/[id]` | Facturé, encaissé, reste dû ; liste des chantiers | `factures` du client lues sans borne, additionnées dans Next ; chantiers ≤ 1 000 | `gp_client_synthese` ; 5 derniers devis / factures + « N au total » ; chantiers par curseur (`gp_client_chantiers_page`) |
| F2 | Fiche sous-traitant | Missions actives, prévisionnel HT, facturé HT / réglé TTC ; listes | idem sur `sous_traitants_chantiers` et `depenses_fournisseurs` | `gp_sous_traitant_missions_synthese`, `gp_depenses_synthese` ; listes par curseur |
| F3 | Fiche véhicule | Coût facturé ; relevés km ; factures | idem | `gp_depenses_synthese(p_vehicule_id)` ; curseurs |
| F4 | Fiche outil | Coût facturé ; mouvements ; factures | idem | `gp_depenses_synthese(p_outil_id)` ; curseurs |
| F5 | Fiche chantier | « Photos & documents (N) » plafonné à 1 000 ; listes notes / factures fournisseurs complètes (11 Mo à 20 000) | `documents_chantier` sans borne ; RPC à listes complètes | `gp_chantier_documents_page` (nombre exact + page) ; `chantier_synthese_chiffree` (totaux + 50 récentes) ; factures fournisseurs par curseur |
| F6 | `/chantiers/[id]/documents` | Photos au-delà de 1 000 invisibles ; 51 s pour compter 20 000 photos sous RLS | lecture complète, policy par ligne | page servie par `gp_chantier_documents_page` (visibilité par audience évaluée une fois) |
| F7 | DOE (écran **et** manifeste figé `doe_generations`) | Documents, articles et fiches techniques omis au-delà de 1 000 — **export figé incomplet** | trois lectures plafonnées | `gp_doe_contenu` (contenu complet) ; refus de figer si lecture en erreur |
| F8 | `/paie/[id]` | Cartes « Indemnités déplacements », « Primes », « Notes de frais / acomptes » = somme des **25 dossiers de la page** ; « Contrôles (N) » plafonné | addition sur la page affichée | `paie_periode_synthese` (tous les dossiers filtrés), `paie_periode_dossiers_page`, `paie_anomalies_page` |
| F9 | Export de paie (XLSX / CSV / ZIP) | Pièces du ZIP et `manifeste.json` omises au-delà de 1 000, **export journalisé réussi** ; dossiers > 1 000 | `.in(dossierIds)` sans borne | `paie_export_contenu` (dossiers + pièces complets, visibilité RLS) |
| F10 | `/notes-frais` | Groupes de validation par salarié (nombre, total, « à contrôler ») sur les **300** notes les plus récentes : une note en attente plus ancienne disparaissait de la validation | `.limit(300)` puis regroupement | `notes_frais_synthese_employes` + liste par curseur `notes_frais_page` |
| F11 | `/crm` | « Factures à relancer », **« Reste à encaisser »**, « Rappels ouverts » (sur 100 communications) | listes plafonnées | `gp_crm_synthese` ; relances : 200 plus anciennes échéances, signalé |
| F12 | `/dashboard` | Chantiers par statut, actifs, en retard ; alertes de stock (1 000 articles pris dans un ordre arbitraire) ; alertes véhicules (lus sans borne) et outils ; effectif présent | lectures sans borne | `gp_dashboard_chantiers`, `gp_alertes_stock`, `gp_alertes_parc`, `gp_effectif_actif` ; livraisons filtrées par date |
| F13 | `/paiements-bancaires` | Notes validées les plus anciennes (donc les plus urgentes) jamais proposées au-delà de 100 ; lot de plus de 250 paiements **tronqué sans erreur** | `limit(100)` décroissant ; `.slice(0, 250)` | Plus anciennes d'abord + mention ; lot > 250 **refusé** avec message |
| F14 | Plateforme — fiche entreprise | « Tarifs par poste » vide / partiel pour les tenants classés après la 1 000ᵉ ligne | `plateforme_postes_tarifs()` renvoie les postes de **toute** la plateforme (table → plafonnée) puis filtre JS | `plateforme_postes_tarifs_entreprise(p_entreprise_id)` |
| F15 | Plateforme — applications | « Entreprises autorisées », « Utilisateurs habilités » | deux tables globales lues sans borne | `plateforme_applications_compteurs` |
| F16 | Plateforme — support | Les messages les **plus récents** masqués au-delà de 1 000 | RPC en ordre croissant plafonnée | 500 plus récents remis dans l'ordre + mention |
| F17 | Plateforme — assistance | Liste tenants × applications tronquée dès ~250 tenants | lecture globale | lectures complètes (`lireToutesLesLignes`) |
| F18 | `/messagerie` | Les **derniers** messages d'un fil masqués au-delà de 1 000 | ordre croissant plafonné | derniers 200 d'abord, curseur vers les plus anciens |
| F19 | `/interventions`, `/appels-offres` | Bons / dossiers récents et à venir masqués (tri croissant plafonné) | idem | ouverts (bornés, signalés) + historique clos par curseur |
| F20 | `/commandes`, situations (`/facturation-avancee`) | Liste complète plafonnée sans le dire | idem | curseur |
| F21 | `/employes` | Droits par poste faux dès 11 postes complets (100 droits × poste) ; effectif | `permissions_poste` sans borne | lectures complètes |
| F22 | `/depot` | « N article(s) » par zone | idem | `chargerArticlesStock` (complet) |
| F23 | `/flotte`, `/outillage` (listes) | « N véhicule(s) · X échéance(s) », « N outil(s) · X vérification(s) échue(s) · Y hors service » | idem | `gp_parc_synthese` + curseur croissant |
| F24 | `/fournisseurs`, `/sous-traitants` (annuaires) | Annuaire complet plafonné sans le dire | idem | curseur (nom, id) |
| F25 | **Listes de choix** (≈ 25 écrans : chantiers, salariés, clients) | Choix impossible au-delà de 1 000 ; 10 à 43 s par écran à 20 000 | tri par nom sous RLS, plafonné | `gp_options_chantiers`, `gp_options_employes`, `gp_options_clients` (complets) |
| F26 | Fiches véhicule / outil / sous-traitant (profil sans droit achats) | ~25 s pour un résultat vide | lecture d'achats lancée sans le droit, RLS par ligne | lecture conditionnée au droit |
| F27 | Onboarding | `count: "exact"` sous RLS sur 5 tables pour de simples « fait / pas fait » | | existence (`limit`) |
| F28 | Sélecteurs de facturation avancée | Devis acceptés / factures créditables plafonnés sans le dire | | bornés (500) + mention et lien |

### 2.2 Chemins audités sans défaut (preuve de lecture)

Exports comptables et TVA, trésorerie, `/depenses`, stock, inventaires, export ZIP des notes de frais (lot Finance,
vérifiés) ; `/rentabilite`, heures chantier (lot Rentabilité) ; `/pointage/gestion` (lot Data Correctness) ;
export RGPD (`exporter_donnees_entreprise`, jsonb) ; quota IA (`journal_ia_consommation`) ; fiche fournisseur (20
dernières factures annoncées) ; `/devis`, `/factures` (RPC jsonb paginées) ; fiche paie salarié, notes de frais
`[id]`, téléchargements unitaires (une ligne).

### 2.3 Bornés par conception (annoncés ou hors volumétrie réaliste)

| Chemin | Borne | Justification |
|---|---|---|
| Export ZIP notes de frais | 500 notes, sinon 413 | lot Finance, refus explicite |
| PDF devis / factures | lignes d'**un** document | > 1 000 lignes sur un seul document non réaliste |
| Lot de virements | 250 ordres | refusé au-delà (F13) |
| Congés, grands déplacements, journaux | 100–200 derniers | listes d'activité récente, aucun total dérivé |
| RPC plateforme « une ligne par tenant » (`plateforme_entreprises`, usages, besoins, relevé de facturation) | 1 000 tenants | hors volumétrie actuelle ; à revoir avant 1 000 tenants (§11) |

## 3. Preuve RED (avant) — PostgREST réel, `max_rows = 1000`

Jeu : `scripts/qualification/gp-residual/seed.sql` — cinq entreprises de **500, 1 000, 1 462, 5 000, 20 000**
lignes **par chemin** (factures, devis et chantiers d'un client ; factures et missions d'un sous-traitant ; factures
d'un véhicule, d'un outil et d'un chantier ; relevés, mouvements, documents, notes de frais, dossiers / anomalies /
pièces de paie, communications CRM, articles et sorties de stock, messages, interventions, appels d'offres,
commandes, outils, véhicules) + un tenant témoin. Le chemin historique est **rejoué à l'identique** (mêmes `select`,
même addition) par `src/lib/gp-residuel.postgrest.test.ts`, qui exige : exact ≤ 1 000, **faux > 1 000**.

| Chemin (vérité PostgreSQL / affiché avant) | 500 | 1 000 | 1 462 | 5 000 | 20 000 |
|---|---|---|---|---|---|
| Fiche client — facturé | ✔ | ✔ | 2 596 122,16 / **1 776 955,29** | 8 903 071,21 / **1 783 184,94** | 35 642 637,34 / **1 778 764,14** |
| Fiche sous-traitant — facturé HT | ✔ | ✔ | 1 412 661,56 / **967 040,45** | 4 842 244,64 / **963 729,45** | 19 400 294,43 / **971 552,58** |
| Fiche véhicule — coût TTC | ✔ | ✔ | ✘ | ✘ | ✘ (23 303 603,76 attendus) |
| Fiche chantier — nombre de documents | ✔ | ✔ | 1 462 / **1 000** | 5 000 / **1 000** | 20 000 / **1 000** |
| DOE — articles distincts | ✔ | ✔ | ✘ | ✘ | ✘ |
| Paie — primes de la période | 149 399,25 / **7 807,80** | 300 600,30 / **7 807,80** | 438 287,85 / **7 807,80** | 1 500 899,40 / **7 807,80** | 6 005 249,25 / **7 807,80** |
| Paie — anomalies | ✔ | ✔ | ✘ (1 000) | ✘ | ✘ |
| Notes de frais — « à contrôler » | 189 / **114** | 375 / **113** | 549 / **112** | 1 875 / **115** | 7 500 / **120** |
| CRM — reste à encaisser | ✔ | ✔ | 1 735 304,02 / **1 636 211,74** | 5 940 068,11 / **1 590 803,95** | 23 764 990,33 / **1 573 686,93** |
| Messagerie — dernier message affiché | ✔ | ✔ | **absent** | **absent** | **absent** |
| Droits par poste (1 304 lignes) | **1 000** | **1 000** | **1 000** | **1 000** | **1 000** |
| Outils — « N outil(s) » (V + 1) | ✔ | **1 000** / 1 001 | **1 000** | **1 000** | **1 000** |
| Effectif actif | ✔ | ✔ | **1 000** | **1 000** | **1 000** |

✔ = exact (sous le plafond) ; ✘ = faux, valeurs dans `witnesses/gp-residual-v1/01-postgrest-mesures.jsonl`.
Paie et notes de frais sont fausses **dès 500** : bornes de page (25) et de liste (300), pas seulement `max_rows`.

## 4. Corrections

Aucune modification de `max_rows`. Quatre migrations additives (aucune table modifiée, aucune donnée réécrite) :

| Migration | Contenu |
|---|---|
| `20260930000401_gp_fiches_agregats_v1` | `gp_exiger_membre`, `gp_depenses_synthese`, `gp_client_synthese`, `gp_client_chantiers_page`, `gp_sous_traitant_missions_synthese`, `gp_chantier_documents_audiences`, `gp_chantier_documents_page`, `chantier_synthese_chiffree`, `gp_doe_contenu` ; index de curseur (entreprise, parent, date, id) |
| `20260930000402_gp_pilotage_agregats_v1` | `paie_periode_synthese`, `paie_periode_dossiers_page`, `paie_export_contenu`, `notes_frais_synthese_employes`, `notes_frais_page`, `gp_crm_synthese`, `gp_dashboard_chantiers`, `gp_alertes_stock` |
| `20260930000403_plateforme_agregats_par_tenant_v1` | `plateforme_postes_tarifs_entreprise`, `plateforme_applications_compteurs` |
| `20260930000404_gp_options_selecteurs_v1` | `gp_options_chantiers / _employes / _clients`, `gp_parc_synthese`, `gp_alertes_parc`, `gp_effectif_actif`, `paie_anomalies_page` ; index CRM et annuaires ; **statistiques étendues** (dépendances entreprise ↔ parent, §7.3) |

Côté Next : `src/lib/fiches-agregats.ts` (synthèses, pages RPC, curseurs `lirePageCurseur` / `lirePageCroissante` /
`lirePageParNom`, `borner`, options) et `src/lib/pilotage-agregats.ts` ; ≈ 45 écrans modifiés. Principes :

1. **Totaux, comptes, KPI** : jsonb calculé par PostgreSQL (un scalaire n'est jamais plafonné). En cas d'erreur
   l'écran affiche « indisponible », **jamais un total partiel** ; un DOE ou un export de paie en erreur échoue.
2. **Listes** : curseur (date desc NULL en tête, id desc — ordre natif des index), coût constant par page. Un
   `offset` aurait fait évaluer la RLS de toutes les lignes sautées.
3. **Listes volontairement bornées** : `limite + 1` lu, mention à l'écran s'il en existe d'autres (`borner`).
4. **Listes de choix** : RPC complètes.

## 5. Exactitude — comparaison à la vérité PostgreSQL

Chaque chemin corrigé est égal **au centime** à la vérité superutilisateur (sans RLS ni plafond), aux cinq volumes :
**`gp-residuel.postgrest.test.ts` 50/50** (dernière exécution sur une base reconstruite du train final ;
`witnesses/gp-residual-v1/02-postgrest-vitest.log`). Le navigateur affiche ces mêmes valeurs (§8, Playwright).
Pagination : parcours complet par curseur sans doublon ni manque (chantiers du client, relevés km) ; première
page = dernier message ; page profonde à 20 000 en ≈ 9 ms.

## 6. Sécurité

- Toutes les fonctions : `SECURITY DEFINER`, `search_path = public` figé, `revoke … from public, anon`, `grant
  execute … to authenticated` ; appelant authentifié et membre actif exigé (`gp_exiger_membre`, 42501 sinon).
- **Parité RLS stricte** prouvée par pgTAP : chaque fonction renvoie exactement ce que la RLS des tables donne au
  même utilisateur (même calcul sous `authenticated`), pour **six profils** (admin, ouvrier, chef d'équipe,
  conducteur, comptable, dirigeant) : achats, factures, devis, sous-traitants, chantiers (assignés ou non),
  documents par **audience**, notes de frais (trois policies), **paie** (dossiers, anomalies, pièces
  confidentielles), CRM, stock, parc, effectif. Un membre sans le droit reçoit des totaux nuls, comme la RLS.
- **Tenant** : un administrateur du tenant B est refusé (42501) sur **chaque** fonction appliquée au tenant A ;
  sans identité : refus ; anon : aucun EXECUTE (vérifié fonction par fonction).
- **Plateforme** : `plateforme_postes_tarifs_entreprise` exige `consulter_facturation` (refus pour tout membre de
  tenant) ; résultat = ancienne RPC filtrée, aucun poste d'un autre tenant ; `plateforme_applications_compteurs`
  réservé à `est_plateforme_admin()`.
- **Banque** : lot de virements > 250 refusé (plus de troncature) ; RLS bancaire inchangée.
- **RH** : `gp_options_employes` ne rend que prénom, nom, poste, statut (colonnes de la policy de base), jamais les
  colonnes protégées par `employes_fiche`.
- DB verify (37 contrôles) : contrôles de sécurité verts (anon, authenticated, RPC) ; les deux seuls « f » sont des
  données d'environnement absentes d'une base nue (URL Preview, propriétaire plateforme), identiques sur V8.

## 7. Performance

### 7.1 Requêtes (PostgREST réel, avant → après)

« Avant » : première exécution complète, schéma sans les index composites de ce lot
(`01a-postgrest-mesures-premiere-execution.jsonl`). « Après » : exécution finale sur le train final
(`01-postgrest-mesures.jsonl`, valeurs du même ordre). Sur le train final, les requêtes historiques profitent aussi
des nouveaux index (sous-traitant à 20 000 : 3,9 s au lieu de 33,7 s), mais elles restent **fausses** au-delà
de 1 000 lignes.

| Chemin | 1 462 | 5 000 | 20 000 |
|---|---|---|---|
| Fiche client (totaux) | 2,3 s → 12 ms | 7,7 s → 22 ms | 1,8 s* → 30 ms |
| Fiche sous-traitant (totaux) | 5,9 s → 13 ms | 20,9 s → 19 ms | **33,7 s → 0,12 s** |
| Fiches véhicule / outil | 4,8 s → 13 ms | 9,4 s → 14 ms | **42,5 s → 0,11 s** |
| Fiche chantier — documents | 3,5 s → 17 ms | 11,5 s → 14 ms | 2,7 s* → 28 ms |
| Fiche chantier — synthèse chiffrée (Finance v1 → ce lot) | 4,4 s / 0,8 Mo → 34 ms / 28 Ko | 14,7 s / 2,7 Mo → 42 ms | **74,6 s / 11 Mo → 0,17 s / 28 Ko** |
| DOE complet | — | 0,3 s | 0,9 s |
| Paie — indicateurs / page de dossiers | 3,0 s → 21 / 18 ms | 10,0 s → 26 / 38 ms | **40,9 s → 0,09 / 0,12 s** |
| Paie — export complet | — | 58 s (lecture paginée) → 0,6 s | → 1,7 s |
| CRM | 1,9 s → 16 ms | 6,2 s → 25 ms | 1,7 s* → 27 ms |
| Tableau de bord — chantiers | 3,3 s → 16 ms | 12,1 s → 25 ms | **53,0 s → 0,14 s** |

\* plafonné à 1 000 lignes, donc rapide **et faux**.

### 7.2 Listes à 20 000 (première page, administrateur)

Notes de frais 70,2 s → 0,14 s ; messages 53,4 s → 0,41 s ; commandes 35,2 s → 0,16 s ; interventions 17–19 s →
0,08–0,33 s ; appels d'offres 13,8 s → 0,07 s ; paiements (notes) 7,8 s → 0,11 s ; salarié sur ses notes : 219 s →
0,04 s (`04-listes-20000-avant/apres.txt`).

### 7.3 Défauts de plan trouvés par la recette navigateur

1. **Listes de choix** (F25) : 10 à 43 s par écran à 20 000 → RPC (< 0,2 s).
2. **Corrélation entreprise ↔ parent** : à 1 462 / 5 000, le planificateur multipliait les sélectivités de
   `entreprise_id` et de la colonne parente, estimait 76 lignes pour 1 462 et choisissait bitmap + tri : RLS sur
   toutes les lignes (**5,8 s** pour 51 missions). Index (entreprise, parent, date, id) + **statistiques étendues
   `dependencies`** : **0,17 s** (plan vérifié en générique et en personnalisé).

### 7.4 Pages complètes (navigateur, TTFB, base `gp_e2e`)

| Page | 1 462 | 5 000 | 20 000 |
|---|---|---|---|
| Fiche client | 0,25 s | 0,17 s | 0,25 s |
| Fiche sous-traitant | 0,74 s | 0,65 s | 1,23 s |
| Fiche véhicule / outil | 2,9 / 2,8 s | 0,45 / 0,41 s | 0,84 / 1,20 s |
| `/flotte`, `/outillage` | 0,37 / 0,48 s | 0,35 / 0,29 s | 0,30 / 0,41 s |
| Fiche chantier | 5,3 s | 0,98 s | 1,56 s |
| Documents du chantier | 0,25 s | 0,19 s | 0,26 s |
| DOE (dossier complet : 20 000 documents + 20 000 articles rendus) | 0,50 s | 1,37 s | 7,3 s |
| Paie (période) | 0,43 s | 0,39 s | 0,77 s |
| Notes de frais / CRM | 0,34 / 2,81 s | 0,38 / 0,27 s | 0,62 / 0,32 s |
| Tableau de bord | 0,39 s | 0,78 s | 2,9 s (8,2 s avant `gp_alertes_parc`) |

Avant correctifs, à 20 000 : sous-traitant 37 s, outil 43 s, notes de frais 37 s, CRM 37 s (selon la même
recette). Les ≈ 2,5 s résiduelles à 1 462 (fiche véhicule, CRM) viennent du coût que le planificateur prête aux
fonctions de policy (§11.3).

## 8. Tests

| Niveau | Résultat |
|---|---|
| pgTAP `gp_residuel_agregats_v1` (généré par `scripts/qualification/gp-residual/generer_pgtap.py`) — surface, parité RLS × 6 profils, cross-tenant, anon, plateforme ; 1 462 lignes par chemin | **303/303** (base neuve, train final) |
| Vitest PostgREST réel `gp-residuel.postgrest.test.ts` (RED rejoué + GREEN, 5 volumes, sécurité) | **50/50** |
| Vitest unitaires `fiches-agregats.test.ts` (curseurs, filtres, bornes ; CI sans base) | **10/10** |
| Playwright `gp-residuel-data-correctness-v1.spec.ts` (pile réelle `max_rows = 1000`, Gestion Pro compilé) | **12/12** (1 462 / 5 000 / 20 000) |

### 8.1 pgTAP

Parité sur une base reconstruite du train final (382 migrations) : **303/303** (`03-pgtap-parite-rls.log`) —
24 fonctions × (existence, anon sans EXECUTE, authenticated EXECUTE, SECURITY DEFINER + search_path), parité
RLS de chaque fonction pour les six profils, refus admin B sur A (14 fonctions), refus sans identité,
paramètres invalides, RPC plateforme.

## 9. Non-régression

| Contrôle | Résultat |
|---|---|
| Rejeu du train complet à froid | **382/382**, 0 erreur (plusieurs bases : `gpres`, `pgtap_fin*`, `gp_e2e`) |
| pgTAP suite complète (168 fichiers, base neuve) | **158 propres** ; non propres = les **9 connus de V8** (7 suites Studio du projet partagé, `platform_stripe_state_attestation_r72` — pgsodium réel absent, `elsatia_tools_cloud_sync_entitlement_closure_v1` — amorce) + ce lot exécuté sur une base construite juste avant `gp_parc_synthese` (relancé à part, §8.1). **0 régression.** |
| Factures, devis | `verrouiller_facture_emise`, `correctif_*_factures`, `fa08`, relances, `gp_facture_brouillon_modification_v1` 34/34, `devis_recalc_totaux_par_instruction_v1`, `workflow_devis_v1` : propres |
| Pointages, planning | `gp_pointages_totaux_mois_v1` 43/43, `pt08`, terrain mobile : propres |
| Rentabilité | `gp_rentabilite_agregats_v1` 60/60 |
| Finance | `finance_agregats_exactitude_v1` 237/237 |
| Notes de frais | `archivage_notes_frais_rls`, `fix_digest_search_path_audit_notes_frais` : propres |
| Chantier | `ch08`, `correctif_rls_ecriture_chantiers`, `medias_messagerie_chantiers` : propres |
| Isolation | `isolation_multitenant_*` (56 + 24 + 10) : propres |
| Vitest (racine) | **2 656** réussis (2 646 de V8 + 10 nouveaux), 0 échec ; suites PostgREST ignorées sans banc |
| `tsc --noEmit`, `eslint src tests` | 0 erreur (5 avertissements préexistants, aucun dans ce lot) |
| `next build` | ✅ |
| `verify:migrations`, `verify:train-expectations` | ✅ |

## 10. Livrables

- Migrations : `supabase/migrations/2026093000040{1,2,3,4}_*.sql`.
- Code : `src/lib/fiches-agregats.ts`, `src/lib/pilotage-agregats.ts`, écrans listés §2.1.
- Tests : `supabase/tests/gp_residuel_agregats_v1.test.sql` (+ générateur), `src/lib/gp-residuel.postgrest.test.ts`,
  `src/lib/fiches-agregats.test.ts`, `tests/e2e/gp-residuel-data-correctness-v1.spec.ts`.
- Banc : `scripts/qualification/gp-residual/seed.sql`, `tests/e2e/gp-residuel-pile-locale/preparer-base.sh`.
- Témoins : `docs/qualification/witnesses/gp-residual-v1/`.

## 11. Limites et recommandations (non bloquantes pour l'exactitude)

1. **DOE à 20 000 documents** : 8 s, car le dossier complet est rendu (c'est sa nature : document imprimable). La
   lecture en base prend 0,9 s.
2. **Accès direct par URL sans le droit du module** (ex. un ouvrier qui tape `/commandes`) : la page ne rend rien
   mais la RLS est évaluée sur chaque ligne (12–58 s à 20 000). Préexistant, sans fuite de données ; les modules
   sont protégés côté client (`ModuleAccessBoundary`). Recommandation : garde serveur par permission dans ces pages.
3. **Coût des fonctions de policy** : `a_permission` ≈ 1,2 ms par appel ; le planificateur la croit gratuite et
   suppose ⅓ de sélectivité. Fixer un `COST` réaliste (`a_permission`, `est_membre_actif`, `peut_consulter_*`)
   stabiliserait tous les plans sous RLS. Changement global non fait dans ce lot (portée hors mission) ; à
   qualifier séparément.
4. **Sélecteurs restants** sans total dérivé : fournisseurs, véhicules, outils, articles, prestations du
   catalogue (création de devis), salariés « tous statuts » de l'export des notes de frais. Au-delà de 1 000
   éléments, des choix manquent (pas de chiffre faux). Même correctif que F25 si la volumétrie l'exige.
5. **Plateforme ≥ 1 000 tenants** : les RPC « une ligne par tenant » (§2.3) devront passer en jsonb ou être paginées.
6. Banc : `scripts/perf/postgrest_local.sh` redéfinit le mot de passe **du cluster** du rôle `authenticator` ; ne
   pas le lancer pendant la pile e2e (elle ne se connecte plus). Utiliser une configuration PostgREST dédiée.

## 12. Reproduire

```bash
git checkout claude/optimistic-hopper-0ytout && npm ci && (cd tests/e2e/colors-pile-locale && npm ci)
pg_ctlcluster 16 main start; apt-get install -y postgresql-16-pgtap libtap-parser-sourcehandler-pgtap-perl
# pgTAP (parité RLS + suite complète)
scripts/local-postgres-bootstrap/rebuild_db.sh pgtap_res && su postgres -c "psql -d pgtap_res -c 'create extension pgtap with schema extensions'"
(cd supabase/tests && su postgres -c "pg_prove -d pgtap_res gp_residuel_agregats_v1.test.sql")
PGTAP_OUT=/tmp/pgtap scripts/qualification/pgtap-run-v3.sh pgtap_res
# PostgREST réel max_rows = 1000 + Vitest (RED rejoué / GREEN, 5 volumes)
scripts/local-postgres-bootstrap/rebuild_db.sh gpres && su postgres -c "psql -d gpres" < scripts/qualification/gp-residual/seed.sql
scripts/perf/postgrest_local.sh gpres 3011
GP_RESIDUEL_URL=http://localhost:3011 GP_RESIDUEL_DB=gpres npx vitest run src/lib/gp-residuel.postgrest.test.ts   # 50/50
# Navigateur (variables : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service HS256, NEXT_PUBLIC_SUPABASE_URL=
# http://127.0.0.1:54321, RATE_LIMIT_HMAC_KEY, ELSATIA_APPLICATION_ENV=local, POSTGREST_BIN, PW_CHROME_PATH)
tests/e2e/gp-residuel-pile-locale/preparer-base.sh gp_e2e
tests/e2e/finance-pile-locale/demarrer-pile.sh gp_e2e /tmp/gp-logs
npx next build && npx next start -p 3100 &
E2E_BASE_URL=http://127.0.0.1:3100 GP_E2E_DB=gp_e2e npx playwright test tests/e2e/gp-residuel-data-correctness-v1.spec.ts --project=desktop-chromium --workers=1   # 12/12
```

## 13. Verdict

**ELSATIA GP DATA CORRECTNESS COMPLETE**

Sur le périmètre audité (fiches client, sous-traitant, véhicule, outil, chantier et ses sections, DOE, notes de
frais, paie et son export, banque, CRM, tableau de bord, plateforme, listes et exports secondaires), chaque
chemin qui rendait un total, un compte ou une liste faux ou tronqué au-delà de 1 000 lignes a :

- une preuve rouge sous PostgREST réel plafonné à 1 000 ;
- un correctif sans relèvement de `max_rows` ;
- une preuve verte égale à la vérité PostgreSQL aux cinq volumes ;
- une parité RLS prouvée en pgTAP (six profils, tenant, anon, plateforme) ;
- une recette navigateur ;
- des performances mesurées utilisables à 20 000.

Les limites du §11 ne produisent aucun chiffre faux. Il s'agit de performance hors parcours autorisé, de
sélecteurs sans total dérivé et d'une échelle plateforme future.
