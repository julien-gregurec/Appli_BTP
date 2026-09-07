-- ELSATIA-GP-CLIENT-DOCUMENT-SNAPSHOT-P0-V1 — preuve d'exécution réelle.
--
-- Scénario central : un document émis pour l'identité A doit continuer à porter
-- A après que la fiche client soit passée à B, tandis qu'un document émis après
-- le changement porte B.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

\ir fixtures/isolation_multitenant.inc

-- Identité A du client de l'entreprise A.
update public.clients
set societe = 'IDENTITE_A_SARL',
    siret = '11111111111111',
    adresse_facturation = '1 rue Avant',
    code_postal = '67000',
    ville = 'Strasbourg',
    email = 'identite-a@invalid.local'
where id = 'a3000000-0000-0000-0000-000000000001';

insert into public.contacts_clients (id, client_id, nom, fonction, telephone, email, principal)
values ('c0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001',
        'Contact Avant', 'Gérant', '0300000000', 'contact-avant@invalid.local', true);

-- ---------------------------------------------------------------------------
-- 1-2. Brouillon : aucune identité figée, lecture directe de la fiche client.
-- ---------------------------------------------------------------------------
insert into public.devis (
  id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'd1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-DEV-001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 100, 20, 120
);

select ok(
  (select client_snapshot from public.devis where id = 'd1000000-0000-0000-0000-000000000001') is null,
  'un devis brouillon ne fige aucune identité destinataire'
);
select ok(
  (select client_snapshot_at from public.devis where id = 'd1000000-0000-0000-0000-000000000001') is null,
  'un devis brouillon n''est pas horodaté'
);

-- ---------------------------------------------------------------------------
-- 3-5. Émission : capture complète de l'identité A.
-- ---------------------------------------------------------------------------
update public.devis set statut = 'envoye' where id = 'd1000000-0000-0000-0000-000000000001';

select is(
  (select client_snapshot ->> 'nom_affiche' from public.devis where id = 'd1000000-0000-0000-0000-000000000001'),
  'IDENTITE_A_SARL',
  'l''émission fige le nom du destinataire'
);
select is(
  (select client_snapshot ->> 'siret' from public.devis where id = 'd1000000-0000-0000-0000-000000000001'),
  '11111111111111',
  'l''émission fige le SIRET du destinataire'
);
select is(
  (select client_snapshot -> 'contact' ->> 'email' from public.devis where id = 'd1000000-0000-0000-0000-000000000001'),
  'contact-avant@invalid.local',
  'l''émission fige l''e-mail du contact destinataire'
);

-- ---------------------------------------------------------------------------
-- 6-8. Passage de l'identité A à l'identité B sur la fiche client.
-- ---------------------------------------------------------------------------
update public.clients
set societe = 'IDENTITE_B_SAS',
    siret = '22222222222222',
    adresse_facturation = '2 rue Après',
    ville = 'Colmar',
    email = 'identite-b@invalid.local'
where id = 'a3000000-0000-0000-0000-000000000001';

update public.contacts_clients
set nom = 'Contact Après', email = 'contact-apres@invalid.local'
where id = 'c0000000-0000-0000-0000-000000000001';

select is(
  (select client_snapshot ->> 'nom_affiche' from public.devis where id = 'd1000000-0000-0000-0000-000000000001'),
  'IDENTITE_A_SARL',
  'le devis déjà émis conserve l''identité A après modification de la fiche client'
);
select is(
  (select client_snapshot ->> 'ville' from public.devis where id = 'd1000000-0000-0000-0000-000000000001'),
  'Strasbourg',
  'le devis déjà émis conserve l''adresse de facturation d''origine'
);

-- Un NOUVEAU document émis porte bien la nouvelle identité.
insert into public.devis (
  id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'd1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-DEV-002', 'a3000000-0000-0000-0000-000000000001', 'envoye', 50, 10, 60
);
select is(
  (select client_snapshot ->> 'nom_affiche' from public.devis where id = 'd1000000-0000-0000-0000-000000000002'),
  'IDENTITE_B_SAS',
  'un devis émis après le changement porte l''identité B'
);

-- ---------------------------------------------------------------------------
-- 9-11. Facture puis avoir.
-- ---------------------------------------------------------------------------
insert into public.factures (
  id, entreprise_id, numero, client_id, devis_origine_id, type, statut,
  montant_ht, montant_tva, montant_ttc
) values (
  'f1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-FAC-001', 'a3000000-0000-0000-0000-000000000001',
  'd1000000-0000-0000-0000-000000000002', 'simple', 'envoyee', 50, 10, 60
);
select is(
  (select client_snapshot ->> 'nom_affiche' from public.factures where id = 'f1000000-0000-0000-0000-000000000001'),
  'IDENTITE_B_SAS',
  'une facture fige l''identité du destinataire à sa propre émission'
);

-- L'avoir est créé en brouillon puis émis : il doit reprendre l'identité de la
-- facture qu'il crédite, pas la fiche client du jour.
update public.clients set societe = 'IDENTITE_C_SCI'
where id = 'a3000000-0000-0000-0000-000000000001';

insert into public.factures (
  id, entreprise_id, numero, client_id, facture_origine_id, type, statut,
  montant_ht, montant_tva, montant_ttc
) values (
  'f1000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-AVO-001', 'a3000000-0000-0000-0000-000000000001',
  'f1000000-0000-0000-0000-000000000001', 'avoir', 'brouillon', -50, -10, -60
);
update public.factures set statut = 'envoyee' where id = 'f1000000-0000-0000-0000-000000000002';

select is(
  (select client_snapshot ->> 'nom_affiche' from public.factures where id = 'f1000000-0000-0000-0000-000000000002'),
  'IDENTITE_B_SAS',
  'un avoir reprend l''identité figée de la facture qu''il crédite'
);
select is(
  (select client_snapshot ->> 'provenance' from public.factures where id = 'f1000000-0000-0000-0000-000000000002'),
  'herite_facture_origine',
  'l''héritage d''identité d''un avoir est explicitement tracé'
);

-- ---------------------------------------------------------------------------
-- 12-14. Immuabilité : aucune écriture directe ne réécrit un snapshot posé.
-- ---------------------------------------------------------------------------
select throws_like(
  $$update public.devis set client_snapshot = jsonb_build_object('nom_affiche', 'FALSIFIE') where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '%ne peut plus être modifiée%',
  'l''identité figée d''un devis émis ne peut pas être réécrite par UPDATE direct'
);
select throws_like(
  $$update public.factures set client_snapshot = jsonb_build_object('nom_affiche', 'FALSIFIE') where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '%ne peut plus être modifiée%',
  'l''identité figée d''une facture émise ne peut pas être réécrite par UPDATE direct'
);
select throws_like(
  $$update public.devis set client_snapshot = null where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '%ne peut plus être modifiée%',
  'l''identité figée d''un devis émis ne peut pas être effacée'
);

-- Un devis toujours brouillon (aucun snapshot posé) reste librement modifiable :
-- la garde ne doit rien verrouiller tant que le document n'a pas été émis.
insert into public.devis (
  id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'd1000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-DEV-BROUILLON', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 10, 2, 12
);
select lives_ok(
  $$update public.devis set montant_ht = 200, montant_ttc = 240 where id = 'd1000000-0000-0000-0000-000000000004'$$,
  'un devis brouillon reste librement modifiable malgré la garde d''immuabilité'
);

-- ---------------------------------------------------------------------------
-- 15-16. Étanchéité multi-tenant.
-- ---------------------------------------------------------------------------
select ok(
  public.construire_client_snapshot(
    'b3000000-0000-0000-0000-000000000001',   -- client de l'entreprise B
    'a0000000-0000-0000-0000-000000000001'    -- entreprise A
  ) is null,
  'aucune identité d''un autre tenant ne peut être capturée sur un document'
);
select ok(
  public.construire_client_snapshot(
    'a3000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001'
  ) is not null,
  'la capture fonctionne pour un client du même tenant'
);

-- ---------------------------------------------------------------------------
-- 17. Permissions : la fonction n'est pas exposée aux visiteurs anonymes.
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege(
    'anon', 'public.construire_client_snapshot(uuid, uuid, text)', 'execute'
  ),
  'anon ne peut pas exécuter construire_client_snapshot'
);

-- ---------------------------------------------------------------------------
-- 18-20. Backfill : idempotent et honnête sur la provenance.
-- ---------------------------------------------------------------------------
-- Document historique simulé : émis sans identité figée (état d'avant ce lot).
-- On désarme momentanément les gardes, comme le fait la migration elle-même,
-- pour reproduire fidèlement l'état de départ du backfill.
alter table public.devis disable trigger capturer_client_snapshot_devis;
alter table public.devis disable trigger verrou_client_snapshot_devis;
insert into public.devis (
  id, entreprise_id, numero, client_id, statut, montant_ht, montant_tva, montant_ttc
) values (
  'd1000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001',
  'SNAP-DEV-HISTO', 'a3000000-0000-0000-0000-000000000001', 'envoye', 10, 2, 12
);
alter table public.devis enable trigger capturer_client_snapshot_devis;
alter table public.devis enable trigger verrou_client_snapshot_devis;

create temporary table backfill_passes (passe int, lignes int);

do $$
declare v_lignes int;
begin
  for i in 1..2 loop
    update public.devis d
    set client_snapshot = public.construire_client_snapshot(
          d.client_id, d.entreprise_id, 'backfill_identite_actuelle'
        ) || jsonb_build_object('identite_incertaine', true),
        client_snapshot_at = now()
    where d.statut <> 'brouillon'
      and d.client_snapshot is null
      and public.construire_client_snapshot(d.client_id, d.entreprise_id) is not null;
    get diagnostics v_lignes = row_count;
    insert into backfill_passes values (i, v_lignes);
  end loop;
end;
$$;

select is(
  (select lignes from backfill_passes where passe = 1), 1,
  'le backfill rattrape le document historique au premier passage'
);
select is(
  (select lignes from backfill_passes where passe = 2), 0,
  'le backfill rejoué une seconde fois ne retouche aucune ligne'
);
select is(
  (select client_snapshot ->> 'provenance' from public.devis where id = 'd1000000-0000-0000-0000-000000000003'),
  'backfill_identite_actuelle',
  'une identité reconstituée est marquée comme telle, jamais présentée comme observée à l''émission'
);

-- ---------------------------------------------------------------------------
-- 22-26. ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-AND-CLIENT-LEGAL-FIELDS-V1
-- ---------------------------------------------------------------------------
--
-- 22-24 : vérification de l'affirmation « le snapshot sait déjà recevoir les
-- champs légaux à null ». Ces cinq clés sont dans la liste blanche de
-- construire_client_snapshot alors que quatre d'entre elles n'existent PAS
-- encore comme colonnes de public.clients. La preuve porte sur le fait que la
-- clé est bien PRÉSENTE et vaut null — et non absente, ce qui obligerait le
-- code de lecture à distinguer « champ inconnu » de « champ vide ».

select is(
  (select count(*)::integer
   from jsonb_object_keys(
     public.construire_client_snapshot(
       'a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'
     )
   ) as k
   where k in ('numero_tva', 'forme_juridique', 'nom_commercial', 'adresse_complement', 'pays')),
  5,
  'le snapshot porte déjà les cinq champs d''identité légale demandés'
);

select ok(
  (select bool_and(
     public.construire_client_snapshot(
       'a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'
     ) -> k = 'null'::jsonb)
   from unnest(array['numero_tva', 'forme_juridique', 'nom_commercial', 'adresse_complement', 'pays']) as k),
  'ces cinq champs valent null tant que les colonnes correspondantes n''existent pas'
);

select ok(
  (select bool_and(
     not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'clients' and column_name = c
     ))
   from unnest(array['numero_tva', 'forme_juridique', 'nom_commercial', 'adresse_complement', 'pays']) as c),
  'aucune de ces colonnes n''existe encore sur public.clients (partie 2 bloquée par le ledger)'
);

-- 25-26 : le journal d'audit de la surcharge d'adresse s'appuie sur
-- public.journal_activite. Sa valeur probante tient à deux propriétés, vérifiées
-- ici plutôt que supposées : il est en AJOUT SEUL pour les utilisateurs, et il
-- est cloisonné par entreprise.

select ok(
  not has_table_privilege('authenticated', 'public.journal_activite', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.journal_activite', 'DELETE'),
  'le journal d''audit est en ajout seul : un utilisateur ne peut ni réécrire ni effacer une trace'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.journal_activite'::regclass),
  'le journal d''audit est cloisonné par entreprise (RLS active)'
);

select * from finish();
rollback;
