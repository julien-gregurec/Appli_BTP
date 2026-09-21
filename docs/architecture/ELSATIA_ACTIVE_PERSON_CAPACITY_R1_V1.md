# ELSATIA — Active-person subscription capacity — R1

Lot `ELSATIA-ACTIVE-PERSON-CAPACITY-R1-V1`. Plafond **dur** de personnes actives par
abonnement Gestion Pro. Migration additive `20260903000256_active_person_capacity_r1_v1.sql`
+ garde-fous serveur + UX minimale. Aucun Stripe Live, aucune Production, aucune donnée
supprimée.

Base : `feat/preprod-e2e-runbook-integration-v1` @ `6df3ebd`.

---

## 1. Contrat officiel « personne active »

Appliqué par `public.compter_personnes_actives_entreprise(entreprise_id)` :

> ligne `public.employes` de l'entreprise AVEC
> `statut <> 'sorti'` **ET** `compte_application_statut <> 'ferme'`.

| Compte dans le plafond | Ne compte pas |
|---|---|
| dirigeant, bureau, ouvrier, chef d'équipe, conducteur, apprenti, intérimaire actif | salarié `statut = 'sorti'` (ancien salarié) |
| personne **sans compte Auth** présente pour planning/pointage (`compte_application_statut = 'non_ouvert'`) | compte archivé (`compte_application_statut = 'ferme'`) — l'archivage **libère** la place |
| personne en `pause` ou `en_conge` ou `suspendu` (reste enregistrée et réactivable) | clients, fournisseurs, sous-traitants, contacts, candidats (jamais des lignes `employes`) |

`actif` **et** `pause` comptent : décision produit confirmée (§3 du lot).

---

## 2. Capacité autorisée

```
capacite_personnes_totale = capacite_personnes_base(offre)        -- plans_abonnement.utilisateurs_inclus
                          + entreprises.capacite_personnes_supplementaire  -- défaut 0
```

- `capacite_personnes_base` : `plans_abonnement.utilisateurs_inclus` du plan actif
  (`mini 3 / pro 15 / business 30 / entreprise 50 / sur_mesure 50`), avec normalisation
  `essentiel→mini`, `premium→business` et repli conservateur (3) si l'offre est inconnue.
- `entreprises.capacite_personnes_supplementaire` : nouvelle colonne, **non écrivable par le
  client** (régime de droits colonne-par-colonne de `public.entreprises` — aucun GRANT ajouté).
  Modifiable uniquement par
  `plateforme_definir_capacite_personnes_supplementaire(entreprise_id, capacite, motif, source, ref)`
  (SECURITY DEFINER, `est_plateforme_admin()` + `plateforme_exiger_session_aal2()`), qui
  journalise dans `historique_capacite_personnes` (append-only).

---

## 3. État de capacité

`public.etat_capacite_personnes(entreprise_id)` → `ok` | `limite_atteinte` | `over_capacity`.

| État | Condition | Effet |
|---|---|---|
| `ok` | actives < totale | création possible |
| `limite_atteinte` | actives = totale | aucune nouvelle personne active ; édition, pause, sortie OK |
| `over_capacity` | actives > totale (après downgrade) | idem `limite_atteinte` : **aucune suppression**, aucune activation, mais on peut éditer / archiver / sortir pour repasser sous le plafond |

---

## 4. Garde-fou infranchissable

`trigger trg_capacite_personnes_actives BEFORE INSERT OR UPDATE ON public.employes`
(SECURITY DEFINER). Il ne bloque **que** les transitions qui augmentent la population active
(INSERT d'une fiche comptée ; UPDATE d'une fiche non-comptée → comptée). Toute autre écriture
passe (édition, `actif→pause`, `→ferme`, `→sorti`), y compris en `over_capacity`.

Échappatoire `elsatia.capacite_personnes_bypass = 'on'` : **sans effet** sauf si
`session_user = 'postgres'` (migrations, fixtures pgTAP, restauration, backfill). Le trafic API
Supabase s'exécute sous `session_user = 'authenticator'` → `authenticated` / `anon` /
`service_role` ne peuvent jamais franchir le garde-fou, même en positionnant eux-mêmes le
paramètre.

`public.verifier_capacite_personnes(entreprise_id, delta)` : pré-contrôle applicatif (message
clair avant mutation). Le trigger reste l'autorité.

---

## 5. Chemins d'augmentation — matrice de protection

| # | Chemin | Fichier | Protection |
|---|---|---|---|
| 1 | Création manuelle | `src/app/actions/employes.ts` `creerEmployeAction` | pré-contrôle `verifierCapacitePersonnes` + trigger + message dédié |
| 2 | Création self-service (« créer ma fiche ») | `creerMaFicheEmployeAction` | pré-contrôle + trigger + message dédié |
| 3 | Réactivation via statut RH (`sorti→actif`) | `modifierEmployeAction`, `changerStatutEmployeAction` | pré-contrôle conditionnel (ancien état non compté) + trigger + message |
| 4 | Réouverture de compte applicatif (`ferme→actif`) | `changerStatutCompteApplicationAction` → RPC `changer_statut_compte_application` | trigger (via la RPC) + mapping `CAPACITE_PERSONNES_ATTEINTE` |
| 5 | Import en lot | `src/app/actions/import.ts` `importerDonneesAction` (`type = "employes"`) | **fail-closed avant écriture** : compare `restant` vs lignes ; rapport chiffré, aucun import partiel |
| 6 | Duplication de fiche | (pas de fonctionnalité dédiée aujourd'hui) | trigger (INSERT) |
| 7 | RPC / PostgREST direct / service backend | — | trigger `BEFORE INSERT/UPDATE` (couvre tout) ; `service_role` n'a de toute façon aucun write sur `employes` |
| 8 | Invitation Auth seule | flux invitation | ne crée pas de ligne `employes` active → ne consomme pas ; si elle active un `employe`, trigger |

---

## 6. Downgrade / réversibilité

- Baisse d'offre ou de capacité → `etat_capacite_personnes` recalculé, `over_capacity` possible.
- **Aucune fiche supprimée, aucune anonymisation.** Les personnes existantes restent toutes
  accessibles. `changerOffreStripe` ne touche pas `employes`.
- En `over_capacity` : nouvelles activations/réactivations refusées ; l'entreprise archive
  (`compte_application_statut = 'ferme'`, ce qui préserve l'historique via
  `pointages.employe_id ON DELETE RESTRICT`) ou achète de la capacité.
- Suppression d'un **module** (hors périmètre R1) : voir R3.

---

## 7. Contrat d'erreur

Code stable `CAPACITE_PERSONNES_ATTEINTE` (constante
`CODE_ERREUR_CAPACITE_PERSONNES` dans `src/lib/erreurs-utilisateur.ts`).
`estErreurCapacitePersonnes(err)` le détecte quel que soit le chemin (message, `details`
JSON, `hint`). `messageErreurUtilisateur` renvoie un message métier dédié **prioritaire sur
le repli générique de l'appelant** ; jamais de code SQL / contrainte exposé.

---

## 8. UX

`/abonnement` : section **« Personnes actives : X / Y »**, ventilation base + supplément,
bandeau `limite_atteinte` (ambre) et `over_capacity` (rouge) avec les 3 sorties possibles
(archiver / ajouter de la capacité / changer d'offre). Formulaires de création /
réactivation / import : message métier clair, jamais d'erreur brute.

---

## 9. Sécurité

- `capacite_personnes_supplementaire ≥ 0`, `≤ 100000` (check) ; jamais négatif.
- Client : lecture de l'état oui (`capacite_personnes_entreprise`, membre ou plateforme) ;
  écriture de la capacité **non** (RPC plateforme AAL2 uniquement).
- Frontend jamais autorité : trigger DB = garde-fou.
- Toute modification de capacité → `historique_capacite_personnes` (entreprise, avant, après,
  source, référence externe, acteur, motif, timestamp).
- Multi-tenant : capacité calculée **par entreprise** ; aucune capacité globale utilisateur.
- Cohérent avec la réconciliation ACL canonique (`revoke` `public`/`anon`, `service_role`
  exclu des RPC ; SECURITY DEFINER + `search_path` fixe ; invariant AAL2 plateforme respecté —
  test `platform_aal2_role_integrity_v1` 73/73).

---

## 10. Handoff R2 / R3 (non implémenté ici)

- **R2** : réconcilier `capacite_personnes_supplementaire` depuis Stripe (packs +1 / +5 / +10),
  via `plateforme_definir_capacite_personnes_supplementaire(..., source := 'stripe', p_reference_externe := <item.id>)`
  appelé par le webhook. Prix modules/capacité non fixés.
- **R3** : catalogue de modules vendables + entitlements datés (`entreprise_feature_flags`
  étendu) + `mode_apres_desactivation` (lecture seule / inaccessible) + portabilité des
  données module. Voir `ELSATIA_MODULAR_BILLING_CAPACITY_READINESS_V1.md`.

---

## 11. Vérifications exécutées

pgTAP `supabase test db` : **46 fichiers / 906 tests — PASS** (dont
`active_person_capacity_r1_v1` 36/36 : les 13 cas du lot, et `platform_aal2_role_integrity_v1`
73/73). Vitest racine 88/694, Vitest tools 20/107, typecheck racine+tools, eslint 0 erreur,
build racine+tools, `verify:migrations` 254 OK, `verify:secrets` 0, `npm audit` 0,
`git diff --check` OK.
