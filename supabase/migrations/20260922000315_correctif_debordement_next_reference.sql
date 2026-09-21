-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 — correctif P0 trouvé en
-- construisant le dataset lourd de qualification perf (5000 devis/tenant).
--
-- `public.next_reference()` (20260710000001) formate le compteur avec
-- `lpad(v_numero::text, p_largeur, '0')`. `lpad` en PostgreSQL TRONQUE une
-- chaîne déjà plus longue que la largeur demandée au lieu de l'étendre :
-- `lpad('1000', 3, '0')` = '100', pas '1000'. Dès que le compteur d'un
-- couple (entreprise, type) dépasse 10^p_largeur - 1, le numéro généré
-- entre en collision avec un numéro déjà attribué plus tôt et l'insertion
-- suivante échoue en 23505 (`duplicate key ... devis_entreprise_id_numero_key`
-- ou l'équivalent pour tout autre type utilisant next_reference).
--
-- Reproduit systématiquement en générant 1000 devis pour une même
-- entreprise : les 999 premiers passent, le 1000ᵉ échoue (numéro tronqué
-- '100', déjà pris par le 100ᵉ devis). C'est exactement la même classe de
-- défaut que `formater_numero_document` (corrigée par
-- 20260921000299_correctif_debordement_numerotation_documents.sql) — mais
-- `next_reference` est une fonction distincte, plus ancienne, utilisée par
-- 13 déclencheurs différents (devis DEV-3, factures FAC-3, chantiers CHA-3,
-- inventaires INV-3, employés EMP-4, clients CLI-4, fournisseurs FRN-4,
-- outils OUT-4, lots de virement VIR-6, notes de frais EXP-6, entreprises
-- ENT-3, et les documents génériques de 20260715000080) : elle n'avait pas
-- reçu le même correctif. Toutes ces séquences partagent le même risque de
-- capacité, à des seuils différents (10^p_largeur - 1 documents cumulés
-- pour le couple entreprise+type ; 999 pour une largeur 3 comme devis/
-- factures/chantiers — atteignable en moins d'un an pour une PME BTP
-- active, cf. le P0 déjà documenté pour formater_numero_document).
--
-- Correctif : la largeur configurée devient un PLANCHER, jamais un
-- plafond — `greatest(p_largeur, length(v_numero::text))` au lieu de
-- `p_largeur` seul. Comportement strictement inchangé pour tout compteur
-- qui tient déjà dans la largeur configurée (le cas normal aujourd'hui) :
-- seul le cas de dépassement, auparavant silencieusement corrompu, change.

create or replace function public.next_reference(
  p_entreprise_id uuid,
  p_type text,
  p_prefix text,
  p_largeur int default 4,
  p_avec_annee boolean default false
)
returns text
language plpgsql
as $$
declare
  v_numero int;
  v_annee text := to_char(now(), 'YYYY');
  v_scope uuid := coalesce(p_entreprise_id, '00000000-0000-0000-0000-000000000000');
begin
  insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
  values (v_scope, p_type, 1)
  on conflict (entreprise_id, type)
  do update set dernier_numero = public.compteurs_reference.dernier_numero + 1
  returning dernier_numero into v_numero;

  if p_avec_annee then
    return p_prefix || '-' || v_annee || '-' ||
      lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0');
  else
    return p_prefix || '-' ||
      lpad(v_numero::text, greatest(p_largeur, length(v_numero::text)), '0');
  end if;
end;
$$;
