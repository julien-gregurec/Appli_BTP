-- ELSATIA-EXTERNAL-PILOT-FULL-REHEARSAL-V2 — vérifie le correctif RLS
-- 20260922000323_securiser_taux_horaire_facture_employe.sql : employes.taux_horaire
-- était lisible par n'importe quel salarié authentifié (seule policy RLS :
-- "membres accedent aux employes", basée uniquement sur est_membre_actif),
-- reproduisant, pour le taux facturé, exactement le défaut déjà corrigé pour
-- le coût interne par 20260818000205_securiser_cout_horaire_employe.sql.
-- Reproduit par exécution réelle lors de cette mission avant correctif
-- (`select taux_horaire from employes ...` sous le rôle d'un ouvrier renvoyait
-- la valeur d'un collègue).
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/isolation_multitenant.inc

-- Décor : un taux facturé non nul sur l'ouvrier A, comme le ferait
-- modifierEmployeAction pour un salarié dont le poste a le droit
-- voir_taux_facture_employe.
insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire)
values ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 55.00)
on conflict (employe_id) do update set taux_horaire = excluded.taux_horaire;

-- La colonne n'existe plus du tout sur employes (déplacée).
select hasnt_column('public', 'employes', 'taux_horaire', 'taux_horaire ne vit plus sur employes');
select has_table('public', 'employes_taux_facture', 'la table dédiée existe');

set local role authenticated;

-- Administrateur A a voir_taux_facture_employe dans le fixture partagé : il
-- doit voir la valeur.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select taux_horaire from public.employes_taux_facture where employe_id = 'a2000000-0000-0000-0000-000000000002'),
  55.00,
  'un poste autorisé (voir_taux_facture_employe) voit le taux facturé du collègue'
);

-- Ouvrier A n'a pas voir_taux_facture_employe (catalogue canonique) : la
-- policy RESTRICTIVE doit masquer la ligne entièrement, pas juste dans l'UI.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is(
  (select count(*) from public.employes_taux_facture where employe_id = 'a2000000-0000-0000-0000-000000000002'),
  0::bigint,
  'un ouvrier sans voir_taux_facture_employe ne voit AUCUNE ligne (pas seulement une valeur nulle)'
);

-- Isolation multi-entreprise : admin A ne voit jamais le taux d'un salarié B.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select is(
  (select count(*) from public.employes_taux_facture where employe_id = 'b2000000-0000-0000-0000-000000000001'),
  0::bigint,
  'admin A ne voit aucune ligne employes_taux_facture de l''entreprise B'
);

-- L'écriture directe reste ouverte à tout membre actif (contrôle fin fait par
-- le Server Action, même schéma que employes_cout_horaire) : un ouvrier peut
-- upsert sa propre ligne sans que ça constitue une régression de sécurité
-- nouvelle (déjà le cas pour employes_cout_horaire).
select lives_ok(
  $$insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire)
    values ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 60)
    on conflict (employe_id) do update set taux_horaire = excluded.taux_horaire$$,
  'un membre actif peut écrire (contrôle fin délégué au Server Action, comme employes_cout_horaire)'
);

reset role;
select * from finish();
rollback;
