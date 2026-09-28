-- DR V2 — Disaster 2 : migration cassée appliquée APRÈS la sauvegarde.
--
-- Fichier de migration FICTIF (jamais dans supabase/migrations/) reproduisant un cas réel :
-- plusieurs blocs `begin; … commit;` dans un même fichier (motif courant du dépôt). Le
-- premier bloc est validé ; le second échoue. Le fichier est donc appliqué À MOITIÉ, et le
-- bloc validé contient trois régressions silencieuses :
--   - une policy RLS supprimée (planning) remplacée par une policy trop large ;
--   - un GRANT SELECT accordé à anon sur une table de données personnelles (clients) ;
--   - un « backfill » qui écrase un état métier (planning → annule) et une colonne ajoutée.
-- Exécuté sans --single-transaction et avec ON_ERROR_STOP (comme un `psql -f`).
begin;
alter table public.clients add column drv2_segment text;
update public.clients set drv2_segment = case when siret is null then 'particulier' else 'pro' end;
drop policy "membres planning" on public.planning_evenements;
create policy "membres planning" on public.planning_evenements for all to authenticated using (true) with check (true);
grant select on public.clients to anon;
update public.planning_evenements set statut = 'annule' where statut in ('planifie', 'confirme');
commit;

begin;
-- Index unique sur une colonne non unique (le backfill a donné la même valeur à plusieurs
-- clients) : ÉCHEC certain, ce bloc est annulé, mais le bloc précédent reste validé.
create unique index clients_drv2_segment_uniq on public.clients (entreprise_id, drv2_segment);
alter table public.clients alter column drv2_segment set not null;
commit;
