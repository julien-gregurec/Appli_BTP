-- C6-B : parcours critique d'un premier client, autorité de l'essai et pointage fondateur.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

\ir fixtures/isolation_multitenant.inc

select ok(has_table_privilege('authenticated','public.lignes_devis','SELECT'), '1. authenticated peut lire les lignes de devis');
select ok(has_table_privilege('authenticated','public.lignes_devis','INSERT'), '2. authenticated peut ajouter une ligne de devis');
select ok(has_table_privilege('authenticated','public.lignes_devis','UPDATE'), '3. authenticated peut modifier une ligne de devis');
select ok(has_table_privilege('authenticated','public.lignes_devis','DELETE'), '4. authenticated peut supprimer une ligne de devis');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$insert into public.lignes_devis(devis_id,designation,quantite,prix_unitaire_ht,taux_tva,ordre)
    values('a9000000-0000-0000-0000-000000000001','Ligne C6-B',2,50,20,0)$$,
  '5. un gestionnaire ajoute une ligne à son devis'
);
select lives_ok(
  $$update public.lignes_devis set quantite=3 where devis_id='a9000000-0000-0000-0000-000000000001' and designation='Ligne C6-B'$$,
  '6. un gestionnaire modifie sa ligne'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$insert into public.lignes_devis(devis_id,designation,quantite,prix_unitaire_ht,taux_tva,ordre)
    values('a9000000-0000-0000-0000-000000000001','Intrusion B',1,1,20,9)$$,
  '%row-level security%', '7. le tenant B ne peut jamais écrire dans le devis A'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$delete from public.lignes_devis where devis_id='a9000000-0000-0000-0000-000000000001' and designation='Ligne C6-B'$$,
  '8. un gestionnaire supprime sa ligne'
);
select lives_ok(
  $$select public.creer_devis_brouillon(
      'a0000000-0000-0000-0000-000000000001',
      jsonb_build_object('client_id','a3000000-0000-0000-0000-000000000001','notes_internes','C6B_DRAFT'),
      jsonb_build_array(jsonb_build_object('designation','Prestation initiale','type','main_oeuvre','quantite',1,'unite','u','prix_unitaire_ht',100,'remise_ligne',0,'taux_tva',20,'ordre',0))
    )$$,
  '9. la création atomique avec une ligne fonctionne'
);
select lives_ok(
  $$select public.modifier_devis_brouillon(
      (select id from public.devis where notes_internes='C6B_DRAFT'),
      jsonb_build_object('client_id','a3000000-0000-0000-0000-000000000001','notes_internes','C6B_DRAFT'),
      jsonb_build_array(jsonb_build_object('designation','Prestation modifiée','type','main_oeuvre','quantite',2,'unite','h','prix_unitaire_ht',75,'remise_ligne',0,'taux_tva',20,'ordre',0))
    )$$,
  '9a. le brouillon et ses lignes sont éditables'
);
select is(
  (select ld.designation from public.lignes_devis ld join public.devis d on d.id=ld.devis_id where d.notes_internes='C6B_DRAFT'),
  'Prestation modifiée', '9b. le devis se rouvre avec la ligne enregistrée'
);
select lives_ok(
  $$update public.devis set statut='accepte' where notes_internes='C6B_DRAFT'$$,
  '9c. le devis peut être accepté après réouverture'
);
select lives_ok(
  $$select public.creer_facture_depuis_devis((select id from public.devis where notes_internes='C6B_DRAFT'),'simple')$$,
  '9d. le devis accepté est transformé en facture'
);
select lives_ok(
  $$select public.creer_devis_brouillon(
        'a0000000-0000-0000-0000-000000000001',
        jsonb_build_object('client_id','a3000000-0000-0000-0000-000000000001','notes_internes','C6B_DELETE'),
        '[]'::jsonb
      )$$,
  '9e. un second brouillon est créé pour tester la suppression'
);
select lives_ok($$delete from public.devis where notes_internes='C6B_DELETE'$$,'9f. un brouillon peut être supprimé');
select is((select count(*)::integer from public.devis where notes_internes='C6B_DELETE'),0,'9g. le brouillon supprimé ne réapparaît pas');

reset role;
select is(
  (select abonnement_essai_fin - abonnement_essai_debut from public.entreprises where id='a0000000-0000-0000-0000-000000000001'),
  30, '10. une entreprise possède exactement 30 jours d essai'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_like(
  $$update public.entreprises set abonnement_essai_fin=abonnement_essai_fin+1 where id='a0000000-0000-0000-0000-000000000001'$$,
  '%gérés par ELSATIA et Stripe%', '11. le client ne peut pas prolonger son essai'
);
select throws_like(
  $$update public.entreprises set abonnement_statut='actif' where id='a0000000-0000-0000-0000-000000000001'$$,
  '%gérés par ELSATIA et Stripe%', '12. le client ne peut pas activer son abonnement'
);

reset role;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values('00000000-0000-0000-0000-000000000000','60000000-0000-0000-0000-000000000001','authenticated','authenticated','fondateur-c6b@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now());
insert into public.utilisateurs(id,prenom,nom) values('60000000-0000-0000-0000-000000000001','Camille','Fondateur')
on conflict(id) do update set prenom=excluded.prenom,nom=excluded.nom;

set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'fondateur-c6b@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.creer_entreprise_bootstrap('Entreprise Test Onboarding C6B',null,null,null,null)$$,
  '13. le fondateur crée son entreprise de test'
);
select is(
  (select abonnement_essai_fin-abonnement_essai_debut from public.entreprises where nom='Entreprise Test Onboarding C6B'),
  30, '14. son essai est daté même sans Checkout Stripe'
);
select is(
  (select count(*)::integer from public.employes e join public.entreprises en on en.id=e.entreprise_id where en.nom='Entreprise Test Onboarding C6B'),
  0, '15. aucune fiche salarié n est créée sans choix du fondateur'
);
select is(
  public.a_permission((select id from public.entreprises where nom='Entreprise Test Onboarding C6B'),'saisir_son_pointage'),
  false, '15a. le dirigeant reste non pointable avant son choix explicite'
);
select lives_ok(
  $$select public.garantir_fiche_pointage_courante((select id from public.entreprises where nom='Entreprise Test Onboarding C6B'))$$,
  '16. le fondateur active explicitement sa fiche de pointage'
);
select is(
  public.a_permission((select id from public.entreprises where nom='Entreprise Test Onboarding C6B'),'saisir_son_pointage'),
  true, '16a. le choix active le pointage personnel du seul compte courant'
);
select is(
  (select count(*)::integer from public.employes e join public.entreprises en on en.id=e.entreprise_id where en.nom='Entreprise Test Onboarding C6B' and e.utilisateur_id='60000000-0000-0000-0000-000000000001'),
  1, '17. la fiche est liée uniquement à son compte Auth'
);
select is(
  public.garantir_fiche_pointage_courante((select id from public.entreprises where nom='Entreprise Test Onboarding C6B')),
  (select e.id from public.employes e join public.entreprises en on en.id=e.entreprise_id where en.nom='Entreprise Test Onboarding C6B' and e.utilisateur_id='60000000-0000-0000-0000-000000000001'),
  '18. l activation est idempotente'
);
select throws_like(
  $$select public.garantir_fiche_pointage_courante('b0000000-0000-0000-0000-000000000001')$$,
  '%Accès refusé%', '19. le fondateur ne peut pas créer une fiche dans un autre tenant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select lives_ok(
  $$select public.modifier_compte_poste_pointage('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000002',true)$$,
  '20. l administrateur active le pointage du salarié terrain'
);
select lives_ok(
  $$select public.modifier_compte_poste_pointage('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','a1000000-0000-0000-0000-000000000003',true)$$,
  '21. l administrateur active le pointage du chef d équipe'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.peut_pointer_pour_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),true,'22. le salarié terrain peut pointer en son nom');
select is(public.peut_pointer_pour_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003'),false,'23. le salarié ne peut pas pointer pour son chef');
select ok(
  (select count(*) from public.chantiers_pointage_disponibles('a0000000-0000-0000-0000-000000000001')) > 0,
  '24. le chantier affecté par le planning est proposé au pointage'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.peut_pointer_pour_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003'),true,'25. le chef d équipe peut pointer en son nom');

select * from finish();
rollback;
