-- Preview uniquement : dérive de schéma « hors migration » (cf. en-tête de la migration 20260826000235).
-- Le ledger canonique déclare plateforme_admins.utilisateur_id NULLABLE (235) et la contrainte
-- plateforme_admins_statut_coherent_check (236) exige NULL pour le statut « en_attente » ; la preview porte
-- un NOT NULL posé à la main, qui fait échouer la migration 266 (ExecConstraints précède ON CONFLICT).
alter table public.plateforme_admins alter column utilisateur_id drop not null;
-- Postes orphelins (entreprise absente malgré la FK ON DELETE CASCADE : reliquats de jeux de test
-- d1…0099, fb…0099, fb…0097, 1e…0099, tous « Compte dépôt », sans utilisateur, employé ni permission).
-- Ils font échouer la 282, qui pose deux permissions sur chaque poste existant.
delete from public.postes p
where not exists (select 1 from public.entreprises e where e.id = p.entreprise_id)
  and not exists (select 1 from public.utilisateurs_entreprises ue where ue.poste_id = p.id)
  and not exists (select 1 from public.employes em where em.poste_id = p.id);
