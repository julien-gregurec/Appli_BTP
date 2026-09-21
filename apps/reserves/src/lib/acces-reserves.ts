import "server-only";
import { redirect } from "next/navigation";
import { getContexteReserves, type ContexteReserves } from "@/lib/contexte";
import { createClient } from "@/lib/supabase/server";
import {
  exigerAccesApplication,
  listerApplicationsAutorisees,
  verifierAccesApplication,
} from "@/lib/applications-elsatia";
import {
  estRoleReserves,
  ROLE_ADMIN_PLATEFORME,
  type RoleApplicationReserves,
} from "@elsatia/application-access";

export {
  estCompteIntervenant,
  peutEmettre,
  peutValiderLevee,
  peutGererChantiers,
  peutInviterEntreprise,
} from "@/lib/acces-reserves-policy";

export const CODE_APPLICATION_RESERVES = "reserves" as const;

export type DecisionAccesReserves = "autorise" | "abonnement_requis" | "habilitation_requise";

export async function resoudreRoleReserves(
  contexte: ContexteReserves,
): Promise<RoleApplicationReserves> {
  const application = (await listerApplicationsAutorisees(contexte))
    .find((item) => item.applicationCode === CODE_APPLICATION_RESERVES);
  if (!application) throw new Error("Rôle Réserves indisponible pour une session autorisée");
  if (contexte.estAdminPlateforme && application.roleCode === ROLE_ADMIN_PLATEFORME) {
    return ROLE_ADMIN_PLATEFORME;
  }
  if (!estRoleReserves(application.roleCode)) {
    throw new Error("Rôle Réserves non reconnu par le contrat canonique");
  }
  return application.roleCode;
}

export async function determinerAccesReserves(
  contexte: ContexteReserves,
): Promise<DecisionAccesReserves> {
  if (await verifierAccesApplication(contexte, CODE_APPLICATION_RESERVES)) return "autorise";
  if (!contexte.entrepriseId) return "habilitation_requise";

  // Ce diagnostic explique le refus à l'utilisateur ; il ne peut jamais l'autoriser.
  const supabase = await createClient();
  const { data } = await supabase
    .from("acces_applications_entreprises")
    .select("autorise, valide_du, valide_jusqu_au")
    .eq("entreprise_id", contexte.entrepriseId)
    .eq("application_code", CODE_APPLICATION_RESERVES)
    .maybeSingle();

  const maintenant = Date.now();
  const organisationAutorisee = data?.autorise === true
    && (!data.valide_du || new Date(data.valide_du).getTime() <= maintenant)
    && (!data.valide_jusqu_au || new Date(data.valide_jusqu_au).getTime() > maintenant);

  return organisationAutorisee ? "habilitation_requise" : "abonnement_requis";
}

export async function exigerShellReserves(): Promise<ContexteReserves> {
  const contexte = await getContexteReserves();
  const decision = await determinerAccesReserves(contexte);
  if (decision === "abonnement_requis") redirect("/abonnement-requis");
  if (decision === "habilitation_requise") redirect("/acces-refuse");

  // Garde-fou explicite au plus près de la route protégée : même si la décision
  // ci-dessus était contournée, l'accès applicatif est revérifié.
  await exigerAccesApplication(contexte, CODE_APPLICATION_RESERVES);
  return { ...contexte, roleReserves: await resoudreRoleReserves(contexte) };
}
