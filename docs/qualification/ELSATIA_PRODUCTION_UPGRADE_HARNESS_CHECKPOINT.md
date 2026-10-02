# ELSATIA — Production upgrade harness — CHECKPOINT

Branche : `claude/zen-ramanujan-pku73u` (base `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f`, 391 migrations).

## État (mis à jour à chaque jalon)
- Étapes terminées : A (inventaire, point 210 = `5777abb`), B (reconstruction), C (jeu historique), D (harnais
  `scripts/upgrade/production-to-v9x.sh`), E (zéro perte colonne par colonne), F (anciennes offres 24/24),
  G (sécurité fermée = fresh), L (preflight + 29 tests).
- Constats : UPG-P0-1 (300 bloquée par factures émises → ponts `scripts/upgrade/bridges/`), UPG-P0-2 (204
  contrainte essai), UPG-P1-1 (essai perpétuel coupé), UPG-P2-1, UPG-P3-1, UPG-SEC-1.
- Restant : H (volumétrie 5k/20k/100k), I (interruptions), J (runbook rollback), K (ancien code), M (rapport).
- Bases locales : `h210_v500` (source brute), `h210_v500_rem` (remédiée), `*_v9x` (upgradées), `fresh_877a4b9f_p2_sb`.

## Reprise
```
service postgresql start
cd /home/user/Appli_BTP && git pull origin claude/zen-ramanujan-pku73u
scripts/upgrade/build-source.sh h210_v500_rem --vol 500 --remediation scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql
scripts/upgrade/production-to-v9x.sh --target-sha 877a4b9f284150e5d4f06fd68250f3ea19ff62a1 --target-migration-count 391 \
  --source-db h210_v500_rem --bridge scripts/upgrade/bridges/20260921000298_pont_upgrade_lignes_factures_emises_avant_backfill.sql \
  --bridge scripts/upgrade/bridges/20260921000399_pont_upgrade_lignes_factures_emises_apres_backfill.sql --out /tmp/upg_run
```
