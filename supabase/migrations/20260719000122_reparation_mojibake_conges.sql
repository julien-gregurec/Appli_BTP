-- Réparation : accents corrompus sur « Congé approuvé » (affectations.tache).
--
-- Le fichier de migration d'origine (20260713000062) est en UTF-8 correct
-- dans le dépôt. Mais la fonction transition_demande_conge, une fois collée
-- dans le SQL Editor Supabase, a pu être corrompue par un pbcopy sans locale
-- UTF-8 (incident déjà rencontré sur ce projet — cf. migrations 86 à 88).
-- Chaque approbation de congé insérait alors « Cong√© approuv√© » au lieu de
-- « Congé approuvé » dans affectations.tache, visible sur le tableau de bord.
--
-- 1) Recompile la fonction à l'identique, en collant directement depuis ce
--    fichier (jamais via le presse-papier) pour garantir un encodage propre.
-- 2) Corrige les lignes déjà insérées avec l'accent corrompu.

create or replace function public.transition_demande_conge(p_demande_id uuid,p_action text,p_message text default null)
returns void language plpgsql security definer set search_path=public as $$
declare d public.demandes_conges;v_propre boolean;v_gere boolean;v_jour date;v_heures numeric;
begin
  select * into d from public.demandes_conges where id=p_demande_id for update;
  if not found or not public.est_membre_actif(d.entreprise_id) then raise exception 'Demande inaccessible';end if;
  v_propre:=public.est_employe_du_compte(d.entreprise_id,d.employe_id);
  v_gere:=public.a_permission(d.entreprise_id,'gerer_conges');
  if p_action='soumettre' and v_propre and d.statut='brouillon' then
    update public.demandes_conges set statut='soumise',soumis_at=now(),updated_at=now() where id=d.id;
  elsif p_action='annuler' and v_propre and d.statut in ('brouillon','soumise') then
    update public.demandes_conges set statut='annulee',updated_at=now() where id=d.id;
  elsif p_action='approuver' and v_gere and d.statut='soumise' then
    update public.demandes_conges set statut='approuvee',motif_decision=nullif(btrim(p_message),''),decide_par=auth.uid(),decide_at=now(),updated_at=now() where id=d.id;
    v_jour:=d.date_debut;
    while v_jour<=d.date_fin loop
      if extract(isodow from v_jour)<6 then
        v_heures:=7;
        if d.date_debut=d.date_fin and (d.demi_jour_debut<>'journee' or d.demi_jour_fin<>'journee') then v_heures:=3.5;
        elsif v_jour=d.date_debut and d.demi_jour_debut<>'journee' then v_heures:=3.5;
        elsif v_jour=d.date_fin and d.demi_jour_fin<>'journee' then v_heures:=3.5;end if;
        insert into public.affectations(entreprise_id,chantier_id,employe_id,date,heures,tache,type_activite,lieu_activite,demande_conge_id)
        values(d.entreprise_id,null,d.employe_id,v_jour,v_heures,'Congé approuvé','conge',null,d.id)
        on conflict(demande_conge_id,date) where demande_conge_id is not null do nothing;
      end if;
      v_jour:=v_jour+1;
    end loop;
  elsif p_action='refuser' and v_gere and d.statut='soumise' then
    if nullif(btrim(p_message),'') is null then raise exception 'Le motif du refus est obligatoire';end if;
    update public.demandes_conges set statut='refusee',motif_decision=btrim(p_message),decide_par=auth.uid(),decide_at=now(),updated_at=now() where id=d.id;
  else raise exception 'Action non autorisée';end if;
end;$$;

-- Motif large (Cong…approuv…) plutôt que les octets corrompus exacts :
-- corrige toute variante d'encodage cassé, sans dépendre de la forme précise.
update public.affectations
  set tache = 'Congé approuvé'
  where type_activite = 'conge'
    and tache ilike 'cong%approuv%'
    and tache <> 'Congé approuvé';

notify pgrst, 'reload schema';
