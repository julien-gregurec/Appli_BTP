-- PIECES-JOINTES-V1 : un devis ne pouvait jamais retirer une pièce jointe déjà enregistrée
-- (aucune UI de suppression, aucune fonction RPC — la policy storage "devis_medias_nettoyage"
-- ne permettait de nettoyer que des objets déjà orphelins). Combiné à la limite de 6 pièces
-- par devis (enregistrer_pieces_jointes_devis), une erreur d'upload devenait irréversible :
-- impossible de retirer une mauvaise photo pour en ajouter une bonne une fois les 6 atteintes.

create or replace function public.retirer_piece_jointe_devis(p_piece_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_piece public.pieces_jointes_devis%rowtype;
begin
  select * into v_piece from public.pieces_jointes_devis where id = p_piece_id;
  if not found then raise exception 'Pièce jointe introuvable'; end if;
  if not public.est_membre_actif(v_piece.entreprise_id)
    or not public.a_permission(v_piece.entreprise_id, 'gerer_devis')
  then raise exception 'Accès refusé'; end if;
  delete from public.pieces_jointes_devis where id = p_piece_id;
  return v_piece.storage_path;
end;
$$;

revoke all on function public.retirer_piece_jointe_devis(uuid) from public, anon;
grant execute on function public.retirer_piece_jointe_devis(uuid) to authenticated;

notify pgrst, 'reload schema';
