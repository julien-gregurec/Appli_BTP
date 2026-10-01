-- ELSATIA-FINANCE-AGGREGATES-DATA-CORRECTNESS-V1 — jeu volumétrique local.
-- Cinq entreprises F<V> (V = 500, 1000, 1462, 5000, 20000) portant chacune V
-- lignes par table financière sur la période 2026-01-01 → 2026-06-30, plus une
-- entreprise témoin T (autre tenant) avec 300 lignes par table dans la même
-- période, pour prouver l'isolation. Chaque entreprise a :
--   - un administrateur  (toutes permissions)       : f<V>…001
--   - un ouvrier          (aucune permission finance) : f<V>…002
-- Chargement superutilisateur, triggers métier neutralisés
-- (session_replication_role = replica) : on fabrique des documents déjà émis
-- sans rejouer le cycle de vie. Les RLS, elles, restent actives à la lecture.
\set ON_ERROR_STOP 1
set session_replication_role = replica;
set elsatia.capacite_personnes_bypass = 'on';

create or replace function pg_temp.u(p_prefixe text, p_n bigint) returns uuid language sql immutable as
$$ select (p_prefixe || lpad(to_hex(p_n), 32 - length(p_prefixe), '0'))::uuid $$;

do $$
declare
  v int; e uuid; pfx text; adm uuid; ouv uuid; poste_adm uuid; poste_ouv uuid;
  volumes int[] := array[500, 1000, 1462, 5000, 20000, 300];
  prefixes text[] := array['f0500', 'f1000', 'f1462', 'f5000', 'f2000', 'fe000'];
begin
  for k in 1 .. array_length(volumes, 1) loop
    v := volumes[k]; pfx := prefixes[k];
    e := pg_temp.u(pfx || 'e', 1);
    adm := pg_temp.u(pfx || 'a', 1); ouv := pg_temp.u(pfx || 'a', 2);
    poste_adm := pg_temp.u(pfx || 'b', 1); poste_ouv := pg_temp.u(pfx || 'b', 2);

    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
      ('00000000-0000-0000-0000-000000000000', adm, 'authenticated', 'authenticated', pfx || '-admin@invalid.local', 'x', now(), now(), now()),
      ('00000000-0000-0000-0000-000000000000', ouv, 'authenticated', 'authenticated', pfx || '-ouvrier@invalid.local', 'x', now(), now(), now());
    insert into public.utilisateurs (id, prenom, nom) values (adm, 'Admin', pfx), (ouv, 'Ouvrier', pfx);
    insert into public.entreprises (id, nom, code_adhesion, abonnement_statut, abonnement_essai_debut, abonnement_essai_fin) values (e, 'Bench ' || pfx, upper(pfx) || 'X', 'actif', current_date, current_date + 30);
    insert into public.postes (id, entreprise_id, nom) values (poste_adm, e, 'Administrateur'), (poste_ouv, e, 'Ouvrier');
    insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut) values (adm, e, poste_adm, 'actif'), (ouv, e, poste_ouv, 'actif');
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_adm, d.cle, true from public.permissions_disponibles d;
    insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
      select e, poste_ouv, d.cle, true from public.permissions_disponibles d where d.cle in ('voir_chantiers_assignes', 'acces_pointage', 'saisir_son_pointage');

    insert into public.clients (id, entreprise_id, nom, prenom, reference_interne)
      select pg_temp.u(pfx || 'c', i), e, 'Client ' || i, 'P' || i, 'CLI-' || i from generate_series(1, 50) i;
    insert into public.fournisseurs (id, entreprise_id, reference, nom)
      select pg_temp.u(pfx || 'd', i), e, 'FRN-' || i, 'Fournisseur ' || i from generate_series(1, 30) i;
    insert into public.chantiers (id, entreprise_id, client_id, nom, reference_interne)
      select pg_temp.u(pfx || 'ca', i), e, pg_temp.u(pfx || 'c', 1 + i % 50), 'Chantier ' || i, 'CH-' || i from generate_series(1, 20) i;

    -- Factures : V pièces numérotées, 1 ligne chacune ; 1 sur 20 est un avoir,
    -- 1 sur 33 est annulée. Montants non ronds pour exercer les décimales.
    insert into public.factures (id, entreprise_id, numero, client_id, chantier_id, type, statut, date_emission, date_echeance,
                                 montant_ht, montant_tva, montant_ttc, montant_paye)
      select pg_temp.u(pfx || 'fa', i), e, 'F-' || lpad(i::text, 6, '0'), pg_temp.u(pfx || 'c', 1 + i % 50), pg_temp.u(pfx || 'ca', 1 + i % 20),
             case when i % 20 = 0 then 'avoir' else 'simple' end,
             case when i % 33 = 0 then 'annulee' when i % 4 = 0 then 'payee' when i % 4 = 1 then 'payee_partiel' when i % 4 = 2 then 'en_retard' else 'envoyee' end,
             date '2026-01-01' + (i % 181), date '2026-01-01' + (i % 181) + 30,
             x.ht, round(x.ht * x.taux / 100, 2), x.ht + round(x.ht * x.taux / 100, 2),
             case when i % 4 = 0 then x.ht + round(x.ht * x.taux / 100, 2) when i % 4 = 1 then round((x.ht + round(x.ht * x.taux / 100, 2)) / 3, 2) else 0 end
      from generate_series(1, v) i
      cross join lateral (select round((((i * 37) % 997) + 1) * 3 * (1 - ((i % 5) * 2.5) / 100) * 1.07, 2) as ht,
                                 (array[20, 10, 5.5, 20, 0])[1 + i % 5]::numeric as taux) x;
    insert into public.lignes_factures (id, facture_id, entreprise_id, designation, quantite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
      select pg_temp.u(pfx || '1f', i), pg_temp.u(pfx || 'fa', i), e, 'Prestation ' || i, 3, (((i * 37) % 997) + 1) * 1.07,
             (i % 5) * 2.5, (array[20, 10, 5.5, 20, 0])[1 + i % 5], 1
      from generate_series(1, v) i;
    insert into public.paiements (id, facture_id, montant, date, mode, reference)
      select pg_temp.u(pfx || '9a', i), pg_temp.u(pfx || 'fa', i), round(((i * 13) % 900) + 10.37, 2), date '2026-01-01' + (i % 181), 'virement', 'VIR-' || i
      from generate_series(1, v) i;

    insert into public.depenses_fournisseurs (id, entreprise_id, fournisseur_id, chantier_id, numero_piece, categorie, date_piece, date_echeance,
                                              statut, montant_ht, taux_tva, montant_tva, montant_regle)
      select pg_temp.u(pfx || 'df', i), e, pg_temp.u(pfx || 'd', 1 + i % 30), case when i % 3 = 0 then null else pg_temp.u(pfx || 'ca', 1 + i % 20) end,
             'FF-' || lpad(i::text, 6, '0'), (array['materiaux', 'sous_traitance', 'location', 'transport', 'autre'])[1 + i % 5],
             date '2026-01-01' + (i % 181), date '2026-01-01' + (i % 181) + 45,
             case when i % 29 = 0 then 'annulee' when i % 3 = 0 then 'payee' when i % 3 = 1 then 'payee_partiel' else 'a_payer' end,
             y.ht, y.taux, round(y.ht * y.taux / 100, 2),
             case when i % 3 = 0 then y.ht + round(y.ht * y.taux / 100, 2) when i % 3 = 1 then round(y.ht / 2, 2) else 0 end
      from generate_series(1, v) i
      cross join lateral (select round(((i * 53) % 1999) + 5.13, 2) as ht, (array[20, 10, 5.5, 2.1, 0])[1 + i % 5]::numeric as taux) y;
    insert into public.reglements_fournisseurs (id, entreprise_id, depense_id, montant, date, mode)
      select pg_temp.u(pfx || 'af', i), e, pg_temp.u(pfx || 'df', i), round(((i * 7) % 500) + 1.11, 2), date '2026-01-01' + (i % 181), 'virement'
      from generate_series(1, v) i;
  end loop;
end $$;

reset session_replication_role;
analyze;
