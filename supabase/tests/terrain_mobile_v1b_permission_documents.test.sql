-- TERRAIN-MOBILE-V1B : ajouter_documents_chantier débloque photos/documents/
-- comptes-rendus pour un profil terrain sans gerer_chantiers, sans élargir le
-- périmètre au-delà de ce qui est nécessaire, et corrige ajouter_audit_note_frais
-- (digest() hors search_path).
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

\ir fixtures/isolation_multitenant.inc

-- Ouvrier A obtient le nouveau droit terrain (poste réel : voir_chantiers_assignes,
-- saisir_ses_notes_frais, acces_pointage, saisir_son_pointage — jamais gerer_chantiers).
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'ajouter_documents_chantier', true)
on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

-- Chef équipe A obtient également le droit (comptes-rendus terrain).
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
values ('a0000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'ajouter_documents_chantier', true)
on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

-- ===== Documents / photos =====

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);

select lives_ok(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TEST_V1B_photo_ouvrier.jpg', 'photo_pendant', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_V1B_photo_ouvrier.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  'ouvrier A (ajouter_documents_chantier, sans gerer_chantiers) peut ajouter une photo sur son chantier assigné'
);

-- Une policy RESTRICTIVE (USING) filtre la ligne avant l'UPDATE : aucune erreur
-- levée, mais aucune ligne modifiée (même sémantique que la suppression testée
-- plus bas).
select lives_ok(
  $$update public.chantiers set nom = 'TEST_V1B_pirate' where id = 'a4000000-0000-0000-0000-000000000001'$$,
  'la tentative de modification du chantier ne lève pas d''erreur...'
);
reset role;
select isnt(
  (select nom from public.chantiers where id = 'a4000000-0000-0000-0000-000000000001'),
  'TEST_V1B_pirate',
  '...mais ne modifie rien : gerer_chantiers reste requis pour éditer le chantier (vérifié en superuser)'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select lives_ok(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TEST_V1B_photo_chef.jpg', 'photo_pendant', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_V1B_photo_chef.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  'chef équipe A (ajouter_documents_chantier) peut aussi ajouter une photo'
);

-- Ouvrier B n'a pas reçu le nouveau droit : reste bloqué comme avant.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-b@invalid.local', true);
select throws_like(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_V1B_sans_droit.jpg', 'photo_pendant', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/TEST_V1B_sans_droit.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  '%row-level security%',
  'ouvrier B sans ajouter_documents_chantier ni gerer_chantiers reste refusé (non-régression)'
);

-- Cross-tenant : ouvrier A (droit accordé côté A) ne peut pas écrire chez B.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$insert into public.documents_chantier (entreprise_id, chantier_id, nom, categorie, storage_path, mime_type, taille_octets, audience)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_V1B_cross_tenant.jpg', 'photo_pendant', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/TEST_V1B_cross_tenant.jpg', 'image/jpeg', 100, 'tous_affectes')$$,
  '%row-level security%',
  'ouvrier A ne peut pas ajouter de document chez B (isolation cross-tenant)'
);

-- La suppression reste réservée à gerer_chantiers : aucune ligne affectée, pas d'erreur.
select lives_ok(
  $$delete from public.documents_chantier where nom = 'TEST_V1B_photo_ouvrier.jpg'$$,
  'la tentative de suppression par ouvrier A ne lève pas d''erreur...'
);
reset role;
select ok(
  exists(select 1 from public.documents_chantier where nom = 'TEST_V1B_photo_ouvrier.jpg'),
  '...mais ne supprime rien : suppression toujours réservée à gerer_chantiers (vérifié en superuser)'
);

-- Storage : même droit exigé pour l'upload physique dans le bucket chantier-documents.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('chantier-documents', 'a0000000-0000-0000-0000-000000000001/a4000000-0000-0000-0000-000000000001/TEST_V1B_storage.jpg', '10000000-0000-0000-0000-000000000002')$$,
  'ouvrier A peut uploader physiquement dans le bucket chantier-documents de son entreprise'
);
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('chantier-documents', 'b0000000-0000-0000-0000-000000000001/b4000000-0000-0000-0000-000000000001/TEST_V1B_storage_cross.jpg', '10000000-0000-0000-0000-000000000002')$$,
  '%row-level security%',
  'ouvrier A ne peut pas uploader dans le dossier storage de B'
);

-- Autre bucket géré par la même policy générique : la branche factures-fournisseurs
-- (gerer_achats) n'a pas été modifiée par cet ajustement.
select throws_like(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('factures-fournisseurs', 'a0000000-0000-0000-0000-000000000001/TEST_V1B_hors_perimetre.pdf', '10000000-0000-0000-0000-000000000002')$$,
  '%row-level security%',
  'ajouter_documents_chantier ne donne aucun accès au bucket factures-fournisseurs (gerer_achats requis, inchangé)'
);

-- ===== Comptes-rendus =====

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$insert into public.comptes_rendus_chantier (entreprise_id, chantier_id, titre, contenu, auteur_id)
    values ('a0000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TEST_V1B compte-rendu', 'Contenu de test V1B', '10000000-0000-0000-0000-000000000003')$$,
  'chef équipe A (ajouter_documents_chantier) peut créer un compte-rendu'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select throws_like(
  $$insert into public.comptes_rendus_chantier (entreprise_id, chantier_id, titre, contenu, auteur_id)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_V1B sans droit', 'Contenu', '20000000-0000-0000-0000-000000000002')$$,
  '%row-level security%',
  'ouvrier B sans le droit reste refusé pour la création de compte-rendu (la lecture seule reste ouverte à tous les membres actifs)'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_like(
  $$insert into public.comptes_rendus_chantier (entreprise_id, chantier_id, titre, contenu, auteur_id)
    values ('b0000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'TEST_V1B cross-tenant', 'Contenu', '10000000-0000-0000-0000-000000000002')$$,
  '%row-level security%',
  'ouvrier A ne peut pas créer de compte-rendu chez B (isolation cross-tenant)'
);

select ok(
  (select est_membre_actif('a0000000-0000-0000-0000-000000000001'))
    and (select count(*) from public.comptes_rendus_chantier where chantier_id = 'a4000000-0000-0000-0000-000000000001') >= 1,
  'la lecture des comptes-rendus reste ouverte à tout membre actif (non-régression)'
);

reset role;

-- ===== Notes de frais : digest() / search_path =====

select ok(
  (select prosrc ilike '%extensions.digest(%' from pg_proc where proname = 'ajouter_audit_note_frais'),
  'ajouter_audit_note_frais qualifie explicitement extensions.digest (correction du search_path)'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

select lives_ok(
  $$select public.ajouter_audit_note_frais('a0000000-0000-0000-0000-000000000001', 'test_v1b', 'note_frais', gen_random_uuid())$$,
  'ajouter_audit_note_frais fonctionne de nouveau (digest() résolu via le schéma extensions)'
);

-- La lecture du journal d'audit exige consulter_audit_notes_frais, distinct de
-- saisir_ses_notes_frais : vérifiée en superuser, pas avec la session ouvrier.
reset role;
select isnt(
  (select empreinte_evenement from public.journal_audit_notes_frais where entreprise_id = 'a0000000-0000-0000-0000-000000000001' and action = 'test_v1b' order by date_serveur desc limit 1),
  null,
  'un hash (empreinte_evenement) est bien calculé et enregistré (vérifié en superuser)'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);

-- Création complète d'une note de frais par son propriétaire.
select lives_ok(
  $$insert into public.notes_frais (entreprise_id, employe_id, cree_par_utilisateur_id, reference, date_frais, categorie, montant_ttc, statut)
    values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'TEST_V1B_NDF', current_date, 'repas', 12.50, 'brouillon')$$,
  'ouvrier A peut créer sa propre note de frais'
);

-- Impersonation : ouvrier A ne peut pas créer une note au nom de chef équipe A.
select throws_like(
  $$insert into public.notes_frais (entreprise_id, employe_id, cree_par_utilisateur_id, reference, date_frais, categorie, montant_ttc, statut)
    values ('a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', 'TEST_V1B_NDF_IMPERSO', current_date, 'repas', 12.50, 'brouillon')$$,
  '%row-level security%',
  'ouvrier A ne peut pas créer une note de frais au nom d''un autre salarié (impersonation refusée)'
);

-- Cross-tenant : ouvrier A ne peut pas créer une note chez B.
select throws_like(
  $$insert into public.notes_frais (entreprise_id, employe_id, cree_par_utilisateur_id, reference, date_frais, categorie, montant_ttc, statut)
    values ('b0000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'TEST_V1B_NDF_CROSS', current_date, 'repas', 12.50, 'brouillon')$$,
  '%row-level security%',
  'ouvrier A ne peut pas créer de note de frais chez B (isolation cross-tenant)'
);

reset role;

-- anon n'a jamais accès à ces surfaces (inchangé par ce lot, revérifié par prudence).
select ok(
  not has_table_privilege('anon', 'public.documents_chantier', 'INSERT')
    and not has_table_privilege('anon', 'public.comptes_rendus_chantier', 'INSERT')
    and not has_table_privilege('anon', 'public.notes_frais', 'INSERT')
    and not has_function_privilege('anon', 'public.ajouter_audit_note_frais(uuid,text,text,uuid,text,text,jsonb,text,text,text)', 'EXECUTE'),
  'le rôle anon ne possède aucun privilège sur documents_chantier, comptes_rendus_chantier, notes_frais ni ajouter_audit_note_frais'
);

select * from finish();
rollback;
