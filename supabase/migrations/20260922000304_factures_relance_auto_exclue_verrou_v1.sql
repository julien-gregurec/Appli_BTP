-- GP-EXTERNAL-PILOT-CLOSURE-V1 — corrige verrouiller_facture_emise() pour
-- autoriser l'exclusion d'une facture émise des relances automatiques.
--
-- Défaut : factures.relance_auto_exclue a été ajoutée par 20260824000230,
-- APRÈS l'écriture de la liste blanche de verrouiller_facture_emise
-- (20260822000222). Elle n'y a jamais été ajoutée, ni par 20260824000230, ni
-- par la réécriture de 20260908000272 (l.244-248). Dès qu'une facture n'est
-- plus brouillon, le verrou compare toute la ligne en JSON, champs de la
-- liste blanche retirés :
--   update public.factures set relance_auto_exclue = true where id = … ;
--   ERROR: Cette facture a déjà été émise et ne peut plus être modifiée.
-- Le seul écrivain applicatif est exclureRelanceAutoDocumentAction
-- (src/app/actions/relances.ts), dont le bouton n'est affiché QUE sur une
-- facture émise (src/app/(app)/factures/[id]/page.tsx) : l'exclusion par
-- facture ne peut donc JAMAIS aboutir aujourd'hui. Un client ne peut pas
-- faire stopper les relances automatiques sur une facture contestée.
--
-- Correctif : recréer la fonction à l'identique de 20260908000272, avec
-- 'relance_auto_exclue' ajouté à la liste blanche. C'est un réglage
-- opérationnel interne (même nature que notes_internes/email_envoye_le) :
-- il ne figure ni sur le document ni dans le snapshot destinataire, et ne
-- change rien au contenu contractuel de la facture. Tout le reste est
-- inchangé (exemption des snapshots tant qu'ils sont nuls, refus du retour
-- en brouillon, refus de la suppression).
--
-- Garde : la fonction n'est remplacée que si son corps courant est
-- exactement celui posé par 20260908000272, pour ne pas écraser en silence
-- une redéfinition ultérieure inconnue de ce lot.

do $garde$
declare
  v_md5 text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'factures'
      and column_name = 'relance_auto_exclue'
  ) then
    raise exception 'public.factures.relance_auto_exclue est absente : ce correctif suppose 20260824000230.';
  end if;

  select md5(prosrc) into v_md5
  from pg_proc
  where oid = 'public.verrouiller_facture_emise()'::regprocedure;

  if v_md5 is distinct from 'bb9c7249d3d6428aacdd2184843834fa' then
    raise exception 'verrouiller_facture_emise a été redéfinie depuis 20260908000272 (md5 %) : reporter ''relance_auto_exclue'' dans la liste blanche de la version courante au lieu de l''écraser.', v_md5;
  end if;
end
$garde$;

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
    'stripe_payment_status', 'lien_paiement_expire_at', 'updated_at',
    -- Réglage opérationnel interne (20260824000230) : exclusion de la facture
    -- des relances automatiques. Absent du document et du snapshot.
    'relance_auto_exclue'
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
