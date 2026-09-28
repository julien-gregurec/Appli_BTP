// Registre officiel des scripts de données (seeds, fixtures, démo, pilote, Preview, DR, recette).
//
// Source de vérité du harnais `npm run verify:seeds` (scripts/seeds/verify-seeds.mjs) et du
// test statique `npm run test:seeds` (scripts/seeds/registry.test.mjs), qui échoue si un
// nouveau script de données apparaît sans être classé ici.
//
// Classes :
//   ACTIVE           outillage exécuté localement et maintenu (drill DR…)
//   CI_ONLY          fixture de qualification / e2e / perf, base jetable uniquement
//   PREVIEW          données de recette destinées au projet Preview (wrapper ou garde dédiée)
//   PRODUCTION_TOOL  outil opérateur visant un projet hébergé hors recette (démo commerciale)
//   LEGACY           historique, NE PLUS EXÉCUTER : en-tête « LEGACY » obligatoire, refusé par
//                    le wrapper scripts/executer-script-production.mjs
//   BROKEN / UNKNOWN interdits dans ce registre une fois la qualification close (le test
//                    statique échoue s'il en reste)
//
// `harness` décrit l'exécution réelle sur base fraîche (train complet) :
//   setup : étapes jouées une fois avant le seed ; run : le seed lui-même ;
//   runs  : nombre d'exécutions successives (3 = rejouable, même état final exigé) ;
//   check : étapes jouées après CHAQUE exécution (assertions) ;
//   flow  : scénario complémentaire (reprise après interruption, DR, cycle de nettoyage…).
// Étapes : { sql: "chemin" } | { inline: "sql" } | { seed: "id" } (étapes run d'un autre seed)
//          | { emitSql: "chemin .mjs" } (script généré puis exécuté) | { env: {…} } ajouté à psql.
//
// `bypass` : contournements de garde assumés et bornés (fixtures uniquement). Le test statique
// refuse tout `disable trigger`, `session_replication_role` ou `capacite_personnes_bypass`
// non déclaré ici.

export const CLASSES = ["ACTIVE", "CI_ONLY", "PREVIEW", "PRODUCTION_TOOL", "LEGACY", "BROKEN", "UNKNOWN"];

export const PREVIEW_COMPANY_ID = "1bfc5dc6-1979-408c-babc-ee15841f3d21";

const PREREQUIS = { sql: "scripts/seeds/fixtures/prerequis.sql" };
const ENTREPRISE_TEST = [
  PREREQUIS,
  { inline: "select seed_harness.onboarder('22222222-2222-4222-8222-222222222222', 'Entreprise Test', '33333333-3333-4333-8333-333333333333', 'entreprise.test@example.test', 40);" },
  { inline: "select seed_harness.salaries('22222222-2222-4222-8222-222222222222', 6, 'TST');" },
];
const ENTREPRISE_PREVIEW = [
  PREREQUIS,
  { inline: `select seed_harness.onboarder('${PREVIEW_COMPANY_ID}', 'ELSATIA — Recette Preview', '44444444-4444-4444-8444-444444444444', 'julien.gregurec@gmail.com', 10);` },
];
// Représentation Auth de GoTrue et parité Storage (miroir de tests/e2e/*-pile-locale/preparer-base.sh,
// sans les mots de passe des rôles de passerelle, inutiles ici).
const PARITE_GOTRUE = { inline: `
grant all on table storage.objects, storage.buckets to anon, authenticated, service_role;
alter table auth.users
  add column if not exists confirmation_token text, add column if not exists recovery_token text,
  add column if not exists email_change_token_new text, add column if not exists email_change text,
  add column if not exists email_change_token_current text, add column if not exists phone_change text,
  add column if not exists phone_change_token text, add column if not exists reauthentication_token text;
create table if not exists auth.identities (
  id uuid not null, provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null, provider text not null, created_at timestamptz, updated_at timestamptz,
  primary key (provider_id, provider));` };
const ISOLATION_MULTITENANT = { inline: "\\ir supabase/tests/fixtures/isolation_multitenant.inc", transaction: true };
const MDP_RECETTE = { env: { MDP_RECETTE: "harnais-seeds-mot-de-passe-local" } };

export const SEEDS = [
  // ── Preview ──────────────────────────────────────────────────────────────
  {
    id: "preview-year",
    path: "scripts/seed-elsatia-preview-year.mjs",
    classification: "PREVIEW",
    target: "Preview pgvvpqyjziyapbbkydmc, entreprise 1bfc5dc6-… (garde intégrée + projet lié)",
    idempotent: true,
    harness: {
      setup: ENTREPRISE_PREVIEW,
      run: [{ emitSql: "scripts/seed-elsatia-preview-year.mjs" }],
      runs: 3,
      flow: "interruption",
    },
  },
  {
    id: "pilote-btp",
    path: "supabase/production/seed_entreprise_pilote_btp.sql",
    classification: "PREVIEW",
    target: "Preview via scripts/executer-script-production.mjs",
    idempotent: true,
    harness: {
      run: [{ sql: "supabase/production/seed_entreprise_pilote_btp.sql" }],
      runs: 3,
      check: [{ sql: "supabase/production/assertions_entreprise_pilote_btp.sql" }],
      flow: "pilote-cycle",
    },
  },
  {
    id: "pilote-btp-assertions",
    path: "supabase/production/assertions_entreprise_pilote_btp.sql",
    classification: "PREVIEW",
    target: "Preview via wrapper (lecture seule)",
    coveredBy: "pilote-btp",
  },
  {
    id: "pilote-btp-cleanup",
    path: "supabase/production/cleanup_entreprise_pilote_btp.sql",
    classification: "PREVIEW",
    target: "Preview via wrapper, destructif (CONFIRM_DELETE_TEST_DATA=YES)",
    coveredBy: "pilote-btp",
    bypass: {
      "disable trigger": "Désactive nommément 4 triggers d'immuabilité (devis accepté / facture émise) et la garde CM-06 de suppression des commandes envoyées, dans une transaction unique, le temps de supprimer la seule entreprise PILOTE-BTP-V1 — voir en-tête du script et ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1 §14.",
    },
  },
  {
    id: "entreprise-test-5-ans",
    path: "supabase/production/seed_entreprise_test_5_ans.sql",
    classification: "PREVIEW",
    target: "Preview via wrapper — entreprise « Entreprise Test »",
    idempotent: true,
    harness: {
      setup: ENTREPRISE_TEST,
      run: [{ sql: "supabase/production/seed_entreprise_test_5_ans.sql" }],
      runs: 3,
    },
  },
  {
    id: "entreprise-test-tous-onglets",
    path: "supabase/production/seed_entreprise_test_tous_onglets.sql",
    classification: "PREVIEW",
    target: "Preview via wrapper — après entreprise-test-5-ans",
    idempotent: true,
    harness: {
      setup: [...ENTREPRISE_TEST, { seed: "entreprise-test-5-ans" }],
      run: [{ sql: "supabase/production/seed_entreprise_test_tous_onglets.sql" }],
      runs: 3,
    },
  },
  {
    id: "entreprise-test-suivi-terrain",
    path: "supabase/production/seed_entreprise_test_suivi_terrain.sql",
    classification: "PREVIEW",
    target: "Preview via wrapper — après entreprise-test-5-ans",
    idempotent: true,
    harness: {
      setup: [...ENTREPRISE_TEST, { seed: "entreprise-test-5-ans" }],
      run: [{ sql: "supabase/production/seed_entreprise_test_suivi_terrain.sql" }],
      runs: 3,
    },
  },

  // ── Démonstration commerciale ────────────────────────────────────────────
  {
    id: "demo-18-mois",
    path: "supabase/production/creer_entreprise_demo_18_mois.sql",
    classification: "PRODUCTION_TOOL",
    target: "entreprise DEMO-18M (démo commerciale) — wrapper Preview ; cf. docs/organisation/DEMO_COMMERCIALE.md",
    idempotent: true,
    harness: {
      run: [{ sql: "supabase/production/creer_entreprise_demo_18_mois.sql" }],
      runs: 3,
      flow: "demo-reset",
    },
  },
  {
    id: "demo-18-mois-reset",
    path: "supabase/production/reset_entreprise_demo_18_mois.sql",
    classification: "PRODUCTION_TOOL",
    target: "entreprise DEMO-18M — suppression puis recréation par demo-18-mois",
    coveredBy: "demo-18-mois",
    bypass: {
      "disable trigger": "Désactive nommément les 4 triggers d'immuabilité (devis accepté / facture émise), dans une transaction unique, le temps de vider la seule entreprise DEMO-18M.",
    },
  },

  // ── Drill DR ─────────────────────────────────────────────────────────────
  {
    id: "dr-synthetic",
    path: "scripts/dr/03_seed_synthetic_dataset.sql",
    classification: "ACTIVE",
    target: "base locale jetable elsatia_dr_drill* (scripts/dr/lib/common.sh refuse toute autre cible)",
    idempotent: false,
    harness: {
      run: [{ sql: "scripts/dr/03_seed_synthetic_dataset.sql" }],
      runs: 1,
      flow: "dr",
    },
  },
  {
    id: "dr-stubs",
    path: "scripts/dr/00_supabase_stubs.sql",
    classification: "ACTIVE",
    target: "amorce plateforme du drill DR (pas un seed de données)",
    coveredBy: "infrastructure",
  },

  // ── Fixtures de qualification, e2e, perf ─────────────────────────────────
  {
    id: "purge-qualification-v2",
    path: "supabase/production/seed_purge_qualification_v2.sql",
    classification: "CI_ONLY",
    target: "base locale jetable (qualification RGPD purge V2)",
    idempotent: true,
    bypass: {
      capacite_personnes_bypass: "Fixture locale : `set local` dans la transaction du script, superutilisateur uniquement ; 5 salariés actifs par tenant sans offre.",
    },
    harness: {
      run: [{ sql: "supabase/production/seed_purge_qualification_v2.sql" }],
      runs: 3,
    },
  },
  {
    id: "perf-fixture",
    path: "scripts/perf/generate_fixture.sql",
    classification: "CI_ONLY",
    target: "base locale jetable (qualification capacité GP)",
    idempotent: false,
    harness: {
      run: [{ sql: "scripts/perf/generate_fixture.sql" }],
      runs: 1,
    },
  },
  {
    id: "perf-annuaire",
    path: "scripts/perf/annuaire-plateforme.sql",
    classification: "CI_ONLY",
    target: "base locale jetable (banc annuaire plateforme ; décor créé puis retiré)",
    idempotent: true,
    harness: {
      run: [{ sql: "scripts/perf/annuaire-plateforme.sql" }],
      runs: 2,
    },
  },
  {
    id: "e2e-reserves",
    path: "scripts/e2e/prepare-reserves-v3-recipe.sql",
    classification: "CI_ONLY",
    target: "recette e2e Réserves (tests/e2e/reserves-pile-locale/preparer-base.sh)",
    idempotent: true,
    harness: {
      setup: [PARITE_GOTRUE, ISOLATION_MULTITENANT],
      run: [
        { sql: "scripts/e2e/prepare-local-recipe.sql" },
        { sql: "scripts/e2e/prepare-reserves-v3-recipe.sql" },
        { sql: "scripts/e2e/prepare-local-recipe.sql" },
        { sql: "scripts/e2e/reset-reserves-recipe.sql" },
        { sql: "scripts/e2e/prepare-reserves-v4-listes.sql" },
        { sql: "scripts/e2e/prepare-reserves-v6-securite.sql" },
        // Train V5 : décor isolé D-01 (hôte suspendu → intervenant en lecture seule).
        { sql: "scripts/e2e/prepare-reserves-suspension-hote.sql" },
        { sql: "scripts/e2e/prepare-reserves-v6-charge.sql" },
      ],
      runs: 3,
    },
  },
  { id: "e2e-reserves-suspension-hote", path: "scripts/e2e/prepare-reserves-suspension-hote.sql", classification: "CI_ONLY", target: "recette e2e Réserves D-01 (hôte suspendu)", coveredBy: "e2e-reserves" },
  // Train V4 → V5 : décor GP ↔ Réserves (tests/e2e/gp-reserves-pile-locale/preparer-base.sh).
  {
    id: "e2e-gp-reserves",
    path: "scripts/e2e/prepare-gp-reserves-integration.sql",
    classification: "CI_ONLY",
    target: "recette e2e GP ↔ Réserves (tests/e2e/gp-reserves-pile-locale/preparer-base.sh)",
    // Décor à usage unique : preparer-base.sh reconstruit la base avant chaque chargement
    // (sous-traitants et compteurs ajoutés à chaque passe : non rejouable, déclaré ici).
    idempotent: false,
    harness: {
      setup: [PARITE_GOTRUE, ISOLATION_MULTITENANT],
      run: [
        { sql: "scripts/e2e/prepare-gp-reserves-integration.sql" },
        { sql: "scripts/e2e/prepare-local-recipe.sql" },
      ],
      runs: 1,
    },
    bypass: {
      capacite_personnes_bypass: "Décor e2e : `set local` dans la transaction du script, base jetable uniquement.",
    },
  },
  // Train V4 → V5 : jeu de la recette Playwright Relevé & Métré (releve_e2e_stack.sh, comptes GoTrue
  // remplacés ici par deux lignes auth.users ; mêmes variables psql ua / ub / ea).
  {
    id: "e2e-releve",
    path: "scripts/local-postgres-bootstrap/releve_e2e_seed.sql",
    classification: "CI_ONLY",
    target: "recette e2e Relevé & Métré (scripts/local-postgres-bootstrap/releve_e2e_stack.sh)",
    // Chargé une fois par releve_e2e_stack.sh, sur une base reconstruite : non rejouable.
    idempotent: false,
    harness: {
      setup: [
        PARITE_GOTRUE,
        { seed: "pilote-btp" },
        { inline: "insert into auth.users (id, email) values ('e2e0a000-0000-4000-8000-00000000000a', 'releve-a@example.test'), ('e2e0b000-0000-4000-8000-00000000000b', 'releve-b@example.test') on conflict do nothing;" },
      ],
      run: [
        { inline: "\\set ua 'e2e0a000-0000-4000-8000-00000000000a'\n\\set ub 'e2e0b000-0000-4000-8000-00000000000b'\nselect id as ea from public.entreprises where reference_interne = 'PILOTE-BTP-V1' \\gset\n\\ir scripts/local-postgres-bootstrap/releve_e2e_seed.sql" },
      ],
      runs: 1,
    },
    bypass: {
      capacite_personnes_bypass: "Recette e2e : `set` de session sur la base jetable de la pile Relevé, superutilisateur uniquement.",
    },
  },
  { id: "e2e-local-recipe", path: "scripts/e2e/prepare-local-recipe.sql", classification: "CI_ONLY", target: "recette e2e locale", coveredBy: "e2e-reserves" },
  { id: "e2e-reserves-v4", path: "scripts/e2e/prepare-reserves-v4-listes.sql", classification: "CI_ONLY", target: "recette e2e Réserves", coveredBy: "e2e-reserves" },
  { id: "e2e-reserves-v6-charge", path: "scripts/e2e/prepare-reserves-v6-charge.sql", classification: "CI_ONLY", target: "recette e2e Réserves (charge)", coveredBy: "e2e-reserves" },
  { id: "e2e-reserves-v6-securite", path: "scripts/e2e/prepare-reserves-v6-securite.sql", classification: "CI_ONLY", target: "recette e2e Réserves (sécurité)", coveredBy: "e2e-reserves" },
  { id: "e2e-reserves-reset", path: "scripts/e2e/reset-reserves-recipe.sql", classification: "CI_ONLY", target: "remise à zéro recette e2e Réserves", coveredBy: "e2e-reserves" },
  {
    id: "e2e-reserves-amorce",
    path: "scripts/e2e/amorcer-recette-v4.mjs",
    classification: "CI_ONLY",
    target: "dépôt Storage de la recette Réserves (passerelle locale démarrée) — hors base",
    coveredBy: "non-executable-sans-passerelle",
  },
  {
    id: "e2e-reserves-recette",
    path: "scripts/e2e/recette-reserves-v4.sh",
    classification: "CI_ONLY",
    target: "orchestration docker de la recette Réserves (mêmes fichiers SQL que e2e-reserves)",
    coveredBy: "e2e-reserves",
  },
  {
    id: "e2e-colors",
    path: "tests/e2e/fixtures/colors-pilote.sql",
    classification: "CI_ONLY",
    target: "recette e2e Colors (tests/e2e/colors-pile-locale/preparer-base.sh)",
    idempotent: true,
    harness: {
      setup: [PARITE_GOTRUE],
      run: [MDP_RECETTE, { sql: "tests/e2e/fixtures/colors-pilote.sql" }],
      runs: 3,
    },
  },
  {
    id: "upgrade-complements",
    path: "scripts/local-postgres-bootstrap/upgrade_v1_v2_seed_complement.sql",
    classification: "CI_ONLY",
    target: "qualification d'upgrade du train (base locale jetable)",
    idempotent: false,
    harness: {
      setup: [
        PARITE_GOTRUE, ISOLATION_MULTITENANT,
        { inline: "\\ir supabase/tests/fixtures/rgpd_tenant_facture_emise.inc", transaction: true },
        { inline: "\\ir supabase/tests/fixtures/rgpd_tenant_contrats_acceptes.inc", transaction: true },
        { seed: "e2e-reserves" },
        { seed: "pilote-btp" },
        { seed: "e2e-colors" },
      ],
      run: [
        { sql: "scripts/local-postgres-bootstrap/upgrade_v1_v2_seed_complement.sql" },
        { sql: "scripts/local-postgres-bootstrap/upgrade_v2_v3_seed_complement.sql" },
      ],
      runs: 1,
    },
  },
  {
    id: "upgrade-complement-v5",
    path: "scripts/local-postgres-bootstrap/upgrade_v4_v5_seed_complement.sql",
    classification: "CI_ONLY",
    target: "qualification d'upgrade V4 → V5 (base V4 avec historique V3, jamais une base fraîche V5)",
    coveredBy: "upgrade-harness",
  },
  {
    id: "upgrade-complement-v6",
    path: "scripts/local-postgres-bootstrap/upgrade_v5_v6_seed_complement.sql",
    classification: "CI_ONLY",
    // Écrit l'état d'une base V5 (plan 2D sans surface de pièce synchronisée) : ne se charge que
    // sur une base au train V5 construite depuis V3 par upgrade-v5-v6.sh, jamais sur une base
    // fraîche V6.
    target: "qualification d'upgrade V5 → V6 (base V5 avec historique V3 → V4 → V5, jamais une base fraîche V6)",
    coveredBy: "upgrade-harness",
  },
  {
    id: "upgrade-complement-v4",
    path: "scripts/local-postgres-bootstrap/upgrade_v3_v4_seed_complement.sql",
    classification: "CI_ONLY",
    // Écrit des commandes directement à leur statut, comme sur une vraie base V3 : ne se charge
    // que sur une base AVANT le verrou 20260926000506, jamais sur une base fraîche du train.
    target: "qualification d'upgrade V3 → V4 (et V4 → V5, base V4 construite depuis V3)",
    coveredBy: "upgrade-harness",
  },
  {
    id: "upgrade-complement-v3",
    path: "scripts/local-postgres-bootstrap/upgrade_v2_v3_seed_complement.sql",
    classification: "CI_ONLY",
    target: "qualification d'upgrade V2 → V3",
    coveredBy: "upgrade-complements",
  },
  {
    id: "pgtap-isolation",
    path: "supabase/tests/fixtures/isolation_multitenant.inc",
    classification: "CI_ONLY",
    target: "squelette RLS partagé par les suites pgTAP (et prérequis des recettes e2e)",
    coveredBy: "e2e-reserves",
    bypass: {
      capacite_personnes_bypass: "Fixture pgTAP : `set local` dans la transaction du test, superutilisateur uniquement.",
    },
    note: "Squelette d'isolation volontairement minimal (devis accepté et facture émise sans lignes, totaux de commande saisis, stock initial sans mouvement) : le harnais signale ces écarts comme hérités des prérequis, sans les imputer aux seeds construits dessus.",
  },
  { id: "pgtap-rgpd-driver", path: "supabase/tests/fixtures/rgpd_purge_driver.inc", classification: "CI_ONLY", target: "pilote de purge des suites pgTAP RGPD", coveredBy: "pgtap" },
  {
    id: "pgtap-rgpd-commandes",
    path: "supabase/tests/fixtures/rgpd_tenant_commandes_fournisseurs.inc",
    classification: "CI_ONLY",
    target: "fixture pgTAP RGPD commandes fournisseurs (après isolation_multitenant.inc)",
    idempotent: false,
    bypass: {
      capacite_personnes_bypass: "Fixture pgTAP : `set local` dans la transaction du test, superutilisateur uniquement (le trigger l'ignore pour les rôles d'API).",
    },
    harness: {
      setup: [ISOLATION_MULTITENANT],
      run: [{ inline: "\\ir supabase/tests/fixtures/rgpd_tenant_commandes_fournisseurs.inc", transaction: true }],
      runs: 1,
    },
  },
  {
    id: "pgtap-rgpd-contrats",
    path: "supabase/tests/fixtures/rgpd_tenant_contrats_acceptes.inc",
    classification: "CI_ONLY",
    target: "fixture pgTAP RGPD contrats",
    coveredBy: "upgrade-complements",
    bypass: { capacite_personnes_bypass: "Fixture pgTAP : `set local` dans la transaction du test, superutilisateur uniquement." },
  },
  {
    id: "pgtap-rgpd-facture",
    path: "supabase/tests/fixtures/rgpd_tenant_facture_emise.inc",
    classification: "CI_ONLY",
    target: "fixture pgTAP RGPD facture émise",
    coveredBy: "upgrade-complements",
    bypass: { capacite_personnes_bypass: "Fixture pgTAP : `set local` dans la transaction du test, superutilisateur uniquement." },
  },
  {
    id: "studio-benchmark",
    path: "apps/studio/scripts/benchmark-projects-local.sql",
    classification: "CI_ONLY",
    target: "projet Supabase Studio dédié (chaîne de migrations séparée, apps/studio) — hors train GP",
    coveredBy: "studio-ci",
  },

  // ── Historique : ne plus exécuter ────────────────────────────────────────
  {
    id: "juju-6-mois",
    path: "supabase/production/seed_juju_6_mois.sql",
    classification: "LEGACY",
    target: "entreprise « juju » supprimée le 14-07-2026 (supprimer_entreprises_test.sql)",
    reason: "Entreprise cible supprimée (compilation et patron brouillon → lignes → statut corrigés par le train V4, sans objet). Refusé par le wrapper.",
  },
  {
    id: "juju-encodage",
    path: "supabase/production/corriger_encodage_juju.sql",
    classification: "LEGACY",
    target: "réparation ponctuelle de l'encodage de juju (entreprise supprimée)",
    reason: "Correctif ponctuel d'un incident de presse-papiers sur une entreprise supprimée. Refusé par le wrapper.",
  },
  {
    id: "supprimer-entreprises-test",
    path: "supabase/production/supprimer_entreprises_test.sql",
    classification: "LEGACY",
    target: "nettoyage ponctuel du 14-07-2026 (identifiants en dur, dont un identifiant ELSATIA obsolète)",
    reason: "Écarté par P11 (REGISTRE_CENTRAL) : identifiants en dur obsolètes. Refusé par le wrapper.",
  },
  {
    id: "sortie-mode-prototype",
    path: "supabase/production/archive/NE_PAS_EXECUTER_sortie_mode_prototype.sql",
    classification: "LEGACY",
    target: "archive (audit du 07-08-2026)",
    reason: "Archivé, cassé et dangereux (voir son en-tête).",
  },
  {
    id: "demo-history",
    path: "scripts/seed-demo-history.mjs",
    classification: "LEGACY",
    target: "mode prototype sans connexion (clé publique + RPC dev_contexte_entreprise)",
    reason: "Dépend de public.dev_contexte_entreprise(), supprimée par 20260714000078 (fermeture de l'accès anonyme), et d'écritures anonymes refusées depuis. Arrêt immédiat en tête de script.",
  },
  {
    id: "witnesses-hardening-v1",
    path: "docs/qualification/witnesses/10_seed_tenants.sql",
    classification: "LEGACY",
    target: "preuves archivées du rapport ELSATIA_GP_HARDENING_REAL_DB_QUALIFICATION_V1",
    reason: "Jeu de preuve figé d'une qualification close (migration de régression 20260922000201 propre à ce rapport) ; conservé comme archive documentaire.",
  },
];

export function seedById(id) {
  return SEEDS.find((seed) => seed.id === id) ?? null;
}
