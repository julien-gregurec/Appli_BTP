# FACTURATION-BTP-V1 — Checklist

Référence : `docs/commercial/FACTURATION_BTP_V1_AUDIT_ELSATIA.md`. Ce lot est un audit — aucune ligne de code fonctionnel n'est modifiée.

## Cartographie

- [x] Tous les objets de facturation cartographiés (table, source de vérité, relations, RLS, action, UI, PDF) (§1-2).
- [x] Types de facture réellement supportés classés (existe/fonctionnel/partiel/absent) (§3).

## Failles P0 confirmées et quantifiées

- [x] **Facture classique dupliquable sans garde-fou** : `creer_facture_depuis_devis` appelable plusieurs fois sur le même devis, reproduit empiriquement (§4).
- [x] **Sur-facturation acompte + situations** : reproduite avec des montants exacts — 12 000 € facturés sur un devis de 10 000 € HT (+20 %) (§11-13).
- [x] **Enregistrement de paiement cassé** : `paiements` sans `GRANT` pour `authenticated`/`service_role`, cause racine identifiée (migration `20260729000189` incomplète), reproduit empiriquement (§23).

## Failles P1 identifiées

- [x] Facture émise modifiable en écriture directe (montant, client) — même classe que la faille devis pré-DEVIS-LOCK-V1 (§40-41).
- [x] `entreprise_snapshot` capturé uniquement côté application, contournable (§32′).
- [x] Factures brouillon comptées dans le CA réel de RENTABILITÉ-V1B (§21, §36).
- [x] PDF de situation sans numéro/avancement/retenue de garantie/cumul (§33).
- [x] Suppression de facture émise bloquée par accident (effet de bord), pas par une règle dédiée (§39).
- [x] Avoir non plafonné par rapport à la facture d'origine (§19).
- [x] `creer_facture_depuis_devis` sans défense en profondeur (`security definer` + vérification explicite), grant `anon` (§44-45).

## Scénarios empiriques

- [x] Scénario complet 10 000 € (acompte, situations, tentative de finale) exécuté et documenté (§46).
- [x] Voies de contournement anti-surfacturation documentées (§47).
- [x] Scénario multi-devis (10k + 2k) confirmé conforme à l'attendu (§48).
- [ ] Scénario avoir avec montants exacts — non exécuté ce lot par manque de temps, recommandé en premier point d'un futur lot avant de s'appuyer sur le CA net (§49).

## Classification et décision

- [x] Matrice complète des statuts (consomme le plafond / CA réel / reste dû) (§50).
- [x] Classification P0-P3 de tous les constats (§54).
- [x] Décision GO/NO-GO par module — pas de verdict binaire global, chaque mécanisme évalué séparément (§55-56).
- [x] Décision globale : **pas de premier client réel généralisé tant que les 3 P0 ne sont pas corrigés**.

## Recommandations (non développées)

- [x] `PAIEMENTS-GRANT-FIX-V1` — correctif minimal, le plus urgent (§57).
- [x] `ANTI-SURFACTURATION-V1` — corriger `creer_situation_travaux` + garde-fou minimal sur `creer_facture_depuis_devis` (§57).
- [x] `FACTURE-LOCK-V1` — verrou header facture sur le modèle de DEVIS-LOCK-V1 (§57).
- [x] Compléments PDF situations (non bloquant) (§57).

## Hors périmètre respecté

- [x] Aucun correctif fonctionnel appliqué.
- [x] Aucun développement AVENANTS-V1.
- [x] Aucune migration, aucune Production, aucune donnée réelle.
- [x] Toutes les reproductions empiriques faites en transaction annulée (`rollback`), Local uniquement.

## Livrables

- [x] `docs/commercial/FACTURATION_BTP_V1_AUDIT_ELSATIA.md`.
- [x] `docs/commercial/FACTURATION_BTP_V1_CHECKLIST.md` (ce fichier).
- [ ] Commit dédié `docs(commercial): auditer facturation BTP ELSATIA`.
