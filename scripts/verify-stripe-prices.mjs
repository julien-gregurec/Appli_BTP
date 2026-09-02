#!/usr/bin/env node
// ELSATIA — verify:stripe-prices
// Garde-fou : le prix AFFICHÉ (catalogue canonique) doit être exactement le prix FACTURÉ
// (Price Stripe pointé par les variables STRIPE_PRICE_*). Empêche toute divergence
// site/app ↔ Stripe de repartir.
//
// Compare, pour chaque offre × périodicité :
//   - unit_amount du Price == centimes du catalogue (src/lib/tarification.canonical.json)
//   - currency == "eur"
//   - recurring.interval == "month" | "year"
//   - annuel.unit_amount == mensuel.unit_amount * 10   (règle « 2 mois offerts »)
//
// Accès Stripe (lecture seule, aucun secret imprimé) :
//   - STRIPE_SECRET_KEY dans l'environnement  → appel direct api.stripe.com  ; sinon
//   - CLI `stripe` authentifiée présente       → `stripe prices retrieve <id>` ; sinon
//   - SKIP non bloquant (sauf --strict, ou variable CI STRIPE_PRICES_VERIFY_STRICT=1).
//
// Exit : 0 OK / skip toléré · 1 divergence ou skip en mode strict.

import { readFileSync } from "node:fs";
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
  if (mode === "none") {
    const msg = "verify:stripe-prices : aucun accès Stripe (STRIPE_SECRET_KEY absent, CLI stripe absente).";
    if (STRICT) {
      err(msg + " Mode strict → échec.");
      process.exit(1);
    }
    log("• " + msg + " SKIP (non bloquant).");
    process.exit(0);
  }
  log(`verify:stripe-prices — catalogue ${catalogue.version} — accès Stripe: ${mode}\n`);

  const attendus = {};
  let auMoinsUnLu = false;
  let variablesPresentes = 0;
  for (const offre of catalogue.offres) {
    for (const [periodicite, interval, centimes] of [
      ["mensuel", "month", offre.mensuelCentimes],
      ["annuel", "year", offre.annuelCentimes],
    ]) {
      const nomVar = `STRIPE_PRICE_${offre.cle.toUpperCase()}_${periodicite.toUpperCase()}`;
      const id = process.env[nomVar];
      if (!id) {
        const msg = `${nomVar} non défini dans l'environnement`;
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
        err(`${nomVar} → Price ${id} introuvable / illisible`);
        continue;
      }
      auMoinsUnLu = true;
      const pbs = [];
      if (price.unit_amount !== centimes) pbs.push(`montant ${price.unit_amount} ≠ ${centimes}`);
      if ((price.currency || "").toLowerCase() !== catalogue.devise) pbs.push(`devise ${price.currency} ≠ ${catalogue.devise}`);
      if ((price.recurring?.interval) !== interval) pbs.push(`interval ${price.recurring?.interval} ≠ ${interval}`);
      if (price.recurring?.interval_count && price.recurring.interval_count !== 1) pbs.push(`interval_count ${price.recurring.interval_count} ≠ 1`);
      if (price.livemode === true) pbs.push(`livemode=true (attendu Test)`);
      if (pbs.length) err(`${offre.cle} ${periodicite} (${id}) : ${pbs.join(" ; ")}`);
      else log(`${OK} ${offre.cle} ${periodicite} : ${(centimes / 100).toFixed(2)} € /${interval} — ${id}`);
      attendus[`${offre.cle}:${periodicite}`] = price.unit_amount;
    }
    const m = attendus[`${offre.cle}:mensuel`];
    const a = attendus[`${offre.cle}:annuel`];
    if (typeof m === "number" && typeof a === "number" && a !== m * 10) {
      err(`${offre.cle} : règle annuelle cassée — annuel ${a} ≠ 10 × mensuel ${m}`);
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
