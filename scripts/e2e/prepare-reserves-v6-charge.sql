-- Décor de CHARGE de la recette V6 : un chantier volumineux, réaliste.
--
-- Un chantier de réception d'immeuble porte couramment plusieurs centaines de réserves ;
-- un lot livré en une fois peut en porter deux mille. Les écrans, les documents et la
-- mémoire locale de l'appareil doivent tenir à cette échelle — et c'est la seule manière
-- de le savoir autrement qu'en le supposant.
--
-- Le décor est déterministe et rejouable : ré-exécuter ce script ne crée rien de plus.

begin;

insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville, created_by)
values (
  'e0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001',
  'RECETTE_CHARGE 2000 reserves', 'CHARGE-2026', 'Colmar',
  '10000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

-- Une ORGANISATION PROPRE au décor de charge.
--
-- Elle ne sert qu'à porter les réserves volumineuses, et elle existe pour une raison
-- précise : réutiliser l'entreprise intervenante des recettes V3/V5 ferait apparaître une
-- seconde ligne d'intervenant dans l'écran « Entreprises », où la recette V3 révoque
-- « le premier ». Le décor de charge choisirait alors, à l'insu de tous, quelle entreprise
-- se fait révoquer — et ferait échouer une recette parfaitement valide. Un décor ne doit
-- jamais changer le sens d'un autre.
insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion)
values (
  'c0000000-0000-0000-0000-0000000000c1', 'RECETTE_CHARGE_ENTREPRISE',
  'CHARGE RECETTE SARL', '66666666600066', 'Colmar', 'CHARGE-C1'
)
on conflict (id) do nothing;

insert into public.acces_applications_entreprises (
  entreprise_id, application_code, autorise, source
) values (
  'c0000000-0000-0000-0000-0000000000c1', 'reserves', true, 'recette_charge_v6'
)
on conflict (entreprise_id, application_code) do update set autorise = true;

-- Une entreprise intervenante est INDISPENSABLE : la base refuse tout statut autre
-- qu'« émise » sur une réserve sans porteur, et c'est cette contrainte qui garantit
-- qu'aucune réserve attribuée ne se retrouve orpheline. Le décor de charge la respecte
-- comme le ferait un vrai chantier, plutôt que de la contourner.
--
-- Le nom commence par « Z » à dessein : l'écran des entreprises trie par nom, et le décor
-- de charge doit rester en fin de liste, derrière les acteurs des autres recettes.
insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, corps_etat, statut,
  entreprise_intervenante_id, created_by, invite_at, rejoint_at, onboarding_statut
) values (
  'e2000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-0000000000c1', 'Zone de charge — lot unique',
  'Tous corps d''état', 'active', 'c0000000-0000-0000-0000-0000000000c1',
  '10000000-0000-0000-0000-000000000001', now(), now(), 'rattachee'
)
on conflict (id) do nothing;

-- Les triggers de numérotation et d'historisation restent ACTIFS : on mesure le chantier
-- tel qu'il existe réellement, historique compris, pas une version allégée pour la photo.
insert into public.reserves (
  entreprise_id, chantier_id, intervenant_id, titre, description,
  statut, priorite, echeance, cree_par
)
select
  'a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-0000000000c1',
  'e2000000-0000-0000-0000-0000000000c1',
  'Charge n°' || n || ' — reprise de finition',
  'Réserve de charge générée pour la mesure de tenue à ' || n || ' lignes.',
  (array['emise','assignee','acceptee','levee_demandee','levee'])[1 + (n % 5)],
  (array['basse','normale','haute','bloquante'])[1 + (n % 4)],
  current_date + ((n % 60) - 30),
  '10000000-0000-0000-0000-000000000001'
from generate_series(1, 2000) as n
where not exists (
  select 1 from public.reserves r
  where r.chantier_id = 'e0000000-0000-0000-0000-0000000000c1'
);

commit;
