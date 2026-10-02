-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — les RPC qui remplacent les
-- lectures PostgREST plafonnées à 1 000 lignes (migrations 20261002001101 à
-- 20261002001104) rendent EXACTEMENT ce que les policies RLS laissaient lire,
-- pour chaque profil du jeu multitenant : même nombre de lignes, mêmes sommes,
-- mêmes jointures visibles (client, chantier, fournisseur, salarié), rien
-- d'une autre entreprise, et aucune exécution par `anon`.
--
-- Méthode : pour chaque profil, `pg_temp.mesures(e)` calcule côte à côte la
-- valeur rendue par la RPC et la même valeur lue directement dans les tables
-- sous le rôle `authenticated` (RLS actives) ; chaque paire doit être égale.
begin;
create extension if not exists pgtap with schema extensions;
select plan(237);

\ir fixtures/isolation_multitenant.inc

-- ─── Données complémentaires (superutilisateur, triggers métier neutralisés) ───
set local session_replication_role = replica;

insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, montant_ht, montant_tva, montant_ttc, montant_paye, facture_origine_id)
select ('ca' || x.t || '00000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
       x.e, 'FIN-' || x.t || '-' || i, x.c, case when i % 3 = 0 then x.ch2 when i % 3 = 1 then x.ch1 end,
       case when i % 7 = 0 then 'avoir' else 'simple' end,
       (array['envoyee', 'payee', 'payee_partiel', 'en_retard', 'annulee', 'brouillon'])[1 + i % 6],
       current_date - (i % 25), 100 + i, 20 + i / 5.0, 120 + i * 1.2, case when i % 6 = 1 then 120 + i * 1.2 when i % 6 = 2 then 30 else 0 end,
       case when i % 7 = 0 then ('ca' || x.t || '00000-0000-0000-0000-' || lpad((i - 1)::text, 12, '0'))::uuid end
from generate_series(1, 30) i
cross join (values ('a', 'a0000000-0000-0000-0000-000000000001'::uuid, 'a3000000-0000-0000-0000-000000000001'::uuid, 'a4000000-0000-0000-0000-000000000001'::uuid, 'a4000000-0000-0000-0000-000000000002'::uuid),
                   ('b', 'b0000000-0000-0000-0000-000000000001'::uuid, 'b3000000-0000-0000-0000-000000000001'::uuid, 'b4000000-0000-0000-0000-000000000001'::uuid, 'b4000000-0000-0000-0000-000000000002'::uuid)) x(t, e, c, ch1, ch2);
insert into public.lignes_factures (facture_id, entreprise_id, designation, quantite, prix_unitaire_ht, remise_ligne, taux_tva)
select f.id, f.entreprise_id, 'L' || k, k, 10.37 * k, (k % 3) * 5, (array[20, 10, 5.5])[k]
from public.factures f cross join generate_series(1, 3) k
where f.numero like 'FIN-%';
insert into public.paiements (facture_id, montant, date, mode)
select f.id, 10 + k, current_date - k, 'virement'
from public.factures f cross join generate_series(1, 2) k
where f.numero like 'FIN-%';
insert into public.depenses_fournisseurs (entreprise_id, fournisseur_id, chantier_id, numero_piece, categorie, date_piece, statut, montant_ht, taux_tva, montant_tva, montant_regle)
select x.e, x.f, case when i % 3 = 0 then null when i % 3 = 1 then x.ch1 else x.ch2 end, 'FF-' || x.t || i, 'materiaux', current_date - (i % 25),
       (array['a_payer', 'payee', 'payee_partiel', 'annulee', 'litige'])[1 + i % 5], 50 + i, 20, 10 + i / 5.0, case when i % 5 = 1 then 60 + i * 1.2 when i % 5 = 2 then 5 else 0 end
from generate_series(1, 25) i
cross join (values ('a', 'a0000000-0000-0000-0000-000000000001'::uuid, 'ab000000-0000-0000-0000-000000000001'::uuid, 'a4000000-0000-0000-0000-000000000001'::uuid, 'a4000000-0000-0000-0000-000000000002'::uuid),
                   ('b', 'b0000000-0000-0000-0000-000000000001'::uuid, 'bb000000-0000-0000-0000-000000000001'::uuid, 'b4000000-0000-0000-0000-000000000001'::uuid, 'b4000000-0000-0000-0000-000000000002'::uuid)) x(t, e, f, ch1, ch2);
insert into public.reglements_fournisseurs (entreprise_id, depense_id, montant, date, mode)
select d.entreprise_id, d.id, 3, current_date - 2, 'virement' from public.depenses_fournisseurs d where d.numero_piece like 'FF-%';
-- Pointage : chaque salarié des deux entreprises, sur les deux chantiers.
insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales, heures_supplementaires, verification_statut)
select e.entreprise_id, e.id, ch.id, current_date - k, 6 + k % 2, 0.5, case when k % 3 = 0 then 'a_verifier' else 'valide' end
from public.employes e join public.chantiers ch on ch.entreprise_id = e.entreprise_id cross join generate_series(1, 4) k
where e.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
insert into public.sessions_pointage (entreprise_id, employe_id, chantier_id, arrivee_at, depart_at, pause_minutes, latitude_arrivee, longitude_arrivee, pointage_id)
select p.entreprise_id, p.employe_id, p.chantier_id, p.date + time '08:00', p.date + time '16:00', 60, 48.8, 2.3, p.id
from public.pointages p where p.date < current_date and p.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
insert into public.verifications_zone_pointage (entreprise_id, session_id, employe_id, chantier_id, latitude, longitude, distance_metres, dans_zone, created_at)
select s.entreprise_id, s.id, s.employe_id, s.chantier_id, 48.8, 2.3, 12, true, s.arrivee_at + interval '2 hours' from public.sessions_pointage s
where s.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, type_activite, tache)
select e.entreprise_id, ch.id, e.id, current_date - k, 7, 'chantier', 'T' || k
from public.employes e join public.chantiers ch on ch.entreprise_id = e.entreprise_id cross join generate_series(0, 3) k
where e.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
-- Notes de frais : statuts variés, salariés et créateurs variés, sur chantier.
insert into public.notes_frais (entreprise_id, employe_id, reference, montant_ttc, statut, chantier_id, cree_par_utilisateur_id, date_frais)
select e.entreprise_id, e.id, 'NF-FIN-' || e.identifiant_interne || '-' || k, 10 + k, (array['valide', 'soumise', 'validee', 'refuse', 'exporte_comptabilite'])[1 + k % 5],
       (select ch.id from public.chantiers ch where ch.entreprise_id = e.entreprise_id order by ch.id limit 1), e.utilisateur_id, current_date - k
from public.employes e cross join generate_series(1, 5) k
where e.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
-- Journal IA : opérations de plusieurs utilisateurs dans le mois.
insert into public.journal_ia (entreprise_id, utilisateur_id, fonctionnalite, statut, created_at, cout_estime_ht, operations_decomptees)
select ue.entreprise_id, ue.utilisateur_id, 'devis', case when k = 3 then 'erreur' else 'succes' end, date_trunc('month', now()) + k * interval '1 minute', 0.01 * k, k
from public.utilisateurs_entreprises ue cross join generate_series(1, 3) k
where ue.entreprise_id in ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');
set local session_replication_role = origin;

-- ─── Mesures RPC ↔ lecture RLS directe (exécutées sous le profil courant) ───
create function pg_temp.mesures(p_e uuid)
returns table (cle text, rpc numeric, rls numeric)
language plpgsql
as $$
declare
  d1 date := current_date - 30; d2 date := current_date;
  t1 timestamptz := (current_date - 30)::timestamptz; t2 timestamptz := (current_date + 1)::timestamptz;
  v jsonb; ch uuid;
begin
  ch := (select c.id from public.chantiers c where c.entreprise_id = p_e order by c.id limit 1);
  if ch is null then ch := case when p_e = 'a0000000-0000-0000-0000-000000000001' then 'a4000000-0000-0000-0000-000000000001'::uuid else 'b4000000-0000-0000-0000-000000000001'::uuid end; end if;

  v := public.export_comptable_ventes(p_e, d1, d2);
  return query select 'ventes : lignes', jsonb_array_length(v)::numeric, (select count(*) from public.factures f where f.entreprise_id = p_e and f.numero is not null and f.date_emission between d1 and d2)::numeric;
  return query select 'ventes : TTC', (select coalesce(sum((x->>'montant_ttc')::numeric), 0) from jsonb_array_elements(v) x), (select coalesce(sum(f.montant_ttc), 0) from public.factures f where f.entreprise_id = p_e and f.numero is not null and f.date_emission between d1 and d2);
  return query select 'ventes : fiches client jointes', (select count(*) from jsonb_array_elements(v) x where x->'client' <> 'null'::jsonb)::numeric, (select count(*) from public.factures f join public.clients c on c.id = f.client_id where f.entreprise_id = p_e and f.numero is not null and f.date_emission between d1 and d2)::numeric;

  v := public.export_comptable_reglements(p_e, d1, d2);
  return query select 'règlements : lignes', jsonb_array_length(v)::numeric, (select count(*) from public.paiements p join public.factures f on f.id = p.facture_id where f.entreprise_id = p_e and p.date between d1 and d2)::numeric;
  return query select 'règlements : montant', (select coalesce(sum((x->>'montant')::numeric), 0) from jsonb_array_elements(v) x), (select coalesce(sum(p.montant), 0) from public.paiements p join public.factures f on f.id = p.facture_id where f.entreprise_id = p_e and p.date between d1 and d2);

  v := public.export_comptable_achats(p_e, d1, d2);
  return query select 'achats : lignes', jsonb_array_length(v)::numeric, (select count(*) from public.depenses_fournisseurs d where d.entreprise_id = p_e and d.date_piece between d1 and d2 and d.statut <> 'annulee')::numeric;
  return query select 'achats : TVA', (select coalesce(sum((x->>'montant_tva')::numeric), 0) from jsonb_array_elements(v) x), (select coalesce(sum(d.montant_tva), 0) from public.depenses_fournisseurs d where d.entreprise_id = p_e and d.date_piece between d1 and d2 and d.statut <> 'annulee');
  return query select 'achats : chantiers joints', (select count(*) from jsonb_array_elements(v) x where x->'chantier' <> 'null'::jsonb)::numeric, (select count(*) from public.depenses_fournisseurs d join public.chantiers c on c.id = d.chantier_id where d.entreprise_id = p_e and d.date_piece between d1 and d2 and d.statut <> 'annulee')::numeric;

  v := public.export_comptable_tva_collectee(p_e, d1, d2);
  return query select 'TVA collectée : groupes facture × taux', jsonb_array_length(v->'details')::numeric, (select count(*) from (select 1 from public.lignes_factures l join public.factures f on f.id = l.facture_id where f.entreprise_id = p_e and f.numero is not null and f.date_emission between d1 and d2 and f.statut <> 'annulee' group by f.id, l.taux_tva) g)::numeric;
  return query select 'TVA collectée : TVA totale', (select coalesce(sum((x->>'tva')::numeric), 0) from jsonb_array_elements(v->'synthese') x), (select coalesce(sum(l.quantite * l.prix_unitaire_ht * (1 - l.remise_ligne / 100) * l.taux_tva / 100), 0) from public.lignes_factures l join public.factures f on f.id = l.facture_id where f.entreprise_id = p_e and f.numero is not null and f.date_emission between d1 and d2 and f.statut <> 'annulee');

  v := public.tresorerie_donnees(p_e, d1);
  return query select 'trésorerie : factures ouvertes', jsonb_array_length(v->'factures_ouvertes')::numeric, (select count(*) from public.factures f where f.entreprise_id = p_e and f.statut not in ('payee', 'annulee', 'avoir_emis', 'brouillon'))::numeric;
  return query select 'trésorerie : avoirs par origine', (select coalesce(sum((x->>'montant_ttc')::numeric), 0) from jsonb_array_elements(v->'avoirs_par_facture') x), (select coalesce(sum(f.montant_ttc), 0) from public.factures f where f.entreprise_id = p_e and f.type = 'avoir' and f.statut <> 'annulee' and f.facture_origine_id is not null);
  return query select 'trésorerie : dépenses ouvertes', jsonb_array_length(v->'depenses_ouvertes')::numeric, (select count(*) from public.depenses_fournisseurs d where d.entreprise_id = p_e and d.statut not in ('payee', 'annulee'))::numeric;
  return query select 'trésorerie : encaissé', (v->>'encaisse')::numeric, (select coalesce(sum(p.montant), 0) from public.paiements p join public.factures f on f.id = p.facture_id where f.entreprise_id = p_e and p.date >= d1);
  return query select 'trésorerie : décaissé', (v->>'decaisse')::numeric, (select coalesce(sum(r.montant), 0) from public.reglements_fournisseurs r join public.depenses_fournisseurs d on d.id = r.depense_id where d.entreprise_id = p_e and r.date >= d1);
  return query select 'trésorerie : chantiers joints', (select count(*) from jsonb_array_elements(v->'factures_ouvertes') x where x->'chantier' <> 'null'::jsonb)::numeric, (select count(*) from public.factures f join public.chantiers c on c.id = f.chantier_id where f.entreprise_id = p_e and f.statut not in ('payee', 'annulee', 'avoir_emis', 'brouillon'))::numeric;

  v := public.depenses_fournisseurs_totaux(p_e);
  return query select '/depenses : total TTC', (v->>'total_ttc')::numeric, (select coalesce(sum(d.montant_ttc) filter (where d.statut <> 'annulee'), 0) from public.depenses_fournisseurs d where d.entreprise_id = p_e);
  return query select '/depenses : réglé', (v->>'regle')::numeric, (select coalesce(sum(d.montant_regle), 0) from public.depenses_fournisseurs d where d.entreprise_id = p_e);

  v := public.pointages_equipe_periode(p_e, d1, d2, t1, t2);
  return query select 'pointage équipe : pointages', jsonb_array_length(v->'pointages')::numeric, (select count(*) from public.pointages p where p.entreprise_id = p_e and p.date between d1 and d2)::numeric;
  return query select 'pointage équipe : heures', (select coalesce(sum((x->>'heures_normales')::numeric + (x->>'heures_supplementaires')::numeric), 0) from jsonb_array_elements(v->'pointages') x), (select coalesce(sum(p.heures_normales + p.heures_supplementaires), 0) from public.pointages p where p.entreprise_id = p_e and p.date between d1 and d2);
  return query select 'pointage équipe : sessions', jsonb_array_length(v->'sessions')::numeric, (select count(*) from public.sessions_pointage s where s.entreprise_id = p_e and s.arrivee_at between t1 and t2)::numeric;
  return query select 'pointage équipe : pointages joints aux sessions', (select count(*) from jsonb_array_elements(v->'sessions') x where x->'pointage' <> 'null'::jsonb)::numeric, (select count(*) from public.sessions_pointage s join public.pointages p on p.id = s.pointage_id where s.entreprise_id = p_e and s.arrivee_at between t1 and t2)::numeric;
  return query select 'pointage équipe : contrôles GPS', jsonb_array_length(v->'verifications')::numeric, (select count(*) from public.verifications_zone_pointage z where z.entreprise_id = p_e and z.created_at between t1 and t2)::numeric;
  return query select 'pointage équipe : chantiers joints', (select count(*) from jsonb_array_elements(v->'pointages') x where x->'chantier' <> 'null'::jsonb)::numeric, (select count(*) from public.pointages p join public.chantiers c on c.id = p.chantier_id where p.entreprise_id = p_e and p.date between d1 and d2)::numeric;

  v := public.planning_semaine(p_e, d1, d2, null);
  return query select 'planning : affectations', jsonb_array_length(v->'affectations')::numeric, (select count(*) from public.affectations a where a.entreprise_id = p_e and a.date between d1 and d2)::numeric;
  return query select 'planning : heures validées', (select coalesce(sum((x->>'heures_normales')::numeric + (x->>'heures_supplementaires')::numeric), 0) from jsonb_array_elements(v->'pointages') x), (select coalesce(sum(p.heures_normales + p.heures_supplementaires), 0) from public.pointages p where p.entreprise_id = p_e and p.date between d1 and d2 and p.verification_statut = 'valide');

  v := public.chantier_donnees_chiffrees(p_e, ch, true, true, true);
  return query select 'fiche chantier : factures', jsonb_array_length(v->'factures')::numeric, (select count(*) from public.factures f where f.entreprise_id = p_e and f.chantier_id = ch)::numeric;
  return query select 'fiche chantier : affectations', jsonb_array_length(v->'affectations')::numeric, (select count(*) from public.affectations a where a.entreprise_id = p_e and a.chantier_id = ch)::numeric;
  return query select 'fiche chantier : pointages', jsonb_array_length(v->'pointages')::numeric, (select count(*) from public.pointages p where p.entreprise_id = p_e and p.chantier_id = ch)::numeric;
  return query select 'fiche chantier : factures fournisseurs', jsonb_array_length(v->'factures_fournisseurs')::numeric, (select count(*) from public.depenses_fournisseurs d where d.entreprise_id = p_e and d.chantier_id = ch)::numeric;
  return query select 'fiche chantier : notes de frais', jsonb_array_length(v->'notes_frais')::numeric, (select count(*) from public.notes_frais n where n.entreprise_id = p_e and n.chantier_id = ch)::numeric;

  v := public.journal_ia_consommation(p_e, date_trunc('month', now()), date_trunc('month', now()) + interval '1 month');
  return query select 'quota IA : opérations', (v->>'operations')::numeric, (select coalesce(sum(greatest(0, coalesce(j.operations_decomptees, 1))), 0)::numeric from public.journal_ia j where j.entreprise_id = p_e and j.statut = 'succes' and j.annule_at is null and j.created_at >= date_trunc('month', now()) and j.created_at < date_trunc('month', now()) + interval '1 month');
end;
$$;

-- 32 mesures par appel. Profils de l'entreprise A sur leur entreprise
-- (admin, ouvrier, chef d'équipe, conducteur, comptable, dirigeant), puis
-- l'admin A sur l'entreprise B (tentative inter-tenant).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(rpc, rls, 'admin A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select is(rpc, rls, 'ouvrier A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(rpc, rls, 'chef d''équipe A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(rpc, rls, 'conducteur A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select is(rpc, rls, 'comptable A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select is(rpc, rls, 'dirigeant A — ' || cle) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(rpc, 0::numeric, 'admin A sur B (inter-tenant) — ' || cle) from pg_temp.mesures('b0000000-0000-0000-0000-000000000001');
reset role;

-- Le jeu de données n'est pas vide : sans cela, toutes les égalités
-- ci-dessus pourraient passer à 0 = 0.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select ok((select count(*) from pg_temp.mesures('a0000000-0000-0000-0000-000000000001') where rpc > 0) >= 30, 'admin A : au moins 30 mesures sur 32 portent sur des données non vides');
reset role;

-- Exécution : jamais `anon`, toujours `authenticated`.
select ok(not has_function_privilege('anon', 'public.export_comptable_ventes(uuid, date, date)', 'execute'), 'anon ne peut pas exécuter export_comptable_ventes');
select ok(not has_function_privilege('anon', 'public.export_comptable_reglements(uuid, date, date)', 'execute'), 'anon ne peut pas exécuter export_comptable_reglements');
select ok(not has_function_privilege('anon', 'public.export_comptable_achats(uuid, date, date)', 'execute'), 'anon ne peut pas exécuter export_comptable_achats');
select ok(not has_function_privilege('anon', 'public.export_comptable_tva_collectee(uuid, date, date)', 'execute'), 'anon ne peut pas exécuter export_comptable_tva_collectee');
select ok(not has_function_privilege('anon', 'public.tresorerie_donnees(uuid, date)', 'execute'), 'anon ne peut pas exécuter tresorerie_donnees');
select ok(not has_function_privilege('anon', 'public.depenses_fournisseurs_totaux(uuid)', 'execute'), 'anon ne peut pas exécuter depenses_fournisseurs_totaux');
select ok(not has_function_privilege('anon', 'public.pointages_equipe_periode(uuid, date, date, timestamptz, timestamptz)', 'execute'), 'anon ne peut pas exécuter pointages_equipe_periode');
select ok(not has_function_privilege('anon', 'public.planning_semaine(uuid, date, date, uuid)', 'execute'), 'anon ne peut pas exécuter planning_semaine');
select ok(not has_function_privilege('anon', 'public.chantier_donnees_chiffrees(uuid, uuid, boolean, boolean, boolean)', 'execute'), 'anon ne peut pas exécuter chantier_donnees_chiffrees');
select ok(not has_function_privilege('anon', 'public.journal_ia_consommation(uuid, timestamptz, timestamptz)', 'execute'), 'anon ne peut pas exécuter journal_ia_consommation');
select ok(has_function_privilege('authenticated', 'public.export_comptable_tva_collectee(uuid, date, date)', 'execute'), 'authenticated peut exécuter export_comptable_tva_collectee');
select ok(has_function_privilege('authenticated', 'public.chantier_donnees_chiffrees(uuid, uuid, boolean, boolean, boolean)', 'execute'), 'authenticated peut exécuter chantier_donnees_chiffrees');

select * from finish();
rollback;
