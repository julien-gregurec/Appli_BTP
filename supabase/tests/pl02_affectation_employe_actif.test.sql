-- PL-02 : garde-fou DB trg_affectation_employe_actif (20260922000325).
-- Matrice demandée : employé actif autorisé / inactif refusé / autre
-- entreprise refusé / réactivé (redevenu actif) autorisé.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- ───────────────────────────────────────────────────────────────────────────
-- Chantier A pour porter les affectations de test.
-- ───────────────────────────────────────────────────────────────────────────

-- 1. Employé actif (a2...0002, Ouvrier A) → affectation autorisée.
select lives_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date, 7)$$,
  '1. employé actif -> affectation autorisée'
);

-- 2. Le même employé passe inactif ('sorti') → nouvelle affectation refusée.
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-000000000002';

select throws_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date + 1, 7)$$,
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '2. employé sorti -> affectation refusée'
);

-- 2b. Même refus pour les deux autres statuts inactifs possibles.
update public.employes set statut = 'suspendu' where id = 'a2000000-0000-0000-0000-000000000002';
select throws_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date + 2, 7)$$,
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '2b. employé suspendu -> affectation refusée'
);

update public.employes set statut = 'en_conge' where id = 'a2000000-0000-0000-0000-000000000002';
select throws_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date + 3, 7)$$,
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '2c. employé en_conge -> affectation refusée'
);

-- 3. Contournement direct tenté (le bug PL-02 original) : INSERT SQL brut
--    identique à celui exécuté par creerAffectationAction sans repasser par
--    le préfiltre applicatif. Doit échouer côté DB désormais, plus seulement
--    côté server action.
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-000000000002';
select throws_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, type_activite)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date + 4, 7, null, 'chantier')$$,
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '3. contournement SQL direct (bug PL-02 original) désormais bloqué au niveau DB'
);

-- 4. Autre entreprise : employé de B affecté sous entreprise_id de A → refusé
--    (l'employé n'appartient pas à cette entreprise, indépendamment de son
--    statut individuel).
select throws_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'b2000000-0000-0000-0000-000000000002', current_date + 5, 7)$$,
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '4. employé d''une autre entreprise -> affectation refusée'
);

-- 5. Réactivation : l'employé redevient actif → une nouvelle affectation est
--    de nouveau autorisée (pas de blocage permanent après le premier refus).
update public.employes set statut = 'actif' where id = 'a2000000-0000-0000-0000-000000000002';
select lives_ok(
  $$insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures)
    values ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001',
            'a2000000-0000-0000-0000-000000000002', current_date + 6, 7)$$,
  '5. employé réactivé (redevenu actif) -> affectation de nouveau autorisée'
);

-- 6. UPDATE contournement : une affectation existante (employé actif au
--    moment de l'INSERT, a2...0003 Chef équipe A) ne peut pas être détournée
--    vers un employé inactif via UPDATE employe_id direct.
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-000000000004';
select throws_ok(
  format(
    $$update public.affectations set employe_id = %L
      where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
        and employe_id = 'a2000000-0000-0000-0000-000000000002'
        and date = current_date$$,
    'a2000000-0000-0000-0000-000000000004'
  ),
  'P0001', 'AFFECTATION_EMPLOYE_INACTIF',
  '6. UPDATE employe_id vers un employé inactif -> refusé'
);

-- 7. Édition normale (heures/tâche) d'une affectation passée dont l'employé
--    est depuis devenu inactif ne doit PAS être bloquée : le trigger ne
--    porte que sur employe_id/entreprise_id (colonnes réellement listées
--    dans l'UPDATE), pas sur les autres colonnes.
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-000000000002';
-- notifications_affectations n'est pas concerné par PL-02 ; désactivé pour
-- cette seule assertion afin d'éviter une collision d'unicité propre à ce
-- test pgTAP (created_at figé pendant toute la transaction => même
-- ressource_id notifié deux fois à l'identique), sans rapport avec le
-- garde-fou testé ici.
alter table public.affectations disable trigger notifications_affectations;
select lives_ok(
  $$update public.affectations set heures = 3.5
    where entreprise_id = 'a0000000-0000-0000-0000-000000000001'
      and employe_id = 'a2000000-0000-0000-0000-000000000002'
      and date = current_date + 6$$,
  '7. édition des heures d''une affectation historique reste possible même si l''employé est depuis sorti'
);
alter table public.affectations enable trigger notifications_affectations;

select * from finish();
rollback;
