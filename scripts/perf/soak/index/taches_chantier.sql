-- ELSATIA SOAK V1 — preuve index candidat : taches(chantier_id). Tout est ROLLBACK.
-- Requête : src/app/(app)/chantiers/[id]/page.tsx:77 (taches d'un chantier, ordre created_at).
\timing on
select set_config('x.ch', (select t.chantier_id::text from taches t join chantiers c on c.id = t.chantier_id
  where c.entreprise_id = 'e0000000-0000-4000-e000-000000000014' limit 1), false) is not null as cible;
select count(*) as taches_total from taches;
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"facc0000-0000-4000-e000-000000000014","role":"authenticated"}', true) is not null;
explain (analyze, buffers, costs off, summary on) select id, libelle, description, statut, echeance, devis_id from taches where chantier_id = current_setting('x.ch')::uuid order by created_at;
reset role;
-- Index proposé + coût de création et taille.
create index taches_chantier_created_idx on public.taches (chantier_id, created_at);
select pg_size_pretty(pg_relation_size('taches_chantier_created_idx')) as taille_index, pg_size_pretty(pg_relation_size('taches')) as taille_table;
analyze public.taches;
set local role authenticated;
explain (analyze, buffers, costs off, summary on) select id, libelle, description, statut, echeance, devis_id from taches where chantier_id = current_setting('x.ch')::uuid order by created_at;
reset role;
-- Coût en écriture : 5 000 insertions avec l'index.
explain (analyze, costs off, summary on) insert into taches (chantier_id, libelle) select current_setting('x.ch')::uuid, 'idx-' || g from generate_series(1, 5000) g;
rollback;
begin;
-- Coût en écriture : 5 000 insertions SANS l'index (référence).
explain (analyze, costs off, summary on) insert into taches (chantier_id, libelle) select current_setting('x.ch')::uuid, 'idx-' || g from generate_series(1, 5000) g;
rollback;
