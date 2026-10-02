import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// ELSATIA CANONICAL TRAIN V9.1 — flux de service RÉELS contre PostgREST (rôle service_role
// signé, pas de mock de base) : comptage Stripe, relances automatiques (moteur complet,
// nouveau lien compris), push (préparation, abonnement mort supprimé, marquage).
// Seuls les transports sortants sont simulés (Brevo, web-push) : aucun envoi réel.
//
// Actif seulement si la pile locale est lancée (tests/e2e/post-v9-pile-locale +
// finance-pile-locale/demarrer-pile.sh) et que PV9_FLUX_URL, PV9_FLUX_DB,
// PV9_FLUX_SERVICE_KEY, PV9_FLUX_ANON_KEY sont exportées ; sinon la suite est ignorée.
const actif = Boolean(process.env.PV9_FLUX_URL && process.env.PV9_FLUX_DB && process.env.PV9_FLUX_SERVICE_KEY && process.env.PV9_FLUX_ANON_KEY);

const envois = vi.hoisted(() => ({ emails: [] as Array<{ to: string; html: string }>, push: [] as string[] }));
vi.mock("@/lib/brevo", () => ({
  brevoEstConfigure: () => true,
  envoyerEmailBrevo: async (message: { to: string; html: string }) => {
    envois.emails.push(message);
    return { messageId: `pv9-${envois.emails.length}` };
  },
}));
vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => undefined,
    sendNotification: async (abonnement: { endpoint: string }) => {
      envois.push.push(abonnement.endpoint);
      throw Object.assign(new Error("Gone"), { statusCode: 410 });
    },
  },
}));

const ENTREPRISE = "9e900000-0000-4000-8000-0000000000e9";
const DEVIS = "9e910000-0000-4000-8000-0000000000e9";
const NOTIF = "9e920000-0000-4000-8000-0000000000e9";
const ABONNEMENT = "9e930000-0000-4000-8000-0000000000e9";
const GERANT = "9a000000-0000-4000-8000-0000000000a1";

function pg(sql: string): string {
  return execFileSync("su", ["postgres", "-c", `psql -X -A -t -q -v ON_ERROR_STOP=1 -d ${process.env.PV9_FLUX_DB}`], { input: sql, encoding: "utf8" }).trim();
}
const client = (cle: string): SupabaseClient =>
  createClient(process.env.PV9_FLUX_URL!, cle, { auth: { persistSession: false, autoRefreshToken: false } });

describe.skipIf(!actif)("V9.1 — flux de service réels (PostgREST, service_role)", () => {
  let admin: SupabaseClient;

  beforeAll(() => {
    admin = client(process.env.PV9_FLUX_SERVICE_KEY!);
    vi.stubEnv("FEATURE_RELANCES_AUTO_ENABLED", "true");
    vi.stubEnv("VAPID_PUBLIC_KEY", "pv9-public");
    vi.stubEnv("VAPID_PRIVATE_KEY", "pv9-private");
    vi.stubEnv("VAPID_SUBJECT", "mailto:recette@pv9.invalid");
    pg(`
      insert into entreprises (id, nom, abonnement_statut) values ('${ENTREPRISE}', 'PV9 Flux', 'actif') on conflict (id) do nothing;
      insert into clients (id, entreprise_id, nom, email) values ('9e940000-0000-4000-8000-0000000000e9', '${ENTREPRISE}', 'Client Flux', 'client-flux@pv9.invalid')
        on conflict (id) do nothing;
      insert into devis (id, entreprise_id, numero, client_id, statut, date_emission, montant_ht, montant_tva, montant_ttc)
        values ('${DEVIS}', '${ENTREPRISE}', 'DEV-FLUX-001', '9e940000-0000-4000-8000-0000000000e9', 'envoye', current_date - 40, 100, 20, 120)
        on conflict (id) do nothing;
      insert into parametres_relances (entreprise_id, devis_auto_actif, factures_auto_actif, envoyer_weekend)
        values ('${ENTREPRISE}', true, false, true) on conflict (entreprise_id) do update set devis_auto_actif = true, envoyer_weekend = true;
      insert into employes (entreprise_id, nom, prenom, numero_inscription, identifiant_interne, compte_application_statut)
        select '${ENTREPRISE}', 'Compte', 'N' || g, 'BTP-PV9FLUX-' || g, 'PV9FLUX-' || g,
               case when g <= 2 then 'actif' when g = 3 then 'pause' else 'ferme' end
        from generate_series(1, 4) g;
      insert into notifications_utilisateurs (id, entreprise_id, utilisateur_id, type, titre)
        values ('${NOTIF}', '${ENTREPRISE}', '${GERANT}', 'pv9_flux', 'Flux PV9');
      insert into push_abonnements (id, entreprise_id, utilisateur_id, endpoint, p256dh, auth)
        values ('${ABONNEMENT}', '${ENTREPRISE}', '${GERANT}', 'https://push.invalid/pv9-flux', 'p', 'a');
    `);
  });

  afterAll(() => vi.unstubAllEnvs());

  it("comptage Stripe : la RPC appelée par reconcilierAbonnementStripe rend le nombre exact", async () => {
    const { data, error } = await admin.rpc("compter_comptes_application_service", { p_entreprise_id: ENTREPRISE });
    expect(error).toBeNull();
    expect(data).toBe(3); // 2 actifs + 1 pause ; « ferme » exclu
    expect(Number(pg(`select count(*) from employes where entreprise_id = '${ENTREPRISE}' and compte_application_statut in ('actif','pause')`))).toBe(3);
  });

  it("comptage Stripe : refusé à la clé anon (42501)", async () => {
    const { error } = await client(process.env.PV9_FLUX_ANON_KEY!).rpc("compter_comptes_application_service", { p_entreprise_id: ENTREPRISE });
    expect(error?.code).toBe("42501");
  });

  it("relances automatiques : moteur complet sous service_role, lien de partage sans auteur", async () => {
    const { traiterRelancesAutomatiques } = await import("@/lib/relances-cron");
    const resultat = await traiterRelancesAutomatiques(admin);
    expect(resultat.erreur).toBeUndefined();
    expect(resultat.actif).toBe(true);
    const detail = resultat.details.find((d) => d.documentId === DEVIS);
    expect(detail?.statut).toBe("envoyee");
    expect(envois.emails.some((m) => m.to === "client-flux@pv9.invalid" && m.html.includes("/document/"))).toBe(true);
    expect(pg(`select statut || '|' || automatique from relances_documents where document_id = '${DEVIS}'`)).toBe("envoyee|true");
    expect(pg(`select count(*) || '|' || bool_and(cree_par is null) from acces_externes_documents where document_id = '${DEVIS}' and revoque_le is null`)).toBe("1|true");
  });

  it("push : préparation, abonnement mort (410) supprimé, notification marquée", async () => {
    const { traiterNotificationPush } = await import("@/lib/push");
    await traiterNotificationPush(admin, NOTIF);
    expect(envois.push).toContain("https://push.invalid/pv9-flux");
    expect(pg(`select count(*) from push_abonnements where id = '${ABONNEMENT}'`)).toBe("0");
    expect(pg(`select push_envoyee_at is not null from notifications_utilisateurs where id = '${NOTIF}'`)).toBe("t");
  });
});
