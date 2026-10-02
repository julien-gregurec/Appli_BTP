-- ELSATIA — harnais d'upgrade Production → V9.x — amorce du jeu HISTORIQUE (ère Production 210).
-- Données 100 % synthétiques (domaines *.invalid, aucun e-mail / SIRET / IBAN réel).
-- Crée, via la RPC d'onboarding réelle de l'ère 210 (creer_entreprise_bootstrap, auth.uid() simulé),
-- les entreprises que les seeds d'époque (5777abb) attendent, plus une petite entreprise.
--   * « Entreprise Test »    : entreprise MOYENNE (seed_entreprise_test_5_ans + tous_onglets + suivi_terrain)
--   * « Petite SARL Histo »  : petite entreprise, offre historique « essentiel » v0 (59 €)
-- Les entreprises A / B multi-rôles viennent de supabase/tests/fixtures/isolation_multitenant.inc @ 5777abb.
begin;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'gerant@entreprise-test.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), now() - interval '5 years', now()),
  ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'gerant@petite-histo.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), now() - interval '2 years', now())
on conflict (id) do nothing;
insert into public.utilisateurs (id, prenom, nom) values
  ('a2100000-0000-0000-0000-000000000001', 'Gérant', 'Entreprise Test'),
  ('a2100000-0000-0000-0000-000000000002', 'Gérante', 'Petite Histo')
on conflict (id) do nothing;

create temp table amorce (cle text primary key, entreprise_id uuid);
do $$
declare v uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000001', true);
  v := public.creer_entreprise_bootstrap('Entreprise Test', '00000000000001', '1 rue de la Recette', '67000', 'Strasbourg');
  insert into amorce values ('moyenne', v);
  perform set_config('request.jwt.claims', '{"sub":"a2100000-0000-0000-0000-000000000002","role":"authenticated"}', true);
  perform set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000002', true);
  v := public.creer_entreprise_bootstrap('Petite SARL Histo', '00000000000002', '2 place du Bord', '68000', 'Colmar');
  insert into amorce values ('petite', v);
  -- Retour au contexte « script opérateur » (auth.uid() nul), comme un seed exécuté en service_role.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end $$;
-- Effectif de l'entreprise moyenne (le seed 5 ans exige des employés actifs) et de la petite.
-- La fiche liée au gérant porte le poste « Gérant » (un trigger recopie le poste de la fiche sur l'appartenance).
insert into public.employes (entreprise_id, reference_interne, prenom, nom, email, poste, type_contrat, date_entree, taux_horaire, cout_horaire, statut, utilisateur_id, poste_id)
select a.entreprise_id, 'HIST-EMP-'||lpad(g::text, 3, '0'),
       (array['Paul','Léa','Hugo','Inès','Marc','Zoé','Luc','Emma'])[1 + (g - 1) % 8], 'Salarié'||g,
       'salarie'||g||'@entreprise-test.invalid', (array['Ouvrier','Chef d''équipe','Conducteur'])[1 + g % 3],
       case when g % 4 = 0 then 'cdd' else 'cdi' end, current_date - (g * 200), 15 + g, 28 + g, 'actif',
       case when g = 1 then 'a2100000-0000-0000-0000-000000000001'::uuid end,
       case when g = 1 then (select id from public.postes where entreprise_id = a.entreprise_id and nom = 'Gérant') end
  from amorce a, generate_series(1, 8) g where a.cle = 'moyenne';
insert into public.employes (entreprise_id, reference_interne, prenom, nom, email, type_contrat, date_entree, taux_horaire, statut, utilisateur_id, poste_id)
select a.entreprise_id, 'HIST-PET-'||g, 'Artisan', 'Petit'||g, 'artisan'||g||'@petite-histo.invalid', 'cdi', current_date - 400, 18, 'actif',
       case when g = 1 then 'a2100000-0000-0000-0000-000000000002'::uuid end,
       case when g = 1 then (select id from public.postes where entreprise_id = a.entreprise_id and nom = 'Gérant') end
  from amorce a, generate_series(1, 2) g where a.cle = 'petite';
commit;
