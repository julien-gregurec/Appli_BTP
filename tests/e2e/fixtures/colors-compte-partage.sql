-- Jeu de recette « compte ELSATIA partagé » d'ELSATIA Colors — pile jetable dédiée.
--
-- Il rejoue, sans aucun compte réel, la topologie visée pour `julien@elsatia.fr` :
-- UN compte Auth commun (Gestion Pro, Tools, Colors lisent le même `auth.users`),
-- membre ordinaire d'une organisation, PAS administrateur plateforme, ouvert à
-- Colors par les deux droits du modèle canonique — l'organisation est autorisée,
-- la personne est habilitée `colors_admin_organisation` — et huit variantes où
-- exactement UN maillon de la chaîne manque.
--
-- Le jumeau `partage-julien@recette.invalid` remplace volontairement l'adresse
-- réelle : ce fichier fait `on conflict do update set encrypted_password`. Joué par
-- erreur contre une vraie base avec l'adresse réelle, il en écraserait le mot de
-- passe. Le TLD `.invalid` (RFC 2606) ne peut correspondre à aucun compte réel.
--
-- Il est REJOUABLE, ne contient AUCUN secret (le mot de passe vient de
-- MDP_RECETTE) et n'insère JAMAIS dans `plateforme_admins` : l'activation d'un
-- administrateur plateforme exige un second administrateur en session AAL2, et
-- la contourner ici fabriquerait un test qui prouve autre chose que le produit.
--
--     docker exec -i -e MDP_RECETTE="…" supabase_db_colors-night \
--       psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < ce-fichier.sql

\set mdp `echo "$MDP_RECETTE"`

begin;

-- 0. Remise à zéro, bornée aux organisations de ce jeu.
delete from public.historique_acces_applications
 where cible_id in (
   'e0000000-0000-4000-8000-0000000000c1','e0000000-0000-4000-8000-0000000000c2','e0000000-0000-4000-8000-0000000000c3');
delete from public.habilitations_applications_utilisateurs
 where entreprise_id in (
   'e0000000-0000-4000-8000-0000000000c1','e0000000-0000-4000-8000-0000000000c2','e0000000-0000-4000-8000-0000000000c3');
delete from public.acces_applications_entreprises
 where entreprise_id in (
   'e0000000-0000-4000-8000-0000000000c1','e0000000-0000-4000-8000-0000000000c2','e0000000-0000-4000-8000-0000000000c3');

-- 1. Trois organisations : en service, suspendue pour impayé, jamais ouverte à Colors.
insert into public.entreprises(id,nom,code_adhesion) values
('e0000000-0000-4000-8000-0000000000c1','Organisation Compte Partagé','CPT00001'),
('e0000000-0000-4000-8000-0000000000c2','Organisation Suspendue','CPT00002'),
('e0000000-0000-4000-8000-0000000000c3','Organisation Sans Colors','CPT00003') on conflict (id) do nothing;

update public.entreprises set abonnement_statut = 'actif', suspension_prevue_at = null
 where id in ('e0000000-0000-4000-8000-0000000000c1','e0000000-0000-4000-8000-0000000000c3');
update public.entreprises set abonnement_statut = 'suspendu'
 where id = 'e0000000-0000-4000-8000-0000000000c2';

insert into public.postes(id,entreprise_id,nom) values
('40000000-0000-4000-8000-0000000000c1','e0000000-0000-4000-8000-0000000000c1','Compte partagé'),
('40000000-0000-4000-8000-0000000000c2','e0000000-0000-4000-8000-0000000000c2','Suspendue'),
('40000000-0000-4000-8000-0000000000c3','e0000000-0000-4000-8000-0000000000c3','Sans Colors') on conflict (id) do nothing;

-- 2. Dix identités Auth. La onzième variante (« e-mail non confirmé ») n'a pas de
--    date de confirmation : GoTrue doit refuser la connexion avant tout le reste.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated','authenticated', v.email,
       crypt(:'mdp', gen_salt('bf')),
       case when v.email like 'partage-non-confirme@%' then null else now() end,
       now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('12000000-0000-4000-8000-000000000001'::uuid,'partage-julien@recette.invalid'),
  ('12000000-0000-4000-8000-000000000002'::uuid,'partage-sans-entreprise-active@recette.invalid'),
  ('12000000-0000-4000-8000-000000000003'::uuid,'partage-profil-sans-appartenance@recette.invalid'),
  ('12000000-0000-4000-8000-000000000004'::uuid,'partage-sans-habilitation@recette.invalid'),
  ('12000000-0000-4000-8000-000000000005'::uuid,'partage-organisation-non-autorisee@recette.invalid'),
  ('12000000-0000-4000-8000-000000000006'::uuid,'partage-organisation-suspendue@recette.invalid'),
  ('12000000-0000-4000-8000-000000000007'::uuid,'partage-non-confirme@recette.invalid'),
  ('12000000-0000-4000-8000-000000000008'::uuid,'partage-habilitation-expiree@recette.invalid'),
  ('12000000-0000-4000-8000-000000000009'::uuid,'partage-revocable@recette.invalid')
) as v(id,email)
on conflict (id) do update set encrypted_password = excluded.encrypted_password,
                               email_confirmed_at = excluded.email_confirmed_at;

-- GoTrue lit ces colonnes en `string` : un NULL donne un HTTP 500 à la connexion.
update auth.users set
  confirmation_token = coalesce(confirmation_token,''),
  recovery_token = coalesce(recovery_token,''),
  email_change_token_new = coalesce(email_change_token_new,''),
  email_change = coalesce(email_change,''),
  email_change_token_current = coalesce(email_change_token_current,''),
  phone_change = coalesce(phone_change,''),
  phone_change_token = coalesce(phone_change_token,''),
  reauthentication_token = coalesce(reauthentication_token,'')
where email like 'partage-%@recette.invalid';

-- 3. Profils. Le n° 2 n'a AUCUNE entreprise active ; le n° 3 en désigne une dont il
--    n'est pas membre. Ce sont les deux façons dont `contexte_application_courant`
--    ne renvoie aucune ligne.
insert into public.utilisateurs(id,prenom,nom,entreprise_active_id) values
('12000000-0000-4000-8000-000000000001','Julien','Modèle','e0000000-0000-4000-8000-0000000000c1'),
('12000000-0000-4000-8000-000000000002','Sans','EntrepriseActive',null),
('12000000-0000-4000-8000-000000000003','Profil','SansAppartenance','e0000000-0000-4000-8000-0000000000c1'),
('12000000-0000-4000-8000-000000000004','Sans','Habilitation','e0000000-0000-4000-8000-0000000000c1'),
('12000000-0000-4000-8000-000000000005','Organisation','NonAutorisee','e0000000-0000-4000-8000-0000000000c3'),
('12000000-0000-4000-8000-000000000006','Organisation','Suspendue','e0000000-0000-4000-8000-0000000000c2'),
('12000000-0000-4000-8000-000000000007','NonConfirme','Email','e0000000-0000-4000-8000-0000000000c1'),
('12000000-0000-4000-8000-000000000008','Habilitation','Expiree','e0000000-0000-4000-8000-0000000000c1'),
('12000000-0000-4000-8000-000000000009','Droit','Revocable','e0000000-0000-4000-8000-0000000000c1')
on conflict (id) do update set prenom=excluded.prenom, nom=excluded.nom, entreprise_active_id=excluded.entreprise_active_id;

-- 4. Appartenances. Ni le n° 2 ni le n° 3 n'en ont.
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('12000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-0000000000c1','40000000-0000-4000-8000-0000000000c1','actif'),
('12000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-0000000000c1','40000000-0000-4000-8000-0000000000c1','actif'),
('12000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-0000000000c3','40000000-0000-4000-8000-0000000000c3','actif'),
('12000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-0000000000c2','40000000-0000-4000-8000-0000000000c2','actif'),
('12000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-0000000000c1','40000000-0000-4000-8000-0000000000c1','actif'),
('12000000-0000-4000-8000-000000000008','e0000000-0000-4000-8000-0000000000c1','40000000-0000-4000-8000-0000000000c1','actif'),
('12000000-0000-4000-8000-000000000009','e0000000-0000-4000-8000-0000000000c1','40000000-0000-4000-8000-0000000000c1','actif')
on conflict do nothing;

-- 5. Droit d'usage de l'ORGANISATION. L'organisation C3 n'en a aucun.
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('e0000000-0000-4000-8000-0000000000c1','colors',true,'recette'),
('e0000000-0000-4000-8000-0000000000c2','colors',true,'recette');

-- 6. Habilitations INDIVIDUELLES. Le n° 4 n'en a pas ; le n° 8 a une fenêtre échue.
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,valide_jusqu_au) values
('e0000000-0000-4000-8000-0000000000c1','12000000-0000-4000-8000-000000000001','colors','colors_admin_organisation',null),
('e0000000-0000-4000-8000-0000000000c3','12000000-0000-4000-8000-000000000005','colors','colors_admin_organisation',null),
('e0000000-0000-4000-8000-0000000000c2','12000000-0000-4000-8000-000000000006','colors','colors_admin_organisation',null),
('e0000000-0000-4000-8000-0000000000c1','12000000-0000-4000-8000-000000000007','colors','colors_admin_organisation',null),
('e0000000-0000-4000-8000-0000000000c1','12000000-0000-4000-8000-000000000009','colors','colors_gestionnaire_stock',null);
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code,valide_du,valide_jusqu_au) values
('e0000000-0000-4000-8000-0000000000c1','12000000-0000-4000-8000-000000000008','colors','colors_gestionnaire_stock',
 now() - interval '30 days', now() - interval '1 day');

commit;
