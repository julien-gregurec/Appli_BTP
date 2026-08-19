-- TERRAIN-MOBILE-V1B : droit granulaire pour la contribution terrain sur un
-- chantier (photos, documents non contractuels, comptes-rendus), sans exiger
-- gerer_chantiers qui reste réservé à la gestion complète d'un chantier
-- (modification, suppression, budget, client, planning).
--
-- Cause corrigée (audit TERRAIN-MOBILE-V1) : ajouterDocumentChantierAction et
-- enregistrerCompteRenduAction sont bloqués côté RLS/middleware par une règle
-- générique qui exige gerer_chantiers pour toute écriture sous /chantiers/*,
-- droit jamais accordé à un poste terrain (Ouvrier, Chef d'équipe) par défaut.

insert into public.permissions_disponibles (cle, module, description) values
  ('ajouter_documents_chantier', 'Chantiers', 'Ajouter des photos, documents et comptes-rendus depuis un chantier, sans droit de gestion du chantier')
on conflict (cle) do nothing;

-- documents_chantier : ajout terrain autorisé, suppression toujours réservée
-- à gerer_chantiers (comportement déjà existant, conservé à l'identique —
-- policies role_gestion_update / role_gestion_delete / documents_chantier_
-- suppression / documents_chantier_modification inchangées).
--
-- L'INSERT est aussi verrouillé par une policy RESTRICTIVE générique
-- (role_gestion_insert, créée par 20260713000043_permissions_rls_gestion.sql)
-- qui exige gerer_chantiers sans alternative : une policy PERMISSIVE seule ne
-- suffit donc pas, il faut aussi élargir cette policy RESTRICTIVE pour cette
-- seule table (les autres tables couvertes par le même mécanisme générique —
-- chantiers, types_chantier, contacts_clients, taches, chantier_transferts,
-- lignes_devis, lignes_factures, paiements — restent inchangées).
create policy documents_chantier_ajout_terrain on public.documents_chantier
  for insert to authenticated
  with check (
    est_membre_actif(entreprise_id)
    and a_permission(entreprise_id, 'ajouter_documents_chantier')
  );

drop policy if exists role_gestion_insert on public.documents_chantier;
create policy role_gestion_insert on public.documents_chantier as restrictive
  for insert to authenticated
  with check (
    a_permission(entreprise_id, 'gerer_chantiers')
    or a_permission(entreprise_id, 'ajouter_documents_chantier')
  );

-- comptes_rendus_chantier : la policy existante ("ALL", membre actif
-- uniquement) n'imposait aucune permission de gestion, contrairement à
-- l'intention produit ("Ne rends pas le compte rendu accessible à tout le
-- monde sans contrôle"). Remplacée par une lecture ouverte à tout membre actif
-- (inchangé pour la consultation) et une écriture qui exige gerer_chantiers
-- ou le nouveau droit terrain.
drop policy if exists comptes_rendus_chantier_membres on public.comptes_rendus_chantier;

create policy comptes_rendus_chantier_lecture on public.comptes_rendus_chantier
  for select to authenticated
  using (est_membre_actif(entreprise_id));

create policy comptes_rendus_chantier_ecriture on public.comptes_rendus_chantier
  for insert to authenticated
  with check (
    est_membre_actif(entreprise_id)
    and (a_permission(entreprise_id, 'gerer_chantiers') or a_permission(entreprise_id, 'ajouter_documents_chantier'))
  );

create policy comptes_rendus_chantier_modification on public.comptes_rendus_chantier
  for update to authenticated
  using (est_membre_actif(entreprise_id) and a_permission(entreprise_id, 'gerer_chantiers'))
  with check (est_membre_actif(entreprise_id) and a_permission(entreprise_id, 'gerer_chantiers'));

create policy comptes_rendus_chantier_suppression on public.comptes_rendus_chantier
  for delete to authenticated
  using (est_membre_actif(entreprise_id) and a_permission(entreprise_id, 'gerer_chantiers'));

-- Le bucket de stockage chantier-documents est verrouillé par la même
-- mécanique RESTRICTIVE générique (role_gestion_fichiers_insert, partagée
-- avec 4 autres buckets — factures-fournisseurs, documents-employes,
-- entreprise-assets, pointage-preuves — dont le comportement reste inchangé).
-- Sans cet ajustement, l'upload physique du fichier échouerait même une fois
-- l'insertion dans documents_chantier autorisée ci-dessus.
drop policy if exists role_gestion_fichiers_insert on storage.objects;
create policy role_gestion_fichiers_insert on storage.objects as restrictive for insert to authenticated with check (
  case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
      or public.a_permission(((storage.foldername(name))[1])::uuid,'ajouter_documents_chantier')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end
);

-- Attribution par défaut aux postes terrain usuels, en cohérence avec la
-- migration de référence 20260713000046_roles_terrain_par_defaut.sql.
insert into public.permissions_poste(entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, 'ajouter_documents_chantier', true
from public.postes p
where lower(p.nom) in ('ouvrier', 'salarié', 'salarie', 'chef d''équipe', 'chef d equipe', 'chef de chantier')
on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

notify pgrst, 'reload schema';
