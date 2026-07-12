-- Consolidation financière : sécurise les devis/factures après les premiers tests.
-- À exécuter après les migrations 05_devis et 06_factures.

-- Si la remise globale d'un devis change plus tard, les totaux doivent être recalculés
-- même si les lignes n'ont pas bougé.
create or replace function public.trg_recalc_devis_remise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.recalc_totaux_devis(new.id);
  return new;
end;
$$;

drop trigger if exists recalc_devis_apres_remise on public.devis;
create trigger recalc_devis_apres_remise
  after update of remise_globale on public.devis
  for each row
  when (old.remise_globale is distinct from new.remise_globale)
  execute function public.trg_recalc_devis_remise();

-- Une facture ne doit être créée automatiquement que depuis un devis accepté.
create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found then
    raise exception 'Devis introuvable';
  end if;
  if not public.est_membre_actif(v_devis.entreprise_id) then
    raise exception 'Accès refusé';
  end if;
  if v_devis.statut <> 'accepte' then
    raise exception 'Le devis doit être accepté avant facturation';
  end if;

  insert into public.factures (entreprise_id, client_id, chantier_id, devis_origine_id, type, notes_client)
  values (v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id, p_devis_id, p_type, v_devis.notes_client)
  returning id into v_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select
    v_facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis
  where devis_id = p_devis_id
  order by ordre;

  return v_facture_id;
end;
$$;

revoke all on function public.creer_facture_depuis_devis(uuid, text) from public;
grant execute on function public.creer_facture_depuis_devis(uuid, text) to authenticated;

-- Les lignes de facture sont un snapshot comptable : modifiables tant que la facture
-- est brouillon, verrouillées dès émission/numérotation.
create or replace function public.trg_lignes_factures_brouillon_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statut text;
  v_facture_id uuid;
begin
  v_facture_id := coalesce(new.facture_id, old.facture_id);
  select statut into v_statut from public.factures where id = v_facture_id;

  if v_statut is distinct from 'brouillon' then
    raise exception 'Les lignes d''une facture émise ne peuvent plus être modifiées';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists lignes_factures_brouillon_only on public.lignes_factures;
create trigger lignes_factures_brouillon_only
  before insert or update or delete on public.lignes_factures
  for each row execute function public.trg_lignes_factures_brouillon_only();

-- Les statuts de paiement sont dérivés des paiements enregistrés : ils ne doivent pas
-- pouvoir contredire les montants stockés.
create or replace function public.trg_facture_statut_paiement_coherent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.statut = 'payee' and (new.montant_ttc <= 0 or new.montant_paye < new.montant_ttc) then
    raise exception 'Une facture ne peut être payée que si le total est réglé';
  end if;

  if new.statut = 'payee_partiel' and (new.montant_paye <= 0 or new.montant_paye >= new.montant_ttc) then
    raise exception 'Le statut partiellement payé doit correspondre au montant payé';
  end if;

  return new;
end;
$$;

drop trigger if exists facture_statut_paiement_coherent on public.factures;
create trigger facture_statut_paiement_coherent
  before insert or update of statut, montant_paye, montant_ttc on public.factures
  for each row execute function public.trg_facture_statut_paiement_coherent();

notify pgrst, 'reload schema';
