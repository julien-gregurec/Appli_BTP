import { listerApplicationsAutorisees } from "@/lib/applications-elsatia";
import { construireSelecteurApplications } from "@/lib/selecteur-applications";
import type { ContexteColors } from "@/lib/contexte";
import { urlApplication } from "@/lib/routes-applications";
import { ApplicationSwitcherMenu } from "@/components/ApplicationSwitcherMenu";

export async function ApplicationSwitcher({ contexte }: { contexte: ContexteColors }) {
  const autorisees = await listerApplicationsAutorisees(contexte);
  const applications = construireSelecteurApplications(
    autorisees,
    urlApplication,
    "colors",
  );

  return <ApplicationSwitcherMenu applications={applications} />;
}
