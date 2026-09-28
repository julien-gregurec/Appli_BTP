import type { Metadata } from "next";
import { RelevePlanWorkspace } from "@/components/releve/plan/RelevePlanWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Plan 2D",
  description: "Plan 2D d'un étage relevé : murs, ouvertures, pièces, cotes et photos.",
  path: "/releves/plan",
  index: false,
});

// Route statique (export natif Capacitor) : relevé, étage et portée arrivent en paramètres `?id=&etage=&zone=&piece=&plan=`, lus côté client.
export default function RelevePlanPage() { return <RelevePlanWorkspace />; }
