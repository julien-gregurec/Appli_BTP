-- Une facture émise n'était protégée qu'au niveau applicatif
-- (modifierFactureAction refuse si statut <> 'brouillon') et par
-- trg_lignes_factures_brouillon_only sur ses lignes (lignes_factures) : la
-- policy RLS "membres factures" sur public.factures elle-même autorise TOUTE
-- écriture (update/delete) à n'importe quel membre actif de l'entreprise,
-- sans exiger de permission ni vérifier le statut. Un appel direct à l'API
-- Supabase (contournant le serveur Next.js) pouvait donc modifier le montant
-- d'une facture déjà émise, la faire redevenir "brouillon", ou la supprimer
-- purement et simplement — une facture émise doit rester immuable une fois
-- sortie du brouillon (intégrité comptable/légale).
--
-- Porté depuis integration/gp-external-pilot-closure-v1 (86549ac,
-- 2026-08-22, "fix(factures): versionner le declencheur d'immutabilite des
-- factures emises"), qui documente lui-même l'avoir trouvé appliqué
-- directement en environnement Preview (hors flux de migrations) sur cette
-- autre lignée, absent de Production et de tout fichier versionné —
-- reconstruit ici à l'identique contre le schéma actuel de cette branche.
--
-- Vérifié contre le schéma actuel avant portage :
-- - `factures` n'a pas de colonne `entreprise_snapshot` (feature P9,
--   absente de cette branche) : le test défensif `v_old ? 'entreprise_snapshot'`
--   est silencieusement faux ici, la fonction reste donc sûre sans elle.
-- - Toutes les insertions de `public.factures` sur cette branche créent la
--   ligne avec `statut = 'brouillon'` (creer_facture_depuis_devis,
--   creer_facture_avancee, creer_facture_situation…) et n'insèrent des
--   lignes_factures que pendant que la facture est encore brouillon — déjà
--   protégé par trg_lignes_factures_brouillon_only — donc montant_ht/tva/ttc
--   ne sont jamais recalculés après émission dans les flux applicatifs
--   existants ; ce verrou ferme uniquement l'accès direct qui contournerait
--   ces flux.
-- - changerStatutFactureAction (src/app/actions/factures.ts) ne transite
--   jamais vers "brouillon" (TRANSITIONS_FACTURES, src/lib/factures.ts) et
--   ne modifie que statut/updated_at, déjà dans la liste des champs libres
--   ci-dessous : aucune régression attendue sur ce flux.
-- - recalc_paiements_facture (règlements) ne modifie que montant_paye,
--   statut (jamais vers 'brouillon') et updated_at : tous des champs libres.

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
    -- entreprise_snapshot (P9, absente de cette branche aujourd'hui) : verrouillé
    -- seulement une fois déjà renseigné, pour ne jamais bloquer sa capture
    -- initiale si cette colonne est ajoutée plus tard, tout en empêchant toute
    -- falsification ultérieure de l'identité légale figée.
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
$function$;

drop trigger if exists verrou_facture_emise on public.factures;
create trigger verrou_facture_emise
  before delete or update on public.factures
  for each row execute function public.verrouiller_facture_emise();
