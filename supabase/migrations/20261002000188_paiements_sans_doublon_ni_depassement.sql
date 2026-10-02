-- Paiements clients : verrou contre le double enregistrement et le dépassement.
--
-- La recette métier a enregistré deux paiements de 3 000 € sur un double clic :
-- le contrôle « montant <= reste dû » de l'action serveur lit la facture puis
-- insère, sans verrou, et deux requêtes simultanées passent toutes deux.
-- Ce déclencheur verrouille la facture (FOR UPDATE), ce qui sérialise les
-- saisies concurrentes, puis refuse :
--   * un montant nul ou négatif ;
--   * un montant supérieur au reste dû (TTC - déjà payé, tolérance 0,005 €) ;
--   * un paiement identique (montant, date, mode, référence) enregistré sur la
--     même facture dans les 30 dernières secondes (double soumission).
-- Les encaissements Stripe (stripe_session_id renseigné) restent acceptés tels
-- quels : l'argent est déjà reçu et le webhook doit rester idempotent.

create or replace function public.trg_paiement_garde_fous()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ttc numeric;
  v_paye numeric;
begin
  if new.stripe_session_id is not null then
    return new;
  end if;
  if new.montant is null or new.montant <= 0 then
    raise exception 'Montant de paiement invalide';
  end if;
  select montant_ttc, coalesce(montant_paye, 0) into v_ttc, v_paye
  from public.factures where id = new.facture_id for update;
  if not found then
    raise exception 'Facture introuvable';
  end if;
  if new.montant > v_ttc - v_paye + 0.005 then
    raise exception '%', ('Le paiement d' || chr(233) || 'passe le reste d' || chr(251) || ' (' || to_char(greatest(v_ttc - v_paye, 0), 'FM999999990.00') || ' ' || chr(8364) || ')');
  end if;
  if exists (
    select 1 from public.paiements p
    where p.facture_id = new.facture_id and p.montant = new.montant and p.date = new.date
      and p.mode is not distinct from new.mode and p.reference is not distinct from new.reference
      and p.created_at > now() - interval '30 seconds'
  ) then
    raise exception '%', ('Ce paiement vient d' || chr(39) || chr(234) || 'tre enregistr' || chr(233) || ' (double envoi ignor' || chr(233) || ')');
  end if;
  return new;
end;
$$;

revoke all on function public.trg_paiement_garde_fous() from public, anon, authenticated;

drop trigger if exists paiement_garde_fous on public.paiements;
create trigger paiement_garde_fous
  before insert on public.paiements
  for each row execute function public.trg_paiement_garde_fous();
