-- ALERTES-DELEGATION-V1 — Rollback préparé, NON exécuté par défaut.
-- À n'exécuter qu'en cas d'anomalie réelle constatée après la migration
-- 20260821000220_alertes_delegation_v1.sql, via la même méthode isolée
-- (supabase db query --linked -f), jamais via db push.

begin;

delete from public.notifications_utilisateurs where type = 'alerte_deleguee';

revoke execute on function public.deleguer_alerte_operationnelle(uuid, text, text, text, text, text, uuid, text) from authenticated;
revoke execute on function public.employes_delegables_alertes(uuid) from authenticated;

drop function if exists public.deleguer_alerte_operationnelle(uuid, text, text, text, text, text, uuid, text);
drop function if exists public.employes_delegables_alertes(uuid);

drop policy if exists alertes_delegations_lecture on public.alertes_operationnelles_delegations;

drop table if exists public.alertes_operationnelles_delegations;

commit;
