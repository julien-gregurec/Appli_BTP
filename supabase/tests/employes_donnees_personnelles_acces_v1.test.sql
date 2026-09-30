-- ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1
--
-- Constat V6 (9102ec80) : la policy "membres accedent aux employes" (FOR ALL,
-- est_membre_actif) et le GRANT SELECT de table laissent TOUT membre actif lire
-- TOUTES les colonnes de TOUTES les fiches de son entreprise : email,
-- téléphone, notes libres (RH), numéro d'inscription (secret d'activation),
-- hash du code stock, carte BTP, chemin de signature. Les habilitations, le coût
-- interne et le taux facturé sont en outre modifiables par n'importe quel
-- membre (l'UI exige gerer_employes, pas la base). L'export RGPD d'entreprise,
-- gardé par gerer_parametres seul, livre la paie (NIR), le RIB et les notes à
-- un poste qui ne peut pas les lire à l'écran.
--
-- Correctif : 20260928000701_employes_donnees_personnelles_acces_v1.sql.
-- Ce fichier est ROUGE sur V6 et VERT après le correctif. Chaque assertion
-- passe par edp_val() (voir le fixture) : aucune erreur n'interrompt le fichier.
--
-- Les requêtes sont exécutées sous `set local role authenticated` + claims JWT,
-- c'est-à-dire exactement ce que fait PostgREST pour un appel REST direct, un
-- appel RPC, une route API ou une Server Action utilisant le client utilisateur.
begin;
create extension if not exists pgtap with schema extensions;
select plan(65);

\ir fixtures/employes_donnees_personnelles.inc

-- ---------------------------------------------------------------------------
-- 1. Ouvrier (modèle canonique « ouvrier ») : annuaire oui, fiche privée non.
-- ---------------------------------------------------------------------------
set local role authenticated;
select edp_as('ed100000-0000-0000-0000-000000000007');

select is(edp_val($$select prenom || ' ' || nom from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'Victime A', 'ouvrier : l''annuaire (prénom, nom) d''un collègue reste lisible');
select is(edp_val($$select poste from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'Carreleuse', 'ouvrier : la fonction d''un collègue reste lisible');
select is(edp_val($$select e.prenom from (values ('ed1e0000-0000-0000-0000-0000000000f1'::uuid)) v(id) join public.employes e on e.id = v.id$$),
  'Victime', 'ouvrier : les jointures d''annuaire (embeds PostgREST) continuent de fonctionner');
select is(edp_val($$select count(*)::text from public.employes_annuaire where entreprise_id = 'eda00000-0000-0000-0000-000000000001'$$),
  '8', 'ouvrier : la projection employes_annuaire liste les 8 fiches de son entreprise');

select is(edp_val($$select email from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : email d''un collègue refusé par la base (REST direct)');
select is(edp_val($$select telephone from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : téléphone d''un collègue refusé');
select is(edp_val($$select notes from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : notes RH refusées');
select is(edp_val($$select numero_inscription from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : numéro d''inscription (secret d''activation) refusé');
select is(edp_val($$select code_stock_hash from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : hash du code stock refusé (pas de force brute hors ligne)');
select is(edp_val($$select carte_btp_numero from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : numéro de carte BTP refusé');
select is(edp_val($$select signature_storage_path from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'ouvrier : chemin de signature refusé');
select is(edp_val($$select count(*)::text from (select * from public.employes) x$$),
  'ERR:42501', 'ouvrier : select * (PostgREST select=*) refusé');
select is(edp_val($$select count(*)::text from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '0', 'ouvrier : aucune fiche détaillée d''un collègue via employes_fiche');
select is(edp_val($$select email from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-000000000007'$$),
  'ouvrier-a@edp.invalid', 'ouvrier : sa propre fiche détaillée reste lisible (coordonnées)');
select is(edp_val($$select coalesce(notes, '<masqué>') from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-000000000007'$$),
  '<masqué>', 'ouvrier : la note managériale sur sa propre fiche reste masquée');
select is(edp_val($$select signature_storage_path from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-000000000007'$$),
  'eda00000-0000-0000-0000-000000000001/ed1e0000-0000-0000-0000-000000000007/signature.png',
  'ouvrier : sa propre signature reste accessible (signature de documents métier)');

-- Écritures (l'UI les réserve à gerer_employes ; la base doit faire de même).
select is(edp_exec($$insert into public.habilitations_employe (entreprise_id, employe_id, type, libelle) values ('eda00000-0000-0000-0000-000000000001', 'ed1e0000-0000-0000-0000-000000000007', 'autre', 'auto-habilitation')$$),
  'ERR:42501', 'ouvrier : ne peut pas s''ajouter une habilitation');
select is(edp_val($$with d as (delete from public.habilitations_employe where id = 'ed1f0000-0000-0000-0000-000000000001' returning 1) select count(*)::text from d$$),
  '0', 'ouvrier : ne peut pas supprimer l''habilitation d''un collègue');
select is(edp_exec($$insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire) values ('ed1e0000-0000-0000-0000-000000000007', 'eda00000-0000-0000-0000-000000000001', 99)$$),
  'ERR:42501', 'ouvrier : ne peut pas écrire un coût horaire interne');
select is(edp_exec($$insert into public.employes_taux_facture (employe_id, entreprise_id, taux_horaire) values ('ed1e0000-0000-0000-0000-000000000007', 'eda00000-0000-0000-0000-000000000001', 99)$$),
  'ERR:42501', 'ouvrier : ne peut pas écrire un taux facturé');
select is(edp_val($$with u as (update public.employes set notes = 'pirate' where id = 'ed1e0000-0000-0000-0000-0000000000f1' returning 1) select count(*)::text from u$$),
  '0', 'ouvrier : ne peut pas modifier la note d''un collègue (non-régression)');
select is(edp_val($$select (public.exporter_donnees_entreprise('eda00000-0000-0000-0000-000000000001') is not null)::text$$),
  'ERR:P0001', 'ouvrier : export RGPD d''entreprise refusé (non-régression)');

-- Inter-tenant.
select is(edp_val($$select count(*)::text from public.employes where entreprise_id = 'edb00000-0000-0000-0000-000000000001'$$),
  '0', 'ouvrier A : aucune fiche de l''entreprise B, même en annuaire');

-- ---------------------------------------------------------------------------
-- 2. Chef d'équipe (modèle canonique, sans acces_employes) : comme l'ouvrier.
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000006');
select is(edp_val($$select email from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'chef d''équipe : email d''un collègue refusé');
select is(edp_val($$select count(*)::text from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '0', 'chef d''équipe : aucune fiche détaillée d''un collègue');
select is(edp_val($$select nom from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'A', 'chef d''équipe : annuaire lisible');

-- ---------------------------------------------------------------------------
-- 3. Chef de chantier (acces_employes, sans gerer_employes) : coordonnées
--    professionnelles et carte BTP oui ; notes, secrets et fichiers non.
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000005');
select is(edp_val($$select email from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'victime.privee@edp.invalid', 'chef de chantier : email visible via employes_fiche (module Employés)');
select is(edp_val($$select telephone from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '0611223344', 'chef de chantier : téléphone visible via employes_fiche');
select is(edp_val($$select carte_btp_numero || ' ' || carte_btp_expiration from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'CBTP-VICTIME-123 2030-01-01', 'chef de chantier : numéro et validité de carte BTP visibles (contrôle d''accès chantier)');
select is(edp_val($$select coalesce(notes, '<masqué>') from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '<masqué>', 'chef de chantier : note RH masquée');
select is(edp_val($$select coalesce(numero_inscription, '<masqué>') from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '<masqué>', 'chef de chantier : numéro d''inscription masqué');
select is(edp_val($$select coalesce(carte_btp_storage_path, '<masqué>') || '|' || coalesce(signature_storage_path, '<masqué>') from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '<masqué>|<masqué>', 'chef de chantier : chemins de fichiers carte BTP / signature masqués');
select is(edp_val($$select email from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ERR:42501', 'chef de chantier : la table de base reste fermée sur les colonnes sensibles');
select is(edp_val($$select libelle from public.habilitations_employe where id = 'ed1f0000-0000-0000-0000-000000000001'$$),
  'CACES R489', 'chef de chantier : habilitations lisibles (donnée opérationnelle)');
select is(edp_val($$select count(*)::text from public.employes_fiche where entreprise_id = 'edb00000-0000-0000-0000-000000000001'$$),
  '0', 'chef de chantier A : aucune fiche de l''entreprise B');

-- ---------------------------------------------------------------------------
-- 4. RH (gerer_employes) : fiche complète, écritures autorisées.
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000002');
select is(edp_val($$select notes from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'NOTE_RH_SECRETE_A', 'RH : note RH visible');
select is(edp_val($$select numero_inscription from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'EDP-A-VICTIME', 'RH : numéro d''inscription visible (invitation)');
select is(edp_val($$select carte_btp_storage_path from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'eda00000-0000-0000-0000-000000000001/ed1e0000-0000-0000-0000-0000000000f1/carte-btp.pdf', 'RH : chemin de la carte BTP visible');
select is(edp_val($$with u as (update public.employes set notes = 'NOTE_MAJ_RH', telephone = '0700000000' where id = 'ed1e0000-0000-0000-0000-0000000000f1' returning 1) select count(*)::text from u$$),
  '1', 'RH : peut modifier notes et téléphone (UPDATE ... RETURNING non sensible)');
select is(edp_val($$select notes || '|' || telephone from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'NOTE_MAJ_RH|0700000000', 'RH : relit la modification via employes_fiche');
select is(edp_exec($$insert into public.habilitations_employe (entreprise_id, employe_id, type, libelle) values ('eda00000-0000-0000-0000-000000000001', 'ed1e0000-0000-0000-0000-0000000000f1', 'autre', 'SST')$$),
  'ok', 'RH : peut ajouter une habilitation');
select is(edp_exec($$insert into public.employes_cout_horaire (employe_id, entreprise_id, cout_horaire) values ('ed1e0000-0000-0000-0000-000000000006', 'eda00000-0000-0000-0000-000000000001', 30)$$),
  'ok', 'RH : peut écrire un coût horaire interne');
select is(edp_val($$select id::text from public.employes where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'ed1e0000-0000-0000-0000-0000000000f1', 'RH : filtre par id sur la table de base toujours possible');
select is(edp_val($$select (public.exporter_donnees_entreprise('eda00000-0000-0000-0000-000000000001') is not null)::text$$),
  'ERR:P0001', 'RH : export RGPD d''entreprise refusé (gerer_parametres requis, non-régression)');
select is(edp_val($$select code_stock_hash from public.employes_fiche limit 1$$),
  'ERR:42703', 'employes_fiche n''expose jamais code_stock_hash, même au RH');

-- ---------------------------------------------------------------------------
-- 5. Comptable (acces_employes + gerer_paie, sans gerer_employes) : pas de
--    note RH. Le profil de paie (NIR) lui reste ouvert : gerer_paie le lit via
--    la policy FOR ALL paie_profils_write (rôle paie légitime, inchangé).
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000003');
select is(edp_val($$select coalesce(notes, '<masqué>') from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '<masqué>', 'comptable : note RH masquée');
select is(edp_val($$select numero_securite_sociale from public.profils_paie_employes where employe_id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'NIR_SECRET_VICTIME', 'comptable (gerer_paie) : profil de paie lisible (rôle paie légitime, non-régression)');
select edp_as('ed100000-0000-0000-0000-000000000005');
select is(edp_val($$select count(*)::text from public.profils_paie_employes where employe_id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '0', 'chef de chantier : profil de paie (NIR) fermé (non-régression)');
select is(edp_val($$select count(*)::text from public.coordonnees_bancaires where employe_id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  '0', 'chef de chantier : RIB fermé (non-régression)');

-- ---------------------------------------------------------------------------
-- 6. Administration (gerer_parametres, sans paie, RIB ni gerer_employes) :
--    l'export RGPD ne doit pas contourner ce que l'écran lui refuse.
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000004');
create temporary table edp_export_adm on commit drop as
  select public.exporter_donnees_entreprise('eda00000-0000-0000-0000-000000000001') as j;
select is((select (j->'donnees') ? 'profils_paie_employes' from edp_export_adm)::text,
  'false', 'administration : export RGPD sans profils de paie (NIR)');
select is((select (j->'donnees') ? 'coordonnees_bancaires' from edp_export_adm)::text,
  'false', 'administration : export RGPD sans coordonnées bancaires');
select is((select (j->'donnees') ? 'employes_cout_horaire' from edp_export_adm)::text,
  'false', 'administration : export RGPD sans coût interne');
select is((select (j::text like '%NOTE_MAJ_RH%') from edp_export_adm)::text,
  'false', 'administration : export RGPD sans notes RH');
select is((select (j::text like '%EDP-A-VICTIME%') from edp_export_adm)::text,
  'false', 'administration : export RGPD sans numéros d''inscription');
select is((select jsonb_array_length(j->'donnees'->'employes') from edp_export_adm)::text,
  '8', 'administration : export RGPD garde l''annuaire des 8 salariés (portabilité)');
select is((select (j->'sections_restreintes') ? 'profils_paie_employes' from edp_export_adm)::text,
  'true', 'administration : l''export déclare les sections retirées (pas de trou silencieux)');

-- ---------------------------------------------------------------------------
-- 7. Gérant (tous les droits) : export complet et fiche complète.
-- ---------------------------------------------------------------------------
select edp_as('ed100000-0000-0000-0000-000000000001');
create temporary table edp_export_ger on commit drop as
  select public.exporter_donnees_entreprise('eda00000-0000-0000-0000-000000000001') as j;
select is((select (j::text like '%NIR_SECRET_VICTIME%') from edp_export_ger)::text,
  'true', 'gérant : export RGPD complet (profil de paie inclus)');
select is((select (j::text like '%NOTE_MAJ_RH%') from edp_export_ger)::text,
  'true', 'gérant : export RGPD complet (notes RH incluses)');
select is((select (j->'donnees') ? 'coordonnees_bancaires' from edp_export_ger)::text,
  'true', 'gérant : export RGPD complet (RIB chiffré inclus)');
select is((select (j::text like '%NOTE_RH_SECRETE_B%' or j::text like '%salarie.prive@edp-b%') from edp_export_ger)::text,
  'false', 'gérant A : l''export ne contient aucune donnée de l''entreprise B');
select is((select (j::text like '%$2%') from edp_export_ger)::text,
  'false', 'gérant : l''export ne contient pas le hash bcrypt du code stock');
select is(edp_val($$select notes from public.employes_fiche where id = 'ed1e0000-0000-0000-0000-0000000000f1'$$),
  'NOTE_MAJ_RH', 'gérant : note RH visible');

-- ---------------------------------------------------------------------------
-- 8. Entreprise B : isolation symétrique.
-- ---------------------------------------------------------------------------
select edp_as('ed200000-0000-0000-0000-000000000001');
select is(edp_val($$select count(*)::text from public.employes_fiche where entreprise_id = 'eda00000-0000-0000-0000-000000000001'$$),
  '0', 'gérant B : aucune fiche détaillée de l''entreprise A');
select is(edp_val($$select notes from public.employes_fiche where id = 'ed2e0000-0000-0000-0000-0000000000f1'$$),
  'NOTE_RH_SECRETE_B', 'gérant B : fiche complète de ses propres salariés');

-- ---------------------------------------------------------------------------
-- 9. anon : rien.
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select is(edp_val($$select count(*)::text from public.employes_fiche$$),
  'ERR:42501', 'anon : employes_fiche inaccessible');

reset role;
select * from finish();
rollback;
