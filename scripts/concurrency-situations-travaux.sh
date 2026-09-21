#!/usr/bin/env bash
# Harness de preuve concurrente REELLE pour public.creer_situation_travaux
# (numerotation de public.situations_travaux.numero).
#
# A la difference du test pgTAP (supabase/tests/situations_travaux_numero_concurrency.test.sql),
# qui s'execute dans UNE SEULE transaction et ne peut donc verifier que des
# proprietes deterministes et sequentielles (signature, presence du verrou,
# numerotation sequentielle en une session), ce script lance de VRAIES
# sessions PostgreSQL concurrentes (processus psql distincts, connexions
# separees) pour observer le comportement reel sous contention.
#
# SECURITE : ce script ecrit des donnees de test et ne doit JAMAIS etre
# execute contre une base de production. Il refuse de s'executer tant que
# la variable CONFIRM_LOCAL_TEST_DB n'est pas explicitement positionnee a 1.
#
# Usage :
#   npm run db:start        # (necessite Docker) demarre la stack Supabase locale
#   CONFIRM_LOCAL_TEST_DB=1 ./scripts/concurrency-situations-travaux.sh
#
# Variables d'environnement optionnelles :
#   PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD (defaut : stack Supabase locale)
#
# Ce script est un outil de diagnostic manuel, il ne fait pas partie de
# `npm run verify` ni de `npm run test:db` (pgTAP) et n'est pas execute en CI.

set -euo pipefail

if [ "${CONFIRM_LOCAL_TEST_DB:-0}" != "1" ]; then
  echo "Refus : positionnez CONFIRM_LOCAL_TEST_DB=1 pour confirmer qu'il s'agit" >&2
  echo "d'une base LOCALE DE TEST jetable (jamais une base de production)." >&2
  exit 1
fi

export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-54322}"
export PGDATABASE="${PGDATABASE:-postgres}"
export PGUSER="${PGUSER:-postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"

echo "Cible : postgresql://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
echo "Rappel : utilisez uniquement une base Supabase locale (npm run db:start) ou un projet de test dedie, jamais la production."

PSQL=(psql -X -q -v ON_ERROR_STOP=1)

# --- Identifiants de test fixes (nettoyes en fin de script) ---
ENT_A=aaaa1111-0000-0000-0000-000000000001
ENT_B=bbbb2222-0000-0000-0000-000000000002
USER_A=eeee1111-0000-0000-0000-000000000001
USER_B=eeee2222-0000-0000-0000-000000000002
POSTE_A=ffff1111-0000-0000-0000-000000000001
POSTE_B=ffff2222-0000-0000-0000-000000000002
CLIENT_A=cccc1111-0000-0000-0000-000000000001
CLIENT_B=cccc2222-0000-0000-0000-000000000002
CHANTIER_A=dddd1111-0000-0000-0000-000000000001
CHANTIER_B=dddd2222-0000-0000-0000-000000000002
DEVIS_SAME=1111aaaa-0000-0000-0000-000000000001
DEVIS_STRESS=1111aaaa-0000-0000-0000-000000000002
DEVIS_OTHER=1111aaaa-0000-0000-0000-000000000003
DEVIS_B=2222bbbb-0000-0000-0000-000000000001

nettoyer() {
  "${PSQL[@]}" -v ON_ERROR_STOP=0 <<SQL >/dev/null 2>&1 || true
delete from public.lignes_situations where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.situations_travaux where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.journal_activite where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.lignes_devis where devis_id in ('$DEVIS_SAME','$DEVIS_STRESS','$DEVIS_OTHER','$DEVIS_B');
delete from public.devis where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.chantiers where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.clients where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.utilisateurs_entreprises where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.permissions_poste where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.postes where entreprise_id in ('$ENT_A','$ENT_B');
delete from public.entreprises where id in ('$ENT_A','$ENT_B');
delete from auth.users where id in ('$USER_A','$USER_B');
drop function if exists public.creer_situation_travaux_harness_overlap(uuid,uuid,numeric,numeric,text,numeric);
SQL
}
trap nettoyer EXIT

echo "--- Nettoyage prealable (au cas ou une execution precedente aurait echoue) ---"
nettoyer

echo "--- Seed minimal (deux entreprises, deux utilisateurs autorises) ---"
"${PSQL[@]}" <<SQL
insert into auth.users(id) values ('$USER_A'),('$USER_B') on conflict do nothing;
insert into public.entreprises(id, nom, abonnement_statut) values
 ('$ENT_A','Harness Ent A','essai'), ('$ENT_B','Harness Ent B','essai');
update public.utilisateurs set entreprise_active_id='$ENT_A' where id='$USER_A';
update public.utilisateurs set entreprise_active_id='$ENT_B' where id='$USER_B';
insert into public.postes(id, entreprise_id, nom) values
 ('$POSTE_A','$ENT_A','Gerant'), ('$POSTE_B','$ENT_B','Gerant');
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise) values
 ('$ENT_A','$POSTE_A','gerer_facturation_avancee', true),
 ('$ENT_B','$POSTE_B','gerer_facturation_avancee', true);
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id, statut) values
 ('$USER_A','$ENT_A','$POSTE_A','actif'), ('$USER_B','$ENT_B','$POSTE_B','actif');
insert into public.clients(id, entreprise_id, nom) values ('$CLIENT_A','$ENT_A','Client A'), ('$CLIENT_B','$ENT_B','Client B');
insert into public.chantiers(id, entreprise_id, client_id, nom) values ('$CHANTIER_A','$ENT_A','$CLIENT_A','Chantier A'), ('$CHANTIER_B','$ENT_B','$CLIENT_B','Chantier B');
insert into public.devis(id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht) values
 ('$DEVIS_SAME','$ENT_A','HARNESS-1','$CLIENT_A','$CHANTIER_A','accepte',500000),
 ('$DEVIS_STRESS','$ENT_A','HARNESS-2','$CLIENT_A','$CHANTIER_A','accepte',2000000),
 ('$DEVIS_OTHER','$ENT_A','HARNESS-3','$CLIENT_A','$CHANTIER_A','accepte',100000),
 ('$DEVIS_B','$ENT_B','HARNESS-B1','$CLIENT_B','$CHANTIER_B','accepte',150000);
insert into public.lignes_devis(devis_id, designation, quantite, prix_unitaire_ht, remise_ligne) values
 ('$DEVIS_SAME','Lot',1,500000,0), ('$DEVIS_STRESS','Lot',1,2000000,0),
 ('$DEVIS_OTHER','Lot',1,100000,0), ('$DEVIS_B','Lot',1,150000,0);
SQL

WORKDIR="$(mktemp -d)"
trap 'nettoyer; rm -rf "$WORKDIR"' EXIT

appel_reel() {
  local user="$1" ent="$2" devis="$3" avancement="$4" note="$5" outfile="$6"
  "${PSQL[@]}" -c "set request.jwt.claim.sub='${user}'; select public.creer_situation_travaux('${ent}','${devis}',${avancement},0,'${note}');" \
    > "$outfile" 2>&1
}

echo
echo "=== Scenario 1 : 2 sessions reellement concurrentes, meme entreprise+devis ==="
appel_reel "$USER_A" "$ENT_A" "$DEVIS_SAME" 10 harness-1a "$WORKDIR/s1_1.txt" &
appel_reel "$USER_A" "$ENT_A" "$DEVIS_SAME" 20 harness-1b "$WORKDIR/s1_2.txt" &
wait
echo "-- resultats bruts --"; cat "$WORKDIR/s1_1.txt" "$WORKDIR/s1_2.txt"
echo "-- numeros attribues --"
"${PSQL[@]}" -c "select numero, notes from public.situations_travaux where devis_id='$DEVIS_SAME' order by numero;"

echo
echo "=== Scenario 2 : 5 sessions reellement concurrentes, meme devis ==="
echo "(avancement_pct croissant par session : 10,20,30,40,50. Le nombre de"
echo " succes peut varier d'une execution a l'autre selon l'ordre reel de"
echo " commit -- la regle metier 'avancement > cumul precedent' (hors perimetre"
echo " de cette mission, non modifiee) peut legitimement rejeter une session a"
echo " faible avancement si une session a avancement plus eleve commite avant"
echo " elle. Ce script distingue explicitement ce rejet METIER d'un echec de"
echo " CONCURRENCE (23505/deadlock/timeout) sur la numerotation : seul ce"
echo " dernier signalerait une regression du correctif.)"
i=1
for pct in 10 20 30 40 50; do
  appel_reel "$USER_A" "$ENT_A" "$DEVIS_STRESS" "$pct" "harness-5-$i" "$WORKDIR/s2_$i.txt" &
  i=$((i+1))
done
wait
echo "-- echecs eventuels (concurrency failure = 23505/deadlock/timeout ; le reste = business-rule rejection) --"
grep -il "ERROR" "$WORKDIR"/s2_*.txt || echo "(aucun echec)"
for f in "$WORKDIR"/s2_*.txt; do
  if grep -q "ERROR" "$f"; then
    if grep -qi "23505\|duplicate key\|deadlock\|timeout" "$f"; then
      echo "  $f : CONCURRENCY FAILURE -> $(grep ERROR "$f")"
    else
      echo "  $f : BUSINESS-RULE REJECTION -> $(grep ERROR "$f")"
    fi
  fi
done
echo "-- numeros attribues --"
"${PSQL[@]}" -c "select numero, notes from public.situations_travaux where devis_id='$DEVIS_STRESS' order by numero;"

echo
echo "=== Scenario 3 : devis differents (meme entreprise) doivent progresser sans se bloquer ==="
DEBUT=$(date +%s.%N)
appel_reel "$USER_A" "$ENT_A" "$DEVIS_SAME" 30 harness-3a "$WORKDIR/s3_1.txt" &
appel_reel "$USER_A" "$ENT_A" "$DEVIS_OTHER" 10 harness-3b "$WORKDIR/s3_2.txt" &
wait
FIN=$(date +%s.%N)
echo "Duree (doit rester proche du temps d'un seul appel, pas du double) : $(echo "$FIN - $DEBUT" | bc)s"
cat "$WORKDIR/s3_1.txt" "$WORKDIR/s3_2.txt"

echo
echo "=== Scenario 4 : entreprises differentes doivent progresser sans se bloquer ==="
DEBUT=$(date +%s.%N)
appel_reel "$USER_A" "$ENT_A" "$DEVIS_OTHER" 50 harness-4a "$WORKDIR/s4_1.txt" &
appel_reel "$USER_B" "$ENT_B" "$DEVIS_B" 10 harness-4b "$WORKDIR/s4_2.txt" &
wait
FIN=$(date +%s.%N)
echo "Duree : $(echo "$FIN - $DEBUT" | bc)s"
cat "$WORKDIR/s4_1.txt" "$WORKDIR/s4_2.txt"

echo
echo "=== Scenario 5 (optionnel, preuve deterministe) : chevauchement force via un wrapper de test ==="
echo "Cree une copie temporaire de la fonction avec un pg_sleep() APRES l'acquisition"
echo "du verrou FOR UPDATE, pour garantir le chevauchement au lieu de compter sur le hasard du systeme."
"${PSQL[@]}" <<'SQL'
create or replace function public.creer_situation_travaux_harness_overlap(
 p_entreprise_id uuid,p_devis_id uuid,p_avancement_pct numeric,
 p_retenue_garantie_pct numeric default 0,p_notes text default null,
 p_delay numeric default 1
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_devis public.devis;v_id uuid;v_numero integer;v_precedent numeric:=0;v_cumule numeric;v_periode numeric;
begin
 if not public.a_permission(p_entreprise_id,'gerer_facturation_avancee') then raise exception 'Accès refusé';end if;
 if p_avancement_pct<=0 or p_avancement_pct>100 then raise exception 'Avancement invalide';end if;
 if coalesce(p_retenue_garantie_pct,0)<0 or coalesce(p_retenue_garantie_pct,0)>20 then raise exception 'Retenue de garantie invalide';end if;
 select * into v_devis from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id and statut='accepte';
 if not found then raise exception 'Le devis doit être accepté';end if;
 if v_devis.chantier_id is null then raise exception 'Un chantier doit être associé au devis';end if;
 select coalesce(max(ls.avancement_cumule_pct),0) into v_precedent
 from public.situations_travaux s join public.lignes_situations ls on ls.situation_id=s.id
 where s.entreprise_id=p_entreprise_id and s.devis_id=p_devis_id and s.statut<>'annulee';
 if p_avancement_pct<=v_precedent then raise exception 'L''avancement doit être supérieur au cumul précédent (%)',v_precedent;end if;
 perform 1 from public.devis where id=p_devis_id and entreprise_id=p_entreprise_id for update;
 perform pg_sleep(p_delay);
 select coalesce(max(numero),0)+1 into v_numero from public.situations_travaux where entreprise_id=p_entreprise_id and devis_id=p_devis_id;
 v_cumule:=round(v_devis.montant_ht*p_avancement_pct/100,2);v_periode:=round(v_devis.montant_ht*(p_avancement_pct-v_precedent)/100,2);
 insert into public.situations_travaux(entreprise_id,devis_id,chantier_id,numero,retenue_garantie_pct,montant_marche_ht,montant_cumule_ht,montant_periode_ht,montant_retenue,notes)
 values(p_entreprise_id,p_devis_id,v_devis.chantier_id,v_numero,coalesce(p_retenue_garantie_pct,0),v_devis.montant_ht,v_cumule,v_periode,round(v_periode*coalesce(p_retenue_garantie_pct,0)/100,2),nullif(btrim(p_notes),'')) returning id into v_id;
 insert into public.lignes_situations(entreprise_id,situation_id,ligne_devis_id,avancement_precedent_pct,avancement_cumule_pct,montant_periode_ht)
 select p_entreprise_id,v_id,l.id,v_precedent,p_avancement_pct,
  round(((l.quantite*l.prix_unitaire_ht)*(1-l.remise_ligne/100))*(p_avancement_pct-v_precedent)/100,2)
 from public.lignes_devis l where l.devis_id=p_devis_id;
 insert into public.journal_activite(entreprise_id,utilisateur_id,action,ressource,ressource_id,description,metadata)
 values(p_entreprise_id,auth.uid(),'creation','situation_travaux',v_id,'Situation d''avancement créée',jsonb_build_object('devis_id',p_devis_id,'avancement_pct',p_avancement_pct));
 return v_id;
end;$$;
SQL

appel_overlap() {
  local user="$1" ent="$2" devis="$3" avancement="$4" note="$5" outfile="$6"
  "${PSQL[@]}" -c "set request.jwt.claim.sub='${user}'; select public.creer_situation_travaux_harness_overlap('${ent}','${devis}',${avancement},0,'${note}',1);" \
    > "$outfile" 2>&1
}
DEBUT=$(date +%s.%N)
appel_overlap "$USER_A" "$ENT_A" "$DEVIS_OTHER" 51 overlap-1 "$WORKDIR/s5_1.txt" &
appel_overlap "$USER_A" "$ENT_A" "$DEVIS_OTHER" 52 overlap-2 "$WORKDIR/s5_2.txt" &
wait
FIN=$(date +%s.%N)
echo "Duree (doit etre proche de 2s : preuve que la 2e session a attendu le verrou) : $(echo "$FIN - $DEBUT" | bc)s"
cat "$WORKDIR/s5_1.txt" "$WORKDIR/s5_2.txt"
"${PSQL[@]}" -c "select numero, notes from public.situations_travaux where devis_id='$DEVIS_OTHER' order by numero;"

echo
echo "=== Termine. Nettoyage des donnees de test... ==="
