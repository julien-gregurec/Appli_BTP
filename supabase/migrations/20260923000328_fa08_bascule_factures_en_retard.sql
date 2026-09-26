-- FA-08 (recette pilote) : « Statut basculé automatiquement après échéance
-- dépassée » — aucune facture ne passait `en_retard` par le seul passage du
-- temps.
--
-- Reproduit par exécution réelle sur la fixture pilote (PILOTE-BTP-V1) : une
-- facture `envoyee` dont `date_echeance` est dépassée reste `envoyee`
-- indéfiniment. Le seul code qui calcule `en_retard` est
-- recalc_paiements_facture (20260921000302), déclenché par un mouvement de
-- règlement — jamais par le calendrier. Aucune fonction planifiée, aucun
-- pg_cron, aucun job du cron Vercel (/api/cron/abonnements) ne réévaluait le
-- statut. src/lib/relances-moteur.ts le documentait déjà (« une facture
-- réellement en retard peut donc rester affichée "envoyee" en base »).
--
-- Correctif : une fonction idempotente, appelée chaque jour par le cron Vercel
-- déjà en place (même endpoint, même CRON_SECRET — pas de nouveau cron, plan
-- Hobby limité). Règle strictement alignée sur recalc_paiements_facture, pour
-- que les deux chemins ne se contredisent jamais :
--   * seul `envoyee` bascule en `en_retard` : dans recalc, un règlement partiel
--     (`payee_partiel`) l'emporte sur le retard, et les statuts terminaux
--     (`payee`, `annulee`, `avoir_emis`) ou le brouillon ne bougent jamais ;
--   * échéance strictement dépassée (`date_echeance < current_date`), même
--     comparaison que recalc ;
--   * reste à payer > 0 (garde défensive : une facture `envoyee` soldée ne peut
--     pas exister via recalc, mais la règle ne doit jamais marquer en retard une
--     facture payée).
-- Le verrou des factures émises (verrouiller_facture_emise) laisse `statut`
-- libre parmi les états post-brouillon : la bascule ne touche rien d'autre.
--
-- Réservée au service_role (cron) : aucun utilisateur ne peut déclencher une
-- réécriture massive de statuts multi-entreprises.

create or replace function public.marquer_factures_en_retard()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre integer;
begin
  update public.factures
     set statut = 'en_retard',
         updated_at = now()
   where statut = 'envoyee'
     and date_echeance is not null
     and date_echeance < current_date
     and coalesce(montant_paye, 0) < montant_ttc;
  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

comment on function public.marquer_factures_en_retard() is
  'FA-08 : bascule quotidienne envoyee -> en_retard des factures dont l''échéance est dépassée et le reste à payer > 0. Même règle que recalc_paiements_facture. Idempotente. Appelée par /api/cron/abonnements (service_role).';

revoke all on function public.marquer_factures_en_retard() from public, anon, authenticated;
grant execute on function public.marquer_factures_en_retard() to service_role;

notify pgrst, 'reload schema';
