-- Deux alertes demandees par l'utilisateur :
-- 1) Un salarie qui n'a pas du tout pointe un jour ou il etait attendu (horaire > 0,
--    pas de conge approuve ce jour-la) recoit une notification personnelle l'invitant
--    a regulariser (le pointage doit ensuite passer par la validation habituelle).
-- 2) Les responsables (permission valider_pointages) recoivent un rappel quotidien tant
--    qu'il reste des pointages non valides (statut a_verifier ou sans_preuve), pour que
--    "toutes les heures soient validees" comme demande.
--
-- Execute une fois par jour depuis le cron /api/cron/abonnements (le plan Vercel Hobby
-- limite le nombre de crons disponibles, meme raison que convertirEssaisOptionIAExpires
-- et synchroniserPeriodesPaieOuvertes deja greffes sur ce meme cron).

create or replace function public.notifier_pointages_manquants_et_a_valider()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_hier date := current_date - 1;
  v_dow text := extract(isodow from v_hier)::text;
  r record;
  v_count integer;
begin
  -- 1) Pointage manquant hier, alors que le salarie etait attendu.
  insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau)
  select distinct e.entreprise_id, e.utilisateur_id, 'pointage_manquant',
    'Pointage manquant',
    'Vous n''avez pas point'||chr(233)||' le '||to_char(v_hier,'DD/MM/YYYY')||'. R'||chr(233)||'gularisez si besoin.',
    '/pointage', 'attention'
  from public.employes e
  join public.entreprises ent on ent.id = e.entreprise_id
  join public.utilisateurs_entreprises ue on ue.utilisateur_id = e.utilisateur_id and ue.entreprise_id = e.entreprise_id
  where e.statut = 'actif' and e.utilisateur_id is not null
    and ue.statut = 'actif' and ue.pointage_personnel_actif = true
    and coalesce((ent.horaires_journaliers->>v_dow)::numeric, 0) > 0
    and not exists(
      select 1 from public.pointages p
      where p.employe_id = e.id and p.entreprise_id = e.entreprise_id and p.date = v_hier
    )
    and not exists(
      select 1 from public.demandes_conges dc
      where dc.employe_id = e.id and dc.entreprise_id = e.entreprise_id and dc.statut = 'approuvee'
        and v_hier between dc.date_debut and dc.date_fin
    )
    and not exists(
      select 1 from public.notifications_utilisateurs n
      where n.utilisateur_id = e.utilisateur_id and n.type = 'pointage_manquant' and n.created_at::date = current_date
    );

  -- 2) Rappel quotidien aux valideurs tant qu'il reste des heures non validees.
  for r in select id from public.entreprises where abonnement_statut in ('essai','actif') loop
    select count(*) into v_count from public.pointages
      where entreprise_id = r.id and verification_statut in ('a_verifier','sans_preuve');
    if v_count > 0 and not exists(
      select 1 from public.notifications_utilisateurs n
      where n.entreprise_id = r.id and n.type = 'pointages_a_valider' and n.created_at::date = current_date
    ) then
      perform public.notifier_permission(r.id, 'valider_pointages', 'pointages_a_valider',
        'Heures '||chr(224)||' valider',
        v_count||' pointage(s) en attente de validation.',
        '/pointage', 'attention', null, null);
    end if;
  end loop;
end;
$$;
revoke all on function public.notifier_pointages_manquants_et_a_valider() from public,anon,authenticated;
grant execute on function public.notifier_pointages_manquants_et_a_valider() to service_role;

notify pgrst, 'reload schema';
