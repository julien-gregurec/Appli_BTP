-- AVENANTS-V1 — RPC de création/modification, et montant contractuel canonique.

-- Création d'un avenant en brouillon + ses lignes, motif proche de
-- creer_devis_brouillon. Verrouille le devis d'origine (for update) pour
-- calculer un ordre séquentiel sans collision en concurrence — même motif que
-- FACTURATION-BTP-V1B (montant_facture_devis et les RPC qui la consomment).
create or replace function public.creer_avenant(
  p_entreprise_id uuid,
  p_devis_origine_id uuid,
  p_notes_client text default null,
  p_notes_internes text default null,
  p_lignes jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_id uuid;
  v_ordre integer;
  v_ligne jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_devis') then
    raise exception 'Accès refusé';
  end if;

  select * into v_devis from public.devis where id = p_devis_origine_id and entreprise_id = p_entreprise_id for update;
  if not found then raise exception 'Devis introuvable'; end if;
  if v_devis.statut <> 'accepte' then raise exception 'Un avenant ne peut être créé que sur un devis accepté'; end if;
  if v_devis.chantier_id is null then raise exception 'Le devis doit être rattaché à un chantier'; end if;

  select coalesce(max(ordre), 0) + 1 into v_ordre from public.avenants where devis_origine_id = p_devis_origine_id;

  insert into public.avenants (entreprise_id, chantier_id, devis_origine_id, ordre, notes_client, notes_internes)
  values (p_entreprise_id, v_devis.chantier_id, p_devis_origine_id, v_ordre, nullif(btrim(p_notes_client), ''), nullif(btrim(p_notes_internes), ''))
  returning id into v_id;

  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes, '[]'::jsonb))
  loop
    if coalesce(v_ligne ->> 'designation', '') = '' then continue; end if;
    insert into public.lignes_avenants (avenant_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
    values (
      v_id,
      v_ligne ->> 'designation',
      nullif(v_ligne ->> 'description', ''),
      coalesce(v_ligne ->> 'type', 'fourniture'),
      coalesce((v_ligne ->> 'quantite')::numeric, 1),
      coalesce(v_ligne ->> 'unite', 'u'),
      coalesce((v_ligne ->> 'prix_unitaire_ht')::numeric, 0),
      coalesce((v_ligne ->> 'remise_ligne')::numeric, 0),
      coalesce((v_ligne ->> 'taux_tva')::numeric, 20),
      coalesce((v_ligne ->> 'ordre')::integer, 0)
    );
  end loop;

  insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description, metadata)
  values (p_entreprise_id, auth.uid(), 'creation', 'avenant', v_id, 'Avenant créé', jsonb_build_object('devis_origine_id', p_devis_origine_id, 'ordre', v_ordre));

  return v_id;
end;
$$;
revoke all on function public.creer_avenant(uuid, uuid, text, text, jsonb) from public, anon;
grant execute on function public.creer_avenant(uuid, uuid, text, text, jsonb) to authenticated;

-- Modification d'un avenant brouillon : header + remplacement complet des
-- lignes si fournies (motif atomique proche de modifier_devis_brouillon).
create or replace function public.modifier_avenant_brouillon(
  p_avenant_id uuid,
  p_notes_client text default null,
  p_notes_internes text default null,
  p_lignes jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avenant public.avenants;
  v_ligne jsonb;
begin
  select * into v_avenant from public.avenants where id = p_avenant_id for update;
  if not found then raise exception 'Avenant introuvable'; end if;
  if not public.a_permission(v_avenant.entreprise_id, 'gerer_devis') then raise exception 'Accès refusé'; end if;
  if v_avenant.statut <> 'brouillon' then raise exception 'Seul un avenant brouillon peut être modifié'; end if;

  update public.avenants
  set notes_client = nullif(btrim(p_notes_client), ''), notes_internes = nullif(btrim(p_notes_internes), ''), updated_at = now()
  where id = p_avenant_id;

  if p_lignes is not null then
    delete from public.lignes_avenants where avenant_id = p_avenant_id;
    for v_ligne in select * from jsonb_array_elements(p_lignes)
    loop
      if coalesce(v_ligne ->> 'designation', '') = '' then continue; end if;
      insert into public.lignes_avenants (avenant_id, designation, description, type, quantite, unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre)
      values (
        p_avenant_id,
        v_ligne ->> 'designation',
        nullif(v_ligne ->> 'description', ''),
        coalesce(v_ligne ->> 'type', 'fourniture'),
        coalesce((v_ligne ->> 'quantite')::numeric, 1),
        coalesce(v_ligne ->> 'unite', 'u'),
        coalesce((v_ligne ->> 'prix_unitaire_ht')::numeric, 0),
        coalesce((v_ligne ->> 'remise_ligne')::numeric, 0),
        coalesce((v_ligne ->> 'taux_tva')::numeric, 20),
        coalesce((v_ligne ->> 'ordre')::integer, 0)
      );
    end loop;
  end if;
end;
$$;
revoke all on function public.modifier_avenant_brouillon(uuid, text, text, jsonb) from public, anon;
grant execute on function public.modifier_avenant_brouillon(uuid, text, text, jsonb) to authenticated;

-- Montant contractuel canonique : devis initial accepté + avenants acceptés.
-- Seule source de vérité pour le plafond de facturation dès qu'un devis peut
-- avoir des avenants — remplace l'usage direct de devis.montant_ht dans les
-- RPC de facturation (voir migration suivante). Fonction interne uniquement
-- (jamais un point d'entrée direct), même motif que montant_facture_devis
-- (FACTURATION-BTP-V1B) : jamais un oracle de chiffre d'affaires cross-tenant.
create or replace function public.montant_contractuel_devis(p_entreprise_id uuid, p_devis_id uuid)
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select montant_ht from public.devis where id = p_devis_id and entreprise_id = p_entreprise_id and statut = 'accepte'), 0)
       + coalesce((select sum(montant_ht) from public.avenants where devis_origine_id = p_devis_id and entreprise_id = p_entreprise_id and statut = 'accepte'), 0);
$$;
revoke all on function public.montant_contractuel_devis(uuid, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
