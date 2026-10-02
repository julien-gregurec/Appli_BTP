-- ELSATIA — Entreprise pilote PILOTE-BTP-V1 : DECISION_REQUIRED_PILOT_SUBSCRIPTION (écriture).
--
-- NE JAMAIS lancer à la main : passer par scripts/preview/pilot-subscription.mjs --apply, qui
-- vérifie d'abord la cible (Preview elsatia-preview, jamais Production), le ledger V8 complet et
-- une sauvegarde récente, puis transmet les variables psql :option, :jusqu_au, :decision.
--
-- Contexte (rapport V8 §8, DECISION_REQUIRED:V8-PILOTE-ESSAI-ECHU) : la fixture crée l'entreprise
-- pilote « en essai » avec created_at = now() − 2 mois ; l'essai de 30 jours est échu et, depuis
-- B-4 (…0803), les membres n'accèdent plus aux données Gestion Pro, ni à l'écran ni par l'API.
--
-- Deux options, décidées par le propriétaire (aucune n'est choisie par défaut) :
--   A  prolonger explicitement l'essai : nouvelle fenêtre [aujourd'hui, :jusqu_au], ≤ 30 jours
--      (la contrainte entreprises_essai_dates_coherentes reste la règle : rien n'est assoupli) ;
--   B  abonnement pilote explicite : abonnement_statut = 'actif' jusqu'au :jusqu_au (≤ 366 jours),
--      facturation pilote manuelle / offline ; mêmes colonnes que la RPC plateforme
--      plateforme_modifier_abonnement (chemin préféré : console /plateforme, rôle total ou
--      facturation + AAL2, voir le runbook). Refusé si l'entreprise est liée à Stripe.
--
-- Données uniquement : aucune fonction, policy, contrainte ni règle Billing n'est modifiée.
-- Une seule transaction ; toute assertion en échec annule tout.
\set ON_ERROR_STOP 1
begin;
set local lock_timeout = '5s';
select set_config('elsatia.pilote_option', :'option', true),
       set_config('elsatia.pilote_jusqu_au', :'jusqu_au', true),
       set_config('elsatia.pilote_decision', :'decision', true);

do $$
declare
  v_option   text := current_setting('elsatia.pilote_option');
  v_jusqu    date := current_setting('elsatia.pilote_jusqu_au')::date;
  v_decision text := current_setting('elsatia.pilote_decision');
  v_aujourd  date := (now() at time zone 'utc')::date;
  v_e        public.entreprises%rowtype;
  v_etat     text;
  v_n        integer;
  v_note     text;
begin
  -- 0. Ledger : exactement le train V8 (défense en profondeur, la CLI l'a déjà vérifié).
  if (select count(*) from supabase_migrations.schema_migrations) <> 371
     or (select max(version) from supabase_migrations.schema_migrations) <> '20260928000812' then
    raise exception 'PILOTE : ledger non aligné sur le train V8 (371, 20260928000812) : refus';
  end if;

  -- 1. Décision explicite, cohérente avec l'option.
  if v_option not in ('A', 'B') then
    raise exception 'PILOTE : option inconnue (A = prolonger l''essai, B = abonnement pilote explicite)';
  end if;
  if v_decision !~ ('^DECISION_REQUIRED_PILOT_SUBSCRIPTION=' || v_option || ':[^:]{3,}$') then
    raise exception 'PILOTE : décision absente ou incohérente (attendu DECISION_REQUIRED_PILOT_SUBSCRIPTION=%:<auteur-date>)', v_option;
  end if;

  -- 2. Cible : exactement une entreprise pilote, verrouillée, jamais liée à Stripe.
  select * into strict v_e from public.entreprises where reference_interne = 'PILOTE-BTP-V1' for update;
  if v_e.stripe_subscription_id is not null or v_e.stripe_customer_id is not null then
    raise exception 'PILOTE : entreprise liée à Stripe : l''état commercial appartient à Stripe (Test), refus';
  end if;
  if v_e.abonnement_statut <> 'essai' then
    raise exception 'PILOTE : statut % inattendu (essai attendu) : rien n''est modifié', v_e.abonnement_statut;
  end if;

  v_note := '[PILOTE] Entreprise BTP fictive - fixture de recette pilote externe accompagne, aucune donnee reelle'
            || ' | ' || v_decision || ' | applique le ' || to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI"Z"');

  -- 3. Écriture (données seulement).
  if v_option = 'A' then
    if v_jusqu <= v_aujourd or v_jusqu > v_aujourd + 30 then
      raise exception 'PILOTE A : fin d''essai % hors fenêtre (] aujourd''hui, aujourd''hui + 30 ]) : la règle des 30 jours n''est pas assouplie', v_jusqu;
    end if;
    update public.entreprises
       set abonnement_essai_debut = v_aujourd,
           abonnement_essai_fin   = v_jusqu,
           abonnement_note        = v_note,
           updated_at             = now()
     where id = v_e.id;
  else
    if v_jusqu <= v_aujourd or v_jusqu > v_aujourd + 366 then
      raise exception 'PILOTE B : échéance % hors fenêtre (] aujourd''hui, aujourd''hui + 366 ])', v_jusqu;
    end if;
    update public.entreprises
       set abonnement_statut    = 'actif',
           abonnement_echeance  = v_jusqu,
           abonnement_note      = v_note,
           impaye_signale_at    = null,
           suspension_prevue_at = null,
           impaye_message       = null,
           updated_at           = now()
     where id = v_e.id;
  end if;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'PILOTE : % ligne(s) modifiée(s), 1 attendue', v_n; end if;

  -- 4. Contrôles après écriture.
  v_etat := public.etat_commercial_gestion_pro(v_e.id);
  if v_etat <> (case v_option when 'A' then 'trial' else 'active' end) then
    raise exception 'PILOTE : état commercial GP % après écriture : annulation', v_etat;
  end if;
  if exists (select 1 from public.entreprises
              where id <> v_e.id and updated_at >= now() and reference_interne is distinct from 'PILOTE-BTP-V1') then
    raise exception 'PILOTE : une autre entreprise a été modifiée dans la transaction : annulation';
  end if;
  raise notice 'PILOTE | option=% | etat_gp=% | jusqu_au=%', v_option, v_etat, v_jusqu;
end;
$$;
commit;
