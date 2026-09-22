-- Gèle la date d'échéance d'une facture émise.
--
-- `date_echeance` figurait dans la liste blanche `v_champs_libres` de
-- `verrouiller_facture_emise` (20260922000196) : le verrou autorisait donc
-- EXPLICITEMENT sa modification après émission. `modifierEcheanceFactureAction`
-- (src/app/actions/factures.ts) ne vérifiait même pas `facture.statut` avant
-- d'écrire — la date d'échéance d'une facture déjà émise pouvait donc être
-- changée à tout moment par n'importe quel membre actif ayant accès à
-- l'action. C'est un champ légalement significatif (base du calcul des
-- pénalités de retard, affiché sur le document imprimé) : il doit être figé
-- à l'émission comme les montants et les lignes, pas laissé « libre » comme
-- `notes_internes`.
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (partie de 9d55fd7,
-- migration 20260916000302_gp_pilot_echeance_gel_post_emission.sql). Retire
-- uniquement 'date_echeance' de la liste blanche du verrou porté en
-- 20260922000196 ; tout le reste est inchangé. Les champs `client_snapshot`/
-- `client_snapshot_at` de la source n'existent pas sur cette branche
-- (recherche exhaustive négative) : gardés dans le test défensif par
-- cohérence avec `entreprise_snapshot`, sans effet tant qu'ils n'existent pas
-- (le test `v_old ? ...` reste silencieusement faux).

create or replace function public.verrouiller_facture_emise()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_champs_libres text[] := array[
    'statut', 'montant_paye', 'notes_internes', 'email_envoye_le', 'email_envoye_a',
    'stripe_checkout_id', 'stripe_checkout_url', 'stripe_payment_intent_id',
    'stripe_payment_status', 'lien_paiement_expire_at', 'updated_at'
  ];
  v_champ text;
  v_snapshot text;
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
    foreach v_snapshot in array array['entreprise_snapshot', 'client_snapshot', 'client_snapshot_at'] loop
      if (v_old ? v_snapshot) and (v_old ->> v_snapshot) is null then
        v_old := v_old - v_snapshot;
        v_new := v_new - v_snapshot;
      end if;
    end loop;

    if v_old is distinct from v_new then
      raise exception 'Cette facture a déjà été émise et ne peut plus être modifiée.';
    end if;
  end if;
  return new;
end;
$function$;

notify pgrst, 'reload schema';
