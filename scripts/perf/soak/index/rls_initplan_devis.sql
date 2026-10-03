-- ELSATIA SOAK V1 — PROTOTYPE (ROLLBACK) : RLS « ensemble autorisé calculé une fois » sur devis.
-- Avant : a_permission(entreprise_id,'acces_devis') + est_membre_actif(entreprise_id) PAR LIGNE.
-- Après : entreprise_id IN (SELECT …) → InitPlan évalué une fois par requête.
-- Candidats = entreprises où l'utilisateur est membre (le prototype ne couvre pas la branche
-- « accès support » d'a_permission : une vraie migration doit l'inclure, cf. rapport § P2-RLS).
\timing on
\set u '\'{"sub":"facc0000-0000-4000-e000-000000000013","role":"authenticated"}\''
begin;
set local role authenticated;
select set_config('request.jwt.claims', :u, true) is not null;
explain (analyze, costs off, summary on) select id from devis where entreprise_id = 'e0000000-0000-4000-e000-000000000013' order by created_at desc limit 1000;
explain (analyze, costs off, summary on) select id from devis where entreprise_id = 'e0000000-0000-4000-e000-000000000012' limit 50;
reset role;
create function public.soak_entreprises_avec_permission(p text) returns setof uuid language sql stable security definer set search_path = public as $$
  select ue.entreprise_id from public.utilisateurs_entreprises ue
  where ue.utilisateur_id = auth.uid() and ue.statut = 'actif' and public.a_permission(ue.entreprise_id, p) $$;
create function public.soak_entreprises_membre_actif() returns setof uuid language sql stable security definer set search_path = public as $$
  select ue.entreprise_id from public.utilisateurs_entreprises ue
  where ue.utilisateur_id = auth.uid() and ue.statut = 'actif' and public.est_membre_actif(ue.entreprise_id) $$;
grant execute on function public.soak_entreprises_avec_permission(text), public.soak_entreprises_membre_actif() to authenticated;
alter policy "membres devis" on public.devis using (entreprise_id in (select public.soak_entreprises_membre_actif())) with check (entreprise_id in (select public.soak_entreprises_membre_actif()));
alter policy lecture_devis_selon_permission on public.devis using (entreprise_id in (select public.soak_entreprises_avec_permission('acces_devis')));
set local role authenticated;
explain (analyze, costs off, summary on) select id from devis where entreprise_id = 'e0000000-0000-4000-e000-000000000013' order by created_at desc limit 1000;
explain (analyze, costs off, summary on) select id from devis where entreprise_id = 'e0000000-0000-4000-e000-000000000012' limit 50;
select count(*) as lignes_visibles_sans_filtre from devis;
rollback;
