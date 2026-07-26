-- Diagnostic temporaire (a supprimer juste apres usage) : verifier isolement la
-- validation "facture creditee doit appartenir au meme devis" ajoutee dans
-- creer_facture_avancee (20260724000177), sans passer par le garde-fou
-- d'authentification (a_permission echoue sans session utilisateur reelle).
create or replace function public.debug_validation_facture_origine(p_entreprise_id uuid, p_devis_id uuid, p_facture_origine_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.factures where id=p_facture_origine_id and entreprise_id=p_entreprise_id and devis_origine_id=p_devis_id and type<>'avoir');
$$;
revoke all on function public.debug_validation_facture_origine(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.debug_validation_facture_origine(uuid,uuid,uuid) to service_role;
