-- Train canonique V9 FINAL : numéro d'origine 20260928000816, renuméroté 20261002001104
-- (après 20261002000813 hotfix, 20261002000901 Legal Consent et 20261002001001-1003 Security / Stripe :
--  postérieure au ledger de la Preview hébergée). Corps inchangé.
--
-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — consommation IA du mois
-- sommée en base.
--
-- Constat : `consommationIAMensuelle` (src/lib/ai/journal.ts) lisait toutes
-- les lignes `journal_ia` du mois en une requête PostgREST, plafonnée à 1 000
-- lignes sans erreur, puis sommait `operations_decomptees` et
-- `cout_estime_ht` côté Next : au-delà de 1 000 opérations dans le mois, le
-- quota et le plafond budgétaire étaient sous-estimés et cessaient de bloquer.
--
-- Correctif : même filtre, même règle (`max(0, operations_decomptees ?? 1)`,
-- `max(0, cout_estime_ht ?? 0)`), somme exacte en base, une seule ligne.
-- SECURITY INVOKER : la policy `journal_ia_select` s'applique telle quelle,
-- l'appelant n'agrège que les lignes qu'il pouvait déjà lire.

create or replace function public.journal_ia_consommation(p_entreprise_id uuid, p_debut timestamptz, p_fin timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'operations', coalesce(sum(greatest(0, coalesce(j.operations_decomptees, 1))), 0),
    'cout_estime_ht', coalesce(sum(greatest(0, coalesce(j.cout_estime_ht, 0))), 0),
    'lignes', count(*)
  )
  from public.journal_ia j
  where j.entreprise_id = p_entreprise_id
    and j.statut = 'succes'
    and j.annule_at is null
    and j.created_at >= p_debut
    and j.created_at < p_fin;
$$;

revoke all on function public.journal_ia_consommation(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.journal_ia_consommation(uuid, timestamptz, timestamptz) to authenticated;
