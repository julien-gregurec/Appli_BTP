-- ELSATIA — Baseline performance V1 : volume Colors réaliste pour l'organisation A du jeu de
-- recette (tests/e2e/fixtures/colors-pilote.sql) : 12 emplacements, 3 000 seaux, 18 000
-- mouvements (5 par seau + celui que la base pose à la création). Déterministe (setseed), base jetable uniquement, rejouable.
select setseed(0.42);
begin;

insert into public.colors_emplacements(id, entreprise_id, nom, type, created_by)
select ('d0000000-0000-4000-8000-0000000001' || lpad(g::text, 2, '0'))::uuid, 'e0000000-0000-4000-8000-00000000000a',
  case when g <= 4 then 'Dépôt perf ' || g else 'Camion perf ' || g end, case when g <= 4 then 'depot' else 'vehicule' end,
  '11000000-0000-4000-8000-000000000001'
from generate_series(1, 12) g
on conflict (id) do nothing;

insert into public.colors_seaux(entreprise_id, emplacement_id, marque, produit, teinte_nom, teinte_reference, couleur_hex,
  mode_quantite, unite, quantite_nominale, quantite_restante, etat, created_by, created_at)
select 'e0000000-0000-4000-8000-00000000000a',
  ('d0000000-0000-4000-8000-0000000001' || lpad((1 + g % 12)::text, 2, '0'))::uuid,
  (array['Peintures Nord','Couleurs du Rhin','Atelier Teintes','Maison Pigment','Tollens Perf'])[1 + g % 5],
  (array['Acrylique mate','Glycéro satinée','Velours','Sous-couche','Laque brillante','Façade siloxane'])[1 + g % 6],
  'Teinte perf ' || g, 'PERF-' || lpad(g::text, 5, '0'),
  '#' || lpad(to_hex((g * 2654435761::bigint) % 16777216), 6, '0'),
  'volume', 'l', 10, case when g % 4 = 3 then 0 else round((0.5 + random() * 9.5)::numeric, 2) end,
  (array['ferme','ouvert','ouvert','vide'])[1 + g % 4],
  '11000000-0000-4000-8000-000000000001', now() - (g % 700 || ' days')::interval
from generate_series(1, 3000) g
where (select count(*) from public.colors_seaux where entreprise_id = 'e0000000-0000-4000-8000-00000000000a') < 100;

insert into public.colors_mouvements(entreprise_id, seau_id, type, quantite_avant, quantite_apres, unite, auteur_id, motif, created_at)
select s.entreprise_id, s.id, (array['entree','consommation','consommation','ajustement','ajustement'])[k],
  (array[0, 10, 9, 8, 8])[k], (array[10, 9, 8, 8, 8])[k], 'l', '11000000-0000-4000-8000-000000000001', 'Mouvement perf', s.created_at + (k || ' days')::interval
from public.colors_seaux s cross join generate_series(1, 5) k
where s.entreprise_id = 'e0000000-0000-4000-8000-00000000000a' and s.teinte_reference like 'PERF-%'
  and not exists (select 1 from public.colors_mouvements m where m.motif = 'Mouvement perf');

commit;
analyze;
select (select count(*) from public.colors_seaux where entreprise_id = 'e0000000-0000-4000-8000-00000000000a') seaux,
       (select count(*) from public.colors_mouvements where entreprise_id = 'e0000000-0000-4000-8000-00000000000a') mouvements;
