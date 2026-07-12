-- Création atomique d'un devis brouillon et de ses lignes.

create or replace function public.creer_devis_brouillon(
  p_entreprise_id uuid,
  p_devis jsonb,
  p_lignes jsonb
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_devis_id uuid;
begin
  insert into public.devis (
    entreprise_id, client_id, chantier_id, date_emission, date_validite,
    conditions, notes_client, notes_internes, remise_globale
  ) values (
    p_entreprise_id,
    (p_devis->>'client_id')::uuid,
    nullif(p_devis->>'chantier_id', '')::uuid,
    coalesce(nullif(p_devis->>'date_emission', '')::date, current_date),
    nullif(p_devis->>'date_validite', '')::date,
    nullif(p_devis->>'conditions', ''),
    nullif(p_devis->>'notes_client', ''),
    nullif(p_devis->>'notes_internes', ''),
    coalesce((p_devis->>'remise_globale')::numeric, 0)
  ) returning id into v_devis_id;

  insert into public.lignes_devis (
    devis_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select
    v_devis_id, ligne.designation, ligne.description, ligne.type,
    ligne.quantite, ligne.unite, ligne.prix_unitaire_ht,
    ligne.remise_ligne, ligne.taux_tva, ligne.ordre
  from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb)) as ligne(
    designation text, description text, type text, quantite numeric,
    unite text, prix_unitaire_ht numeric, remise_ligne numeric,
    taux_tva numeric, ordre integer
  );

  return v_devis_id;
end;
$$;

revoke all on function public.creer_devis_brouillon(uuid, jsonb, jsonb) from public;
grant execute on function public.creer_devis_brouillon(uuid, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
