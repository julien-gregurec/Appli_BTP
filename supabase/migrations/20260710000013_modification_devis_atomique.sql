-- Modification atomique d'un devis brouillon et de toutes ses lignes.

create or replace function public.modifier_devis_brouillon(
  p_devis_id uuid,
  p_devis jsonb,
  p_lignes jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_devis public.devis;
begin
  select * into v_devis
  from public.devis
  where id = p_devis_id
  for update;

  if not found then
    raise exception 'Devis introuvable';
  end if;

  if v_devis.statut <> 'brouillon' then
    raise exception 'Seul un devis brouillon peut etre modifie';
  end if;

  update public.devis
  set
    client_id = (p_devis->>'client_id')::uuid,
    chantier_id = nullif(p_devis->>'chantier_id', '')::uuid,
    date_validite = nullif(p_devis->>'date_validite', '')::date,
    conditions = nullif(p_devis->>'conditions', ''),
    notes_client = nullif(p_devis->>'notes_client', ''),
    notes_internes = nullif(p_devis->>'notes_internes', ''),
    remise_globale = coalesce((p_devis->>'remise_globale')::numeric, 0),
    updated_at = now()
  where id = p_devis_id;

  delete from public.lignes_devis where devis_id = p_devis_id;

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select
    p_devis_id,
    ligne.designation,
    ligne.description,
    ligne.type,
    ligne.quantite,
    ligne.unite,
    ligne.prix_unitaire_ht,
    ligne.remise_ligne,
    ligne.taux_tva,
    ligne.ordre
  from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb)) as ligne(
    designation text,
    description text,
    type text,
    quantite numeric,
    unite text,
    prix_unitaire_ht numeric,
    remise_ligne numeric,
    taux_tva numeric,
    ordre integer
  );
end;
$$;

revoke all on function public.modifier_devis_brouillon(uuid, jsonb, jsonb) from public;
grant execute on function public.modifier_devis_brouillon(uuid, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
