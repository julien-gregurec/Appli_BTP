#!/usr/bin/env bash
# DR V2 — drill complet de reprise après catastrophe, LOCAL, sur bases jetables `elsatia_dr_v2_*`.
# Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md.
# Point d'entrée opérateur : `npm run dr:verify` (scripts/dr/v2/dr-verify.mjs → ce script).
#
# Usage : scripts/dr/v2/drill.sh [dossier-de-sortie]
#
#   0. Jeu réaliste : base au train courant peuplée par le harnais d'upgrade V4 → V5
#      (scripts/qualification/upgrade-v4-v5.sh, réutilisée si DR2_SOURCE_DB existe déjà),
#      copiée en `elsatia_dr_v2_src` + scripts/dr/v2/dataset_complement.sql ;
#      `elsatia_dr_v2_live` = la base « de production » simulée.
#   1. Backup B0 (backup.sh) + vérification (verify_backup.sh : restauration de test stricte).
#   2. Disaster 1 : suppressions accidentelles → restauration B0 → comparaison stricte + smokes.
#   3. Disaster 2 : migration cassée à moitié appliquée → restauration B0 → comparaison.
#   4. Disaster 3 : purge RGPD interrompue → (a) reprise sur place, (b) restauration B0 + rejeu ;
#      les deux convergent vers la purge de référence.
#   5. Disaster 4 : corruption de l'état Stripe local → restauration B0 → garde anti-réouverture
#      → rejeu des événements Stripe postérieurs → droits = vérité Stripe.
#   6. Échecs attendus de l'outillage (sauvegarde altérée, écrasement sans --force, cible refusée).
#
# Sortie : <dossier>/results.json (mesures, décisions, écarts), <dossier>/drill.log.
# Code de sortie 0 seulement si TOUS les contrôles passent.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
set +e   # chaque étape est contrôlée explicitement (controle), y compris les échecs attendus

OUT="${1:-${DR2_OUT:-/tmp/elsatia-dr-v2/run-$(date -u +%Y%m%dT%H%M%SZ)}}"
mkdir -p "$OUT/backups"; chmod -R 777 "$OUT"
SOURCE_DB="${DR2_SOURCE_DB:-upg_v4_v5}"
FRESH_DB="${DR2_FRESH_DB:-v5_fresh}"
SRC=elsatia_dr_v2_src; LIVE=elsatia_dr_v2_live
RES="$OUT/results.json"; echo '{"controles": []}' > "$RES"
ECHECS=0
exec > >(tee -a "$OUT/drill.log") 2>&1

res_set() { local t; t=$(mktemp); jq "$1" "$RES" > "$t" && mv "$t" "$RES"; }
controle() { # controle <id> <libellé> <ok|ko> [détail]
  local statut="$3"; [[ "$statut" == ok ]] || ECHECS=$((ECHECS + 1))
  printf '  %s %s — %s%s\n' "$([[ $statut == ok ]] && echo ✅ || echo ❌)" "$1" "$2" "${4:+ ($4)}"
  res_set ".controles += [{\"id\": $(jq -Rn --arg v "$1" '$v'), \"libelle\": $(jq -Rn --arg v "$2" '$v'), \"statut\": \"$statut\", \"detail\": $(jq -Rn --arg v "${4:-}" '$v')}]"
}
mesure() { res_set ".mesures[\"$1\"] = $2"; }
snap() { python3 "$DR2_HERE/snapshot.py" "$1" "$2" >/dev/null; }
comparer() { python3 "$DR2_HERE/compare.py" "$1" "$2" --json "$3"; }
smokes() { # smokes <base> <préfixe> — contrôles métier V5 + smokes DR (transactions annulées)
  local base="$1" p="$2" f1="$OUT/$2_metier_v5.tap" f2="$OUT/$2_smokes.tap" t0 ok1 ok2
  t0=$(dr2_now)
  dr2_psqla "$base" -v ON_ERROR_STOP=0 -f "$DR2_REPO/scripts/local-postgres-bootstrap/upgrade_v4_v5_business_checks.sql" > "$f1" 2>&1
  dr2_psqla "$base" -v ON_ERROR_STOP=0 -f "$DR2_HERE/restore_smokes.sql" > "$f2" 2>&1
  mesure "${p}_smokes_s" "$(dr2_dur "$t0" "$(dr2_now)")"
  ok1=$(grep -cE '^ok ' "$f1"); ok2=$(grep -cE '^ok ' "$f2")
  [[ "$ok1" == 35 && ! $(grep -E '^not ok|ERROR' "$f1") ]] && controle "$p-M" "contrôles métier V5 après restauration" ok "$ok1/35" \
    || controle "$p-M" "contrôles métier V5 après restauration" ko "$ok1/35"
  [[ "$ok2" == 16 && ! $(grep -E '^not ok|ERROR' "$f2") ]] && controle "$p-S" "smokes DR après restauration" ok "$ok2/16" \
    || controle "$p-S" "smokes DR après restauration" ko "$ok2/16"
}
restaurer() { # restaurer <préfixe> <base> — restauration B0 + instantané + comparaison stricte à B0
  local p="$1" base="$2" d t0 t1
  d=$("$DR2_HERE/restore.sh" "$B0" "$base" --force 2>>"$OUT/restore.err") || { controle "$p-R" "restauration B0" ko "voir restore.err"; return 1; }
  mesure "${p}_restore_s" "$d"
  t0=$(dr2_now); snap "$base" "$OUT/${p}_apres_restauration.json"
  if comparer "$B0/snapshot.json" "$OUT/${p}_apres_restauration.json" "$OUT/${p}_comparaison.json" > "$OUT/${p}_comparaison.txt"; then
    controle "$p-R" "restauration B0 = sauvegarde (lignes, checksums, RLS, policies, grants, schéma, états, droits, sonde RLS)" ok "0 écart, ${d}s"
  else
    controle "$p-R" "restauration B0 = sauvegarde" ko "$(tail -1 "$OUT/${p}_comparaison.txt")"
  fi
  t1=$(dr2_now); mesure "${p}_verify_s" "$(dr2_dur "$t0" "$t1")"
}

echo "== DR V2 — drill local — sortie $OUT"
res_set ".debut = \"$(date -u +%FT%TZ)\" | .git_sha = \"$(git -C "$DR2_REPO" rev-parse HEAD)\" | .migrations = $(ls "$DR2_REPO"/supabase/migrations/*.sql | wc -l)"
for b in "$SRC" "$LIVE" elsatia_dr_v2_verify elsatia_dr_v2_d3ref elsatia_dr_v2_d3resume; do dr2_garde "$b" drill; done

# ── 0. Jeu de données ─────────────────────────────────────────────────────────────────
echo "== 0. Jeu de données réaliste"
T0=$(dr2_now)
if ! dr2_db_existe "$SOURCE_DB" || [[ "${DR2_REBUILD:-0}" == 1 ]]; then
  echo "  construction : base fraîche $FRESH_DB + harnais d'upgrade V4 → V5 ($SOURCE_DB)"
  bash "$DR2_REPO/scripts/local-postgres-bootstrap/rebuild_db.sh" "$FRESH_DB" > "$OUT/rebuild.log" 2>&1 || { echo "ÉCHEC rebuild"; exit 1; }
  UPG_OUT="$OUT/upgrade" bash "$DR2_REPO/scripts/qualification/upgrade-v4-v5.sh" "$SOURCE_DB" "$FRESH_DB" > "$OUT/upgrade.log" 2>&1
  grep -q "contrôles métier 35/35" "$OUT/upgrade.log" || { echo "ÉCHEC harnais d'upgrade (voir upgrade.log)"; exit 1; }
fi
dr2_db_copier "$SOURCE_DB" "$SRC"
dr2_psqla "$SRC" -f "$DR2_HERE/dataset_complement.sql" > "$OUT/dataset.log" 2>&1 || { echo "ÉCHEC complément"; cat "$OUT/dataset.log"; exit 1; }
dr2_db_copier "$SRC" "$LIVE"
mesure dataset_s "$(dr2_dur "$T0" "$(dr2_now)")"
dr2_psqla "$LIVE" -c "select 'jeu|' || (select count(*) from public.entreprises) || '|' || (select count(*) from auth.users) || '|' || (select count(*) from public.factures) || '|' || (select count(*) from public.devis) || '|' || (select count(*) from public.commandes_fournisseurs) || '|' || (select count(*) from public.mouvements_stock) || '|' || (select count(*) from public.pointages) || '|' || (select count(*) from public.reserves) || '|' || (select count(*) from public.tools_releves_plans) || '|' || (select count(*) from public.colors_seaux) || '|' || (select count(*) from storage.objects)" \
  | awk -F'|' '{printf "  entreprises %s, utilisateurs %s, factures %s, devis %s, commandes %s, mouvements stock %s, pointages %s, réserves %s, plans 2D %s, seaux Colors %s, objets Storage %s\n",$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12}'

# ── 1. Backup ─────────────────────────────────────────────────────────────────────────
echo "== 1. Backup B0 de $LIVE"
T0=$(dr2_now)
B0=$("$DR2_HERE/backup.sh" "$LIVE" "$OUT/backups" 2>>"$OUT/backup.err") || { echo "ÉCHEC backup"; cat "$OUT/backup.err"; exit 1; }
T1=$(dr2_now)
BACKUP_AT=$(jq -r .backup_at_utc "$B0/manifest.json")
mesure backup_total_s "$(dr2_dur "$T0" "$T1")"
mesure backup_pg_dump_s "$(jq .durees_secondes.pg_dump "$B0/manifest.json")"
mesure backup_dump_octets "$(jq '.fichiers["db.dump"].octets' "$B0/manifest.json")"
res_set ".backup = $(jq '{backup_id, backup_at_utc, train, pg_dump_toc_entrees, fichiers}' "$B0/manifest.json")"
controle B-1 "backup complet + manifeste + SHA-256" ok "$(jq -r .backup_id "$B0/manifest.json"), $(jq '.fichiers["db.dump"].octets' "$B0/manifest.json") o, TOC $(jq .pg_dump_toc_entrees "$B0/manifest.json")"
if V=$("$DR2_HERE/verify_backup.sh" "$B0" elsatia_dr_v2_verify 2>>"$OUT/verify.err"); then
  mesure verify_backup_restore_s "${V%% *}"; mesure verify_backup_total_s "${V##* }"
  controle B-2 "backup lisible ET restaurable à l'identique (restauration de test, comparaison stricte)" ok "restauration ${V%% *}s, vérification ${V##* }s"
else
  controle B-2 "backup lisible et restaurable" ko "voir verify.err"
fi

# ── 2. Disaster 1 : suppression accidentelle ──────────────────────────────────────────
echo "== 2. Disaster 1 — suppression accidentelle de données métier"
# Écriture métier POSTÉRIEURE à la sauvegarde : elle sera perdue (RPO local = âge du backup).
dr2_psqla "$LIVE" -c "insert into public.planning_evenements (id, entreprise_id, titre, debut, fin) values ('d2900000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'DRV2 écrit après le backup', now(), now() + interval '1 hour')" >/dev/null
PILOTE=$(dr2_psqla "$LIVE" -c "select id from public.entreprises where nom = 'SARL Bati-Rhone Construction'")
: > "$OUT/d1_operations.txt"
while IFS= read -r stmt; do
  [[ -z "$stmt" ]] && continue
  r=$(dr2_psqla "$LIVE" -v ON_ERROR_STOP=1 -c "$stmt" 2>&1 | tail -1)
  printf '%s\t%s\n' "$stmt" "${r:-OK}" >> "$OUT/d1_operations.txt"
done <<EOF
delete from public.pointages where entreprise_id = '$PILOTE'
delete from public.mouvements_stock where entreprise_id = '$PILOTE'
delete from public.reserves_photos
delete from public.tools_releves_elements
delete from public.colors_mouvements
delete from public.devis where statut = 'brouillon'
delete from public.factures where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
delete from public.chantiers where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
delete from public.planning_evenements
delete from storage.objects where bucket_id = 'reserves-photos'
delete from auth.users where id = '10000000-0000-0000-0000-000000000006'
EOF
sed 's/^/    /' "$OUT/d1_operations.txt"
T_DISASTER=$(date -u +%FT%T.%6NZ)
snap "$LIVE" "$OUT/d1_sinistre.json"
comparer "$B0/snapshot.json" "$OUT/d1_sinistre.json" "$OUT/d1_sinistre_comparaison.json" > "$OUT/d1_sinistre.txt"
PERTES=$(jq '[.tables.ecarts[] | ((.reference.lignes // 0) - (.restauree.lignes // 0)) | select(. > 0)] | add // 0' "$OUT/d1_sinistre_comparaison.json")
NT=$(jq '.tables.ecarts | length' "$OUT/d1_sinistre_comparaison.json")
[[ "$PERTES" -gt 0 ]] && controle D1-0 "sinistre détecté par la comparaison stricte" ok "$NT tables touchées, $PERTES lignes perdues" \
  || controle D1-0 "sinistre détecté" ko
res_set ".d1 = {tables_touchees: $NT, lignes_perdues: $PERTES}"
restaurer D1 "$LIVE"
PERDU=$(dr2_psqla "$LIVE" -c "select count(*) from public.planning_evenements where id = 'd2900000-0000-4000-8000-000000000001'")
RPO=$(awk -v a="$(date -d "$BACKUP_AT" +%s.%N)" -v b="$(date -d "$T_DISASTER" +%s.%N)" 'BEGIN{printf "%.1f", b-a}')
mesure rpo_local_observe_s "$RPO"
[[ "$PERDU" == 0 ]] && controle D1-RPO "écriture postérieure au backup perdue (RPO local = âge du backup, pas de WAL/PITR local)" ok "RPO observé ${RPO}s" \
  || controle D1-RPO "RPO" ko "écriture post-backup présente ?"
smokes "$LIVE" D1

# ── 3. Disaster 2 : migration cassée ──────────────────────────────────────────────────
echo "== 3. Disaster 2 — migration cassée après le backup"
dr2_psqla "$LIVE" -v ON_ERROR_STOP=1 -f "$DR2_HERE/d2_migration_cassee.sql" > "$OUT/d2_migration.log" 2>&1
RC=$?
grep -E 'ERROR' "$OUT/d2_migration.log" | head -2 | sed 's/^/    /'
AN=$(dr2_psqla "$LIVE" -c "select has_table_privilege('anon', 'public.clients', 'select')")
COL=$(dr2_psqla "$LIVE" -c "select count(*) from information_schema.columns where table_name = 'clients' and column_name = 'drv2_segment'")
[[ "$RC" != 0 && "$AN" == t && "$COL" == 1 ]] && controle D2-0 "migration échouée ET à moitié appliquée (bloc 1 validé : GRANT anon, policy, backfill)" ok "psql rc=$RC" \
  || controle D2-0 "migration à moitié appliquée" ko "rc=$RC anon=$AN col=$COL"
snap "$LIVE" "$OUT/d2_sinistre.json"
comparer "$B0/snapshot.json" "$OUT/d2_sinistre.json" "$OUT/d2_sinistre_comparaison.json" > "$OUT/d2_sinistre.txt"
D2E=$(jq '{policies: ((.policies.manquants|length)+(.policies.en_trop|length)), grants: ([.grants[] | (.manquants|length)+(.en_trop|length)] | add), schema: (.schema.ecarts|length), tables: (.tables.ecarts|length), etats: (.etats_metier.ecarts|length)}' "$OUT/d2_sinistre_comparaison.json")
[[ $(jq '.policies > 0 and .grants > 0 and .schema > 0 and .etats > 0' <<<"$D2E") == true ]] \
  && controle D2-1 "régressions détectées (policies, grants, schéma, états métier)" ok "$(jq -c . <<<"$D2E")" \
  || controle D2-1 "régressions détectées" ko "$(jq -c . <<<"$D2E")"
res_set ".d2 = $D2E"
restaurer D2 "$LIVE"
AN=$(dr2_psqla "$LIVE" -c "select has_table_privilege('anon', 'public.clients', 'select')")
[[ "$AN" == f ]] && controle D2-2 "GRANT anon abusif retiré par la restauration" ok || controle D2-2 "GRANT anon retiré" ko

# ── 4. Disaster 3 : purge RGPD interrompue ────────────────────────────────────────────
echo "== 4. Disaster 3 — purge RGPD interrompue"
ENT=e0000000-0000-4000-8000-00000000000a
purge_complete() { # purge_complete <base> <run_id> → résultat du déroulé de scripts/purger-entreprise.mjs
  { echo "begin;"
    echo "select set_config('rgpd.entreprise_cible', '$ENT', true);"
    echo "select set_config('rgpd.run_id', '$2', true);"
    cat "$DR2_REPO/supabase/tests/fixtures/rgpd_purge_driver.inc"
    echo "select 'RESULTAT=' || current_setting('rgpd.resultat');"
    echo "commit;"; } | dr2_psqla "$1" 2>>"$OUT/d3_purge.err" | grep '^RESULTAT=' | sed 's/RESULTAT=//'
}
empreinte() { dr2_psqla "$1" -v e="$ENT" -f "$DR2_HERE/d3_empreinte.sql"; }
autres() { dr2_psqla "$1" -c "select md5(string_agg(e.id::text || ':' || (select count(*) from devis d where d.entreprise_id = e.id) || ':' || (select count(*) from factures f where f.entreprise_id = e.id) || ':' || (select count(*) from clients c where c.entreprise_id = e.id) || ':' || (select count(*) from storage.objects o where o.name like e.id::text || '/%'), ',' order by e.id)) from entreprises e where e.id <> '$ENT'"; }
# Référence : purge complète, sans incident, sur une copie de B0.
"$DR2_HERE/restore.sh" "$B0" elsatia_dr_v2_d3ref --force >/dev/null 2>>"$OUT/restore.err"
AUTRES0=$(autres elsatia_dr_v2_d3ref)
RREF=$(purge_complete elsatia_dr_v2_d3ref d3000000-0000-4000-8000-000000000001)
EREF=$(empreinte elsatia_dr_v2_d3ref)
echo "    purge de référence : $RREF (empreinte $EREF)"
[[ "$RREF" == complete ]] && controle D3-0 "purge de référence (sans incident) complète" ok "$RREF" || controle D3-0 "purge de référence" ko "$RREF"
# Interruption : le script Node appelle une RPC par table, chacune dans sa propre transaction ;
# le processus meurt après la moitié des tables (aucun marquage « purgée »).
mapfile -t TABLES < <(dr2_psqla "$LIVE" -c "select table_nom from public.rapport_purge_entreprise('$ENT') where categorie = 'DELETE' and nb_lignes > 0 order by ordre, table_nom")
MOITIE=$(( (${#TABLES[@]} + 1) / 2 ))
for t in "${TABLES[@]:0:$MOITIE}"; do
  dr2_psqla "$LIVE" -c "set role service_role; select set_config('request.jwt.claims', '{\"role\":\"service_role\"}', false); select ok from public.purger_table_entreprise('$ENT', '$t', 'd3000000-0000-4000-8000-000000000002')" >/dev/null 2>>"$OUT/d3_purge.err"
done
RESTE=$(dr2_psqla "$LIVE" -c "select count(*) || ' tables / ' || coalesce(sum(nb_lignes), 0) || ' lignes' from public.rapport_purge_entreprise('$ENT') where categorie = 'DELETE' and nb_lignes > 0")
MARQ=$(dr2_psqla "$LIVE" -c "select purgee_at is not null from public.entreprises where id = '$ENT'")
echo "    interrompue après ${MOITIE}/${#TABLES[@]} tables ; restant : $RESTE ; marquée purgée : $MARQ"
[[ "$MARQ" == f ]] && controle D3-1 "purge interrompue : état partiel, tenant NON marqué purgé" ok "${MOITIE}/${#TABLES[@]} tables purgées, reste $RESTE" \
  || controle D3-1 "purge interrompue" ko
res_set ".d3 = {tables_a_purger: ${#TABLES[@]}, tables_purgees_avant_interruption: $MOITIE, reste: \"$RESTE\", resultat_reference: \"$RREF\"}"
# (a) Reprise sur place, sans restauration.
dr2_db_copier "$LIVE" elsatia_dr_v2_d3resume
RA=$(purge_complete elsatia_dr_v2_d3resume d3000000-0000-4000-8000-000000000003)
EA=$(empreinte elsatia_dr_v2_d3resume)
[[ "$RA" == complete && "$EA" == "$EREF" ]] && controle D3-2 "(a) reprise sur place : purge rejouée complète, état = référence" ok "$RA" \
  || controle D3-2 "(a) reprise sur place" ko "$RA / $EA ≠ $EREF"
# (b) Restauration B0 puis rejeu intégral.
restaurer D3 "$LIVE"
RB=$(purge_complete "$LIVE" d3000000-0000-4000-8000-000000000004)
EB=$(empreinte "$LIVE")
[[ "$RB" == complete && "$EB" == "$EREF" ]] && controle D3-3 "(b) restauration B0 + rejeu : purge complète, état = référence" ok "$RB" \
  || controle D3-3 "(b) restauration + rejeu" ko "$RB / $EB ≠ $EREF"
[[ "$(autres "$LIVE")" == "$AUTRES0" && "$(autres elsatia_dr_v2_d3resume)" == "$AUTRES0" ]] \
  && controle D3-4 "autres tenants inchangés (devis, factures, clients, objets Storage)" ok \
  || controle D3-4 "autres tenants inchangés" ko
R2=$(purge_complete "$LIVE" d3000000-0000-4000-8000-000000000005); E2=$(empreinte "$LIVE")
[[ "$E2" == "$EREF" ]] && controle D3-5 "purge relancée sur tenant déjà purgé : idempotente" ok "$R2" || controle D3-5 "idempotence" ko "$R2"
dr2_db_drop elsatia_dr_v2_d3ref; dr2_db_drop elsatia_dr_v2_d3resume
"$DR2_HERE/restore.sh" "$B0" "$LIVE" --force >/dev/null 2>>"$OUT/restore.err"   # retour à B0 pour D4

# ── 5. Disaster 4 : corruption de l'état Stripe local ─────────────────────────────────
echo "== 5. Disaster 4 — corruption de l'état Stripe local"
T_EVT=$(date -u -d '-1 hour' +%FT%TZ)
etat_droits() { dr2_psqla "$1" -c "select (select abonnement_statut from public.entreprises where id = 'a7400000-0000-4000-8000-000000000050') || '|' || (select case when revoked_at is null then 'tools_actif' else 'tools_revoque' end from public.entitlements_utilisateurs_elsatia where source = 'web' and metadata->>'reference_externe' = 'sub_upgrade_v3')"; }
# Événements Stripe postérieurs au backup, reçus par la base vivante.
dr2_psqla "$LIVE" -v t_evt="$T_EVT" -f "$DR2_HERE/d4_evenements_stripe_post_backup.sql" > "$OUT/d4_evenements_1.txt" 2>&1
VERITE=$(etat_droits "$LIVE")
snap "$LIVE" "$OUT/d4_verite.json"
echo "    vérité Stripe (après événements post-backup) : $VERITE ; décisions : $(grep -E '^E[0-9]' "$OUT/d4_evenements_1.txt" | tr '\n' ' ')"
[[ "$VERITE" == "suspendu|tools_revoque" ]] && controle D4-0 "événements post-backup appliqués (accès GP suspendu, Tools révoqué)" ok || controle D4-0 "événements post-backup" ko "$VERITE"
dr2_psqla "$LIVE" -f "$DR2_HERE/d4_corruption.sql" >/dev/null
CORROMPU=$(etat_droits "$LIVE")
[[ "$CORROMPU" == "actif|tools_actif" ]] && controle D4-1 "corruption : droits rouverts localement, journal d'ordre effacé" ok "$CORROMPU" || controle D4-1 "corruption" ko "$CORROMPU"
restaurer D4 "$LIVE"
APRES=$(etat_droits "$LIVE")
echo "    après restauration B0 seule : $APRES (état de $BACKUP_AT)"
GARDE=$(dr2_psqla "$LIVE" -v backup_at="$BACKUP_AT" -f "$DR2_HERE/stripe_controle_post_restauration.sql")
NG=$(grep -c . <<<"$GARDE")
echo "$GARDE" | sed 's/^/    à reconcilier : /'
[[ "$APRES" == "actif|tools_actif" && "$NG" -ge 2 ]] \
  && controle D4-2 "restauration seule = réouverture ; la garde post-restauration la signale AVANT réouverture" ok "$NG droit(s) à reconcilier" \
  || controle D4-2 "garde post-restauration" ko "état=$APRES garde=$NG"
# Rejeu des événements Stripe créés depuis backup_at (Events API created[gte]) — puis doublons.
dr2_psqla "$LIVE" -v t_evt="$T_EVT" -f "$DR2_HERE/d4_evenements_stripe_post_backup.sql" > "$OUT/d4_rejeu_1.txt" 2>&1
dr2_psqla "$LIVE" -v t_evt="$T_EVT" -f "$DR2_HERE/d4_evenements_stripe_post_backup.sql" > "$OUT/d4_rejeu_2.txt" 2>&1
FINAL=$(etat_droits "$LIVE")
echo "    rejeu 1 : $(grep -E '^E[0-9]' "$OUT/d4_rejeu_1.txt" | tr '\n' ' ') ; rejeu 2 : $(grep -E '^E[0-9]' "$OUT/d4_rejeu_2.txt" | tr '\n' ' ')"
[[ "$FINAL" == "$VERITE" ]] && controle D4-3 "après rejeu : droits = vérité Stripe (aucune réouverture)" ok "$FINAL" || controle D4-3 "droits = vérité Stripe" ko "$FINAL"
grep -q '^E2|deja_traite' "$OUT/d4_rejeu_2.txt" && grep -q '^E3|deja_traite' "$OUT/d4_rejeu_2.txt" \
  && controle D4-4 "second rejeu (doublons Stripe) : deja_traite, aucun effet" ok || controle D4-4 "doublons" ko
# Un événement ANTÉRIEUR livré en retard (invoice.paid d'avant l'échec) ne rouvre rien.
LATE=$(dr2_psqla "$LIVE" -c "select public.appliquer_evenement_facture_abonnement_v2_service('a7400000-0000-4000-8000-000000000050', 'evt_drv2_late_paid', 'invoice.paid', '$T_EVT'::timestamptz - interval '30 minutes', 'in_drv2_late', 'paid', '$T_EVT'::timestamptz - interval '30 minutes', 'ELS-DRV2-LATE', now() - interval '40 days', now() - interval '10 days', 249, 49.8, 298.8, 'eur', null, null, 'sub_upg4_50')->>'decision'")
[[ "$LATE" == perime && "$(etat_droits "$LIVE")" == "$VERITE" ]] && controle D4-5 "événement antérieur livré en retard : périmé, pas de réouverture" ok "$LATE" \
  || controle D4-5 "événement tardif" ko "$LATE"
GARDE2=$(dr2_psqla "$LIVE" -v backup_at="$BACKUP_AT" -f "$DR2_HERE/stripe_controle_post_restauration.sql" | grep -cE 'a7400000-0000-4000-8000-000000000050|sub_upgrade_v3' || true)
[[ "$GARDE2" == 0 ]] && controle D4-6 "garde post-restauration levée pour les droits rejoués" ok || controle D4-6 "garde levée" ko "$GARDE2"
snap "$LIVE" "$OUT/d4_final.json"
DIFF=$(jq -n --slurpfile a "$OUT/d4_verite.json" --slurpfile b "$OUT/d4_final.json" '[$a[0].droits, $b[0].droits] | (.[0] - .[1]) + (.[1] - .[0]) | length')
[[ "$DIFF" == 0 ]] && controle D4-7 "tous les droits (19 entreprises + entitlements) = état avant corruption" ok || controle D4-7 "droits globaux" ko "$DIFF écart(s)"

# ── 6. Échecs attendus de l'outillage ─────────────────────────────────────────────────
echo "== 6. Échecs attendus (garde-fous)"
ALT="$OUT/backups/altere"; rm -rf "$ALT"; cp -r "$B0" "$ALT"; printf 'x' >> "$ALT/db.dump"
"$DR2_HERE/restore.sh" "$ALT" elsatia_dr_v2_verify --force >/dev/null 2>"$OUT/f1.err" && controle F-1 "sauvegarde altérée refusée" ko \
  || { grep -q INTEGRITE "$OUT/f1.err" && controle F-1 "sauvegarde altérée (1 octet) refusée avant toute action" ok || controle F-1 "sauvegarde altérée" ko; }
"$DR2_HERE/restore.sh" "$B0" "$LIVE" >/dev/null 2>"$OUT/f2.err" && controle F-2 "écrasement sans --force refusé" ko \
  || { grep -q -- '--force' "$OUT/f2.err" && controle F-2 "écrasement d'une base non vide sans --force refusé" ok || controle F-2 "sans --force" ko; }
( "$DR2_HERE/restore.sh" "$B0" upg_v4_v5 --force ) >/dev/null 2>"$OUT/f3.err" && controle F-3 "base hors préfixe refusée" ko \
  || controle F-3 "restauration vers une base hors préfixe elsatia_dr_ refusée" ok
( VERCEL_ENV=production "$DR2_HERE/restore.sh" "$B0" elsatia_dr_v2_verify --force ) >/dev/null 2>"$OUT/f4.err" && controle F-4 "Production refusée" ko \
  || { grep -q "Production refusée" "$OUT/f4.err" && controle F-4 "environnement Production refusé par défaut" ok || controle F-4 "Production" ko; }
( DR_PGHOST=10.1.2.3 "$DR2_HERE/restore.sh" "$B0" elsatia_dr_v2_verify --force ) >/dev/null 2>"$OUT/f5.err" && controle F-5 "cible distante refusée" ko \
  || { grep -q "distante" "$OUT/f5.err" && controle F-5 "cible distante non autorisée refusée" ok || controle F-5 "distante" ko; }
rm -rf "$ALT"; dr2_db_drop elsatia_dr_v2_verify

res_set ".fin = \"$(date -u +%FT%TZ)\" | .echecs = $ECHECS"
echo "== Résultat : $(jq '[.controles[] | select(.statut == "ok")] | length' "$RES") contrôles OK, $ECHECS en échec — $RES"
exit $(( ECHECS > 0 ? 1 : 0 ))
