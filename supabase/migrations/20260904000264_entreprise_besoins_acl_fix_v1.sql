-- ELSATIA-FIRST-CUSTOMER-E2E-RECETTE-V1 : corrige une régression bloquante
-- constatée en recette premier client (onboarding réel, entreprise Fresh).
--
-- Constat : `entreprise_besoins` (première étape du parcours d'inscription,
-- questionnaire de besoins) échouait avec `42501 permission denied for table
-- entreprise_besoins` dès le premier nouveau client. Diagnostic étendu à
-- toute la base Fresh canonique (261 migrations) : les tables qui portent des
-- policies RLS pour `authenticated` mais qui n'ont jamais reçu de GRANT de
-- table explicite dans une migration de restauration de privilèges
-- (`20260729000185_isolation_multitenant_grants_et_definer.sql` et les
-- migrations `restaurer_privileges_*` qui l'ont suivie) vivaient sur un
-- privilège hérité implicite — révoqué par
-- `20260902000255_acl_reconciliation_v1.sql` comme « excédentaire par
-- rapport au Fresh canonique », sans qu'aucune migration ne le regrante.
--
-- Sur les 11 tables détectées dans cette situation, 5 sont réellement
-- interrogées en direct par le code applicatif (`supabase.from(...)`, donc
-- bloquées pour de vrai) ; les 6 autres
-- (chantier_transferts, cles_api, codes_acces, contacts_clients,
-- support_messages) ne sont accédées que via des RPC SECURITY DEFINER (ou ne
-- sont plus référencées du tout côté application) et restent volontairement
-- sans GRANT — leur absence de grant est correcte et n'est pas touchée ici.
--
-- Tables corrigées, avec le privilège exact couvert par une policy RLS ET
-- réellement utilisé par l'application :
--   - entreprise_besoins        (questionnaire de besoins à l'inscription)
--   - acces_externes_documents  (partage externe de devis/factures)
--   - lignes_inventaire         (inventaires de stock)
--   - parametres_relances       (paramètres de relances automatiques)
--   - taches                    (tâches de chantier)
--   - types_chantier            (types de chantier, liste déroulante)

GRANT SELECT, INSERT, UPDATE ON TABLE public.entreprise_besoins TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.acces_externes_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.lignes_inventaire TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.parametres_relances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.taches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.types_chantier TO authenticated;
