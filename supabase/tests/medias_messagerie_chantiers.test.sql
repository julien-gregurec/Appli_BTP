begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table(
  'public',
  'pieces_jointes_messages',
  'Les pièces jointes de messagerie sont enregistrées'
);
select has_column(
  'public',
  'pieces_jointes_messages',
  'chantier_id',
  'Un média de conversation chantier est rattaché au chantier'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.pieces_jointes_messages'::regclass),
  'RLS active sur les pièces jointes de messagerie'
);
select function_returns(
  'public',
  'publier_message_avec_pieces',
  array['uuid','text','jsonb'],
  'uuid',
  'La publication du message et de ses pièces est atomique'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.publier_message_avec_pieces(uuid,text,jsonb)',
    'execute'
  ),
  'Les membres authentifiés peuvent publier un message avec médias'
);
select is(
  (select public from storage.buckets where id='messagerie-medias'),
  false,
  'Le bucket de messagerie est privé'
);
select is(
  (select file_size_limit from storage.buckets where id='messagerie-medias'),
  20971520::bigint,
  'La taille est limitée à 20 Mo par média'
);
select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname='storage'
      and tablename='objects'
      and policyname in(
        'messagerie_medias_ajout',
        'messagerie_medias_lecture',
        'messagerie_medias_nettoyage'
      )
  ),
  3,
  'Le stockage possède ses politiques d’ajout, lecture et nettoyage'
);

select * from finish();
rollback;
