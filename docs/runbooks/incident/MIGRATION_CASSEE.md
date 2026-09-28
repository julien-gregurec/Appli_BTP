# Runbook — Migration cassée (SEV1/2)

## 1. Détection
- `supabase db push` / pipeline en échec ; erreurs 5xx sur une fonction récemment modifiée ;
  `preview:db-verify` / `ELSATIA_PREVIEW_DB_VERIFY_V1.sql` en échec ; pgTAP rouge.

## 2. Confinement
- Écritures incohérentes possibles sur le périmètre de la migration : `lecture_seule` sur
  l'application concernée (ou `global` si tables socle). Rien n'est supprimé.
- Geler les déploiements (`ELSATIA_RELEASE_GOVERNANCE_V1.md`).

## 3. Diagnostic
- Migration appliquée entièrement, partiellement, ou pas du tout ?
  `select version from supabase_migrations.schema_migrations order by version desc limit 5;`
  (une migration est transactionnelle : un échec ne laisse normalement rien). Comparer au train :
  `npm run verify:migrations`, `npm run verify:train-expectations`.
- Nouvelle table sans garde du mode sûr ? `select public.incident_installer_gardes();` (idempotent) —
  le test pgTAP `incident_safe_mode_v1` refuse toute table non couverte.

## 4. Restauration
- **Jamais** d'édition d'une migration déjà appliquée : migration corrective additive.
- Application + schéma couplés : `ELSATIA_PRODUCTION_ROLLBACK_V1.md` (redéploiement du frontend
  précédent) ; perte/corruption de données : `CORRUPTION_DONNEES.md`.

## 5. Validation
- `preview:db-verify`, pgTAP complet sur copie, santé 200.

## 6. Réouverture
- Lever `lecture_seule`. Rouvrir les déploiements.
