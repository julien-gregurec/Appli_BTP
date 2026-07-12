-- Délai de paiement client et échéance automatique des nouvelles factures.

alter table public.clients
  add column if not exists delai_paiement_jours integer not null default 30;

alter table public.clients drop constraint if exists clients_delai_paiement_jours_check;
alter table public.clients
  add constraint clients_delai_paiement_jours_check
  check (delai_paiement_jours between 0 and 365);

create or replace function public.creer_facture_depuis_devis(p_devis_id uuid, p_type text default 'simple')
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_devis public.devis;
  v_facture_id uuid;
  v_delai integer := 30;
begin
  select * into v_devis from public.devis where id = p_devis_id;
  if not found then raise exception 'Devis introuvable'; end if;
  if v_devis.statut <> 'accepte' then raise exception 'Le devis doit etre accepte avant facturation'; end if;
  if v_devis.client_id is null then raise exception 'Le devis doit etre rattache a un client'; end if;

  select delai_paiement_jours into v_delai
  from public.clients
  where id = v_devis.client_id and entreprise_id = v_devis.entreprise_id;
  if not found then raise exception 'Client du devis introuvable'; end if;

  insert into public.factures (
    entreprise_id, client_id, chantier_id, devis_origine_id, type,
    date_echeance, notes_client
  ) values (
    v_devis.entreprise_id, v_devis.client_id, v_devis.chantier_id,
    p_devis_id, p_type, current_date + coalesce(v_delai, 30), v_devis.notes_client
  ) returning id into v_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select v_facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  from public.lignes_devis where devis_id = p_devis_id order by ordre;

  return v_facture_id;
end;
$$;

revoke all on function public.creer_facture_depuis_devis(uuid, text) from public;
grant execute on function public.creer_facture_depuis_devis(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
