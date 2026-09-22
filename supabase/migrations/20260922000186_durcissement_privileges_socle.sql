-- Durcissement de privilèges SQL non couverts par la RLS. Porté depuis
-- integration/gp-external-pilot-closure-v1 (commit 7a2a4c0,
-- 20260729000185_isolation_multitenant_grants_et_definer.sql), mais revérifié et RÉDUIT ici :
-- sur les ~9 lignes de la migration source, seules les 2 ci-dessous ont été retenues comme un
-- gap réel, actuellement présent, ET sans risque de régression vérifiable sans base de
-- données réelle. Le reste de la migration source a été examiné et n'a pas été porté :
--
-- - `compteurs_reference` (créée 20260710000001, jamais depuis) n'a effectivement JAMAIS eu la
--   RLS activée sur cette branche — seule table dans ce cas parmi celles créées par ce module,
--   et `authenticated` n'a jamais eu ses privilèges de table par défaut révoqués dessus (seul
--   `anon` l'a été, rétroactivement, par la migration 78) : sans RLS, un utilisateur
--   authentifié d'une AUTRE entreprise pourrait en principe lire/altérer le dernier numéro de
--   séquence (devis/facture/commande/…) de n'importe quelle entreprise. C'est un gap réel.
--   MAIS : activer une RLS nue (sans policy) casserait un chemin d'écriture légitime identifié
--   ici — `public.trg_set_entreprise_reference()` (20260710000001, trigger `before insert on
--   entreprises`) N'EST PAS `security definer` (contrairement à tous les autres triggers de
--   numérotation du dépôt), et `entreprises` autorise l'INSERT direct côté client
--   (`create policy "un utilisateur crée une entreprise" on public.entreprises for insert with
--   check (auth.uid() is not null)`, même migration). Un nouvel utilisateur qui crée sa
--   première entreprise sans passer par `creer_entreprise_bootstrap` (SECURITY DEFINER)
--   déclencherait ce trigger avec son propre rôle authentifié, qui appellerait
--   `next_reference()` (SECURITY INVOKER lui aussi) pour insérer dans `compteurs_reference` —
--   une RLS nue bloquerait cet INSERT et casserait la création d'entreprise pour ce chemin.
--   Concevoir la policy correcte (portée par entreprise_id, y compris pour le sentinel uuid nul
--   utilisé par les compteurs globaux à la plateforme) et la valider est un travail réel qui
--   nécessite un accès base de données pour être testé sans risque — non disponible dans cet
--   environnement (§9 du rapport). **Non porté ici, documenté comme DECISION_REQUIRED** (voir
--   le rapport de qualification).
-- - Le reste (revoke sur `peut_voir_document_chantier`, `plateforme_creer_version_tarif`, et 7
--   fonctions trigger) a été vérifié un par un et s'est révélé déjà sans risque ici : soit déjà
--   correctement accordé (`plateforme_creer_version_tarif` est déjà `authenticated`-only,
--   20260723000142_tarification_abonnements.sql), soit protégé par construction (une fonction
--   dont `returns trigger` ne peut de toute façon pas être invoquée directement hors d'un vrai
--   trigger — PostgreSQL refuse l'appel), soit déjà couvert par défaut :
--   `20260714000078_fermeture_acces_anonyme_production.sql` ferme déjà `EXECUTE ... FROM anon`
--   par défaut pour toute fonction créée après cette date (`alter default privileges ... revoke
--   execute on functions from anon`, ciblant le rôle `anon` spécifiquement, pas seulement
--   `PUBLIC` — confirmé empiriquement par les 22 fonctions revérifiées en §11bis du rapport de
--   qualification : aucune n'était exposée à `anon` malgré l'absence de revoke individuel pour
--   20 d'entre elles).
--
-- Les 2 changements portés ici, sans risque de régression (aucun chemin applicatif n'utilise
-- TRUNCATE/TRIGGER/REFERENCES ni ne dépend de l'absence de `search_path` fixe) :
--
-- 1. `revoke truncate, trigger, references` : TRUNCATE n'est protégé par aucune policy RLS ;
--    ni l'application ni PostgREST n'ont besoin de TRUNCATE/TRIGGER/REFERENCES sur les tables
--    exposées à `anon`/`authenticated` (PostgREST ne traduit jamais une requête REST/RPC en
--    TRUNCATE ou en DDL). Retiré par défaut pour l'avenir et rétroactivement pour toutes les
--    tables existantes.
-- 2. `entreprise_sans_membres(uuid)` est `security definer` sans aucun `set search_path` —
--    confirmé sur `20260710000001_comptes_entreprises.sql` : c'est la seule fonction
--    `security definer` de cette migration fondatrice à ne pas fixer `search_path`. Elle
--    qualifie déjà pleinement `public.utilisateurs_entreprises`, donc le risque pratique de
--    détournement est faible, mais l'omission est réelle et l'ajout est sans risque
--    fonctionnel (aligne cette fonction sur toutes les autres `security definer` du dépôt).

begin;

revoke truncate, trigger, references on all tables in schema public
  from anon, authenticated;
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

alter function public.entreprise_sans_membres(uuid) set search_path = public;

commit;
