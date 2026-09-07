# ELSATIA — Checklist opérateur du cutover Production (V1)

Checklist **cochable**, dérivée du runbook. Chaque ligne : heure, commande,
responsable, attendu, preuve, GO/STOP.

- `BACKUP_ID` : `ELSATIA-PROD-CUTOVER-________-____`
- Cible code : `____________` ← **à trancher avant T0** (voir rapport §2)
- Date / fenêtre : `____________`
- A : `______` · B : `______` · **C : `______`** · D : `______` · E : `______`

> **Règle absolue** : une case non cochée = **STOP**. On ne « rattrape » pas plus tard.

---

## Phase 0 — Avant la fenêtre (J-1)

| ✅ | Heure | Étape | Commande | Resp. | Attendu | Preuve |
|:--:|---|---|---|:--:|---|---|
| ☐ | | Préflight poste | `node scripts/cutover/preflight-check.mjs --target <CIBLE>` | A | `0 STOP` | sortie console |
| ☐ | | libpq opérationnel | `psql --version && pg_dump --version && pg_restore --version` | A | 17.x ×3 | sortie |
| ☐ | | Plan Supabase | dashboard → Settings → Billing | C | **Pro** | capture |
| ☐ | | Rôle C confirmé | — | C | nom écrit ci-dessus | — |
| ☐ | | Cible code tranchée | — | C | SHA écrit ci-dessus | — |
| ☐ | | Espace disque | `df -h /` | A | ≥ 30 Gi | sortie |

---

## Phase 1 — T0 : gel et sauvegardes

| ✅ | Heure | Étape | Commande | Resp. | Attendu | Preuve |
|:--:|---|---|---|:--:|---|---|
| ☐ | T0 | Annonce du gel | — | E | écritures suspendues | message |
| ☐ | T0+02 | `BACKUP_ID` figé | `date +%Y%m%d-%H%M` | A | reporté partout | `B6_manifest.txt` |
| ☐ | T0+05 | **B1** snapshot managé | dashboard → Backups | A | snapshot listé | `B1_snapshot_id.txt` |
| ☐ | T0+10 | **B2** dump chiffré | voir `scripts/cutover/backup-commands.sh` | A | fichier + SHA-256 | `.dump.enc` + `.sha256` |
| ☐ | T0+20 | **B3** Storage | `npx supabase storage ls --linked --recursive` | A | inventaire 13 buckets | `B3_storage_inventaire.txt` |
| ☐ | T0+25 | **B4** Auth | `pg_dump --schema=auth` chiffré | A | fichier | `B4_auth_<ID>.sql.enc` |
| ☐ | T0+30 | **B5** état + sentinelles | `psql "$PROD_DB_URL" -f scripts/cutover/sentinels-pre-migration.sql` | B | **26/26 OK** | `B5_sentinelles_avant.txt` |
| ☐ | T0+32 | Ledger avant | `copy (select version from supabase_migrations.schema_migrations …)` | B | **210 lignes** | `B5_ledger_avant.txt` |
| ☐ | T0+35 | **S40** relevée | ligne S40 de la sortie B5 | B | valeur consignée | `B5_sentinelles_avant.txt` |
| ☐ | T0+40 | **B7 restauration test** | `pg_restore` → base jetable | A | **`count = 210`** | sortie psql |

> **Si B7 ne rend pas exactement 210 → STOP.** La sauvegarde est invalide.

---

## Phase 2 — GATE G1 (avant migration #6)

| ✅ | Condition | Preuve | Resp. |
|:--:|---|---|:--:|
| ☐ | G1.1 sauvegarde validée (B7 = 210) | sortie psql | A |
| ☐ | G1.2 sentinelles 26/26 vertes + S40 relevée | `B5_sentinelles_avant.txt` | B |
| ☐ | G1.3 tests T1→T18 sans FAIL | rapport operator readiness | A |
| ☐ | G1.4 A, B, C présents et joignables | — | C |
| ☐ | G1.5 décision rollback prête (`BACKUP_ID` + B7 relue) | — | C |

**Décision du rôle C** :  ☐ **GO**   ☐ **STOP**   —   heure `______`   signature `______`

---

## Phase 3 — Migrations

| ✅ | Heure | Étape | Commande | Resp. | Attendu | Preuve |
|:--:|---|---|---|:--:|---|---|
| ☐ | | Migrations #1 → #5 | `supabase migration up --linked --include-all` | A | 5 appliquées | log |
| ☐ | | **#6 + #7 ensemble** | *(sans point d'arrêt entre les deux)* | A | `employes_cout_horaire` créée, colonne supprimée, `cout_horaire_applique` ajoutée | log |
| ☐ | | Contrôle post-#7 | `select count(*) from public.employes_cout_horaire;` | B | = nb employés avant | sortie |
| ☐ | | #8 → #53 | suite de la même commande | A | ledger = **263** | log |
| ☐ | | Ledger final | `select count(*), max(version) from supabase_migrations.schema_migrations;` | B | `263` / `20260905000265` | sortie |

> **#6 et #7 sont indissociables** : entre les deux, une fonction déjà présente en
> Production référence une colonne supprimée. Ne jamais s'arrêter dans cet intervalle.

---

## Phase 4 — Déploiement du code

| ✅ | Heure | Étape | Commande | Resp. | Attendu | Preuve |
|:--:|---|---|---|:--:|---|---|
| ☐ | | Branche = cible tranchée | `git rev-parse HEAD` | A | = SHA cible | sortie |
| ☐ | | Déploiement | *(procédure Vercel habituelle)* | A | build vert | URL |
| ☐ | | Version servie | contrôle en production | D | SHA cible | capture |

---

## Phase 5 — Validation fonctionnelle

| ✅ | Étape | Resp. | Attendu |
|:--:|---|:--:|---|
| ☐ | Connexion compte existant | D | session ouverte |
| ☐ | Lecture d'un chantier + pointages | D | données intactes |
| ☐ | Coût horaire lisible via la nouvelle table RLS | D | valeurs conservées |
| ☐ | Émission d'un devis | D | PDF conforme |
| ☐ | Émission d'une facture | D | PDF conforme |
| ☐ | 8 routes `/api/tools/monetization/**` | D | ni 404 ni 500 |
| ☐ | Parcours Stripe (TEST) | D | chaîne complète |
| ☐ | E-mails : SPF / DKIM / DMARC `pass` | D | en-têtes bruts |

---

## Phase 6 — Clôture

| ✅ | Étape | Resp. |
|:--:|---|:--:|
| ☐ | Levée du gel des écritures | E |
| ☐ | Communication de fin | E |
| ☐ | Artefacts `<BACKUP_ID>` archivés sur `/Volumes/ELSATIA-DEV` | A |
| ☐ | Journal du cutover rédigé | A |
| ☐ | **T+45** : second admin plateforme (rapport §11) | C |

---

## Rollback — critères de déclenchement

Déclencher si **l'un** de ces cas survient :

- une migration échoue et ne peut être rejouée en moins de 15 min ;
- le ledger final ≠ 263 ;
- la validation fonctionnelle échoue sur devis, facture ou connexion ;
- perte de données constatée.

| ✅ | Étape de rollback | Commande | Resp. |
|:--:|---|---|:--:|
| ☐ | Décision formelle | — | **C** |
| ☐ | Restauration B1 (snapshot managé) *ou* B2 | dashboard / `pg_restore` | A |
| ☐ | Contrôle ledger = **210** | `select count(*) …` | B |
| ☐ | Redéploiement du code antérieur | Vercel | A |
| ☐ | Validation fonctionnelle post-rollback | — | D |
| ☐ | Communication | — | E |
