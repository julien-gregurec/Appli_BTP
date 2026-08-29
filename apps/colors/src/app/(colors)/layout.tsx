import type { ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { exigerShellColors } from "@/lib/acces-colors";

export default async function ColorsLayout({ children }: { children: ReactNode }) {
  const contexte = await exigerShellColors();
  return <Shell contexte={contexte}>{children}</Shell>;
}
