-- Train canonique V9 : numéro d'origine 20260930000102 (GP residual data correctness (claude/optimistic-hopper-0ytout)), renuméroté 20261002001106
-- (bloc V9 strictement après 20261002000901 / 20261002001003, ordre relatif d'origine conservé) ; corps inchangé.
-- ELSATIA-GP-POINTAGES-FACTURE-FIX-V1 — B2 : une facture brouillon redevient
-- modifiable.
--
-- Constat (rapport Performance, B4) : `modifier_facture_brouillon` (SECURITY
-- INVOKER, appelée par modifierFactureAction sous `authenticated`) se
-- terminait par `perform public.recalc_totaux_facture(p_facture_id)`. La
-- réconciliation ACL 20260902000255 a retiré, volontairement, le droit
-- EXECUTE de `authenticated` sur recalc_totaux_facture (fonction SECURITY
-- DEFINER qui réécrit les montants de n'importe quelle facture, sans contrôle
-- d'appartenance). Depuis, tout enregistrement d'une facture brouillon
-- échouait : « permission denied for function recalc_totaux_facture ».
--
-- Correctif : NE PAS rouvrir recalc_totaux_facture. L'appel direct était
-- redondant : le trigger `recalc_facture_apres_ligne` (FOR EACH ROW sur
-- lignes_factures, fonction SECURITY DEFINER trg_recalc_facture) recalcule
-- déjà les totaux à chaque ligne supprimée puis insérée, le dernier passage
-- voyant toutes les nouvelles lignes. Seul le cas « aucune ligne avant, aucune
-- ligne après » ne déclenche aucun trigger : il est couvert explicitement par
-- une remise à zéro, identique à ce que recalc_totaux_facture calcule sur une
-- facture sans ligne (sommes vides = 0).
--
-- Rien d'autre ne change : la fonction reste SECURITY INVOKER (RLS de
-- factures et lignes_factures, trigger verrouiller_facture_emise et
-- trg_lignes_factures_brouillon_only toujours appliqués sous l'identité de
-- l'appelant), mêmes contrôles métier, mêmes droits (authenticated
-- uniquement, réaffirmés ci-dessous). Aucun droit n'est accordé sur
-- recalc_totaux_facture.

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

  -- Chaque ligne supprimée puis insérée déclenche recalc_facture_apres_ligne
  -- (SECURITY DEFINER) : les totaux sont recalculés sans appel direct.
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

  -- Aucune ligne après enregistrement : aucun trigger n'a forcément tourné,
  -- les montants valent 0 (même résultat que recalc_totaux_facture).
  if not exists (select 1 from public.lignes_factures where facture_id = p_facture_id) then
    update public.factures
    set montant_ht = 0, montant_tva = 0, montant_ttc = 0, updated_at = now()
    where id = p_facture_id;
  end if;
end;
$$;

revoke all on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) from public;
revoke all on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) from anon;
revoke all on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) from service_role;
grant execute on function public.modifier_facture_brouillon(uuid, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
