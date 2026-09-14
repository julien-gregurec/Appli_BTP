-- FACTURATION-BTP-V1B — P1 associé : verrouiller une facture émise, sur le
-- même principe que DEVIS-LOCK-V1 (20260818000210_verrou_devis_accepte.sql).
--
-- Faille corrigée : le montant, le client et les autres champs contractuels
-- d'une facture 'envoyee' restaient modifiables par écriture directe (UPDATE
-- brut), malgré le refus de modifier_facture_brouillon (RPC) et de
-- modifierFactureAction (action serveur) — le verrou n'existait qu'à ces deux
-- niveaux, jamais au niveau table. Reproduit et documenté par l'audit
-- FACTURATION-BTP-V1 (§40-41).
--
-- Contrairement à un devis (statut 'accepte' terminal, aucune transition
-- ultérieure), une facture a un cycle de vie qui continue après 'brouillon'
-- (envoyee<->en_retard, ->payee/payee_partiel via le trigger de paiement,
-- ->annulee) : le statut lui-même doit donc rester libre de changer parmi ces
-- états, sauf pour un retour explicite à 'brouillon', qui rouvrirait tout
-- (bloqué spécifiquement ci-dessous).
--
-- Champs non contractuels laissés modifiables sur une facture émise :
-- notes_internes, email_envoye_le/email_envoye_a, montant_paye (écrit par
-- recalc_paiements_facture, jamais directement), date_echeance (fonctionnalité
-- existante et légitime : modifierEcheanceFactureAction, un délai de paiement
-- renégocié n'a aucun impact sur le montant ni sur le garde-fou
-- anti-surfacturation), les colonnes stripe_*/lien_paiement_expire_at (gestion
-- du lien de paiement, légitime après émission), updated_at.
-- entreprise_snapshot : verrouillé seulement une fois déjà renseigné, pour ne
-- pas bloquer sa capture initiale au moment de la sortie du brouillon (faite
-- côté application, changerStatutFactureAction) tout en empêchant toute
-- falsification ultérieure de l'identité légale figée.
--
-- Les lignes (lignes_factures) sont déjà protégées par un trigger dédié
-- existant, antérieur à ce lot (trg_lignes_factures_brouillon_only,
-- 20260710000007) : aucune modification nécessaire ici.
--
-- Comparaison par différence JSON (liste blanche des champs non contractuels
-- retirés avant comparaison) plutôt que champ par champ : plus proche de
-- l'intention (« seuls les champs réellement non comptables restent
-- modifiables »), et surtout tolérant à une colonne absente sur un
-- environnement qui n'aurait pas encore reçu une migration ultérieure (ex.
-- entreprise_snapshot/email_envoye_le n'existent pas encore sur Preview au
-- moment de ce lot, migration 20260812000200 non appliquée, gap hors
-- périmètre déjà signalé par DEVIS-LOCK-V1) — une colonne absente est
-- simplement absente du JSON des deux côtés, sans erreur.
create or replace function public.verrouiller_facture_emise()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_champs_libres text[] := array[
    'statut', 'montant_paye', 'notes_internes', 'email_envoye_le', 'email_envoye_a',
    'date_echeance', 'stripe_checkout_id', 'stripe_checkout_url', 'stripe_payment_intent_id',
    'stripe_payment_status', 'lien_paiement_expire_at', 'updated_at'
  ];
  v_champ text;
begin
  if tg_op = 'DELETE' then
    if old.statut <> 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut plus être supprimée.';
    end if;
    return old;
  end if;

  if old.statut <> 'brouillon' then
    if new.statut = 'brouillon' then
      raise exception 'Cette facture a déjà été émise et ne peut pas redevenir brouillon.';
    end if;

    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_champ in array v_champs_libres loop
      v_old := v_old - v_champ;
      v_new := v_new - v_champ;
    end loop;
    -- entreprise_snapshot : verrouillé seulement une fois déjà renseigné, pour
    -- ne pas bloquer sa capture initiale au moment de la sortie du brouillon
    -- (faite côté application, changerStatutFactureAction) tout en empêchant
    -- toute falsification ultérieure de l'identité légale figée.
    if (v_old ? 'entreprise_snapshot') and (v_old ->> 'entreprise_snapshot') is null then
      v_old := v_old - 'entreprise_snapshot';
      v_new := v_new - 'entreprise_snapshot';
    end if;

    if v_old is distinct from v_new then
      raise exception 'Cette facture a déjà été émise et ne peut plus être modifiée.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists verrou_facture_emise on public.factures;
create trigger verrou_facture_emise
  before update or delete on public.factures
  for each row execute function public.verrouiller_facture_emise();

notify pgrst, 'reload schema';
