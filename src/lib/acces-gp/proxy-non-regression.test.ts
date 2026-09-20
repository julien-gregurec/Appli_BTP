/**
 * PREUVE DE NON-RÉGRESSION du proxy (D1, étape 1) : `updateSession` doit renvoyer EXACTEMENT la même
 * réponse (statut, destination, en-têtes, cookies) avec et sans observation, quel que soit le
 * comportement de la RPC `decision_acces_application` (absente, qui lève, qui expire, qui refuse,
 * qui autorise). Toutes les dépendances réseau sont simulées ; `after()` est capté pour prouver
 * que l'appel RPC n'a lieu QU'APRÈS la construction de la réponse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const apres = vi.hoisted(() => ({ taches: [] as Array<() => unknown> }));
vi.mock("next/server", async (original) => {
  const reel = await original<typeof import("next/server")>();
  return { ...reel, after: (tache: () => unknown) => void apres.taches.push(tache) };
});

type Scenario = {
  ctx: Record<string, unknown>;
  entreprise?: Record<string, unknown> | null;
  moduleParPermission?: boolean;
};

const etat = vi.hoisted(() => ({
  scenario: null as unknown,
  comportementDecision: "refus" as string,
  appelsDecision: 0,
  ordre: [] as string[],
  signaux: [] as AbortSignal[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => {
    const sc = () => etat.scenario as Scenario;
    const thenable = (valeur: unknown) => ({
      abortSignal: () => thenable(valeur),
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(valeur).then(ok, ko),
    });
    return {
      auth: {
        getUser: async () => ({ data: { user: { id: "u-1" } } }),
        mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }) },
      },
      rpc: (nom: string, args: Record<string, unknown>) => {
        if (nom === "contexte_acces_proxy") return thenable({ data: sc().ctx, error: null });
        if (nom === "acces_module_pour_permission") return thenable({ data: sc().moduleParPermission ?? true, error: null });
        if (nom === "est_plateforme_admin") return thenable({ data: false, error: null });
        if (nom === "decision_acces_application") {
          etat.appelsDecision++;
          etat.ordre.push("rpc_decision");
          expect(args).toMatchObject({ p_application_code: "gestion_pro" });
          const c = etat.comportementDecision;
          return {
            abortSignal: (signal: AbortSignal) => {
              etat.signaux.push(signal);
              if (c === "leve") throw new Error("boom");
              if (c === "rejette") return Promise.reject(new Error("boom"));
              if (c === "expire") return new Promise(() => {});
              if (c === "absente") return Promise.resolve({ data: null, error: { code: "42883", message: "function does not exist" } });
              if (c === "autorise") return Promise.resolve({ data: { version: 1, decision: "autorise", application_code: "gestion_pro", role_code: "gestion_pro_admin", entreprise: null }, error: null });
              return Promise.resolve({ data: { version: 1, decision: "sans_habilitation", application_code: "gestion_pro", entreprise: null }, error: null });
            },
          };
        }
        return thenable({ data: null, error: null });
      },
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sc().entreprise ?? null, error: null }) }) }),
      }),
    };
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/supabase/keys", () => ({ clePubliqueSupabase: () => "cle-test" }));
vi.mock("@/lib/security/rate-limit", () => ({
  politiquesRateLimitPour: () => [],
  appliquerRateLimit: async () => ({ autorise: true }),
}));

// Chaque test repart d'un module `proxy` neuf : l'observateur garde un état de PROCESSUS (déduplication,
// silence après « RPC absente ») qui ne doit pas fuir d'un scénario à l'autre.
async function chargerProxy() {
  vi.resetModules();
  return (await import("@/lib/supabase/proxy")).updateSession;
}

const ENT = "e0000000-0000-4000-8000-0000000000aa";
const membre = { connecte: true, compte_depot: false, entreprise_id: ENT, acces_support: false, droit_acces: true, droit_gestion: true };
const entrepriseEssai = { abonnement_offre: "essentiel", abonnement_statut: "essai", abonnement_essai_debut: "2026-09-01", abonnement_essai_fin: "2026-09-20" };

// `taches` = nombre de tâches d'observation attendues en mode observe (0 = requête exemptée).
// `status`/`location` figent la réponse de référence : on prouve que les scénarios exercent de vrais refus.
const SCENARIOS: Array<{ nom: string; chemin: string; methode?: string; sc: Scenario; taches: number; status: number; location: string | null }> = [
  { nom: "membre avec droit de poste sur /devis (passe)", chemin: "/devis", sc: { ctx: membre, entreprise: entrepriseEssai } , taches: 1, status: 200, location: null },
  { nom: "droit de poste refusé → /dashboard?acces=refuse", chemin: "/devis", sc: { ctx: { ...membre, droit_acces: false }, entreprise: entrepriseEssai } , taches: 1, status: 307, location: "/dashboard?acces=refuse" },
  { nom: "module non inclus → cul-de-sac abonnement", chemin: "/rentabilite", sc: { ctx: membre, entreprise: { abonnement_offre: "mini", abonnement_statut: "actif", abonnement_essai_debut: "2026-08-01", abonnement_essai_fin: "2026-08-20" }, moduleParPermission: false } , taches: 1, status: 307, location: "/abonnement/module-non-inclus?module=acces_rentabilite" },
  { nom: "mutation sans droit de gestion → lecture seule", chemin: "/devis", methode: "POST", sc: { ctx: { ...membre, droit_gestion: false }, entreprise: entrepriseEssai } , taches: 1, status: 303, location: "/devis?a=1&lecture=seule" },
  { nom: "chemin non gardé (/dashboard)", chemin: "/dashboard", sc: { ctx: membre, entreprise: entrepriseEssai } , taches: 1, status: 200, location: null },
  { nom: "compte dépôt hors de son périmètre → borne/cul-de-sac", chemin: "/devis", sc: { ctx: { ...membre, compte_depot: true }, entreprise: entrepriseEssai } , taches: 0, status: 307, location: null },
  { nom: "session d'assistance", chemin: "/devis", sc: { ctx: { ...membre, acces_support: true, droit_acces: false } } , taches: 0, status: 200, location: null },
  { nom: "sans entreprise", chemin: "/dashboard", sc: { ctx: { ...membre, entreprise_id: null } } , taches: 0, status: 200, location: null },
  { nom: "page publique, connecté", chemin: "/tarifs", sc: { ctx: membre } , taches: 0, status: 200, location: null },
  { nom: "connecté sur /login → redirection tableau de bord", chemin: "/login", sc: { ctx: membre } , taches: 0, status: 307, location: "/dashboard" },
  { nom: "/onboarding (exempté)", chemin: "/onboarding", sc: { ctx: membre } , taches: 0, status: 200, location: null },
];

const COMPORTEMENTS = ["refus", "autorise", "leve", "rejette", "expire", "absente"] as const;

async function jouer(updateSession: Awaited<ReturnType<typeof chargerProxy>>, sc: Scenario, chemin: string, methode = "GET") {
  etat.scenario = sc;
  etat.appelsDecision = 0;
  etat.ordre = [];
  etat.signaux = [];
  apres.taches.length = 0;
  const req = new NextRequest(`http://localhost:3000${chemin}?a=1`, { method: methode, headers: { cookie: "sb-test=1" } });
  const rep = await updateSession(req);
  etat.ordre.push("reponse_construite");
  return {
    status: rep.status,
    location: rep.headers.get("location"),
    entetes: [...rep.headers.entries()].sort(),
    cookies: rep.cookies.getAll().map((c) => `${c.name}=${c.value}`).sort(),
  };
}

const ENV_ORIGINE = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "cle-test";
  delete process.env.ELSATIA_GP_ACCES_APP;
  delete process.env.ELSATIA_GP_ACCES_APP_ECHANTILLON;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  process.env = { ...ENV_ORIGINE };
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("proxy — réponse strictement identique avec et sans observation", () => {
  for (const s of SCENARIOS) {
    describe(s.nom, () => {
      for (const comportement of COMPORTEMENTS) {
        it(`RPC « ${comportement} » : même réponse que le mode off, appel RPC uniquement après la réponse`, async () => {
          etat.comportementDecision = comportement;
          const updateSession = await chargerProxy();

          delete process.env.ELSATIA_GP_ACCES_APP;
          const reference = await jouer(updateSession, s.sc, s.chemin, s.methode);
          expect(etat.appelsDecision).toBe(0); // off : aucune RPC, aucune tâche planifiée
          expect(apres.taches).toHaveLength(0);

          process.env.ELSATIA_GP_ACCES_APP = "observe";
          process.env.ELSATIA_GP_ACCES_APP_ECHANTILLON = "1";
          const observee = await jouer(updateSession, s.sc, s.chemin, s.methode);
          expect(observee).toEqual(reference);
          expect(reference.status).toBe(s.status);
          if (s.location) expect(reference.location ?? "").toContain(s.location.split("?")[0]);
          expect(apres.taches).toHaveLength(s.taches);
          // Jamais sur le chemin critique : au retour de updateSession, la RPC n'a pas encore été appelée.
          expect(etat.appelsDecision).toBe(0);

          // On exécute ensuite les tâches d'arrière-plan (hang : le délai de 400 ms les libère).
          vi.useFakeTimers();
          const tout = Promise.all(apres.taches.map((t) => t()));
          await vi.advanceTimersByTimeAsync(500);
          await expect(tout).resolves.toBeDefined();
          vi.useRealTimers();
          if (comportement === "expire" && etat.signaux.length) expect(etat.signaux[0].aborted).toBe(true);
        });
      }
    });
  }

  it("mode enforce demandé : réponse identique au mode off (aucun blocage n'existe)", async () => {
    etat.comportementDecision = "refus";
    const updateSession = await chargerProxy();
    const s = SCENARIOS[0];
    const reference = await jouer(updateSession, s.sc, s.chemin);
    process.env.ELSATIA_GP_ACCES_APP = "enforce";
    process.env.ELSATIA_GP_ACCES_APP_ECHANTILLON = "1";
    const enforce = await jouer(updateSession, s.sc, s.chemin);
    expect(enforce).toEqual(reference);
    expect(enforce.status).toBe(200);
    await Promise.all(apres.taches.map((t) => t()));
  });

  it("le cas prouvé (poste OK, aucune habilitation) : GP sert toujours la page, l'écart n'est que journalisé", async () => {
    etat.comportementDecision = "refus";
    const updateSession = await chargerProxy();
    process.env.ELSATIA_GP_ACCES_APP = "observe";
    process.env.ELSATIA_GP_ACCES_APP_ECHANTILLON = "1";
    const s = SCENARIOS[0];
    const rep = await jouer(updateSession, s.sc, s.chemin);
    expect(rep.status).toBe(200);
    expect(rep.location).toBeNull();
    await Promise.all(apres.taches.map((t) => t()));
    const lignes = (console.warn as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    const ecart = lignes.map((l) => JSON.parse(l)).find((j) => j.type === "gp_autorise_decision_refuse");
    expect(ecart).toMatchObject({ decision: "sans_habilitation", chemin: "/devis", gravite: "bloquant_si_enforcement" });
    for (const l of lignes) {
      expect(l).not.toContain("u-1");
      expect(l).not.toContain(ENT);
    }
  });
});
