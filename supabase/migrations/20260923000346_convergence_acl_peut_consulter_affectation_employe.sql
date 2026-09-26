-- Train canonique V1 — migration de convergence (plage 20260923000346+ réservée
-- par docs/qualification/ELSATIA_CANONICAL_TRAIN_MERGE_PLAN_V1.md §3.4).
--
-- 20260923000327_pl05_cloisonnement_lecture_affectations.sql (Pilot Quick Wins,
-- claude/brave-feynman-6ogvtq) a été écrite sur la lignée Pilot Acceptance V3,
-- qui ne porte pas l'invariant ACL du tronc. Elle crée
-- public.peut_consulter_affectation_employe(uuid, uuid) en SECURITY DEFINER
-- sans retirer le droit EXECUTE implicite de PUBLIC : la fonction restait donc
-- exécutable par `anon`, ce que refusent les gates pgTAP du tronc
-- isolation_multitenant_surface (test 8) et
-- security_remediation_anon_execute_revocation_v1 (test 4).
--
-- Correctif : même ACL que la fonction jumelle peut_consulter_pointage_employe
-- (20260713000052 / 20260718000108 / 20260902000255) — révoquée pour PUBLIC et
-- anon, accordée explicitement à authenticated (seul rôle visé par la policy
-- RESTRICTIVE role_affectation_select). Le retrait service_role de 327 est
-- conservé tel quel. Aucune modification du corps de la fonction ni de la
-- policy : la règle d'accès PL-05 est strictement inchangée.

revoke all on function public.peut_consulter_affectation_employe(uuid, uuid) from public, anon;
grant execute on function public.peut_consulter_affectation_employe(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
