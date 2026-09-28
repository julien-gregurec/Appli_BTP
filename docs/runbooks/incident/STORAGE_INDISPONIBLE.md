# Runbook — Storage indisponible (SEV2)

Preuve locale : drill S9 (Storage gelé) et S4 (gel des uploads, RLS réelle).

## 1. Détection
- `GET /api/health` (GP) → 200 **`DEGRADED`**, `controles.storage = "ko"` (base et Auth ok).
- Échecs d'upload / d'affichage des photos, PDF de partage sans médias.

## 2. Confinement
- Éviter les dépôts à moitié faits (fichier absent, ligne créée) : **`uploads`** sur la portée
  concernée (`global` si toute la plateforme) — console `/plateforme/incident` ou
  `select public.incident_basculer_operateur('<nom>','global','uploads',true,'<motif>','<INC>');`
- Réserves hors ligne : les photos restent dans la file locale de l'appareil (renvoi ultérieur).
- Statut public `storage` → `DEGRADED`.

## 3. Diagnostic
- Page statut Supabase ; `GET <projet>/storage/v1/status`.
- Quota / bucket plein ? Dashboard → Storage. Politique de bucket modifiée récemment ?

## 4. Restauration
- Panne plateforme : attendre. Perte d'objets : Storage n'est **pas** couvert par le PITR base ;
  procédure Storage du DR V2 (objets orphelins/manquants, `scripts/dr/`, `apps/studio/scripts/storage-reconcile.mjs` pour Studio).

## 5. Validation
- Santé `OPERATIONAL` ; téléverser puis relire un fichier de test sur un compte interne.
- Studio : `storage-reconcile` en dry-run (objets orphelins / lignes sans objet).

## 6. Réouverture
- Lever `uploads`. Statut `storage` → `OPERATIONAL`.
