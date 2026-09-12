import { NextResponse } from "next/server";
import { getContexteEntreprise } from "@/lib/entreprise";
import { genererPdfDepuisUrl } from "@/lib/pdf/generer";
import { planningV2Actif } from "@/lib/planning/v2-serveur";
import { parametresPlanning } from "@/app/(app)/planning/PlanningV2Page";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * PDF du planning v2 : Chromium imprime /imprimer/planning avec le cookie de session de l'appelant,
 * donc exactement sous ses droits (contexte entreprise + RLS). Moteur 2 : la page fixe elle-même
 * son format (A4 paysage) et ses marges.
 */
export async function GET(request: Request) {
  if (!planningV2Actif()) return NextResponse.json({ error: "Planning v2 inactif" }, { status: 404 });
  await getContexteEntreprise();
  const entrant = new URL(request.url);
  const { jour, vue } = parametresPlanning({ jour: entrant.searchParams.get("jour") ?? undefined, vue: entrant.searchParams.get("vue") ?? undefined });
  const url = new URL(`/imprimer/planning?jour=${jour}&vue=${vue}`, request.url);
  let pdf: Buffer;
  try {
    pdf = await genererPdfDepuisUrl(url.toString(), request.headers.get("cookie"), { moteur: 2 });
  } catch {
    return NextResponse.json({ error: "Génération du PDF impossible" }, { status: 502 });
  }
  return new NextResponse(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="planning-${vue}-${jour}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
