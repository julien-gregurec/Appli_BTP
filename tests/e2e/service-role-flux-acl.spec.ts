import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { login, token, USERS } from "./helpers";

// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — recette E2E ciblée des flux service_role réparés.
// Exige : la pile jetable dédiée (SQL proposé appliqué, fixture isolation_multitenant + amorçage
// acl-flux-amorce.mjs), le simulateur local des services externes (acl-flux-externes.mjs) et un
// serveur Next démarré avec le préchargement acl-flux-intercept.mjs. Aucun appel Stripe réel :
// évènements en mode Test signés localement, API Stripe simulée.
const ACTIVE = process.env.E2E_ACL_FLUX === "1";
test.describe.configure({ mode: "serial" });
test.skip(!ACTIVE, "Recette dédiée ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 (voir docs/audit/ELSATIA_SERVICE_ROLE_FLUX_ACL_V1.md)");

const DB = process.env.E2E_ACL_FLUX_DB ?? "supabase_db_elsatia-acl-flux-e2e";
const EXTERNES = process.env.E2E_ACL_FLUX_EXTERNES ?? "http://127.0.0.1:3197";
const A = "a0000000-0000-0000-0000-000000000001";
const FACTURE_A = "aa000000-0000-0000-0000-000000000001";
const FACTURE_B = "ba000000-0000-0000-0000-000000000001";
const PERIODE = "ad000000-0000-0000-0000-0000000000e2";
const DEVIS = "a9000000-0000-0000-0000-0000000000e2";
const LOT = "e2e00000-0000-0000-0000-000000000001";

function variable(nom: string) {
  const valeur = process.env[nom];
  if (!valeur) throw new Error(`${nom} manquante pour la recette ACL`);
  return valeur;
}

function sql(requete: string): string {
  return execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-At", "-v", "ON_ERROR_STOP=1", "-c", requete], { encoding: "utf8" }).trim();
}

type AppelExterne = { methode: string; chemin: string; corps?: string };
async function journalExterne(): Promise<AppelExterne[]> {
  return (await fetch(`${EXTERNES}/__journal`)).json() as Promise<AppelExterne[]>;
}

function signatureStripe(corps: string, secret: string) {
  const horodatage = Math.floor(Date.now() / 1000);
  return `t=${horodatage},v1=${createHmac("sha256", secret).update(`${horodatage}.${corps}`).digest("hex")}`;
}

async function evenementStripe(request: APIRequestContext, chemin: string, secret: string, evenement: Record<string, unknown>) {
  const corps = JSON.stringify(evenement);
  return request.post(chemin, { headers: { "stripe-signature": signatureStripe(corps, secret), "content-type": "application/json" }, data: corps });
}

test.beforeAll(async () => {
  await fetch(`${EXTERNES}/__journal`, { method: "DELETE" });
});

test("Stripe Connect : la facture client est encaissée une seule fois et l'expiration est consignée", async ({ request }) => {
  const secret = variable("E2E_ACL_STRIPE_WEBHOOK_SECRET");
  const paiement = {
    id: `evt_acl_e2e_${randomUUID()}`, type: "checkout.session.completed", livemode: false, account: "acct_acl_e2e_A",
    data: { object: { id: "cs_acl_e2e_connect", payment_status: "paid", payment_intent: "pi_acl_e2e", amount_total: 5000, metadata: { facture_id: FACTURE_A, entreprise_id: A } } },
  };
  const premier = await evenementStripe(request, "/api/stripe/webhook", secret, paiement);
  expect(premier.status()).toBe(200);
  expect(await premier.json()).toEqual({ received: true });
  const rejeu = await evenementStripe(request, "/api/stripe/webhook", secret, paiement);
  expect(await rejeu.json()).toEqual({ received: true, duplicate: true });
  expect(sql("select count(*) || '|' || sum(montant) from public.paiements where stripe_session_id = 'cs_acl_e2e_connect'")).toBe("1|50.00");
  expect(sql(`select stripe_payment_status || '|' || stripe_payment_intent_id || '|' || montant_paye from public.factures where id = '${FACTURE_A}'`)).toBe("paid|pi_acl_e2e|50.00");

  const expiration = {
    id: `evt_acl_e2e_${randomUUID()}`, type: "checkout.session.expired", livemode: false, account: "acct_acl_e2e_B",
    data: { object: { id: "cs_acl_e2e_expire", metadata: { facture_id: FACTURE_B } } },
  };
  expect((await evenementStripe(request, "/api/stripe/webhook", secret, expiration)).status()).toBe(200);
  expect(sql(`select stripe_payment_status from public.factures where id = '${FACTURE_B}'`)).toBe("expired");
});

test("Boutique : seul le webhook après paiement confirmé marque la commande payée ; l'expiration est consignée", async ({ request }) => {
  const secret = variable("E2E_ACL_STRIPE_WEBHOOK_BOUTIQUE_SECRET");
  const reponse = await evenementStripe(request, "/api/stripe/boutique/webhook", secret, {
    id: `evt_acl_e2e_${randomUUID()}`, type: "checkout.session.completed", livemode: false,
    data: { object: { id: "cs_acl_e2e_btq", payment_status: "paid", metadata: { commande_id: "ac000000-0000-0000-0000-0000000000e2" } } },
  });
  expect(reponse.status()).toBe(200);
  expect(sql("select statut from public.boutique_commandes where id = 'ac000000-0000-0000-0000-0000000000e2'")).toBe("payee");
  expect(sql("select count(*) from public.depenses_fournisseurs where numero_piece = 'BTQ-ac000000-0000-0000-0000-0000000000e2'")).toBe("1");

  const expiration = await evenementStripe(request, "/api/stripe/boutique/webhook", secret, {
    id: `evt_acl_e2e_${randomUUID()}`, type: "checkout.session.expired", livemode: false,
    data: { object: { id: "cs_acl_e2e_btq_exp", metadata: { commande_id: "ac000000-0000-0000-0000-0000000000e3" } } },
  });
  expect(expiration.status()).toBe(200);
  expect(sql("select statut from public.boutique_commandes where id = 'ac000000-0000-0000-0000-0000000000e3'")).toBe("expiree");
});

test("D1 : le client propriétaire connecté ne peut marquer sa commande payée ni par RPC ni par PATCH", async ({ request }) => {
  const url = variable("E2E_SUPABASE_URL");
  const apikey = variable("E2E_SUPABASE_ANON_KEY");
  const acces = await token(request, USERS.adminA);
  const entetes = { apikey, Authorization: `Bearer ${acces}`, "Content-Type": "application/json" };
  const rpc = await request.post(`${url}/rest/v1/rpc/boutique_finaliser_commande_payee`, {
    headers: entetes, data: { p_commande_id: "ac000000-0000-0000-0000-0000000000e4", p_checkout_id: "cs_acl_e2e_d1" },
  });
  expect((await rpc.json()).code).toBe("42501");
  const patch = await request.patch(`${url}/rest/v1/boutique_commandes?id=eq.ac000000-0000-0000-0000-0000000000e4`, {
    headers: entetes, data: { statut: "payee" },
  });
  expect((await patch.json()).code).toBe("42501");
  const legitime = await request.patch(`${url}/rest/v1/boutique_commandes?id=eq.ac000000-0000-0000-0000-0000000000e4`, {
    headers: { ...entetes, Prefer: "return=representation" }, data: { nom_destinataire: "Livraison recette" },
  });
  expect(legitime.status()).toBe(200);
  expect(sql("select statut || '|' || nom_destinataire from public.boutique_commandes where id = 'ac000000-0000-0000-0000-0000000000e4'"))
    .toBe("en_attente_paiement|Livraison recette");
});

test("Abonnement : invoice.paid met à jour l'entreprise et la facture d'abonnement", async ({ request }) => {
  const secret = variable("E2E_ACL_STRIPE_WEBHOOK_ABONNEMENT_SECRET");
  const maintenant = Math.floor(Date.now() / 1000);
  const reponse = await evenementStripe(request, "/api/stripe/abonnement/webhook", secret, {
    id: `evt_acl_e2e_${randomUUID()}`, type: "invoice.paid", livemode: false, created: maintenant,
    data: { object: {
      id: "in_acl_e2e", object: "invoice", customer: "cus_acl_A", subscription: "sub_acl_e2e_A", status: "paid",
      number: "ACL-E2E-0001", hosted_invoice_url: "https://invoice.stripe.test/acl", invoice_pdf: "https://invoice.stripe.test/acl.pdf",
      created: maintenant, period_start: maintenant - 2_592_000, period_end: maintenant, subtotal: 1000, tax: 200, total: 1200, currency: "eur",
      // Pas de metadata.entreprise_id : les UUID de la fixture (a0000000-…-0001) ne sont pas
      // conformes RFC 4122 et la route les refuse à juste titre ; comme pour une vraie facture
      // Stripe, l'entreprise est résolue par son abonnement.
    } },
  });
  expect(reponse.status()).toBe(200);
  expect(sql(`select abonnement_statut || '|' || derniere_facture_stripe_id from public.entreprises where id = '${A}'`)).toBe("actif|in_acl_e2e");
  expect(sql("select count(*) from public.factures_abonnement where stripe_invoice_id = 'in_acl_e2e'")).toBe("1");
});

test("Cron quotidien : comptes supplémentaires réconciliés sans suppression, périodes de paie et relances", async ({ request }) => {
  const reponse = await request.get("/api/cron/abonnements", { headers: { authorization: `Bearer ${variable("E2E_ACL_CRON_SECRET")}` } });
  expect(reponse.status()).toBe(200);
  const resultat = await reponse.json();
  const reconciliation = resultat.jobsHistoriques.resultats.find((r: { entrepriseId: string }) => r.entrepriseId === A);
  expect(reconciliation).toMatchObject({ synchronise: true, quantite: 1 });
  expect(resultat.jobsHistoriques.paiePeriodes).toContainEqual(expect.objectContaining({ periodeId: PERIODE, ok: true }));
  expect(resultat.relances.erreur).toBeUndefined();
  expect(resultat.relances.envoyees).toBeGreaterThanOrEqual(1);

  const journal = await journalExterne();
  const majItem = journal.find((a) => a.methode === "POST" && a.chemin === "/stripe/v1/subscription_items/si_acl_sup");
  expect(majItem?.corps).toContain("quantity=1");
  expect(journal.filter((a) => a.methode === "DELETE" && a.chemin.includes("subscription_items"))).toEqual([]);
  expect(journal.some((a) => a.chemin === "/brevo/v3/smtp/email" && a.corps?.includes("client-a-e2e@recette.invalid"))).toBe(true);
  expect(sql(`select count(*) from public.relances_documents where document_id = '${DEVIS}' and statut = 'envoyee'`)).toBe("1");
  expect(sql(`select count(*) || '|' || count(*) filter (where cree_par is null) from public.acces_externes_documents where document_id = '${DEVIS}' and revoque_le is null`)).toBe("1|1");
});

test("Import de bulletin par l'expert-comptable : bulletin à vérifier, trace bancaire et fichier stockés", async ({ request }) => {
  const versionAvant = Number(sql(`select coalesce(max(version), 0) from public.bulletins_paie where entreprise_id = '${A}'
    and employe_id = 'a2000000-0000-0000-0000-000000000002' and periode = '2031-03-01'`));
  const reponse = await request.post("/api/paie/import", {
    headers: { authorization: `Bearer ${variable("E2E_ACL_PAYROLL_IMPORT_SECRET")}` },
    multipart: {
      entreprise_reference: "ENT-ACL-A", employe_reference: "ACL-EMP-A2", periode: "2031-03",
      montant_net_a_payer: "1234.56", reference_expert_comptable: "EC-ACL-E2E",
      bulletin: { name: "bulletin-recette.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n% recette ACL\n") },
    },
  });
  expect(reponse.status()).toBe(201);
  const { id } = await reponse.json();
  expect(sql(`select statut || '|' || version || '|' || montant_net_a_payer from public.bulletins_paie where id = '${id}'`)).toBe(`a_verifier|${versionAvant + 1}|1234.56`);
  expect(sql(`select count(*) from public.journal_paiements_bancaires where ressource_id = '${id}' and action = 'bulletin_recu_expert'`)).toBe("1");
  expect(sql(`select count(*) from storage.objects o join public.bulletins_paie b on b.storage_path = o.name where b.id = '${id}' and o.bucket_id = 'bulletins-paie'`)).toBe("1");
});

// L'export de paie est une fonctionnalité « avancée » : il est porté par l'entreprise B (offre
// non limitée, sans abonnement Stripe), l'offre Mini de A ne l'ouvrant pas.
test("Export de paie par un utilisateur connecté : fichier servi, audit écrit, date d'export posée", async ({ page }) => {
  const periodeB = "bd000000-0000-0000-0000-0000000000e2";
  const auditsAvant = Number(sql(`select count(*) from public.journal_audit_paie where periode_id = '${periodeB}' and action = 'export_periode_paie'`));
  await login(page, USERS.adminB);
  // Appel depuis la page elle-même : c'est le navigateur qui envoie ses cookies de session, comme
  // pour un vrai clic. (`page.request` n'envoie pas les cookies `Secure` posés en production sur
  // http://127.0.0.1 et serait redirigé vers /login.)
  const reponse = await page.evaluate(async (url) => {
    const r = await fetch(url, { redirect: "manual" });
    return { statut: r.status, type: r.headers.get("content-type") ?? "", debut: r.status === 200 ? (await r.text()).slice(0, 60) : "" };
  }, `/api/paie/periodes/${periodeB}/export?format=csv`);
  expect(reponse.statut, "export redirigé ou refusé (statut 0 = redirection)").toBe(200);
  expect(reponse.type).toContain("csv");
  expect(reponse.debut).toContain("PRÉPARATION DES VARIABLES DE PAIE");
  expect(Number(sql(`select count(*) from public.journal_audit_paie where periode_id = '${periodeB}' and action = 'export_periode_paie'`))).toBe(auditsAvant + 1);
  expect(sql(`select (date_export is not null)::text from public.periodes_paie where id = '${periodeB}'`)).toBe("true");
});

test("Retour bancaire Powens : le lot est retrouvé et réconcilié", async ({ request }) => {
  const corps = Buffer.from(JSON.stringify({ lotId: LOT, entrepriseId: A, expireAt: Date.now() + 3_600_000 })).toString("base64url");
  const etat = `${corps}.${createHmac("sha256", variable("E2E_ACL_POWENS_CLIENT_SECRET")).update(corps).digest("base64url")}`;
  const reconciliationsAvant = Number(sql(`select count(*) from public.journal_paiements_bancaires where ressource_id = '${LOT}' and action = 'lot_reconcilie'`));
  const reponse = await request.get(`/api/paiements-bancaires/powens/callback?state=${encodeURIComponent(etat)}`, { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(reponse.status());
  expect(reponse.headers().location).toContain("success=");
  expect(sql(`select statut || '|' || provider_statut from public.lots_virements where id = '${LOT}'`)).toBe("execute|done");
  expect(Number(sql(`select count(*) from public.journal_paiements_bancaires where ressource_id = '${LOT}' and action = 'lot_reconcilie'`))).toBe(reconciliationsAvant + 1);
});

test("Notifications push : envoi chiffré, abonnement mort supprimé, webhook et cron marquent la notification", async ({ request }) => {
  const webhook = await request.post("/api/webhooks/notifications-push", {
    headers: { "x-notifications-secret": variable("E2E_ACL_NOTIFICATIONS_WEBHOOK_SECRET") },
    data: { type: "INSERT", table: "notifications_utilisateurs", record: { id: "ae000000-0000-0000-0000-0000000000e2" } },
  });
  expect(await webhook.json()).toEqual({ ok: true });
  expect(sql("select (push_envoyee_at is not null)::text from public.notifications_utilisateurs where id = 'ae000000-0000-0000-0000-0000000000e2'")).toBe("true");
  expect(sql("select string_agg(id::text, ',' order by id) from public.push_abonnements where id in ('af000000-0000-0000-0000-0000000000e2', 'af000000-0000-0000-0000-0000000000e3')"))
    .toBe("af000000-0000-0000-0000-0000000000e2");
  const envois = (await journalExterne()).filter((a) => a.chemin.startsWith("push:"));
  expect(envois.map((a) => a.chemin)).toEqual(expect.arrayContaining(["push:/ok/acl-e2e", "push:/gone/acl-e2e"]));

  const cron = await request.get("/api/cron/notifications-push", { headers: { authorization: `Bearer ${variable("E2E_ACL_CRON_SECRET")}` } });
  expect(cron.status()).toBe(200);
  expect((await cron.json()).traitees).toBeGreaterThanOrEqual(1);
  expect(sql("select (push_envoyee_at is not null)::text from public.notifications_utilisateurs where id = 'ae000000-0000-0000-0000-0000000000e3'")).toBe("true");
});
