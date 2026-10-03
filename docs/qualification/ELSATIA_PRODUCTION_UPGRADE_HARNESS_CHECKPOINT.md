# ELSATIA — Production upgrade harness — CHECKPOINT (FINAL)

Branche : `claude/zen-ramanujan-pku73u` (base `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f`).

## État : TOUTES LES PHASES A → M TERMINÉES

Verdict : **PRODUCTION_UPGRADE_HARNESS_PARTIALLY_QUALIFIED** — harnais complet et vert localement (avec pont v2 +
régularisation UPG-P1-1) jusqu'à 100 000 lignes, sur `877a4b9f` et sur la tête V9.1 `24a0c2e9` ; partiel parce que
le train ne passe PAS tel quel sur une Production réelle (UPG-P0-1 : ponts à intégrer à V9.1 ; UPG-P1-1 : décision).
Rapport : `docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md` ; runbook : `docs/runbooks/ELSATIA_PRODUCTION_V9X_ROLLBACK.md`.

## Tests terminés
- Upgrade 210 → 391 : paliers 500 / 5 000 / 20 000 / 100 000 (OK) ; pont v2 à 500 et 100 000 (OK) ; V9.1 24a0c2e9 (OK).
- Preuves négatives : A (sans pont → échec 300), B (sans régularisation → perte d'accès détectée).
- Interruptions S1–S6 : 9/9 ; ancien code : 37 accès cassés, fenêtre ≤ #2 ; preflight 32/32 + démo V9.1 (refus P6).

## Tests restant à faire (hors mission locale)
- Quand l'équipe V9.1 aura intégré (ou rejeté) les ponts : relancer le harnais sur la tête V9.1 finale SANS `--bridge`,
  `--publish-plan`, puis le preflight avec les vraies attestations le jour J.

## Bases locales (jetables)
`h210_v500`, `h210_v500_rem`, `h210_vol5000|20000|100000` (+ `_v9x`, `_v2`), `fresh_877a4b9f_p2_sb`, `fresh_24a0c2e9_p2_sb`, `h210_nodata`.

## Reprise
```
service postgresql start
cd /home/user/Appli_BTP && git pull origin claude/zen-ramanujan-pku73u
# voir §15 « Reproduire » du rapport
```
