import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getContexteColors, type ContexteColors } from "@/lib/contexte";
import { createClient } from "@/lib/supabase/server";
import {
  AccesApplicationRefuseError,
  exigerAccesApplication,
  listerApplicationsAutorisees,
  verifierAccesApplication,
} from "@/lib/applications-elsatia";
import {
  estRoleColors,
  ROLE_ADMIN_PLATEFORME,
  type RoleApplicationColors,
} from "@elsatia/application-access";

export const CODE_APPLICATION_COLORS = "colors" as const;

export type DecisionAccesColors = "autorise" | "abonnement_requis" | "habilitation_requise";

export async function resoudreRoleColors(contexte: ContexteColors): Promise<RoleApplicationColors> {
  const application = (await listerApplicationsAutorisees(contexte))
    .find((item) => item.applicationCode === CODE_APPLICATION_COLORS);
  if (!application) throw new Error("Rôle Colors indisponible pour une session autorisée");
  if (contexte.estAdminPlateforme && application.roleCode === ROLE_ADMIN_PLATEFORME) {
    return ROLE_ADMIN_PLATEFORME;
  }
  if (!estRoleColors(application.roleCode)) throw new Error("Rôle Colors non reconnu par le contrat canonique");
  return application.roleCode;
}

export async function determinerAccesColors(
  contexte: ContexteColors,
): Promise<DecisionAccesColors> {
  if (await verifierAccesApplication(contexte, CODE_APPLICATION_COLORS)) return "autorise";
  if (!contexte.entrepriseId) return "habilitation_requise";

  // Ce diagnostic explique le refus mais ne peut jamais autoriser l’accès.
  const supabase = await createClient();
  const { data } = await supabase
    .from("acces_applications_entreprises")
    .select("autorise, valide_du, valide_jusqu_au")
    .eq("entreprise_id", contexte.entrepriseId)
    .eq("application_code", CODE_APPLICATION_COLORS)
    .maybeSingle();

  const maintenant = Date.now();
  const organisationAutorisee = data?.autorise === true
    && (!data.valide_du || new Date(data.valide_du).getTime() <= maintenant)
    && (!data.valide_jusqu_au || new Date(data.valide_jusqu_au).getTime() > maintenant);

  return organisationAutorisee ? "habilitation_requise" : "abonnement_requis";
}

export async function exigerShellColors(): Promise<ContexteColors> {
  const contexte = await getContexteColors();
  const decision = await determinerAccesColors(contexte);
  if (decision === "abonnement_requis") redirect("/abonnement-requis");
  if (decision === "habilitation_requise") redirect("/acces-refuse");

  // Garde-fou explicite au plus près de la route protégée.
  await exigerAccesApplication(contexte, CODE_APPLICATION_COLORS);
  return { ...contexte, roleColors: await resoudreRoleColors(contexte) };
}

export async function protegerRouteColors(contexte: ContexteColors): Promise<void> {
  await exigerAccesApplication(contexte, CODE_APPLICATION_COLORS);
}

/**
 * Garde d'accès des routes API Colors.
 *
 * Rend une réponse 403 quand l'accès à l'application est refusé (suspension, entitlement
 * échu ou absent, habilitation retirée), `null` sinon. Sans elle, l'erreur remontait non
 * interceptée : la route restait fermée, mais répondait 500 et journalisait un refus
 * d'accès ordinaire comme une panne serveur.
 */
export async function refusAccesRouteApi(contexte: ContexteColors): Promise<NextResponse | null> {
  try {
    await exigerAccesApplication(contexte, CODE_APPLICATION_COLORS);
    return null;
  } catch (error) {
    if (error instanceof AccesApplicationRefuseError) {
      return NextResponse.json({ erreur: "Accès Colors refusé" }, { status: 403 });
    }
    throw error;
  }
}
