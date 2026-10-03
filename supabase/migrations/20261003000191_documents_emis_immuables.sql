-- Documents émis immuables, y compris par appel direct de l'API.
--
-- Recette (sondes PostgREST avec le jeton des utilisateurs) : le comptable et
-- le gérant ont pu modifier le total TTC d'une facture émise (7 964,33 € → 1 €)
-- et la renuméroter ; le gérant a pu changer les prix d'un devis accepté. Les
-- écrans ne le proposent pas, mais la base l'acceptait.
--
-- * facture numérotée : numéro, client, type, date d'émission, devis d'origine
--   et montants HT/TVA/TTC ne changent plus (paiements, statut, échéance et
--   notes restent modifiables) ;
-- * lignes de devis : ajout/modification seulement sur un devis brouillon,
--   suppression interdite sur un devis accepté ;
-- * devis accepté : client, remise globale et montants figés (le rattachement
--   à un chantier reste possible).

create or replace function public.trg_facture_emise_immuable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.numero is not null and (
       new.numero is distinct from old.numero
    or new.client_id is distinct from old.client_id
    or new.type is distinct from old.type
    or new.date_emission is distinct from old.date_emission
    or new.devis_origine_id is distinct from old.devis_origine_id
    or new.montant_ht is distinct from old.montant_ht
    or new.montant_tva is distinct from old.montant_tva
    or new.montant_ttc is distinct from old.montant_ttc
  ) then
    raise exception '%', ('Facture ' || old.numero || ' ' || chr(233) || 'mise : num' || chr(233) || 'ro, client, date et montants ne sont plus modifiables (' || chr(233) || 'mettez un avoir)');
  end if;
  return new;
end;
$$;
revoke all on function public.trg_facture_emise_immuable() from public, anon, authenticated;
drop trigger if exists facture_emise_immuable on public.factures;
create trigger facture_emise_immuable before update on public.factures
  for each row execute function public.trg_facture_emise_immuable();

create or replace function public.trg_lignes_devis_brouillon_only()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_statut text;
begin
  select statut into v_statut from public.devis where id = coalesce(new.devis_id, old.devis_id);
  if v_statut is null then
    return coalesce(new, old); -- devis en cours de suppression (cascade)
  end if;
  if tg_op = 'DELETE' then
    if v_statut = 'accepte' then
      raise exception '%', ('Les lignes d' || chr(39) || 'un devis accept' || chr(233) || ' ne peuvent pas ' || chr(234) || 'tre supprim' || chr(233) || 'es');
    end if;
    return old;
  end if;
  if v_statut <> 'brouillon' or (tg_op = 'UPDATE' and new.devis_id is distinct from old.devis_id) then
    raise exception '%', ('Seules les lignes d' || chr(39) || 'un devis brouillon sont modifiables');
  end if;
  return new;
end;
$$;
revoke all on function public.trg_lignes_devis_brouillon_only() from public, anon, authenticated;
drop trigger if exists lignes_devis_brouillon_only on public.lignes_devis;
create trigger lignes_devis_brouillon_only before insert or update or delete on public.lignes_devis
  for each row execute function public.trg_lignes_devis_brouillon_only();

create or replace function public.trg_devis_accepte_immuable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.statut = 'accepte' and (
       new.client_id is distinct from old.client_id
    or new.remise_globale is distinct from old.remise_globale
    or new.montant_ht is distinct from old.montant_ht
    or new.montant_tva is distinct from old.montant_tva
    or new.montant_ttc is distinct from old.montant_ttc
    or new.numero is distinct from old.numero
  ) then
    raise exception '%', ('Devis ' || coalesce(old.numero, '') || ' accept' || chr(233) || ' : client, remise et montants ne sont plus modifiables');
  end if;
  return new;
end;
$$;
revoke all on function public.trg_devis_accepte_immuable() from public, anon, authenticated;
drop trigger if exists devis_accepte_immuable on public.devis;
create trigger devis_accepte_immuable before update on public.devis
  for each row execute function public.trg_devis_accepte_immuable();
