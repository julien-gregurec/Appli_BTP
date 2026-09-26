-- GP-V1-NUMEROTATION-DOCUMENTS : régression pour le correctif réel du
-- débordement de numérotation (migration 20260922000317).
--
-- Contexte : docs/qualification/ELSATIA_GP_NUMBERING_OVERFLOW_FIX_V1.md.
-- `public.next_reference()` formatait le compteur avec
-- `lpad(v_numero::text, p_largeur, '0')`, qui TRONQUE au lieu d'élargir une
-- fois le compteur >= 10^p_largeur — provoquant des doublons de `numero`
-- (`devis`/`factures`/`commandes_fournisseurs`, largeur 3) dès 1000 documents
-- cumulés pour une entreprise. Une migration antérieure
-- (20260921000299) avait corrigé une fonction homonyme jamais appelée
-- (`formater_numero_document`) sans toucher au vrai chemin de code — ce
-- fichier teste la fonction réellement invoquée par tous les triggers de
-- numérotation.
--
-- Note technique : `compteurs_reference` n'a pas de ligne pré-existante pour
-- la plupart des (entreprise_id, type) testés ici — on la seed avec le même
-- motif upsert que `next_reference()` lui-même (`INSERT ... ON CONFLICT DO
-- UPDATE`), jamais un simple `UPDATE` qui serait un no-op silencieux sur une
-- ligne absente.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\ir fixtures/isolation_multitenant.inc

-- ---------------------------------------------------------------------------
-- 1. next_reference() — frontières directes (largeur 3, type dédié au test)
-- ---------------------------------------------------------------------------
insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 0)
on conflict (entreprise_id, type) do update set dernier_numero = 0;

select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-001',
  '1 -> 001 (sous le seuil, comportement inchangé)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 8)
on conflict (entreprise_id, type) do update set dernier_numero = 8;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-009',
  '9 -> 009 (sous le seuil, comportement inchangé)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 98)
on conflict (entreprise_id, type) do update set dernier_numero = 98;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-099',
  '99 -> 099 (sous le seuil, comportement inchangé)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 998)
on conflict (entreprise_id, type) do update set dernier_numero = 998;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-999',
  '999 -> 999 (dernière valeur tenant exactement dans la largeur 3, comportement inchangé)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 999)
on conflict (entreprise_id, type) do update set dernier_numero = 999;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-1000',
  '1000 -> 1000, PAS 100 (c''est le correctif : la largeur est un plancher, plus jamais un plafond)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 1000)
on conflict (entreprise_id, type) do update set dernier_numero = 1000;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-1001',
  '1001 -> 1001 (élargissement automatique confirmé sur une deuxième valeur consécutive)'
);

insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 9998)
on conflict (entreprise_id, type) do update set dernier_numero = 9998;
select is(
  public.next_reference('a0000000-0000-0000-0000-000000000001', 'audit_frontiere', 'AUD', 3, false),
  'AUD-9999',
  '9999 -> 9999 (élargissement automatique confirmé à 4 chiffres)'
);

-- ---------------------------------------------------------------------------
-- 2. Devis — transition réelle brouillon -> envoye, franchissant 999
-- ---------------------------------------------------------------------------
insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'devis', 998)
on conflict (entreprise_id, type) do update set dernier_numero = 998;

insert into public.devis (id, entreprise_id, client_id, statut, date_emission) values
  ('d9990000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', current_date),
  ('d9990000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', current_date),
  ('d9990000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'brouillon', current_date);

update public.devis set statut = 'envoye' where id = 'd9990000-0000-0000-0000-000000000001';
update public.devis set statut = 'envoye' where id = 'd9990000-0000-0000-0000-000000000002';
update public.devis set statut = 'envoye' where id = 'd9990000-0000-0000-0000-000000000003';

select is(
  (select numero from public.devis where id = 'd9990000-0000-0000-0000-000000000001'),
  'DEV-' || to_char(current_date, 'YYYY') || '-999',
  'devis #999 : format inchangé'
);
select is(
  (select numero from public.devis where id = 'd9990000-0000-0000-0000-000000000002'),
  'DEV-' || to_char(current_date, 'YYYY') || '-1000',
  'devis #1000 : élargi, pas de troncature en 100 (c''était la collision d''origine)'
);
select is(
  (select numero from public.devis where id = 'd9990000-0000-0000-0000-000000000003'),
  'DEV-' || to_char(current_date, 'YYYY') || '-1001',
  'devis #1001 : toujours unique, aucune erreur 23505'
);

-- ---------------------------------------------------------------------------
-- 3. Factures — même franchissement, + avoir qui partage la même série (hors
--    périmètre de correction, comportement volontairement inchangé et revérifié)
-- ---------------------------------------------------------------------------
insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'facture', 998)
on conflict (entreprise_id, type) do update set dernier_numero = 998;

insert into public.factures (id, entreprise_id, client_id, type, statut, date_emission, date_echeance) values
  ('f9990000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'simple', 'brouillon', current_date, current_date + 30),
  ('f9990000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'simple', 'brouillon', current_date, current_date + 30),
  ('f9990000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', 'avoir', 'brouillon', current_date, current_date + 30);

update public.factures set statut = 'envoyee' where id = 'f9990000-0000-0000-0000-000000000001';
update public.factures set statut = 'envoyee' where id = 'f9990000-0000-0000-0000-000000000002';
update public.factures set statut = 'envoyee' where id = 'f9990000-0000-0000-0000-000000000003';

select is(
  (select numero from public.factures where id = 'f9990000-0000-0000-0000-000000000001'),
  'FAC-' || to_char(current_date, 'YYYY') || '-999',
  'facture #999 : format inchangé'
);
select is(
  (select numero from public.factures where id = 'f9990000-0000-0000-0000-000000000002'),
  'FAC-' || to_char(current_date, 'YYYY') || '-1000',
  'facture #1000 : élargie, pas de troncature en 100'
);
select is(
  (select numero from public.factures where id = 'f9990000-0000-0000-0000-000000000003'),
  'FAC-' || to_char(current_date, 'YYYY') || '-1001',
  'avoir #1001 : partage toujours la même série FAC- que les factures (hors périmètre, comportement volontairement inchangé), et bénéficie du même correctif de troncature'
);

-- ---------------------------------------------------------------------------
-- 4. Commandes fournisseurs — même fonction, largeur 3, numéro assigné à
--    l'INSERT (pas à une transition de statut)
-- ---------------------------------------------------------------------------
insert into public.compteurs_reference (entreprise_id, type, dernier_numero)
values ('a0000000-0000-0000-0000-000000000001', 'commande-' || to_char(current_date, 'YYYY'), 998)
on conflict (entreprise_id, type) do update set dernier_numero = 998;

insert into public.commandes_fournisseurs (id, entreprise_id, fournisseur_id, montant_ht, montant_tva, montant_ttc, date_commande) values
  ('c9990000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 10, 2, 12, current_date),
  ('c9990000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'ab000000-0000-0000-0000-000000000001', 10, 2, 12, current_date);

select is(
  (select numero from public.commandes_fournisseurs where id = 'c9990000-0000-0000-0000-000000000001'),
  'CMD-' || to_char(current_date, 'YYYY') || '-999',
  'commande #999 : format inchangé'
);
select is(
  (select numero from public.commandes_fournisseurs where id = 'c9990000-0000-0000-0000-000000000002'),
  'CMD-' || to_char(current_date, 'YYYY') || '-1000',
  'commande #1000 : élargie, pas de troncature en 100 (même fonction, même largeur 3, chemin distinct de devis/factures)'
);

select * from finish();
rollback;
