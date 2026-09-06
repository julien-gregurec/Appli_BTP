// Contrôle de cohérence de la documentation de cutover Gestion Pro.
//
// Lot ELSATIA-GP-CUTOVER-DOCUMENTATION-CLOSURE-V1.
//
// STRICTEMENT EN LECTURE SEULE : ce script ne touche ni Git, ni Supabase, ni Vercel,
// ni le réseau. Il ne lit que des fichiers Markdown du dépôt.
//
// Usage : node scripts/verify-cutover-docs.mjs

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CANON = {
  cible: "996be15c136f09d9977375e700462b503a1720c3",
  ledgerDepart: "210",
  ledgerCible: "263",
  gap: "53",
  pointNonRetour: "20260902000255_acl_reconciliation_v1",
  productionBranch: "release/commercialisation-v1",
  hotfix: "7ba62c5315213bf21b9ed8553408fc678e943327",
};

const RUNBOOK_JOUR_J = "docs/runbooks/ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md";
const INDEX = "docs/runbooks/INDEX_CUTOVER_GP_V1.md";
const PREFLIGHT = "docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_PREFLIGHT_FINAL_V1.md";
const CHECKLIST = "docs/runbooks/ELSATIA_PRODUCTION_CUTOVER_OPERATOR_CHECKLIST_V1.md";

// Ce qui est dangereux n'est pas de citer un ancien SHA — les documents historiques
// doivent pouvoir expliquer la filiation de la cible — mais de le présenter comme
// quelque chose à DÉPLOYER. On ne signale donc une valeur périmée que lorsqu'elle
// apparaît dans un vocabulaire de cible/déploiement, et qu'aucun marqueur
// d'obsolescence n'est présent dans son voisinage immédiat (± 2 lignes).
const VOCABULAIRE_CIBLE =
  /cible|target|déploy|deploy|promouv|promotion|production branch|sha app|à appliquer/i;

const MARQUEURS_PERIME = [
  "périmé", "perime", "obsolèt", "obsolet", "ancien", "remplac", "superseded",
  "filiation", "historique", "jamais", "ne pas", "plus cours", "successivement",
  "n'ont plus", "inclus dans", "couvert", "résiduelle", "doit être lue",
];

const erreurs = [];
const controles = [];

function lire(chemin) {
  const abs = resolve(process.cwd(), chemin);
  if (!existsSync(abs)) {
    erreurs.push(`${chemin} : fichier introuvable`);
    return null;
  }
  return readFileSync(abs, "utf8");
}

function doitContenir(chemin, contenu, aiguille, libelle) {
  if (contenu === null) return;
  const ok = contenu.includes(aiguille);
  controles.push({ ok, libelle: `${libelle} (${chemin})` });
  if (!ok) erreurs.push(`${chemin} : ${libelle} — attendu « ${aiguille} », absent`);
}

function consignesPerimees(contenu, motif) {
  const lignes = contenu.split("\n");
  return lignes
    .map((ligne, i) => ({ ligne, n: i + 1, i }))
    .filter(({ ligne }) => motif.test(ligne))
    .filter(({ ligne }) => VOCABULAIRE_CIBLE.test(ligne))
    .filter(({ i }) => {
      const voisinage = lignes.slice(Math.max(0, i - 2), i + 3).join(" ").toLowerCase();
      return !MARQUEURS_PERIME.some((m) => voisinage.includes(m.toLowerCase()));
    });
}

// ---------------------------------------------------------------- runbook jour J
const jourJ = lire(RUNBOOK_JOUR_J);
doitContenir(RUNBOOK_JOUR_J, jourJ, CANON.cible, "cible cutover = 996be15 (SHA complet)");
doitContenir(RUNBOOK_JOUR_J, jourJ, `${CANON.ledgerDepart} → ${CANON.ledgerCible}`, "ledger 210 → 263");
doitContenir(RUNBOOK_JOUR_J, jourJ, CANON.pointNonRetour, "point de non-retour = migration 255");
doitContenir(RUNBOOK_JOUR_J, jourJ, CANON.productionBranch, "production branch = release/commercialisation-v1");
doitContenir(RUNBOOK_JOUR_J, jourJ, CANON.hotfix, "hotfix post-cutover = 7ba62c (SHA complet)");
doitContenir(RUNBOOK_JOUR_J, jourJ, "--include-all", "commande canonique avec --include-all");
doitContenir(RUNBOOK_JOUR_J, jourJ, "git fetch origin", "revalidation origin avant promotion");
doitContenir(RUNBOOK_JOUR_J, jourJ, "fast-forward", "promotion en fast-forward strict");
doitContenir(RUNBOOK_JOUR_J, jourJ, "À RENSEIGNER PAR JULIEN", "rôles laissés à renseigner, aucun nom inventé");
doitContenir(RUNBOOK_JOUR_J, jourJ, "VERROU RÔLE C", "verrou empêchant d'oublier le rôle C avant T0");
doitContenir(RUNBOOK_JOUR_J, jourJ, "À VÉRIFIER PAR L'OPÉRATEUR", "statut Supabase Pro / PITR non présumé");
doitContenir(RUNBOOK_JOUR_J, jourJ, "livemode = false", "smoke Stripe TEST obligatoire");
doitContenir(RUNBOOK_JOUR_J, jourJ, "FEATURE_AI_ENABLED=false", "réaffirmation explicite des flags sensibles");
doitContenir(RUNBOOK_JOUR_J, jourJ, "FEATURE_BOUTIQUE_ENABLED=false", "flag fail-open boutique posé explicitement");
doitContenir(RUNBOOK_JOUR_J, jourJ, "FEATURE_CRONS_ENABLED=false", "flag fail-open crons posé explicitement");
doitContenir(RUNBOOK_JOUR_J, jourJ, "ABONNEMENTS_PUBLICS_OUVERTS=false", "souscription payante fermée");
doitContenir(RUNBOOK_JOUR_J, jourJ, "DISABLE_EMAIL_LOGIN=false", "login e-mail actif");
doitContenir(RUNBOOK_JOUR_J, jourJ, "ELSATIA_APPLICATION_ENV=production", "environnement applicatif");
doitContenir(RUNBOOK_JOUR_J, jourJ, "GLOBAL OWNER ALL APPS", "note lot global owner présente");
doitContenir(RUNBOOK_JOUR_J, jourJ, "ledger 263", "dépendance Colors au ledger 263");

if (jourJ) {
  // Les 13 repères chronologiques exigés.
  const titres = jourJ.split("\n").filter((l) => l.startsWith("### "));
  for (const repere of [
    "J-1", "T-60", "T-45", "T-30", "T-15", "T0",
    "T+10", "T+20", "T+30", "T+45", "T+60", "T+90", "T+120", "Post-cutover",
  ]) {
    const ok = titres.some((t) => t.includes(repere));
    controles.push({ ok, libelle: `repère chronologique ${repere}` });
    if (!ok) erreurs.push(`${RUNBOOK_JOUR_J} : repère chronologique « ${repere} » absent`);
  }

  // L'ordre Ed25519 doit être écrit : registry après les migrations, jamais avant.
  const ordreEd = jourJ.includes("JAMAIS de registry avant les migrations");
  controles.push({ ok: ordreEd, libelle: "ordre Ed25519 (registry après migrations)" });
  if (!ordreEd) erreurs.push(`${RUNBOOK_JOUR_J} : l'interdiction « registry avant migrations » n'est pas écrite`);
}

// -------------------------------------------------------- valeurs périmées actives
for (const [chemin, contenu] of [
  [RUNBOOK_JOUR_J, jourJ],
  [INDEX, lire(INDEX)],
  [PREFLIGHT, lire(PREFLIGHT)],
  [CHECKLIST, lire(CHECKLIST)],
]) {
  if (!contenu) continue;

  const sha = consignesPerimees(contenu, /1d15289|b371641|c1930ab/);
  controles.push({ ok: sha.length === 0, libelle: `aucun SHA périmé présenté comme cible (${chemin})` });
  for (const { ligne, n } of sha) {
    erreurs.push(`${chemin}:${n} : SHA périmé présenté comme cible/déploiement → ${ligne.trim().slice(0, 120)}`);
  }

  const gap = consignesPerimees(contenu, /50 ou 51|gap 5[01]\b|gap réel 5[01]\b|\b5[01] migrations\b/);
  controles.push({ ok: gap.length === 0, libelle: `aucun gap périmé (50/51) en consigne active (${chemin})` });
  for (const { ligne, n } of gap) {
    erreurs.push(`${chemin}:${n} : gap périmé (50/51) présenté comme consigne → ${ligne.trim().slice(0, 120)}`);
  }
}

// -------------------------------------------------------------------- cohérence croisée
const preflight = lire(PREFLIGHT);
doitContenir(PREFLIGHT, preflight, "ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md", "renvoi vers la source unique");
doitContenir(PREFLIGHT, preflight, "gap réel figé = **53**", "gate T-45 aligné sur le gap canonique");
doitContenir(PREFLIGHT, preflight, "--include-all", "commande canonique avec --include-all");

const checklist = lire(CHECKLIST);
doitContenir(CHECKLIST, checklist, "SUPERSEDED", "bannière SUPERSEDED présente");
doitContenir(CHECKLIST, checklist, "ELSATIA_GP_CUTOVER_DAY_OF_RUNBOOK_V1.md", "renvoi vers la source unique");

const index = lire(INDEX);
doitContenir(INDEX, index, CANON.cible, "index : cible canonique");
doitContenir(INDEX, index, CANON.hotfix, "index : hotfix canonique");
doitContenir(INDEX, index, "FAIT FOI", "index : document faisant foi désigné");

// ------------------------------------------------------------------------- sortie
const reussis = controles.filter((c) => c.ok).length;

if (erreurs.length) {
  console.error(`\nFAIL — documentation cutover incohérente (${erreurs.length} problème(s)) :`);
  for (const e of erreurs) console.error(`  - ${e}`);
  console.error(`\n${reussis}/${controles.length} contrôles passés.\n`);
  process.exit(1);
}

console.log(`PASS — ${reussis}/${controles.length} contrôles de cohérence documentaire passés.`);
console.log(`  cible ${CANON.cible.slice(0, 7)} · ledger ${CANON.ledgerDepart} → ${CANON.ledgerCible} · gap ${CANON.gap}`);
console.log(`  point de non-retour ${CANON.pointNonRetour}`);
console.log(`  production branch ${CANON.productionBranch} · hotfix ${CANON.hotfix.slice(0, 7)}`);
