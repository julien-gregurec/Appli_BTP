-- PT-08 (recette pilote) : « Créer une fiche de pointage pour un salarié depuis
-- l'administration → pointage créé au nom du salarié, tracé comme
-- régularisation ».
--
-- Reproduit par exécution réelle : aucun chemin ne le permet.
--   * INSERT direct : la policy RESTRICTIVE role_gestion_insert de
--     public.pointages est `WITH CHECK (false)` pour `authenticated` — même le
--     dirigeant (tous droits) est refusé ; c'est voulu, toute création de
--     pointage passe par une RPC SECURITY DEFINER qui calcule les heures ;
--   * les seules RPC de création (cloturer_session_pointage,
--     declarer_pointage_oublie) prennent l'employé depuis auth.uid() : un
--     responsable ne peut créer qu'un pointage à SON nom ;
--   * la valeur 'regularisation_responsable' existe dans le CHECK
--     pointages_origine_pointage_check depuis 20260715000081, mais aucune
--     fonction ni écran ne l'écrit.
--
-- Correctif : RPC creer_pointage_regularisation, calquée sur
-- declarer_pointage_oublie (20260723000130) — même calcul d'heures (fuseau
-- Europe/Paris, pause, heures attendues du jour → normales/supplémentaires),
-- même fenêtre de 31 jours, même statut initial `a_verifier` pour que le
-- pointage repasse par le workflow de validation existant (PT-05/PT-06) —
-- avec trois différences :
--   * droit requis : `gerer_pointage` (celui qui autorise déjà à modifier et
--     supprimer un pointage, role_gestion_update/delete) ;
--   * l'employé est un paramètre, contrôlé : actif, même entreprise ;
--   * motif obligatoire, conservé, et auteur tracé (nouvelle colonne
--     `regularise_par`) ; origine `regularisation_responsable`.
-- Le salarié concerné est notifié : un pointage saisi à son nom ne doit pas lui
-- être invisible.

alter table public.pointages
  add column if not exists regularise_par uuid references public.utilisateurs(id) on delete set null;

comment on column public.pointages.regularise_par is
  'PT-08 : utilisateur ayant saisi ce pointage au nom du salarié (origine_pointage = ''regularisation_responsable'').';

create or replace function public.creer_pointage_regularisation(
  p_entreprise_id uuid,
  p_employe_id uuid,
  p_chantier_id uuid,
  p_date date,
  p_arrivee time,
  p_depart time,
  p_pause_minutes integer,
  p_motif text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debut timestamptz;
  v_fin timestamptz;
  v_total numeric;
  v_attendu numeric;
  v_id uuid;
  v_motif text := nullif(btrim(coalesce(p_motif, '')), '');
  v_salarie uuid;
begin
  if auth.uid() is null or not public.a_permission(p_entreprise_id, 'gerer_pointage') then
    raise exception 'POINTAGE_REGULARISATION_REFUSEE'
      using errcode = '42501', hint = 'Droit « gerer_pointage » requis.';
  end if;
  if v_motif is null or length(v_motif) < 5 or length(v_motif) > 500 then
    raise exception '%', ('Motif de r'||chr(233)||'gularisation obligatoire (5 '||chr(224)||' 500 caract'||chr(232)||'res)');
  end if;
  select utilisateur_id into v_salarie
    from public.employes
   where id = p_employe_id and entreprise_id = p_entreprise_id and statut = 'actif';
  if not found then
    raise exception '%', ('Salari'||chr(233)||' introuvable ou inactif');
  end if;
  if p_date is null or p_date > current_date or p_date < current_date - interval '31 days' then
    raise exception '%', ('La r'||chr(233)||'gularisation est limit'||chr(233)||'e aux 31 derniers jours');
  end if;
  if not exists (
    select 1 from public.chantiers
     where id = p_chantier_id and entreprise_id = p_entreprise_id and statut not in ('archive', 'annule')
  ) then
    raise exception 'Chantier invalide';
  end if;
  if p_arrivee is null or p_depart is null then
    raise exception '%', ('Heures d'''||chr(233)||'arriv'||chr(233)||'e et de d'||chr(233)||'part obligatoires');
  end if;

  v_debut := (p_date + p_arrivee) at time zone 'Europe/Paris';
  v_fin := (p_date + p_depart) at time zone 'Europe/Paris';
  if v_fin <= v_debut then v_fin := v_fin + interval '1 day'; end if;
  v_total := round(extract(epoch from (v_fin - v_debut)) / 3600.0 - coalesce(p_pause_minutes, 0) / 60.0, 2);
  if v_total < 0.25 or v_total > 24 then
    raise exception '%', ('Dur'||chr(233)||'e travaill'||chr(233)||'e invalide');
  end if;
  select coalesce((horaires_journaliers ->> extract(isodow from p_date)::integer::text)::numeric, 0)
    into v_attendu
    from public.entreprises where id = p_entreprise_id;

  insert into public.pointages (
    entreprise_id, employe_id, chantier_id, date,
    heures_normales, heures_supplementaires, pause_minutes, commentaire,
    verification_statut, heures_attendues, anomalie_niveau, anomalie_motif,
    origine_pointage, regularise_par
  ) values (
    p_entreprise_id, p_employe_id, p_chantier_id, p_date,
    least(v_total, v_attendu), greatest(v_total - v_attendu, 0), greatest(coalesce(p_pause_minutes, 0), 0), v_motif,
    'a_verifier', v_attendu, 'verification',
    'R'||chr(233)||'gularisation saisie par un responsable '||chr(183)||' '||v_motif,
    'regularisation_responsable', auth.uid()
  ) returning id into v_id;

  if v_salarie is not null and v_salarie <> auth.uid() then
    perform public.notifier_utilisateur(
      p_entreprise_id, v_salarie, 'pointage_regularise',
      'Pointage saisi '||chr(224)||' votre nom',
      to_char(p_date, 'DD/MM/YYYY')||' '||chr(183)||' '||v_total||' h '||chr(183)||' '||v_motif,
      '/pointage', 'information', 'pointage', v_id
    );
  end if;
  return v_id;
end;
$$;

comment on function public.creer_pointage_regularisation(uuid, uuid, uuid, date, time, time, integer, text) is
  'PT-08 : un responsable (gerer_pointage) crée un pointage au nom d''un salarié actif de son entreprise, motif obligatoire, origine regularisation_responsable, auteur dans regularise_par, statut a_verifier.';

revoke all on function public.creer_pointage_regularisation(uuid, uuid, uuid, date, time, time, integer, text) from public, anon;
grant execute on function public.creer_pointage_regularisation(uuid, uuid, uuid, date, time, time, integer, text) to authenticated, service_role;

notify pgrst, 'reload schema';
