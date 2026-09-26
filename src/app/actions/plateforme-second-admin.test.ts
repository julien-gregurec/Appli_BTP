/**
 * ELSATIA-GP-PLATFORM-SECOND-ADMIN-OPERABILITY-P1-V1
 *
 * Ces tests couvrent la couche de câblage : ce que l'écran envoie aux RPC et ce qu'il
 * renvoie à l'opérateur. Les décisions d'autorisation elles-mêmes (rôle `total`, AAL2,
 * cloisonnement, MFA de la cible, verrou du dernier administrateur) appartiennent à la
 * base et sont déjà prouvées par les tests pgTAP `platform_aal2_role_integrity_v1` et
 * `platform_support_uid_security_v1`. On vérifie donc ici que le câblage n'ajoute aucune
 * décision propre, ne masque aucun refus et ne rend jamais l'identifiant d'un compte.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  rpc: vi.fn(),
  estPlateformeAdmin: vi.fn(async () => true),
  emailLoginDesactive: false,
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => mocks.emailLoginDesactive }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc: mocks.rpc })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import {
  activerAdminPlateformeAction,
  detacherAdminPlateformeAction,
  rattacherAdminPlateformeAction,
} from "./plateforme";

const UID_CIBLE = "ee900000-0000-4000-8000-000000000005";

function destination(erreur: unknown) {
  return String((erreur as Error).message).replace("REDIRECT:", "");
}

async function attendreRedirection(promesse: Promise<unknown>) {
  return await promesse.then(
    () => {
      throw new Error("aucune redirection");
    },
    (erreur: unknown) => decodeURIComponent(destination(erreur)),
  );
}

function formulaireRattachement(email = "second@elsatia.invalid", utilisateurId = UID_CIBLE) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("utilisateur_id", utilisateurId);
  return formData;
}

function formulaireEmail(email = "second@elsatia.invalid") {
  const formData = new FormData();
  formData.set("email", email);
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.emailLoginDesactive = false;
  mocks.estPlateformeAdmin.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("rattachement d'un second administrateur plateforme", () => {
  it("transmet l'email normalisé et l'identifiant de compte à la RPC dédiée", async () => {
    const cible = await attendreRedirection(
      rattacherAdminPlateformeAction(formulaireRattachement("  Second@ELSATIA.invalid  ")),
    );

    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_rattacher_admin", {
      p_email: "second@elsatia.invalid",
      p_utilisateur_id: UID_CIBLE,
    });
    expect(cible).toContain("succes=");
    expect(cible).toContain("reste sans droit");
    // Le rattachement ne confère rien : l'écran ne doit jamais annoncer une activation.
    expect(cible).not.toContain("actif");
  });

  it("ne renvoie jamais l'identifiant du compte dans l'URL de retour", async () => {
    const cible = await attendreRedirection(rattacherAdminPlateformeAction(formulaireRattachement()));
    expect(cible).not.toContain(UID_CIBLE);
  });

  it("refuse un identifiant de compte qui n'est pas un UUID, sans appeler la base", async () => {
    const cible = await attendreRedirection(
      rattacherAdminPlateformeAction(formulaireRattachement("second@elsatia.invalid", "compte-du-collaborateur")),
    );

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(cible).toContain("Identifiant du compte Supabase invalide");
  });

  it("refuse un email sans arobase, sans appeler la base", async () => {
    const cible = await attendreRedirection(
      rattacherAdminPlateformeAction(formulaireRattachement("second-elsatia.invalid")),
    );

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(cible).toContain("Email invalide");
  });
});

describe("activation et détachement", () => {
  it("active une identité déjà rattachée", async () => {
    const cible = await attendreRedirection(activerAdminPlateformeAction(formulaireEmail()));

    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_activer_admin", { p_email: "second@elsatia.invalid" });
    expect(cible).toContain("administrateur plateforme actif");
  });

  it("détache le compte d'une identité révoquée", async () => {
    const cible = await attendreRedirection(detacherAdminPlateformeAction(formulaireEmail()));

    expect(mocks.rpc).toHaveBeenCalledWith("plateforme_detacher_admin_revoque", { p_email: "second@elsatia.invalid" });
    expect(cible).toContain("détaché");
  });

  it("refuse un email manquant, sans appeler la base", async () => {
    const cible = await attendreRedirection(activerAdminPlateformeAction(new FormData()));

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(cible).toContain("Email manquant");
  });
});

describe("gardes d'accès du câblage", () => {
  it.each([
    ["rattachement", () => rattacherAdminPlateformeAction(formulaireRattachement())],
    ["activation", () => activerAdminPlateformeAction(formulaireEmail())],
    ["détachement", () => detacherAdminPlateformeAction(formulaireEmail())],
  ])("%s : un compte non administrateur est renvoyé sans toucher à la base", async (_libelle, appel) => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);

    const cible = await attendreRedirection(appel());

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(cible).toBe("/dashboard");
  });

  it.each([
    ["rattachement", () => rattacherAdminPlateformeAction(formulaireRattachement())],
    ["activation", () => activerAdminPlateformeAction(formulaireEmail())],
    ["détachement", () => detacherAdminPlateformeAction(formulaireEmail())],
  ])("%s : le mode démonstration ferme la surface sans appeler la base", async (_libelle, appel) => {
    mocks.emailLoginDesactive = true;

    const cible = await attendreRedirection(appel());

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(cible).toContain("désactivée en mode démonstration");
  });
});

/**
 * La base est la seule autorité : le câblage doit remonter son refus tel quel, sans le
 * traduire, l'atténuer ni le transformer en succès. Chaque message ci-dessous est celui
 * que lèvent réellement `plateforme_rattacher_admin` / `plateforme_activer_admin`
 * (migration 20260826000237).
 */
describe("refus remontés depuis la base", () => {
  it.each([
    ["session AAL1", "Authentification forte AAL2 requise"],
    ["rôle non total", "Rôle plateforme insuffisant"],
    ["compte Auth absent", "Compte Auth absent, différent ou email non vérifié"],
    ["identité déjà rattachée ou inconnue", "Identité administrateur absente ou état incompatible"],
    ["auto-rattachement", "Auto-rattachement interdit"],
  ])("rattachement refusé — %s", async (_cas, message) => {
    mocks.rpc.mockResolvedValue({ error: { message } });

    const cible = await attendreRedirection(rattacherAdminPlateformeAction(formulaireRattachement()));

    expect(cible).toContain("error=");
    expect(cible).toContain(message);
    expect(cible).not.toContain("succes=");
  });

  it.each([
    ["session AAL1", "Authentification forte AAL2 requise"],
    ["rôle non total", "Rôle plateforme insuffisant"],
    ["identité non rattachée", "Identité non rattachée"],
    ["MFA de la cible absent", "MFA du compte cible requis"],
    ["auto-activation", "Auto-activation interdite"],
  ])("activation refusée — %s", async (_cas, message) => {
    mocks.rpc.mockResolvedValue({ error: { message } });

    const cible = await attendreRedirection(activerAdminPlateformeAction(formulaireEmail()));

    expect(cible).toContain("error=");
    expect(cible).toContain(message);
    expect(cible).not.toContain("succes=");
  });

  it("détachement refusé tant qu'une session support reste ouverte", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Une session support est encore active" } });

    const cible = await attendreRedirection(detacherAdminPlateformeAction(formulaireEmail()));

    expect(cible).toContain("Une session support est encore active");
    expect(cible).not.toContain("succes=");
  });
});
