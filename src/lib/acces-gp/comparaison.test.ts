import { describe, expect, it } from "vitest";
import type { DecisionAccesClient } from "@elsatia/application-access";
import {
  CHEMINS_EXEMPTES,
  CHEMINS_MACHINE,
  comparerDecisionsGp,
  decisionGpActuelle,
  motifExemption,
  type ContexteExemption,
  type DecisionObservee,
  type EtatDecisionGp,
} from "./comparaison";

const ENT = "e0000000-0000-4000-8000-000000000001";
const eligible: ContexteExemption = { chemin: "/devis", publique: false, entrepriseId: ENT, compteDepot: false, accesSupport: false };
const gpPosteOk: EtatDecisionGp = { droitRequis: "acces_devis", droitAcces: true };
const gpPosteKo: EtatDecisionGp = { droitRequis: "acces_devis", droitAcces: false };
const decision = (d: DecisionAccesClient, roleCode: string | null = null): DecisionObservee => ({ decision: d, roleCode });

describe("decisionGpActuelle — reproduit la garde du proxy", () => {
  it.each<[string, EtatDecisionGp, boolean, string]>([
    ["chemin non gardé : tout membre passe", { droitRequis: null, droitAcces: false }, true, "chemin_sans_garde"],
    ["droit de poste accordé", gpPosteOk, true, "droit_poste_ok"],
    ["droit de poste refusé", gpPosteKo, false, "droit_poste_refuse"],
    ["droit absent (undefined) = refus, jamais accord", { droitRequis: "acces_devis" }, false, "droit_poste_refuse"],
    ["module non inclus prime sur le droit de poste", { droitRequis: "acces_devis", droitAcces: true, moduleInclus: false }, false, "module_non_inclus"],
    ["module inclus + droit ok", { droitRequis: "acces_devis", droitAcces: true, moduleInclus: true }, true, "droit_poste_ok"],
    ["module non évalué (null) n'est pas un refus", { droitRequis: "acces_devis", droitAcces: true, moduleInclus: null }, true, "droit_poste_ok"],
    ["abonnement suspendu : GP refuse côté serveur", { droitRequis: "acces_devis", droitAcces: true, abonnementStatut: "suspendu" }, false, "abonnement_bloque"],
    ["abonnement annulé", { droitRequis: null, abonnementStatut: "annule" }, false, "abonnement_bloque"],
    ["abonnement en essai ou actif : rien à signaler", { droitRequis: "acces_devis", droitAcces: true, abonnementStatut: "essai" }, true, "droit_poste_ok"],
  ])("%s", (_nom, etat, autorise, cause) => {
    expect(decisionGpActuelle(etat)).toEqual({ autorise, cause });
  });
});

describe("motifExemption — mêmes exemptions que le futur enforcement", () => {
  it("requête éligible : aucune exemption", () => {
    expect(motifExemption(eligible)).toBeNull();
  });
  it.each<[string, ContexteExemption, string]>([
    ["chemin public (isPublic)", { ...eligible, chemin: "/tarifs", publique: true }, "chemin_public"],
    ["sans entreprise", { ...eligible, entrepriseId: null }, "sans_entreprise"],
    ["entreprise absente (undefined)", { ...eligible, entrepriseId: undefined }, "sans_entreprise"],
    ["compte dépôt", { ...eligible, compteDepot: true }, "compte_depot"],
    ["session d'assistance", { ...eligible, accesSupport: true }, "session_assistance"],
  ])("%s", (_nom, ctx, motif) => {
    expect(motifExemption(ctx)).toBe(motif);
  });

  it.each([...CHEMINS_MACHINE])("chemin machine %s (et ses sous-chemins)", (chemin) => {
    expect(motifExemption({ ...eligible, chemin })).toBe("chemin_machine");
    expect(motifExemption({ ...eligible, chemin: chemin + "/x" })).toBe("chemin_machine");
  });
  it.each([...CHEMINS_EXEMPTES])("chemin exempté %s (et ses sous-chemins)", (chemin) => {
    expect(motifExemption({ ...eligible, chemin })).toBe("chemin_exempte");
    expect(motifExemption({ ...eligible, chemin: chemin + "/sous/chemin" })).toBe("chemin_exempte");
  });
  it("liste exigée par la mission : Stripe, crons, paie/import, Powens, portail, partage, Tools, onboarding, plateforme, sortie d'essai", () => {
    const tout = [...CHEMINS_MACHINE, ...CHEMINS_EXEMPTES] as string[];
    for (const attendu of [
      "/api/stripe/webhook", "/api/cron/abonnements", "/api/paie/import", "/api/paiements-bancaires/powens",
      "/document", "/imprimer/partage", "/api/tools/monetization", "/onboarding", "/plateforme",
      "/abonnement", "/parametres/donnees", "/api/rgpd/export", "/en-attente", "/aide",
    ]) expect(tout).toContain(attendu);
  });
  it("un préfixe de chaîne n'est pas un sous-chemin (/documents-clients n'est pas /document)", () => {
    expect(motifExemption({ ...eligible, chemin: "/documents-clients" })).toBeNull();
    expect(motifExemption({ ...eligible, chemin: "/aide-memoire" })).toBeNull();
    expect(motifExemption({ ...eligible, chemin: "/plateformes" })).toBeNull();
  });
  it("priorité : public > machine > exempté > sans entreprise > dépôt > assistance", () => {
    expect(motifExemption({ chemin: "/onboarding", publique: true, entrepriseId: null, compteDepot: true, accesSupport: true })).toBe("chemin_public");
    expect(motifExemption({ chemin: "/onboarding", entrepriseId: null, compteDepot: true, accesSupport: true })).toBe("chemin_exempte");
    expect(motifExemption({ chemin: "/devis", entrepriseId: null, compteDepot: true, accesSupport: true })).toBe("sans_entreprise");
    expect(motifExemption({ chemin: "/devis", entrepriseId: ENT, compteDepot: true, accesSupport: true })).toBe("compte_depot");
  });
});

describe("comparerDecisionsGp — table d'états", () => {
  const cas: Array<[string, EtatDecisionGp, DecisionObservee, string, string]> = [
    // [nom, gp, décision, type attendu, motif décision]
    ["poste OK, aucune habilitation (cas prouvé)", gpPosteOk, decision("sans_habilitation"), "gp_autorise_decision_refuse", "sans_habilitation"],
    ["poste OK, organisation sans droit d'usage", gpPosteOk, decision("application_non_incluse"), "gp_autorise_decision_refuse", "application_non_incluse"],
    ["poste OK, habilitation inopérante", gpPosteOk, decision("sans_role"), "gp_autorise_decision_refuse", "sans_role"],
    ["poste OK, suspension plateforme", gpPosteOk, decision("suspension_plateforme"), "gp_autorise_decision_refuse", "suspension_plateforme"],
    ["poste OK, membre désactivé côté décision", gpPosteOk, decision("utilisateur_desactive"), "gp_autorise_decision_refuse", "utilisateur_desactive"],
    ["poste OK + habilitation", gpPosteOk, decision("autorise", "gestion_pro_utilisateur"), "concordant_autorise", "autorise"],
    ["poste KO, aucune habilitation", gpPosteKo, decision("sans_habilitation"), "concordant_refuse", "sans_habilitation"],
    ["poste KO mais habilitation OK", gpPosteKo, decision("autorise", "gestion_pro_admin"), "gp_refuse_decision_autorise", "autorise"],
    ["module non inclus, décision autorise", { ...gpPosteOk, moduleInclus: false }, decision("autorise", "gestion_pro_utilisateur"), "gp_refuse_decision_autorise", "autorise"],
    ["abonnement suspendu des deux côtés", { ...gpPosteOk, abonnementStatut: "suspendu" }, decision("abonnement_suspendu"), "concordant_refuse", "abonnement_suspendu"],
    ["chemin non gardé + habilitation", { droitRequis: null }, decision("autorise", "gestion_pro_utilisateur"), "concordant_autorise", "autorise"],
    ["chemin non gardé + sans habilitation", { droitRequis: null }, decision("sans_habilitation"), "gp_autorise_decision_refuse", "sans_habilitation"],
    ["RPC muette (null)", gpPosteOk, null, "decision_indisponible", "indisponible"],
    ["décision indisponible (client)", gpPosteOk, decision("indisponible"), "decision_indisponible", "indisponible"],
    ["non_authentifie alors que le proxy a validé la session", gpPosteOk, decision("non_authentifie"), "decision_indisponible", "non_authentifie"],
    ["erreur_configuration n'est pas un refus", gpPosteKo, decision("erreur_configuration"), "decision_indisponible", "erreur_configuration"],
  ];

  it.each(cas)("%s", (_nom, gp, d, type, motif) => {
    const r = comparerDecisionsGp({ mode: "observe", exemption: eligible, gp, decision: d });
    expect(r.observer).toBe(true);
    if (!r.observer) return;
    expect(r.type).toBe(type);
    expect(r.motifDecision).toBe(motif);
  });

  it("gravité : seul « GP autorise, décision refuse » est bloquant à l'enforcement", () => {
    const g = (gp: EtatDecisionGp, d: DecisionObservee) => {
      const r = comparerDecisionsGp({ mode: "observe", exemption: eligible, gp, decision: d });
      return r.observer ? r.gravite : "exempte";
    };
    expect(g(gpPosteOk, decision("sans_habilitation"))).toBe("bloquant_si_enforcement");
    expect(g(gpPosteKo, decision("autorise"))).toBe("permissif");
    expect(g(gpPosteOk, decision("autorise"))).toBe("info");
    expect(g(gpPosteOk, null)).toBe("info");
  });

  it("le bypass administrateur plateforme est hors périmètre", () => {
    const r = comparerDecisionsGp({ mode: "observe", exemption: eligible, gp: gpPosteKo, decision: decision("autorise", "administrateur_plateforme_global") });
    expect(r).toEqual({ observer: false, raison: "admin_plateforme" });
  });

  it("mode off : aucune comparaison, même sur un écart flagrant", () => {
    const r = comparerDecisionsGp({ mode: "off", exemption: eligible, gp: gpPosteOk, decision: decision("sans_habilitation") });
    expect(r).toEqual({ observer: false, raison: "mode_off" });
  });

  it.each<[string, ContexteExemption, string]>([
    ["public", { ...eligible, publique: true }, "chemin_public"],
    ["webhook", { ...eligible, chemin: "/api/stripe/webhook" }, "chemin_machine"],
    ["onboarding", { ...eligible, chemin: "/onboarding" }, "chemin_exempte"],
    ["plateforme", { ...eligible, chemin: "/plateforme/entreprises" }, "chemin_exempte"],
    ["compte dépôt", { ...eligible, compteDepot: true }, "compte_depot"],
    ["assistance", { ...eligible, accesSupport: true }, "session_assistance"],
    ["sans entreprise", { ...eligible, entrepriseId: null }, "sans_entreprise"],
  ])("exemption %s : rien n'est observé même si la décision refuse", (_nom, exemption, raison) => {
    expect(comparerDecisionsGp({ mode: "observe", exemption, gp: gpPosteOk, decision: decision("sans_habilitation") })).toEqual({
      observer: false,
      raison,
    });
  });

  it("table complète : chaque mode × exemption × état produit un résultat déterministe et jamais d'exception", () => {
    const modes = ["off", "observe"] as const;
    const exemptions: ContexteExemption[] = [
      eligible, { ...eligible, publique: true }, { ...eligible, compteDepot: true }, { ...eligible, accesSupport: true },
      { ...eligible, entrepriseId: null }, { ...eligible, chemin: "/onboarding" },
    ];
    const gps = [gpPosteOk, gpPosteKo, { droitRequis: null }, { ...gpPosteOk, moduleInclus: false }];
    const decisions: DecisionObservee[] = [null, decision("autorise", "gestion_pro_admin"), decision("sans_habilitation"), decision("indisponible")];
    let n = 0;
    for (const mode of modes) for (const exemption of exemptions) for (const gp of gps) for (const d of decisions) {
      const a = comparerDecisionsGp({ mode, exemption, gp, decision: d });
      const b = comparerDecisionsGp({ mode, exemption, gp, decision: d });
      expect(a).toEqual(b);
      if (mode === "off") expect(a).toEqual({ observer: false, raison: "mode_off" });
      n++;
    }
    expect(n).toBe(2 * 6 * 4 * 4);
  });
});
