-- Correctif capacité : deadlock reproductible sur deux encaissements
-- concurrents de la même facture.
--
-- Constat (mission perf/gp-capacity-readiness-v1, § 14 "concurrence
-- écriture") : `recalc_paiements_facture` verrouille la facture avec
-- `SELECT ... FOR UPDATE` avant de recalculer `montant_paye`/`statut` — le
-- commentaire d'origine dit explicitement "Le verrou sérialise deux
-- paiements simultanés sur la même facture" (20260710000020). C'est
-- l'intention correcte, mais `FOR UPDATE` est le mode de verrou le plus
-- fort, qui entre en conflit avec le verrou `FOR KEY SHARE` que PostgreSQL
-- pose IMPLICITEMENT sur `factures` au moment de valider la contrainte de
-- clé étrangère de chaque `INSERT INTO paiements` (avant même que le
-- trigger `AFTER INSERT` ne s'exécute).
--
-- Deux encaissements concurrents sur la même facture (ex. comptable et
-- dirigeant qui saisissent chacun un virement bancaire en même temps) :
-- chaque transaction détient d'abord son propre FOR KEY SHARE (posé par
-- l'INSERT), puis tente de le faire monter vers FOR UPDATE dans le trigger —
-- interblocage classique de "verrou en escalade" (upgrade deadlock),
-- reproduit de façon déterministe (3/3 essais) lors de cette mission.
-- PostgreSQL détecte l'interblocage et annule l'une des deux transactions
-- (erreur 40P01) : aucune corruption de données, mais un des deux paiements
-- n'est PAS enregistré et l'utilisateur doit ressaisir — dégradation réelle
-- de l'expérience dès que deux personnes traitent des encaissements en
-- même temps, plausible dans une PME BTP de plusieurs comptables/gestion.
--
-- Correctif : `FOR NO KEY UPDATE` au lieu de `FOR UPDATE`. Ce mode est
-- compatible avec FOR KEY SHARE (donc plus de montée en conflit avec le
-- verrou implicite de la FK) tout en restant incompatible avec un autre
-- FOR NO KEY UPDATE concurrent — les deux paiements se sérialisent proprement
-- (l'un attend la fin de l'autre au lieu de s'interbloquer), ce qui est
-- exactement le comportement voulu par le commentaire d'origine. Correct ici
-- car l'UPDATE qui suit (montant_paye, statut, updated_at) ne touche aucune
-- colonne de clé primaire ni de contrainte unique référencée par une FK
-- (id, entreprise_id restent inchangés) — condition d'usage documentée de
-- FOR NO KEY UPDATE.
--
-- Résultat identique : mêmes règles de calcul de montant_paye/statut,
-- aucun changement de comportement fonctionnel, uniquement du mode de
-- verrouillage.
create or replace function public.recalc_paiements_facture(p_facture_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paye numeric := 0; v_ttc numeric := 0; v_statut text; v_echeance date;
begin
  -- Le verrou sérialise deux paiements simultanés sur la même facture ;
  -- FOR NO KEY UPDATE (pas FOR UPDATE) pour rester compatible avec le
  -- FOR KEY SHARE que la FK de chaque INSERT INTO paiements pose déjà.
  select montant_ttc, statut, date_echeance into v_ttc, v_statut, v_echeance
  from public.factures where id = p_facture_id for no key update;
  if not found then return; end if;
  select coalesce(sum(montant), 0) into v_paye from public.paiements where facture_id = p_facture_id;
  v_paye := round(v_paye, 2);

  -- On ne touche pas aux statuts terminaux ni au brouillon.
  if v_statut not in ('brouillon', 'annulee', 'avoir_emis') then
    if v_paye >= v_ttc and v_ttc > 0 then
      v_statut := 'payee';
    elsif v_paye > 0 then
      v_statut := 'payee_partiel';
    elsif v_echeance is not null and v_echeance < current_date then
      v_statut := 'en_retard';
    else
      v_statut := 'envoyee';
    end if;
  end if;

  update public.factures
  set montant_paye = round(v_paye, 2), statut = v_statut, updated_at = now()
  where id = p_facture_id
    and (montant_paye is distinct from round(v_paye, 2) or statut is distinct from v_statut);
end; $$;
