import "server-only";

import {
  creerControleAccesApplications,
  type ApplicationElsatiaAutorisee,
  type ClientAccesApplications,
} from "@elsatia/application-access";
import { createClient } from "@/lib/supabase/server";
import { construireSelecteurApplications, urlApplication, type ApplicationCatalogue } from "@/lib/multi-app";

const controle = creerControleAccesApplications(async () => (
  await createClient() as unknown as ClientAccesApplications
));

export async function estAdministrateurPlateformeMultiApp(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("est_plateforme_admin");
  return !error && data === true;
}

export type ApplicationPlateforme = ApplicationCatalogue & {
  entreprisesAutorisees: number;
  utilisateursHabilites: number;
};

export type AccesEntrepriseApplication = {
  application_code: string;
  autorise: boolean;
  valide_du: string | null;
  valide_jusqu_au: string | null;
  source: string | null;
};

export type HabilitationApplication = {
  utilisateur_id: string;
  application_code: string;
  role_code: string;
  autorise: boolean;
  valide_du: string | null;
  valide_jusqu_au: string | null;
};

export type RoleApplication = {
  application_code: string;
  code: string;
  nom: string;
  actif: boolean;
  ordre: number;
};

export type UtilisateurEntreprise = {
  id: string;
  nom: string | null;
  prenom: string | null;
  statut: string;
};

export type EntreeHistoriqueApplication = {
  id: string;
  cible_type: "entreprise" | "utilisateur";
  cible_id: string;
  application_code: string;
  action: string;
  auteur_email: string | null;
  created_at: string;
};

type LectureEntrepriseMembre = {
  entreprise_id: string;
  entreprise_nom: string;
  entreprise_reference: string | null;
  utilisateur_id: string | null;
  utilisateur_nom: string | null;
  utilisateur_prenom: string | null;
  membre_statut: string | null;
  application_code: string | null;
  role_code: string | null;
  habilitation_autorise: boolean | null;
  habilitation_valide_du: string | null;
  habilitation_valide_jusqu_au: string | null;
};

export async function listerApplicationsPourSwitcher(entrepriseId: string) {
  const autorisees = await controle.listerApplicationsAutorisees({ entrepriseId });
  return construireSelecteurApplications(autorisees, "gestion_pro");
}

/**
 * URL de base d'ELSATIA Réserves pour l'utilisateur courant, depuis le catalogue (jamais en
 * dur). `null` si l'application ne lui est pas ouverte ou n'a pas d'URL dans cet environnement.
 */
export async function urlReservesPourUtilisateur(entrepriseId: string): Promise<string | null> {
  try {
    const autorisees = await controle.listerApplicationsAutorisees({ entrepriseId });
    const reserves = autorisees.find((application) => application.applicationCode === "reserves");
    return reserves ? urlApplication(reserves) : null;
  } catch {
    return null;
  }
}

export async function chargerCatalogueApplications(): Promise<ApplicationPlateforme[]> {
  const supabase = await createClient();
  // Compteurs calculés en base (plateforme_applications_compteurs) : les deux
  // tables lues en entier ici étaient plafonnées à 1 000 lignes par PostgREST.
  const [{ data: applications, error }, { data: compteurs, error: erreurCompteurs }] = await Promise.all([
    supabase.from("applications_elsatia").select("code,nom,description,actif,ordre,url_locale,url_preview,url_production,icone,statut_produit").order("ordre"),
    supabase.rpc("plateforme_applications_compteurs"),
  ]);
  if (error) throw new Error("Catalogue d’applications indisponible");
  if (erreurCompteurs) throw new Error("Compteurs d’applications indisponibles");
  const parCode = (compteurs ?? {}) as Record<string, { entreprises: number; utilisateurs: number }>;

  return ((applications ?? []) as ApplicationCatalogue[]).map((application) => ({
    ...application,
    entreprisesAutorisees: Number(parCode[application.code]?.entreprises ?? 0),
    utilisateursHabilites: Number(parCode[application.code]?.utilisateurs ?? 0),
  }));
}

export async function chargerHistoriqueApplications(limite = 50): Promise<EntreeHistoriqueApplication[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("historique_acces_applications")
    .select("id,cible_type,cible_id,application_code,action,auteur_email,created_at")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error("Historique des accès indisponible");
  return (data ?? []) as EntreeHistoriqueApplication[];
}

export async function chargerEntrepriseMultiApp(entrepriseId: string) {
  const supabase = await createClient();
  const [lectureResult, applicationsResult, accesResult, rolesResult] = await Promise.all([
    supabase.rpc("plateforme_lire_entreprise_membres", { p_entreprise_id: entrepriseId }),
    supabase.from("applications_elsatia").select("code,nom,description,actif,ordre,url_locale,url_preview,url_production,icone,statut_produit").order("ordre"),
    supabase.from("acces_applications_entreprises").select("application_code,autorise,valide_du,valide_jusqu_au,source").eq("entreprise_id", entrepriseId),
    supabase.from("roles_applications_elsatia").select("application_code,code,nom,actif,ordre").order("ordre"),
  ]);
  if (lectureResult.error || applicationsResult.error || accesResult.error || rolesResult.error) {
    throw new Error("Administration multi-app indisponible");
  }
  const lecture = (lectureResult.data ?? []) as LectureEntrepriseMembre[];
  if (!lecture.length) return null;

  const utilisateursParId = new Map<string, UtilisateurEntreprise>();
  for (const ligne of lecture) {
    if (!ligne.utilisateur_id || !ligne.membre_statut) continue;
    utilisateursParId.set(ligne.utilisateur_id, {
      id: ligne.utilisateur_id,
      nom: ligne.utilisateur_nom,
      prenom: ligne.utilisateur_prenom,
      statut: ligne.membre_statut,
    });
  }
  const habilitations: HabilitationApplication[] = lecture.flatMap((ligne) => (
    ligne.utilisateur_id && ligne.application_code && ligne.role_code
      ? [{
          utilisateur_id: ligne.utilisateur_id,
          application_code: ligne.application_code,
          role_code: ligne.role_code,
          autorise: ligne.habilitation_autorise === true,
          valide_du: ligne.habilitation_valide_du,
          valide_jusqu_au: ligne.habilitation_valide_jusqu_au,
        }]
      : []
  ));
  const premiereLigne = lecture[0];

  return {
    entreprise: {
      id: premiereLigne.entreprise_id,
      nom: premiereLigne.entreprise_nom,
      reference_interne: premiereLigne.entreprise_reference,
    },
    applications: (applicationsResult.data ?? []) as ApplicationCatalogue[],
    acces: (accesResult.data ?? []) as AccesEntrepriseApplication[],
    habilitations,
    utilisateurs: [...utilisateursParId.values()],
    roles: (rolesResult.data ?? []) as RoleApplication[],
  };
}

export type { ApplicationElsatiaAutorisee };
