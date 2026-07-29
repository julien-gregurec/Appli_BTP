-- Complément idempotent du jeu de recette « Entreprise Test ».
-- Ajoute des coordonnées chantier, des sessions arrivée/départ, des contrôles
-- GPS toutes les 30 minutes et synchronise les tâches des devis acceptés.

set statement_timeout = '10min';

do $seed$
declare
  v_entreprise uuid;
  v_devis record;
begin
  select id
  into v_entreprise
  from public.entreprises
  where lower(btrim(nom)) = 'entreprise test'
     or lower(coalesce(raison_sociale, '')) = 'entreprise test'
  order by created_at
  limit 1;

  if v_entreprise is null then
    raise exception 'Entreprise Test introuvable';
  end if;

  update public.entreprises
  set suivi_zone_actif = true,
      suivi_zone_frequence_minutes = 30,
      updated_at = now()
  where id = v_entreprise;

  with numerotes as (
    select id, row_number() over(order by created_at, id) as numero
    from public.chantiers
    where entreprise_id = v_entreprise
  )
  update public.chantiers c
  set latitude = 45.7480000 + ((n.numero % 35)::numeric / 1000),
      longitude = 4.8100000 + ((n.numero % 40)::numeric / 1000),
      rayon_metres = 300
  from numerotes n
  where c.id = n.id;

  delete from public.sessions_pointage
  where entreprise_id = v_entreprise
    and commentaire = '[RECETTE TERRAIN] Session arrivée/départ contrôlée';

  insert into public.sessions_pointage(
    entreprise_id, employe_id, chantier_id, arrivee_at, depart_at,
    pause_minutes, latitude_arrivee, longitude_arrivee,
    precision_arrivee_metres, latitude_depart, longitude_depart,
    precision_depart_metres, tache, commentaire, pointage_id,
    created_at, updated_at
  )
  select
    p.entreprise_id,
    p.employe_id,
    p.chantier_id,
    p.date::timestamptz + interval '7 hours',
    p.date::timestamptz + interval '15 hours 15 minutes',
    p.pause_minutes,
    c.latitude + 0.00008,
    c.longitude + 0.00006,
    coalesce(p.precision_metres, 12),
    c.latitude + 0.00005,
    c.longitude + 0.00004,
    10,
    p.tache,
    '[RECETTE TERRAIN] Session arrivée/départ contrôlée',
    p.id,
    p.date::timestamptz + interval '7 hours',
    p.date::timestamptz + interval '15 hours 15 minutes'
  from (
    select *
    from public.pointages
    where entreprise_id = v_entreprise
      and chantier_id is not null
    order by date desc, created_at desc
    limit 240
  ) p
  join public.chantiers c on c.id = p.chantier_id
  where c.latitude is not null and c.longitude is not null;

  insert into public.verifications_zone_pointage(
    entreprise_id, session_id, employe_id, chantier_id,
    latitude, longitude, precision_metres, distance_metres,
    dans_zone, created_at
  )
  select
    s.entreprise_id,
    s.id,
    s.employe_id,
    s.chantier_id,
    c.latitude + case when gs.numero = 9 and abs(hashtext(s.id::text)) % 11 = 0 then 0.0042 else 0.00007 end,
    c.longitude + case when gs.numero = 9 and abs(hashtext(s.id::text)) % 11 = 0 then 0.0042 else 0.00005 end,
    9 + (gs.numero % 5),
    case when gs.numero = 9 and abs(hashtext(s.id::text)) % 11 = 0 then 575 else 11 + gs.numero end,
    not (gs.numero = 9 and abs(hashtext(s.id::text)) % 11 = 0),
    s.arrivee_at + make_interval(mins => gs.numero * 30)
  from public.sessions_pointage s
  join public.chantiers c on c.id = s.chantier_id
  cross join generate_series(1, 15) as gs(numero)
  where s.entreprise_id = v_entreprise
    and s.commentaire = '[RECETTE TERRAIN] Session arrivée/départ contrôlée';

  for v_devis in
    select d.id
    from public.devis d
    where d.entreprise_id = v_entreprise
      and d.statut = 'accepte'
      and d.chantier_id is not null
  loop
    perform public.synchroniser_taches_devis_accepte(v_devis.id);
  end loop;

  insert into public.prestations_catalogue(
    entreprise_id, designation, description, type, unite,
    prix_unitaire_ht, taux_tva, actif
  )
  select v_entreprise, p.designation, p.description, p.type, p.unite, p.prix, p.tva, true
  from (values
    ('Pose cloison placo', 'Implantation, ossature, plaques et finitions prêtes à peindre', 'main_oeuvre', 'm²', 38.00, 10.00),
    ('Dépose ancienne cloison', 'Protection, dépose, tri et évacuation des déchets', 'main_oeuvre', 'm²', 22.00, 10.00),
    ('Ratissage murs', 'Préparation et ratissage complet avant finition', 'main_oeuvre', 'm²', 18.00, 10.00),
    ('Peinture plafond', 'Préparation et application de deux couches', 'main_oeuvre', 'm²', 24.00, 10.00),
    ('Fourniture plaque BA13', 'Plaque de plâtre standard BA13', 'fourniture', 'u', 14.50, 20.00),
    ('Pose sol stratifié', 'Sous-couche, pose flottante et plinthes', 'main_oeuvre', 'm²', 32.00, 10.00),
    ('Cabine sanitaire complète', 'Fourniture et pose d’une cabine sanitaire stratifiée', 'forfait', 'u', 1280.00, 20.00),
    ('Panneaux décoratifs muraux', 'Fourniture et pose sur ossature adaptée', 'forfait', 'm²', 145.00, 20.00)
  ) as p(designation, description, type, unite, prix, tva)
  on conflict (entreprise_id, designation) do update
  set description = excluded.description,
      type = excluded.type,
      unite = excluded.unite,
      prix_unitaire_ht = excluded.prix_unitaire_ht,
      taux_tva = excluded.taux_tva,
      actif = true,
      updated_at = now();
end
$seed$;

select
  e.nom as "Entreprise",
  (select count(*) from public.sessions_pointage s
    where s.entreprise_id = e.id
      and s.commentaire = '[RECETTE TERRAIN] Session arrivée/départ contrôlée') as "Sessions terrain",
  (select count(*) from public.verifications_zone_pointage v
    join public.sessions_pointage s on s.id = v.session_id
    where v.entreprise_id = e.id
      and s.commentaire = '[RECETTE TERRAIN] Session arrivée/départ contrôlée') as "Contrôles GPS",
  (select count(*) from public.taches t
    join public.chantiers c on c.id = t.chantier_id
    where c.entreprise_id = e.id and t.devis_id is not null) as "Tâches issues des devis"
from public.entreprises e
where lower(btrim(e.nom)) = 'entreprise test'
   or lower(coalesce(e.raison_sociale, '')) = 'entreprise test'
limit 1;
