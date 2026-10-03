# Retours arrière du lot PERFORMANCE HARDENING V9.1

Train canonique V9.2 : les quatre migrations du lot ont été **renumérotées** (collision de versions
avec le lot PLATFORM READINESS V9.1 sur `20261003000101` et `20261003000201`). Corps identiques à
l'octet : `docs/qualification/canonical-train-v9-2/renumerotation-preuve.txt`.

| Version lot perf (a9b46f01) | Version V9.2 | Script |
|---|---|---|
| `20261003000101_push_file_durable_v1` | `20261003001501` | `rollback_20261003001501.sql` |
| `20261003000201_relances_auto_candidats_eligibles_v1` | `20261003001502` | `rollback_20261003001502.sql` |
| `20261003000301_rls_ensembles_entreprises_autorisees_v1` | `20261003001503` | `rollback_20261003001503.sql` |
| `20261003000401_taches_chantier_created_idx_v1` | `20261003001504` | `rollback_20261003001504.sql` |

Le commentaire d'en-tête de la migration `20261003001503` cite encore `rollback_20261003000301.sql` :
la migration est conservée à l'octet (preuve d'équivalence) ; le script correspondant est
`rollback_20261003001503.sql`. **Attention** : en V9.2, `20261003000101` et `20261003000201` désignent
des migrations du lot plateforme (Drone `bientot`, pont de phase 0) — aucun de ces scripts ne les concerne.
