# Runbook — Corruption de données (SEV1)

Référence : `ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md` (arbre de décision §2, restauration §5).

## 1. Détection
- Données incohérentes signalées ; contrôles métier (`upgrade_*_business_checks.sql`), `DB verify` ;
  écart Stripe ↔ base (`stripe_essai_ecarts`) ; journaux d'audit anormaux.

## 2. Confinement
- **`lecture_seule`** sur l'application (ou `global`) : la corruption ne s'étend plus, les données
  restent consultables, rien n'est supprimé. Les webhooks Stripe reçoivent 503 et seront rejoués.
- Statut public `READ_ONLY` avec message.

## 3. Diagnostic
- Tables, lignes, fenêtre temporelle, entreprises touchées ; cause (déploiement, migration, script,
  attaque). Réparation ciblée possible ? → correction SQL sous
  `set elsatia.incident_contournement = 'on';` (tracée dans le postmortem), **sans** restauration.

## 4. Restauration
- Restauration seulement si la réparation ciblée est impossible (DR V2 §2 : PITR/snapshot confirmé,
  restauration d'abord sur projet jetable, décision propriétaire), puis **`POST_RESTAURATION.md`**.

## 5. Validation
- Contrôles métier, `07_verify.sh` / `08_verify_rls_functional.sh` (DR), réconciliation Stripe.

## 6. Réouverture
- Uniquement via `POST_RESTAURATION.md` si restauration ; sinon lever `lecture_seule`.
