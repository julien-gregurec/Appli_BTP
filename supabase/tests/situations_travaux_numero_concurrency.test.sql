-- Regression pour le correctif de concurrence sur public.situations_travaux.numero
-- (migration 20260729000184_verrou_numero_situation_travaux.sql).
--
-- IMPORTANT - portee de ce test pgTAP : pgTAP s'execute dans UNE SEULE
-- transaction (begin ... rollback), donc une seule session PostgreSQL. Il ne
-- peut PAS produire de veritable concurrence entre deux transactions (un
-- verrou "for update" ne bloquerait jamais un appelant dans la meme
-- transaction). Ce fichier verifie donc ce qui est deterministe et
-- verifiable en une seule session :
--   - la fonction conserve sa signature/type de retour (contrat inchange) ;
--   - le verrou de ligne (for update) sur le devis est bien present dans le
--     corps de la fonction, avant le calcul du numero (preuve structurelle
--     que le correctif est en place) ;
--   - la contrainte unique(entreprise_id,devis_id,numero) est toujours la ;
--   - la numerotation reste sequentielle (1,2,3,...) pour un meme devis ;
--   - deux devis differents, ou deux entreprises differentes, demarrent
--     chacun leur propre numerotation a 1 (isolation du scope).
--
-- La preuve de la CONCURRENCE REELLE (plusieurs sessions PostgreSQL
-- distinctes, veritablement simultanees) est apportee separement par
-- scripts/concurrency-situations-travaux.sh, qui lance de vrais processus
-- psql concurrents contre une base locale jetable. Voir ce script pour :
--   - 2 sessions concurrentes, meme entreprise+devis -> 2 succes, numeros
--     consecutifs, aucune erreur 23505 ;
--   - 5 sessions concurrentes, meme devis -> aucune 23505/deadlock/timeout ;
--   - devis differents / entreprises differentes -> aucun blocage croise ;
--   - un scenario a chevauchement force (pg_sleep apres l'acquisition du
--     verrou) prouvant que la seconde session attend bien le verrou au lieu
--     de calculer le meme numero.

begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

-- 1. Contrat de la fonction inchange (signature, type de retour).
select has_function(
  'public', 'creer_situation_travaux',
  array['uuid','uuid','numeric','numeric','text'],
  'creer_situation_travaux conserve sa signature (5 parametres)'
);
select function_returns(
  'public', 'creer_situation_travaux',
  array['uuid','uuid','numeric','numeric','text'],
  'uuid',
  'creer_situation_travaux retourne toujours uuid'
);

-- 2. Preuve structurelle du correctif : verrou de ligne sur le devis, avant
--    le calcul de coalesce(max(numero),0)+1, avec verification d'appartenance
--    entreprise_id+devis_id.
select ok(
  (select pg_get_functiondef('public.creer_situation_travaux(uuid,uuid,numeric,numeric,text)'::regprocedure))
    ~* 'from public\.devis where id=p_devis_id and entreprise_id=p_entreprise_id for update',
  'creer_situation_travaux verrouille (for update) le devis id+entreprise_id avant de calculer numero'
);
select ok(
  position(
    'for update' in (select pg_get_functiondef('public.creer_situation_travaux(uuid,uuid,numeric,numeric,text)'::regprocedure))
  ) <
  position(
    'coalesce(max(numero)' in lower((select pg_get_functiondef('public.creer_situation_travaux(uuid,uuid,numeric,numeric,text)'::regprocedure)))
  ),
  'le verrou for update precede bien le calcul de coalesce(max(numero),0)+1 dans le corps de la fonction'
);

-- 3. La contrainte d'integrite de dernier recours reste en place.
select col_is_unique(
  'public', 'situations_travaux', array['entreprise_id','devis_id','numero'],
  'unique(entreprise_id,devis_id,numero) est toujours presente sur situations_travaux'
);

-- 4. Jeu de donnees minimal pour exercer la fonction reelle en une session.
insert into auth.users(id) values
  ('99990001-0000-0000-0000-000000000001'),
  ('99990002-0000-0000-0000-000000000002');
insert into public.entreprises(id, nom, abonnement_statut) values
  ('99991111-0000-0000-0000-000000000001','pgTAP Ent A','essai'),
  ('99992222-0000-0000-0000-000000000002','pgTAP Ent B','essai');
insert into public.postes(id, entreprise_id, nom) values
  ('99993331-0000-0000-0000-000000000001','99991111-0000-0000-0000-000000000001','Gerant'),
  ('99993332-0000-0000-0000-000000000002','99992222-0000-0000-0000-000000000002','Gerant');
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise) values
  ('99991111-0000-0000-0000-000000000001','99993331-0000-0000-0000-000000000001','gerer_facturation_avancee', true),
  ('99992222-0000-0000-0000-000000000002','99993332-0000-0000-0000-000000000002','gerer_facturation_avancee', true);
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id, statut) values
  ('99990001-0000-0000-0000-000000000001','99991111-0000-0000-0000-000000000001','99993331-0000-0000-0000-000000000001','actif'),
  ('99990002-0000-0000-0000-000000000002','99992222-0000-0000-0000-000000000002','99993332-0000-0000-0000-000000000002','actif');
insert into public.clients(id, entreprise_id, nom) values
  ('99994441-0000-0000-0000-000000000001','99991111-0000-0000-0000-000000000001','pgTAP Client A'),
  ('99994442-0000-0000-0000-000000000002','99992222-0000-0000-0000-000000000002','pgTAP Client B');
insert into public.chantiers(id, entreprise_id, client_id, nom) values
  ('99995551-0000-0000-0000-000000000001','99991111-0000-0000-0000-000000000001','99994441-0000-0000-0000-000000000001','pgTAP Chantier A'),
  ('99995552-0000-0000-0000-000000000002','99992222-0000-0000-0000-000000000002','99994442-0000-0000-0000-000000000002','pgTAP Chantier B');
insert into public.devis(id, entreprise_id, numero, client_id, chantier_id, statut, montant_ht) values
  ('99996661-0000-0000-0000-000000000001','99991111-0000-0000-0000-000000000001','PGTAP-A-1','99994441-0000-0000-0000-000000000001','99995551-0000-0000-0000-000000000001','accepte',100000),
  ('99996662-0000-0000-0000-000000000002','99991111-0000-0000-0000-000000000001','PGTAP-A-2','99994441-0000-0000-0000-000000000001','99995551-0000-0000-0000-000000000001','accepte',100000),
  ('99996663-0000-0000-0000-000000000003','99992222-0000-0000-0000-000000000002','PGTAP-B-1','99994442-0000-0000-0000-000000000002','99995552-0000-0000-0000-000000000002','accepte',100000);
insert into public.lignes_devis(devis_id, designation, quantite, prix_unitaire_ht, remise_ligne) values
  ('99996661-0000-0000-0000-000000000001','Lot',1,100000,0),
  ('99996662-0000-0000-0000-000000000002','Lot',1,100000,0),
  ('99996663-0000-0000-0000-000000000003','Lot',1,100000,0);

set local request.jwt.claim.sub = '99990001-0000-0000-0000-000000000001';

create temp table pgtap_ids(cle text primary key, id uuid);
insert into pgtap_ids values
  ('a1', public.creer_situation_travaux('99991111-0000-0000-0000-000000000001','99996661-0000-0000-0000-000000000001',10,0,'seq-1')),
  ('a2', public.creer_situation_travaux('99991111-0000-0000-0000-000000000001','99996661-0000-0000-0000-000000000001',20,0,'seq-2')),
  ('a3', public.creer_situation_travaux('99991111-0000-0000-0000-000000000001','99996661-0000-0000-0000-000000000001',30,0,'seq-3'));

-- 5. Numerotation sequentielle pour un meme devis (appels successifs).
select is((select numero from public.situations_travaux where id=(select id from pgtap_ids where cle='a1')), 1, 'premiere situation du devis A1 -> numero 1');
select is((select numero from public.situations_travaux where id=(select id from pgtap_ids where cle='a2')), 2, 'deuxieme situation du devis A1 -> numero 2');
select is((select numero from public.situations_travaux where id=(select id from pgtap_ids where cle='a3')), 3, 'troisieme situation du devis A1 -> numero 3');

-- 6. Isolation entre devis : un second devis de la meme entreprise redemarre a 1.
insert into pgtap_ids values
  ('b1', public.creer_situation_travaux('99991111-0000-0000-0000-000000000001','99996662-0000-0000-0000-000000000002',15,0,'devis-b-1'));
select is((select numero from public.situations_travaux where id=(select id from pgtap_ids where cle='b1')), 1, 'un devis different redemarre la numerotation a 1 (isolation par devis_id)');

set local request.jwt.claim.sub = '99990002-0000-0000-0000-000000000002';

-- 7. Isolation entre entreprises : une autre entreprise redemarre aussi a 1.
insert into pgtap_ids values
  ('c1', public.creer_situation_travaux('99992222-0000-0000-0000-000000000002','99996663-0000-0000-0000-000000000003',15,0,'ent-b-1'));
select is((select numero from public.situations_travaux where id=(select id from pgtap_ids where cle='c1')), 1, 'une autre entreprise redemarre la numerotation a 1 (isolation par entreprise_id)');

-- 8. Absence de collision : aucun doublon (entreprise_id,devis_id,numero) sur les lignes crees par ce test.
select is(
  (select count(*) from (
    select entreprise_id, devis_id, numero, count(*) as n
    from public.situations_travaux
    where id in (select id from pgtap_ids)
    group by entreprise_id, devis_id, numero
    having count(*) > 1
  ) doublons),
  0::bigint,
  'aucun doublon (entreprise_id,devis_id,numero) parmi les situations creees par ce test'
);

-- 9. La table ne compte exactement que les lignes attendues pour ce test (pas d'effet de bord).
select is((select count(*) from public.situations_travaux where id in (select id from pgtap_ids))::int, 5, '5 situations creees au total par ce scenario deterministe');

select * from finish();
rollback;
