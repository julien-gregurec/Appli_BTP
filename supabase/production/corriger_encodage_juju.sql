-- Repairs the JUJU demo data after a clipboard encoding conversion.
-- This file is intentionally ASCII-only so it can be pasted safely.
-- It only updates rows belonging to the company named exactly "juju".

begin;

do $repair$
declare
  v_entreprise uuid;
  v_i integer;
  v_index integer;
begin
  select e.id
  into v_entreprise
  from public.entreprises e
  where lower(btrim(e.nom)) = 'juju'
     or lower(btrim(coalesce(e.raison_sociale, ''))) = 'juju'
  order by case when lower(btrim(e.nom)) = 'juju' then 0 else 1 end, e.created_at
  limit 1;

  if v_entreprise is null then
    raise exception 'Entreprise de test juju introuvable. Aucune donnee modifiee.';
  end if;

  update public.entreprises
  set abonnement_note = U&'Compte de d\00E9monstration juju \2014 historique de six mois',
      updated_at = now()
  where id = v_entreprise;

  for v_i in 1..20 loop
    update public.clients
    set prenom = case
          when v_i % 3 = 0 then null
          else (array[
            'Camille','Thomas','Julie','Nicolas','Sophie',
            'Alexandre',U&'\00C9milie','Maxime','Laura','Julien'
          ])[1 + ((v_i - 1) % 10)]
        end,
        societe = case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo ' || v_i else null end,
        raison_sociale = case when v_i % 3 = 0 then U&'Soci\00E9t\00E9 D\00E9mo ' || v_i else null end,
        adresse_facturation = (10 + v_i) || U&' rue de la R\00E9publique',
        notes = U&'[JUJU 6M] Client de d\00E9monstration'
    where entreprise_id = v_entreprise
      and reference_interne = 'JUJU-CLI-' || lpad(v_i::text, 3, '0');

    update public.chantiers
    set nom = (array[
          U&'R\00E9novation bureaux',
          'Cloisons amovibles',
          'Cabines sanitaires',
          'Agencement accueil',
          U&'Pose sol stratifi\00E9'
        ])[1 + ((v_i - 1) % 5)] || U&' \2014 D\00E9mo ' || v_i
    where entreprise_id = v_entreprise
      and reference_interne = 'JUJU-CHA-' || lpad(v_i::text, 3, '0');
  end loop;

  update public.devis
  set conditions = U&'Validit\00E9 30 jours \2014 acompte de 30 % \00E0 la commande',
      notes_internes = U&'[JUJU 6M] Historique de d\00E9monstration'
  where entreprise_id = v_entreprise
    and numero like 'DEV-JUJU-%';

  update public.lignes_devis l
  set designation = case l.ordre
        when 1 then (array[
          'Pose cloisons amovibles',
          U&'Agencement int\00E9rieur sur mesure',
          U&'Cr\00E9ation cabine sanitaire',
          U&'Pose panneaux d\00E9coratifs'
        ])[1 + ((right(d.numero, 3)::integer - 1) % 4)]
        when 2 then 'Fournitures et quincaillerie'
        else U&'D\00E9placement et protection du chantier'
      end,
      description = case l.ordre
        when 1 then U&'Pr\00E9paration, implantation et pose compl\00E8te'
        when 2 then U&'Profil\00E9s, panneaux, fixations et consommables'
        else 'Livraison, protections et nettoyage'
      end
  from public.devis d
  where d.id = l.devis_id
    and d.entreprise_id = v_entreprise
    and d.numero like 'DEV-JUJU-%';

  update public.factures
  set notes_client = U&'R\00E8glement par virement.',
      notes_internes = U&'[JUJU 6M] Historique de d\00E9monstration'
  where entreprise_id = v_entreprise
    and numero like 'FAC-JUJU-%';

  update public.lignes_factures l
  set designation = case l.ordre
        when 1 then (array[
          'Pose cloisons amovibles',
          U&'Agencement int\00E9rieur sur mesure',
          U&'Cr\00E9ation cabine sanitaire',
          U&'Pose panneaux d\00E9coratifs'
        ])[1 + ((right(d.numero, 3)::integer - 1) % 4)]
        when 2 then 'Fournitures et quincaillerie'
        else U&'D\00E9placement et protection du chantier'
      end,
      description = case l.ordre
        when 1 then U&'Pr\00E9paration, implantation et pose compl\00E8te'
        when 2 then U&'Profil\00E9s, panneaux, fixations et consommables'
        else 'Livraison, protections et nettoyage'
      end
  from public.factures d
  where d.id = l.facture_id
    and d.entreprise_id = v_entreprise
    and d.numero like 'FAC-JUJU-%';

  update public.affectations
  set tache = '[JUJU 6M] ' || case extract(isodow from date)::integer
        when 1 then U&'Pose et r\00E9glages'
        when 2 then U&'Pr\00E9paration supports'
        when 3 then 'Montage cloisons'
        when 4 then 'Finitions'
        else U&'Nettoyage et r\00E9ception'
      end,
      notes = U&'Planning historique de d\00E9monstration'
  where entreprise_id = v_entreprise
    and tache like '[JUJU 6M]%';

  update public.pointages
  set tache = U&'[JUJU 6M] Travail r\00E9alis\00E9',
      commentaire = U&'Pointage historique GPS de d\00E9monstration',
      commentaire_verification = U&'Pointage contr\00F4l\00E9 et valid\00E9'
  where entreprise_id = v_entreprise
    and tache like '[JUJU 6M]%';

  for v_i in 1..20 loop
    update public.articles_stock
    set designation = (array[
          'Plaque BA13',
          U&'Rail m\00E9tallique 48',
          U&'Montant m\00E9tallique 48',
          'Vis placo 25 mm',
          U&'Bande \00E0 joint',
          'Enduit de finition',
          U&'Laine min\00E9rale',
          'Profil aluminium',
          U&'Panneau m\00E9lamin\00E9',
          'Silicone sanitaire'
        ])[1 + ((v_i - 1) % 10)] || ' ' || v_i,
        emplacement = U&'D\00E9p\00F4t \2014 Zone ' || chr(65 + ((v_i - 1) % 5))
    where entreprise_id = v_entreprise
      and reference = 'JUJU-STK-' || lpad(v_i::text, 3, '0');
  end loop;

  update public.fournisseurs
  set nom = case reference
        when 'JUJU-FRN-001' then 'Point.P'
        when 'JUJU-FRN-002' then 'Sonepar'
        when 'JUJU-FRN-003' then 'Kiloutou'
        when 'JUJU-FRN-004' then 'Rexel'
        when 'JUJU-FRN-005' then 'Dispano'
        when 'JUJU-FRN-006' then 'Legallais'
        when 'JUJU-FRN-007' then U&'W\00FCrth'
        when 'JUJU-FRN-008' then U&'La Plateforme du B\00E2timent'
        else nom
      end,
      notes = U&'[JUJU 6M] Fournisseur de d\00E9monstration'
  where entreprise_id = v_entreprise
    and reference like 'JUJU-FRN-%';

  update public.commandes_fournisseurs
  set notes = '[JUJU 6M] Approvisionnement chantier'
  where entreprise_id = v_entreprise
    and numero like 'CMD-JUJU-%';

  update public.lignes_commande l
  set designation = case when l.ordre = 1 then U&'Mat\00E9riaux chantier' else 'Consommables' end,
      description = case when l.ordre = 1 then U&'Panneaux et profil\00E9s' else 'Fixations et produits de finition' end
  from public.commandes_fournisseurs c
  where c.id = l.commande_id
    and c.entreprise_id = v_entreprise
    and c.numero like 'CMD-JUJU-%';

  update public.depenses_fournisseurs
  set notes = U&'[JUJU 6M] Facture fournisseur li\00E9e \00E0 la commande'
  where entreprise_id = v_entreprise
    and numero_piece like 'ACH-JUJU-%';

  update public.depenses_fournisseurs
  set notes = U&'[JUJU 6M] Entretien v\00E9hicule historique',
      travaux_effectues = case right(numero_piece, 4)::integer % 3
        when 0 then U&'R\00E9vision compl\00E8te, filtres et niveaux'
        when 1 then U&'Remplacement pneumatiques et contr\00F4le g\00E9om\00E9trie'
        else U&'Vidange et contr\00F4le de s\00E9curit\00E9'
      end
  where entreprise_id = v_entreprise
    and numero_piece like 'ENT-JUJU-%';

  update public.charges_recurrentes
  set libelle = case categorie
        when 'assurance' then '[JUJU 6M] Assurance flotte'
        when 'location' then U&'[JUJU 6M] Location d\00E9p\00F4t'
        when 'carburant' then '[JUJU 6M] Carburant cartes flotte'
        else U&'[JUJU 6M] T\00E9l\00E9phonie \00E9quipe'
      end,
      notes = U&'Charge de d\00E9monstration'
  where entreprise_id = v_entreprise
    and libelle like '[JUJU 6M]%';

  update public.notes_frais
  set description = U&'[JUJU 6M] D\00E9pense professionnelle historique',
      commentaire_salarie = U&'D\00E9pense engag\00E9e pour les besoins du chantier'
  where entreprise_id = v_entreprise
    and description like '[JUJU 6M]%';

  update public.demandes_conges
  set commentaire = U&'[JUJU 6M] Demande historique de d\00E9monstration',
      motif_decision = case
        when statut = 'refusee' then U&'P\00E9riode d\00E9j\00E0 compl\00E8te'
        else U&'Valid\00E9e par le responsable'
      end
  where entreprise_id = v_entreprise
    and commentaire like '[JUJU 6M]%';

  update public.releves_kilometrage r
  set note = U&'[JUJU 6M] Relev\00E9 mensuel'
  from public.vehicules v
  where v.id = r.vehicule_id
    and v.entreprise_id = v_entreprise
    and r.note like '[JUJU 6M]%';
end
$repair$;

commit;

select
  'OK - encodage JUJU corrige' as resultat,
  (select count(*) from public.chantiers c join public.entreprises e on e.id = c.entreprise_id
   where lower(btrim(e.nom)) = 'juju' and c.reference_interne like 'JUJU-CHA-%') as chantiers_corriges,
  (select count(*) from public.devis d join public.entreprises e on e.id = d.entreprise_id
   where lower(btrim(e.nom)) = 'juju' and d.numero like 'DEV-JUJU-%') as devis_corriges,
  (select count(*) from public.fournisseurs f join public.entreprises e on e.id = f.entreprise_id
   where lower(btrim(e.nom)) = 'juju' and f.reference like 'JUJU-FRN-%') as fournisseurs_corriges;
