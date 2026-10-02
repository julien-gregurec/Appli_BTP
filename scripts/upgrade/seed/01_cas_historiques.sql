-- ELSATIA — harnais d'upgrade Production → V9.x — CAS HISTORIQUES de l'ère Production 210.
-- À charger APRÈS 00_amorce + isolation_multitenant.inc + seeds d'époque (5777abb).
-- 100 % synthétique : domaines *.invalid, identifiants Stripe « *_SYNTH_* » (livemode=false),
-- IBAN d'exemple publics (FR76 3000 6000 0112 3456 7890 189 / DE89 3704 0044 0532 0130 00)
-- chiffrés au format historique « v1:iv:tag:ct » (AES-256-GCM, clé de test 0x07×32, jamais réelle).
--
-- Couverture (phase C du harnais) :
--   offres  : Entreprise Test = « pro » v1 HISTORIQUE (129 €, annuel 1 238,40) actif ;
--             Petite = « essentiel » v0 HISTORIQUE (59 €) mensuel actif ;
--             A = « mini » v1 (79 €) essai EXPIRÉ ; B = « business » v1 (449 €) SUSPENDU (impayé) ;
--             Ancienne Remise = « mini » à 69 € négocié (contrat hors grille, ne doit jamais être remappé) ;
--             Annulée = « premium » v0 (249 €) annulé, annulation prévue.
--   comptes supplémentaires (options_abonnement_entreprises + facturation_comptes_mensuelle) ;
--   entreprise SANS MEMBRE (données métier, aucun utilisateur) ; utilisateur MULTI-ENTREPRISES ;
--   entreprise_active_id pointant vers une entreprise dont l'utilisateur n'est plus membre actif ;
--   utilisateur sans aucune appartenance ; employé anonymisé (RGPD) ; suppression d'entreprise programmée ;
--   IBAN historique v1 (employé + fournisseur) ; sessions support plateforme (ouverte / close) + journal ;
--   messages support ; Stripe synthétique (événements webhook, journal d'abonnement, factures d'abonnement) ;
--   tokens NON secrets (empreintes de partage de documents, clés API hachées, codes d'accès) ;
--   métadonnées Storage (objets sans fichier) ; orphelins plausibles (chemin Storage absent).
begin;
create temp table e as
select (select id from public.entreprises where nom = 'Entreprise Test') as moyenne,
       (select id from public.entreprises where nom = 'Petite SARL Histo') as petite,
       'a0000000-0000-0000-0000-000000000001'::uuid as a,
       'b0000000-0000-0000-0000-000000000001'::uuid as b;

-- Plans de l'ère 210 (la grille active à 210 et les versions historiques inactives).
create temp table p as
select code, version, id, prix_mensuel_ht, prix_annuel_ht from public.plans_abonnement;

-- 1. Entreprises supplémentaires : sans membre, ancienne remise, annulée.
insert into public.entreprises (id, nom, siret, ville, abonnement_statut, created_at)
values ('c2100000-0000-0000-0000-000000000001', 'Entreprise Sans Membre', '00000000000003', 'Mulhouse', 'actif', now() - interval '3 years'),
       ('c2100000-0000-0000-0000-000000000002', 'Ancienne Remise SAS', '00000000000004', 'Metz', 'actif', now() - interval '2 years'),
       ('c2100000-0000-0000-0000-000000000003', 'Annulée SARL', '00000000000005', 'Nancy', 'actif', now() - interval '18 months');

insert into public.clients (entreprise_id, reference_interne, type, nom, prenom, statut)
values ('c2100000-0000-0000-0000-000000000001', 'SM-CLI-1', 'particulier', 'Orphelin', 'Client', 'actif'),
       ('c2100000-0000-0000-0000-000000000002', 'AR-CLI-1', 'particulier', 'Remise', 'Client', 'actif');
insert into public.chantiers (entreprise_id, reference_interne, client_id, nom, statut, budget_previsionnel)
select c.entreprise_id, 'SM-CHA-1', c.id, 'Chantier sans membre', 'en_cours', 4321.09
  from public.clients c where c.reference_interne = 'SM-CLI-1';
insert into public.devis (entreprise_id, client_id, notes_internes, statut, date_emission)
select c.entreprise_id, c.id, 'Devis entreprise sans membre', 'brouillon', current_date - 30
  from public.clients c where c.reference_interne = 'SM-CLI-1';

-- 2. Abonnements (contrats) : chaque contrat pointe la VERSION de plan de l'ère 210.
insert into public.abonnements_entreprises
  (entreprise_id, plan_id, code_offre, version_tarif, periodicite, prix_contractuel_ht, statut,
   debut_periode, fin_periode, stripe_subscription_id, stripe_customer_id, created_at)
select x.ent, (select id from p where p.code = x.code and p.version = x.version), x.code, x.version, x.periodicite,
       x.prix, x.statut, now() - x.anc, now() - x.anc + interval '1 month', x.sub, x.cus, now() - x.anc
  from (values
    ((select moyenne from e), 'pro', 1, 'annuel', 1238.40, 'actif', interval '4 years', 'sub_SYNTH_moyenne', 'cus_SYNTH_moyenne'),
    ((select petite from e), 'essentiel', 0, 'mensuel', 59.00, 'actif', interval '2 years', 'sub_SYNTH_petite', 'cus_SYNTH_petite'),
    ((select a from e), 'mini', 1, 'mensuel', 79.00, 'essai', interval '45 days', null, 'cus_SYNTH_a'),
    ((select b from e), 'business', 1, 'mensuel', 449.00, 'suspendu', interval '8 months', 'sub_SYNTH_b', 'cus_SYNTH_b'),
    ('c2100000-0000-0000-0000-000000000002'::uuid, 'mini', 1, 'annuel', 69.00, 'actif', interval '2 years', 'sub_SYNTH_remise', 'cus_SYNTH_remise'),
    ('c2100000-0000-0000-0000-000000000003'::uuid, 'premium', 0, 'mensuel', 249.00, 'annule', interval '18 months', 'sub_SYNTH_annulee', 'cus_SYNTH_annulee')
  ) as x(ent, code, version, periodicite, prix, statut, anc, sub, cus);

update public.entreprises en
   set abonnement_offre = ab.code_offre, abonnement_version_tarif = ab.version_tarif,
       abonnement_prix_contractuel_ht = ab.prix_contractuel_ht, abonnement_periodicite = ab.periodicite,
       stripe_customer_id = ab.stripe_customer_id, stripe_subscription_id = ab.stripe_subscription_id,
       abonnement_statut = case ab.statut when 'annule' then 'annule' else ab.statut end
  from public.abonnements_entreprises ab where ab.entreprise_id = en.id;
-- essai expiré (A) ; impayé + suspension (B) ; annulation programmée ; suppression programmée (sans membre).
update public.entreprises set abonnement_essai_fin = current_date - 15 where id = (select a from e);
update public.entreprises set impaye_signale_at = now() - interval '40 days', suspension_prevue_at = now() - interval '10 days',
       impaye_message = 'Impayé synthétique (harnais)' where id = (select b from e);
update public.entreprises set abonnement_annulation_prevue_at = now() - interval '1 month' where id = 'c2100000-0000-0000-0000-000000000003';
update public.entreprises set suppression_demandee_at = now() - interval '2 days', suppression_prevue_at = now() + interval '28 days'
 where id = 'c2100000-0000-0000-0000-000000000001';
update public.entreprises set remise_stripe_coupon_id = 'coupon_SYNTH_69', remise_description = 'Prix historique négocié 69 €',
       remise_type = 'pourcentage', remise_duree_mois = 12, remise_appliquee_at = now() - interval '2 years'
 where id = 'c2100000-0000-0000-0000-000000000002';

-- 3. Comptes supplémentaires (options contractuelles + facturation mensuelle).
insert into public.options_abonnement_entreprises (entreprise_id, option_id, quantite, prix_unitaire_contractuel_ht, active, debut_at)
select (select moyenne from e), o.id, x.q, x.prix, true, now() - interval '1 year'
  from (values ('compte_terrain', 6, 5.00), ('compte_administratif', 2, 15.00), ('stockage', 1, 19.00)) x(code, q, prix)
  join public.catalogue_options_abonnement o on o.code = x.code and o.version = 1;
insert into public.options_abonnement_entreprises (entreprise_id, option_id, quantite, prix_unitaire_contractuel_ht, active, debut_at, fin_at)
select (select b from e), o.id, 3, 4.00, false, now() - interval '8 months', now() - interval '1 month'
  from public.catalogue_options_abonnement o where o.code = 'compte_terrain' and o.version = 1;
insert into public.facturation_comptes_mensuelle (entreprise_id, employe_id, poste_id, mois, statut_compte, libelle_poste, code_offre, montant_ht, motif)
select em.entreprise_id, em.id, em.poste_id, date_trunc('month', current_date - (m * 30))::date, 'actif', em.poste, 'pro', 5.00, 'Compte terrain supplémentaire'
  from public.employes em, generate_series(1, 6) m
 where em.entreprise_id = (select moyenne from e) and em.reference_interne in ('HIST-EMP-002', 'HIST-EMP-003')
on conflict do nothing;

-- 4. Utilisateurs : multi-entreprises, entreprise active orpheline, sans appartenance.
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select '10000000-0000-0000-0000-000000000001', (select moyenne from e),
       (select id from public.postes where entreprise_id = (select moyenne from e) order by created_at limit 1), 'actif';
insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut)
select '20000000-0000-0000-0000-000000000002', (select petite from e),
       (select id from public.postes where entreprise_id = (select petite from e) order by created_at limit 1), 'desactive';
update public.utilisateurs set entreprise_active_id = (select petite from e) where id = '20000000-0000-0000-0000-000000000002';
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-0000-0000-0000000000ff', 'authenticated', 'authenticated',
        'sans-entreprise@historique.invalid', extensions.crypt('x', extensions.gen_salt('bf')), now(), now() - interval '1 year', now());
insert into public.utilisateurs (id, prenom, nom, entreprise_active_id)
values ('a2100000-0000-0000-0000-0000000000ff', 'Sans', 'Entreprise', 'c2100000-0000-0000-0000-000000000001')
on conflict (id) do update set entreprise_active_id = excluded.entreprise_active_id;

-- 5. RGPD : employé anonymisé (identité purgée, ligne conservée pour l'historique de paie).
update public.employes set prenom = 'Anonyme', nom = 'Anonyme', email = null, telephone = null, statut = 'sorti',
       date_sortie = current_date - 400, anonymise_at = now() - interval '200 days'
 where entreprise_id = (select moyenne from e) and reference_interne = 'HIST-EMP-008';

-- 6. IBAN historiques (format v1) : employé + fournisseur.
insert into public.coordonnees_bancaires (entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash,
       iban_quatre_derniers, bic_chiffre, actif, verification_statut)
select em.entreprise_id, 'employe', em.id, em.prenom || ' ' || em.nom,
       'v1:AQEBAQEBAQEBAQEB:rgUI9tyyvImHgxg9ZPmsng:MLO-gaOP3D7n5OwRQAZBA5vPIcIvrwIjaQl6',
       '2847f6106ab6f0da11e73d5c896edc145fae3f8c1b04458a83bca2fe49a846e8', '0189',
       'v1:CwsLCwsLCwsLCwsL:55UzZpITYfPA8vfP4D5Z_A:b-bzKut2ZXQkeHs', true, 'verifie'
  from public.employes em where em.entreprise_id = (select moyenne from e)
   and not exists (select 1 from public.coordonnees_bancaires c where c.employe_id = em.id and c.actif)
 order by em.reference_interne nulls last limit 1;
insert into public.coordonnees_bancaires (entreprise_id, type_beneficiaire, fournisseur_id, titulaire, iban_chiffre, iban_hash,
       iban_quatre_derniers, actif, verification_statut)
select f.entreprise_id, 'fournisseur', f.id, coalesce(f.nom, 'Fournisseur'),
       'v1:AgICAgICAgICAgIC:yYxrE3WdDNmMWtXGw6ftHw:XvHRPmjchRMqYLKD0rf_SPoiW8pAhg',
       'faf7e1c0107370ff6f5d03205da7d8ae41ba8e22b31e94b986a65210075d9a1d', '3000', true, 'a_verifier'
  from public.fournisseurs f where f.entreprise_id = (select moyenne from e)
   and not exists (select 1 from public.coordonnees_bancaires c where c.fournisseur_id = f.id and c.actif)
 order by f.created_at limit 1;

-- 7. Support plateforme : une session close, une session ouverte, journal, messages.
insert into public.plateforme_acces_entreprises (plateforme_user_id, entreprise_id, motif, commence_at, termine_at, termine_motif)
values ('30000000-0000-0000-0000-000000000001', (select b from e), 'Analyse impayé (harnais)', now() - interval '20 days', now() - interval '20 days' + interval '30 minutes', 'fin'),
       ('30000000-0000-0000-0000-000000000001', (select moyenne from e), 'Session support ouverte (harnais)', now() - interval '1 hour', null, null);
insert into public.acces_support_log (utilisateur_id, entreprise_id, date, motif)
values ('30000000-0000-0000-0000-000000000001', (select b from e), now() - interval '20 days', 'Analyse impayé (harnais)');
insert into public.support_messages (entreprise_id, cote, auteur_id, auteur_nom, contenu, lu_par_plateforme, lu_par_entreprise)
values ((select b from e), 'entreprise', '20000000-0000-0000-0000-000000000001', 'Admin B', 'Pourquoi mon compte est suspendu ?', true, true),
       ((select b from e), 'plateforme', '30000000-0000-0000-0000-000000000001', 'Support', 'Facture impayée, voir portail.', false, true);

-- 8. Stripe synthétique (livemode=false, identifiants *_SYNTH_*).
insert into public.stripe_webhook_events (id, event_type, livemode, created_at)
select 'evt_SYNTH_' || lpad(g::text, 4, '0'), (array['invoice.paid', 'customer.subscription.updated', 'invoice.payment_failed'])[1 + g % 3], false,
       now() - make_interval(days => g)
  from generate_series(1, 30) g;
insert into public.abonnement_evenements (entreprise_id, stripe_event_id, type, statut_resultant, payload, created_at)
select x.ent, 'evt_SYNTH_ab_' || x.n, x.t, x.s, jsonb_build_object('synthetique', true, 'livemode', false), now() - make_interval(days => x.n)
  from (values ((select moyenne from e), 1, 'invoice.paid', 'actif'), ((select b from e), 2, 'invoice.payment_failed', 'impaye'),
               ((select b from e), 3, 'customer.subscription.updated', 'suspendu'),
               ('c2100000-0000-0000-0000-000000000003'::uuid, 4, 'customer.subscription.deleted', 'annule')) x(ent, n, t, s);
insert into public.factures_abonnement (entreprise_id, stripe_invoice_id, numero, periode_debut, periode_fin, montant_ht, montant_tva, montant_ttc, devise, statut, payee_at)
select x.ent, 'in_SYNTH_' || x.n, 'SYN-' || x.n, now() - interval '1 month', now(), x.ht, round(x.ht * 0.2, 2), round(x.ht * 1.2, 2), 'eur', x.st,
       case when x.st = 'paid' then now() - interval '25 days' end
  from (values ((select moyenne from e), 1, 1238.40, 'paid'), ((select petite from e), 2, 59.00, 'paid'),
               ((select b from e), 3, 449.00, 'open'), ('c2100000-0000-0000-0000-000000000002'::uuid, 4, 69.00, 'paid')) x(ent, n, ht, st);
insert into public.historique_tarification (entreprise_id, action, ancien, nouveau, motif)
values ('c2100000-0000-0000-0000-000000000002', 'remise', '{"prix": 79}', '{"prix": 69}', 'Prix historique négocié (harnais)');

-- 9. Tokens NON secrets (empreintes uniquement) : partage de documents, clés API, codes d'accès.
insert into public.acces_externes_documents (entreprise_id, type_document, document_id, token_hash, expire_le)
select d.entreprise_id, 'devis', d.id, encode(extensions.digest('partage-synth-' || d.id, 'sha256'), 'hex'), now() + interval '30 days'
  from public.devis d where d.entreprise_id = (select moyenne from e) order by d.created_at limit 3;
insert into public.cles_api (entreprise_id, cle_hash, nom, statut)
values ((select moyenne from e), encode(extensions.digest('cle-api-synth-1', 'sha256'), 'hex'), 'Connecteur comptable (synth.)', 'actif'),
       ((select moyenne from e), encode(extensions.digest('cle-api-synth-2', 'sha256'), 'hex'), 'Ancien connecteur (synth.)', 'revoque');
insert into public.codes_acces (entreprise_id, code, statut)
values ((select petite from e), 'SYNTH-CODE-0001', 'actif'), ((select b from e), 'SYNTH-CODE-0002', 'revoque');

-- 10. Storage : métadonnées d'objets (aucun fichier), dont un orphelin référencé sans objet.
insert into storage.objects (bucket_id, name, owner, metadata)
select x.b, (select moyenne from e)::text || x.n, 'a2100000-0000-0000-0000-000000000001', jsonb_build_object('size', x.s, 'mimetype', x.m)
  from (values ('chantier-documents', '/plans/plan-r1.pdf', 120334, 'application/pdf'),
               ('documents-employes', '/cartes/carte-btp-002.jpg', 88211, 'image/jpeg'),
               ('bulletins-paie', '/2026-01/bulletin-002.pdf', 45012, 'application/pdf'),
               ('entreprise-assets', '/logo.png', 9120, 'image/png')) x(b, n, s, m);
update public.employes set carte_btp_storage_path = (select moyenne from e)::text || '/cartes/carte-btp-002.jpg',
       carte_btp_nom = 'carte-btp-002.jpg', carte_btp_mime_type = 'image/jpeg', carte_btp_taille_octets = 88211
 where entreprise_id = (select moyenne from e) and reference_interne = 'HIST-EMP-002';
-- orphelin : chemin référencé, objet Storage absent (cas réel de suppression manuelle de fichier).
update public.employes set photo_storage_path = (select moyenne from e)::text || '/photos/absente.jpg', photo_nom = 'absente.jpg'
 where entreprise_id = (select moyenne from e) and reference_interne = 'HIST-EMP-003';
commit;
