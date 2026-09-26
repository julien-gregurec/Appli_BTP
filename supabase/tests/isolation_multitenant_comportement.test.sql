begin;
create extension if not exists pgtap with schema extensions;
select plan(56);

\ir fixtures/isolation_multitenant.inc

-- Administrateur A : accès complet à A, aucun accès à B.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'admin A ne voit que les clients A');
select is((select count(*) from public.clients where nom like 'TEST_A_%'), 3::bigint, 'admin A ne lit aucune donnée client B');
select is((select count(*) from public.chantiers), 2::bigint, 'admin A voit les deux chantiers A');
select is((select count(*) from public.notes_frais), 1::bigint, 'admin A ne voit que les notes A');
select is((select count(*) from public.documents_chantier), 2::bigint, 'admin A ne voit que les documents A');
select is((select count(*) from storage.objects where bucket_id = 'chantier-documents'), 2::bigint, 'admin A ne voit que les objets chantier A');
select is((select count(*) from public.devis), 1::bigint, 'admin A ne voit que les devis A');
select is((select count(*) from public.factures), 1::bigint, 'admin A ne voit que les factures A');
select is((select count(*) from public.fournisseurs), 1::bigint, 'admin A ne voit que les fournisseurs A');
select is((select count(*) from public.commandes_fournisseurs), 1::bigint, 'admin A ne voit que les commandes A');
select is((select count(*) from public.articles_stock), 1::bigint, 'admin A ne voit que les articles A');
select is((select count(*) from public.mouvements_stock), 1::bigint, 'admin A ne voit que les mouvements A');
select is((select count(*) from public.conversations_internes), 1::bigint, 'admin A ne voit que les conversations A');
select is((select count(*) from public.messages_internes), 1::bigint, 'admin A ne voit que les messages A');
select is((select count(*) from public.pieces_jointes_messages), 1::bigint, 'admin A ne voit que les médias de messages A');
select is((select count(*) from storage.objects where bucket_id = 'messagerie-medias'), 1::bigint, 'admin A ne voit que les objets de messagerie A');
select is((select count(*) from public.journal_ia), 1::bigint, 'admin A ne voit que le journal IA A');
select throws_like(
  $$insert into public.clients (entreprise_id, nom, type) values ('b0000000-0000-0000-0000-000000000001', 'Intrusion A vers B', 'particulier')$$,
  '%row-level security%', 'admin A ne peut pas écrire dans B'
);

-- Ouvrier A : périmètre propre et chantier assigné uniquement.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is((select count(*) from public.clients), 0::bigint, 'ouvrier A sans droit client ne voit aucun client');
select is((select count(*) from public.chantiers), 1::bigint, 'ouvrier A ne voit que son chantier assigné');
select is((select nom from public.chantiers limit 1), 'TEST_A_Chantier assigné', 'le chantier visible est bien celui affecté');
select is((select count(*) from public.pointages), 1::bigint, 'ouvrier A ne voit que son pointage');
select is((select count(*) from public.notes_frais), 1::bigint, 'ouvrier A ne voit que sa note de frais');
select is((select count(*) from public.documents_chantier), 1::bigint, 'ouvrier A ne voit que le document autorisé de son chantier');
select is((select count(*) from storage.objects where bucket_id = 'chantier-documents'), 1::bigint, 'ouvrier A ne télécharge que le fichier autorisé');
select is((select count(*) from public.conversations_internes), 1::bigint, 'ouvrier A voit la conversation de son chantier assigné');
select is((select count(*) from public.messages_internes), 1::bigint, 'ouvrier A voit les messages de son chantier assigné');
select is((select count(*) from public.pieces_jointes_messages), 1::bigint, 'ouvrier A voit le média de son chantier assigné');
select is((select count(*) from storage.objects where bucket_id = 'messagerie-medias'), 1::bigint, 'ouvrier A télécharge uniquement le média de son chantier assigné');
select lives_ok(
  $$update public.clients
      set nom = 'Altéré'
    where id = 'a3000000-0000-0000-0000-000000000001'$$,
  'la tentative de modification sans ligne visible est rejetée sans fuite'
);
select is(
  (
    select count(*)
    from public.clients
    where id = 'a3000000-0000-0000-0000-000000000001'
      and nom = 'Altéré'
  ),
  0::bigint,
  'ouvrier A ne peut pas modifier un client'
);
select throws_like(
  $$insert into public.clients (entreprise_id, nom, type) values ('b0000000-0000-0000-0000-000000000001', 'Intrusion ouvrier A', 'particulier')$$,
  '%row-level security%', 'ouvrier A ne peut pas écrire dans B'
);

-- Administrateur B : miroir indépendant.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select is((select count(*) from public.clients), 3::bigint, 'admin B ne voit que les clients B');
select is((select count(*) from public.clients where nom like 'TEST_B_%'), 3::bigint, 'admin B ne lit aucune donnée client A');
select is((select count(*) from public.chantiers), 2::bigint, 'admin B ne voit que les chantiers B');
select is((select count(*) from public.notes_frais), 1::bigint, 'admin B ne voit que les notes B');
select is((select count(*) from storage.objects where bucket_id = 'chantier-documents'), 1::bigint, 'admin B ne voit que les objets B');
select is((select count(*) from public.devis), 1::bigint, 'admin B ne voit que les devis B');
select is((select count(*) from public.factures), 1::bigint, 'admin B ne voit que les factures B');
select is((select count(*) from public.fournisseurs), 1::bigint, 'admin B ne voit que les fournisseurs B');
select is((select count(*) from public.commandes_fournisseurs), 1::bigint, 'admin B ne voit que les commandes B');
select is((select count(*) from public.articles_stock), 1::bigint, 'admin B ne voit que les articles B');
select is((select count(*) from public.mouvements_stock), 1::bigint, 'admin B ne voit que les mouvements B');
select is((select count(*) from public.conversations_internes), 1::bigint, 'admin B ne voit que les conversations B');
select is((select count(*) from public.messages_internes), 1::bigint, 'admin B ne voit que les messages B');
select is((select count(*) from public.pieces_jointes_messages), 1::bigint, 'admin B ne voit que les médias de messages B');
select is((select count(*) from storage.objects where bucket_id = 'messagerie-medias'), 1::bigint, 'admin B ne voit que les objets de messagerie B');
select is((select count(*) from public.journal_ia), 1::bigint, 'admin B ne voit que le journal IA B');

-- Super-administrateur : aucun accès implicite au contenu client.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select is((select count(*) from public.clients), 0::bigint, 'admin plateforme ne voit aucun client par défaut');
select is((select count(*) from public.documents_chantier), 0::bigint, 'admin plateforme ne voit aucun document client par défaut');
select is((select count(*) from storage.objects where bucket_id = 'chantier-documents'), 0::bigint, 'admin plateforme ne voit aucun fichier client par défaut');
select is((select count(*) from public.devis), 0::bigint, 'admin plateforme ne voit aucun devis client par défaut');
select is((select count(*) from public.factures), 0::bigint, 'admin plateforme ne voit aucune facture client par défaut');
select is((select count(*) from public.messages_internes), 0::bigint, 'admin plateforme ne voit aucun message client par défaut');
select is((select count(*) from storage.objects where bucket_id = 'messagerie-medias'), 0::bigint, 'admin plateforme ne voit aucun média client par défaut');
select is((select count(*) from public.journal_ia), 0::bigint, 'admin plateforme ne voit aucune donnée IA client par défaut');

reset role;
select * from finish();
rollback;
