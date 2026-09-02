begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

insert into public.support_messages(
  id,entreprise_id,cote,auteur_id,auteur_nom,contenu
) values
  ('c7510000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000001','entreprise','10000000-0000-0000-0000-000000000001','Admin A','FIL_R75_A'),
  ('c7510000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','entreprise','20000000-0000-0000-0000-000000000001','Admin B','FIL_R75_B');

select ok(
  not has_table_privilege('authenticated','public.support_messages','INSERT'),
  'authenticated : INSERT direct support_messages révoqué'
);
select ok(
  not exists(
    select 1 from pg_policies
    where schemaname='public' and tablename='support_messages' and policyname='support_msg_insert'
  ),
  'la policy INSERT client dormante est supprimée'
);
select ok(
  has_function_privilege('authenticated','public.support_envoyer_message_entreprise(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.support_envoyer_message_entreprise(uuid,text)','EXECUTE')
  and not has_function_privilege('service_role','public.support_envoyer_message_entreprise(uuid,text)','EXECUTE'),
  'RPC d’envoi exposée uniquement à authenticated'
);
select ok(
  (select prosecdef and proconfig @> array['search_path=public']
   from pg_proc where oid='public.support_envoyer_message_entreprise(uuid,text)'::regprocedure),
  'RPC SECURITY DEFINER avec search_path public fixe'
);
select is(
  pg_get_function_arguments('public.support_envoyer_message_entreprise(uuid,text)'::regprocedure),
  'p_entreprise_id uuid, p_contenu text',
  'RPC : seuls entreprise_id et contenu sont acceptés'
);
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname='support_envoyer_message_entreprise'),
  1::bigint,
  'aucune surcharge ne permet de fournir des champs serveur'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal1"}',true);
select throws_ok(
  $$insert into public.support_messages(
      entreprise_id,cote,auteur_id,auteur_nom,contenu,
      lu_par_plateforme,lu_par_entreprise,created_at
    ) values (
      'a0000000-0000-0000-0000-000000000001','entreprise',
      '20000000-0000-0000-0000-000000000001','Admin B usurpé','SPOOF_R75',
      true,true,'2000-01-01T00:00:00Z'
    )$$,
  '42501',null,
  'attaque R7.4 exacte : INSERT direct avec auteur/flags/date forgés refusé'
);
select set_config('test.r75_before',clock_timestamp()::text,true);
select set_config(
  'test.r75_message_id',
  public.support_envoyer_message_entreprise(
    'a0000000-0000-0000-0000-000000000001','  Message R7.5 légitime  '
  )::text,
  true
);
select set_config('test.r75_after',clock_timestamp()::text,true);
select throws_ok(
  $$select public.support_envoyer_message_entreprise(
      'b0000000-0000-0000-0000-000000000001','Attaque cross-tenant'
    )$$,
  '42501',null,'utilisateur A : envoi vers entreprise B refusé'
);
select throws_ok(
  $$select public.support_envoyer_message_entreprise(
      'a0000000-0000-0000-0000-000000000001','Spoof RPC',
      '20000000-0000-0000-0000-000000000001','Nom forgé','plateforme',
      '2000-01-01T00:00:00Z'::timestamptz,true,true
    )$$,
  '42883',null,'RPC : auteur, nom, cote, date et flags ne sont pas des paramètres'
);
reset role;

select is(
  (select auteur_id from public.support_messages where id=current_setting('test.r75_message_id')::uuid),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'auteur_id provient exclusivement de auth.uid()'
);
select is(
  (select auteur_nom from public.support_messages where id=current_setting('test.r75_message_id')::uuid),
  'Admin · Entreprise Isolation A',
  'auteur_nom provient du profil et de l’entreprise canoniques'
);
select is(
  (select contenu from public.support_messages where id=current_setting('test.r75_message_id')::uuid),
  'Message R7.5 légitime',
  'contenu utilisateur accepté puis normalisé'
);
select is(
  (select cote from public.support_messages where id=current_setting('test.r75_message_id')::uuid),
  'entreprise',
  'cote entreprise imposé par le serveur'
);
select ok(
  not (select lu_par_plateforme from public.support_messages where id=current_setting('test.r75_message_id')::uuid)
  and not (select lu_par_entreprise from public.support_messages where id=current_setting('test.r75_message_id')::uuid),
  'flags de lecture initialisés à false par le serveur'
);
select ok(
  (select created_at from public.support_messages where id=current_setting('test.r75_message_id')::uuid)
    between current_setting('test.r75_before')::timestamptz
        and current_setting('test.r75_after')::timestamptz,
  'created_at est généré dans la fenêtre serveur'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','plateforme@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select public.support_envoyer_message_entreprise(
      'a0000000-0000-0000-0000-000000000001','Usurpation admin plateforme'
    )$$,
  '42501',null,'admin plateforme non membre : RPC entreprise refusée'
);
select lives_ok(
  $$select public.plateforme_entrer_entreprise(
      'a0000000-0000-0000-0000-000000000001','Test nominal réponse support R7.5'
    )$$,
  'admin plateforme : session support A ouverte'
);
select lives_ok(
  $$select public.plateforme_support_repondre(
      'a0000000-0000-0000-0000-000000000001','Réponse plateforme R7.5'
    )$$,
  'réponse plateforme existante fonctionne'
);
select is(
  (select count(*) from public.plateforme_support_messages(
    'a0000000-0000-0000-0000-000000000001'
  ) where contenu in ('Message R7.5 légitime','Réponse plateforme R7.5')),
  2::bigint,
  'lecture plateforme du fil A reste fonctionnelle'
);
select is(
  public.plateforme_support_marquer_messages_lus(
    'a0000000-0000-0000-0000-000000000001'
  ),
  2,
  'acquittement plateforme marque les deux messages entreprise non lus'
);
reset role;

select ok(
  exists(
    select 1 from public.support_messages
    where entreprise_id='a0000000-0000-0000-0000-000000000001'
      and cote='plateforme' and contenu='Réponse plateforme R7.5'
      and lu_par_plateforme and not lu_par_entreprise
  ),
  'réponse plateforme conserve ses indicateurs contractuels'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.email','admin-a@invalid.local',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal1"}',true);
select is(
  (select count(*) from public.support_messages_entreprise(
    'a0000000-0000-0000-0000-000000000001'
  ) where contenu='Message R7.5 légitime'),
  1::bigint,
  'lecture RPC entreprise R7.4 inchangée'
);
select lives_ok(
  $$select public.support_marquer_lus_entreprise(
      'a0000000-0000-0000-0000-000000000001'
    )$$,
  'acquittement entreprise existant fonctionne'
);
reset role;

select ok(
  exists(
    select 1 from public.support_messages
    where entreprise_id='a0000000-0000-0000-0000-000000000001'
      and cote='plateforme' and contenu='Réponse plateforme R7.5'
      and lu_par_entreprise
  ),
  'réponse plateforme peut toujours être marquée lue par l’entreprise'
);

select * from finish();
rollback;
