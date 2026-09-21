-- TERRAIN-MOBILE-V1D2 : migration corrective.
--
-- La migration 20260819000218 a été écrite par erreur avec un corps de
-- valider_preuve_pointage qui référence public.employes_cout_horaire et
-- pointages.cout_horaire_applique — deux objets qui n'ont jamais existé dans
-- ce schéma (aucune autre migration ni aucun code applicatif n'y fait
-- référence). Conséquence : tout appel avec p_statut = 'valide' échouait au
-- runtime ("relation employes_cout_horaire does not exist"), non détecté par
-- la suite pgTAP existante qui ne vérifiait que les privilèges d'exécution
-- (has_function_privilege), jamais le comportement réel de la fonction.
--
-- Le fichier 20260819000218 a été corrigé directement en Local (nouvel
-- environnement : le reset complet applique la version corrigée dès
-- l'origine, sans jamais passer par la version cassée). Mais cet
-- environnement Preview a déjà exécuté la version cassée de 218 : éditer le
-- fichier historique ne suffit pas à corriger une base déjà migrée. Cette
-- migration corrective réapplique donc explicitement la définition correcte
-- (identique à celle désormais dans 20260819000218 corrigée), pour aligner
-- Preview sur Local. Idempotente et sans effet sur Production, qui n'a
-- jamais reçu la version cassée.
--
-- Portée strictement limitée à ce correctif : aucune logique de coût
-- horaire, aucune nouvelle fonctionnalité, aucun autre objet touché.

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid, p_pointage_id uuid, p_statut text, p_commentaire text default null::text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 if not public.a_permission(p_entreprise_id,'valider_pointages') then raise exception 'Accès refusé';end if;
 if p_statut='rejete' and nullif(btrim(p_commentaire),'') is null then raise exception 'Le motif du rejet est obligatoire';end if;
 update public.pointages set verification_statut=p_statut,verification_at=now(),verification_par=auth.uid(),commentaire_verification=nullif(btrim(p_commentaire),'') where id=p_pointage_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Pointage introuvable';end if;
end;$function$;

notify pgrst, 'reload schema';
