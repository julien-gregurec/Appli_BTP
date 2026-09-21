-- Décor de recette des LISTES IMPRIMABLES (base jetable uniquement).
--
-- Les listes PDF ne se jugent pas sur une réserve : il faut assez de matière pour que
-- chaque vue métier retourne un ensemble DIFFÉRENT, et que la mise en page A4 soit
-- réellement mise à l'épreuve (pagination, colonnes, retards, plusieurs entreprises).
--
-- Ce jeu ajoute donc : une seconde entreprise intervenante, un plan IMAGE (le seul type
-- dont le document peut tirer une miniature), et un éventail de réserves couvrant tous
-- les statuts du workflow, avec des échéances volontairement dépassées.

do $$
begin
  if not exists (
    select 1 from public.reserves_chantiers
    where id = 'e0000000-0000-0000-0000-000000000001'
      and nom = 'RECETTE_A_Groupe scolaire'
  ) then
    raise exception 'Décor de recette introuvable : base jetable attendue.';
  end if;
end $$;

-- ── Seconde entreprise intervenante (cloisonnement à démontrer) ─────────────
insert into public.reserves_intervenants (
  id, entreprise_id, chantier_id, nom, corps_etat, raison_sociale,
  contact_nom, email_contact, created_by
) values (
  'e2000000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001','Menuiserie C','Menuiserie',
  'MENUISERIE C SARL','Camille M.','gerant-c@invalid.local',
  '10000000-0000-0000-0000-000000000001'
) on conflict (id) do nothing;

-- ── Plan IMAGE : c'est lui qui porte la miniature et le marqueur ────────────
insert into public.reserves_plans (
  id, entreprise_id, chantier_id, nom, niveau, zone, mime_type,
  storage_path, nom_fichier, nb_pages, ordre, created_by
) values (
  'e3000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001','Plan R+1','R+1','Aile Est','image/png',
  'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/e3000000-0000-0000-0000-000000000002/plan-r1.png',
  'plan-r1.png', 1, 1, '10000000-0000-0000-0000-000000000001'
) on conflict (id) do nothing;

-- ── Éventail de réserves ────────────────────────────────────────────────────
-- Les dates sont RELATIVES à l'exécution : le décor reste juste quel que soit le jour
-- où la recette est rejouée, ce qu'une date figée ne garantit pas.
insert into public.reserves (
  id, entreprise_id, chantier_id, numero, titre, description, statut, priorite,
  intervenant_id, plan_id, plan_page, position_x, position_y, echeance, cree_par,
  created_at, assignee_at, acceptee_at, levee_demandee_at, levee_at
)
select
  v.id, 'a0000000-0000-0000-0000-000000000001',
  'e0000000-0000-0000-0000-000000000001', v.numero, v.titre, v.description,
  v.statut, v.priorite, v.intervenant_id, v.plan_id, v.plan_page,
  v.position_x, v.position_y, v.echeance, '10000000-0000-0000-0000-000000000001',
  now() - (v.age || ' days')::interval,
  case when v.statut <> 'emise' then now() - (v.age || ' days')::interval end,
  case when v.statut in ('acceptee','levee_demandee','levee_refusee','levee')
       then now() - (v.age || ' days')::interval end,
  case when v.statut in ('levee_demandee','levee_refusee','levee')
       then now() - interval '2 days' end,
  case when v.statut = 'levee' then now() - interval '1 day' end
from (values
  -- id, n°, titre, description, statut, priorité, intervenant, plan, page, x, y, échéance, âge(j)
  ('e5000000-0000-0000-0000-000000000101'::uuid, 101,
   'Relevé d’étanchéité insuffisant',
   'Le relevé ne monte pas à 15 cm au-dessus du niveau fini sur l’ensemble de l’acrotère Est.',
   'assignee','bloquante','e2000000-0000-0000-0000-00000000000b'::uuid,
   'e3000000-0000-0000-0000-000000000002'::uuid, 1, 0.61250, 0.32000,
   (current_date - 5), 20),
  ('e5000000-0000-0000-0000-000000000102'::uuid, 102,
   'Calfeutrement de menuiserie incomplet',
   'Joint périphérique absent sur trois fenêtres de la salle 104.',
   'acceptee','haute','e2000000-0000-0000-0000-00000000000c'::uuid,
   'e3000000-0000-0000-0000-000000000002'::uuid, 1, 0.24000, 0.71000,
   (current_date - 2), 18),
  ('e5000000-0000-0000-0000-000000000103'::uuid, 103,
   'Seuil de porte non conforme PMR',
   'Ressaut mesuré à 3,4 cm ; le seuil doit être ramené à 2 cm maximum.',
   'levee_demandee','haute','e2000000-0000-0000-0000-00000000000c'::uuid,
   'e3000000-0000-0000-0000-000000000002'::uuid, 1, 0.80000, 0.55000,
   (current_date + 7), 15),
  ('e5000000-0000-0000-0000-000000000104'::uuid, 104,
   'Fissure en sous-face de dalle',
   'Fissure traversante d’environ 40 cm, à traiter avant mise en peinture.',
   'levee','normale','e2000000-0000-0000-0000-00000000000b'::uuid,
   'e3000000-0000-0000-0000-000000000002'::uuid, 1, 0.45000, 0.18000,
   (current_date - 10), 30),
  ('e5000000-0000-0000-0000-000000000105'::uuid, 105,
   'Plinthe descellée couloir Nord',
   'Sur trois mètres linéaires, reprise du collage à prévoir.',
   'emise','basse', null, null, null, null, null,
   (current_date + 21), 3),
  ('e5000000-0000-0000-0000-000000000106'::uuid, 106,
   'Reprise de peinture refusée',
   'La teinte appliquée ne correspond pas au nuancier contractuel.',
   'levee_refusee','haute','e2000000-0000-0000-0000-00000000000b'::uuid,
   null, null, null, null, (current_date - 1), 12),
  ('e5000000-0000-0000-0000-000000000107'::uuid, 107,
   'Réserve annulée après visite',
   'Constat levé sur place : l’ouvrage était conforme au CCTP.',
   'annulee','normale','e2000000-0000-0000-0000-00000000000c'::uuid,
   null, null, null, null, (current_date - 8), 9),
  ('e5000000-0000-0000-0000-000000000108'::uuid, 108,
   'Responsabilité refusée — lot voisin',
   'Ouvrage non exécuté par nos équipes ; relève du lot serrurerie.',
   'refusee_responsabilite','normale','e2000000-0000-0000-0000-00000000000b'::uuid,
   null, null, null, null, (current_date - 3), 7)
) as v(id, numero, titre, description, statut, priorite, intervenant_id,
       plan_id, plan_page, position_x, position_y, echeance, age)
on conflict (id) do nothing;

-- ── Historique : c'est lui qui porte les MOTIFS lus en réunion ──────────────
-- `reserves_historique` n'a pas de clé naturelle : `on conflict` n'y dédoublonnerait
-- rien. Le décor devant rester rejouable, chaque ligne n'est insérée que si le même
-- motif n'y figure pas déjà.
insert into public.reserves_historique (
  entreprise_id, reserve_id, action, statut_avant, statut_apres, commentaire, auteur_id
)
select v.entreprise_id, v.reserve_id, v.action, v.statut_avant, v.statut_apres,
       v.commentaire, v.auteur_id
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000103'::uuid,
   'demande_levee','acceptee','levee_demandee',
   'Seuil rectifié le 12, ressaut ramené à 1,8 cm.','10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000104'::uuid,
   'levee_validee','levee_demandee','levee',
   'Reprise conforme, vérifiée en présence du maître d’œuvre.','10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000106'::uuid,
   'levee_refusee','levee_demandee','levee_refusee',
   'Teinte non conforme au nuancier : reprise à refaire intégralement.','10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000108'::uuid,
   'refus_responsabilite','assignee','refusee_responsabilite',
   'Ouvrage exécuté par le lot serrurerie ; voir marché n°7.','10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000107'::uuid,
   'annulation','assignee','annulee',
   'Constat erroné : ouvrage conforme au CCTP.','10000000-0000-0000-0000-000000000001'::uuid)
) as v(entreprise_id, reserve_id, action, statut_avant, statut_apres, commentaire, auteur_id)
where not exists (
  select 1 from public.reserves_historique h
  where h.reserve_id = v.reserve_id and h.action = v.action
    and h.commentaire is not distinct from v.commentaire
);

-- ── Photos ──────────────────────────────────────────────────────────────────
-- Les objets eux-mêmes sont déposés dans le bucket par `amorcer-recette-v4.sh` : sans
-- eux, l'option « avec / sans photos » ne serait pas réellement mise à l'épreuve.
--
-- Le CHEMIN est contraint par les politiques de stockage : `entreprise/chantier/réserve/
-- fichier` pour une photo, `entreprise/chantier/plan/fichier` pour un plan. Un chemin qui
-- ne décrit pas ce triplet est refusé à la lecture, donc l'URL signée n'est jamais émise
-- et l'image manque silencieusement dans le document.
-- `disponible_at` marque la fin effective du dépôt dans le bucket : les exports ne
-- montrent QUE des photos disponibles, pour ne jamais imprimer une image qui n'aurait
-- pas fini d'être téléversée. Le décor doit donc la renseigner explicitement.
insert into public.reserves_photos (
  entreprise_id, reserve_id, storage_path, usage, legende, mime_type,
  taille_octets, ajoutee_par, ajoutee_par_entreprise_id, largeur, hauteur, disponible_at
)
select v.entreprise_id, v.reserve_id, v.storage_path, v.usage, v.legende, 'image/jpeg',
       v.taille, v.auteur, v.entreprise_id, 1600, 1200, now()
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000101'::uuid,
   'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/e5000000-0000-0000-0000-000000000101/photo-constat.jpg',
   'constat','Acrotère Est — relevé insuffisant',23821,'10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000103'::uuid,
   'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/e5000000-0000-0000-0000-000000000103/photo-travaux.jpg',
   'travaux','Seuil rectifié',30076,'10000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000001'::uuid,'e5000000-0000-0000-0000-000000000104'::uuid,
   'a0000000-0000-0000-0000-000000000001/e0000000-0000-0000-0000-000000000001/e5000000-0000-0000-0000-000000000104/photo-levee.jpg',
   'levee','Reprise validée',21883,'10000000-0000-0000-0000-000000000001'::uuid)
) as v(entreprise_id, reserve_id, storage_path, usage, legende, taille, auteur)
where not exists (
  select 1 from public.reserves_photos p
  where p.reserve_id = v.reserve_id and p.storage_path = v.storage_path
);
