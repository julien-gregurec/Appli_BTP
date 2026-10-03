# ELSATIA — PORTAGE MÉTIER GP SUR V9.1 — CHECKPOINT

BASE_SHA=24a0c2e993ec0836b492ea72f27ed7dc347a20fa (vérifié, 391 migrations)
SOURCE_BRANCH=claude/loving-heisenberg-ygkjck (tête 401b84d, base main 4d92ddb)
BRANCHE_TRAVAIL=integration/elsatia-gp-business-hardening-v9-1

## Étapes terminées
- Phase A (inventaire) : terminée — voir tableau dans le rapport final (section 2).
- Phase B/C (reproduction V9.1, sondes SQL rôle `authenticated` + JWT) : terminée pour la base.

## Reproduits sur V9.1 (à porter)
B16, B19 (+ situations remise globale), B17 (doublon identique), B24, B12, B35, B37 (RPC totaux mois + page pointage + copilote),
B25 (rentabilité RPC + tableau de bord), B28 (variante : pointages.cout_horaire_applique lisible par chef / salarié),
B02/B05/B07/B31 (saisie), B06, B21, B29, B30 (brouillon).

## Non reproduits (déjà corrigés par V9.1)
B04, B27 (toutes variantes), B34 (DB), B18, B20 (dépassement), B01 (13/16 tables ; service_role : conflit avec ACL V9.1).

## Reste à faire
- migrations 20261003001401+ ; code ; pgTAP rouge→vert ; contrôles L ; rapport.

## Reprise
Relire ce fichier, `git log` de la branche, puis reprendre à « Reste à faire ».
