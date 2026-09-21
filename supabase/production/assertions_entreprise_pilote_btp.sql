-- Vérifications post-seed pour l'entreprise pilote synthétique (PILOTE-BTP-V1).
-- Script en LECTURE SEULE (aucun DELETE/UPDATE/INSERT) : peut être lancé après
-- seed_entreprise_pilote_btp.sql sans passer par le garde-fou de scripts/garde-scripts-production.mjs,
-- mais rien n'empêche de l'y ajouter si on veut aussi verrouiller la cible Preview.
--
-- Les nombres attendus ci-dessous sont ceux réellement produits par le script de seed tel que
-- livré (vérifiés par exécution réelle en environnement de revue indépendante — voir
-- ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md), pas des estimations.

with cible as (
  select id as entreprise_id from public.entreprises where reference_interne='PILOTE-BTP-V1'
),
attendus(cle, attendu) as (
  values
    ('entreprises', 1),
    ('postes', 6),              -- 5 profils demandés + "Compte dépôt" (poste système auto-créé sur toute entreprise)
    ('employes', 28),
    ('comptes_utilisateurs_actives', 28),
    ('clients', 8),
    ('chantiers', 7),
    ('devis', 9),
    ('factures', 7),
    ('affectations', 300),
    ('pointages', 300),
    ('fournisseurs', 5),
    ('articles_stock', 15),
    ('commandes_fournisseurs', 4),
    ('notes_frais', 6),
    ('demandes_conges', 4)
),
reels(cle, reel) as (
  select 'entreprises', count(*) from public.entreprises where reference_interne='PILOTE-BTP-V1'
  union all
  select 'postes', count(*) from public.postes where entreprise_id in (select entreprise_id from cible)
  union all
  select 'employes', count(*) from public.employes where entreprise_id in (select entreprise_id from cible) and reference_interne like 'PILOTE-EMP-%'
  union all
  select 'comptes_utilisateurs_actives', count(*) from public.employes where entreprise_id in (select entreprise_id from cible) and reference_interne like 'PILOTE-EMP-%' and utilisateur_id is not null
  union all
  select 'clients', count(*) from public.clients where entreprise_id in (select entreprise_id from cible) and reference_interne like 'PILOTE-CLI-%'
  union all
  select 'chantiers', count(*) from public.chantiers where entreprise_id in (select entreprise_id from cible) and reference_interne like 'PILOTE-CHA-%'
  union all
  select 'devis', count(*) from public.devis where entreprise_id in (select entreprise_id from cible) and numero like 'DEV-PILOTE-%'
  union all
  select 'factures', count(*) from public.factures where entreprise_id in (select entreprise_id from cible) and numero like 'FAC-PILOTE-%'
  union all
  select 'affectations', count(*) from public.affectations where entreprise_id in (select entreprise_id from cible) and tache like '[PILOTE]%'
  union all
  select 'pointages', count(*) from public.pointages where entreprise_id in (select entreprise_id from cible) and tache like '[PILOTE]%'
  union all
  select 'fournisseurs', count(*) from public.fournisseurs where entreprise_id in (select entreprise_id from cible) and reference like 'PILOTE-FRN-%'
  union all
  select 'articles_stock', count(*) from public.articles_stock where entreprise_id in (select entreprise_id from cible) and reference like 'PILOTE-STK-%'
  union all
  select 'commandes_fournisseurs', count(*) from public.commandes_fournisseurs where entreprise_id in (select entreprise_id from cible) and numero like 'CMD-PILOTE-%'
  union all
  select 'notes_frais', count(*) from public.notes_frais where entreprise_id in (select entreprise_id from cible) and commentaire_salarie like '[PILOTE]%'
  union all
  select 'demandes_conges', count(*) from public.demandes_conges where entreprise_id in (select entreprise_id from cible) and commentaire like '[PILOTE]%'
)
select
  a.cle as "Contrôle",
  a.attendu as "Attendu",
  coalesce(r.reel, 0) as "Réel",
  case when coalesce(r.reel, 0) = a.attendu then 'OK' else 'ÉCART' end as "Statut"
from attendus a
left join reels r using (cle)
order by a.cle;

-- Contrôles qualitatifs complémentaires (pas des comptages) : à lire, pas à faire échouer un CI.
select 'factures par statut' as "Contrôle qualitatif", statut, count(*)
from public.factures
where entreprise_id in (select id from public.entreprises where reference_interne='PILOTE-BTP-V1')
group by statut order by statut;

select 'devis par statut' as "Contrôle qualitatif", statut, count(*)
from public.devis
where entreprise_id in (select id from public.entreprises where reference_interne='PILOTE-BTP-V1')
group by statut order by statut;

select 'répartition des 5 profils demandés' as "Contrôle qualitatif", p.nom, count(*)
from public.employes e
join public.postes p on p.id=e.poste_id
where e.entreprise_id in (select id from public.entreprises where reference_interne='PILOTE-BTP-V1')
group by p.nom order by p.nom;

-- Isolation multi-tenant : aucune ligne "PILOTE-%" ne doit exister hors de l'entreprise cible.
select 'isolation tenant' as "Contrôle qualitatif", 'clients hors PILOTE-BTP-V1' as detail, count(*)
from public.clients c
join public.entreprises e on e.id=c.entreprise_id
where c.reference_interne like 'PILOTE-CLI-%' and e.reference_interne<>'PILOTE-BTP-V1';
