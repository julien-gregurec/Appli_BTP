# `scripts/dr/v2/` — Disaster Recovery & Restore Qualification V2 (LOCAL)

Rapport, verdict et limites : `docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md`.
L'outillage V1 (`scripts/dr/0*.sh`) reste en place ; V2 s'appuie sur la base réaliste du harnais
d'upgrade du train (au lieu d'un seed synthétique) et compare **strictement** l'état restauré.

## Commande opérateur

```bash
npm run dr:verify                      # drill complet : base + Storage (vraie storage-api) + Auth (vrai GoTrue)
npm run dr:verify -- --db-only         # base seule
npm run dr:verify -- --backup <dossier> # vérifier une sauvegarde existante (restauration de test locale)
npm run dr:verify -- --strict          # Storage et Auth doivent être exécutés, pas « non prouvés »
npm run test:dr-guard                  # tests du garde-fou (sans base)
```

Verdict imprimé : `ELSATIA DR LOCALLY QUALIFIED` ou `ELSATIA DR BLOCKED` (code de sortie 0 / 1 ;
3 = cible refusée par le garde-fou).

Prérequis : PostgreSQL 16 local (pair `postgres` en root, sinon `DR_PG*` en TCP), `jq`, `python3`,
`node`, pgTAP (`postgresql-16-pgtap`), les refs `origin/integration/elsatia-canonical-train-v3|v4`
(harnais d'upgrade). Storage : Docker + image `supabase/storage-api:v1.25.7`. Auth : binaire GoTrue
(`GOTRUE_BIN`, défaut `/tmp/gotrue-build/gotrue`, cf. `scripts/local-postgres-bootstrap/gotrue_pilot_bootstrap.sh`).
Sans Docker ou sans GoTrue, la partie concernée rend `*_NOT_PROVEN` : rien n'est prétendu.

**Train canonique V7** : le jeu vient du harnais d'upgrade du train courant
(`scripts/qualification/upgrade-v6-v7.sh`, base `upg_v6_v7`, fresh `v7_fresh`) et les contrôles métier
après restauration sont ceux de V7 (`upgrade_v6_v7_business_checks.sql`, 31). L'ancien harnais V4 → V5
refuse une base au-delà de V5. Autre train : `DR2_UPGRADE_SCRIPT`, `DR2_METIER_SQL`, `DR2_METIER_N`,
`DR2_SOURCE_DB`, `DR2_FRESH_DB`. Le dossier de sortie doit être traversable par le rôle système
`postgres` (défaut `/tmp/elsatia-dr-v2/…`) : `pg_restore` s'exécute sous ce rôle.

## Garde-fous (`garde-cible.mjs`)

- **Production refusée par défaut**, toujours : `VERCEL_ENV|ELSATIA_ENV|APP_ENV|NODE_ENV=production`,
  projet Supabase autre que la référence Preview, base ou hôte dont le nom évoque la production.
- **Cible distante** refusée sauf `DR_ALLOW_REMOTE=1` **et** hôte listé exactement dans
  `DR_REMOTE_ALLOWLIST` — et même alors, uniquement en mode non destructif `verify-backup`.
- **Base locale** : nom `elsatia_dr_*` obligatoire. Double contrôle Node + bash dans chaque script.

## Fichiers

| Fichier | Rôle |
|---|---|
| `dr-verify.mjs` | point d'entrée `npm run dr:verify` (garde-fou, orchestration, synthèse, verdict) |
| `drill.sh` | drill base : jeu → backup → vérification → Disasters 1-4 → smokes → échecs attendus |
| `backup.sh` | `pg_dump -Fc` + rôles + réglages de base + instantané + inventaire Storage + manifeste + `SHA256SUMS` |
| `verify_backup.sh` | intégrité, TOC, **restauration de test** et comparaison stricte à l'instantané |
| `restore.sh` | restauration vérifiée (sha256, TOC, refus sans `--force`, `--exit-on-error`, réglages de base) |
| `snapshot.py` / `compare.py` | instantané strict (lignes, md5 par table, RLS, policies, ACL, schéma, séquences, réglages, états métier, droits, sonde RLS réelle) et comparaison à zéro écart |
| `dataset_complement.sql` | complément du jeu réaliste (planning, plan 2D, Stripe ordonné, audit, RGPD programmée) |
| `d2_migration_cassee.sql` | migration fictive à moitié appliquée (Disaster 2) |
| `d3_empreinte.sql` | empreinte RGPD d'un tenant indépendante de l'horloge (Disaster 3) |
| `d4_*.sql`, `stripe_controle_post_restauration.sql` | vérité Stripe post-backup, corruption, garde anti-réouverture (Disaster 4) |
| `restore_smokes.sql` | 16 smokes métier après restauration (pgTAP, annulés) |
| `storage_drill.sh`, `storage_client.mjs` | drill Storage avec la vraie storage-api (métadonnées **et** fichiers) |
| `auth_drill.sh` | limites de restauration Auth avec un vrai GoTrue |

## Procédure de restauration (ordre obligatoire)

1. `restore.sh <backup> <base> --force` (ou restauration hébergée) — la base revient à `backup_at`.
2. **Storage** : restaurer l'archive de fichiers **du même `backup_id`**, avec ses attributs étendus
   (`tar --xattrs --xattrs-include='user.*'`) ; contrôler la cohérence métadonnées ↔ fichiers.
3. **Stripe AVANT réouverture** : `stripe_controle_post_restauration.sql -v backup_at=…` liste les
   droits à confirmer ; rejouer les événements Stripe créés depuis `backup_at`
   (Events API `created[gte]`, renvoi aux webhooks) ; relancer le contrôle.
4. **Auth** : révoquer toutes les sessions (`delete from auth.sessions`) et faire tourner le secret /
   les clés JWT ; ré-appliquer les bans et réinitialisations de mot de passe postérieurs à `backup_at`
   depuis une source externe (les journaux `auth.audit_log_entries` postérieurs sont perdus aussi).
5. **RGPD** : relancer toute purge programmée échue (idempotente, cf. Disaster 3).
6. `npm run dr:verify -- --backup <backup>` sur la sauvegarde suivante pour prouver la chaîne.
