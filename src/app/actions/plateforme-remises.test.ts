import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake Stripe à état, fidèle au comportement réel documenté par Stripe : une même clé
// d'idempotence renvoie la réponse MÉMORISÉE de la toute première utilisation, SANS rejouer la
// mutation. C'est cette propriété qui permettait, avant correction, à une clé dérivée
// uniquement des paramètres métier (couple abonnement+coupon) de masquer une désynchronisation
// Stripe/Postgres (cf. describe "régression Codex" plus bas).
function creerStripeStateful() {
  const cache = new Map<string, unknown>();
  const abonnements = new Map<string, { couponId: string | null }>();
  let compteurCoupons = 0;

  function etatAbonnement(subscriptionId: string) {
    return abonnements.get(subscriptionId) ?? { couponId: null };
  }

  return {
    creerCouponRemise: vi.fn(async (params: { idempotence: string; duree: string; dureeMois?: number }) => {
      if (params.duree === "repeating" && (!params.dureeMois || params.dureeMois < 1)) {
        throw new Error("Le nombre de mois est obligatoire pour une remise limitée dans le temps");
      }
      if (cache.has(params.idempotence)) return cache.get(params.idempotence);
      const resultat = { id: `coupon_${++compteurCoupons}` };
      cache.set(params.idempotence, resultat);
      return resultat;
    }),
    appliquerCouponAbonnement: vi.fn(async (subscriptionId: string, couponId: string, idempotence: string) => {
      if (cache.has(idempotence)) return cache.get(idempotence); // réponse mémorisée : PAS de mutation rejouée
      abonnements.set(subscriptionId, { couponId });
      const resultat = {};
      cache.set(idempotence, resultat);
      return resultat;
    }),
    retirerCouponAbonnement: vi.fn(async (subscriptionId: string, idempotence: string) => {
      if (cache.has(idempotence)) return cache.get(idempotence);
      abonnements.set(subscriptionId, { couponId: null });
      const resultat = {};
      cache.set(idempotence, resultat);
      return resultat;
    }),
    recupererAbonnementStripe: vi.fn(async (subscriptionId: string) => {
      const etat = etatAbonnement(subscriptionId);
      return { id: subscriptionId, status: "active", discounts: etat.couponId ? [{ id: `di_${etat.couponId}` }] : [] };
    }),
    _etatAbonnement: etatAbonnement,
  };
}

// Fake du registre Postgres des tentatives durables (plateforme_tentatives_effet_externe +
// ses RPC), fidèle aux règles de la migration 20260827000241 : au plus une tentative active à
// la fois par entreprise+opération, réutilisée tant que l'empreinte ne change pas, nouvelle
// génération sinon ; une tentative bloquée (compensation_echouee / reconciliation_requise)
// refuse toute nouvelle tentative automatique.
type EtatTentative = "preparee" | "stripe_reussie" | "sql_reussie" | "compensation_requise" | "compensee" | "compensation_echouee" | "reconciliation_requise";
type TentativeInterne = {
  id: string; entrepriseId: string; operation: string; empreinte: string; generation: number;
  etat: EtatTentative; clePrincipale: string; cleCompensation: string | null; stripeObjectId: string | null;
};

function creerRegistreTentatives() {
  const tentatives: TentativeInterne[] = [];
  let compteur = 0;

  function active(entrepriseId: string, operation: string) {
    return tentatives.find((t) => t.entrepriseId === entrepriseId && t.operation === operation && t.etat !== "sql_reussie" && t.etat !== "compensee");
  }

  return {
    preparer(entrepriseId: string, operation: string, empreinte: string) {
      const existante = active(entrepriseId, operation);
      if (existante) {
        if (existante.etat === "compensation_echouee" || existante.etat === "reconciliation_requise") {
          throw new Error("Réconciliation manuelle requise avant toute nouvelle tentative sur cette entreprise");
        }
        if (existante.empreinte !== empreinte) {
          throw new Error("Une tentative différente est déjà en cours pour cette entreprise");
        }
        return { tentative_id: existante.id, generation: existante.generation, cle_principale: existante.clePrincipale, cle_compensation: existante.cleCompensation, etat: existante.etat, stripe_object_id: existante.stripeObjectId, reutilisee: true };
      }
      const generation = Math.max(0, ...tentatives.filter((t) => t.entrepriseId === entrepriseId && t.operation === operation).map((t) => t.generation)) + 1;
      const id = `tentative_${++compteur}`;
      const suffixe = operation === "remise_appliquer" ? "apply" : "retire";
      const clePrincipale = `remise:${id}:g${generation}:${suffixe}`;
      tentatives.push({ id, entrepriseId, operation, empreinte, generation, etat: "preparee", clePrincipale, cleCompensation: null, stripeObjectId: null });
      return { tentative_id: id, generation, cle_principale: clePrincipale, cle_compensation: null, etat: "preparee", stripe_object_id: null, reutilisee: false };
    },
    marquerStripeReussie(id: string, stripeObjectId: string) {
      const t = tentatives.find((t) => t.id === id);
      if (!t || t.etat !== "preparee") throw new Error("Tentative introuvable ou état incompatible");
      t.etat = "stripe_reussie";
      t.stripeObjectId = stripeObjectId;
    },
    marquerSqlReussie(id: string) {
      const t = tentatives.find((t) => t.id === id);
      if (!t || t.etat !== "stripe_reussie") throw new Error("Tentative introuvable ou état incompatible");
      t.etat = "sql_reussie";
    },
    marquerCompensationRequise(id: string) {
      const t = tentatives.find((t) => t.id === id);
      if (!t || t.etat !== "stripe_reussie") throw new Error("Tentative introuvable ou état incompatible");
      t.cleCompensation = `${t.clePrincipale}:compensate`;
      t.etat = "compensation_requise";
      return t.cleCompensation;
    },
    marquerCompensationResolue(id: string, confirmee: boolean) {
      const t = tentatives.find((t) => t.id === id);
      if (!t || t.etat !== "compensation_requise") throw new Error("Tentative introuvable ou état incompatible");
      t.etat = confirmee ? "compensee" : "compensation_echouee";
    },
    marquerReconciliationRequise(id: string) {
      const t = tentatives.find((t) => t.id === id);
      if (!t || (t.etat !== "preparee" && t.etat !== "compensation_requise")) throw new Error("Tentative introuvable ou état incompatible");
      t.etat = "reconciliation_requise";
    },
    _tentatives: tentatives,
  };
}

const stripe = creerStripeStateful();
const registre = creerRegistreTentatives();

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  estPlateformeAdmin: vi.fn(async () => true),
  rpc: vi.fn<(nom: string, parametres?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>>(async () => ({ data: null, error: null })),
  preautorisation: null as Record<string, unknown> | null,
  erreurPreautorisation: null as string | null,
  erreurMutation: null as string | null,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/stripe-abonnement", () => ({
  creerCouponRemise: (...args: Parameters<typeof stripe.creerCouponRemise>) => stripe.creerCouponRemise(...args),
  appliquerCouponAbonnement: (...args: Parameters<typeof stripe.appliquerCouponAbonnement>) => stripe.appliquerCouponAbonnement(...args),
  retirerCouponAbonnement: (...args: Parameters<typeof stripe.retirerCouponAbonnement>) => stripe.retirerCouponAbonnement(...args),
  recupererAbonnementStripe: (...args: Parameters<typeof stripe.recupererAbonnementStripe>) => stripe.recupererAbonnementStripe(...args),
  TYPES_REMISE: ["montant", "pourcentage"],
  DUREES_REMISE: ["once", "repeating", "forever"],
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));

const { appliquerRemiseAction, retirerRemiseAction } = await import("./plateforme");

function formulaireRemise(champs: Record<string, string>) {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

function reinitialiser() {
  vi.clearAllMocks();
  registre._tentatives.length = 0;
  mocks.estPlateformeAdmin.mockResolvedValue(true);
  mocks.erreurPreautorisation = null;
  mocks.erreurMutation = null;
  mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
  mocks.rpc.mockImplementation(async (nom: string, parametres?: Record<string, unknown>) => {
    try {
      switch (nom) {
        case "plateforme_preautoriser_effet_externe":
          return mocks.erreurPreautorisation
            ? { data: null, error: { message: mocks.erreurPreautorisation } }
            : { data: [mocks.preautorisation], error: null };
        case "plateforme_preparer_tentative_effet_externe":
          return { data: [registre.preparer(parametres!.p_entreprise_id as string, parametres!.p_operation as string, parametres!.p_empreinte as string)], error: null };
        case "plateforme_marquer_tentative_stripe_reussie":
          registre.marquerStripeReussie(parametres!.p_tentative_id as string, parametres!.p_stripe_object_id as string);
          return { data: null, error: null };
        case "plateforme_marquer_tentative_sql_reussie":
          registre.marquerSqlReussie(parametres!.p_tentative_id as string);
          return { data: null, error: null };
        case "plateforme_marquer_tentative_compensation_requise":
          return { data: registre.marquerCompensationRequise(parametres!.p_tentative_id as string), error: null };
        case "plateforme_marquer_tentative_compensation_resolue":
          registre.marquerCompensationResolue(parametres!.p_tentative_id as string, parametres!.p_confirmee as boolean);
          return { data: null, error: null };
        case "plateforme_marquer_tentative_reconciliation_requise":
          registre.marquerReconciliationRequise(parametres!.p_tentative_id as string);
          return { data: null, error: null };
        case "plateforme_appliquer_remise":
          if (mocks.erreurMutation) return { data: null, error: { message: mocks.erreurMutation } };
          mocks.preautorisation = { ...mocks.preautorisation, remise_stripe_coupon_id: parametres!.p_coupon_id };
          return { data: true, error: null };
        case "plateforme_retirer_remise":
          if (mocks.erreurMutation) return { data: null, error: { message: mocks.erreurMutation } };
          mocks.preautorisation = { ...mocks.preautorisation, remise_stripe_coupon_id: null };
          return { data: true, error: null };
        default:
          return { data: null, error: null };
      }
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : "erreur" } };
    }
  });
}

describe("appliquerRemiseAction — permissions et validation", () => {
  beforeEach(reinitialiser);

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow("REDIRECT:/dashboard");
    expect(stripe.creerCouponRemise).not.toHaveBeenCalled();
    expect(stripe.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("refuse un pourcentage supérieur à 100", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "150", duree: "once", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(stripe.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("exige un motif interne non vide", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "   " });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(stripe.creerCouponRemise).not.toHaveBeenCalled();
  });

  it("refuse si l'entreprise n'a pas d'abonnement Stripe actif", async () => {
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: null, remise_stripe_coupon_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(stripe.creerCouponRemise).not.toHaveBeenCalled();
  });

  it.each(["Session AAL2 requise", "Rôle support refusé", "Rôle lecture refusé", "Administrateur plateforme inactif", "Entreprise introuvable", "Session expirée"])(
    "refuse la préautorisation SQL (%s) avant tout appel Stripe",
    async (message) => {
      mocks.erreurPreautorisation = message;
      const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
      await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
      expect(stripe.creerCouponRemise).not.toHaveBeenCalled();
      expect(stripe.appliquerCouponAbonnement).not.toHaveBeenCalled();
    },
  );

  it("exige un nombre de mois pour une remise 'repeating' avant même de préparer une tentative", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(mocks.rpc).not.toHaveBeenCalledWith("plateforme_preparer_tentative_effet_externe", expect.anything());
    expect(stripe.appliquerCouponAbonnement).not.toHaveBeenCalled();
  });
});

describe("appliquerRemiseAction — flux nominal", () => {
  beforeEach(reinitialiser);

  it("crée et applique le coupon puis journalise type/valeur/motif/durée, dans le bon ordre (préautorisation < tentative < Stripe < mutation SQL)", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "repeating", duree_mois: "3", motif_interne: "Client pilote" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);

    expect(stripe.creerCouponRemise).toHaveBeenCalledWith(expect.objectContaining({ type: "pourcentage", valeur: 10, duree: "repeating", dureeMois: 3, idempotence: expect.stringMatching(/^remise:tentative_\d+:g1:apply:coupon$/) }));
    expect(stripe.appliquerCouponAbonnement).toHaveBeenCalledWith("sub_test", "coupon_1", expect.stringMatching(/^remise:tentative_\d+:g1:apply:abonnement$/));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_appliquer_remise", {
      p_entreprise_id: "entreprise-1", p_coupon_id: "coupon_1", p_description: "10 % pendant 3 mois",
      p_motif_interne: "Client pilote", p_duree_mois: 3, p_type: "pourcentage", p_valeur: 10,
    });

    const ordre = mocks.rpc.mock.calls.map((appel) => appel[0]);
    expect(ordre.indexOf("plateforme_preautoriser_effet_externe")).toBeLessThan(ordre.indexOf("plateforme_preparer_tentative_effet_externe"));
    expect(ordre.indexOf("plateforme_marquer_tentative_stripe_reussie")).toBeLessThan(ordre.indexOf("plateforme_appliquer_remise"));
    expect(ordre.indexOf("plateforme_appliquer_remise")).toBeLessThan(ordre.indexOf("plateforme_marquer_tentative_sql_reussie"));
  });

  it("tronque le nom du coupon Stripe à 40 caractères max (bug réel ABONNEMENTS-DETAIL-V1C)", async () => {
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "RECETTE-ABONNEMENTS-V1C-CLIENT", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "forever", motif_interne: "RECETTE ABONNEMENTS V1C" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);
    const appel = stripe.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom.length).toBeLessThanOrEqual(40);
    expect(appel.nom.endsWith("— 10 % à vie")).toBe(true);
  });

  it("conserve le nom entier quand il tient déjà dans la limite de 40 caractères", async () => {
    const formData = formulaireRemise({ type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
    await expect(appliquerRemiseAction("entreprise-1", formData)).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);
    const appel = stripe.creerCouponRemise.mock.calls[0][0] as unknown as { nom: string };
    expect(appel.nom).toBe("Entreprise Test — 10 % une fois");
  });
});

describe("clés Stripe : ancrées sur la tentative durable, jamais sur les seuls paramètres métier", () => {
  beforeEach(reinitialiser);

  async function idempotenceApplication(entrepriseId: string, champs: Record<string, string>) {
    await appliquerRemiseAction(entrepriseId, formulaireRemise(champs)).catch(() => {});
    const dernierAppel = stripe.creerCouponRemise.mock.calls.at(-1)?.[0] as { idempotence: string };
    return dernierAppel.idempotence;
  }

  it("double soumission de la même intention avant toute réponse Stripe confirmée : même tentative, même clé", async () => {
    const champs = { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" };
    mocks.erreurMutation = "Écriture locale refusée"; // empêche sql_reussie : la tentative reste réutilisable
    const cle1 = await idempotenceApplication("entreprise-1", champs);
    registre._tentatives[0].etat = "preparee"; // simule un retry avant toute confirmation Stripe (réseau coupé avant coupon créé)
    const cle2 = await idempotenceApplication("entreprise-1", champs);
    expect(cle1).toBe(cle2);
  });

  it("même remise sur deux entreprises différentes : tentatives et clés indépendantes", async () => {
    const champs = { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" };
    const cleA = await idempotenceApplication("entreprise-1", champs);
    mocks.preautorisation = { entreprise_id: "entreprise-2", entreprise_nom: "Entreprise Deux", stripe_subscription_id: "sub_deux", remise_stripe_coupon_id: null };
    const cleB = await idempotenceApplication("entreprise-2", champs);
    expect(cleA).not.toBe(cleB);
  });

  it("une tentative déjà pleinement convergée (sql_reussie) : une nouvelle intention obtient une nouvelle génération, donc une nouvelle clé", async () => {
    const cle10 = await idempotenceApplication("entreprise-1", { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" });
    const cle20 = await idempotenceApplication("entreprise-1", { type: "pourcentage", valeur: "20", duree: "once", motif_interne: "Test" });
    expect(cle10).not.toBe(cle20);
    expect(cle10).toMatch(/:g1:apply:coupon$/);
    expect(cle20).toMatch(/:g2:apply:coupon$/);
  });

  it("application puis retrait : la clé de retrait ne réutilise jamais celle de l'application", async () => {
    const champs = { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" };
    const cleApplication = await idempotenceApplication("entreprise-1", champs);
    mocks.preautorisation = { ...mocks.preautorisation, remise_stripe_coupon_id: "coupon_1" };
    await retirerRemiseAction("entreprise-1").catch(() => {});
    const cleRetrait = stripe.retirerCouponAbonnement.mock.calls.at(-1)?.[1] as string;
    expect(cleRetrait).not.toBe(cleApplication);
    expect(cleRetrait).toMatch(/:retire:retrait$/);
    expect(cleApplication).toMatch(/:apply:coupon$/);
  });

  it("une tentative bloquée (réconciliation requise) refuse toute nouvelle tentative automatique", async () => {
    const champs = { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" };
    await idempotenceApplication("entreprise-1", champs);
    registre._tentatives[0].etat = "reconciliation_requise"; // force manuellement l'état bloquant
    await expect(appliquerRemiseAction("entreprise-1", formulaireRemise(champs))).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(mocks.rpc.mock.calls.at(-1)?.[0]).not.toBe("plateforme_appliquer_remise");
  });
});

describe("RÉGRESSION (revue indépendante Codex sur 83466b2) — plus de désynchronisation Stripe/Postgres", () => {
  beforeEach(reinitialiser);

  it("scénario A : échec SQL après succès Stripe, compensation, puis nouvelle tentative métier — Stripe et Postgres restent alignés", async () => {
    const champs = { type: "pourcentage", valeur: "10", duree: "once", motif_interne: "Test" };

    // Tentative 1 : Stripe réussit (coupon_1 posé), la mutation SQL échoue, compensation retire
    // le coupon fraîchement créé.
    mocks.erreurMutation = "Écriture locale refusée";
    await appliquerRemiseAction("entreprise-1", formulaireRemise(champs)).catch(() => {});
    expect(stripe._etatAbonnement("sub_test").couponId).toBeNull();
    expect(registre._tentatives.at(-1)?.etat).toBe("compensee");

    // Tentative 2 (nouvelle soumission métier — l'admin corrige et relance) : la mutation SQL
    // réussit cette fois. Sous 83466b2, l'empreinte redevenait identique à la tentative 1 (même
    // état antérieur : aucun coupon actif) et la clé Stripe, dérivée directement de cette
    // empreinte, était réemployée — Stripe renvoyait alors la réponse mémorisée du coupon_1 déjà
    // retiré, SANS le réappliquer, pendant que Postgres enregistrait coupon_1 comme actif.
    mocks.erreurMutation = null;
    await appliquerRemiseAction("entreprise-1", formulaireRemise(champs)).catch(() => {});

    const dernierAppelSql = mocks.rpc.mock.calls.filter((appel) => appel[0] === "plateforme_appliquer_remise").at(-1);
    const couponEnregistreParPostgres = (dernierAppelSql?.[1] as { p_coupon_id: string }).p_coupon_id;
    const etatReelStripe = stripe._etatAbonnement("sub_test").couponId;

    // Preuve de convergence : Postgres et Stripe s'accordent sur le MÊME coupon actif — parce
    // que la tentative 2 a obtenu une génération et une clé nouvelles (le préflight ne réutilise
        // jamais une tentative déjà "compensee").
    expect(etatReelStripe).toBe(couponEnregistreParPostgres);
    expect(etatReelStripe).not.toBeNull();
    expect(registre._tentatives).toHaveLength(2);
    expect(registre._tentatives[0].clePrincipale).not.toBe(registre._tentatives[1].clePrincipale);
  });

  it("scénario B : échec du retrait SQL, compensation restaure l'ancien coupon — la clé de restauration ne peut jamais coïncider avec celle d'une application antérieure du même coupon", async () => {
    // Un coupon est déjà actif AVANT ce test (posé par une tentative antérieure quelconque, hors
    // du scope de ce test) : on simule son état Stripe directement.
    stripe.appliquerCouponAbonnement("sub_test", "coupon_ancien", "une-cle-statique-quelconque-deja-utilisee-ailleurs");
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: "coupon_ancien" };

    mocks.erreurMutation = "Écriture locale refusée";
    await retirerRemiseAction("entreprise-1").catch(() => {});

    // Sous 83466b2, la compensation appelait `appliquerCouponAbonnement(sub, couponAncien)` avec
    // la clé STATIQUE `remise-application-sub_test-coupon_ancien` — exactement celle qui avait
    // servi lors de l'application d'origine de ce même coupon. Si cette clé avait déjà été
    // utilisée (coupon déjà appliqué plus tôt dans la même fenêtre de 24h), Stripe renvoyait la
        // réponse mémorisée SANS rejouer la restauration, alors que la compensation la croyait
    // réussie. Ici, la clé de compensation est dérivée de la tentative, jamais de ce couple
    // (abonnement, coupon) : la restauration est bien rejouée et confirmée.
    const appelsRestauration = stripe.appliquerCouponAbonnement.mock.calls.filter((appel) => appel[1] === "coupon_ancien");
    expect(appelsRestauration.length).toBeGreaterThanOrEqual(1);
    const cleRestauration = appelsRestauration.at(-1)?.[2] as string;
    expect(cleRestauration).not.toBe("une-cle-statique-quelconque-deja-utilisee-ailleurs");
    expect(cleRestauration).toMatch(/:retire:compensate$/);
    expect(stripe._etatAbonnement("sub_test").couponId).toBe("coupon_ancien");
    expect(registre._tentatives.at(-1)?.etat).toBe("compensee");
  });
});

describe("retirerRemiseAction — permissions et flux nominal", () => {
  beforeEach(() => {
    reinitialiser();
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: "coupon_test" };
    stripe.appliquerCouponAbonnement("sub_test", "coupon_test", "preparation-test");
    stripe.appliquerCouponAbonnement.mockClear(); // n'efface que l'historique d'appels : l'état simulé du coupon reste posé
  });

  it("refuse un utilisateur non plateforme-admin sans jamais appeler Stripe", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow("REDIRECT:/dashboard");
    expect(stripe.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("retire le coupon Stripe puis appelle le RPC plateforme_retirer_remise", async () => {
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?succes=/);
    expect(stripe.retirerCouponAbonnement).toHaveBeenCalledWith("sub_test", expect.stringMatching(/:retire:retrait$/));
    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_retirer_remise", { p_entreprise_id: "entreprise-1" });
  });

  it("n'appelle jamais Stripe quand la préautorisation de retrait est refusée", async () => {
    mocks.erreurPreautorisation = "AAL2 requis";
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/REDIRECT:\/plateforme\?error=/);
    expect(stripe.retirerCouponAbonnement).not.toHaveBeenCalled();
  });

  it("restaure la remise Stripe précédente si le retrait local échoue, et confirme la restauration par lecture réelle", async () => {
    mocks.erreurMutation = "Écriture locale refusée";
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/Synchronisation%20Stripe/);
    expect(stripe.appliquerCouponAbonnement).toHaveBeenCalledWith("sub_test", "coupon_test", expect.stringMatching(/:compensate$/));
    expect(stripe.recupererAbonnementStripe).toHaveBeenCalledWith("sub_test");
    expect(registre._tentatives.at(-1)?.etat).toBe("compensee");
  });

  it("rien à compenser côté Stripe quand il n'y avait pas de coupon actif avant le retrait", async () => {
    mocks.preautorisation = { entreprise_id: "entreprise-1", entreprise_nom: "Entreprise Test", stripe_subscription_id: "sub_test", remise_stripe_coupon_id: null };
    mocks.erreurMutation = "Écriture locale refusée";
    await expect(retirerRemiseAction("entreprise-1")).rejects.toThrow(/Synchronisation%20Stripe/);
    expect(stripe.retirerCouponAbonnement).not.toHaveBeenCalled();
    expect(stripe.appliquerCouponAbonnement).not.toHaveBeenCalled();
    expect(registre._tentatives.at(-1)?.etat).toBe("compensee");
  });
});
