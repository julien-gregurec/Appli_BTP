# ELSATIA — Production upgrade harness — CHECKPOINT

Branche de travail : `claude/zen-ramanujan-pku73u` (fast-forward sur `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f`).

## État
- SHA de base : 877a4b9f284150e5d4f06fd68250f3ea19ff62a1 (391 migrations)
- Étapes terminées : A (inventaire initial), B (probe : 210 de `5777abb` + 181 → 391 OK à vide, schéma = fresh 391 sauf ordre d'une colonne, ACL identiques)
- Tests restant : C → M
- Bases locales : `prod210_probe`, `fresh391` (PostgreSQL 16 local, peer auth)
- Problème : aucun

## Reprise
```
service postgresql start
cd /home/user/Appli_BTP && git pull origin claude/zen-ramanujan-pku73u
cat docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_CHECKPOINT.md
```
