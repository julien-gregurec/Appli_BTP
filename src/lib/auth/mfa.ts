import type { Factor } from "@supabase/supabase-js";

export type EtatAal = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export type DecisionGardeMfa = "autoriser" | "challenge" | "enroler" | "refuser";

export function facteursTotp(facteurs: Factor[]) {
  return facteurs.filter((facteur) => facteur.factor_type === "totp");
}

export function facteursTotpVerifies(facteurs: Factor[]) {
  return facteursTotp(facteurs).filter((facteur) => facteur.status === "verified");
}

export function facteurTotpPourChallenge(facteurs: Factor[], facteurId?: string | null) {
  const verifies = facteursTotpVerifies(facteurs);
  return verifies.find((facteur) => facteur.id === facteurId) ?? verifies[0] ?? null;
}

export function decisionGardeMfa(etat: EtatAal | null, erreur = false): DecisionGardeMfa {
  if (erreur || !etat?.currentLevel || !etat.nextLevel) return "refuser";
  if (etat.currentLevel === "aal2") return "autoriser";
  if (etat.currentLevel === "aal1" && etat.nextLevel === "aal2") return "challenge";
  if (etat.currentLevel === "aal1" && etat.nextLevel === "aal1") return "enroler";
  return "refuser";
}

export function peutSupprimerFacteur(params: {
  facteur: Factor;
  facteurs: Factor[];
  aalActuel: string | null;
  rolePlateforme: string | null;
  nombreAdminsTotalActifs: number | null;
}) {
  const { facteur, facteurs, aalActuel, rolePlateforme, nombreAdminsTotalActifs } = params;
  if (facteur.status === "unverified") return { autorise: true, raison: null };
  if (aalActuel !== "aal2") return { autorise: false, raison: "Un challenge MFA AAL2 est requis avant la désactivation." };

  const verifiesRestants = facteursTotpVerifies(facteurs).filter((item) => item.id !== facteur.id);
  if (rolePlateforme === "total" && verifiesRestants.length === 0 && (nombreAdminsTotalActifs ?? 0) <= 1) {
    return {
      autorise: false,
      raison: "Le seul administrateur total ne peut pas retirer son dernier facteur vérifié.",
    };
  }
  return { autorise: true, raison: null };
}

export function codeTotpValide(code: string) {
  return /^\d{6}$/.test(code.trim());
}

export async function avecDelai<T>(operation: Promise<T>, delaiMs = 10_000): Promise<T> {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error("MFA_TIMEOUT")), delaiMs);
      }),
    ]);
  } finally {
    if (minuteur) clearTimeout(minuteur);
  }
}
