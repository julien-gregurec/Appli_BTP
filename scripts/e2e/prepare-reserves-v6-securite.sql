-- Décor de la recette ADVERSARIALE ELSATIA Réserves V6.
--
-- Le décor V3/V4/V5 ne comporte qu'une organisation HÔTE. Il permet de vérifier le
-- cloisonnement entre un hôte et son entreprise intervenante, mais pas celui entre DEUX
-- organisations clientes sans lien — qui est le cas le plus fréquent en production, et
-- celui dont une défaillance serait la plus grave.
--
-- Ce script ouvre donc Réserves à l'organisation B du jeu d'isolation multi-tenant, lui
-- donne un chantier et une réserve, et rien d'autre. A et B n'ont AUCUNE relation : ni
-- invitation, ni intervention, ni chantier commun. Toute donnée de l'une visible depuis
-- l'autre est, par construction, une fuite.
--
-- Rejouable : chaque insertion est idempotente.

begin;

-- ── Accès applicatif de l'organisation B ────────────────────────────────────
insert into public.acces_applications_entreprises (
  entreprise_id, application_code, autorise, source
) values (
  'b0000000-0000-0000-0000-000000000001', 'reserves', true, 'recette_securite_v6'
)
on conflict (entreprise_id, application_code) do update set autorise = true;

insert into public.habilitations_applications_utilisateurs (
  entreprise_id, utilisateur_id, application_code, role_code, autorise
) values (
  'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
  'reserves', 'reserves_admin_organisation', true
)
on conflict (entreprise_id, utilisateur_id, application_code)
  do update set role_code = excluded.role_code, autorise = true;

-- ── Chantier et réserve propres à B ─────────────────────────────────────────
insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville, created_by)
values (
  'e0000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001',
  'RECETTE_B_Chantier prive', 'B-2026', 'Mulhouse',
  '20000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

-- Le titre est un MARQUEUR : s'il apparaît dans un écran, un export ou une réponse d'API
-- servis à l'organisation A, la fuite est prouvée sans ambiguïté.
insert into public.reserves (
  id, entreprise_id, chantier_id, titre, description, statut, priorite, cree_par
) values (
  'e5000000-0000-0000-0000-0000000000b1', 'b0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-0000000000b1', 'MARQUEUR_SECRET_B_ne_doit_jamais_fuiter',
  'Description confidentielle de l''organisation B.', 'emise', 'haute',
  '20000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

commit;
