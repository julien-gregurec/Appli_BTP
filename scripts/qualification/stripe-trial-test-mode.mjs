#!/usr/bin/env node
// ELSATIA — Stripe Trial Synchronization Hardening V1 — scénario Stripe TEST MODE
// distant, PRÉPARÉ mais jamais exécuté par la mission (aucune clé test fournie).
//
// Garde-fous (vérifiés AVANT tout appel réseau) :
//   - sans --execute : plan + SQL de lecture, aucun appel réseau ;
//   - clé absente → refus ; clé `sk_live_` / `rk_live_` → REFUS définitif ;
//     seules `sk_test_` / `rk_test_` sont acceptées ;
//   - --execute exige --confirm-test, --entreprise <uuid>, --customer cus_…,
//     --essai-debut / --essai-fin (lus en Preview, voir SQL imprimé) et un prix
//     non live ;
//   - tout objet `livemode: true` reçu arrête le script.
//
// Scénario :
//   1. matrice Checkout : pour « jour 0 / 1 / 15 / 28 / 29 / 30 / expiré »,
//      fenêtre locale synthétique ancrée sur l'instant réel, calcul identique à
//      src/lib/stripe-essai-checkout.ts, création d'une Checkout Session sur le
//      client de l'entreprise → Stripe doit ACCEPTER chaque session (aucun
//      trial_end hors fenêtre, aucun < 48 h) ; les sessions sont expirées aussitôt
//      (checkout.session.expired = journal sans effet côté webhook) ;
//   2. sonde négative : trial_end à 47 h → Stripe doit REFUSER (valide le seuil
//      DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES) ;
//   2b. exclusivité Checkout (ouvrirCheckoutAbonnement, §7 du rapport) :
//      clé d'idempotence rejouée après expiration (la réponse rejouée et l'état
//      relu sont imprimés : justifie la relecture GET), expiration d'une
//      session déjà expirée refusée (ignorée par l'application), deux sessions
//      créées SIMULTANÉMENT puis balayées → une seule reste ouverte, lecture
//      `subscriptions?status=all` du client ;
//   3. essai réel de l'entreprise : session Checkout avec le trial_end calculé
//      depuis --essai-debut/--essai-fin ; l'URL est imprimée pour une complétion
//      manuelle (carte 4242…) OU utiliser le bouton « S'abonner » de la Preview ;
//   4. --subscription sub_… : relit la subscription et vérifie
//      date_utc(trial_end) ≤ essai_fin locale (ou trial_end absent), puis imprime
//      le SQL de contrôle (essai inchangé, aucun écart, webhooks 200).
//
// Usage :
//   node scripts/qualification/stripe-trial-test-mode.mjs                       # plan seul
//   STRIPE_SECRET_KEY=sk_test_… STRIPE_PRICE_PRO_MENSUEL=price_… \
//     node scripts/qualification/stripe-trial-test-mode.mjs --execute --confirm-test \
//       --entreprise <uuid> --customer cus_… --essai-debut 2026-10-01 --essai-fin 2026-10-31 \
//       [--subscription sub_…]

import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const JOUR = 86_400;
export const DELAI_MINIMUM_SECONDES = 48 * 3_600;
export const DUREE_ESSAI_JOURS = 30;

/** Classe une clé Stripe sans jamais la renvoyer ni l'afficher. */
export function analyserCle(cle) {
  if (!cle) return { ok: false, motif: "cle_absente" };
  if (/^(sk|rk)_live_/.test(cle)) return { ok: false, motif: "cle_live_refusee" };
  if (/^(sk|rk)_test_/.test(cle)) return { ok: true, motif: "cle_test" };
  return { ok: false, motif: "cle_inconnue" };
}

function valeur(argv, option) {
  const i = argv.indexOf(option);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

export function analyserArguments(argv) {
  return {
    execute: argv.includes("--execute"),
    confirme: argv.includes("--confirm-test"),
    entreprise: valeur(argv, "--entreprise"),
    customer: valeur(argv, "--customer"),
    essaiDebut: valeur(argv, "--essai-debut"),
    essaiFin: valeur(argv, "--essai-fin"),
    subscription: valeur(argv, "--subscription"),
  };
}

function dateValide(texte) {
  if (!texte || !DATE_ISO.test(texte)) return false;
  return new Date(`${texte}T00:00:00Z`).toISOString().slice(0, 10) === texte;
}

/** Décide, sans réseau, si l'exécution distante est autorisée. */
export function autoriserExecution(args, env) {
  if (!args.execute) return { autorise: false, motif: "plan_seul" };
  const cle = analyserCle(env.STRIPE_SECRET_KEY);
  if (!cle.ok) return { autorise: false, motif: cle.motif };
  if (!args.confirme) return { autorise: false, motif: "confirmation_absente" };
  if (!args.entreprise || !UUID.test(args.entreprise)) return { autorise: false, motif: "entreprise_invalide" };
  if (!args.customer || !/^cus_[A-Za-z0-9]+$/.test(args.customer)) return { autorise: false, motif: "customer_invalide" };
  if (!dateValide(args.essaiDebut) || !dateValide(args.essaiFin)) return { autorise: false, motif: "essai_invalide" };
  if (args.subscription && !/^sub_[A-Za-z0-9]+$/.test(args.subscription)) return { autorise: false, motif: "subscription_invalide" };
  if (!env.STRIPE_PRICE_PRO_MENSUEL) return { autorise: false, motif: "prix_absent" };
  if (/live/i.test(env.STRIPE_PRICE_PRO_MENSUEL)) return { autorise: false, motif: "prix_live_refuse" };
  return { autorise: true, motif: "ok" };
}

/**
 * Miroir de calculerEssaiCheckout (src/lib/stripe-essai-checkout.ts) ; la
 * parité est vérifiée par src/lib/stripe-essai-checkout-parite.test.ts.
 */
export function essaiCheckout(essaiDebut, essaiFin, maintenantUnix) {
  if (!dateValide(essaiDebut) || (essaiFin != null && !dateValide(essaiFin))) return { mode: "aucun", raison: "dates_incoherentes", restantSecondes: 0 };
  const debut = Date.parse(`${essaiDebut}T00:00:00Z`) / 1000;
  const borne = debut + DUREE_ESSAI_JOURS * JOUR;
  const fin = essaiFin == null ? borne : Date.parse(`${essaiFin}T00:00:00Z`) / 1000;
  if (fin < debut) return { mode: "aucun", raison: "dates_incoherentes", restantSecondes: 0 };
  const finUnix = Math.min(fin, borne) + JOUR - 1;
  const restantSecondes = Math.max(0, finUnix - maintenantUnix);
  if (restantSecondes === 0) return { mode: "aucun", raison: "essai_expire", restantSecondes };
  if (restantSecondes < DELAI_MINIMUM_SECONDES) return { mode: "aucun", raison: "restant_inferieur_minimum_stripe", restantSecondes };
  return { mode: "trial_end", trialEnd: finUnix, restantSecondes };
}

const dateUtc = (secondes) => new Date(secondes * 1000).toISOString().slice(0, 10);

/** Fenêtres synthétiques « jour N » ancrées sur l'instant réel. */
export function matriceJours(maintenantUnix) {
  const aujourdHui = dateUtc(maintenantUnix);
  const moins = (n) => dateUtc(Date.parse(`${aujourdHui}T00:00:00Z`) / 1000 - n * JOUR);
  return [0, 1, 15, 28, 29, 30, 45].map((n) => {
    const debut = moins(n);
    const fin = dateUtc(Date.parse(`${debut}T00:00:00Z`) / 1000 + DUREE_ESSAI_JOURS * JOUR);
    return { libelle: n === 45 ? "expiré" : `jour ${n}`, debut, fin, essai: essaiCheckout(debut, fin, maintenantUnix) };
  });
}

export function sqlLecture(entreprise) {
  return `-- Préparation (lecture seule, Preview) : essai local et client Stripe de l'entreprise.
select abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, stripe_customer_id, stripe_subscription_id
  from public.entreprises where id = '${entreprise}';`;
}

export function sqlVerification(entreprise) {
  return `-- Contrôle après Checkout (lecture seule, Preview) :
-- essai_fin inchangée (≤ début + 30), statut essai/actif, aucun écart d'essai, webhooks finalisés.
select abonnement_statut, abonnement_essai_debut, abonnement_essai_fin, abonnement_essai_fin - abonnement_essai_debut as jours,
       stripe_subscription_id from public.entreprises where id = '${entreprise}';
select nature, trial_end_stripe, essai_fin_locale, essai_fin_retenue, occurrences
  from public.stripe_essai_ecarts where entreprise_id = '${entreprise}' order by id;
select stripe_event_type, decision, motif, processed_at from public.stripe_evenements_ordre
  where entreprise_id = '${entreprise}' order by id;
select type, statut_resultant, livraisons_doublons from public.abonnement_evenements
  where entreprise_id = '${entreprise}' order by created_at;`;
}

export const PLAN = [
  "matrice Checkout jour 0/1/15/28 → subscription_data[trial_end] = fin locale ; Stripe accepte",
  "matrice Checkout jour 29/30/expiré → aucun trial ; Stripe accepte",
  "chaque session de la matrice est expirée aussitôt (checkout.session.expired → journal sans effet)",
  "sonde négative : trial_end = maintenant + 47 h → Stripe REFUSE (seuil 48 h confirmé)",
  "exclusivité : clé rejouée après expiration (état relu), expire refusé sur session expirée, 2 sessions simultanées → balayage → 1 ouverte",
  "Checkout réel de l'entreprise (trial_end calculé depuis --essai-debut/--essai-fin) → URL imprimée",
  "compléter avec 4242 4242 4242 4242 (ou bouton « S'abonner » de la Preview)",
  "--subscription sub_… : trial_end Stripe ≤ essai_fin locale (ou absent) ; SQL de contrôle",
  "attendu webhooks : customer.subscription.created/updated 200, aucune ligne stripe_essai_ecarts",
];

export async function executer(args, env, fetchImpl = fetch) {
  const secret = env.STRIPE_SECRET_KEY;
  const appel = async (chemin, corps, methode = "POST", idempotence = null) => {
    const reponse = await fetchImpl(`https://api.stripe.com/v1/${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${secret}`,
        ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotence ? { "Idempotency-Key": idempotence } : {}),
      },
      body: corps ? new URLSearchParams(corps) : undefined,
    });
    const donnees = await reponse.json();
    if (donnees && donnees.livemode === true) throw new Error("Objet livemode reçu : arrêt immédiat");
    return { ok: reponse.ok, donnees };
  };
  const base = (essai) => ({
    mode: "subscription",
    customer: args.customer,
    payment_method_collection: "always",
    success_url: "https://example.invalid/succes",
    cancel_url: "https://example.invalid/annule",
    client_reference_id: args.entreprise,
    "line_items[0][price]": env.STRIPE_PRICE_PRO_MENSUEL,
    "line_items[0][quantity]": "1",
    "metadata[entreprise_id]": args.entreprise,
    "metadata[elsatia_qualification]": "stripe_trial_v1",
    "subscription_data[metadata][entreprise_id]": args.entreprise,
    "subscription_data[metadata][offre]": "pro",
    "subscription_data[metadata][periodicite]": "mensuel",
    ...(essai.mode === "trial_end" ? { "subscription_data[trial_end]": String(essai.trialEnd) } : {}),
  });
  const maintenant = Math.floor(Date.now() / 1000);
  const resultats = [];
  let echecs = 0;
  for (const cas of matriceJours(maintenant)) {
    const r = await appel("checkout/sessions", base(cas.essai));
    if (r.ok) await appel(`checkout/sessions/${r.donnees.id}/expire`, {});
    const conforme = r.ok && (cas.essai.mode !== "trial_end" || dateUtc(cas.essai.trialEnd) <= cas.fin);
    if (!conforme) echecs += 1;
    resultats.push({ cas: cas.libelle, essai_local: `${cas.debut}→${cas.fin}`, mode: cas.essai.mode, trial_end: cas.essai.trialEnd ?? null, stripe: r.ok ? "accepte" : r.donnees.error?.message ?? "refuse", conforme });
  }
  const sonde = await appel("checkout/sessions", base({ mode: "trial_end", trialEnd: maintenant + 47 * 3600 }));
  if (sonde.ok) {
    echecs += 1;
    await appel(`checkout/sessions/${sonde.donnees.id}/expire`, {});
  }
  resultats.push({ cas: "sonde 47 h", stripe: sonde.ok ? "ACCEPTÉ (inattendu)" : "refusé (attendu)", conforme: !sonde.ok });

  // 2b. Exclusivité Checkout.
  const sansEssai = base({ mode: "aucun" });
  const cle = `elsatia-qualif-trial-${args.entreprise}-${maintenant}`;
  const s1 = await appel("checkout/sessions", sansEssai, "POST", cle);
  if (s1.ok) {
    await appel(`checkout/sessions/${s1.donnees.id}/expire`, {});
    const rejoue = await appel("checkout/sessions", sansEssai, "POST", cle);
    const relu = await appel(`checkout/sessions/${s1.donnees.id}`, null, "GET");
    resultats.push({ cas: "clé rejouée après expiration", stripe: `réponse rejouée: ${rejoue.donnees.status ?? "?"} / état relu: ${relu.donnees.status ?? "?"}`, conforme: relu.ok && relu.donnees.status === "expired" });
    if (!(relu.ok && relu.donnees.status === "expired")) echecs += 1;
    const reexpire = await appel(`checkout/sessions/${s1.donnees.id}/expire`, {});
    resultats.push({ cas: "expire sur session expirée", stripe: reexpire.ok ? "ACCEPTÉ" : "refusé (ignoré par l'application)", conforme: true });
  } else {
    echecs += 1;
    resultats.push({ cas: "clé rejouée après expiration", stripe: s1.donnees.error?.message ?? "refusé", conforme: false });
  }
  const [sa, sb] = await Promise.all([appel("checkout/sessions", sansEssai), appel("checkout/sessions", sansEssai)]);
  const ouvertes = await appel(`checkout/sessions?customer=${encodeURIComponent(args.customer)}&status=open&limit=100`, null, "GET");
  const nosOuvertes = (ouvertes.donnees.data ?? []).filter((s) => s.metadata?.elsatia_qualification === "stripe_trial_v1");
  const garder = sb.ok ? sb.donnees.id : null;
  for (const s of nosOuvertes) if (s.id !== garder) await appel(`checkout/sessions/${s.id}/expire`, {});
  const apres = await appel(`checkout/sessions?customer=${encodeURIComponent(args.customer)}&status=open&limit=100`, null, "GET");
  const restantes = (apres.donnees.data ?? []).filter((s) => s.metadata?.elsatia_qualification === "stripe_trial_v1").length;
  const exclusif = sa.ok && sb.ok && nosOuvertes.length >= 2 && restantes === 1;
  if (!exclusif) echecs += 1;
  resultats.push({ cas: "2 sessions simultanées → balayage", stripe: `ouvertes avant: ${nosOuvertes.length}, après: ${restantes}`, conforme: exclusif });
  if (garder) await appel(`checkout/sessions/${garder}/expire`, {});
  const subs = await appel(`subscriptions?customer=${encodeURIComponent(args.customer)}&status=all&limit=100`, null, "GET");
  resultats.push({ cas: "subscriptions?status=all", stripe: subs.ok ? `${(subs.donnees.data ?? []).map((s) => s.status).join(",") || "aucune"}` : "illisible", conforme: subs.ok });
  if (!subs.ok) echecs += 1;
  console.table(resultats);

  const essaiReel = essaiCheckout(args.essaiDebut, args.essaiFin, maintenant);
  const session = await appel("checkout/sessions", base(essaiReel));
  if (!session.ok) throw new Error(`Checkout réel refusé : ${session.donnees.error?.message ?? "erreur"}`);
  console.log(JSON.stringify({ essai: essaiReel, session: session.donnees.id, url: session.donnees.url }, null, 2));

  if (args.subscription) {
    const sub = await appel(`subscriptions/${args.subscription}`, null, "GET");
    if (!sub.ok) throw new Error("Subscription illisible");
    const trialEnd = sub.donnees.trial_end ?? null;
    const conforme = trialEnd === null || dateUtc(trialEnd) <= args.essaiFin;
    if (!conforme) echecs += 1;
    console.log(JSON.stringify({ subscription: args.subscription, status: sub.donnees.status, trial_end: trialEnd, trial_end_date_utc: trialEnd && dateUtc(trialEnd), essai_fin_locale: args.essaiFin, conforme }, null, 2));
  }
  console.log("\n# Vérification (base Preview, lecture seule) :\n" + sqlVerification(args.entreprise));
  if (echecs) {
    console.error(`${echecs} contrôle(s) Stripe non conforme(s)`);
    process.exit(1);
  }
}

async function main() {
  const args = analyserArguments(process.argv.slice(2));
  const decision = autoriserExecution(args, process.env);
  console.log("# Scénario Stripe Test — synchronisation de l'essai (ELSATIA V1)");
  PLAN.forEach((etape, i) => console.log(`  ${i + 1}. ${etape}`));
  if (!decision.autorise) {
    console.log(`\nAucun appel réseau : ${decision.motif}.`);
    if (args.entreprise && UUID.test(args.entreprise)) console.log("\n" + sqlLecture(args.entreprise) + "\n\n" + sqlVerification(args.entreprise));
    process.exit(decision.motif === "plan_seul" ? 0 : 2);
  }
  await executer(args, process.env);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((erreur) => { console.error(erreur instanceof Error ? erreur.message : "échec"); process.exit(1); });
}
