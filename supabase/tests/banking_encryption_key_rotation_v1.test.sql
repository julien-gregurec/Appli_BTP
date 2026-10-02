-- ELSATIA — Chiffrement bancaire : versionnement et rotation des clés (V1).
-- Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md.
-- Migration : 20260930000813_banking_encryption_key_rotation_v1.
--
-- Données de test uniquement : les « chiffrés » ci-dessous respectent le FORMAT (en-tête,
-- iv 12 o, tag 16 o) mais ne sont pas indéchiffrables par une vraie clé ; le déchiffrement
-- réel est qualifié par Vitest et par le test d'intégration (scripts/bank-keys).
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local elsatia.capacite_personnes_bypass = 'on';
insert into public.entreprises (id, nom, code_adhesion) values ('bc000000-0000-0000-0000-000000000001', 'BK Test', 'BKTE0001');
insert into public.employes (id, entreprise_id, prenom, nom) values
  ('bc100000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 'Test', 'Un'),
  ('bc100000-0000-0000-0000-000000000002', 'bc000000-0000-0000-0000-000000000001', 'Test', 'Deux'),
  ('bc100000-0000-0000-0000-000000000003', 'bc000000-0000-0000-0000-000000000001', 'Test', 'Trois');

create temporary table bk_c (nom text primary key, v text) on commit drop;
insert into bk_c values
  ('v1a', 'v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:VEVTVF9BQUE'),
  ('v1b', 'v1:CCCCCCCCCCCCCCCC:DDDDDDDDDDDDDDDDDDDDDD:VEVTVF9CQkI'),
  ('v2k2a', 'v2:k2:A256GCM:EEEEEEEEEEEEEEEE:FFFFFFFFFFFFFFFFFFFFFF:VEVTVF9DQ0M'),
  ('v2k2b', 'v2:k2:A256GCM:GGGGGGGGGGGGGGGG:HHHHHHHHHHHHHHHHHHHHHH:VEVTVF9ERERE'),
  ('v2k9', 'v2:k9:A256GCM:IIIIIIIIIIIIIIII:JJJJJJJJJJJJJJJJJJJJJJ:VEVTVF9FRUU'),
  ('v2k1', 'v2:k1:A256GCM:KKKKKKKKKKKKKKKK:LLLLLLLLLLLLLLLLLLLLLL:VEVTVF9GRkY');
create function pg_temp.c(p text) returns text language sql as $$ select v from bk_c where nom = p $$;

-- ── 1. Objets et droits ─────────────────────────────────────────────────────
select has_table('public', 'cles_chiffrement_bancaire', '1. registre des clés');
select has_table('public', 'journal_cles_chiffrement_bancaire', '2. journal des clés');
select has_column('public', 'coordonnees_bancaires', 'iban_hash_cle', '3. index aveugle versionné');
select ok((select relrowsecurity from pg_class where oid = 'public.cles_chiffrement_bancaire'::regclass), '4. RLS registre');
select ok((select relrowsecurity from pg_class where oid = 'public.journal_cles_chiffrement_bancaire'::regclass), '5. RLS journal');
select ok(not has_table_privilege(r, 'public.cles_chiffrement_bancaire', 'select') and not has_table_privilege(r, 'public.journal_cles_chiffrement_bancaire', 'select'),
  '6. aucun accès direct au registre / journal : ' || r) from unnest(array['anon','authenticated','service_role']) r;
select ok(not has_function_privilege(r, f, 'execute'), '7. RPC fermée à ' || r || ' : ' || f)
from unnest(array['anon','authenticated']) r
cross join unnest(array['public.cles_bancaires_etat()','public.cles_bancaires_activer(text)',
  'public.chiffres_bancaires_a_rechiffrer(text,text,text,integer)','public.chiffres_bancaires_rechiffrer_lot(text,text,jsonb)',
  'public.chiffres_bancaires_parcourir(text,integer)']) f;
select ok(has_function_privilege('service_role', 'public.chiffres_bancaires_rechiffrer_lot(text,text,jsonb)', 'execute'), '8. rechiffrement ouvert au seul service_role');
select ok(exists(select 1 from pg_trigger where tgrelid = 'public.cles_chiffrement_bancaire'::regclass and tgname = 'incident_garde_ecriture')
      and exists(select 1 from pg_trigger where tgrelid = 'public.journal_cles_chiffrement_bancaire'::regclass and tgname = 'incident_garde_ecriture'),
  '9. garde du mode sûr installée sur les nouvelles tables');

-- ── 2. Lecture d'en-tête ────────────────────────────────────────────────────
select is(public.chiffre_bancaire_cle(pg_temp.c('v1a')), 'k1', '10. v1 ⇒ k1');
select is(public.chiffre_bancaire_format(pg_temp.c('v2k2a')), 'v2', '11. format v2');
select is(public.chiffre_bancaire_cle(pg_temp.c('v2k2a')), 'k2', '12. clé v2 lue dans l''en-tête');
select is(public.chiffre_bancaire_cle('v2:k2:A128GCM:EEEEEEEEEEEEEEEE:FFFFFFFFFFFFFFFFFFFFFF:VEVT'), null, '13. algorithme inconnu ⇒ illisible');
select is(public.chiffre_bancaire_cle('v2:K2:A256GCM:EEEEEEEEEEEEEEEE:FFFFFFFFFFFFFFFFFFFFFF:VEVT'), null, '14. identifiant de clé invalide ⇒ illisible');
select is(public.chiffre_bancaire_cle('v1:AAAA:BBBB:CCCC'), null, '15. iv/tag de mauvaise taille ⇒ illisible');
select is(public.chiffre_bancaire_cle('DEMO_NON_DECHIFFRABLE_x'), null, '16. valeur de démonstration ⇒ illisible');

-- ── 3. Registre initial et enregistrement ───────────────────────────────────
select is((select statut from public.cles_chiffrement_bancaire where cle_id = 'k1'), 'active', '17. k1 historique active');
select is((select empreinte_controle from public.cles_chiffrement_bancaire where cle_id = 'k1'), null, '18. k1 : empreinte à attester');
select throws_ok($$insert into public.cles_chiffrement_bancaire (cle_id, statut, empreinte_controle) values ('k7', 'active', repeat('7', 64))$$,
  '23505', null, '19. une seule clé active');
select throws_ok($$select public.cles_bancaires_enregistrer('K2', repeat('a', 64))$$, '22023', null, '20. identifiant invalide refusé');
select throws_ok($$select public.cles_bancaires_enregistrer('k2', 'pas-une-empreinte')$$, '22023', null, '21. empreinte invalide refusée');
select is(public.cles_bancaires_enregistrer('k1', repeat('1', 64)), 'attestee', '22. attestation de k1');
select is(public.cles_bancaires_enregistrer('k1', repeat('1', 64)), 'identique', '23. ré-attestation identique idempotente');
select throws_ok($$select public.cles_bancaires_enregistrer('k1', repeat('f', 64))$$, '22023', null, '24. autre clé présentée sous k1 : refus (mauvaise clé)');
select is(public.cles_bancaires_enregistrer('k2', repeat('2', 64)), 'enregistree', '25. k2 enregistrée');
select is((select statut from public.cles_chiffrement_bancaire where cle_id = 'k2'), 'preparee', '26. k2 préparée, pas encore active');
select throws_ok($$select public.cles_bancaires_enregistrer('k3', repeat('2', 64))$$, '23505', null, '27. même empreinte sous deux identifiants refusée');

-- ── 4. Garde d'écriture ─────────────────────────────────────────────────────
select lives_ok($$insert into public.coordonnees_bancaires (id, entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers)
  values ('bc200000-0000-0000-0000-000000000001', 'bc000000-0000-0000-0000-000000000001', 'employe', 'bc100000-0000-0000-0000-000000000001', 'Test Un', pg_temp.c('v1a'), repeat('a', 64), '0001')$$,
  '28. écriture v1 (k1 active) acceptée');
select is((select iban_hash_cle from public.coordonnees_bancaires where id = 'bc200000-0000-0000-0000-000000000001'), null, '29. v1 ⇒ index historique (iban_hash_cle NULL)');
select lives_ok($$insert into public.coordonnees_bancaires (id, entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers, bic_chiffre)
  values ('bc200000-0000-0000-0000-000000000002', 'bc000000-0000-0000-0000-000000000001', 'employe', 'bc100000-0000-0000-0000-000000000002', 'Test Deux', pg_temp.c('v2k2a'), repeat('b', 64), '0002', pg_temp.c('v1b'))$$,
  '30. écriture sous k2 préparée acceptée (déploiement en cours)');
select is((select iban_hash_cle from public.coordonnees_bancaires where id = 'bc200000-0000-0000-0000-000000000002'), 'k2', '31. v2 ⇒ iban_hash_cle déduit du chiffré');
select throws_ok($$insert into public.coordonnees_bancaires (entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers)
  values ('bc000000-0000-0000-0000-000000000001', 'employe', 'bc100000-0000-0000-0000-000000000003', 'Test Trois', pg_temp.c('v2k9'), repeat('c', 64), '0003')$$,
  '22023', null, '32. clé non enregistrée refusée');
select throws_ok($$update public.coordonnees_bancaires set bic_chiffre = pg_temp.c('v2k9') where id = 'bc200000-0000-0000-0000-000000000002'$$,
  '22023', null, '33. BIC sous clé inconnue refusé');
select lives_ok($$insert into public.coordonnees_bancaires (id, entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers)
  values ('bc200000-0000-0000-0000-000000000003', 'bc000000-0000-0000-0000-000000000001', 'employe', 'bc100000-0000-0000-0000-000000000003', 'Démo', 'DEMO_NON_DECHIFFRABLE_' || repeat('d', 30), repeat('d', 64), '0003')$$,
  '34. valeur de démonstration tolérée (inventoriée « illisible »)');
select throws_ok($$update public.coordonnees_bancaires set iban_chiffre = pg_temp.c('v2k2b') where id = 'bc200000-0000-0000-0000-000000000001'$$,
  '22023', null, '35. changement de clé sans recalcul de l''index aveugle refusé');
select lives_ok($$update public.coordonnees_bancaires set actif = actif, verification_statut = 'verifie' where id = 'bc200000-0000-0000-0000-000000000001'$$,
  '36. mise à jour métier sans toucher au chiffré inchangée');

-- ── 5. Inventaire ───────────────────────────────────────────────────────────
select is((select sum(nombre)::int from public.cles_bancaires_inventaire() where cle_id = 'k1'), 2, '37. inventaire k1 = IBAN v1 + BIC v1');
select is((select sum(nombre)::int from public.cles_bancaires_inventaire() where cle_id = 'k2'), 1, '38. inventaire k2 = 1');
select is((select sum(nombre)::int from public.cles_bancaires_inventaire() where format = 'illisible'), 1, '39. inventaire illisible = 1');
select is((public.cles_bancaires_etat()->>'active'), 'k1', '40. état : active k1');

-- ── 6. Activation (rotation K1 → K2) ────────────────────────────────────────
select throws_ok($$select * from public.chiffres_bancaires_a_rechiffrer('k2', 'v2', null, 10)$$, '22023', null, '41. lister vers une clé non active refusé');
select is(public.cles_bancaires_activer('k2'), 'activee', '42. activation de k2');
select is((select statut from public.cles_chiffrement_bancaire where cle_id = 'k1'), 'dechiffrement', '43. k1 passe en déchiffrement seul');
select is((select count(*)::int from public.cles_chiffrement_bancaire where statut = 'active'), 1, '44. toujours une seule active');
select is((select count(*)::int from public.chiffres_bancaires_a_rechiffrer('k2', 'v2', null, 100)), 2, '45. restent 2 valeurs sous k1 (illisible exclu)');
select is((select count(*)::int from public.chiffres_bancaires_a_rechiffrer('k2', 'v2', 'coordonnees_bancaires/bc200000-0000-0000-0000-000000000001/iban_chiffre', 100)), 1,
  '46. curseur : reprise après la dernière valeur traitée');
select throws_ok($$select public.chiffres_bancaires_rechiffrer_lot('k2', 'v2', jsonb_build_array(jsonb_build_object('ressource','coordonnees_bancaires','id','bc200000-0000-0000-0000-000000000001','colonne','iban_chiffre','ancien',pg_temp.c('v1a'),'nouveau',pg_temp.c('v1b'),'iban_hash',repeat('e',64))))$$,
  '22023', null, '47. nouvelle valeur hors cible refusée');
select throws_ok($$select public.chiffres_bancaires_rechiffrer_lot('k2', 'v2', jsonb_build_array(jsonb_build_object('ressource','coordonnees_bancaires','id','bc200000-0000-0000-0000-000000000001','colonne','iban_chiffre','ancien',pg_temp.c('v1a'),'nouveau',pg_temp.c('v2k2b'))))$$,
  '22023', null, '48. index aveugle obligatoire pour l''IBAN');
select is(public.chiffres_bancaires_rechiffrer_lot('k2', 'v2', jsonb_build_array(jsonb_build_object('ressource','coordonnees_bancaires','id','bc200000-0000-0000-0000-000000000001','colonne','iban_chiffre','ancien',pg_temp.c('v2k1'),'nouveau',pg_temp.c('v2k2b'),'iban_hash',repeat('e',64)))),
  '{"conflits": 1, "rechiffres": 0}'::jsonb, '49. compare-and-swap : ancienne valeur périmée ⇒ conflit, rien écrit');
select is(public.chiffres_bancaires_rechiffrer_lot('k2', 'v2', jsonb_build_array(
    jsonb_build_object('ressource','coordonnees_bancaires','id','bc200000-0000-0000-0000-000000000001','colonne','iban_chiffre','ancien',pg_temp.c('v1a'),'nouveau',pg_temp.c('v2k2b'),'iban_hash',repeat('e',64)),
    jsonb_build_object('ressource','coordonnees_bancaires','id','bc200000-0000-0000-0000-000000000002','colonne','bic_chiffre','ancien',pg_temp.c('v1b'),'nouveau',pg_temp.c('v2k2a')))),
  '{"conflits": 0, "rechiffres": 2}'::jsonb, '50. lot appliqué');
select is((select iban_hash_cle || ':' || iban_hash from public.coordonnees_bancaires where id = 'bc200000-0000-0000-0000-000000000001'), 'k2:' || repeat('e', 64), '51. index aveugle recalculé sous k2');
select is((select count(*)::int from public.chiffres_bancaires_a_rechiffrer('k2', 'v2', null, 100)), 0, '52. plus rien sous k1');

-- ── 7. Compromission, retrait, retour arrière ───────────────────────────────
select throws_ok($$select public.cles_bancaires_compromettre('k2', 'test')$$, '22023', null, '53. la clé active ne peut être déclarée compromise');
select is(public.cles_bancaires_compromettre('k1', 'Exercice de compromission (test)'), 'compromise', '54. k1 déclarée compromise');
select throws_ok($$update public.coordonnees_bancaires set bic_chiffre = pg_temp.c('v1b') where id = 'bc200000-0000-0000-0000-000000000002'$$,
  '22023', null, '55. plus aucune écriture sous la clé compromise');
select throws_ok($$select public.cles_bancaires_activer('k1')$$, '22023', null, '56. une clé compromise ne peut être réactivée');
select is(public.cles_bancaires_retirer('k1'), 'retiree', '57. retrait de k1 (0 donnée restante)');
select is(public.cles_bancaires_enregistrer('k3', repeat('3', 64)), 'enregistree', '58. k3 enregistrée');
select is(public.cles_bancaires_activer('k3'), 'activee', '59. k2 → k3');
select throws_ok($$select public.cles_bancaires_retirer('k2')$$, '22023', null, '60. retrait refusé tant que des données restent sous k2');
select is(public.cles_bancaires_activer('k2'), 'activee', '61. retour arrière : k2 (déchiffrement) réactivable');

-- ── 8. Journal ──────────────────────────────────────────────────────────────
select ok((select count(*) from public.journal_cles_chiffrement_bancaire where action = 'rechiffrement_lot') >= 2, '62. chaque lot est journalisé');
select ok(not exists(select 1 from public.journal_cles_chiffrement_bancaire where details::text ~ '(v1:|v2:|A256GCM:)'), '63. le journal ne contient aucun chiffré');
select throws_ok($$delete from public.journal_cles_chiffrement_bancaire$$, '42501', null, '64. journal en ajout seul');

select * from finish();
rollback;
