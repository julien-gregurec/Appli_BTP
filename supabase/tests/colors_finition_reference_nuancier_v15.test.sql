begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

-- ============================================================================
-- ELSATIA Colors V1.5 — finition et référence de nuancier.
--
-- Cette suite EXERCE les deux RPC contre des données réelles, sous quatre
-- identités distinctes, et vérifie ce que le journal a effectivement
-- enregistré. Une suite purement déclarative — `has_column`, `has_function` —
-- serait passée au vert alors même que la fonctionnalité échouait à la première
-- écriture : c'était exactement le cas du SQL proposé, dont le diff se faisait
-- rejeter par la liste blanche de `colors_valider_mouvement`.
--
-- Les refus sont vérifiés par leur SQLSTATE et leur message, parce que ces
-- messages sont contractuels : la couche applicative les distingue.
-- ============================================================================

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at) values
('00000000-0000-0000-0000-000000000000','41000000-0000-0000-0000-000000000015','authenticated','authenticated','v15-admin@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','42000000-0000-0000-0000-000000000015','authenticated','authenticated','v15-autre-entreprise@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','43000000-0000-0000-0000-000000000015','authenticated','authenticated','v15-consultation@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
('00000000-0000-0000-0000-000000000000','44000000-0000-0000-0000-000000000015','authenticated','authenticated','v15-sans-droit@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()) on conflict(id) do nothing;
insert into public.utilisateurs(id,prenom,nom) values
('41000000-0000-0000-0000-000000000015','Ada','Administratrice'),
('42000000-0000-0000-0000-000000000015','Bruno','AutreEntreprise'),
('43000000-0000-0000-0000-000000000015','Cléa','Consultation'),
('44000000-0000-0000-0000-000000000015','Dan','SansDroit') on conflict(id) do update set prenom=excluded.prenom;
insert into public.entreprises(id,nom,code_adhesion) values
('ac000000-0000-0000-0000-000000000015','V15 A','V15A0015'),
('bc000000-0000-0000-0000-000000000015','V15 B','V15B0015') on conflict(id) do nothing;
insert into public.postes(id,entreprise_id,nom) values
('ac100000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','V15 A'),
('bc100000-0000-0000-0000-000000000015','bc000000-0000-0000-0000-000000000015','V15 B') on conflict(id) do nothing;
insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values
('41000000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','ac100000-0000-0000-0000-000000000015','actif'),
('43000000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','ac100000-0000-0000-0000-000000000015','actif'),
('44000000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','ac100000-0000-0000-0000-000000000015','actif'),
('42000000-0000-0000-0000-000000000015','bc000000-0000-0000-0000-000000000015','bc100000-0000-0000-0000-000000000015','actif') on conflict do nothing;
insert into public.acces_applications_entreprises(entreprise_id,application_code,autorise,source) values
('ac000000-0000-0000-0000-000000000015','colors',true,'test'),
('bc000000-0000-0000-0000-000000000015','colors',true,'test');
-- Dan appartient à l'entreprise et celle-ci a le droit d'usage, mais il n'a
-- AUCUNE habilitation individuelle : c'est le cas que le double verrou existe
-- pour couvrir.
insert into public.habilitations_applications_utilisateurs(entreprise_id,utilisateur_id,application_code,role_code) values
('ac000000-0000-0000-0000-000000000015','41000000-0000-0000-0000-000000000015','colors','colors_admin_organisation'),
('ac000000-0000-0000-0000-000000000015','43000000-0000-0000-0000-000000000015','colors','colors_consultation'),
('bc000000-0000-0000-0000-000000000015','42000000-0000-0000-0000-000000000015','colors','colors_admin_organisation');
insert into public.colors_emplacements(id,entreprise_id,nom,type,created_by) values
('ac200000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','Dépôt V15','depot','41000000-0000-0000-0000-000000000015');

-- ----------------------------------------------------------------------------
-- 1. Forme du schéma
-- ----------------------------------------------------------------------------
select has_column('public','colors_seaux','finition','La finition est une colonne du seau');
select col_not_null('public','colors_seaux','finition','La finition est toujours renseignée');
select col_default_is('public','colors_seaux','finition','indetermine','Le défaut est « indéterminé » : l''état honnête d''un seau dont personne n''a lu l''étiquette');
select col_type_is('public','colors_seaux','finition','text','La finition est un texte contraint en base, pas seulement dans l''application');
select has_index('public','colors_seaux','colors_seaux_finition_idx','La finition est indexée pour le filtrage');
select function_returns('public','colors_definir_finition',array['uuid','text'],'colors_seaux','La finition a sa propre RPC : la table refuse toute mise à jour directe');
select function_returns('public','colors_definir_reference_nuancier',array['uuid','text','numeric','boolean'],'colors_seaux','La référence de nuancier a sa propre RPC');
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='colors_definir_finition'), true, 'colors_definir_finition est SECURITY DEFINER, sans quoi le garde d''écriture la refuserait');
select is((select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='colors_definir_reference_nuancier'), true, 'colors_definir_reference_nuancier est SECURITY DEFINER');
select is((select provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='colors_diff_seau'), 'i', 'colors_diff_seau reste immutable : sa volatilité n''a pas été changée en passant');

-- ----------------------------------------------------------------------------
-- 2. Droits
-- ----------------------------------------------------------------------------
select ok(has_function_privilege('authenticated','public.colors_definir_finition(uuid,text)','EXECUTE'),'authenticated peut appeler la RPC de finition');
select ok(has_function_privilege('authenticated','public.colors_definir_reference_nuancier(uuid,text,numeric,boolean)','EXECUTE'),'authenticated peut appeler la RPC de référence');
select ok(not has_function_privilege('anon','public.colors_definir_finition(uuid,text)','EXECUTE'),'anon ne peut pas déclarer une finition');
select ok(not has_function_privilege('anon','public.colors_definir_reference_nuancier(uuid,text,numeric,boolean)','EXECUTE'),'anon ne peut pas écrire de référence');
select ok(not has_function_privilege('service_role','public.colors_definir_finition(uuid,text)','EXECUTE'),'service_role non plus : Colors ne se contourne pas par la clé de service');
select ok(not has_table_privilege('authenticated','public.colors_seaux','UPDATE'),'Le rôle applicatif ne peut toujours pas mettre à jour colors_seaux directement');
select ok(not has_table_privilege('authenticated','public.colors_mouvements','INSERT'),'Le journal Colors reste fermé aux écritures directes');

-- ----------------------------------------------------------------------------
-- 3. Valeurs historiques : rien n'est réécrit, rien n'est deviné
-- ----------------------------------------------------------------------------
select is((select count(*)::integer from public.colors_seaux where finition is null),0,'Aucune ligne existante ne reste sans finition après la migration');
select is((select count(*)::integer from public.colors_seaux where finition <> 'indetermine'),0,'La migration n''a inventé aucune finition pour l''historique');

-- ----------------------------------------------------------------------------
-- 4. Finition — administratrice de l'organisation
-- ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000015',true);

select lives_ok($$insert into public.colors_seaux(id,entreprise_id,emplacement_id,marque,produit,couleur_hex,mode_quantite,quantite_nominale,quantite_restante,unite,etat)
  values('ac300000-0000-0000-0000-000000000015','ac000000-0000-0000-0000-000000000015','ac200000-0000-0000-0000-000000000015','Recette','Produit V15','#F2EFEA','volume',10,10,'l','ferme')$$,'Un seau se crée sans que la finition soit fournie');
select is((select finition from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),'indetermine','Un seau créé sans finition est « indéterminé », jamais deviné');

-- La contrainte de table, éprouvée depuis le rôle propriétaire : sans quoi le
-- garde d'écriture répondrait avant elle et l'assertion ne prouverait rien.
reset role;
select throws_ok($$update public.colors_seaux set finition='mate-veloutee' where id='ac300000-0000-0000-0000-000000000015'$$,'23514','new row for relation "colors_seaux" violates check constraint "colors_seaux_finition_v15"','Une finition hors modèle est refusée par la base elle-même, pas seulement par l''application');
select is((select count(*)::integer from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),1,'Le seau visé par l''assertion précédente existe bien : le refus n''est pas un coup dans le vide');
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000015',true);

select lives_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','satine')$$,'La finition déclarée est acceptée');
select is((select finition from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),'satine','La finition est enregistrée');
select is((select count(*)::integer from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and type='modification' and champs_modifies @> '[{"champ":"finition"}]'::jsonb),1,'La correction de finition laisse une trace : c''est le point que la liste blanche du journal faisait échouer');
select is((select e->>'avant' from public.colors_mouvements m, jsonb_array_elements(m.champs_modifies) e where m.seau_id='ac300000-0000-0000-0000-000000000015' and e->>'champ'='finition'),'indetermine','Le journal conserve la valeur d''avant');
select is((select auteur_id from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and type='modification' limit 1),'41000000-0000-0000-0000-000000000015'::uuid,'La trace est nominative');

select lives_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','satine')$$,'Redéclarer la même finition est accepté');
select is((select count(*)::integer from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and champs_modifies @> '[{"champ":"finition"}]'::jsonb),1,'Redéclarer la même finition n''ajoute aucune ligne au journal');

select throws_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','brillante')$$,'P0001','Finition Colors invalide','Une finition hors modèle est refusée par la RPC avec un message exploitable');
select throws_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015',null)$$,'P0001','Finition Colors invalide','Une finition nulle est refusée : ce n''est pas la même chose qu''indéterminée');
select throws_ok($$select public.colors_definir_finition('99999999-9999-4999-8999-999999999999','mat')$$,'P0001','Accès Colors refusé','Un seau inexistant est refusé comme un accès refusé, sans révéler qu''il n''existe pas');

-- ----------------------------------------------------------------------------
-- 5. Référence de nuancier
-- ----------------------------------------------------------------------------
select lives_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015','RAL 9010',1.42,false)$$,'Une référence au format RAL est persistable');
select is((select ral_approxime from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),'RAL 9010','La référence est enregistrée');
select is((select ral_distance from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),1.42::numeric,'L''écart est enregistré avec la référence');
select is((select ral_confirme from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),false,'Une proposition n''est pas confirmée par défaut : la confirmation est un geste humain');
select is((select count(*)::integer from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and champs_modifies @> '[{"champ":"reference_nuancier"}]'::jsonb),1,'La référence entre au journal sous un nom lisible, pas sous « ral_approxime »');

select throws_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015','PM-1024',0.9,false)$$,'CLR01','Référence de nuancier non persistable : seul le format RAL est accepté par ce schéma','Une référence fabricant est refusée par un message explicite, pas par une violation de contrainte opaque');
select throws_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015',null,null,true)$$,'P0001','Une référence est requise pour être confirmée','On ne peut pas confirmer le vide');
select throws_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015','RAL 9010',-1,false)$$,'P0001','Écart de nuancier invalide','Un écart négatif est refusé');

select lives_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015','RAL 9010',1.42,true)$$,'La confirmation humaine est acceptée');
select is((select ral_confirme from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),true,'La confirmation est enregistrée');
select is((select count(*)::integer from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and champs_modifies @> '[{"champ":"reference_confirmee"}]'::jsonb),1,'La confirmation laisse sa propre trace : c''est la seule chose qu''un humain assume ici');

select lives_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015',null,null,false)$$,'Une référence peut être effacée');
select is((select ral_distance from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),null,'Effacer la référence efface l''écart : un écart sans référence ne veut rien dire');
select is((select ral_approxime from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),null,'La référence est bien effacée');

-- ----------------------------------------------------------------------------
-- 6. Refus par rôle et par organisation
-- ----------------------------------------------------------------------------
select set_config('request.jwt.claim.sub','43000000-0000-0000-0000-000000000015',true);
select throws_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','mat')$$,'P0001','Accès Colors refusé','Un rôle de consultation ne peut pas déclarer une finition');
select throws_ok($$select public.colors_definir_reference_nuancier('ac300000-0000-0000-0000-000000000015','RAL 9010',1,false)$$,'P0001','Accès Colors refusé','Un rôle de consultation ne peut pas écrire de référence');
select is((select finition from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),'satine','Le refus n''a rien modifié');

select set_config('request.jwt.claim.sub','42000000-0000-0000-0000-000000000015',true);
select throws_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','mat')$$,'P0001','Accès Colors refusé','Une administratrice d''une AUTRE organisation ne peut pas toucher ce seau');
select is((select count(*)::integer from public.colors_seaux where id='ac300000-0000-0000-0000-000000000015'),0,'Ce seau n''est même pas visible depuis l''autre organisation');

select set_config('request.jwt.claim.sub','44000000-0000-0000-0000-000000000015',true);
select throws_ok($$select public.colors_definir_finition('ac300000-0000-0000-0000-000000000015','mat')$$,'P0001','Accès Colors refusé','Appartenir à l''organisation ne suffit pas : l''habilitation individuelle est le second verrou');

-- ----------------------------------------------------------------------------
-- 7. Le diff ne journalise que ce qui doit l'être
-- ----------------------------------------------------------------------------
reset role;
select ok((select public.colors_diff_seau(s,s) from public.colors_seaux s where s.id='ac300000-0000-0000-0000-000000000015') = '[]'::jsonb,'Un seau comparé à lui-même ne produit aucun diff');
select is((select count(*)::integer from public.colors_mouvements where seau_id='ac300000-0000-0000-0000-000000000015' and champs_modifies::text like '%ral_distance%'),0,'L''écart n''est jamais journalisé : c''est une valeur dérivée, pas une intention humaine');
-- `colors_seaux_update` a été supprimée par la V1.1 (migration 20260828000247) :
-- il n'existe AUCUNE politique de mise à jour. C'est plus fort qu'une politique
-- restrictive — PostgREST ne peut pas mettre à jour la table, quelle que soit
-- l'habilitation, et seules les RPC `security definer` y parviennent. La
-- migration V1.5 ne devait pas rouvrir cette voie en ajoutant une colonne.
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='colors_seaux' and cmd='UPDATE'),0,'Aucune politique de mise à jour n''a été réintroduite sur colors_seaux');
select is((select count(*)::integer from pg_policies where schemaname='public' and tablename='colors_seaux'),2,'colors_seaux conserve exactement ses deux politiques : lecture et insertion');

select * from finish();
rollback;
