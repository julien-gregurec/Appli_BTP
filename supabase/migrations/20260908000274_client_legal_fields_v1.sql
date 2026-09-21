-- ELSATIA-GP-CLIENT-LEGAL-FIELDS-V1 — champs d'identité légale sur public.clients.
--
-- PROVENANCE. Le contenu métier de cette migration vient de la proposition
-- `docs/migrations-proposees/client-legal-fields-v1.sql.proposed`, écrite par le lot
-- ELSATIA-GP-DOCUMENT-RESEND-OVERRIDE-AND-CLIENT-LEGAL-FIELDS-V1 (12909d395e9f75a840990245e8445d1291428ec1)
-- et délibérément laissée hors de `supabase/migrations/` : au moment de son écriture, la
-- réconciliation du ledger était en cours et aucun numéro ne pouvait être attribué sans
-- risquer la collision déjà rencontrée par le dépôt (deux lots revendiquant `000266`).
--
-- NUMÉRO. 274 est le premier libre après 273 (`reserves_v5_offline_idempotence_v1`),
-- vérifié sur l'ensemble des références locales et distantes du dépôt : aucune migration
-- de numéro fonctionnel ≥ 274 n'existe nulle part. Le préfixe 14 chiffres suit celui des
-- migrations 271 à 273 du même train.
--
-- PRÉMISSES VÉRIFIÉES, NON SUPPOSÉES. Les quatre colonnes ajoutées ici sont réellement
-- absentes de `public.clients` : la table est créée par 20260710000004 et n'a reçu depuis
-- que `latitude`/`longitude` (20260715000080) et `relance_auto_exclue` (20260824000230).
-- Les homonymes existants portent sur d'AUTRES tables — `entreprises.forme_juridique`
-- (20260716000089) et `fournisseurs.numero_tva` (20260718000111) — et ne sont pas touchés.
--
-- `nom_commercial` N'EST PAS CRÉÉ, DÉLIBÉRÉMENT. La colonne ferait double emploi avec
-- `public.clients.societe`, qui existe, est peuplée, est saisie au formulaire et sert déjà
-- de nom d'affichage. La correspondance retenue avec `@elsatia/client-contracts` est :
--
--     tradeName  -> public.clients.societe          (existante, utilisée)
--     legalName  -> public.clients.raison_sociale   (existante depuis 20260710000004,
--                                                    jusqu'ici inexploitée par le code)
--
-- Il n'y a donc rien à ajouter pour la dénomination légale : il y a à l'ACTIVER côté
-- application. Ajouter `nom_commercial` créerait une troisième source pour le même nom.

alter table public.clients
  add column if not exists numero_tva text,
  add column if not exists forme_juridique text,
  add column if not exists adresse_complement text,
  add column if not exists pays text;

comment on column public.clients.numero_tva is
  'Numéro de TVA intracommunautaire, forme normalisée sans espaces ni ponctuation (FR40303265045). Facultatif : requis sur facture seulement dans certaines situations, jamais pour un particulier. La validité réelle (clé de contrôle) appartient à @elsatia/client-contracts, pas à la base.';
comment on column public.clients.forme_juridique is
  'SAS, SARL, EURL, SCI, commune… Champ libre et facultatif : la liste officielle évolue. Miroir de entreprises.forme_juridique.';
comment on column public.clients.adresse_complement is
  'Deuxième ligne facultative d''adresse de facturation (bâtiment, étage, boîte postale).';
comment on column public.clients.pays is
  'Code pays ISO 3166-1 alpha-2 en majuscules. NULL = non renseigné, traité comme FR à la LECTURE uniquement ; ce défaut n''est jamais écrit en base, pour ne pas affirmer une information que personne n''a saisie.';

-- Contraintes de FORME, pas de règles métier.
--
-- `not valid` : les contraintes ne sont pas vérifiées rétroactivement. Les quatre colonnes
-- viennent d'être créées et sont donc intégralement nulles — aucune ligne existante ne peut
-- les violer aujourd'hui. `not valid` est conservé par prudence : il garantit que la
-- migration ne peut pas échouer sur une base où ces colonnes auraient été créées hors train
-- avec des données non conformes. Seules les écritures ultérieures sont contrôlées.

alter table public.clients drop constraint if exists clients_numero_tva_forme_check;
alter table public.clients add constraint clients_numero_tva_forme_check
  check (numero_tva is null or numero_tva ~ '^[A-Z]{2}[0-9A-Z]{2,13}$') not valid;

alter table public.clients drop constraint if exists clients_pays_forme_check;
alter table public.clients add constraint clients_pays_forme_check
  check (pays is null or pays ~ '^[A-Z]{2}$') not valid;

-- SNAPSHOT DOCUMENTAIRE : aucun changement, et aucun backfill.
--
-- `public.construire_client_snapshot` (20260908000272) filtre `to_jsonb(client)` par une
-- liste blanche qui contient DÉJÀ ces quatre clés : le jour où les colonnes existent, elles
-- sont capturées sans une ligne de code supplémentaire. C'est vérifié par exécution
-- (supabase/tests/client_document_snapshot_v1.test.sql), pas supposé.
--
-- AUCUN BACKFILL N'EST ÉCRIT, et c'est intentionnel : ces champs n'ont jamais été saisis,
-- il n'existe aucune source pour les reconstituer, et les documents déjà émis conservent —
-- correctement — un snapshot où ils valent null. Écrire après coup un numéro de TVA sur un
-- document historique fabriquerait une mention qui n'a jamais figuré sur le document remis
-- au client. Les snapshots historiques restent immuables.
--
-- IDEMPOTENCE. `add column if not exists`, `drop constraint if exists` puis `add
-- constraint` : la migration est rejouable sans erreur et sans effet de bord.
--
-- RLS ET MULTI-TENANT : aucun changement requis. Quatre colonnes sur une table existante
-- héritent des policies de `public.clients` (cloisonnement par `entreprise_id`), sans
-- nouvelle surface d'accès. Aucune table, fonction ni permission créée — donc aucun INSERT
-- dans `permissions_disponibles`, et rien à révoquer.

notify pgrst, 'reload schema';
