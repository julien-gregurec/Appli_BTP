-- [CONVERGENCE TRAIN] Porte le lot PERFORMANCE qualifie sur la branche source
-- claude/beautiful-franklin-7hwzq0 (SHA 56aa747958a480d484ddf3d71d25e1efc539d99,
-- verdict source : PERFORMANCE QUALIFIED). Numero source de cette migration :
-- 20260922000318 (branche source, ledger divergent). Renumerotee au prochain identifiant
-- reellement disponible du train (ledger canonique claude/compassionate-euler-5j6avr)
-- pour eviter toute collision avec 20260922000317_correctif_troncature_next_reference.sql
-- (NUMBERING FIX INTEGRATED, deja present dans le train, non touche par ce lot).
-- Contenu fonctionnel identique au commit source ; seuls le numero de fichier et
-- les references croisees vers les migrations voisines de ce meme lot ont ete
-- ajustes pour pointer vers leur nouveau numero dans le train.

-- ELSATIA-GP-DASHBOARD-SEARCH-PERFORMANCE-V1 — qualification finale (§12.3
-- du rapport de mission) : correctif minimal, localisé au seul trigger de
-- maintenance du cache facturation.
--
-- CAUSE DÉMONTRÉE (reproduite directement, voir le rapport de mission) :
-- `maj_cache_dashboard_factures` se déclenche `AFTER ... UPDATE OF statut,
-- montant_ttc, montant_paye` — `entreprise_id` n'est pas dans cette liste,
-- donc un `UPDATE factures SET entreprise_id = <autre tenant>` seul (sans
-- toucher statut/montant_ttc/montant_paye) ne déclenche jamais ce trigger :
-- l'ancien tenant garde une facture qui ne lui appartient plus dans son
-- cache, le nouveau ne la voit jamais.
--
-- Second défaut, indépendant, démontré séparément : même quand le trigger
-- SE déclenche (`entreprise_id` change EN MÊME TEMPS qu'une colonne
-- surveillée), le corps de la fonction calcule un seul delta scalaire et
-- l'applique à une seule ligne de cache (`coalesce(new.entreprise_id,
-- old.entreprise_id)` = systématiquement `new.entreprise_id` en UPDATE) —
-- jamais de répartition « retirer de l'ancien tenant, ajouter au nouveau ».
-- Reproduit : ancien tenant reste avec un total inchangé (jamais débité),
-- nouveau tenant reçoit un delta net (parfois 0, selon les montants) au
-- lieu du montant complet de la facture.
--
-- Ce scénario n'est atteignable aujourd'hui par AUCUN chemin applicatif
-- (aucune fonctionnalité de "changement d'entreprise" d'un document
-- n'existe dans ce produit — recherche exhaustive dans src/, voir rapport).
-- Il reste néanmoins une mutation SQL valide, autorisée par le schéma pour
-- une facture au statut `brouillon` (la seule protection structurelle est
-- la contrainte composite `factures_client_entreprise_fkey`, qui empêche
-- de changer `entreprise_id` sans changer `client_id` en même temps — pas
-- de blocage dédié comme pour les factures déjà émises,
-- `verrouiller_facture_emise`). Corrigé ici pour que l'intégrité du cache
-- reste garantie face à toute mutation SQL valide, pas seulement face aux
-- chemins actuellement exposés par l'interface.
--
-- `devis` n'a PAS le même défaut et n'est PAS touché par cette migration :
-- `devis_acceptes_total` ne compte que les devis au statut `accepte`, et
-- `verrouiller_devis_accepte` interdit tout changement d'`entreprise_id`
-- (comme toute autre colonne) dès qu'un devis est accepté — vérifié par
-- test direct. Un devis non accepté ne contribue jamais au total (delta
-- toujours nul de son côté), donc aucune réattribution cross-tenant n'est
-- possible même si son `entreprise_id` change avant acceptation : au
-- moment où il devient accepté, `next_reference`/ce trigger ne créditent
-- que la nouvelle entreprise, ce qui est déjà le comportement correct.
--
-- Correctif : (1) le trigger se déclenche désormais aussi sur `UPDATE OF
-- entreprise_id` ; (2) quand `entreprise_id` change réellement entre OLD et
-- NEW, la fonction applique deux mises à jour distinctes du cache (retire
-- la contribution de l'ancienne entreprise, ajoute celle de la nouvelle)
-- au lieu d'un seul delta scalaire mal attribué. Comportement strictement
-- inchangé pour tout INSERT/DELETE/UPDATE qui ne touche pas
-- `entreprise_id` (chemin actuel à 100 % du trafic applicatif réel) : la
-- branche "sans changement de tenant" reproduit exactement l'ancien corps
-- de fonction. Ne redesign pas le cache, ne touche ni
-- `dashboard_indicateurs()`, ni les RPC de recherche, ni `next_reference`,
-- ni aucune règle métier.

create or replace function public.trg_maj_cache_dashboard_factures()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta_total numeric;
  v_delta_encaisse numeric;
begin
  if tg_op = 'INSERT' then
    v_delta_total := case when new.statut <> 'annulee' then new.montant_ttc else 0 end;
    v_delta_encaisse := new.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  elsif tg_op = 'DELETE' then
    v_delta_total := case when old.statut <> 'annulee' then -old.montant_ttc else 0 end;
    v_delta_encaisse := -old.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (old.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  elsif new.entreprise_id is distinct from old.entreprise_id then
    -- Changement de tenant : deux mises à jour distinctes, une par
    -- entreprise, au lieu d'un seul delta scalaire mal attribué.
    v_delta_total := case when old.statut <> 'annulee' then -old.montant_ttc else 0 end;
    v_delta_encaisse := -old.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (old.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

    v_delta_total := case when new.statut <> 'annulee' then new.montant_ttc else 0 end;
    v_delta_encaisse := new.montant_paye;
    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;

  else
    -- Chemin inchangé (100 % du trafic applicatif réel aujourd'hui) :
    -- même entreprise avant/après, un seul delta scalaire, exactement le
    -- corps de fonction précédent (20260922000319).
    v_delta_total := 0;
    if old.statut <> 'annulee' then
      v_delta_total := v_delta_total - old.montant_ttc;
    end if;
    if new.statut <> 'annulee' then
      v_delta_total := v_delta_total + new.montant_ttc;
    end if;
    v_delta_encaisse := new.montant_paye - old.montant_paye;

    if v_delta_total <> 0 or v_delta_encaisse <> 0 then
      insert into public.entreprises_dashboard_cache (entreprise_id, factures_total, factures_encaisse_total)
      values (new.entreprise_id, v_delta_total, v_delta_encaisse)
      on conflict (entreprise_id)
      do update set factures_total = public.entreprises_dashboard_cache.factures_total + excluded.factures_total,
                    factures_encaisse_total = public.entreprises_dashboard_cache.factures_encaisse_total + excluded.factures_encaisse_total,
                    updated_at = now();
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists maj_cache_dashboard_factures on public.factures;
create trigger maj_cache_dashboard_factures
  after insert or delete or update of statut, montant_ttc, montant_paye, entreprise_id on public.factures
  for each row execute function public.trg_maj_cache_dashboard_factures();
