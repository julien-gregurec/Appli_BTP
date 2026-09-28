-- ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1 — décor dédié.
--
-- Deux entreprises. Les postes sont créés par les VRAIS modèles de rôles
-- prédéfinis (appliquer_modele_role_predefini_interne, ceux que reçoit toute
-- entreprise créée par creer_entreprise_bootstrap), pas par une liste de
-- permissions écrite à la main : le test qualifie donc le RBAC tel qu'il est
-- livré aux clients.
--
--   Entreprise A : gérant, RH, comptable, administration, chef de chantier,
--                  chef d'équipe, ouvrier  + une salariée « Victime » sans
--                  compte, porteuse de toutes les données sensibles.
--   Entreprise B : gérant, ouvrier + un salarié porteur de données B.

set local elsatia.capacite_personnes_bypass = 'on';

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, crypt('test', gen_salt('bf')), now(), now(), now()
from (values
  ('ed100000-0000-0000-0000-000000000001'::uuid, 'gerant-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000002'::uuid, 'rh-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000003'::uuid, 'comptable-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000004'::uuid, 'administration-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000005'::uuid, 'chef-chantier-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000006'::uuid, 'chef-equipe-a@edp.invalid'),
  ('ed100000-0000-0000-0000-000000000007'::uuid, 'ouvrier-a@edp.invalid'),
  ('ed200000-0000-0000-0000-000000000001'::uuid, 'gerant-b@edp.invalid'),
  ('ed200000-0000-0000-0000-000000000007'::uuid, 'ouvrier-b@edp.invalid')
) as u(id, email)
on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom)
select id, 'EDP', email from auth.users where email like '%@edp.invalid'
on conflict (id) do nothing;

insert into public.entreprises (id, nom, code_adhesion) values
  ('eda00000-0000-0000-0000-000000000001', 'EDP Entreprise A', 'EDPA0001'),
  ('edb00000-0000-0000-0000-000000000001', 'EDP Entreprise B', 'EDPB0001')
on conflict (id) do nothing;

-- Postes canoniques (le modèle écrit aussi permissions_poste).
create temporary table edp_postes on commit drop as
select e.entreprise_id, m.cle,
       public.appliquer_modele_role_predefini_interne(e.entreprise_id, m.cle, true) as poste_id
from (values ('eda00000-0000-0000-0000-000000000001'::uuid), ('edb00000-0000-0000-0000-000000000001'::uuid)) as e(entreprise_id)
cross join public.modeles_roles_predefinis m;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select u.uid, u.ent, p.poste_id, 'actif'
from (values
  ('ed100000-0000-0000-0000-000000000001'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'gerant'),
  ('ed100000-0000-0000-0000-000000000002'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'rh'),
  ('ed100000-0000-0000-0000-000000000003'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'comptable'),
  ('ed100000-0000-0000-0000-000000000004'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'administration'),
  ('ed100000-0000-0000-0000-000000000005'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'chef_chantier'),
  ('ed100000-0000-0000-0000-000000000006'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'chef_equipe'),
  ('ed100000-0000-0000-0000-000000000007'::uuid, 'eda00000-0000-0000-0000-000000000001'::uuid, 'ouvrier'),
  ('ed200000-0000-0000-0000-000000000001'::uuid, 'edb00000-0000-0000-0000-000000000001'::uuid, 'gerant'),
  ('ed200000-0000-0000-0000-000000000007'::uuid, 'edb00000-0000-0000-0000-000000000001'::uuid, 'ouvrier')
) as u(uid, ent, cle)
join edp_postes p on p.entreprise_id = u.ent and p.cle = u.cle
on conflict do nothing;

-- Fiches salariés : une par compte + la « Victime » (A) et un salarié B.
insert into public.employes (id, entreprise_id, utilisateur_id, prenom, nom, poste, email, telephone, notes,
                             numero_inscription, identifiant_interne, carte_btp_numero, carte_btp_expiration,
                             carte_btp_storage_path, signature_storage_path, code_stock_hash, code_stock_active)
values
  ('ed1e0000-0000-0000-0000-000000000001', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000001', 'Gérant', 'A', 'Gérant', 'gerant-a@edp.invalid', null, null, 'EDP-A-G', 'EDPAG', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000002', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000002', 'RH', 'A', 'RH', 'rh-a@edp.invalid', null, null, 'EDP-A-RH', 'EDPARH', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000003', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000003', 'Comptable', 'A', 'Comptable', 'comptable-a@edp.invalid', null, null, 'EDP-A-CPT', 'EDPACPT', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000004', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000004', 'Administration', 'A', 'Assistante', 'administration-a@edp.invalid', null, null, 'EDP-A-ADM', 'EDPAADM', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000005', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000005', 'Chef', 'Chantier A', 'Chef de chantier', 'chef-chantier-a@edp.invalid', null, null, 'EDP-A-CC', 'EDPACC', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000006', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000006', 'Chef', 'Equipe A', 'Chef d''équipe', 'chef-equipe-a@edp.invalid', null, null, 'EDP-A-CE', 'EDPACE', null, null, null, null, null, false),
  ('ed1e0000-0000-0000-0000-000000000007', 'eda00000-0000-0000-0000-000000000001', 'ed100000-0000-0000-0000-000000000007', 'Ouvrier', 'A', 'Maçon', 'ouvrier-a@edp.invalid', '0600000007', 'NOTE_SUR_OUVRIER', 'EDP-A-OUV', 'EDPAOUV', null, null, null, 'eda00000-0000-0000-0000-000000000001/ed1e0000-0000-0000-0000-000000000007/signature.png', null, false),
  ('ed1e0000-0000-0000-0000-0000000000f1', 'eda00000-0000-0000-0000-000000000001', null, 'Victime', 'A', 'Carreleuse',
     'victime.privee@edp.invalid', '0611223344', 'NOTE_RH_SECRETE_A',
     'EDP-A-VICTIME', 'EDPAVIC', 'CBTP-VICTIME-123', '2030-01-01',
     'eda00000-0000-0000-0000-000000000001/ed1e0000-0000-0000-0000-0000000000f1/carte-btp.pdf',
     'eda00000-0000-0000-0000-000000000001/ed1e0000-0000-0000-0000-0000000000f1/signature.png',
     crypt('1234', gen_salt('bf', 4)), true),
  ('ed2e0000-0000-0000-0000-000000000001', 'edb00000-0000-0000-0000-000000000001', 'ed200000-0000-0000-0000-000000000001', 'Gérant', 'B', 'Gérant', 'gerant-b@edp.invalid', null, null, 'EDP-B-G', 'EDPBG', null, null, null, null, null, false),
  ('ed2e0000-0000-0000-0000-000000000007', 'edb00000-0000-0000-0000-000000000001', 'ed200000-0000-0000-0000-000000000007', 'Ouvrier', 'B', 'Maçon', 'ouvrier-b@edp.invalid', null, null, 'EDP-B-OUV', 'EDPBOUV', null, null, null, null, null, false),
  ('ed2e0000-0000-0000-0000-0000000000f1', 'edb00000-0000-0000-0000-000000000001', null, 'Salarié', 'B', 'Peintre',
     'salarie.prive@edp-b.invalid', '0799887766', 'NOTE_RH_SECRETE_B',
     'EDP-B-SAL', 'EDPBSAL', 'CBTP-B-999', '2031-01-01', null, null, null, false)
on conflict (id) do nothing;

-- Poste applicatif de chaque fiche liée à un compte (comme activer_compte_employe).
update public.employes e set poste_id = ue.poste_id
  from public.utilisateurs_entreprises ue
 where ue.utilisateur_id = e.utilisateur_id and ue.entreprise_id = e.entreprise_id
   and e.id::text like 'ed_e0000-%';
-- Les salariés sans compte ont aussi un poste d'accès préparé (champ requis du formulaire).
update public.employes e set poste_id = p.poste_id
  from edp_postes p
 where p.entreprise_id = e.entreprise_id and p.cle = 'ouvrier'
   and e.id in ('ed1e0000-0000-0000-0000-0000000000f1', 'ed2e0000-0000-0000-0000-0000000000f1');

-- Données déjà isolées dans des tables dédiées (non-régression) :
-- coût interne, taux facturé, profil de paie (NIR), RIB, habilitation.
insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire) values
  ('ed1e0000-0000-0000-0000-0000000000f1', 'eda00000-0000-0000-0000-000000000001', 31.50)
on conflict (employe_id) do update set cout_horaire = excluded.cout_horaire;
insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire) values
  ('ed1e0000-0000-0000-0000-0000000000f1', 'eda00000-0000-0000-0000-000000000001', 52.00)
on conflict (employe_id) do update set taux_horaire = excluded.taux_horaire;
insert into public.profils_paie_employes (employe_id, entreprise_id, numero_securite_sociale, adresse, remarques_confidentielles) values
  ('ed1e0000-0000-0000-0000-0000000000f1', 'eda00000-0000-0000-0000-000000000001', 'NIR_SECRET_VICTIME', '1 rue privée', 'REMARQUE_PAIE_SECRETE')
on conflict (employe_id) do nothing;
insert into public.coordonnees_bancaires (entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers) values
  ('eda00000-0000-0000-0000-000000000001', 'employe', 'ed1e0000-0000-0000-0000-0000000000f1', 'Victime A',
   repeat('x', 48), repeat('a', 64), '1234');
insert into public.habilitations_employe (id, entreprise_id, employe_id, type, libelle, date_expiration) values
  ('ed1f0000-0000-0000-0000-000000000001', 'eda00000-0000-0000-0000-000000000001', 'ed1e0000-0000-0000-0000-0000000000f1', 'caces', 'CACES R489', '2030-06-01')
on conflict (id) do nothing;

-- Sonde : exécute une requête et renvoie sa première valeur en texte, ou
-- « ERR:<sqlstate> » si elle échoue. Permet d'écrire chaque assertion sous la
-- forme `is(edp_val(...), attendu)` sans qu'une erreur (colonne interdite,
-- relation absente sur V6) n'interrompe tout le fichier : le test reste
-- exécutable, et donc « rouge », sur la base V6 non corrigée.
create or replace function public.edp_val(p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return v;
exception when others then
  return 'ERR:' || sqlstate;
end $$;
grant execute on function public.edp_val(text) to authenticated, anon;

create or replace function public.edp_exec(p_sql text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return 'ERR:' || sqlstate;
end $$;
grant execute on function public.edp_exec(text) to authenticated, anon;

create or replace function public.edp_as(p_uid uuid) returns void
language sql as $$
  select set_config('request.jwt.claim.sub', p_uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
$$;
grant execute on function public.edp_as(uuid) to authenticated, anon;
