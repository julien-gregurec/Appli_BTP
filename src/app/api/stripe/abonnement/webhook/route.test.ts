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

  // Documente un écart de comportement relevé dans le rapport de qualification :
  // le code suspend l'accès dès le PREMIER `invoice.payment_failed`, sans laisser
  // les tentatives de relance (dunning) de Stripe s'exécuter d'abord, contrairement
  // à l'intention décrite dans RELAIS_CODEX_ABONNEMENT.md ("la bascule définitive
  // vient de subscription.updated→past_due/unpaid"). "Durée exacte de grâce avant
  // suspension" est listée comme décision non tranchée dans
  // docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md.
  it("invoice.payment_failed suspend immédiatement l'accès, dès le premier échec (pas de délai de grâce)", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif" }));

    const reponse = await envoyerWebhook({
      id: "evt_invoice_failed",
      type: "invoice.payment_failed",
      livemode: false,
      data: { object: { id: "in_2", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(reponse.status).toBe(200);
    expect(base.entreprises![0].abonnement_statut).toBe("suspendu");
  });

  // Même écart pour une authentification 3D Secure requise : ce n'est pourtant
  // pas un échec de paiement, juste une étape supplémentaire pour le client.
  it("invoice.payment_action_required suspend aussi l'accès, alors que le paiement n'a pas échoué", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "actif" }));

    const reponse = await envoyerWebhook({
      id: "evt_invoice_action",
      type: "invoice.payment_action_required",
      livemode: false,
      data: { object: { id: "in_3", object: "invoice", customer: "cus_1", subscription: "sub_1", status: "open", total: 24_900, currency: "eur" } },
    });

    expect(reponse.status).toBe(200);
    expect(base.entreprises![0].abonnement_statut).toBe("suspendu");
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

  // Documente une limite réelle : les événements `customer.subscription.updated`
  // sont appliqués dans l'ORDRE DE RÉCEPTION HTTP, pas dans l'ordre chronologique
  // Stripe. Un événement en retard (webhook livré tard, cf. mission section 4)
  // peut donc écraser un état plus récent avec des données plus anciennes — aucune
  // protection par timestamp/`current_period_end` monotone n'existe dans
  // synchroniserAbonnement(). Ce test caractérise le comportement actuel, il ne
  // prouve pas qu'il soit désirable : voir le rapport de qualification, section
  // « Webhook hors-ordre / en retard ».
  it("un webhook en retard (hors-ordre) écrase l'état plus récent — absence de protection connue", async () => {
    base.entreprises!.push(baseEntreprise({ stripe_subscription_id: "sub_1", abonnement_statut: "essai" }));

    const evenementRecent = {
      id: "evt_recent",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "active", current_period_end: 2_000_000_000 } },
    };
    const evenementEnRetard = {
      id: "evt_en_retard",
      type: "customer.subscription.updated",
      livemode: false,
      data: { object: { id: "sub_1", object: "subscription", customer: "cus_1", status: "trialing", current_period_end: 1_000_000_000 } },
    };

    await envoyerWebhook(evenementRecent);
    expect(base.entreprises![0].abonnement_statut).toBe("actif");

    await envoyerWebhook(evenementEnRetard);
    expect(base.entreprises![0].abonnement_statut).toBe("essai");
    expect(base.entreprises![0].abonnement_echeance).toBe("2001-09-09");
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
