-- Droits explicites sur les tables historiques.
--
-- Les premières migrations s'appuyaient sur l'ancienne exposition automatique
-- des tables créées dans `public` (droits accordés implicitement à anon,
-- authenticated et service_role). Les nouveaux projets Supabase, et la CLI
-- locale depuis l'option `auto_expose_new_tables` (supprimée le 2026-10-30),
-- n'accordent plus ces droits : sur une base reconstruite à neuf, l'application
-- ne pouvait plus lire ni écrire devis, factures, clients, chantiers, etc., et
-- le client serveur `service_role` n'avait plus accès à aucune table.
--
-- Cette migration rend ces droits explicites, sans rien ouvrir à `anon` :
-- * service_role (clé serveur uniquement, contourne la RLS) : accès complet ;
-- * authenticated : uniquement sur les tables métier protégées par RLS que
--   l'application lit ou écrit directement. Les politiques RLS existantes
--   restent seules juges des lignes visibles et modifiables.
-- Les tables volontairement fermées (compteurs, journaux plateforme, webhooks
-- Stripe, clés API, tentatives d'accès) ne reçoivent aucun droit
-- authenticated. Sur une base où les droits implicites existent déjà, cette
-- migration ne change rien.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'entreprises', 'entreprise_besoins', 'utilisateurs', 'utilisateurs_entreprises',
    'clients', 'contacts_clients', 'chantiers', 'chantier_transferts', 'types_chantier',
    'devis', 'lignes_devis', 'factures', 'lignes_factures', 'paiements',
    'taches', 'support_messages'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table and c.relrowsecurity
    ) then
      raise exception 'Table public.% absente ou sans RLS : droit refusé', v_table;
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
  end loop;
end $$;
