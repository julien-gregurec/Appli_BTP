-- RENTABILITÉ-V1B, P0 fiabilité : le coût de main-d'œuvre réel était
-- recalculé rétroactivement pour tous les pointages passés d'un salarié
-- dès que son coût horaire changeait (jointure live pointages -> employes
-- dans les trois anciennes implémentations de la marge). Fige le coût
-- horaire au moment où le pointage devient une donnée réelle : sa
-- validation (valider_preuve_pointage, statut 'valide').
--
-- Modèle choisi : snapshot sur le pointage (option A du cahier des charges),
-- plus simple et plus robuste qu'une table d'historique daté séparée, et
-- suffisant puisque aucune action de modification d'un pointage déjà validé
-- n'existe dans l'application (seules existent la suppression et une
-- nouvelle déclaration, qui redéclenchera naturellement une validation et
-- donc un nouveau snapshot au coût alors en vigueur).

alter table public.pointages
  add column cout_horaire_applique numeric(10,2) check (cout_horaire_applique is null or cout_horaire_applique >= 0);

comment on column public.pointages.cout_horaire_applique is
  'Coût horaire de l''employé figé au moment de la validation du pointage (verification_statut=valide). Ne doit jamais être recalculé après coup : c''est la source de vérité du coût de main-d''œuvre réel pour la rentabilité.';

-- Backfill des pointages déjà validés avant ce lot : aucune valeur
-- historique n'est reconstituable avec certitude (l'ancien modèle n'avait
-- pas d'historique de coût horaire non plus). On applique le coût actuel
-- comme meilleure approximation disponible, uniquement pour les pointages
-- déjà validés et encore dépourvus de snapshot. Limite assumée et
-- documentée : pour des pointages anciens dont le coût du salarié a changé
-- depuis, cette approximation peut différer de la réalité historique.
update public.pointages p
set cout_horaire_applique = ech.cout_horaire
from public.employes_cout_horaire ech
where p.employe_id = ech.employe_id
  and p.verification_statut = 'valide'
  and p.cout_horaire_applique is null;

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid,p_pointage_id uuid,p_statut text,p_commentaire text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_employe_id uuid; v_cout numeric;
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'valider_pointages') then raise exception 'Accès refusé';end if;
 if p_statut='rejete' and nullif(btrim(p_commentaire),'') is null then raise exception 'Le motif du rejet est obligatoire';end if;
 select employe_id into v_employe_id from public.pointages where id=p_pointage_id and entreprise_id=p_entreprise_id;
 if v_employe_id is null then raise exception 'Pointage introuvable';end if;
 v_cout := case when p_statut='valide' then (select cout_horaire from public.employes_cout_horaire where employe_id=v_employe_id) else null end;
 update public.pointages
   set verification_statut=p_statut,
       verification_at=now(),
       verification_par=case when auth.role()='anon' then null else auth.uid() end,
       commentaire_verification=nullif(btrim(p_commentaire),''),
       cout_horaire_applique=case when p_statut='valide' then v_cout else cout_horaire_applique end
   where id=p_pointage_id and entreprise_id=p_entreprise_id;
end;$$;

-- 20260714000078 a révoqué l'exécution anon sur toutes les fonctions SECURITY
-- DEFINER existantes (dont celle-ci, créée par 20260713000065). Le
-- create or replace ci-dessus ne doit pas rouvrir cet accès : seul
-- `authenticated` est regranté (la branche auth.role()='anon' du corps de la
-- fonction est un vestige inatteignable avec les privilèges actuels, laissé
-- tel quel car hors périmètre de ce lot P0).
revoke all on function public.valider_preuve_pointage(uuid,uuid,text,text) from public,anon;
grant execute on function public.valider_preuve_pointage(uuid,uuid,text,text) to authenticated;

notify pgrst,'reload schema';
