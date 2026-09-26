-- FINAL-FIX-P1-V1 (P1-4) : versionne le déclencheur d'immutabilité des
-- factures émises, trouvé appliqué directement sur Preview (hors flux de
-- migrations) par FINAL-AUDIT-V1, absent de Production et de tout fichier
-- versionné du dépôt.
--
-- Décision (OPTION A — protection métier réelle à généraliser, pas un
-- résidu à retirer) :
-- 1. Production applique déjà partiellement l'immutabilité d'une facture
--    émise via `trg_lignes_factures_brouillon_only`
--    (20260710000007_consolidation_financiere.sql), qui interdit de
--    modifier les lignes d'une facture non brouillon. Ce déclencheur
--    complète exactement le même principe au niveau de la ligne facture
--    elle-même (statut, montants, contenu), au lieu de le laisser
--    partiellement appliqué.
-- 2. Le corps de la fonction référence explicitly `entreprise_snapshot`
--    (ajouté par 20260812000200_documents_commerciaux_p9.sql, présent en
--    Production) de façon défensive (`v_old ? 'entreprise_snapshot'`) :
--    elle a manifestement été écrite en connaissance de cette fonctionnalité
--    P9 de capture de l'identité légale de l'émetteur au moment de
--    l'émission — dont l'intérêt n'a de sens que si la facture émise ne
--    peut ensuite plus être altérée. Les deux fonctionnalités sont
--    conçues pour aller ensemble.
-- 3. La fonction ne dépend pas techniquement de la colonne
--    `entreprise_snapshot` : le test `v_old ? 'entreprise_snapshot'` est
--    silencieusement faux si la colonne n'existe pas, donc son application
--    reste sûre même sur un schéma qui ne l'aurait pas encore (cas de
--    Preview aujourd'hui — voir constat séparé ci-dessous).
--
-- Constat hors périmètre de ce correctif, documenté pour un lot dédié :
-- en creusant cette dérive, il est apparu que Preview n'a PAS seulement ce
-- déclencheur en trop — il lui manque en réalité toute la migration
-- 20260812000200_documents_commerciaux_p9.sql (entreprise_snapshot,
-- acces_externes_documents, document_commercial_par_token...), absente de
-- Preview malgré son statut « appliquée » en Production. Cette migration
-- est déjà identifiée comme sensible à rejouer (policies sans garde
-- `if not exists`) — son application à Preview n'est pas traitée ici,
-- volontairement hors périmètre des 5 P1 de ce lot.

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
$function$;

drop trigger if exists verrou_facture_emise on public.factures;
create trigger verrou_facture_emise
  before delete or update on public.factures
  for each row execute function public.verrouiller_facture_emise();
