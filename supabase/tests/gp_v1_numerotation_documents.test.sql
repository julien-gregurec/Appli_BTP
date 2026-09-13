-- =====================================================================================================
-- PREUVE pgTAP — GP V1, numérotation des documents configurable (migration 20260913000294).
-- Entreprise A : format par défaut (DEV-AAAA-001) ; entreprise B : sans préfixe ni année (00125) ;
-- unicité et continuité des compteurs ; avoirs sur la séquence des factures sauf réglage propre.
-- =====================================================================================================
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.jwt(p_sub uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
end $$;

select has_table('public', 'numerotation_documents', 'table des formats de numérotation');
select is((select prefixe from public.numerotation_document_defaut('devis')), 'DEV', 'défaut devis : préfixe DEV');
select is(public.formater_numero_document('DEV', true, false, '-', 3, 125, date '2026-09-13'), 'DEV-2026-125', 'format complet');
select is(public.formater_numero_document('', false, false, '-', 5, 125, date '2026-09-13'), '00125', 'sans préfixe ni année : compteur seul');
select is(public.formater_numero_document('F', true, true, '/', 4, 7, date '2026-09-13'), 'F/2026/09/0007', 'année + mois + séparateur /');
select is(public.formater_numero_document('', true, false, '', 3, 7, date '2026-09-13'), '2026007', 'sans séparateur');

-- Entreprise B : sans préfixe, sans année, 5 chiffres.
insert into public.numerotation_documents (entreprise_id, type_document, prefixe, avec_annee, avec_mois, separateur, largeur, compteur_annuel)
values ('b0000000-0000-0000-0000-000000000001', 'devis', '', false, false, '-', 5, false);

-- Devis A (défaut) et B (sans préfixe) : numéro à la sortie du brouillon, jamais avant.
insert into public.devis (id, entreprise_id, client_id, statut, montant_ht, montant_tva, montant_ttc)
values ('a9000000-0000-0000-0000-000000000294', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 0, 0, 0),
       ('a9000000-0000-0000-0000-000000000295', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', 0, 0, 0),
       ('b9000000-0000-0000-0000-000000000294', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'brouillon', 0, 0, 0),
       ('b9000000-0000-0000-0000-000000000295', 'b0000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000001', 'brouillon', 0, 0, 0);
select is((select numero from public.devis where id = 'a9000000-0000-0000-0000-000000000294'), null, 'brouillon A : aucun numéro');
update public.devis set statut = 'envoye' where id in ('a9000000-0000-0000-0000-000000000294', 'a9000000-0000-0000-0000-000000000295');
update public.devis set statut = 'envoye' where id in ('b9000000-0000-0000-0000-000000000294', 'b9000000-0000-0000-0000-000000000295');
select matches((select numero from public.devis where id = 'a9000000-0000-0000-0000-000000000294'), '^DEV-[0-9]{4}-[0-9]{3}$', 'A : format historique DEV-AAAA-NNN');
select matches((select numero from public.devis where id = 'b9000000-0000-0000-0000-000000000294'), '^[0-9]{5}$', 'B : compteur seul sur 5 chiffres');
select isnt((select numero from public.devis where id = 'a9000000-0000-0000-0000-000000000294'), (select numero from public.devis where id = 'a9000000-0000-0000-0000-000000000295'), 'A : deux devis, deux numéros');
select isnt((select numero from public.devis where id = 'b9000000-0000-0000-0000-000000000294'), (select numero from public.devis where id = 'b9000000-0000-0000-0000-000000000295'), 'B : deux devis, deux numéros');
select is((select count(distinct numero)::int from public.devis where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and numero is not null),
          (select count(*)::int from public.devis where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and numero is not null), 'B : tous les numéros distincts');
-- Continuité : le compteur de A reste celui de « devis » : deux numéros consécutifs, aucun trou.
select is((select right(numero, 3)::int from public.devis where id = 'a9000000-0000-0000-0000-000000000295'),
          (select right(numero, 3)::int from public.devis where id = 'a9000000-0000-0000-0000-000000000294') + 1, 'A : numéros consécutifs sur le compteur « devis »');
select is((select c.dernier_numero from public.compteurs_reference c where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001' and c.type = 'devis'),
          (select right(numero, 3)::int from public.devis where id = 'a9000000-0000-0000-0000-000000000295'), 'A : compteur = dernier numéro attribué');
-- Unicité : impossible d'insérer un doublon (contrainte unique (entreprise_id, numero)).
select throws_ok($$insert into public.devis (id, entreprise_id, client_id, statut, numero, montant_ht, montant_tva, montant_ttc)
  values ('a9000000-0000-0000-0000-000000000296', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', (select numero from public.devis where id = 'a9000000-0000-0000-0000-000000000294'), 0, 0, 0)$$,
  '23505', null, 'A : un numéro ne peut pas être dupliqué');

-- Aperçu du prochain numéro : sans incrément, réservé aux membres.
select pg_temp.jwt('20000000-0000-0000-0000-000000000006');
select is(public.numero_document_apercu('b0000000-0000-0000-0000-000000000001', 'devis'), lpad(((select dernier_numero from public.compteurs_reference where entreprise_id = 'b0000000-0000-0000-0000-000000000001' and type = 'devis') + 1)::text, 5, '0'), 'B : aperçu = compteur + 1');
select is(public.numero_document_apercu('b0000000-0000-0000-0000-000000000001', 'devis'), public.numero_document_apercu('b0000000-0000-0000-0000-000000000001', 'devis'), 'l''aperçu ne consomme rien');
select throws_ok($$select public.numero_document_apercu('a0000000-0000-0000-0000-000000000001', 'devis')$$, '42501', null, 'B ne voit pas le prochain numéro de A');
reset role;
select set_config('request.jwt.claims', '', true);

-- Avoirs : sans réglage propre, sur la séquence des factures (FAC) ; avec réglage, séquence dédiée.
insert into public.factures (id, entreprise_id, client_id, type, statut, montant_ht, montant_tva, montant_ttc)
values ('af000000-0000-0000-0000-000000000294', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'simple', 'brouillon', 0, 0, 0),
       ('af000000-0000-0000-0000-000000000295', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'avoir', 'brouillon', 0, 0, 0);
update public.factures set statut = 'envoyee' where id = 'af000000-0000-0000-0000-000000000294';
update public.factures set statut = 'envoyee' where id = 'af000000-0000-0000-0000-000000000295';
select matches((select numero from public.factures where id = 'af000000-0000-0000-0000-000000000294'), '^FAC-[0-9]{4}-[0-9]{3}$', 'facture A : FAC-AAAA-NNN');
select matches((select numero from public.factures where id = 'af000000-0000-0000-0000-000000000295'), '^FAC-[0-9]{4}-[0-9]{3}$', 'avoir A sans réglage : même séquence FAC');
insert into public.numerotation_documents (entreprise_id, type_document, prefixe, avec_annee, avec_mois, separateur, largeur, compteur_annuel)
values ('a0000000-0000-0000-0000-000000000001', 'avoir', 'AV', true, false, '-', 4, true);
insert into public.factures (id, entreprise_id, client_id, type, statut, montant_ht, montant_tva, montant_ttc)
values ('af000000-0000-0000-0000-000000000296', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'avoir', 'brouillon', 0, 0, 0);
update public.factures set statut = 'envoyee' where id = 'af000000-0000-0000-0000-000000000296';
select is((select numero from public.factures where id = 'af000000-0000-0000-0000-000000000296'), 'AV-' || to_char(current_date, 'YYYY') || '-0001', 'avoir A avec réglage : AV-AAAA-0001, compteur annuel dédié');

-- Réglage invalide refusé par la base.
select throws_ok($$insert into public.numerotation_documents (entreprise_id, type_document, prefixe) values ('a0000000-0000-0000-0000-000000000001', 'devis', 'dev-x')$$, '23514', null, 'préfixe : majuscules et chiffres seulement');
select throws_ok($$insert into public.numerotation_documents (entreprise_id, type_document, avec_annee, compteur_annuel) values ('a0000000-0000-0000-0000-000000000001', 'devis', false, true)$$, '23514', null, 'compteur annuel sans année : refusé');
select is(has_function_privilege('anon', 'public.numero_document_suivant(uuid, text, date)', 'execute'), false, 'attribution réservée aux déclencheurs');
select is(has_function_privilege('authenticated', 'public.numero_document_suivant(uuid, text, date)', 'execute'), false, 'attribution non exposée à authenticated');

select * from finish();
rollback;
