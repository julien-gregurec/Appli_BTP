import assert from "node:assert/strict";
import test from "node:test";

import {
  REF_PREVIEW_AUTORISEE,
  REGISTRE_SCRIPTS,
  verifierAutorisationComplete,
  verifierCiblePreview,
  verifierConfirmationDestructive,
  verifierRefLieeCli,
  verifierScriptConnu,
} from "./garde-scripts-production.mjs";

const ENV_PREVIEW_VALIDE = {
  SUPABASE_PROJECT_REF: REF_PREVIEW_AUTORISEE,
  NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PREVIEW_AUTORISEE}.supabase.co`,
};

test("verifierCiblePreview — ref Preview exacte → autorisé", () => {
  const resultat = verifierCiblePreview(ENV_PREVIEW_VALIDE);
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.ref, REF_PREVIEW_AUTORISEE);
});

test("verifierCiblePreview — ref Production fictive → refus", () => {
  const resultat = verifierCiblePreview({
    SUPABASE_PROJECT_REF: "futureproductionrefxx",
    NEXT_PUBLIC_SUPABASE_URL: "https://futureproductionrefxx.supabase.co",
  });
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /refusée/);
});

test("verifierCiblePreview — ref absente → refus", () => {
  const resultat = verifierCiblePreview({});
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /absente/);
});

test("verifierCiblePreview — URL absente alors que SUPABASE_PROJECT_REF présente → refus", () => {
  const resultat = verifierCiblePreview({ SUPABASE_PROJECT_REF: REF_PREVIEW_AUTORISEE });
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /NEXT_PUBLIC_SUPABASE_URL/);
});

test("verifierCiblePreview — ref inconnue/incohérente entre les deux sources → refus", () => {
  const resultat = verifierCiblePreview({
    SUPABASE_PROJECT_REF: REF_PREVIEW_AUTORISEE,
    NEXT_PUBLIC_SUPABASE_URL: "https://autreprojetquelconque.supabase.co",
  });
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /Incohérence/);
});

test("verifierCiblePreview — URL malformée (pas un hôte *.supabase.co) → refus", () => {
  const resultat = verifierCiblePreview({
    SUPABASE_PROJECT_REF: REF_PREVIEW_AUTORISEE,
    NEXT_PUBLIC_SUPABASE_URL: "https://evil.example.com/pgvvpqyjziyapbbkydmc",
  });
  assert.equal(resultat.autorise, false);
});

test("verifierRefLieeCli — ref liée CLI = Preview → autorisé", () => {
  assert.equal(verifierRefLieeCli(REF_PREVIEW_AUTORISEE).autorise, true);
  assert.equal(verifierRefLieeCli(`${REF_PREVIEW_AUTORISEE}\n`).autorise, true);
});

test("verifierRefLieeCli — ref liée CLI absente ou différente → refus", () => {
  assert.equal(verifierRefLieeCli(null).autorise, false);
  assert.equal(verifierRefLieeCli("").autorise, false);
  assert.equal(verifierRefLieeCli("un-autre-projet").autorise, false);
});

test("verifierScriptConnu — script du registre → autorisé, script hors registre → refus", () => {
  assert.equal(verifierScriptConnu("seed_juju_6_mois.sql").autorise, true);
  const inconnu = verifierScriptConnu("../../etc/passwd");
  assert.equal(inconnu.autorise, false);
  assert.match(inconnu.motif, /inconnu/);
});

test("verifierConfirmationDestructive — script non destructif ne requiert rien", () => {
  const resultat = verifierConfirmationDestructive({}, REGISTRE_SCRIPTS["seed_juju_6_mois.sql"]);
  assert.equal(resultat.autorise, true);
});

test("verifierConfirmationDestructive — script destructif sans confirmation → refus", () => {
  const resultat = verifierConfirmationDestructive({}, REGISTRE_SCRIPTS["supprimer_entreprises_test.sql"]);
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /absente/);
});

test("verifierConfirmationDestructive — script destructif avec mauvaise valeur → refus", () => {
  const resultat = verifierConfirmationDestructive(
    { CONFIRM_DELETE_TEST_DATA: "oui" },
    REGISTRE_SCRIPTS["supprimer_entreprises_test.sql"],
  );
  assert.equal(resultat.autorise, false);
});

test("verifierConfirmationDestructive — script destructif avec la bonne confirmation → autorisé", () => {
  const resultat = verifierConfirmationDestructive(
    { CONFIRM_DELETE_TEST_DATA: "YES" },
    REGISTRE_SCRIPTS["supprimer_entreprises_test.sql"],
  );
  assert.equal(resultat.autorise, true);
});

test("verifierAutorisationComplete — parcours nominal script non destructif sur Preview → autorisé", () => {
  const resultat = verifierAutorisationComplete("seed_juju_6_mois.sql", ENV_PREVIEW_VALIDE, REF_PREVIEW_AUTORISEE);
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.destructif, false);
});

test("verifierAutorisationComplete — script destructif sur Preview SANS confirmation → refus, jusqu'au point précédant l'écriture réelle", () => {
  const resultat = verifierAutorisationComplete("supprimer_entreprises_test.sql", ENV_PREVIEW_VALIDE, REF_PREVIEW_AUTORISEE);
  assert.equal(resultat.autorise, false);
  assert.match(resultat.motif, /confirmation explicite requise/);
});

test("verifierAutorisationComplete — script destructif sur Preview AVEC confirmation → autorisé", () => {
  const resultat = verifierAutorisationComplete(
    "supprimer_entreprises_test.sql",
    { ...ENV_PREVIEW_VALIDE, CONFIRM_DELETE_TEST_DATA: "YES" },
    REF_PREVIEW_AUTORISEE,
  );
  assert.equal(resultat.autorise, true);
  assert.equal(resultat.destructif, true);
});

test("verifierAutorisationComplete — même avec confirmation, une cible Production fictive reste refusée", () => {
  const resultat = verifierAutorisationComplete(
    "supprimer_entreprises_test.sql",
    {
      SUPABASE_PROJECT_REF: "future-production-ref",
      NEXT_PUBLIC_SUPABASE_URL: "https://future-production-ref.supabase.co",
      CONFIRM_DELETE_TEST_DATA: "YES",
    },
    "future-production-ref",
  );
  assert.equal(resultat.autorise, false);
});

test("verifierAutorisationComplete — ref CLI liée différente des variables d'env → refus (défense en profondeur)", () => {
  const resultat = verifierAutorisationComplete("seed_juju_6_mois.sql", ENV_PREVIEW_VALIDE, "un-autre-projet-lie");
  assert.equal(resultat.autorise, false);
});

test("verifierAutorisationComplete — script archivé (sortie_mode_prototype.sql) n'est plus dans le registre", () => {
  assert.equal("sortie_mode_prototype.sql" in REGISTRE_SCRIPTS, false);
  const resultat = verifierAutorisationComplete("sortie_mode_prototype.sql", ENV_PREVIEW_VALIDE, REF_PREVIEW_AUTORISEE);
  assert.equal(resultat.autorise, false);
});
