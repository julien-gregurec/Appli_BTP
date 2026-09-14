-- GP V1 — correctif : « permission denied for function recalc_totaux_facture » à l'enregistrement d'une
-- facture existante (reproduit en polish UX, 2026-09-14).
--
-- AUDIT (avant toute modification, base jetable locale au ledger 295) :
--
--   * `public.recalc_totaux_facture(uuid)` — SECURITY DEFINER, propriétaire `postgres`, `search_path=public`
--     figé. EXECUTE : `anon` non, `authenticated` non, `service_role` non (révoqués par la migration
--     20260902000255_acl_reconciliation_v1, avec `public.recalc_totaux_devis` et une centaine d'autres
--     fonctions internes — même traitement, même intention).
--   * `public.trg_recalc_facture()` (déclencheur `recalc_facture_apres_ligne`, AFTER INSERT OR UPDATE OR
--     DELETE FOR EACH ROW sur `lignes_factures`, posé par la 20260710000006) — SECURITY DEFINER lui aussi,
--     et de même EXECUTE refusé à tous les rôles clients : il n'est JAMAIS censé être appelé autrement que
--     par le déclencheur. Un déclencheur SECURITY DEFINER s'exécute avec les privilèges de son propriétaire
--     pour tout ce qu'il appelle en interne (y compris `recalc_totaux_facture`) : le révoquer sur
--     `authenticated` ne l'empêche donc pas de fonctionner normalement.
--   * `public.modifier_facture_brouillon(uuid, jsonb, jsonb)` (20260710000017, redéfinie par la
--     20260912000282) — SEULE fonction non SECURITY DEFINER de ce lot (`language plpgsql set search_path
--     = public`, sans `security definer`) ; EXECUTE accordé à `authenticated` (et pas à `anon` ni
--     `service_role`, déjà ainsi avant ce correctif — inchangé ici). Sa dernière ligne appelle
--     directement `perform public.recalc_totaux_facture(p_facture_id);` : cet appel s'exécute avec les
--     privilèges de L'APPELANT (le rôle `authenticated` de la session), qui n'a plus EXECUTE depuis la 255.
--     C'est l'unique site d'appel direct, non privilégié, de `recalc_totaux_facture` dans toute la base —
--     confirmé par une recherche exhaustive des migrations (`recalc_totaux_facture(` hors définitions et
--     REVOKE : 3 sites, les deux autres étant les déclencheurs SECURITY DEFINER ci-dessus).
--   * Comparaison avec le modèle équivalent (devis, 20260913000292_gp_v1_devis_totaux_par_instruction) :
--     `recalc_totaux_devis` a EXACTEMENT le même traitement (EXECUTE révoqué pour `authenticated` et
--     `service_role`) et n'est appelée QUE depuis des déclencheurs SECURITY DEFINER — jamais depuis une
--     fonction exposée en RPC non privilégiée. C'est le modèle délibéré de cette base : les fonctions de
--     recalcul internes ne sont exécutables ni en RPC ni en accès direct, seul le déclencheur y accède.
--   * Les deux fonctions de CRÉATION de facture toujours actives, `creer_facture_avancee` (dernière
--     définition : 20260818000215) et `creer_facture_depuis_devis` (dernière définition : 20260912000286),
--     sont toutes deux SECURITY DEFINER : aucune des deux n'est concernée par ce défaut.
--
-- DÉCISION (principe de moindre privilège) : NE PAS accorder EXECUTE sur `recalc_totaux_facture` à
-- `authenticated`. Cette fonction ne vérifie aucune appartenance d'entreprise (elle prend seulement un
-- `facture_id`) : l'exposer en exécution directe permettrait à n'importe quel utilisateur authentifié de
-- forcer, via PostgREST, un recalcul sur l'identifiant de facture de SON CHOIX — y compris celui d'une
-- facture d'une AUTRE entreprise (elle ne modifierait alors que des totaux déjà corrects à partir de
-- lignes déjà correctes, sans fuite ni corruption, mais rien ne le garantit pour un appel direct futur non
-- audité de la même façon). Le déclencheur `recalc_facture_apres_ligne` recalcule déjà, à l'identique,
-- après CHAQUE modification de `lignes_factures` que fait `modifier_facture_brouillon` (elle vide puis
-- réinsère les lignes ligne par ligne ; le déclencheur voit, à sa dernière exécution, l'état déjà à jour
-- de la transaction — même mécanisme que l'ancien déclencheur par ligne du devis avant l'optimisation de
-- la 292, correct pour un nombre de lignes de facture qui reste modeste). L'appel explicite en fin de
-- fonction est donc strictement redondant : le retirer répare le défaut sans accorder le moindre nouveau
-- privilège à qui que ce soit.
--
-- Idempotente : `create or replace function` sur la même signature ; les REVOKE ci-dessous n'ôtent rien
-- qui soit déjà accordé (vérifié par l'audit) et documentent explicitement l'intention, comme la 292 le
-- fait pour son déclencheur. Aucune donnée métier modifiée.

create or replace function public.modifier_facture_brouillon(p_facture_id uuid, p_facture jsonb, p_lignes jsonb)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_facture public.factures;
  v_client public.clients;
  v_chantier public.chantiers;
begin
  select * into v_facture from public.factures where id = p_facture_id for update;
  if not found then raise exception 'Facture introuvable'; end if;
  if v_facture.statut <> 'brouillon' then raise exception 'Seule une facture brouillon peut etre modifiee'; end if;
  if exists (select 1 from public.factures_ouvrages o where o.facture_id = p_facture_id) then
    raise exception 'Cette facture reprend des ouvrages de son devis : ses lignes ne se modifient pas dans l''éditeur de facture historique.';
  end if;

  select * into v_client
  from public.clients
  where id = (p_facture->>'client_id')::uuid and entreprise_id = v_facture.entreprise_id;
  if not found then raise exception 'Client introuvable'; end if;

  if nullif(p_facture->>'chantier_id', '') is not null then
    select * into v_chantier
    from public.chantiers
    where id = (p_facture->>'chantier_id')::uuid
      and entreprise_id = v_facture.entreprise_id
      and client_id = v_client.id;
    if not found then raise exception 'Chantier incompatible avec le client'; end if;
  end if;

  update public.factures
  set client_id = v_client.id,
      chantier_id = nullif(p_facture->>'chantier_id', '')::uuid,
      type = p_facture->>'type',
      date_emission = coalesce(nullif(p_facture->>'date_emission', '')::date, current_date),
      date_echeance = nullif(p_facture->>'date_echeance', '')::date,
      notes_client = nullif(p_facture->>'notes_client', ''),
      notes_internes = nullif(p_facture->>'notes_internes', ''),
      updated_at = now()
  where id = p_facture_id;

  delete from public.lignes_factures where facture_id = p_facture_id;

  insert into public.lignes_factures (
    facture_id, designation, description, type, quantite, unite,
    prix_unitaire_ht, remise_ligne, taux_tva, ordre
  )
  select p_facture_id, ligne.designation, ligne.description, ligne.type,
    ligne.quantite, ligne.unite, ligne.prix_unitaire_ht,
    ligne.remise_ligne, ligne.taux_tva, ligne.ordre
  from jsonb_to_recordset(coalesce(p_lignes, '[]'::jsonb)) as ligne(
    designation text, description text, type text, quantite numeric,
    unite text, prix_unitaire_ht numeric, remise_ligne numeric,
    taux_tva numeric, ordre integer
  );

  -- Le recalcul se fait déjà, en toute sécurité, via le déclencheur `recalc_facture_apres_ligne`
  -- (SECURITY DEFINER) posé sur `lignes_factures`, qui s'exécute à chaque ligne touchée par le DELETE et
  -- l'INSERT ci-dessus (sa dernière exécution voit l'état déjà à jour de la transaction, lignes comprises,
  -- y compris le cas où toutes les lignes sont retirées : la dernière suppression recalcule alors à partir
  -- d'un ensemble vide, donc à zéro). Un appel direct ici s'exécuterait avec les privilèges de l'appelant,
  -- qui n'a plus EXECUTE sur `recalc_totaux_facture` depuis la 20260902000255 (voir l'audit en tête de
  -- fichier) : ne pas réintroduire cet appel.
end;
$$;

-- Documentation explicite de l'intention (déjà en vigueur, confirmé par l'audit ci-dessus) : ces fonctions
-- ne sont jamais destinées à un appel direct par un rôle client, seulement par le déclencheur.
revoke all on function public.recalc_totaux_facture(uuid) from public, anon, authenticated, service_role;
revoke all on function public.trg_recalc_facture() from public, anon, authenticated, service_role;
revoke all on function public.trg_recalc_facture_apres_remise() from public, anon, authenticated, service_role;
