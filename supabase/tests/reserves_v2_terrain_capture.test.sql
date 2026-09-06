-- ELSATIA-RESERVES-V2-TERRAIN-CAPTURE
-- Prouve le stockage réel des photos et des plans, l'impossibilité de forger un chemin,
-- l'isolation multi-tenant du stockage, le cycle de vie des photos (confirmation,
-- suppression douce, verrouillage après décision) et l'administration des membres par
-- l'organisation elle-même, sans débordement hors de son propre tenant.

begin;
create extension if not exists pgtap with schema extensions;
select plan(92);

\ir fixtures/isolation_multitenant.inc

-- ── Décor ────────────────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','peintre-c@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','d0000000-0000-0000-0000-0000000000a1','authenticated','authenticated','platrier-d@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.utilisateurs (id, prenom, nom) values
  ('c0000000-0000-0000-0000-0000000000a1','Peintre','C'),
  ('d0000000-0000-0000-0000-0000000000a1','Plaquiste','D')
on conflict (id) do nothing;

insert into public.entreprises (id, nom, code_adhesion) values
  ('c0000000-0000-0000-0000-000000000001','Peinture C','ISOC0001'),
  ('d0000000-0000-0000-0000-000000000001','Plâtrerie D','ISOD0001')
on conflict (id) do nothing;

insert into public.postes (id, entreprise_id, nom) values
  ('c1000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Gérant C'),
  ('d1000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','Gérant D')
on conflict (id) do nothing;

insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values
  ('c0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','actif'),
  ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-000000000001','d1000000-0000-0000-0000-000000000001','actif')
on conflict do nothing;

update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-000000000001'
where id = 'c0000000-0000-0000-0000-0000000000a1';
update public.utilisateurs set entreprise_active_id = 'd0000000-0000-0000-0000-000000000001'
where id = 'd0000000-0000-0000-0000-0000000000a1';

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source) values
  ('a0000000-0000-0000-0000-000000000001','reserves', true, 'test'),
  ('b0000000-0000-0000-0000-000000000001','reserves', true, 'test');

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code
) values
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','reserves','reserves_responsable'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','reserves','reserves_emetteur'),
  ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','reserves','reserves_consultation'),
  ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','reserves','reserves_admin_organisation');

-- ── 1. Buckets ───────────────────────────────────────────────────────────────
select ok(
  not (select public from storage.buckets where id = 'reserves-photos'),
  'le bucket des photos est privé : aucune URL publique permanente'
);
select ok(
  not (select public from storage.buckets where id = 'reserves-plans'),
  'le bucket des plans est privé'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'reserves-photos'),
  array['image/jpeg','image/png','image/webp'],
  'les photos acceptées sont exactement JPEG, PNG et WEBP'
);
select ok(
  not ('image/heic' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'reserves-photos')),
  'HEIC est refusé : il n''est pas décodé par tous les navigateurs, on ne prétend pas le gérer'
);
select ok(
  (select file_size_limit from storage.buckets where id = 'reserves-photos') = 15728640,
  'une photo est plafonnée à 15 Mo'
);
select ok(
  'application/pdf' = any (select unnest(allowed_mime_types) from storage.buckets where id = 'reserves-plans'),
  'un plan peut être un PDF'
);

-- ── 2. Décor métier : chantier, plan, intervenants, réserves ────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

insert into public.reserves_chantiers (id, entreprise_id, nom, client, date_debut, date_fin_prevue)
values ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001',
        'TEST_A_Résidence','SCI Tilleuls', current_date - 60, current_date + 30);
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom) values
  ('e2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Peinture C'),
  ('e2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Plâtrerie D');

select is(
  (select client from public.reserves_chantiers where id = 'e0000000-0000-0000-0000-000000000001'),
  'SCI Tilleuls', 'un chantier Réserves porte son client et ses dates, sans Gestion Pro'
);

select lives_ok(
  $$select public.reserves_designer_entreprise_intervenante(
      'e2000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001')$$,
  'l''hôte désigne l''entreprise intervenante'
);
select lives_ok(
  $$select public.reserves_designer_entreprise_intervenante(
      'e2000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001')$$,
  'et le second corps d''état'
);

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select lives_ok($$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-000000000001')$$,
  'C rejoint son intervention');
select set_config('request.jwt.claim.sub', 'd0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'platrier-d@invalid.local', true);
select lives_ok($$select public.reserves_rejoindre_intervention('e2000000-0000-0000-0000-000000000002')$$,
  'D rejoint la sienne');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

-- R1 : photo obligatoire. R2 : photo facultative. R3 : attribuée à D.
select set_config('elsatia.r1', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Peinture écaillée', null, 'haute',
  'e2000000-0000-0000-0000-000000000001', null, null, null, true)::text), true);
select set_config('elsatia.r2', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Joint à reprendre', null, 'normale',
  'e2000000-0000-0000-0000-000000000001', null, null, null, false)::text), true);
select set_config('elsatia.r3', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Cloison hors plomb', null, 'normale',
  'e2000000-0000-0000-0000-000000000002', null, null, null, false)::text), true);

-- ── 3. Le chemin de stockage ne prouve rien ─────────────────────────────────
-- Ces assertions sont le cœur du lot : un chemin bien formé mais mensonger doit être
-- refusé, y compris quand il porte le vrai identifiant d'entreprise de l'appelant.
select ok(
  not public.reserves_storage_photo_autorisee('pas/un/chemin/valide.jpg', false),
  'un chemin qui n''a pas la forme attendue est refusé'
);
select ok(
  not public.reserves_storage_photo_autorisee(
    'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
    || 'ffffffff-ffff-ffff-ffff-ffffffffffff/photo.jpg', false),
  'un chemin désignant une réserve inexistante est refusé'
);
select ok(
  not public.reserves_storage_photo_autorisee(
    'a0000000-0000-0000-0000-000000000001/ffffffff-ffff-ffff-ffff-ffffffffffff/'
    || current_setting('elsatia.r1') || '/photo.jpg', false),
  'un chemin qui rattache une vraie réserve à un faux chantier est refusé'
);
select ok(
  not public.reserves_storage_photo_autorisee(
    'b0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
    || current_setting('elsatia.r1') || '/photo.jpg', false),
  'un chemin qui réattribue une vraie réserve à une autre organisation est refusé'
);
select ok(
  public.reserves_storage_photo_autorisee(
    'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
    || current_setting('elsatia.r1') || '/photo.jpg', false),
  'le chemin cohérent d''une réserve lisible est accepté'
);
select ok(
  not public.reserves_storage_photo_autorisee(
    'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
    || current_setting('elsatia.r1') || '/../../../autre.jpg', false),
  'une tentative de remontée de dossier est refusée'
);

-- ── 4. Policies Storage, tenant par tenant ──────────────────────────────────
select set_config('elsatia.chemin_r1', (
  'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
  || current_setting('elsatia.r1') || '/constat.jpg'), true);
select set_config('elsatia.chemin_r3', (
  'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
  || current_setting('elsatia.r3') || '/constat.jpg'), true);

select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, metadata)
    values ('f0000000-0000-0000-0000-000000000001','reserves-photos',
            current_setting('elsatia.chemin_r1'), '{"mimetype":"image/jpeg"}')$$,
  'l''organisation hôte dépose une photo sur sa propre réserve'
);

-- Entreprise B : aucun droit, ni en écriture ni en lecture.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_ok(
  $$insert into storage.objects (id, bucket_id, name, metadata)
    values ('f0000000-0000-0000-0000-0000000000b1','reserves-photos',
            current_setting('elsatia.chemin_r1'), '{"mimetype":"image/jpeg"}')$$,
  '42501', null, 'entreprise B ne peut pas déposer de photo sur une réserve de A'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'reserves-photos'), 0::bigint,
  'entreprise B ne voit aucune photo de A'
);
select ok(
  not public.reserves_storage_photo_autorisee(current_setting('elsatia.chemin_r1'), false),
  'et le prédicat de lecture le lui refuse explicitement'
);

-- Entreprise intervenante C : sa réserve oui, celle de D non.
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select is(
  (select count(*) from storage.objects where bucket_id = 'reserves-photos'), 1::bigint,
  'l''entreprise intervenante lit la photo de la réserve qui lui est attribuée'
);
select ok(
  public.reserves_storage_photo_autorisee(current_setting('elsatia.chemin_r1'), true),
  'elle peut déposer une photo sur sa réserve'
);
select ok(
  not public.reserves_storage_photo_autorisee(current_setting('elsatia.chemin_r3'), false),
  'elle ne lit pas la réserve du second corps d''état, sur le même chantier'
);
select ok(
  not public.reserves_storage_photo_autorisee(current_setting('elsatia.chemin_r3'), true),
  'et ne peut rien y déposer'
);
select throws_ok(
  $$delete from storage.objects where bucket_id = 'reserves-photos'$$,
  '42501', null, 'aucune photo ne peut être effacée du stockage depuis l''application'
);

-- ── 5. Photo réservée, photo confirmée ──────────────────────────────────────
select set_config('elsatia.photo1', (
  select photo_id::text from public.reserves_ajouter_photo(
    current_setting('elsatia.r1')::uuid, 'travaux', 'Reprise faite', 'image/jpeg', 120000, 'IMG_4210.JPG')), true);
select set_config('elsatia.chemin_photo1', (
  select storage_path from public.reserves_photos where id = current_setting('elsatia.photo1')::uuid), true);

select ok(
  current_setting('elsatia.chemin_photo1') like
    'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
    || current_setting('elsatia.r1') || '/%',
  'le chemin est composé par la base à partir des identifiants réels de la réserve'
);
select ok(
  current_setting('elsatia.chemin_photo1') like '%.jpg',
  'l''extension est déduite du type MIME, jamais du nom fourni'
);
select is(
  (select nom_fichier from public.reserves_photos where id = current_setting('elsatia.photo1')::uuid),
  'IMG_4210.JPG', 'le nom d''origine est conservé comme métadonnée, pas comme chemin'
);
select throws_like(
  $$select public.reserves_ajouter_photo(current_setting('elsatia.r1')::uuid, 'travaux', null, 'image/heic')$$,
  '%non pris en charge%', 'un format non pris en charge est refusé à la source'
);

select is(
  (select count(*) from public.reserves_photos_visibles(current_setting('elsatia.r1')::uuid)),
  0::bigint, 'une photo réservée mais non téléversée n''apparaît nulle part'
);
select throws_like(
  $$select public.reserves_confirmer_photo(current_setting('elsatia.photo1')::uuid)$$,
  '%Aucun fichier déposé%',
  'la confirmation échoue tant que le fichier n''est pas réellement dans le bucket'
);

-- ── 6. Photo obligatoire à la levée ─────────────────────────────────────────
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.r1')::uuid, true)$$,
  'l''entreprise accepte la réserve à photo obligatoire'
);
select throws_like(
  $$select public.reserves_demander_levee(current_setting('elsatia.r1')::uuid)$$,
  '%Photo obligatoire%',
  'cas OUI sans photo : la demande de levée est refusée'
);

-- Le fichier est déposé, puis confirmé.
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, metadata)
    values ('f0000000-0000-0000-0000-000000000002','reserves-photos',
            current_setting('elsatia.chemin_photo1'), '{"mimetype":"image/jpeg"}')$$,
  'l''entreprise dépose le fichier à l''emplacement que la base lui a réservé'
);
select lives_ok(
  $$select public.reserves_confirmer_photo(current_setting('elsatia.photo1')::uuid)$$,
  'la confirmation aboutit une fois le fichier présent'
);
select is(
  (select count(*) from public.reserves_photos_visibles(current_setting('elsatia.r1')::uuid)),
  1::bigint, 'la photo confirmée devient visible'
);
select lives_ok(
  $$select public.reserves_demander_levee(current_setting('elsatia.r1')::uuid, 'Reprise conforme')$$,
  'cas OUI avec photo : la demande de levée aboutit'
);

-- Cas NON : aucune photo n'est exigée.
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.r2')::uuid, true)$$,
  'l''entreprise accepte la réserve sans obligation de photo'
);
select lives_ok(
  $$select public.reserves_demander_levee(current_setting('elsatia.r2')::uuid)$$,
  'cas NON sans photo : la demande de levée passe'
);

-- ── 7. Une photo ne vaut que pour SA réserve ────────────────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('elsatia.r4', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Enduit à reprendre', null, 'normale',
  'e2000000-0000-0000-0000-000000000001', null, null, null, true)::text), true);

select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select lives_ok(
  $$select public.reserves_repondre_responsabilite(current_setting('elsatia.r4')::uuid, true)$$,
  'l''entreprise accepte la quatrième réserve'
);
select throws_like(
  $$select public.reserves_demander_levee(current_setting('elsatia.r4')::uuid)$$,
  '%Photo obligatoire%',
  'la photo confirmée d''une AUTRE réserve ne satisfait pas l''obligation'
);

-- ── 8. Suppression douce et verrouillage ────────────────────────────────────
select set_config('elsatia.photo4', (
  select photo_id::text from public.reserves_ajouter_photo(
    current_setting('elsatia.r4')::uuid, 'travaux', null, 'image/png', 90000, 'reprise.png')), true);
insert into storage.objects (id, bucket_id, name, metadata)
select 'f0000000-0000-0000-0000-000000000004','reserves-photos', ph.storage_path, '{"mimetype":"image/png"}'
from public.reserves_photos ph where ph.id = current_setting('elsatia.photo4')::uuid;
select lives_ok(
  $$select public.reserves_confirmer_photo(current_setting('elsatia.photo4')::uuid)$$,
  'la photo de la quatrième réserve est confirmée'
);
select lives_ok(
  $$select public.reserves_supprimer_photo(current_setting('elsatia.photo4')::uuid, 'Mauvais cadrage')$$,
  'son auteur peut la retirer tant qu''aucune décision n''a été prononcée'
);
select is(
  (select count(*) from public.reserves_photos_visibles(current_setting('elsatia.r4')::uuid)),
  0::bigint, 'la photo supprimée disparaît de la galerie'
);
select is(
  (select count(*) from public.reserves_photos where id = current_setting('elsatia.photo4')::uuid),
  1::bigint, 'mais la ligne subsiste : la suppression est douce, jamais un effacement'
);
select throws_like(
  $$select public.reserves_demander_levee(current_setting('elsatia.r4')::uuid)$$,
  '%Photo obligatoire%',
  'une photo supprimée ne satisfait plus l''obligation de levée'
);

-- Photo remplaçante, puis demande de levée : elle devient une pièce du dossier.
select set_config('elsatia.photo5', (
  select photo_id::text from public.reserves_ajouter_photo(
    current_setting('elsatia.r4')::uuid, 'travaux', 'Cadrage correct', 'image/jpeg', 95000, 'reprise2.jpg')), true);
insert into storage.objects (id, bucket_id, name, metadata)
select 'f0000000-0000-0000-0000-000000000005','reserves-photos', ph.storage_path, '{"mimetype":"image/jpeg"}'
from public.reserves_photos ph where ph.id = current_setting('elsatia.photo5')::uuid;
select lives_ok(
  $$select public.reserves_confirmer_photo(current_setting('elsatia.photo5')::uuid)$$,
  'la photo remplaçante est confirmée'
);
select lives_ok(
  $$select public.reserves_demander_levee(current_setting('elsatia.r4')::uuid, 'Reprise refaite')$$,
  'la levée peut être demandée'
);
select throws_like(
  $$select public.reserves_supprimer_photo(current_setting('elsatia.photo5')::uuid)$$,
  '%verrouillée%',
  'une photo qui précède une décision prononcée ne peut plus être supprimée'
);

-- L'hôte ne supprime pas les photos de l'intervenant, et réciproquement.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select throws_like(
  $$select public.reserves_supprimer_photo(current_setting('elsatia.photo1')::uuid)$$,
  '%entreprise intervenante%',
  'l''organisation hôte ne peut pas retirer une photo déposée par son sous-traitant'
);

-- ── 9. Plans ────────────────────────────────────────────────────────────────
select set_config('elsatia.plan1', (
  select plan_id::text from public.reserves_ajouter_plan(
    'e0000000-0000-0000-0000-000000000001','Plan R+1','R+1','Aile Est','application/pdf', 400000,'plan.pdf')), true);
select set_config('elsatia.chemin_plan1', (
  select storage_path from public.reserves_ajouter_plan(
    'e0000000-0000-0000-0000-000000000001','Plan RDC','RDC', null,'image/png', 300000,'rdc.png')), true);

select ok(
  exists (select 1 from public.reserves_plans where id = current_setting('elsatia.plan1')::uuid),
  'un plan est créé avec son niveau et sa zone'
);
select is(
  (select storage_path from public.reserves_plans where id = current_setting('elsatia.plan1')::uuid),
  null, 'son document reste nul tant qu''il n''a pas été confirmé'
);
select throws_like(
  $$select public.reserves_confirmer_plan(current_setting('elsatia.plan1')::uuid,
      'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
      || current_setting('elsatia.r1') || '/faux.pdf')$$,
  '%incohérent%', 'un chemin qui ne désigne pas ce plan est refusé'
);

select set_config('elsatia.chemin_plan_ok', (
  'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/'
  || current_setting('elsatia.plan1') || '/document.pdf'), true);
select throws_like(
  $$select public.reserves_confirmer_plan(current_setting('elsatia.plan1')::uuid,
      current_setting('elsatia.chemin_plan_ok'))$$,
  '%Aucun document déposé%', 'et un chemin cohérent sans fichier l''est aussi'
);
select lives_ok(
  $$insert into storage.objects (id, bucket_id, name, metadata)
    values ('f1000000-0000-0000-0000-000000000001','reserves-plans',
            current_setting('elsatia.chemin_plan_ok'), '{"mimetype":"application/pdf"}')$$,
  'le gestionnaire de plans dépose le document'
);
select lives_ok(
  $$select public.reserves_confirmer_plan(current_setting('elsatia.plan1')::uuid,
      current_setting('elsatia.chemin_plan_ok'))$$,
  'la confirmation du plan aboutit'
);

-- Position sur plan, et libération à la suppression.
select set_config('elsatia.r5', (select public.reserves_creer(
  'e0000000-0000-0000-0000-000000000001','Repérée sur plan', null, 'normale', null,
  current_setting('elsatia.plan1')::uuid, 0.3125, 0.7500)::text), true);
select is(
  (select position_x from public.reserves where id = current_setting('elsatia.r5')::uuid),
  0.31250::numeric, 'la position normalisée est enregistrée telle que pointée'
);
select lives_ok(
  $$select public.reserves_supprimer_plan(current_setting('elsatia.plan1')::uuid)$$,
  'un plan déposé par erreur peut être retiré'
);
select ok(
  (select plan_id is null and position_x is null and position_y is null
   from public.reserves where id = current_setting('elsatia.r5')::uuid),
  'les repères qu''il portait sont libérés, sans violer la contrainte plan/position'
);

-- Cross-tenant sur les plans.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select throws_like(
  $$select public.reserves_ajouter_plan('e0000000-0000-0000-0000-000000000001','Plan pirate')$$,
  '%non autorisé%', 'entreprise B ne peut pas ajouter de plan au chantier de A'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'reserves-plans'), 0::bigint,
  'entreprise B ne voit aucun plan de A'
);

-- ── 10. Administration des membres par l'organisation ───────────────────────
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);

select ok(
  (select count(*) from public.reserves_lister_membres('a0000000-0000-0000-0000-000000000001')) >= 6,
  'l''administrateur voit les membres de son organisation'
);
select is(
  (select role_code from public.reserves_lister_membres('a0000000-0000-0000-0000-000000000001')
   where utilisateur_id = '10000000-0000-0000-0000-000000000004'),
  'reserves_responsable', 'avec le rôle Réserves de chacun'
);
select ok(
  (select email from public.reserves_lister_membres('a0000000-0000-0000-0000-000000000001')
   where utilisateur_id = '10000000-0000-0000-0000-000000000003') is not null,
  'et leur adresse e-mail, pour pouvoir les identifier'
);

select lives_ok(
  $$select public.reserves_attribuer_role(
      '10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','reserves_emetteur')$$,
  'l''organisation habilite elle-même un de ses membres, sans administrateur plateforme'
);
select is(
  (select role_code from public.habilitations_applications_utilisateurs
   where utilisateur_id = '10000000-0000-0000-0000-000000000003'
     and entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'reserves_emetteur', 'le rôle est bien enregistré'
);
-- `historique_acces_applications` n'est lisible que par la plateforme : le contrôle se
-- fait donc hors session, ce qui vérifie du même coup que l'organisation ne la lit pas.
select is(
  (select count(*) from public.historique_acces_applications
   where cible_id = '10000000-0000-0000-0000-000000000003' and application_code = 'reserves'),
  0::bigint, 'l''organisation ne relit pas le journal d''accès de la plateforme'
);
reset role;
select is(
  (select count(*) from public.historique_acces_applications
   where cible_id = '10000000-0000-0000-0000-000000000003' and application_code = 'reserves'),
  1::bigint, 'et l''attribution est bien journalisée côté plateforme'
);
set local role authenticated;

-- Les bornes de l'administration d'organisation.
select throws_like(
  $$select public.reserves_attribuer_role(
      '10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','reserves_intervenant')$$,
  '%non attribuable%',
  'le rôle du compte invité gratuit n''est pas attribuable à un salarié'
);
select throws_like(
  $$select public.reserves_attribuer_role(
      '20000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','reserves_emetteur')$$,
  '%pas membre actif%',
  'on habilite un membre, on n''enrôle pas quelqu''un de l''extérieur'
);
select throws_like(
  $$select public.reserves_attribuer_role(
      '20000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000001','reserves_emetteur')$$,
  '%non autorisée%',
  'l''administrateur de A ne peut pas habiliter un membre de B dans le tenant de B'
);
select is(
  (select count(*) from public.reserves_lister_membres('b0000000-0000-0000-0000-000000000001')),
  0::bigint, 'et il ne voit même pas la liste des membres de B'
);

-- Le rôle Réserves n'ouvre aucune autre application, ni la plateforme.
select ok(
  not exists (
    select 1 from public.habilitations_applications_utilisateurs
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
      and application_code <> 'reserves'
      and utilisateur_id = '10000000-0000-0000-0000-000000000003'
  ),
  'habiliter dans Réserves n''ouvre ni Gestion Pro, ni Colors, ni Tools'
);
select ok(
  not public.est_plateforme_admin(),
  'un administrateur d''organisation ne devient jamais administrateur plateforme'
);
select ok(
  not public.est_plateforme_proprietaire(),
  'ni propriétaire global'
);

-- Garde du dernier administrateur.
select throws_like(
  $$select public.reserves_attribuer_role(
      '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','reserves_consultation')$$,
  '%au moins un administrateur%',
  'l''unique administrateur ne peut pas se rétrograder et laisser l''organisation sans pilote'
);
select throws_like(
  $$select public.reserves_retirer_acces_membre(
      '10000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001')$$,
  '%au moins un administrateur%',
  'ni se retirer l''accès'
);
select lives_ok(
  $$select public.reserves_attribuer_role(
      '10000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','reserves_admin_organisation')$$,
  'il peut en revanche désigner un second administrateur'
);
select lives_ok(
  $$select public.reserves_retirer_acces_membre(
      '10000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001')$$,
  'et retirer l''accès Réserves d''un membre'
);
select ok(
  not (select autorise from public.habilitations_applications_utilisateurs
       where utilisateur_id = '10000000-0000-0000-0000-000000000003'
         and entreprise_id = 'a0000000-0000-0000-0000-000000000001' and application_code = 'reserves'),
  'le retrait désactive l''habilitation sans effacer la trace'
);

-- Un rôle non administrateur n'administre rien.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.reserves_attribuer_role(
      '10000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','reserves_responsable')$$,
  '%non autorisée%', 'un émetteur ne peut pas distribuer les rôles'
);
select is(
  (select count(*) from public.reserves_lister_membres('a0000000-0000-0000-0000-000000000001')),
  0::bigint, 'ni consulter la liste des membres'
);

-- ── 11. Séparation des responsabilités, rappel V1 toujours vrai ─────────────
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.r1')::uuid, true)$$,
  '%non autorisée%', 'un émetteur ne valide pas une levée'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claim.email', 'comptable-a@invalid.local', true);
select throws_like(
  $$select public.reserves_creer('e0000000-0000-0000-0000-000000000001','Réserve en lecture seule')$$,
  '%non autorisée%', 'un compte consultation ne crée rien'
);
select ok(
  not public.reserves_action_autorisee('a0000000-0000-0000-0000-000000000001','gerer_membres'),
  'et n''administre pas les membres'
);
select set_config('request.jwt.claim.sub', 'c0000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claim.email', 'peintre-c@invalid.local', true);
select throws_like(
  $$select public.reserves_statuer_levee(current_setting('elsatia.r1')::uuid, true)$$,
  '%non autorisée%', 'une entreprise intervenante ne valide pas sa propre levée'
);
select ok(
  not public.reserves_action_autorisee('c0000000-0000-0000-0000-000000000001','gerer_membres'),
  'et n''administre aucun membre, même chez elle'
);

-- ── 12. Le propriétaire global n'accède pas aux fichiers d'un client ────────
reset role;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000','30000000-0000-0000-0000-00000000000f',
       'authenticated','authenticated', pa.email, crypt('test', gen_salt('bf')), now(), now(), now()
from public.plateforme_admins pa where pa.proprietaire on conflict do nothing;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('30000000-0000-0000-0000-0000000000fb','30000000-0000-0000-0000-00000000000f',
        'test-owner-totp','totp','verified', now(), now(), 'secret');
insert into public.utilisateurs (id, prenom, nom)
values ('30000000-0000-0000-0000-00000000000f','Propriétaire','ELSATIA') on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-00000000000f', true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select lives_ok($$select public.plateforme_proprietaire_revendiquer()$$,
  'le propriétaire global revendique son identité');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','reserves'),
  'il accède toujours à Réserves au catalogue');
select is(
  (select count(*) from storage.objects where bucket_id in ('reserves-photos','reserves-plans')),
  0::bigint,
  'mais il ne lit aucune photo ni aucun plan d''un client'
);
select ok(
  not public.reserves_action_autorisee('a0000000-0000-0000-0000-000000000001','gerer_membres'),
  'et n''administre pas les membres d''une organisation cliente'
);

reset role;
select * from finish();
rollback;
