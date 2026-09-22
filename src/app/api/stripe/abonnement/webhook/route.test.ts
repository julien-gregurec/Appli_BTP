// Tests d'intégration du webhook Stripe Billing plateforme (abonnement SaaS
// Liria → entreprises clientes), avec un faux client Supabase admin et un faux
// `fetch` Stripe — aucun appel réseau réel, conformément à la contrainte
// « aucun Stripe live » de la mission d'audit self-service.
//
// Couvre : signature/dedup/idempotence (5. Idempotence), rejeu concurrent et
// hors-ordre (4. Failure / 5. Idempotence), et les transitions de statut sur
// paiement échoué / action requise qui documentent l'absence de délai de
// grâce (voir docs/qualification/ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md).

import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { creerFausseBaseAdmin, type BaseFausse } from "@/test/fakeSupabaseAdmin";

const { adminRef } = vi.hoisted(() => ({ adminRef: { current: null as ReturnType<typeof creerFausseBaseAdmin> | null } }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminRef.current,
}));

const SECRET = "whsec_test_abonnement";
const APPELS_FETCH: Array<{ url: string; method: string }> = [];

function signer(payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function envoyerWebhook(evenement: Record<string, unknown>, options: { signatureInvalide?: boolean } = {}) {
  const { POST } = await import("@/app/api/stripe/abonnement/webhook/route");
  const corps = JSON.stringify(evenement);
  const signature = options.signatureInvalide ? "t=1,v1=0000invalide0000" : signer(corps);
  const requete = new Request("http://localhost/api/stripe/abonnement/webhook", {
    method: "POST",
    body: corps,
    headers: { "stripe-signature": signature },
  });
  return POST(requete);
}

function baseEntreprise(overrides: Record<string, unknown> = {}) {
  return {
    id: "ent_1",
    nom: "Acme BTP",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: null as string | null,
    abonnement_statut: "essai",
    abonnement_offre: null as string | null,
    abonnement_periodicite: null as string | null,
    abonnement_echeance: null as string | null,
    abonnement_essai_fin: null as string | null,
    abonnement_annulation_prevue_at: null as string | null,
    derniere_facture_stripe_id: null as string | null,
    derniere_facture_url: null as string | null,
    derniere_facture_pdf: null as string | null,
    derniere_facture_statut: null as string | null,
    derniere_facture_at: null as string | null,
    ...overrides,
  };
}

function planPro() {
  return { id: "plan_pro_2", code: "pro", version: 2, actif: true, prix_mensuel_ht: 249, prix_annuel_ht: 2988 };
}

let base: BaseFausse;

beforeEach(() => {
  base = {
    entreprises: [],
    abonnement_evenements: [],
    plans_abonnement: [],
    abonnements_entreprises: [],
    factures_abonnement: [],
  };
  adminRef.current = creerFausseBaseAdmin(base, { abonnement_evenements: ["stripe_event_id"] });
  process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET = SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_xxx";
  APPELS_FETCH.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      APPELS_FETCH.push({ url, method: "GET" });
      if (url.includes("/v1/subscriptions/")) {
        return new Response(
          JSON.stringify({
            id: "sub_1",
            customer: "cus_1",
            status: "trialing",
            current_period_start: 1_700_000_000,
            current_period_end: 1_702_592_000,
            trial_end: 1_702_592_000,
            cancel_at_period_end: false,
            metadata: { entreprise_id: "ent_1", offre: "pro", periodicite: "mensuel" },
            items: { data: [{ id: "si_1", quantity: 1, price: { id: "price_pro_mensuel" } }] },
          }),
          { status: 200 },
        );
      }
      throw new Error(`Appel Stripe non simulé dans ce test : ${url}`);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET;
  delete process.env.STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL;
});

describe("sécurité du webhook", () => {
  it("rejette une signature invalide (400)", async () => {
    base.entreprises!.push(baseEntreprise());
    const reponse = await envoyerWebhook(
      { id: "evt_1", type: "customer.subscription.updated", livemode: false, data: { object: { id: "sub_1", object: "subscription" } } },
      { signatureInvalide: true },
    );
    expect(reponse.status).toBe(400);
    expect(base.abonnement_evenements).toHaveLength(0);
  });

  it("répond 503 si le secret webhook n'est pas configuré", async () => {
    delete process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET;
    const reponse = await envoyerWebhook({ id: "evt_1", type: "invoice.paid", livemode: false, data: { object: {} } });
    expect(reponse.status).toBe(503);
  });

  it("refuse un événement Stripe Connect (porteur d'un compte) sur l'endpoint abonnement plateforme", async () => {
    const reponse = await envoyerWebhook({
      id: "evt_connect",
      type: "invoice.paid",
      livemode: false,
      account: "acct_entreprise_cliente",
      data: { object: { id: "in_1" } },
    });
    expect(reponse.status).toBe(400);
    const corps = await reponse.json();
    expect(corps.error).toMatch(/Connect/);
  });
});

describe("checkout.session.completed (souscription initiale)", () => {
  it("synchronise l'entreprise, verrouille le prix contractuel et déclenche la réconciliation", async () => {
    base.entreprises!.push(baseEntreprise());
    base.plans_abonnement!.push(planPro());
    // Volontairement pas de STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL : reconcilierAbonnementStripe
    // doit s'arrêter proprement (raison "prix_supplement_absent") sans échouer tout le webhook.

    const reponse = await envoyerWebhook({
      id: "evt_checkout",
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_1", object: "checkout.session", mode: "subscription", customer: "cus_1", subscription: "sub_1", metadata: { entreprise_id: "ent_1" } } },
    });

    expect(reponse.status).toBe(200);
    const entreprise = base.entreprises![0];
    expect(entreprise.abonnement_statut).toBe("essai");
    expect(entreprise.stripe_subscription_id).toBe("sub_1");
    expect(entreprise.abonnement_offre).toBe("pro");
    expect(entreprise.abonnement_periodicite).toBe("mensuel");
    expect(entreprise.abonnement_echeance).toBe("2023-12-14");

    const contrat = base.abonnements_entreprises![0];
    expect(contrat).toMatchObject({ entreprise_id: "ent_1", code_offre: "pro", prix_contractuel_ht: 249, statut: "essai" });

    const journal = base.abonnement_evenements![0];
    expect(journal.statut_resultant).toBe("essai");
  });
});

describe("transitions de statut", () => {
  it("customer.subscription.updated fait passer l'entreprise à 'actif' et programme l'annulation prévue", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_offre: "pro", abonnement_periodicite: "mensuel" }));

    const reponse = await envoyerWebhook({
      id: "evt_sub_updated",
      type: "customer.subscription.updated",
      livemode: false,
      data: {
        object: {
          id: "sub_1",
          object: "subscription",
          customer: "cus_1",
          status: "active",
          current_period_end: 1_702_592_000,
          cancel_at_period_end: true,
          cancel_at: 1_702_592_000,
        },
      },
    });

    expect(reponse.status).toBe(200);
    const entreprise = base.entreprises![0];
    expect(entreprise.abonnement_statut).toBe("actif");
    expect(entreprise.abonnement_annulation_prevue_at).toBe(new Date(1_702_592_000 * 1000).toISOString());
  });

  it("invoice.paid remet l'entreprise 'actif' et enregistre la facture", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "suspendu" }));

    const reponse = await envoyerWebhook({
      id: "evt_invoice_paid",
      type: "invoice.paid",
      livemode: false,
      data: {
        object: {
          id: "in_1",
          object: "invoice",
          customer: "cus_1",
          subscription: "sub_1",
          status: "paid",
          hosted_invoice_url: "https://stripe.example/invoice/in_1",
          invoice_pdf: "https://stripe.example/invoice/in_1.pdf",
          total: 29_880,
          subtotal_excluding_tax: 24_900,
          total_tax_amounts: [{ amount: 4_980 }],
          currency: "eur",
        },
      },
    });

    expect(reponse.status).toBe(200);
    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    const facture = base.factures_abonnement![0];
    expect(facture).toMatchObject({ stripe_invoice_id: "in_1", statut: "paid", montant_ht: 249, montant_ttc: 298.8 });
  });

  // Fermeture du gap "closure V3" (rapport V2, §4/§9/§11 point 3) : un échec de
  // paiement ne coupe plus l'accès de manière synchrone et inconditionnelle. Sans
  // délai de grâce configuré (STRIPE_DELAI_GRACE_PAIEMENT_JOURS absent → 0 jour,
  // comportement conservateur par défaut), l'échéance de suspension posée est
  // immédiate (<= maintenant) mais c'est le cron (appliquer_suspensions_impayes,
  // câblé dans src/app/api/cron/abonnements/route.ts) qui matérialise la coupure —
  // jamais le webhook lui-même. abonnement_statut reste donc inchangé ici.
  it("invoice.payment_failed pose une échéance de suspension (délai de grâce) sans couper l'accès dans le webhook lui-même", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif", impaye_signale_at: null, suspension_prevue_at: null }));

    const avant = Date.now();
    const reponse = await envoyerWebhook({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_2", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(reponse.status).toBe(200);
    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    expect(base.entreprises![0].impaye_signale_at).toBeTruthy();
    expect(new Date(base.entreprises![0].suspension_prevue_at as string).getTime()).toBeGreaterThanOrEqual(avant);
  });

  it("invoice.payment_failed respecte un délai de grâce configuré (STRIPE_DELAI_GRACE_PAIEMENT_JOURS)", async () => {
    vi.stubEnv("STRIPE_DELAI_GRACE_PAIEMENT_JOURS", "5");
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif", impaye_signale_at: null, suspension_prevue_at: null }));

    const avant = Date.now();
    await envoyerWebhook({
      id: "evt_invoice_failed_grace",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_2b", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    const echeance = new Date(base.entreprises![0].suspension_prevue_at as string).getTime();
    expect(echeance).toBeGreaterThan(avant + 4 * 86_400_000);
    vi.unstubAllEnvs();
  });

  // Un `invoice.payment_failed` déjà signalé (échéance en cours) n'est pas repoussé
  // par un second event — l'échéance de grâce ne se prolonge pas indéfiniment tant
  // que Stripe continue de retenter (dunning) sur la même facture impayée.
  it("ne repousse pas une échéance de suspension déjà posée", async () => {
    const echeanceInitiale = new Date(Date.now() + 3_600_000).toISOString();
    base.entreprises!.push(baseEntreprise({
      stripe_subscription_id: "sub_1",
      abonnement_statut: "actif",
      impaye_signale_at: new Date(Date.now() - 3_600_000).toISOString(),
      suspension_prevue_at: echeanceInitiale,
    }));

    await envoyerWebhook({
      id: "evt_invoice_failed_repete",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_2c", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(base.entreprises![0].suspension_prevue_at).toBe(echeanceInitiale);
  });

  // Fermeture du gap "closure V3" : une authentification 3-D Secure requise n'est
  // PAS un échec de paiement — elle ne doit plus jamais suspendre ni poser
  // d'échéance de suspension.
  it("invoice.payment_action_required ne suspend plus et ne pose aucune échéance de suspension", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif", impaye_signale_at: null, suspension_prevue_at: null }));

    const reponse = await envoyerWebhook({
      id: "evt_invoice_action",
      type: "invoice.payment_action_required",
      livemode: false,
      data: { object: { id: "in_3", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(reponse.status).toBe(200);
    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    expect(base.entreprises![0].impaye_signale_at).toBeNull();
    expect(base.entreprises![0].suspension_prevue_at).toBeNull();
  });

  it("invoice.paid régularise immédiatement un impayé en cours (pas de délai pour restaurer l'accès)", async () => {
    base.entreprises!.push(baseEntreprise({
      stripe_subscription_id: "sub_1",
      abonnement_statut: "actif",
      impaye_signale_at: new Date().toISOString(),
      suspension_prevue_at: new Date(Date.now() + 3_600_000).toISOString(),
    }));

    await envoyerWebhook({
      id: "evt_invoice_paid_regularise",
      type: "invoice.paid",
      livemode: false,
      data: { object: { id: "in_4", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "paid", total: 24_900, subtotal_excluding_tax: 24_900, currency: "eur" } },
    });

    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    expect(base.entreprises![0].impaye_signale_at).toBeNull();
    expect(base.entreprises![0].suspension_prevue_at).toBeNull();
  });
});

describe("idempotence et rejeu", () => {
  it("une livraison dupliquée du même evenement est ignorée (pas de double effet)", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif" }));
    const evenement = {
      id: "evt_dup",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_4", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 100, currency: "eur" } },
    };

    const premiere = await envoyerWebhook(evenement);
    const deuxieme = await envoyerWebhook(evenement);

    expect(premiere.status).toBe(200);
    expect((await premiere.json()).duplicate).toBeUndefined();
    expect(deuxieme.status).toBe(200);
    expect((await deuxieme.json()).duplicate).toBe(true);
    expect(base.abonnement_evenements).toHaveLength(1);
  });

  it("deux livraisons concurrentes du même événement (rejeu en concurrence) ne produisent qu'un seul traitement", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif" }));
    const evenement = {
      id: "evt_concurrent",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_5", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 100, currency: "eur" } },
    };

    const [a, b] = await Promise.all([envoyerWebhook(evenement), envoyerWebhook(evenement)]);
    const corpsA = await a.json();
    const corpsB = await b.json();
    const duplicatas = [corpsA.duplicate, corpsB.duplicate].filter(Boolean).length;

    expect(duplicatas).toBe(1);
    expect(base.abonnement_evenements).toHaveLength(1);
  });

  // Fermeture du gap "closure V3" (rapport V2, §4/§11 point 7) : un événement
  // Stripe livré en retard (webhook réémis après incident réseau, etc.) ne doit
  // plus écraser un état déjà plus frais. La comparaison se fait sur l'horodatage
  // de l'*event* Stripe (`created`), pas sur l'ordre d'arrivée HTTP ni sur les
  // champs de l'objet — voir synchroniserAbonnement() / abonnement_dernier_evenement_at.
  it("un webhook en retard (hors-ordre, event.created antérieur) est ignoré : le statut reste monotone", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "essai" }));

    const evenementRecent = {
      id: "evt_recent",
      type: "customer.subscription.updated",
      livemode: false,
      created: 2_000_000_500,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "active", current_period_end: 2_000_000_000 } },
    };
    const evenementEnRetard = {
      id: "evt_en_retard",
      type: "customer.subscription.updated",
      livemode: false,
      created: 1_000_000_500,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "trialing", current_period_end: 1_000_000_000 } },
    };

    await envoyerWebhook(evenementRecent);
    expect(base.entreprises![0].abonnement_statut).toBe("actif");

    const reponseRetard = await envoyerWebhook(evenementEnRetard);
    expect(reponseRetard.status).toBe(200);
    // L'événement en retard n'a rien écrasé : ni le statut, ni l'échéance.
    expect(base.entreprises![0].abonnement_statut).toBe("actif");
    expect(base.entreprises![0].abonnement_echeance).not.toBe("2001-09-09");
  });

  it("deux événements livrés dans le bon ordre s'appliquent normalement (la garde hors-ordre ne bloque pas le cas nominal)", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "essai" }));

    await envoyerWebhook({
      id: "evt_ancien",
      type: "customer.subscription.updated",
      livemode: false,
      created: 1_000_000_500,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "trialing", current_period_end: 1_000_000_000 } },
    });
    expect(base.entreprises![0].abonnement_statut).toBe("essai");

    await envoyerWebhook({
      id: "evt_recent",
      type: "customer.subscription.updated",
      livemode: false,
      created: 2_000_000_500,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "active", current_period_end: 2_000_000_000 } },
    });
    expect(base.entreprises![0].abonnement_statut).toBe("actif");
  });

  it("en cas d'échec de traitement, la réservation d'idempotence est retirée pour permettre un nouvel essai Stripe", async () => {
    // Aucune entreprise en base : la résolution de l'entreprise échoue et la route
    // doit répondre 500 sans laisser de ligne bloquante dans abonnement_evenements.
    const reponse = await envoyerWebhook({
      id: "evt_echec",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: { id: "sub_inconnu", object: "subscription", customer: "cus_inconnu", status: "active" } },
    });

    expect(reponse.status).toBe(500);
    expect(base.abonnement_evenements).toHaveLength(0);
  });
});
