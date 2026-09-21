import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { exigerShellColors } from "@/lib/acces-colors";
import { lireBandeauAssistance } from "@/lib/assistance";

export default async function ColorsLayout({ children }: { children: ReactNode }) {
  const contexte = await exigerShellColors();
  // Le bandeau ne doit jamais empêcher l'application de s'afficher : une indisponibilité
  // du contrat se traduit par l'absence de bandeau, pas par une coquille en erreur.
  const bandeauAssistance = await lireBandeauAssistance().catch(() => null);
  return (
    <Shell contexte={contexte} bandeauAssistance={bandeauAssistance}>
      {children}
    </Shell>
  );
}
