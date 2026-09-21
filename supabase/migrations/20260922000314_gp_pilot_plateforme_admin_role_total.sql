-- GP-EXTERNAL-PILOT-CLOSURE-V1 — corrige une auto-promotion de rôle
-- plateforme, confirmée exploitable (pas seulement théorique).
--
-- Constat : `20260719000115_roles_plateforme_appliques.sql` a bien introduit
-- une différenciation de rôle RÉELLEMENT appliquée (`plateforme_exiger_role`,
-- utilisée par les fonctions d'abonnement/tarifs/impayés — 'total'/'facturation'
-- seulement). Mais `plateforme_ajouter_admin` (20260714000072), qui décide QUI
-- a quel rôle, n'a JAMAIS été mise à jour pour utiliser ce même contrôle :
-- elle vérifie seulement `est_plateforme_admin()` (vrai pour N'IMPORTE QUEL
-- rôle, y compris 'lecture'), sans jamais vérifier le rôle de l'APPELANT ni
-- borner le rôle qu'il peut attribuer. Un membre plateforme en 'lecture' (ou
-- 'support', ou 'facturation') peut donc s'appeler lui-même — ou n'importe qui
-- d'autre — en 'total' via `plateforme_ajouter_admin(son_propre_email, null,
-- 'total')`, et obtenir ainsi un accès réel aux fonctions désormais
-- effectivement réservées à 'total' (ex. `plateforme_modifier_abonnement`).
-- Ce n'est donc plus un rôle cosmétique : la fenêtre est bien exploitable.
--
-- Correctif minimal, cohérent avec le reste de 20260719000115 : gérer
-- l'équipe plateforme (ajouter, changer un rôle, retirer) est réservé au rôle
-- 'total', comme les autres actions les plus sensibles. `plateforme_lister_admins`
-- reste inchangée (lecture seule, déjà ouverte à tout membre plateforme).
create or replace function public.plateforme_ajouter_admin(
  p_email text, p_nom text default null, p_role text default 'total'
) returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  perform public.plateforme_exiger_role('total');
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Email invalide'; end if;
  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;
  insert into public.plateforme_admins (email, role, nom, ajoute_par)
  values (v_email, p_role, nullif(trim(coalesce(p_nom,'')),''), auth.email())
  on conflict (email) do update
    set role = excluded.role,
        nom = coalesce(excluded.nom, public.plateforme_admins.nom);
end;
$$;

create or replace function public.plateforme_retirer_admin(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  perform public.plateforme_exiger_role('total');
  if v_email = lower(coalesce(auth.email(),'')) then raise exception 'Vous ne pouvez pas retirer votre propre compte'; end if;
  if (select count(*) from public.plateforme_admins) <= 1 then raise exception 'Impossible de retirer le dernier membre de la plateforme'; end if;
  delete from public.plateforme_admins where email = v_email;
end;
$$;

notify pgrst, 'reload schema';
