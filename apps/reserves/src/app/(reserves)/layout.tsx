import type { ReactNode } from "react";
import { Coquille } from "@/components/Coquille";
import { exigerShellReserves } from "@/lib/acces-reserves";

export default async function LayoutReserves({ children }: { children: ReactNode }) {
  const contexte = await exigerShellReserves();
  return <Coquille contexte={contexte}>{children}</Coquille>;
}
