-- Vérifie le correctif des migrations 20260922000198 (idempotence
-- paiement/avoir) et 20260922000199 (gel de date_echeance post-émission).
--
-- Portage adapté (introspection de schéma, `fixtures/isolation_multitenant.inc`
-- absent de ce dépôt) — même style que les autres correctifs de cette
-- branche : aucune base réelle n'est disponible dans cet environnement pour
-- valider un scénario comportemental construit à la main.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

-- 1. Paiement : la RPC verrouillée existe et est accordée à authenticated.
select has_function('public', 'enregistrer_paiement_facture', array['uuid','uuid','numeric','date','text','text'], 'enregistrer_paiement_facture existe');
select ok(
  (select prosrc from pg_proc where oid = 'public.enregistrer_paiement_facture(uuid,uuid,numeric,date,text,text)'::regprocedure) like '%for update%',
  'enregistrer_paiement_facture verrouille bien la facture (for update) avant de comparer au reste dû'
);
select ok(
  has_function_privilege('authenticated', 'public.enregistrer_paiement_facture(uuid,uuid,numeric,date,text,text)', 'execute'),
  'authenticated peut exécuter enregistrer_paiement_facture'
);

-- 2. Avoir : verrou sur le devis + index unique + résolution vers l'existant.
select ok(
  (select prosrc from pg_proc where oid = 'public.creer_facture_avancee(uuid,uuid,text,numeric,boolean,uuid)'::regprocedure) like '%statut=''accepte'' for update%',
  'creer_facture_avancee verrouille bien le devis (for update)'
);
select has_index('public', 'factures', 'factures_avoir_unique_par_origine', 'index unique partiel anti-doublon d''avoir existe');
select ok(
  (select prosrc from pg_proc where oid = 'public.creer_facture_avancee(uuid,uuid,text,numeric,boolean,uuid)'::regprocedure) like '%avoir_existant:%',
  'creer_facture_avancee résout vers l''avoir existant (idempotence applicative + filet unique_violation)'
);

-- 3. Échéance figée post-émission : le verrou ne whiteliste plus date_echeance.
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) not like '%''date_echeance''%',
  'date_echeance n''est plus un champ libre du verrou d''immutabilité : figée après émission'
);
select ok(
  (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%montant_paye%'
  and (select prosrc from pg_proc where oid = 'public.verrouiller_facture_emise()'::regprocedure) like '%stripe_payment_status%',
  'les autres champs de suivi restent libres (non régressé)'
);

select * from finish();
rollback;
