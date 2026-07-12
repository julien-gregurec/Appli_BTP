-- Duplique un devis et ses lignes dans un nouveau brouillon.

create or replace function public.dupliquer_devis(p_devis_id uuid)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_source public.devis;
  v_nouveau_id uuid;
begin
  select * into v_source from public.devis where id = p_devis_id;
  if not found then
    raise exception 'Devis introuvable';
  end if;

  insert into public.devis (
    entreprise_id, client_id, chantier_id, statut, date_emission,
    date_validite, conditions, notes_client, notes_internes, remise_globale
  ) values (
    v_source.entreprise_id, v_source.client_id, v_source.chantier_id, 'brouillon', current_date,
    null, v_source.conditions, v_source.notes_client, v_source.notes_internes, v_source.remise_globale
  ) returning id into v_nouveau_id;

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select
    v_nouveau_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis
  where devis_id = p_devis_id
  order by ordre;

  return v_nouveau_id;
end;
$$;

revoke all on function public.dupliquer_devis(uuid) from public;
grant execute on function public.dupliquer_devis(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
