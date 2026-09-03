# ELSATIA — Modules à la carte — R3

Lot `ELSATIA-MODULES-A-LA-CARTE-R3-V1`. Socle des modules optionnels de Gestion Pro :
catalogue canonique + entitlement entreprise + garde serveur. **Aucun prix module, aucun
Stripe, aucune Production.** Migration additive `20260903000257_modules_a_la_carte_r3_v1.sql`.

Base : `feat/active-person-capacity-r1-v1` @ `9163978` (inclut R1 capacité personnes).

---

## 1. Modèle d'accès

```
ENTITLEMENT ENTREPRISE            HABILITATION / PERMISSION UTILISATEUR
(modules_entreprises              (rôle du poste : a_permission)
 OU modules_gestion_pro.plans_inclus)
        └──────────────┬───────────────────┘
                 a_acces_module_gestion_pro(entreprise, code, permission?)
```

- `public.modules_gestion_pro` — catalogue (19 modules, **sans prix**). Champs : `code`, `nom`,
  `categorie`, `statut_catalogue` (`actif` / `bientot` / `interne` / `non_vendable`),
  `mode_activation` (`entreprise` / `plan` / `consommation`), `multi_plateforme`,
  `offline_requis`, `donnees_persistantes`, `mode_apres_desactivation`
  (`lecture_seule` / `inaccessible` / `export_uniquement`), `permissions_couvertes[]`,
  `plans_inclus[]` (source canonique d'inclusion forfait).
- `public.modules_entreprises` — entitlement : `(entreprise_id, module_code)`, `actif`,
  `origine` (`plan` / `achat` / `offert` / `essai` / `admin` / `migration`), `source`
  (`admin_plateforme` / `stripe` / `systeme` / `plan`), `valide_du` / `valide_jusqu`,
  `reference_externe` (R4 Stripe), `motif`. **RLS FORCE + aucune écriture directe
  `authenticated`** — mutation exclusivement via RPC plateforme AAL2.
- `public.historique_modules_entreprises` — append-only (entreprise, module, action, origine,
  source, reference_externe, avant/après jsonb, acteur, motif, date).

---

## 2. Résolution serveur (fait autorité)

| Fonction | Rôle |
|---|---|
| `module_gestion_pro_actif_entreprise(entreprise, code)` | entitlement explicite **dans sa fenêtre** OU (module `actif` ET forfait ∈ `plans_inclus`) |
| `a_acces_module_gestion_pro(entreprise, code, permission?)` | tenant + module actif + (option) permission métier |
| `acces_module_pour_permission(entreprise, permissions[])` | une permission « porte d'entrée » est-elle débloquée par un module **acheté** (statut `actif`) — appelée par le proxy **en OU** avec `permissionIncluseDansOffre` |
| `modules_entreprise_etat(entreprise)` | vue consolidée UI (inclus / actif / disponible) |
| `plateforme_definir_module_entreprise(...)` | activation/désactivation — `est_plateforme_admin()` **+ `plateforme_exiger_session_aal2()`** + historique |

---

## 3. Non-régression commerciale (§14–§15)

R3 **n'enlève jamais** un accès. Le proxy (`src/lib/supabase/proxy.ts`) calcule désormais :

```
droitsInclus = permissionIncluseDansOffre(droit, offre)     // inchangé
            || acces_module_pour_permission(entreprise, droitsAcces)  // R3, ajout en OU
```

Un client qui accède aujourd'hui à une fonction incluse dans son offre continue exactement
comme avant. Le seul comportement nouveau : un **petit forfait** peut recevoir un module
(achat / offert / essai / geste plateforme) qui débloque sa permission porte-d'entrée, sans
changer de forfait. Aucune ligne `modules_entreprises` n'est créée pour l'existant (l'inclusion
forfait est dérivée dynamiquement de `plans_inclus`), donc un downgrade ne fige rien.

### Matrice modules ↔ existant

| Module | Fonction existe | Accès actuel | Accès R3 | Migration |
|---|---|---|---|---|
| `chantier`, `ia` | oui (SOCLE) | toutes offres | inchangé (`plans_inclus` = toutes) | aucune |
| `pointage`, `notes_frais` | oui | Pro+ (perm dans l'offre) | inchangé + achat possible sur Mini | aucune |
| `stock`, `vehicules`, `materiel`, `rentabilite_avancee` | oui | Business+ | inchangé + achat possible en dessous | aucune |
| `planning_avance`, `scan_ocr`, `safety`, `forms`, `maintenance`, `signature`, `automations`, `facturation_electronique` | non / partiel | — | catalogue `bientot`, jamais débloqué par un plan | aucune |
| `connect` | route existante déjà `DISABLED` | bloqué | catalogue `bientot` (entitlement explicite possible) | aucune |
| `sauvegarde_renforcee` | non | — | `non_vendable` | aucune |
| `stockage_supplementaire` | capacité | option billing | `interne` (hors UI modules) — cf. R2 capacité | aucune |

---

## 4. Cas particuliers

- **IA** (§17) : R3 gère seulement « l'entreprise a droit au module IA ». La consommation
  (quota `ia_politique_quota`, `journal_ia`, packs) reste dans son système actuel, inchangé.
- **Stockage supplémentaire** (§18) : classé `interne` / `mode_activation = consommation` —
  c'est une capacité, pas un module d'UI ; exclu de `modules_entreprise_etat`.
- **Sauvegarde renforcée** (§19) : `non_vendable` tant que le service n'existe pas.
- **Facturation électronique** (§20) : code `facturation_electronique` réservé, statut `bientot`,
  aucune fonction réglementaire fictive.
- **Signature** (§21) : entitlement préparé, aucune infrastructure de signature implémentée.
- **Connect** (§22) : entitlement préparé ; l'accès réel restera gouverné par les habilitations
  applicatives dédiées de l'Integration Core, jamais par un rôle GP simplifié.
- **Modules terrain** (§23) : `chantier`, `pointage`, `scan_ocr`, `safety`, `forms` portent
  `offline_requis = true` et `multi_plateforme = true`.

---

## 5. Expiration & désactivation

- `valide_jusqu` dépassé → `module_gestion_pro_actif_entreprise` renvoie `false`
  automatiquement ; **la ligne est conservée** (historique).
- Désactivation (`plateforme_definir_module_entreprise(..., p_actif := false)`) → le module
  devient inactif, **aucune donnée supprimée** (test pgTAP : `articles_stock` de l'entreprise
  intacts). `mode_apres_desactivation` par module (`lecture_seule` pour stock / maintenance /
  safety / forms, `export_uniquement` pour scan/forms/signature/e-facture, `inaccessible`
  sinon) — à câbler dans l'UI des modules concernés lors de leur mise en vente.
- Portabilité (§13) : les données restent dans leurs tables (RLS inchangée, `entreprise_id`
  conservé) ; export via le mécanisme RGPD existant ; réactivation = nouvelle ligne active
  sans migration de données. Durée de conservation : politique générale de l'entreprise, non
  fixée juridiquement ici.

---

## 6. Sécurité

- `modules_entreprises` : RLS FORCE, lecture membre/plateforme, **zéro grant d'écriture** —
  `authenticated` ne peut pas s'accorder un module (test pgTAP).
- RPC de mutation : `est_plateforme_admin()` + AAL2 obligatoires ; `service_role` et `anon`
  exclus de toutes les RPC module.
- `acces_module_pour_permission` ne débloque que les modules `statut_catalogue = 'actif'`
  explicitement acquis — un module `bientot` ne s'ouvre jamais par ce chemin.
- Feature flag ≠ entitlement (§16) : `entreprise_feature_flags` (rollout technique / beta) reste
  gérable par un gérant `gerer_parametres` ; `modules_entreprises` (droit commercial) non.
  Test pgTAP : un flag actif ne crée aucun entitlement.

---

## 7. Handoff R4 (Stripe) — préparé, non branché

- `plateforme_definir_module_entreprise(..., p_source := 'stripe', p_reference_externe := <subscription_item.id>, p_origine := 'achat')`
  est le point d'entrée du futur webhook.
- Événements Integration Core à émettre plus tard : `billing.module.activated` /
  `billing.module.deactivated` / `billing.module.expired` (non implémentés).
- **Interdit R3** : créer un Price, modifier Stripe, modifier Vercel, fixer un tarif module.

---

## 8. Vérifications exécutées

pgTAP `supabase test db` : **47 fichiers / 938 tests — PASS** (`modules_a_la_carte_r3_v1`
32/32 : les 14 cas du §31 ; capacité R1 et feature-flags inchangés). Vitest racine **89/699**
(`modules-gestion-pro.test.ts` 5/5), Vitest tools 20/107, typecheck racine+tools, eslint
0 erreur, build racine+tools, `verify:migrations` 255 OK, `verify:secrets` 0, `npm audit` 0,
`git diff --check` OK.
