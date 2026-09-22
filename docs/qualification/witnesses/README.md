# Witnesses SQL — qualification GP hardening réelle V1

Scripts utilisés pour produire les preuves du rapport
`docs/qualification/ELSATIA_GP_HARDENING_REAL_DB_QUALIFICATION_V1.md`.

Prérequis : PostgreSQL 16 natif + extension `pgtap` (`apt install postgresql-16-pgtap`), aucun
Docker/Supabase requis (contournement documenté au §1 du rapport).

Ordre d'exécution, sur une base neuve où `supabase/migrations/*.sql` (+ la migration
`20260922000201` de régression) ont déjà été rejouées dans l'ordre :

1. `00_bootstrap.sql` — rôles `anon`/`authenticated`/`service_role`/`authenticator`, schémas
   `auth`/`storage`/`extensions` minimaux reproduisant la plateforme Supabase (à exécuter AVANT
   les migrations, avec les `alter default privileges` de base décrites au §1 du rapport, avant
   le rejeu des migrations).
2. `10_seed_tenants.sql` — fixture : 2 entreprises isolées, utilisateurs, postes/permissions,
   clients, employé avec documents sensibles.
3. `20_witnesses_core.sql` à `24_witnesses_devis_essai.sql` — batteries de witnesses
   positifs/négatifs, à exécuter dans cet ordre après le seed. Chaque `DO $$ ... $$` imprime
   `NOTICE: PASS ...` en cas de succès ou lève une exception `FAIL ...` sinon (le script s'arrête
   au premier échec réel si lancé avec `ON_ERROR_STOP`).

Exemple :

```bash
psql -h localhost -p 54322 -U postgres -d postgres -f 00_bootstrap.sql
# ... rejouer supabase/migrations/*.sql dans l'ordre ...
psql -h localhost -p 54322 -U postgres -d postgres -f 10_seed_tenants.sql
psql -h localhost -p 54322 -U postgres -d postgres -f 20_witnesses_core.sql
```
