# ELSATIA — Runbook de rollback Production → V9.x

> **Statut : PRÉPARATOIRE — aucune opération Production n'a été effectuée.** Ce runbook s'appuie sur les
> preuves LOCALES du harnais `scripts/upgrade/` (rapport
> [`ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md`](../qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md)).
> Il remplace, pour une cible V9.x, le runbook historique `ELSATIA_PRODUCTION_ROLLBACK_V1.md` (cible 263),
> qui reste valable pour l'historique mais dont les chiffres (53 / 62 migrations) sont périmés.

| Repère | Valeur |
|---|---|
| Point de départ Production (rapporté, **non vérifié en direct**) | ledger **210**, dernière `20260824000231`, fichiers exacts de `5777abb` |
| Code Production de départ | `fcdd4e7c` (release/commercialisation-v1) |
| Cible qualifiée localement | `877a4b9f` (hardening, 391 migrations) **+ 2 ponts proposés** (`scripts/upgrade/bridges/`) ; V9.1 : même harnais, `--target-sha` |
| Migrations à appliquer | **181** (+2 ponts), dont **13 hors ordre** (`--include-all` obligatoire) |
| Downgrade SQL | **Inexistant et interdit.** Aucune migration n'a de « down » ; aucune inversion improvisée. |

---

## 0. Principe directeur

1. **Il n'y a que deux sorties d'une fenêtre d'upgrade : terminer (forward) ou restaurer.** Jamais « défaire
   à la main ». Les ~1 220 `REVOKE` de `20260902000255`, les colonnes supprimées (`employes.cout_horaire`,
   `employes.taux_horaire`) et les backfills ne se reconstituent pas par script.
2. **Base et code se déplacent ensemble.** L'ancien code `fcdd4e7c` n'est compatible avec la base que tant que
   le ledger ne dépasse pas `20260816000201` (2ᵉ migration du plan) — mesuré, §3.
3. **Le trafic reste fermé** (maintenance + webhooks Stripe en attente) jusqu'au GO final : avant le trafic, une
   restauration ne perd **aucune** donnée client ; après, elle en perd (§6).

## 1. Classement de chaque étape

Classement **mesuré** par le harnais (`lib/classify.py risques`, transaction réelle de chaque migration sur la
Production 210 reconstruite : verrous pris, réécritures de tables, lignes existantes modifiées, objets 210
révoqués / supprimés). Le détail par migration est dans le plan qualifié `scripts/upgrade/manifests/target-<sha8>.json`.

| Classe | Définition | Nombre (cible 877a4b9f + ponts) |
|---|---|---|
| **REVERSIBLE** | ne crée que des objets nouveaux, sans toucher aux objets ni aux lignes de 210 | 52 |
| **FORWARD_ONLY** | remplace des fonctions 210, prend un verrou fort sur une table 210, insère dans une table 210 ou ajoute une contrainte validée : défaisable en théorie, **aucun script inverse n'existe** → rollback = restauration | 80 |
| **RESTORE_REQUIRED** | perd une information de 210 : lignes existantes modifiées, colonnes / tables / fonctions / policies 210 supprimées, privilèges 210 révoqués, privilèges par défaut changés | 51 |

> En pratique, **dès la 1ʳᵉ migration FORWARD_ONLY / RESTORE_REQUIRED appliquée (la 1ʳᵉ du plan,
> `20260815000200`, modifie déjà `plans_abonnement`)**, le seul retour arrière fiable est la **restauration**.

### 1.1 Durée et verrous attendus (mesurés, VM locale 4 vCPU)

| Volume (lignes / table critique) | Sans pont v2 | Avec pont v2 |
|---|---|---|
| 500 | 19 s | ~15 s |
| 20 000 | 85 s (dont `300` : 65 s) | — |
| 100 000 | **1 287 s** (dont `300` : 1 266 s sous ACCESS EXCLUSIVE devis / factures / lignes) | **23 s** (`300` : 3,6 s, lignes seulement) |

Seule `20260921000300` exige la fenêtre de maintenance ; les 98–99 CAUTION prennent un verrou fort bref sur des
tables 210 : appliquer trafic fermé, `lock_timeout` positionné.

## 2. Prérequis (avant toute migration)

| # | Exigence | Preuve attendue |
|---|---|---|
| R1 | **Preflight vert** : `npm run production:v9x:preflight -- --target-sha … --target-migration-count … --ledger … --production-attestation … --backup-attestation …` | sortie `PREFLIGHT OK` archivée |
| R2 | **Sauvegarde double** : PITR managé noté (horodatage UTC) **et** `pg_dump -Fc` chiffré, SHA-256 consigné | attestation `backup_id`, `taken_at` ≤ 24 h |
| R3 | **Restauration testée** de ce dump sur une base isolée (jamais Preview/Production) : empreintes zéro perte identiques | `restore_tested=true`, `restore_target` local |
| R4 | Sonde lecture seule (`scripts/upgrade/sql/production_readonly_probe.sql`) : `bloquant_*` = 0, `lignes_factures_emises` = 0 **ou** ponts 298/399 intégrés à la cible | attestation `data_preconditions` |
| R5 | Décision écrite sur UPG-P1-1 (essais « perpétuels ») et UPG-SEC-1 (admin plateforme ajouté par 233) | trace propriétaire |
| R6 | Maintenance activée, webhooks Stripe **en attente** (Stripe ré-émet jusqu'à 3 jours), crons arrêtés | capture |

## 3. Fenêtre de compatibilité de l'ancien code (mesurée)

`scripts/upgrade/old-code-window.sh` applique les migrations une à une sur une copie et confronte, après
chacune, les **983 accès base** de l'ancien code `fcdd4e7c` (427 fichiers : `.from().select/insert/update/
upsert/delete`, `.rpc()`) au catalogue et aux droits courants.

| Ledger atteint | Accès de l'ancien code cassés | Conséquence |
|---|---|---|
| ≤ `20260816000201` (#2) | 0 | rollback « code seul » encore possible (mais base déjà modifiée : catalogue tarifaire) |
| `20260816000202` (#3) | 1 | console plateforme (`plateforme_admins` select) |
| `20260818000205` (#6) | 2 | fiches employés (`cout_horaire` supprimée) |
| `20260901000253` (#41) | 9 | support, remises |
| **`20260902000255` (#43, ACL)** | **35** | webhook Stripe d'abonnement, paiements, cartes BTP, signatures… |
| cible complète | **37** | — |

**Conclusion : dès la 3ᵉ migration, l'ancien code ne doit plus servir de trafic.** Le rollback « code seul »
n'est PAS une option de cette fenêtre ; base et code se restaurent ensemble.

## 4. Rollback AVANT code (migrations non commencées ou en cours, ancien code déployé, trafic fermé)

| Situation | Action | Perte de données |
|---|---|---|
| Preflight refusé / précondition KO | **STOP**, rien n'est touché ; rouvrir le trafic sur l'ancien code | aucune |
| Panne **dans** une migration (erreur SQL) | La transaction de la migration est annulée (prouvé : S2, schéma + ACL + ledger identiques à l'état d'avant). Ledger = source + préfixe. **Ne pas** relancer à l'aveugle : diagnostiquer. Si correctif connu et sûr (ex. ponts 298/399) → reprise ; sinon **restauration** (R2) | aucune (trafic fermé) |
| Coupure **entre** deux migrations (réseau, quota, poste opérateur) | Relire le ledger ; il est un **préfixe** du plan (prouvé : S1). Reprendre avec la même commande (`--include-all`) → le reste s'applique | aucune |
| Ledger EN RETARD (migration appliquée, version absente — COMMIT interne puis coupure) | Ne pas rejouer à l'aveugle : prouver que l'état = celui d'une base de référence portée à cette version (S3), puis inscrire la version, puis reprendre ; en cas de doute → restauration | aucune |
| Ledger EN AVANCE (version inscrite, migration absente — `migration repair` abusif) | Le harnais le détecte (schéma ≠ fresh, S4). **Restauration obligatoire** | aucune |

## 5. Rollback APRÈS DB (ledger complet, ancien code toujours déployé, trafic fermé)

1. Contrôles post-upgrade KO (schéma, sécurité, zéro perte, accès) → **restaurer** la sauvegarde R2 sur le projet
   (PITR à l'horodatage noté, ou restauration du dump) ; ledger revenu à 210 (prouvé : S5, empreintes et ACL
   identiques, 0 écart) ; rouvrir sur l'ancien code.
2. Ne **jamais** rouvrir le trafic sur l'ancien code avec la base migrée (§3 : 37 accès cassés, dont le webhook
   Stripe d'abonnement et l'enregistrement des paiements).

## 6. Rollback APRÈS CODE (nouveau code déployé, trafic encore fermé)

Restaurer la base (§5) **puis** redéployer `fcdd4e7c` — dans cet ordre, l'un jamais sans l'autre. Smoke :
`/`, `/login`, `/dashboard`, création d'un devis brouillon sur une entreprise de recette.

## 7. Rollback APRÈS TRAFIC (des utilisateurs ont écrit via la nouvelle version)

Une restauration à T0 **efface** tout ce qui a été écrit depuis. Avant de restaurer :

1. **Geler** : maintenance immédiate, webhooks Stripe en attente.
2. **Exporter** depuis la base V9.x (lecture seule) toutes les écritures postérieures à T0 :
   - tables métier 210 : lignes avec `created_at` / `updated_at` > T0 (devis, factures, paiements, pointages,
     affectations, notes de frais, journal_activite…) — **attention** : `devis.updated_at` / `factures.updated_at`
     ont été rafraîchis par l'upgrade lui-même (UPG-P3-1), filtrer aussi sur `created_at` et sur le journal ;
   - les **120 tables nouvelles** (Colors, Réserves, Relevé & Métré, Studio, documents légaux, Stripe
     ordering…) : leurs données n'ont AUCUNE place dans la base 210 restaurée ;
   - événements Stripe reçus depuis T0 (`stripe_webhook_events`, `abonnement_evenements`) : Stripe les
     ré-émettra / ils se re-synchronisent depuis l'API Stripe après retour.
3. **Restaurer** (§5) + redéployer l'ancien code (§6).
4. **Réinjecter** à la main les seules écritures exprimables dans le schéma 210 (devis, factures, paiements,
   pointages), après revue ; les données des nouvelles applications sont conservées hors ligne jusqu'au
   prochain upgrade. Informer les entreprises concernées.
5. Si ces écritures sont nombreuses : préférer un **forward fix** (corriger en V9.x) à la restauration.

## 8. Données écrites par la nouvelle version : règles

| Donnée | Après restauration 210 |
|---|---|
| Lignes métier 210 créées / modifiées après T0 | perdues → export + réinjection manuelle (§7) |
| Tables nouvelles V9.x (120) | perdues → export conservé, ré-import au prochain upgrade |
| Snapshots d'identité renseignés par l'upgrade (`entreprise_snapshot`, provenance `backfill_identite_actuelle`) | retour à NULL (état 210) — sans perte |
| Fenêtres d'essai renseignées / tronquées par 204 | retour à l'état 210 (NULL / fin Stripe) — sans perte |
| Catalogue tarifaire (versions ajoutées par 201 / 802) | retour aux 8 versions 210 ; contrats inchangés dans les deux sens |
| Admin plateforme ajouté par 233 | disparaît (n'existait pas en 210) |
| Événements Stripe | re-synchronisés depuis Stripe (idempotence par `id` d'événement) |

## 9. Commandes de référence (locales, pour répéter)

```bash
# Reconstruction Production 210 + jeu historique, remédiation pré-cutover simulée
scripts/upgrade/build-source.sh h210_v500_rem --vol 500 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
# Upgrade qualifié (cible paramétrable)
scripts/upgrade/production-to-v9x.sh --target-sha <sha> --target-migration-count <n> --source-db h210_v500_rem \
  --bridge scripts/upgrade/bridges/20260921000298_pont_upgrade_lignes_factures_emises_avant_backfill.sql \
  --bridge scripts/upgrade/bridges/20260921000399_pont_upgrade_lignes_factures_emises_apres_backfill.sql
# Interruptions / reprise / ledger incohérent / restauration / idempotence
scripts/upgrade/interruption.sh h210_v500_rem <sha> <n> /tmp/upg_interruptions --bridge … --bridge …
# Fenêtre de compatibilité de l'ancien code
scripts/upgrade/old-code-window.sh h210_v500_rem <sha> /tmp/upg_fenetre --bridge … --bridge …
```
