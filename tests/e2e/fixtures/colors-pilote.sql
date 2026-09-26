-- Jeu de recette d'ELSATIA Colors — pile jetable dédiée.
--
-- Ce fichier est REJOUABLE : il efface d'abord ce qu'il a créé, puis le recrée.
-- Sans cette remise à zéro, une passe de recette héritait de l'état laissé par
-- la précédente — une finition déjà déclarée, un seau déjà déplacé — et des
-- assertions portant sur l'état initial échouaient sans qu'aucun défaut produit
-- ne soit en cause. Un test qui dépend de l'ordre des passes ne mesure rien.
--
-- Il ne contient AUCUN secret : le mot de passe des comptes vient de la variable
-- d'environnement MDP_RECETTE et n'est jamais écrit ici.
--
-- Toutes les adresses sont en `@recette.invalid`. Le TLD `.invalid` est réservé
-- par la RFC 2606 et ne peut pas être enregistré : aucun de ces comptes ne peut
-- correspondre à une adresse réelle ni recevoir de courriel par accident.
--
--     docker exec -i -e MDP_RECETTE="…" supabase_db_colors-pilot-e2e \
--       psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < ce-fichier.sql

\set mdp `echo "$MDP_RECETTE"`

-- Tout ou rien : une remise a zero interrompue laisserait un jeu incoherent,
-- et la passe suivante mesurerait autre chose que ce qu'elle croit.
begin;

-- ---------------------------------------------------------------------------
-- 0. Remise à zéro, dans l'ordre des dépendances.
--    Bornée aux deux organisations de recette : rien d'autre n'est touché.
-- ---------------------------------------------------------------------------
delete from public.colors_mouvements
 where entreprise_id in ('e0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000b');
delete from public.colors_analyses_ocr
 where entreprise_id in ('e0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000b');
delete from public.colors_seaux
 where entreprise_id in ('e0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000b');
delete from public.colors_emplacements
 where entreprise_id in ('e0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000b');
delete from public.colors_parametres
 where entreprise_id in ('e0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000b');
-- Les objets de stockage ne sont PAS supprimes ici : `storage.protect_delete`
-- refuse toute suppression directe (« Use the Storage API instead »), et c'est
-- une bonne chose — elle protege de la perte d'objets orphelins. Ils sont
-- reinseres avec `on conflict do nothing`, ce qui suffit a la rejouabilite.

-- ---------------------------------------------------------------------------
-- 1. Deux organisations. La seconde n'existe que pour prouver le cloisonnement.
-- ---------------------------------------------------------------------------
insert into public.entreprises(id,nom,code_adhesion) values
('e0000000-0000-4000-8000-00000000000a','Peintures Recette A','RECA0001'),
('e0000000-0000-4000-8000-00000000000b','Peintures Recette B','RECB0001') on conflict (id) do nothing;

insert into public.postes(id,entreprise_id,nom) values
('40000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000a','Recette A'),
('40000000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-00000000000b','Recette B') on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Sept identités, une par situation à éprouver.
-- ---------------------------------------------------------------------------
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data)
select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated','authenticated', v.email,
       crypt(:'mdp', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
from (values
  ('11000000-0000-4000-8000-000000000001'::uuid,'colors-admin@recette.invalid'),
  ('11000000-0000-4000-8000-000000000002'::uuid,'colors-gestionnaire@recette.invalid'),
  ('11000000-0000-4000-8000-000000000003'::uuid,'colors-operateur@recette.invalid'),
  ('11000000-0000-4000-8000-000000000004'::uuid,'colors-consultation@recette.invalid'),
  ('11000000-0000-4000-8000-000000000005'::uuid,'colors-sans-droit@recette.invalid'),
  ('11000000-0000-4000-8000-000000000006'::uuid,'colors-autre-entreprise@recette.invalid'),
  ('11000000-0000-4000-8000-000000000007'::uuid,'colors-deux-entreprises@recette.invalid')
) as v(id,email)
on conflict (id) do update set encrypted_password = excluded.encrypted_password;

-- GoTrue lit ces colonnes en `string` et non en `*string` : un NULL y produit
-- « converting NULL to string is unsupported » et un HTTP 500 à la connexion,
-- sans le moindre rapport avec le mot de passe saisi.
update auth.users set
  confirmation_token = coalesce(confirmation_token,''),
  recovery_token = coalesce(recovery_token,''),
  email_change_token_new = coalesce(email_change_token_new,''),
  email_change = coalesce(email_change,''),
  email_change_token_current = coalesce(email_change_token_current,''),
  phone_change = coalesce(phone_change,''),
  phone_change_token = coalesce(phone_change_token,''),
  reauthentication_token = coalesce(reauthentication_token,'')
where email like '%@recette.invalid';

-- `public.utilisateurs` est déjà créé par un déclencheur du socle à l'insertion
-- dans auth.users : on complète la ligne au lieu de la recréer.
-- `entreprise_active_id` est ce que lit `contexte_application_courant` : c'est
-- lui, et non la seule appartenance, qui décide de l'organisation vue.
insert into public.utilisateurs(id,prenom,nom,entreprise_active_id) values
('11000000-0000-4000-8000-000000000001','Ada','Administratrice','e0000000-0000-4000-8000-00000000000a'),
('11000000-0000-4000-8000-000000000002','Gaspard','Gestionnaire','e0000000-0000-4000-8000-00000000000a'),
('11000000-0000-4000-8000-000000000003','Olga','Operatrice','e0000000-0000-4000-8000-00000000000a'),
('11000000-0000-4000-8000-000000000004','Camille','Consultation','e0000000-0000-4000-8000-00000000000a'),
('11000000-0000-4000-8000-000000000005','Sacha','SansDroit','e0000000-0000-4000-8000-00000000000a'),
('11000000-0000-4000-8000-000000000006','Bruno','AutreEntreprise','e0000000-0000-4000-8000-00000000000b'),
('11000000-0000-4000-8000-000000000007','Diane','DeuxEntreprises','e0000000-0000-4000-8000-00000000000a')
on conflict (id) do update set prenom=excluded.prenom, nom=excluded.nom, entreprise_active_id=excluded.entreprise_active_id;

insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('11000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000002','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000003','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000004','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000005','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000006','e0000000-0000-4000-8000-00000000000b','40000000-0000-4000-8000-00000000000b','actif'),
-- Diane appartient aux deux : c'est elle qui exerce le changement d'entreprise.
('11000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-00000000000a','40000000-0000-4000-8000-00000000000a','actif'),
('11000000-0000-4000-8000-000000000007','e0000000-0000-4000-8000-00000000000b','40000000-0000-4000-8000-00000000000b','actif')
on conflict do nothing;

insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('e0000000-0000-4000-8000-00000000000a','colors',true,'recette'),
('e0000000-0000-4000-8000-00000000000b','colors',true,'recette') on conflict do nothing;

-- Sacha appartient à l'organisation, et l'organisation a le droit d'usage : il
-- n'a simplement AUCUNE habilitation individuelle. C'est le second verrou.
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('e0000000-0000-4000-8000-00000000000a','11000000-0000-4000-8000-000000000001','colors','colors_admin_organisation'),
('e0000000-0000-4000-8000-00000000000a','11000000-0000-4000-8000-000000000002','colors','colors_gestionnaire_stock'),
('e0000000-0000-4000-8000-00000000000a','11000000-0000-4000-8000-000000000003','colors','colors_utilisateur_depot'),
('e0000000-0000-4000-8000-00000000000a','11000000-0000-4000-8000-000000000004','colors','colors_consultation'),
('e0000000-0000-4000-8000-00000000000b','11000000-0000-4000-8000-000000000006','colors','colors_admin_organisation'),
('e0000000-0000-4000-8000-00000000000a','11000000-0000-4000-8000-000000000007','colors','colors_gestionnaire_stock'),
('e0000000-0000-4000-8000-00000000000b','11000000-0000-4000-8000-000000000007','colors','colors_gestionnaire_stock')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Données métier. A est en service (4 étapes sur 4), B ne l'est pas :
--    les deux états du bandeau de démarrage sont ainsi éprouvables.
-- ---------------------------------------------------------------------------
insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('d0000000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000a','Dépôt Nord','depot','11000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-00000000000c','e0000000-0000-4000-8000-00000000000a','Camion 1','vehicule','11000000-0000-4000-8000-000000000001'),
('d0000000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-00000000000b','Dépôt Sud','depot','11000000-0000-4000-8000-000000000006');

insert into public.colors_parametres(entreprise_id,seuil_stock_faible_pourcent) values
('e0000000-0000-4000-8000-00000000000a',20);

insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,teinte_nom,couleur_hex,mode_quantite,unite,quantite_nominale,quantite_restante,etat,created_by) values
('5ea00000-0000-4000-8000-00000000000a','e0000000-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-00000000000a','Peintures Recette','Acrylique mate','Blanc atelier','#F2EFEA','volume','l',10,10,'ferme','11000000-0000-4000-8000-000000000001'),
('5ea00000-0000-4000-8000-00000000000c','e0000000-0000-4000-8000-00000000000a','d0000000-0000-4000-8000-00000000000c','Peintures Recette','Glycéro satinée','Bleu chantier','#2E5B8A','volume','l',5,1,'ouvert','11000000-0000-4000-8000-000000000001'),
-- Ce seau appartient à l'organisation B : aucun compte de A ne doit le voir.
('5ea00000-0000-4000-8000-00000000000b','e0000000-0000-4000-8000-00000000000b','d0000000-0000-4000-8000-00000000000b','Peintures Recette','Produit confidentiel B','Vert secret','#1F7A4C','volume','l',10,10,'ferme','11000000-0000-4000-8000-000000000006');

-- Une photo déjà rattachée : l'objet de stockage doit exister, la RPC le vérifie.
insert into storage.objects(id,bucket_id,name,metadata,owner) values
('a0000000-0000-4000-8000-00000000000a','colors-seaux',
 'e0000000-0000-4000-8000-00000000000a/5ea00000-0000-4000-8000-00000000000a/photo-recette.jpg',
 '{"mimetype":"image/jpeg","size":2048}'::jsonb,'11000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
update public.colors_seaux
   set photo_principale_path='e0000000-0000-4000-8000-00000000000a/5ea00000-0000-4000-8000-00000000000a/photo-recette.jpg'
 where id='5ea00000-0000-4000-8000-00000000000a';

commit;
