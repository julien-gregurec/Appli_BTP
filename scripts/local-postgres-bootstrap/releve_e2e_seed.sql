-- Jeu de données de la recette Playwright Relevé & Métré (tests/e2e/tools-releve-lot2.spec.ts).
-- Appelé par releve_e2e_stack.sh avec -v ua=<uuid compte A> -v ub=<uuid compte B> -v ea=<uuid entreprise pilote>.
-- Tenant A = entreprise pilote (seed_entreprise_pilote_btp.sql) ; tenant B = entreprise créée ici.
-- Les deux comptes reçoivent : accès Tools de l'entreprise, rôle tools_releve_admin, entitlement
-- INTERNE `releve-metre` (jamais une source d'achat : le trigger de non-activation commerciale le refuserait).
set elsatia.capacite_personnes_bypass = 'on';
insert into public.entreprises (id, nom, code_adhesion) values ('e2e00000-0000-0000-0000-00000000000b', 'Entreprise Relevé B', 'E2ERB001') on conflict do nothing;
insert into public.postes (id, entreprise_id, nom) values
  ('e2e10000-0000-0000-0000-00000000000a', :'ea', 'Métreur e2e'),
  ('e2e10000-0000-0000-0000-00000000000b', 'e2e00000-0000-0000-0000-00000000000b', 'Dirigeant B') on conflict do nothing;
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  (:'ua', :'ea', 'e2e10000-0000-0000-0000-00000000000a', 'actif'),
  (:'ub', 'e2e00000-0000-0000-0000-00000000000b', 'e2e10000-0000-0000-0000-00000000000b', 'actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id, application_code, autorise, source) values
  (:'ea', 'tools', true, 'e2e'), ('e2e00000-0000-0000-0000-00000000000b', 'tools', true, 'e2e')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs(entreprise_id, utilisateur_id, application_code, role_code, autorise) values
  (:'ea', :'ua', 'tools', 'tools_releve_admin', true),
  ('e2e00000-0000-0000-0000-00000000000b', :'ub', 'tools', 'tools_releve_admin', true)
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code, autorise = true;
insert into public.entitlements_utilisateurs_elsatia(utilisateur_id, application_code, niveau, capabilities, source) values
  (:'ua', 'tools', 'pro', array['releve-metre'], 'internal'),
  (:'ub', 'tools', 'pro', array['releve-metre'], 'internal');
