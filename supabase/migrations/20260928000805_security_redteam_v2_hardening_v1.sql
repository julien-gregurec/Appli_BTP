-- Train canonique V8 : numéro d'origine 20260928000701 (C. Security Red Team V2 (claude/elsatia-v6-security-redteam-v2)), renuméroté 20260928000805
-- (bloc V8 strictement après la dernière migration de V7, 20260928000701, projet partagé) ; corps inchangé.
-- ELSATIA — Security Red Team V2 : correctifs base prouvés localement.
-- Rapport : docs/qualification/ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2.md
--
-- Trois correctifs, chacun avec un témoin d'exploit négatif ET positif (pgTAP
-- security_redteam_v2_hardening_v1.test.sql) :
--
--   1. RÉVOCATION de deux fonctions SECURITY DEFINER exposées à `authenticated`
--      sans contrôle du tenant appelant. Aucune n'est appelée par l'application
--      sous une session `authenticated` : `construire_client_snapshot` n'est
--      invoquée que par des triggers SECURITY DEFINER (capture d'identité à
--      l'émission), et `capacite_stripe_operations_a_reprendre` uniquement par
--      le client admin (service_role) du cron/reconcile. Le grant `authenticated`
--      permettait à n'importe quel membre d'une organisation de lire, via un
--      appel RPC PostgREST direct, l'identité complète d'un client d'une AUTRE
--      organisation (nom, SIRET, e-mail, téléphone, adresse) ou l'inventaire
--      des opérations de capacité Stripe de tous les tenants.
--
--   2. COHÉRENCE tenant ↔ chantier sur `reserves_intervenants` et
--      `reserves_plans`. Les policies d'INSERT/UPDATE n'autorisaient que sur
--      `entreprise_id`, sans vérifier que `chantier_id` appartient à la même
--      organisation : une organisation hôte pouvait rattacher un intervenant
--      (ou un plan) au chantier d'une AUTRE organisation, ce qui ouvrait la
--      lecture du chantier tiers aux intervenants et contaminait la
--      synchronisation GP. Un trigger BEFORE INSERT/UPDATE fait respecter
--      l'invariant, quel que soit le chemin (API PostgREST directe comprise).

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Révocation des deux fonctions SECURITY DEFINER sur-exposées.
--    service_role conserve l'accès (cron/reconcile) ; les triggers internes
--    s'exécutent sous le propriétaire (postgres), pas sous l'appelant.
-- ─────────────────────────────────────────────────────────────────────────────
revoke execute on function public.construire_client_snapshot(uuid, uuid, text) from authenticated;
revoke execute on function public.capacite_stripe_operations_a_reprendre(integer) from authenticated;

comment on function public.construire_client_snapshot(uuid, uuid, text) is
  'Construit l''identité figée d''un destinataire de document commercial. Appelée UNIQUEMENT par les triggers de capture (SECURITY DEFINER) : révoquée à authenticated (REDTEAM-V2) car un appel RPC direct lisait l''identité d''un client d''un autre tenant.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Cohérence tenant ↔ chantier sur les tables Réserves rattachées à un chantier.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.reserves_garde_chantier_meme_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ent_chantier uuid;
begin
  select entreprise_id into v_ent_chantier
  from public.reserves_chantiers
  where id = new.chantier_id;

  if v_ent_chantier is null then
    raise exception 'Chantier Réserves introuvable' using errcode = '23503';
  end if;
  if v_ent_chantier <> new.entreprise_id then
    raise exception 'Le chantier appartient à une autre organisation'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on function public.reserves_garde_chantier_meme_tenant() is
  'REDTEAM-V2 : refuse tout rattachement d''un intervenant ou d''un plan au chantier d''une autre organisation (chantier_id.entreprise_id doit égaler la ligne).';

drop trigger if exists reserves_intervenants_meme_tenant on public.reserves_intervenants;
create trigger reserves_intervenants_meme_tenant
  before insert or update of chantier_id, entreprise_id on public.reserves_intervenants
  for each row execute function public.reserves_garde_chantier_meme_tenant();

drop trigger if exists reserves_plans_meme_tenant on public.reserves_plans;
create trigger reserves_plans_meme_tenant
  before insert or update of chantier_id, entreprise_id on public.reserves_plans
  for each row execute function public.reserves_garde_chantier_meme_tenant();

commit;
