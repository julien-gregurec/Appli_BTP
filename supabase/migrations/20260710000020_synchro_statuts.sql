-- Synchronisation automatique des statuts (demande utilisateur #4).
-- 1. Rétablit un trigger fiable "paiement -> statut facture" (payée / partiellement payée) + backfill.
-- 2. Cascade "devis accepté/envoyé -> statut chantier" et "facture émise -> chantier facturé" (avance seulement).

-- ============ 1. Facture : statut piloté par les paiements ============

create index if not exists paiements_facture_id_idx on public.paiements(facture_id);
alter table public.paiements
  add constraint paiements_montant_positif check (montant > 0);

-- Les documents et leur chantier doivent appartenir à la même entreprise.
create unique index if not exists chantiers_id_entreprise_unique
  on public.chantiers(id, entreprise_id);
alter table public.devis
  add constraint devis_chantier_entreprise_fkey
  foreign key (chantier_id, entreprise_id)
  references public.chantiers(id, entreprise_id) on delete set null (chantier_id);
alter table public.factures
  add constraint factures_chantier_entreprise_fkey
  foreign key (chantier_id, entreprise_id)
  references public.chantiers(id, entreprise_id) on delete set null (chantier_id);

create or replace function public.recalc_paiements_facture(p_facture_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_paye numeric := 0; v_ttc numeric := 0; v_statut text; v_echeance date;
begin
  -- Le verrou sérialise deux paiements simultanés sur la même facture.
  select montant_ttc, statut, date_echeance into v_ttc, v_statut, v_echeance
  from public.factures where id = p_facture_id for update;
  if not found then return; end if;
  select coalesce(sum(montant), 0) into v_paye from public.paiements where facture_id = p_facture_id;
  v_paye := round(v_paye, 2);

  -- On ne touche pas aux statuts terminaux ni au brouillon.
  if v_statut not in ('brouillon', 'annulee', 'avoir_emis') then
    if v_paye >= v_ttc and v_ttc > 0 then
      v_statut := 'payee';
    elsif v_paye > 0 then
      v_statut := 'payee_partiel';
    elsif v_echeance is not null and v_echeance < current_date then
      v_statut := 'en_retard';
    else
      v_statut := 'envoyee';
    end if;
  end if;

  update public.factures
  set montant_paye = round(v_paye, 2), statut = v_statut, updated_at = now()
  where id = p_facture_id
    and (montant_paye is distinct from round(v_paye, 2) or statut is distinct from v_statut);
end; $$;

create or replace function public.trg_recalc_paiements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.facture_id is distinct from new.facture_id then
    perform public.recalc_paiements_facture(old.facture_id);
    perform public.recalc_paiements_facture(new.facture_id);
  else
    perform public.recalc_paiements_facture(coalesce(new.facture_id, old.facture_id));
  end if;
  return null;
end; $$;

drop trigger if exists recalc_paiements_apres_paiement on public.paiements;
create trigger recalc_paiements_apres_paiement
  after insert or update or delete on public.paiements
  for each row execute function public.trg_recalc_paiements();

-- Backfill : recale le statut de toutes les factures existantes selon leurs paiements.
do $$
declare r record;
begin
  for r in select id from public.factures loop
    perform public.recalc_paiements_facture(r.id);
  end loop;
end $$;

-- ============ 2. Cascade vers le statut du chantier ============

-- Rang du workflow chantier (pour n'avancer que vers l'avant, jamais reculer).
create or replace function public.rang_statut_chantier(p_statut text)
returns int language sql immutable as $$
  select case p_statut
    when 'prospect' then 1
    when 'devis_envoye' then 2
    when 'accepte' then 3
    when 'a_preparer' then 4
    when 'en_attente_validation' then 5
    when 'en_commande_materiel' then 6
    when 'en_cours' then 7
    when 'en_pause' then 7
    when 'termine' then 8
    when 'facture' then 9
    when 'archive' then 10
    when 'annule' then 99
    else 0 end;
$$;

-- Fait avancer un chantier vers un statut cible, uniquement si c'est en avant
-- et que le chantier n'est pas annulé/archivé.
create or replace function public.avancer_statut_chantier(p_entreprise_id uuid, p_chantier_id uuid, p_cible text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_chantier_id is null then return; end if;
  if p_cible not in ('devis_envoye', 'accepte', 'facture') then
    raise exception 'Statut cible automatique interdit';
  end if;
  update public.chantiers c set statut = p_cible, updated_at = now()
  where c.id = p_chantier_id and c.entreprise_id = p_entreprise_id
    and c.statut not in ('annule', 'archive')
    and public.rang_statut_chantier(p_cible) > public.rang_statut_chantier(c.statut);
end; $$;

-- Trigger devis -> chantier.
create or replace function public.trg_devis_sync_chantier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.chantier_id is not null then
    if new.statut = 'accepte' then
      perform public.avancer_statut_chantier(new.entreprise_id, new.chantier_id, 'accepte');
    elsif new.statut = 'envoye' then
      perform public.avancer_statut_chantier(new.entreprise_id, new.chantier_id, 'devis_envoye');
    end if;
  end if;
  return null;
end; $$;

drop trigger if exists devis_sync_chantier on public.devis;
create trigger devis_sync_chantier
  after insert or update of statut, chantier_id on public.devis
  for each row execute function public.trg_devis_sync_chantier();

-- Trigger facture émise -> chantier "facturé".
create or replace function public.trg_facture_sync_chantier()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Seules les factures simples ou finales clôturent le cycle chantier.
  -- Un acompte, une situation ou un avoir ne doit jamais marquer le chantier facturé.
  if new.chantier_id is not null
     and new.type in ('simple', 'finale')
     and new.statut in ('envoyee', 'payee_partiel', 'payee', 'en_retard') then
    perform public.avancer_statut_chantier(new.entreprise_id, new.chantier_id, 'facture');
  end if;
  return null;
end; $$;

drop trigger if exists facture_sync_chantier on public.factures;
create trigger facture_sync_chantier
  after insert or update of statut, chantier_id, type on public.factures
  for each row execute function public.trg_facture_sync_chantier();

-- Backfill cascade sur les données existantes.
do $$
declare r record;
begin
  for r in select entreprise_id, chantier_id, statut from public.devis where chantier_id is not null and statut in ('envoye', 'accepte') loop
    if r.statut = 'accepte' then perform public.avancer_statut_chantier(r.entreprise_id, r.chantier_id, 'accepte');
    else perform public.avancer_statut_chantier(r.entreprise_id, r.chantier_id, 'devis_envoye'); end if;
  end loop;
  for r in select entreprise_id, chantier_id from public.factures
    where chantier_id is not null and type in ('simple', 'finale')
      and statut in ('envoyee', 'payee_partiel', 'payee', 'en_retard') loop
    perform public.avancer_statut_chantier(r.entreprise_id, r.chantier_id, 'facture');
  end loop;
end $$;

-- Ces fonctions sont internes aux triggers et ne sont pas des RPC publiques.
revoke all on function public.recalc_paiements_facture(uuid) from public, anon, authenticated;
revoke all on function public.trg_recalc_paiements() from public, anon, authenticated;
revoke all on function public.avancer_statut_chantier(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.trg_devis_sync_chantier() from public, anon, authenticated;
revoke all on function public.trg_facture_sync_chantier() from public, anon, authenticated;

notify pgrst, 'reload schema';
