import { NextResponse } from "next/server";
import { lireMarqueVehicule } from "@/lib/security/validation";

export async function GET(request: Request) {
  let marque: string;
  try {
    marque = lireMarqueVehicule(new URL(request.url).searchParams.get("marque"));
  } catch {
    return NextResponse.json({ error: "Marque invalide", modeles: [] }, { status: 400 });
  }
  try {
    const response = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/${encodeURIComponent(marque)}?format=json`,
      { next: { revalidate: 604800 }, signal: AbortSignal.timeout(6000) },
    );
    if (!response.ok) throw new Error("Référentiel indisponible");
    const json = await response.json() as { Results?: { Model_Name?: string }[] };
    const modeles = [...new Set((json.Results ?? [])
      .map((item) => item.Model_Name?.trim())
      .filter((item): item is string => Boolean(item)))]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .slice(0, 250);
    return NextResponse.json({ modeles });
  } catch {
    return NextResponse.json({ modeles: [] });
  }
}
