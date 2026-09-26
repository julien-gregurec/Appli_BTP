-- Décor de recette ELSATIA Réserves V3, strictement local.
--
-- Prolonge `prepare-local-recipe.sql` (représentation Auth attendue par GoTrue) avec ce
-- que le parcours V3 exige : une organisation hôte équipée de Réserves, un chantier, un
-- plan PDF paginé, et une entreprise extérieure DISTINCTE qui n'a encore aucun accès —
-- c'est elle qui rejoindra par le lien, et c'est tout l'intérêt du scénario.
--
-- Ce script n'invente aucun accès : l'entreprise B reste sans droit Réserves jusqu'à ce
-- que le parcours la fasse accepter l'invitation.

-- ── Organisation extérieure « Étanchéité B » ────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000','f0000000-0000-0000-0000-0000000000a1',
  'authenticated','authenticated','gerant-b@invalid.local',
  crypt('test', gen_salt('bf')), now(), now(), now()
) on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom)
values ('f0000000-0000-0000-0000-0000000000a1','Gérant','Étanchéité')
on conflict (id) do nothing;

insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion)
values ('f0000000-0000-0000-0000-000000000001','RECETTE_B_Etancheite','ETANCHEITE B SARL',
        '55555555500055','Colmar','RECB0001')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom)
values ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Gérant')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
values ('f0000000-0000-0000-0000-0000000000a1','f0000000-0000-0000-0000-000000000001',
        'f1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'f0000000-0000-0000-0000-000000000001'
where id = 'f0000000-0000-0000-0000-0000000000a1';

-- ── L'organisation hôte dispose de Réserves ─────────────────────────────────
insert into public.acces_applications_entreprises (
  entreprise_id, application_code, autorise, source
) values ('a0000000-0000-0000-0000-000000000001','reserves', true, 'recette_e2e')
on conflict (entreprise_id, application_code) do update set autorise = true;

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable')
on conflict (entreprise_id, utilisateur_id, application_code) do update set role_code = excluded.role_code;

-- ── Chantier, plan PDF paginé, entreprise nommée ────────────────────────────
insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville, created_by)
values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'RECETTE_A_Groupe scolaire','GS-2026','Colmar','10000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- `nb_pages` est renseigné pour que le sélecteur de page existe dès le premier rendu,
-- sans dépendre du document réellement déposé dans le bucket.
insert into public.reserves_plans (
  id, entreprise_id, chantier_id, nom, niveau, mime_type, nb_pages, ordre, created_by
) values (
  'e3000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001','Plan de masse','R+0','application/pdf', 6, 0,
  '10000000-0000-0000-0000-000000000001'
) on conflict (id) do nothing;

insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, corps_etat, raison_sociale, siret,
  contact_nom, email_contact, created_by
) values (
  'e2000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001','Étanchéité B','Étanchéité',
  'ETANCHEITE B SARL','55555555500055','Bernard É.','gerant-b@invalid.local',
  '10000000-0000-0000-0000-000000000001'
) on conflict (id) do nothing;
