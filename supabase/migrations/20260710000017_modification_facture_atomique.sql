-- Modification atomique d'une facture brouillon et de toutes ses lignes.

create or replace function public.modifier_facture_brouillon(
  p_facture_id uuid,
  p_facture jsonb,
  p_lignes jsonb
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_facture public.factures;
  v_client public.clients;
  v_chantier public.chantiers;
begin
  select * into v_facture from public.factures where id = p_facture_id for update;
  if not found then raise exception 'Facture introuvable'; end if;
  if v_facture.statut <> 'brouillon' then raise exception 'Seule une facture brouillon peut etre modifiee'; end if;

  select * into v_client
  from public.clients
  where id = (p_facture->>'client_id')::uuid and entreprise_id = v_facture.entreprise_id;
  if not found then raise exception 'Client introuvable'; end if;

  if nullif(p_facture->>'chantier_id', '') is not null then
    select * into v_chantier
    from public.chantiers
    where id = (p_facture->>'chantier_id')::uuid
      and entreprise_id = v_facture.entreprise_id
      and client_id = v_client.id;
    if not found then raise exception 'Chantier incompatible avec le client'; end if;
  end if;

  update public.factures
  set client_id = v_client.id,
      chantier_id = nullif(p_facture->>'chantier_id', '')::uuid,
      type = p_facture->>'type',
      date_emission = coalesce(nullif(p_facture->>'date_emission', '')::date, current_date),
      date_echeance = nullif(p_facture->>'date_echeance', '')::date,
      notes_client = nullif(p_facture->>'notes_client', ''),
      notes_internes = nullif(p_facture->>'notes_internes', ''),
      updated_at = now()
  where id = p_facture_id;

  delete from public.lignes_factures where facture_id = p_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select p_facture_id, ligne.designation, ligne.description, ligne.type,
    ligne.quantite, ligne.unite, ligne.prix_unitaire_ht,
    ligne.remise_ligne, ligne.taux_tva, ligne.ordre
  from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb)) as ligne(
    designation text, description text, type text, quantite numeric,
    unite text, prix_unitaire_ht numeric, remise_ligne numeric,
    taux_tva numeric, ordre integer
  );

  perform public.recalc_totaux_facture(p_facture_id);
end;
$$;

revoke all on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) from public;
grant execute on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
