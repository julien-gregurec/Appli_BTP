#!/usr/bin/env node
// ELSATIA — verify:stripe-prices
// Garde-fou : le prix AFFICHÉ (catalogue canonique) doit être exactement le prix FACTURÉ
// (Price Stripe pointé par les variables STRIPE_PRICE_*). Empêche toute divergence
// site/app ↔ Stripe de repartir.
//
// Couvre TOUTE la grille canonique — forfaits, comptes supplémentaires par rôle,
// modules, IA — et pas seulement les quatre forfaits. Compare, pour chaque Price :
//   - unit_amount du Price == centimes du catalogue (src/lib/tarification.canonical.json)
//   - currency == "eur"
//   - recurring.interval == "month" | "year", ou aucun pour un achat ponctuel
//   - annuel.unit_amount == mensuel.unit_amount * 10   (règle « 2 mois offerts »)
//   - livemode == false : un Price Live câblé ici est une erreur de configuration
// Vérifie aussi une ABSENCE : un accès gratuit (expert-comptable) ne doit porter
// aucun Price payant.
//
// Accès Stripe (lecture seule, aucun secret imprimé) :
//   - STRIPE_SECRET_KEY dans l'environnement  → appel direct api.stripe.com  ; sinon
//   - CLI `stripe` authentifiée présente       → `stripe prices retrieve <id>` ; sinon
//   - SKIP non bloquant (sauf --strict, ou variable CI STRIPE_PRICES_VERIFY_STRICT=1).
//
// Les Price IDs viennent de l'environnement, sinon de la carte versionnée
// `config/stripe-prices.test.json` (Test uniquement). Une clé Live fait échouer
// le contrôle immédiatement : il ne s'exécute que contre Stripe Test.
//
// Exit : 0 OK / skip toléré · 1 divergence ou skip en mode strict.

import { readFileSync } from "node:fs";
import { construireAttendus, couplesRegleAnnuelle, offresSansPriceStripe } from "./lib/stripe-prices-attendus.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict") || process.env.STRIPE_PRICES_VERIFY_STRICT === "1";
const OK = "✓";
const KO = "✗";
let erreurs = 0;
const log = (m) => process.stdout.write(m + "\n");
const err = (m) => {
  process.stderr.write(KO + " " + m + "\n");
  erreurs += 1;
};

const catalogue = JSON.parse(readFileSync(join(ROOT, "src/lib/tarification.canonical.json"), "utf8"));

/**
 * Résolution d'un Price ID : l'environnement d'abord, puis la carte versionnée
 * du compte Test. Un `price_id` n'est pas un secret — il n'ouvre rien sans la clé
 * — et le versionner évite de confier vingt-sept identifiants au coffre de la CI
 * pour un contrôle qui n'a besoin que d'une clé de lecture.
 *
 * La carte n'est JAMAIS consultée hors mode Test : si la clé fournie est une clé
 * Live, on refuse plutôt que de comparer des Price Test à un compte Live.
 */
function chargerCarteTest() {
  try {
    const carte = JSON.parse(readFileSync(join(ROOT, "config/stripe-prices.test.json"), "utf8"));
    if (carte.environment !== "test") return null;
    if (carte.generation !== catalogue.version) {
      err(`config/stripe-prices.test.json annonce la génération ${carte.generation}, le catalogue ${catalogue.version}`);
      return null;
    }
    return carte;
  } catch {
    return null;
  }
}

const CLE = process.env.STRIPE_SECRET_KEY ?? "";
const CLE_EST_LIVE = CLE.startsWith("sk_live_") || CLE.startsWith("rk_live_");
const CARTE = CLE_EST_LIVE ? null : chargerCarteTest();

function resoudrePriceId(nomVar) {
  const depuisEnv = process.env[nomVar];
  if (depuisEnv) return { id: depuisEnv, source: "env" };
  const depuisCarte = CARTE?.prices?.[nomVar];
  if (depuisCarte) return { id: depuisCarte, source: "config/stripe-prices.test.json" };
  return { id: null, source: null };
}

function stripeViaCli(id) {
  try {
    const out = execFileSync("stripe", ["prices", "retrieve", id], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

async function stripeViaApi(id, key) {
  const r = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!r.ok) return null;
  return r.json();
}

async function recupererPrice(id) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (key) return stripeViaApi(id, key);
  return stripeViaCli(id);
}

function detecterMode() {
  if (process.env.STRIPE_SECRET_KEY) return "api";
  try {
    execFileSync("stripe", ["--version"], { stdio: "ignore" });
    return "cli";
  } catch {
    return "none";
  }
}

async function main() {
  const mode = detecterMode();
  if (CLE_EST_LIVE) {
    err("STRIPE_SECRET_KEY est une clé Live. Ce contrôle ne s'exécute que contre Stripe Test.");
    process.exit(1);
  }
  if (mode === "none") {
    const msg = "verify:stripe-prices : aucun accès Stripe (STRIPE_SECRET_KEY absent, CLI stripe absente).";
    if (STRICT) {
      err(msg + " Mode strict → échec.");
      process.exit(1);
    }
    log("• " + msg + " SKIP (non bloquant).");
    process.exit(0);
  }
  log(`verify:stripe-prices — catalogue ${catalogue.version} — accès Stripe: ${mode}` +
      (CARTE ? ` — carte Test versionnée: ${Object.keys(CARTE.prices ?? {}).length} Price` : "") + "\n");

  const attendus = construireAttendus(catalogue);
  const montantsLus = {};
  let auMoinsUnLu = false;
  let variablesPresentes = 0;

  // 1. Un accès gratuit ne passe jamais par Stripe : on vérifie l'ABSENCE.
  for (const gratuite of offresSansPriceStripe(catalogue)) {
    const fautives = gratuite.prefixesVarInterdits
      .flatMap((p) => [`${p}_MENSUEL`, `${p}_ANNUEL`, `${p}_PONCTUEL`])
      .filter((nom) => resoudrePriceId(nom).id);
    if (fautives.length) err(`${gratuite.libelle} est gratuit mais ${fautives.join(", ")} pointe un Price payant`);
    else log(`${OK} ${gratuite.libelle} : gratuit, aucun Price Stripe (absence vérifiée)`);
  }

  // 2. Chaque Price attendu par le catalogue doit exister et porter le bon montant.
  for (const a of attendus) {
    const { id } = resoudrePriceId(a.nomVar);
    if (!id) {
      const msg = `${a.nomVar} non défini (ni environnement, ni config/stripe-prices.test.json)`;
      if (STRICT) err(msg);
      else log(`• ${msg} — SKIP`);
      continue;
    }
    variablesPresentes += 1;
    const price = await recupererPrice(id);
    if (!price || price.error) {
      if (!auMoinsUnLu) {
        // Aucun Price encore lu avec succès : accès Stripe probablement non fonctionnel
        // (CLI non authentifiée, clé invalide). Non bloquant hors mode strict.
        const msg = `accès Stripe non fonctionnel (Price ${id} illisible)`;
        if (STRICT) { err(msg); process.exit(1); }
        log(`• ${msg} — SKIP (non bloquant)`);
        process.exit(0);
      }
      err(`${a.nomVar} → Price ${id} introuvable / illisible`);
      continue;
    }
    auMoinsUnLu = true;
    const pbs = [];
    if (price.unit_amount !== a.centimes) pbs.push(`montant ${price.unit_amount} ≠ ${a.centimes}`);
    if ((price.currency || "").toLowerCase() !== catalogue.devise) pbs.push(`devise ${price.currency} ≠ ${catalogue.devise}`);
    if (a.interval === null) {
      if (price.recurring) pbs.push(`récurrent alors qu'un achat ponctuel est attendu`);
      if (price.type !== "one_time") pbs.push(`type ${price.type} ≠ one_time`);
    } else {
      if (price.recurring?.interval !== a.interval) pbs.push(`interval ${price.recurring?.interval} ≠ ${a.interval}`);
      if (price.recurring?.interval_count && price.recurring.interval_count !== 1) pbs.push(`interval_count ${price.recurring.interval_count} ≠ 1`);
    }
    if (price.livemode === true) pbs.push(`livemode=true (attendu Test)`);
    const generation = price.metadata?.pricing_generation;
    if (generation && generation !== catalogue.version) pbs.push(`génération ${generation} ≠ ${catalogue.version}`);
    if (pbs.length) err(`${a.cle} ${a.billingKind} (${id}) : ${pbs.join(" ; ")}`);
    else log(`${OK} ${a.cle} ${a.billingKind} : ${(a.centimes / 100).toFixed(2)} € — ${id}`);
    montantsLus[`${a.cle}:${a.billingKind}`] = price.unit_amount;
  }

  // 3. Règle « 2 mois offerts » : l'annuel vaut exactement dix mensualités.
  for (const couple of couplesRegleAnnuelle(attendus)) {
    const m = montantsLus[`${couple.cle}:recurring_monthly`];
    const an = montantsLus[`${couple.cle}:recurring_yearly`];
    if (typeof m === "number" && typeof an === "number" && an !== m * 10) {
      err(`${couple.cle} : règle annuelle cassée — annuel ${an} ≠ 10 × mensuel ${m}`);
    }
  }

  log("");
  if (erreurs > 0) {
    err(`${erreurs} divergence(s). Le prix affiché ne correspond pas au prix facturé.`);
    process.exit(1);
  }
  if (variablesPresentes === 0) {
    const msg = "aucune variable STRIPE_PRICE_* dans l'environnement — rien à vérifier";
    if (STRICT) { err(msg); process.exit(1); }
    log(`• ${msg} — SKIP (non bloquant)`);
    process.exit(0);
  }
  log(`${OK} Catalogue et Prices Stripe alignés (${variablesPresentes} Price(s) contrôlé(s)).`);
}

main().catch((e) => {
  err(String(e?.message || e));
  process.exit(1);
});
